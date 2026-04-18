/**
 * Planner (3.10) + Planner Back-propagation loop (9.12)
 *
 * 3.10: Generates a plan.md for a given task (plan-only mode).
 * 9.12: Tracks which plan a worker is executing (plan_doc_path), lets a
 * worker flag "needs revision", invokes an abstract planner factory to
 * produce a revised plan, saves each revision as docs/plans/<name>-rev<N>.md,
 * and re-dispatches the updated plan back to the worker. Enforces a loop
 * limit so a runaway planner cannot spin forever.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_MAX_REPLANS = 3;

class Planner {
  constructor(manager, options = {}) {
    this.manager = manager;
    // Abstract planner invocation. Test code (and production wiring) can
    // override this with a function that actually calls Claude; the default
    // produces a deterministic templated plan so the loop is end-to-end
    // functional without a live planner session.
    this.plannerFactory = options.plannerFactory || null;
    this.config = options.config || (manager && manager.config) || {};
  }

  setPlannerFactory(fn) {
    this.plannerFactory = fn;
  }

  _resolveMaxReplans(override) {
    if (override !== undefined && override !== null) {
      const n = Number(override);
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
    const cfgRaw = this.config?.plannerLoop?.maxReplans;
    if (cfgRaw !== undefined && cfgRaw !== null) {
      const n = Number(cfgRaw);
      if (Number.isFinite(n) && n >= 0) return Math.floor(n);
    }
    return DEFAULT_MAX_REPLANS;
  }

  _resolveBase(worker) {
    if (worker && worker.worktree) return worker.worktree;
    if (this.manager && typeof this.manager._detectRepoRoot === 'function') {
      const root = this.manager._detectRepoRoot();
      if (root) return root;
    }
    return process.cwd();
  }

  /**
   * Generate the plan prompt that instructs the worker to write plan.md only.
   */
  buildPlanPrompt(task, options = {}) {
    const outputPath = options.outputPath || 'plan.md';
    const lines = [
      '[C4 PLAN MODE — 실행하지 말고 계획만 작성]',
      '',
      '아래 작업에 대한 구현 계획을 작성해줘.',
      '코드를 직접 수정하지 말고, 계획 문서만 작성해.',
      '',
      `출력 파일: ${outputPath}`,
      '',
      '계획에 포함할 내용:',
      '1. 작업 요약 (한 줄)',
      '2. 수정할 파일 목록과 각 파일에서 할 변경',
      '3. 구현 순서 (의존성 고려)',
      '4. 테스트 계획',
      '5. 예상 위험/주의사항',
      '',
      `## 작업`,
      task,
      '',
      `완료 후 ${outputPath} 파일만 커밋해.`,
    ];
    return lines.join('\n');
  }

  /**
   * Send a plan-only task to a worker via sendTask.
   */
  sendPlan(name, task, options = {}) {
    const planPrompt = this.buildPlanPrompt(task, options);
    return this.manager.sendTask(name, planPrompt, {
      branch: options.branch,
      useBranch: options.useBranch,
      useWorktree: options.useWorktree,
      projectRoot: options.projectRoot,
      scope: options.scope,
      scopePreset: options.scopePreset,
      contextFrom: options.contextFrom,
    });
  }

  /**
   * Read a plan.md file from a worker's worktree.
   */
  readPlan(name, options = {}) {
    const w = this.manager.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    const outputPath = options.outputPath || 'plan.md';
    const base = this._resolveBase(w);
    const planPath = path.resolve(base, outputPath);

    try {
      const content = fs.readFileSync(planPath, 'utf8');
      return { success: true, path: planPath, content };
    } catch (e) {
      return { error: `Plan not found: ${planPath}` };
    }
  }

  // ---------- 9.12: Planner Back-propagation loop ----------

  /**
   * Associate a plan document with a worker. Called by the daemon when a
   * task is dispatched with `--plan-doc <path>`. Path may be absolute or
   * relative to the worktree; it is stored as-is for downstream resolution.
   */
  setPlanDocPath(name, planDocPath) {
    const w = this.manager.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };
    if (!planDocPath || typeof planDocPath !== 'string') {
      return { error: 'plan_doc_path must be a non-empty string' };
    }
    w.plan_doc_path = planDocPath;
    w.replan_count = w.replan_count || 0;
    w.plan_revisions = w.plan_revisions || [];
    return { success: true, plan_doc_path: planDocPath };
  }

  getPlanDocPath(name) {
    const w = this.manager.workers.get(name);
    if (!w) return null;
    return w.plan_doc_path || null;
  }

  _resolvePlanPath(worker, planDocPath) {
    if (!planDocPath) return null;
    const base = this._resolveBase(worker);
    return path.isAbsolute(planDocPath) ? planDocPath : path.resolve(base, planDocPath);
  }

  /**
   * Append a "## Needs Revision" block to the worker's plan document.
   * Also records the revision intent on the worker record so subsequent
   * replan/redispatch calls can read the latest reason/evidence.
   */
  appendNeedsRevision(name, reason, evidence) {
    const w = this.manager.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };
    if (!w.plan_doc_path) {
      return { error: `Worker '${name}' has no plan_doc_path set` };
    }
    const abs = this._resolvePlanPath(w, w.plan_doc_path);
    if (!fs.existsSync(abs)) {
      return { error: `Plan document not found: ${abs}` };
    }
    const when = new Date().toISOString();
    const block = [
      '',
      '',
      '## Needs Revision',
      `- When: ${when}`,
      `- Reason: ${reason || 'unspecified'}`,
      `- Evidence: ${evidence || 'unspecified'}`,
      '',
    ].join('\n');
    try {
      fs.appendFileSync(abs, block);
    } catch (e) {
      return { error: `Failed to append revision block: ${e.message}` };
    }
    w._pendingRevision = { reason: reason || '', evidence: evidence || '', when };
    return { success: true, path: abs, when };
  }

  /**
   * Invoke the planner factory with the original task + failure reason +
   * partial state, save the revised plan to docs/plans/<name>-rev<N>.md,
   * and advance the worker's replan_count.
   *
   * Rejects (without calling the factory) once replan_count >= maxReplans.
   * When the loop limit is exceeded the Slack notifier is pinged so the
   * operator can take over.
   */
  replan(name, reason, evidence, options = {}) {
    const w = this.manager.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    const currentCount = w.replan_count || 0;
    const maxReplans = this._resolveMaxReplans(options.maxReplans);
    if (maxReplans > 0 && currentCount >= maxReplans) {
      this._emitLoopLimit(name, { reason, evidence, currentCount, maxReplans });
      return {
        error: `Loop limit ${maxReplans} exceeded — manual intervention required`,
        loopLimitExceeded: true,
        replanCount: currentCount,
        maxReplans,
      };
    }

    const factory = options.plannerFactory || this.plannerFactory || this._defaultPlannerFactory.bind(this);

    const base = this._resolveBase(w);
    const plansDir = path.resolve(base, 'docs', 'plans');
    try { fs.mkdirSync(plansDir, { recursive: true }); } catch (e) {
      return { error: `Failed to create plans dir: ${e.message}` };
    }

    const nextRev = currentCount + 1;
    const revPath = path.join(plansDir, `${name}-rev${nextRev}.md`);

    const factoryInput = {
      workerName: name,
      originalTask: w._taskText || options.originalTask || '',
      reason: reason || '',
      evidence: evidence || '',
      previousPlanPath: w.plan_doc_path || null,
      revisionNumber: nextRev,
      revisionPath: revPath,
      partialState: options.partialState || this._describePartialState(w),
    };

    let factoryResult;
    try {
      factoryResult = factory(factoryInput);
    } catch (e) {
      return { error: `Planner factory threw: ${e.message}` };
    }
    if (!factoryResult || typeof factoryResult !== 'object') {
      return { error: 'Planner factory returned no result' };
    }
    if (factoryResult.error) {
      return { error: factoryResult.error };
    }
    const content = typeof factoryResult.content === 'string' ? factoryResult.content : '';
    if (!content) {
      return { error: 'Planner factory returned empty content' };
    }

    try {
      fs.writeFileSync(revPath, content);
    } catch (e) {
      return { error: `Failed to write revision file: ${e.message}` };
    }

    w.replan_count = nextRev;
    w.plan_doc_path = revPath;
    w.plan_revisions = w.plan_revisions || [];
    w.plan_revisions.push({
      rev: nextRev,
      path: revPath,
      reason: reason || '',
      evidence: evidence || '',
      when: new Date().toISOString(),
    });

    return {
      success: true,
      revisionPath: revPath,
      revisionNumber: nextRev,
      replanCount: nextRev,
      content,
    };
  }

  /**
   * Re-dispatch a worker with its updated plan. Uses sendTask with
   * contextFrom defaulting to the same worker so the new instruction is
   * anchored to the previous snapshots. Returns the sendTask result.
   */
  redispatch(name, options = {}) {
    const w = this.manager.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };
    if (!w.plan_doc_path) {
      return { error: `Worker '${name}' has no plan to dispatch` };
    }
    const prompt = [
      '[C4 PLANNER LOOP — redispatch with revised plan]',
      `Revised plan: ${w.plan_doc_path}`,
      `Revision: rev${w.replan_count || 0}`,
      '',
      'Original task:',
      w._taskText || options.originalTask || '',
      '',
      'Read the revised plan document above and continue the implementation.',
      'If the plan is still not actionable, call `c4 plan-update` again with a clear reason/evidence.',
    ].join('\n');

    const sendOptions = {
      branch: options.branch,
      useBranch: options.useBranch,
      contextFrom: options.contextFrom || name,
    };
    if (options.projectRoot) sendOptions.projectRoot = options.projectRoot;

    const dispatch = this.manager.sendTask(name, prompt, sendOptions);
    if (dispatch && dispatch.error) {
      return { error: dispatch.error, dispatch };
    }
    return {
      success: true,
      planDocPath: w.plan_doc_path,
      replanCount: w.replan_count || 0,
      dispatch,
    };
  }

  /**
   * Combined update entrypoint used by the CLI/daemon. Always appends the
   * revision block; optionally calls replan() and redispatch(). Returns a
   * shape describing every step so the caller can surface partial failures.
   */
  updateAndMaybeReplan(name, reason, evidence, options = {}) {
    const append = this.appendNeedsRevision(name, reason, evidence);
    if (append.error) return { error: append.error };

    const out = { success: true, append };

    if (options.replan || options.redispatch) {
      const replan = this.replan(name, reason, evidence, options);
      out.replan = replan;
      if (replan.error) {
        out.success = false;
        out.error = replan.error;
        if (replan.loopLimitExceeded) out.loopLimitExceeded = true;
        return out;
      }
    }

    if (options.redispatch) {
      const redispatch = this.redispatch(name, options);
      out.redispatch = redispatch;
      if (redispatch.error) {
        out.success = false;
        out.error = redispatch.error;
      }
    }

    return out;
  }

  /**
   * Return every revision recorded for a worker. Shape mirrors the
   * daemon GET /plan-revisions response.
   */
  listRevisions(name) {
    const w = this.manager.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };
    return {
      success: true,
      worker: name,
      current: w.plan_doc_path || null,
      replanCount: w.replan_count || 0,
      maxReplans: this._resolveMaxReplans(),
      revisions: (w.plan_revisions || []).slice(),
    };
  }

  _describePartialState(w) {
    const parts = [];
    if (w._taskText) parts.push(`currentTask: ${String(w._taskText).slice(0, 200)}`);
    if (w.replan_count) parts.push(`replanCount: ${w.replan_count}`);
    if (w.plan_doc_path) parts.push(`previousPlan: ${w.plan_doc_path}`);
    if (w.branch) parts.push(`branch: ${w.branch}`);
    return parts.join('\n');
  }

  _emitLoopLimit(name, info) {
    try {
      const m = this.manager;
      const n = m && m._notifications;
      if (n && typeof n.pushAll === 'function') {
        n.pushAll(`[PLANNER LOOP LIMIT] ${name}: ${info.currentCount}/${info.maxReplans} — manual intervention required (${info.reason || 'unspecified'})`);
        try { n._flushAll && n._flushAll().catch(() => {}); } catch {}
      }
    } catch {}
  }

  // Templated fallback when no factory is wired. Produces a deterministic
  // revised plan that records the failure context so the worker and the
  // operator can still move forward. Production deployments should wire a
  // real factory via setPlannerFactory().
  _defaultPlannerFactory(input) {
    const when = new Date().toISOString();
    const lines = [
      `# Revised Plan — ${input.workerName} (rev${input.revisionNumber})`,
      '',
      `Generated: ${when}`,
      `Previous plan: ${input.previousPlanPath || '(none)'}`,
      '',
      '## Original Task',
      input.originalTask || '(not recorded)',
      '',
      '## Failure Report',
      `- Reason: ${input.reason || 'unspecified'}`,
      `- Evidence: ${input.evidence || 'unspecified'}`,
      '',
      '## Partial State',
      input.partialState || '(none)',
      '',
      '## Next Steps',
      '1. Re-read the failure evidence above before editing code.',
      '2. Adjust the approach to address the reported blocker.',
      '3. If the obstacle is external (missing dependency, unclear spec),',
      '   escalate via `c4 plan-update` again instead of forcing the fix.',
      '',
      '_This plan was produced by the default planner factory. Wire a real planner to get task-specific guidance._',
      '',
    ];
    return { content: lines.join('\n') };
  }
}

module.exports = Planner;
