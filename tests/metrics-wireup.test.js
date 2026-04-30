// Wire-up tests for worker-metrics in pty-manager.list() + manager.metrics().
// Verifies the new fields exist on the list() shape and the rollup adds up.

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
  // list() calls _getScreenText on each worker — stub it so we don't need
  // a full ScreenBuffer fixture.
  mgr._getScreenText = () => '';
  return mgr;
}

function fakeWorker(over = {}) {
  return {
    proc: { pid: process.pid }, // sample against this process so /proc reads succeed on Linux
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

describe('list() exposes worker-metrics fields', () => {
  it('adds cpuPct/rssKb/threads to each worker entry', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', fakeWorker());
    const { workers } = mgr.list();
    assert.strictEqual(workers.length, 1);
    const w = workers[0];
    assert.ok('cpuPct' in w, 'cpuPct field present');
    assert.ok('rssKb' in w, 'rssKb field present');
    assert.ok('threads' in w, 'threads field present');
    // First call seeds the cache so cpuPct is null; rss + threads are
    // populated on Linux only.
    assert.strictEqual(w.cpuPct, null);
  });

  it('seeds _lastCpuSample on the worker for delta math next call', () => {
    const mgr = makeMgr();
    const worker = fakeWorker();
    mgr.workers.set('w1', worker);
    mgr.list();
    // On Linux the sample is non-null; elsewhere it's null and the worker
    // simply doesn't get the cache. Either way the field is available
    // for the next call and we don't crash.
    if (process.platform === 'linux') {
      assert.ok(worker._lastCpuSample, 'sample cached for delta');
      assert.strictEqual(typeof worker._lastCpuSample.utime, 'number');
    }
  });
});

describe('manager.metrics() rollup', () => {
  it('returns daemon snapshot + per-worker entries + totals', () => {
    const mgr = makeMgr();
    mgr.workers.set('w1', fakeWorker());
    mgr.workers.set('w2', fakeWorker({ alive: false })); // exited; excluded from totals
    const r = mgr.metrics();

    assert.ok(r.daemon, 'daemon block present');
    assert.strictEqual(typeof r.daemon.pid, 'number');
    assert.ok(r.daemon.pid > 0);
    assert.ok(Array.isArray(r.daemon.loadavg));
    assert.strictEqual(r.daemon.loadavg.length, 3);

    assert.ok(Array.isArray(r.workers));
    assert.strictEqual(r.workers.length, 2);
    assert.deepStrictEqual(Object.keys(r.workers[0]).sort(), ['cpuPct', 'name', 'pid', 'rssKb', 'status', 'threads']);

    assert.strictEqual(r.totals.totalWorkers, 2);
    assert.strictEqual(r.totals.liveWorkers, 1, 'exited workers excluded from live count');
    assert.strictEqual(typeof r.totals.totalRssKb, 'number');
    assert.strictEqual(typeof r.totals.totalCpuPct, 'number');
  });

  it('handles empty worker map without crashing', () => {
    const mgr = makeMgr();
    const r = mgr.metrics();
    assert.deepStrictEqual(r.workers, []);
    assert.strictEqual(r.totals.liveWorkers, 0);
    assert.strictEqual(r.totals.totalWorkers, 0);
    assert.strictEqual(r.totals.totalRssKb, 0);
    assert.strictEqual(r.totals.totalCpuPct, 0);
  });
});
