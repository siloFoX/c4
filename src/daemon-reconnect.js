'use strict';

// (11.74) PtyManager-side wrappers around the pure planner in
// daemon-checkpoint.js. Factored out of pty-manager.js so the
// reconcile-on-startup tests don't have to load the full PtyManager
// (which pulls in node-pty native bindings via `require('node-pty')`).
//
// All functions take a `manager` argument that exposes:
//   workers       Map<string, sessionLike>
//   lostWorkers   Array<lostEntry>
//   config        object — only .worktree.projectRoot is read
//   _detectRepoRoot()
//   _listC4Worktrees(repoRoot)
//
// The actual PtyManager methods are one-line forwards to these helpers
// (see src/pty-manager.js).

const path = require('path');
const daemonCheckpoint = require('./daemon-checkpoint');

// Build a minimal session entry for a re-adopted worker. The entry
// intentionally has no PTY — we do not own the subprocess — but it
// carries enough metadata for c4 list / c4 cleanup / merge to
// recognise the worker. The `_recovered` flag drives the
// "(recovered)" suffix on the first list() call after reconciliation.
function buildRecoveredWorker(name, plan) {
  const payload = plan.checkpoint || {};
  return {
    name,
    kind: 'recovered',
    command: 'claude',
    target: payload.target || 'local',
    tier: payload.tier || 'worker',
    branch: plan.branch || payload.branch || null,
    worktree: plan.worktree || payload.worktree || null,
    parent: payload.parent || null,
    proc: { pid: plan.pid },
    pid: plan.pid,
    alive: true,
    state: 'ATTACHED',
    _recovered: true,
    _recoveredAt: new Date().toISOString(),
    _recoveryShown: false,
    _checkpointPath: plan.checkpointPath || null,
    _taskText: payload.lastTask && typeof payload.lastTask.summary === 'string'
      ? payload.lastTask.summary
      : null,
    _taskStartedAt: payload.lastTask && typeof payload.lastTask.timestamp === 'string'
      ? payload.lastTask.timestamp
      : null,
    snapshots: [],
    snapshotIndex: 0,
    lastDataTime: Date.now(),
    _errorHistory: [],
    _interventionState: null,
    _hadIntervention: false,
    _lastInterventionAt: null,
    _lastQuestion: null,
    _pinnedMemory: payload.pinnedMemory || { userRules: [], defaultTemplate: null },
  };
}

// Translate a planner record into manager-side side effects. Returns
// the same shape the planner returned, augmented with applied=true
// (adopt -> session in workers map) or applied=false (lost -> entry
// in lostWorkers). The same code path powers reconcileOrphans (whole
// fleet) and reconnectWorker (single name).
function applyReconcilePlan(manager, plan) {
  if (!plan || typeof plan !== 'object' || !plan.name) {
    return { ...plan, applied: false };
  }
  if (plan.action === 'adopt') {
    if (manager.workers.has(plan.name)) {
      return { ...plan, applied: false, reason: plan.reason || 'already-registered' };
    }
    const w = buildRecoveredWorker(plan.name, plan);
    manager.workers.set(plan.name, w);
    return { ...plan, applied: true };
  }
  if (plan.action === 'lost') {
    if (!Array.isArray(manager.lostWorkers)) manager.lostWorkers = [];
    const existing = manager.lostWorkers.find(x => x && x.name === plan.name);
    const entry = {
      name: plan.name,
      pid: plan.pid != null ? plan.pid : (plan.checkpoint && plan.checkpoint.pid) || null,
      branch: plan.branch || (plan.checkpoint && plan.checkpoint.branch) || null,
      worktree: plan.worktree || (plan.checkpoint && plan.checkpoint.worktree) || null,
      parent: (plan.checkpoint && plan.checkpoint.parent) || null,
      sessionId: (plan.checkpoint && plan.checkpoint.sessionId) || null,
      pinnedMemory: (plan.checkpoint && plan.checkpoint.pinnedMemory) || null,
      lostAt: new Date().toISOString(),
      reason: plan.reason || 'unknown',
      state: 'LOST',
    };
    if (existing) {
      Object.assign(existing, entry);
    } else {
      manager.lostWorkers.push(entry);
    }
    return { ...plan, applied: true };
  }
  return { ...plan, applied: false };
}

// Public entry point invoked from daemon.js startup. Scans the repo's
// git worktree list, pairs each c4-worktree-* path with its checkpoint,
// and either re-adopts the live workers (ATTACHED session in the worker
// map) or marks them LOST. Returns a summary so the daemon can log
// "auto-adopted N, lost N".
function reconcileOrphans(manager, opts = {}) {
  const repoRoot = opts.repoRoot
    || (typeof manager._detectRepoRoot === 'function' ? manager._detectRepoRoot() : null);
  const projectRoot = opts.projectRoot
    || (manager.config && manager.config.worktree && manager.config.worktree.projectRoot)
    || path.join(__dirname, '..');
  const worktrees = Array.isArray(opts.worktrees)
    ? opts.worktrees
    : (repoRoot && typeof manager._listC4Worktrees === 'function'
        ? manager._listC4Worktrees(repoRoot)
        : []);
  const log = typeof opts.log === 'function'
    ? opts.log
    : (msg) => { try { process.stderr.write(msg + '\n'); } catch {} };
  // Already-registered workers must not be reconciled — they have a
  // live PTY this daemon owns, so a checkpoint left from a previous
  // crash would be stale.
  const skipNames = Array.isArray(opts.skipNames)
    ? opts.skipNames
    : Array.from(manager.workers ? manager.workers.keys() : []);
  const plans = daemonCheckpoint.reconcileOrphans({
    worktrees,
    projectRoot,
    skipNames,
    isPidAlive: opts.isPidAlive,
    fs: opts.fs,
    dir: opts.dir,
    log,
  });
  const applied = [];
  for (const p of plans) applied.push(applyReconcilePlan(manager, p));
  const adopted = applied.filter(p => p.action === 'adopt' && p.applied).length;
  const lost = applied.filter(p => p.action === 'lost' && p.applied).length;
  log(`[reconnect] reconcile complete: adopted=${adopted} lost=${lost} total=${applied.length}`);
  return { plans: applied, adopted, lost };
}

// Run reconcile for a single worker name. Powers the daemon endpoint
// POST /api/workers/:name/reconnect and the `c4 reconnect <name>` CLI
// subcommand. Returns:
//   { error: 'not-found' }      when no checkpoint exists
//   { error: 'pid-dead', pid }  when the checkpoint pid is dead
//   { ok, worker }              when re-adopt succeeded
//   { ok, already, worker }     when the worker is already registered
function reconnectWorker(manager, name, opts = {}) {
  if (!name || typeof name !== 'string') {
    return { error: 'invalid-name' };
  }
  if (manager.workers.has(name)) {
    const w = manager.workers.get(name);
    return {
      ok: true,
      already: true,
      worker: {
        name,
        pid: w.proc ? w.proc.pid : (w.pid || null),
        branch: w.branch || null,
        worktree: w.worktree || null,
        state: w._recovered ? 'ATTACHED' : 'RUNNING',
        recovered: !!w._recovered,
      },
    };
  }
  const projectRoot = opts.projectRoot
    || (manager.config && manager.config.worktree && manager.config.worktree.projectRoot)
    || path.join(__dirname, '..');
  const plan = daemonCheckpoint.planReconnect(name, {
    projectRoot,
    isPidAlive: opts.isPidAlive,
    fs: opts.fs,
    dir: opts.dir,
  });
  if (plan.action === 'lost' && plan.reason === 'no-checkpoint') {
    return { error: 'not-found', name };
  }
  if (plan.action === 'lost' && plan.reason === 'pid-dead') {
    applyReconcilePlan(manager, plan);
    return { error: 'pid-dead', name, pid: plan.pid };
  }
  if (plan.action === 'lost') {
    applyReconcilePlan(manager, plan);
    return { error: plan.reason || 'lost', name };
  }
  // adopt path
  plan.worktree = plan.worktree
    || (plan.checkpoint && plan.checkpoint.worktree)
    || null;
  plan.branch = plan.branch
    || (plan.checkpoint && plan.checkpoint.branch)
    || null;
  const applied = applyReconcilePlan(manager, plan);
  if (!applied.applied) {
    return { error: 'apply-failed', name };
  }
  const w = manager.workers.get(name);
  return {
    ok: true,
    worker: {
      name,
      pid: w.proc ? w.proc.pid : plan.pid,
      branch: w.branch || null,
      worktree: w.worktree || null,
      state: 'ATTACHED',
      recovered: true,
    },
  };
}

module.exports = {
  buildRecoveredWorker,
  applyReconcilePlan,
  reconcileOrphans,
  reconnectWorker,
};
