// 11.3 Workflow engine. JSON/YAML-friendly schema:
//
// {
//   "name": "morning-routine",
//   "steps": [
//     { "id": "scan",   "action": "task",       "args": { "name": "scanner", "task": "scan logs" } },
//     { "id": "review", "action": "dispatch",   "args": { "task": "review yesterday's PRs", "tags": ["review"] }, "dependsOn": ["scan"] },
//     { "id": "report", "action": "shell",      "args": { "cmd": "node tools/report.js" }, "dependsOn": ["review"] }
//   ]
// }
//
// Each step picks an action handler; we ship handlers for the common ones
// and let callers register custom ones via `engine.register('name', fn)`.
// Steps with `dependsOn` wait until those step ids complete (success).
// `on_failure` per step: 'abort' (default) | 'continue'.
//
// Execution returns a per-step result map. We also persist a run record
// to logs/workflow-runs.jsonl so they show up in audits.

'use strict';

const fs = require('fs');
const path = require('path');

class WorkflowEngine {
  constructor(manager) {
    this.manager = manager;
    this.handlers = new Map();
    this._registerDefaults();
  }

  register(name, fn) {
    if (typeof fn !== 'function') throw new Error('handler must be a function');
    this.handlers.set(name, fn);
  }

  _registerDefaults() {
    // task: spawn / send a task to a worker
    this.register('task', async (args, ctx) => {
      const { name, task, ...opts } = args;
      if (!name || !task) return { error: 'task action requires name + task' };
      if (ctx.manager.create) ctx.manager.create(name, 'claude', [], {});
      return ctx.manager.sendTask(name, task, opts);
    });

    // dispatch: 9.7 dispatcher
    this.register('dispatch', async (args, ctx) => {
      if (typeof ctx.manager.dispatch !== 'function') return { error: 'dispatch unavailable' };
      return ctx.manager.dispatch(args || {});
    });

    // wait: block until a worker becomes idle
    this.register('wait', async (args, ctx) => {
      if (!args || !args.name) return { error: 'wait requires name' };
      if (typeof ctx.manager.waitAndRead !== 'function') return { error: 'waitAndRead unavailable' };
      return ctx.manager.waitAndRead(args.name, args.timeoutMs || 120000, args);
    });

    // shell: spawn a sub-process. Strict whitelist via config.workflow.shellWhitelist
    this.register('shell', async (args, ctx) => {
      if (!args || !args.cmd) return { error: 'shell requires cmd' };
      const cfg = (ctx.manager.config && ctx.manager.config.workflow) || {};
      const whitelist = cfg.shellWhitelist || [];
      if (whitelist.length > 0) {
        const head = String(args.cmd).split(/\s+/)[0];
        if (!whitelist.includes(head)) {
          return { error: `shell command '${head}' not in workflow.shellWhitelist` };
        }
      }
      const { spawnSync } = require('child_process');
      const r = spawnSync('sh', ['-c', args.cmd], { encoding: 'utf8', timeout: args.timeoutMs || 60000 });
      return { exitCode: r.status, stdout: (r.stdout || '').slice(-2048), stderr: (r.stderr || '').slice(-2048) };
    });

    // notify: notifications.pushAll if available
    this.register('notify', async (args, ctx) => {
      const text = (args && args.text) || '';
      if (!text) return { error: 'notify requires text' };
      const n = ctx.manager._notifications;
      if (n && typeof n.pushAll === 'function') {
        try { n.pushAll(text); return { sent: true }; }
        catch (e) { return { error: e.message }; }
      }
      return { skipped: true, reason: 'no notifications configured' };
    });

    // sleep: deliberate pause
    this.register('sleep', async (args) => {
      const ms = (args && args.ms) || 1000;
      await new Promise((r) => setTimeout(r, ms));
      return { slept: ms };
    });

    // list: snapshot of workers (used by NL "list workers" intent).
    this.register('list', async (_args, ctx) => {
      if (typeof ctx.manager.list !== 'function') return { error: 'list unavailable' };
      return ctx.manager.list();
    });

    // create: spawn a worker without sending a task.
    this.register('create', async (args, ctx) => {
      if (!args || !args.name) return { error: 'create requires name' };
      if (typeof ctx.manager.create !== 'function') return { error: 'create unavailable' };
      return ctx.manager.create(args.name, args.command || 'claude', [], {
        target: args.target || 'local',
        cwd: args.cwd || '',
      });
    });

    // close: terminate a worker.
    this.register('close', async (args, ctx) => {
      if (!args || !args.name) return { error: 'close requires name' };
      if (typeof ctx.manager.close !== 'function') return { error: 'close unavailable' };
      return ctx.manager.close(args.name);
    });

    // schedule: register a cron entry (10.7).
    this.register('schedule', async (args, ctx) => {
      if (typeof ctx.manager.schedulerAdd !== 'function') return { error: 'scheduler unavailable' };
      const id = args.id || `nl-${Date.now().toString(36)}`;
      return ctx.manager.schedulerAdd({ id, ...args });
    });
  }

  // ---- run ----
  async run(workflow) {
    if (!workflow || !Array.isArray(workflow.steps)) return { error: 'workflow.steps array is required' };
    const results = {};
    const completed = new Set(); // stepId → finished (success OR continue-after-failure)
    const aborted  = new Set();  // stepId → failed under on_failure='abort'
    const order = [];
    const ctx = { manager: this.manager, results };

    // SSE: workflow start
    if (typeof this.manager._emitSSE === 'function') {
      this.manager._emitSSE('workflow_start', { name: workflow.name || 'unnamed', steps: workflow.steps.length });
    }

    // A step is ready when all its dependencies are completed AND none of
    // them are aborted. If a dependency aborted, this step is itself
    // marked unreached so we don't dead-loop waiting for it.
    const ready = () => workflow.steps.filter((s) => !completed.has(s.id) && !aborted.has(s.id)
      && (s.dependsOn || []).every((d) => completed.has(d)));

    const propagateAbort = (step) => {
      // Walk forward and mark any step whose dependsOn includes an
      // aborted ancestor as unreached.
      let changed = true;
      while (changed) {
        changed = false;
        for (const s of workflow.steps) {
          if (completed.has(s.id) || aborted.has(s.id)) continue;
          const deps = s.dependsOn || [];
          if (deps.some((d) => aborted.has(d))) {
            aborted.add(s.id);
            results[s.id] = { error: `unreached (dependency aborted: ${deps.find((d) => aborted.has(d))})` };
            changed = true;
          }
        }
      }
    };

    let safety = workflow.steps.length * 4;
    while ((completed.size + aborted.size) < workflow.steps.length && safety > 0) {
      safety--;
      const next = ready();
      if (next.length === 0) {
        // No progress possible — likely a dependsOn cycle.
        for (const s of workflow.steps) {
          if (!completed.has(s.id) && !aborted.has(s.id)) {
            results[s.id] = { error: 'unreached (dependency cycle or unresolved id)' };
            aborted.add(s.id);
          }
        }
        break;
      }
      for (const step of next) {
        if (!step.id) { results['_unnamed_' + order.length] = { error: 'step missing id' }; completed.add(step.id); continue; }
        const handler = this.handlers.get(step.action);
        let stepResult;
        if (!handler) {
          stepResult = { error: `unknown action: ${step.action}` };
        } else {
          try {
            stepResult = await handler(step.args || {}, ctx);
          } catch (e) {
            stepResult = { error: e.message };
          }
        }
        results[step.id] = stepResult;
        order.push(step.id);

        const failed = stepResult && stepResult.error;
        const policy = step.on_failure || 'abort';
        if (failed && policy === 'abort') {
          aborted.add(step.id);
          propagateAbort(step);
        } else {
          completed.add(step.id);
        }
      }
    }

    const record = {
      ts: new Date().toISOString(),
      name: workflow.name || 'unnamed',
      order,
      ok: Object.values(results).every((r) => !r.error),
      results,
    };
    try {
      const file = path.join(this.manager.logsDir, 'workflow-runs.jsonl');
      if (!fs.existsSync(this.manager.logsDir)) fs.mkdirSync(this.manager.logsDir, { recursive: true });
      fs.appendFileSync(file, JSON.stringify(record) + '\n');
    } catch { /* swallow */ }
    if (typeof this.manager.audit === 'function') {
      this.manager.audit({
        actor: 'workflow',
        action: '/workflow/run',
        ok: record.ok,
        workflow: record.name,
        steps: order,
      });
    }
    if (typeof this.manager._emitSSE === 'function') {
      this.manager._emitSSE('workflow_end', { name: record.name, ok: record.ok, steps: record.order });
    }
    // (TODO Notifications 다양화) Slack/notification on failure.
    if (!record.ok && this.manager._notifications && typeof this.manager._notifications.pushAll === 'function') {
      const failed = Object.entries(record.results || {})
        .filter(([, r]) => r && r.error)
        .map(([id, r]) => `  - ${id}: ${(r.error || '').slice(0, 200)}`)
        .join('\n');
      try {
        this.manager._notifications.pushAll(`[WORKFLOW FAIL] ${record.name}\n${failed}`);
      } catch { /* swallow */ }
    }
    return record;
  }
}

module.exports = WorkflowEngine;
