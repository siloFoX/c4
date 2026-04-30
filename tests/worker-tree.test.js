// Worker hierarchy / tree tests (TODO #99).
//
// We stub list() machinery against in-memory worker records so we exercise
// _parent persistence + parent surfacing in list() output without spawning
// real PTYs.

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
  return mgr;
}

function fakeWorker(over = {}) {
  return {
    proc: { pid: null },
    command: 'claude',
    target: 'local',
    branch: null,
    worktree: null,
    scopeGuard: null,
    alive: true,
    lastDataTime: Date.now(),
    snapshots: [],
    snapshotIndex: 0,
    _suspended: false,
    _adapterName: null,
    _interventionState: null,
    _lastQuestion: null,
    _errorHistory: [],
    _smState: null,
    _parent: null,
    ...over,
  };
}

describe('worker tree (TODO #99)', () => {
  it('list() exposes parent field on each worker', () => {
    const mgr = makeMgr();
    mgr.workers.set('mgr', fakeWorker());
    mgr.workers.set('child-a', fakeWorker({ _parent: 'mgr' }));
    mgr.workers.set('child-b', fakeWorker({ _parent: 'mgr' }));
    const { workers } = mgr.list();
    const byName = Object.fromEntries(workers.map((w) => [w.name, w]));
    assert.strictEqual(byName.mgr.parent, null);
    assert.strictEqual(byName['child-a'].parent, 'mgr');
    assert.strictEqual(byName['child-b'].parent, 'mgr');
  });

  it('orphan parent (parent name not in list) still appears in payload', () => {
    // Web UI promotes orphans to roots; backend just forwards the raw value.
    const mgr = makeMgr();
    mgr.workers.set('lonely', fakeWorker({ _parent: 'long-gone' }));
    const { workers } = mgr.list();
    assert.strictEqual(workers[0].parent, 'long-gone');
  });

  it('queued tasks preserve parent until they spawn', () => {
    const mgr = makeMgr();
    mgr._taskQueue.push({
      name: 'queued-1', task: 'work',
      branch: 'c4/q', after: 'mgr', parent: 'mgr',
      queuedAt: '2026-04-30T00:00:00Z',
    });
    const { queuedTasks } = mgr.list();
    assert.strictEqual(queuedTasks.length, 1);
    // queue rendering doesn't currently surface parent — but the entry
    // remains intact for the spawn path. Verify the field hasn't been
    // dropped on its way through.
    assert.strictEqual(mgr._taskQueue[0].parent, 'mgr');
  });
});
