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

    // (TODO #116) Run a single step (with retry / on_failure semantics).
    // Extracted from the inner loop so we can drive parallel execution
    // via Promise.all over a ready batch.
    const runStep = async (step) => {
      if (!step.id) {
        results['_unnamed_' + order.length] = { error: 'step missing id' };
        return { id: null, result: null, failed: false, policy: 'abort' };
      }
      const handler = this.handlers.get(step.action);
      const policy = step.on_failure || 'abort';
      const maxRetries = policy === 'retry' ? (step.maxRetries ?? 2) : 0;
      const backoffMs = step.backoffMs || 0;
      let stepResult;
      let attempts = 0;
      for (let i = 0; i <= maxRetries; i++) {
        attempts = i + 1;
        if (!handler) {
          stepResult = { error: `unknown action: ${step.action}` };
          break;
        }
        try {
          stepResult = await handler(step.args || {}, ctx);
        } catch (e) {
          stepResult = { error: e.message };
        }
        if (!(stepResult && stepResult.error)) break;
        if (i < maxRetries && backoffMs > 0) {
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
      if (policy === 'retry' && attempts > 1) {
        stepResult.retries = attempts - 1;
      }
      return { id: step.id, step, result: stepResult, failed: !!(stepResult && stepResult.error), policy };
    };

    // (TODO #116) Bounded parallelism. workflow.maxConcurrency caps how
    // many ready steps run at once. Defaults to Infinity → all ready
    // steps fire together (matches user intent of "DAG, run anything you
    // can"). Set to 1 for sequential debugging.
    const maxConcurrency = workflow.maxConcurrency || Infinity;

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

      // Batch within maxConcurrency; await each batch before pulling the
      // next ready set so dependsOn ordering is still respected.
      const batch = next.slice(0, Math.max(1, maxConcurrency));
      const settled = await Promise.all(batch.map(runStep));
      for (const r of settled) {
        if (!r.id) continue; // already recorded as _unnamed_
        results[r.id] = r.result;
        order.push(r.id);
        const effectivePolicy = (r.policy === 'retry' && r.failed) ? 'abort' : r.policy;
        if (r.failed && effectivePolicy === 'abort') {
          aborted.add(r.id);
          propagateAbort(r.step);
        } else {
          completed.add(r.id);
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
    // (TODO #102) Slack/notification on workflow failure. Block Kit
    // formatter in notifications.js maps the [WORKFLOW FAIL] prefix to a
    // warning-color attachment.
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
