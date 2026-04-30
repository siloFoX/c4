// Wire-up tests for failure-patterns in pty-manager.list().

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const PtyManager = require('../src/pty-manager');

function makeMgr() {
  const mgr = Object.create(PtyManager.prototype);
  mgr.config = {};
  mgr.workers = new Map();
  mgr.lostWorkers = [];
  mgr._taskQueue = [];
  Object.defineProperty(mgr, 'idleThresholdMs', { value: 1000, writable: true, configurable: true });
  mgr._getScreenText = () => '';
  return mgr;
}

function fakeWorker(over = {}) {
  return {
    proc: { pid: null }, // null pid skips worker-metrics sampling cleanly
    command: 'claude',
    target: 'local',
    branch: null,
    worktree: null,
    parent: null,
    scopeGuard: null,
    alive: true,
    lastDataTime: Date.now(),
    snapshots: [],
    snapshotIndex: 0,
    screen: null,
    _adapterName: null,
    _interventionState: null,
    _hadIntervention: false,
    _lastInterventionAt: null,
    _lastQuestion: null,
    _errorHistory: [],
    _smState: null,
    _pinnedMemory: null,
    ...over,
  };
}

describe('list() exposes failureHint field', () => {
  it('returns null when no errors / matching pattern', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', fakeWorker());
    const { workers } = mgr.list();
    assert.strictEqual(workers[0].failureHint, null);
  });

  it('surfaces ENOSPC hint when error history matches', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', fakeWorker({
      _errorHistory: [{ line: 'ENOSPC: no space left on device, write', count: 3 }],
    }));
    const { workers } = mgr.list();
    const h = workers[0].failureHint;
    assert.ok(h, 'hint present');
    assert.strictEqual(h.id, 'enospc');
    assert.match(h.hint, /Disk full/i);
    assert.strictEqual(h.count, 3);
  });

  it('falls back to latest snapshot text when error history is empty', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', fakeWorker({
      snapshots: [{ time: Date.now(), screen: 'EADDRINUSE: address already in use 127.0.0.1:3456' }],
    }));
    const { workers } = mgr.list();
    const h = workers[0].failureHint;
    assert.ok(h);
    assert.strictEqual(h.id, 'port-in-use');
  });

  it('memoizes against (errCount, snapIdx) — same shape returns same object', () => {
    const mgr = makeMgr();
    const worker = fakeWorker({
      _errorHistory: [{ line: 'permission denied', count: 1 }],
    });
    mgr.workers.set('w1', worker);
    const r1 = mgr.list().workers[0].failureHint;
    const r2 = mgr.list().workers[0].failureHint;
    // Same memo cache → same object reference (via memoized .value).
    assert.strictEqual(r1, r2);
  });

  it('invalidates memo when error history grows', () => {
    const mgr = makeMgr();
    const worker = fakeWorker({
      _errorHistory: [{ line: 'permission denied', count: 1 }],
    });
    mgr.workers.set('w1', worker);
    const r1 = mgr.list().workers[0].failureHint;
    assert.strictEqual(r1.id, 'eacces');
    // Now add a higher-count entry that wins ranking.
    worker._errorHistory.push({ line: 'ENOSPC: no space left', count: 5 });
    const r2 = mgr.list().workers[0].failureHint;
    assert.notStrictEqual(r1, r2, 'memo invalidated when length changed');
    assert.strictEqual(r2.id, 'enospc');
  });
});
