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
