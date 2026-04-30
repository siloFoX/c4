// Worker pool / reuse tests (3.4 hardened).

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const PtyManager = require('../src/pty-manager');

function makeMgr(extraConfig = {}) {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = { pool: { enabled: true, maxIdleMs: 300000 }, ...extraConfig };
  mgr.workers = new Map();
  // expose private getter for the test
  Object.defineProperty(mgr, 'idleThresholdMs', { value: 1000, writable: true, configurable: true });
  return mgr;
}

function poolWorker({
  alive = true, idleAgeMs = 60000, suspended = false, intervention = null,
  pendingTask = null, pendingTaskSent = false,
  adapterName = null, branch = null, worktree = null,
} = {}) {
  return {
    alive,
    lastDataTime: Date.now() - idleAgeMs,
    _suspended: suspended,
    _interventionState: intervention,
    _pendingTask: pendingTask,
    _pendingTaskSent: pendingTaskSent,
    _adapterName: adapterName,
    branch,
    worktree,
  };
}

describe('_findPoolWorker (3.4 hardened)', () => {
  it('returns idle blank worker when adapter matches', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', poolWorker());
    assert.strictEqual(mgr._findPoolWorker(), 'w1');
  });

  it('skips workers that are too fresh (within idleThresholdMs)', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', poolWorker({ idleAgeMs: 100 }));
    assert.strictEqual(mgr._findPoolWorker(), null);
  });

  it('skips workers that are too old (past maxIdleMs)', () => {
    const mgr = makeMgr({ pool: { enabled: true, maxIdleMs: 1000 } });
    mgr.workers.set('w1', poolWorker({ idleAgeMs: 500_000 }));
    assert.strictEqual(mgr._findPoolWorker(), null);
  });

  it('skips suspended / intervention workers', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', poolWorker({ suspended: true }));
    mgr.workers.set('w2', poolWorker({ intervention: 'question' }));
    assert.strictEqual(mgr._findPoolWorker(), null);
  });

  it('skips workers with active or pending task', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', poolWorker({ pendingTask: { task: 'x' } }));
    mgr.workers.set('w2', poolWorker({ pendingTaskSent: true }));
    assert.strictEqual(mgr._findPoolWorker(), null);
  });

  it('skips workers that already own a branch / worktree', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', poolWorker({ branch: 'c4/foo' }));
    mgr.workers.set('w2', poolWorker({ worktree: '/tmp/foo' }));
    assert.strictEqual(mgr._findPoolWorker(), null);
  });

  it('rejects adapter mismatch', () => {
    const mgr = makeMgr();
    mgr.workers.set('claude', poolWorker({ adapterName: null }));
    mgr.workers.set('llm',    poolWorker({ adapterName: 'local-llm' }));
    assert.strictEqual(mgr._findPoolWorker({ adapter: 'local-llm' }), 'llm');
    assert.strictEqual(mgr._findPoolWorker({ adapter: null }), 'claude');
  });

  it('returns null when pool disabled', () => {
    const mgr = makeMgr({ pool: { enabled: false } });
    mgr.workers.set('w1', poolWorker());
    assert.strictEqual(mgr._findPoolWorker(), null);
  });
});

describe('_reuseWorker live trigger (TODO #96)', () => {
  function reusableWorker() {
    return {
      alive: true,
      lastDataTime: Date.now() - 60000,
      _suspended: false,
      _interventionState: null,
      _pendingTask: null,
      _pendingTaskSent: false,
      _adapterName: null,
      branch: null,
      worktree: null,
      snapshots: [{ time: Date.now() - 70000, screen: 'old output' }],
      snapshotIndex: 0,
      _routineState: { tested: true, docsUpdated: false },
      _interventionState_old: 'something stale',
      _errorHistory: [{ count: 3, msg: 'old' }],
      _taskText: 'previous task',
      _taskStartedAt: Date.now() - 60000,
    };
  }

  it('renames worker, resets state, emits SSE+audit, and forwards to sendTask', () => {
    const mgr = makeMgr();
    mgr.workers.set('pool-1', reusableWorker());

    const sseEvents = [];
    const auditEntries = [];
    const sendTaskCalls = [];
    mgr._emitSSE = (type, payload) => sseEvents.push({ type, payload });
    mgr.audit = (entry) => auditEntries.push(entry);
    mgr.sendTask = (name, task, options) => {
      sendTaskCalls.push({ name, task, options });
      return { ok: true, name, reused: true };
    };

    const result = mgr._reuseWorker('pool-1', 'fresh-1', 'do thing', { branch: 'c4/x' });

    assert.deepStrictEqual(result, { ok: true, name: 'fresh-1', reused: true });
    assert.ok(!mgr.workers.has('pool-1'), 'old name removed');
    assert.ok(mgr.workers.has('fresh-1'), 'new name registered');

    const w = mgr.workers.get('fresh-1');
    assert.strictEqual(w._interventionState, null);
    assert.strictEqual(w._lastQuestion, null);
    assert.deepStrictEqual(w._errorHistory, []);
    assert.deepStrictEqual(w._routineState, { tested: false, docsUpdated: false });
    assert.strictEqual(w._taskText, null);
    assert.strictEqual(w._taskStartedAt, null);
    // The pool reuse marker must show up in snapshots so /list and audit
    // see the recycle clearly.
    const reuseSnap = w.snapshots[w.snapshots.length - 1];
    assert.ok(reuseSnap.poolReuse);
    assert.strictEqual(reuseSnap.poolReuse.from, 'pool-1');
    assert.strictEqual(reuseSnap.poolReuse.to, 'fresh-1');
    // snapshotIndex moved to end so pre-reuse output is treated as already-read.
    assert.strictEqual(w.snapshotIndex, w.snapshots.length - 1);

    assert.strictEqual(sseEvents.length, 1);
    assert.strictEqual(sseEvents[0].type, 'pool_reuse');
    assert.deepStrictEqual(sseEvents[0].payload, { from: 'pool-1', to: 'fresh-1' });

    assert.strictEqual(auditEntries.length, 1);
    assert.strictEqual(auditEntries[0].actor, 'pool');
    assert.strictEqual(auditEntries[0].action, '/pool/reuse');
    assert.strictEqual(auditEntries[0].worker, 'fresh-1');
    assert.strictEqual(auditEntries[0].from, 'pool-1');

    assert.strictEqual(sendTaskCalls.length, 1);
    assert.strictEqual(sendTaskCalls[0].name, 'fresh-1');
    assert.strictEqual(sendTaskCalls[0].task, 'do thing');
    assert.deepStrictEqual(sendTaskCalls[0].options, { branch: 'c4/x' });
  });

  it('refuses when the pool worker died between lookup and reuse', () => {
    const mgr = makeMgr();
    const dead = reusableWorker();
    dead.alive = false;
    mgr.workers.set('pool-1', dead);

    const r = mgr._reuseWorker('pool-1', 'fresh-1', 'task');
    assert.ok(r.error);
    assert.match(r.error, /not available/);
    assert.ok(mgr.workers.has('pool-1'), 'dead worker not renamed');
    assert.ok(!mgr.workers.has('fresh-1'));
  });

  it('refuses when the pool name does not exist', () => {
    const mgr = makeMgr();
    const r = mgr._reuseWorker('ghost', 'fresh-1', 'task');
    assert.ok(r.error);
    assert.match(r.error, /not available/);
  });

  it('survives missing _emitSSE / audit hooks (no crash)', () => {
    const mgr = makeMgr();
    mgr.workers.set('pool-1', reusableWorker());
    mgr.sendTask = () => ({ ok: true });
    // No _emitSSE, no audit set — should still complete.
    const r = mgr._reuseWorker('pool-1', 'fresh-1', 'task');
    assert.deepStrictEqual(r, { ok: true });
  });
});
