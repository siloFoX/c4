// pendingTask active polling tests
// Verifies that _createAndSendTask uses active polling to detect idle state
// instead of relying solely on the idle handler

'use strict';
require('./jest-shim');

// --- Minimal mock of PtyManager for polling testing ---
// Instead of using real timers, we capture the polling callback and invoke it manually.

class MockPtyManager {
  constructor(config = {}) {
    this.workers = new Map();
    this.config = config;
    this._chunkedWriteCalls = [];
    this._screenText = '';
    // Capture timer callbacks instead of using real timers
    this._pollingCallback = null;
    this._timeoutCallback = null;
  }

  create(name) {
    const worker = {
      alive: true,
      proc: { write() {} },
      screen: {},
      snapshots: [],
      setupDone: false,
      _dynamicEffort: null,
      _pendingTask: null,
      _pendingTaskSent: false,
      _pendingTaskTimer: null,
      _pendingTaskTimeoutTimer: null,
      _pendingTaskTime: null,
      _taskText: null,
      _taskStartedAt: null,
      worktree: null,
      worktreeRepoRoot: null,
      branch: null,
      idleTimer: null
    };
    this.workers.set(name, worker);
    return { pid: 1234 };
  }

  _detectRepoRoot() { return null; }
  _worktreePath() { return '/tmp/worktree'; }
  _createWorktree() {}
  _writeWorkerSettings() {}
  _determineEffort() { return null; }
  _getRulesSummary() { return ''; }
  _saveState() {}

  _getScreenText() {
    return this._screenText;
  }

  _buildTaskText(worker, task) {
    return task;
  }

  async _chunkedWrite(proc, text) {
    this._chunkedWriteCalls.push(text);
  }
}

// Replicates the polling logic from _createAndSendTask, but captures callbacks
// instead of creating real setInterval/setTimeout
MockPtyManager.prototype._createAndSendTask = function(entry) {
  const existing = this.workers.get(entry.name);
  if (existing) {
    if (existing.alive) {
      return { error: `Worker '${entry.name}' is already alive` };
    }
    if (existing.idleTimer) clearTimeout(existing.idleTimer);
    this.workers.delete(entry.name);
  }

  const createResult = this.create(entry.name);
  if (createResult.error) return createResult;

  const w = this.workers.get(entry.name);

  if (entry._templateEffort) {
    w._dynamicEffort = entry._templateEffort;
  } else {
    w._dynamicEffort = this._determineEffort(entry.task);
  }

  w._pendingTask = {
    task: entry.task,
    options: {
      branch: entry.branch,
      useBranch: entry.useBranch,
      useWorktree: entry.useWorktree,
      projectRoot: entry.projectRoot,
      autoMode: entry.autoMode,
      _autoWorker: entry._autoWorker
    }
  };
  w._pendingTaskTime = Date.now();

  // Capture polling callback (mirrors real setInterval logic)
  const self = this;
  this._pollingCallback = function pollTick() {
    const worker = self.workers.get(entry.name);
    if (!worker || !worker.alive || !worker._pendingTask || worker._pendingTaskSent) {
      w._pendingTaskTimer = null;
      return 'stopped';
    }

    const text = self._getScreenText(worker.screen);
    const isReady = self._termInterface
      ? self._termInterface.isReady(text)
      : text.includes('> ');
    const effortLevel = worker._dynamicEffort || self.config.workerDefaults?.effortLevel;
    const needsSetup = effortLevel && !worker.setupDone;

    if (isReady && !needsSetup) {
      w._pendingTaskTimer = null;
      worker._pendingTaskSent = true;
      const pt = worker._pendingTask;
      const fullTask = self._buildTaskText(worker, pt.task, pt.options);
      self._chunkedWrite(worker.proc, fullTask + '\r');
      worker._taskText = pt.task;
      worker._taskStartedAt = new Date().toISOString();
      worker._pendingTask = null;
      return 'sent';
    }
    return 'waiting';
  };
  w._pendingTaskTimer = true; // marker

  // Capture timeout callback
  const pendingTimeoutMs = this.config.workerDefaults?.pendingTaskTimeout ?? 30000;
  this._timeoutCallback = function timeoutFallback() {
    w._pendingTaskTimer = null;
    const worker = self.workers.get(entry.name);
    if (worker && worker.alive && worker._pendingTask && !worker._pendingTaskSent) {
      worker._pendingTaskSent = true;
      const pt = worker._pendingTask;
      const fullTask = self._buildTaskText(worker, pt.task, pt.options);
      self._chunkedWrite(worker.proc, fullTask + '\r');
      worker._taskText = pt.task;
      worker._taskStartedAt = new Date().toISOString();
      worker._pendingTask = null;
      worker.snapshots = worker.snapshots || [];
      worker.snapshots.push({
        time: Date.now(),
        screen: `[C4 WARN] pendingTask sent via timeout fallback (${pendingTimeoutMs}ms)`,
        autoAction: true
      });
      return 'sent';
    }
    return 'skipped';
  };
  w._pendingTaskTimeoutTimer = true; // marker

  return { created: true, name: entry.name, pid: createResult.pid };
};

// --- Tests ---

describe('pendingTask active polling', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MockPtyManager({
      workerDefaults: { pendingTaskTimeout: 30000 }
    });
    mgr._screenText = '';
  });

  test('creates polling and timeout markers on _createAndSendTask', () => {
    const result = mgr._createAndSendTask({
      name: 'w1',
      task: 'do something'
    });

    expect(result.created).toBe(true);
    const w = mgr.workers.get('w1');
    expect(w._pendingTaskTimer).toBeTruthy();
    expect(w._pendingTaskTimeoutTimer).toBeTruthy();
    expect(w._pendingTask).toBeTruthy();
    expect(w._pendingTaskSent).toBe(false);
    expect(mgr._pollingCallback).toBeTruthy();
    expect(mgr._timeoutCallback).toBeTruthy();
  });

  test('polling sends task when screen shows ready prompt', () => {
    mgr._screenText = '> ';

    mgr._createAndSendTask({
      name: 'w2',
      task: 'build feature'
    });

    const w = mgr.workers.get('w2');
    const result = mgr._pollingCallback();

    expect(result).toBe('sent');
    expect(w._pendingTaskSent).toBe(true);
    expect(w._pendingTask).toBeNull();
    expect(w._taskText).toBe('build feature');
    expect(w._taskStartedAt).toBeTruthy();
    expect(mgr._chunkedWriteCalls).toHaveLength(1);
    expect(mgr._chunkedWriteCalls[0]).toContain('build feature');
    expect(w._pendingTaskTimer).toBeNull();
  });

  test('polling returns waiting when screen is not ready', () => {
    mgr._screenText = 'loading...';

    mgr._createAndSendTask({
      name: 'w3',
      task: 'test task'
    });

    const w = mgr.workers.get('w3');
    const result = mgr._pollingCallback();

    expect(result).toBe('waiting');
    expect(w._pendingTaskSent).toBe(false);
    expect(w._pendingTask).toBeTruthy();
    expect(mgr._chunkedWriteCalls).toHaveLength(0);
  });

  test('polling sends task after screen transitions to ready', () => {
    mgr._screenText = 'loading...';

    mgr._createAndSendTask({
      name: 'w4',
      task: 'delayed task'
    });

    const w = mgr.workers.get('w4');

    // First poll: not ready
    expect(mgr._pollingCallback()).toBe('waiting');
    expect(w._pendingTaskSent).toBe(false);

    // Screen becomes ready
    mgr._screenText = '> ';

    // Second poll: ready
    expect(mgr._pollingCallback()).toBe('sent');
    expect(w._pendingTaskSent).toBe(true);
    expect(w._taskText).toBe('delayed task');
    expect(mgr._chunkedWriteCalls).toHaveLength(1);
  });

  test('polling waits for effort setup before sending', () => {
    mgr._screenText = '> ';
    mgr.config.workerDefaults = { effortLevel: 'high', pendingTaskTimeout: 30000 };

    mgr._createAndSendTask({
      name: 'w5',
      task: 'effort task'
    });

    const w = mgr.workers.get('w5');

    // Poll: prompt ready but effort setup not done
    expect(mgr._pollingCallback()).toBe('waiting');
    expect(w._pendingTaskSent).toBe(false);

    // Mark setup as done
    w.setupDone = true;

    // Poll again: now it sends
    expect(mgr._pollingCallback()).toBe('sent');
    expect(w._pendingTaskSent).toBe(true);
    expect(w._taskText).toBe('effort task');
  });

  test('timeout fallback sends task and logs warning snapshot', () => {
    mgr._screenText = 'never ready';

    mgr._createAndSendTask({
      name: 'w6',
      task: 'timeout task'
    });

    const w = mgr.workers.get('w6');

    // Polling still waiting
    expect(mgr._pollingCallback()).toBe('waiting');

    // Simulate timeout firing
    const result = mgr._timeoutCallback();

    expect(result).toBe('sent');
    expect(w._pendingTaskSent).toBe(true);
    expect(w._taskText).toBe('timeout task');
    expect(w._pendingTask).toBeNull();
    expect(w._pendingTaskTimer).toBeNull();
    expect(mgr._chunkedWriteCalls).toHaveLength(1);

    // Warning snapshot
    const warnSnap = w.snapshots.find(s => s.screen.includes('timeout fallback'));
    expect(warnSnap).toBeTruthy();
    expect(warnSnap.screen).toContain('30000ms');
  });

  test('polling stops when worker exits (alive=false)', () => {
    mgr._screenText = 'loading...';

    mgr._createAndSendTask({
      name: 'w7',
      task: 'exit task'
    });

    const w = mgr.workers.get('w7');
    w.alive = false;

    const result = mgr._pollingCallback();

    expect(result).toBe('stopped');
    expect(w._pendingTaskSent).toBe(false);
    expect(w._pendingTaskTimer).toBeNull();
  });

  test('_pendingTaskSent flag prevents double-send', () => {
    mgr._screenText = '> ';

    mgr._createAndSendTask({
      name: 'w8',
      task: 'double test'
    });

    const w = mgr.workers.get('w8');

    // First poll sends
    expect(mgr._pollingCallback()).toBe('sent');
    expect(w._pendingTaskSent).toBe(true);
    expect(mgr._chunkedWriteCalls).toHaveLength(1);

    // Second poll stops (already sent)
    expect(mgr._pollingCallback()).toBe('stopped');
    expect(mgr._chunkedWriteCalls).toHaveLength(1);

    // Timeout also skips
    expect(mgr._timeoutCallback()).toBe('skipped');
    expect(mgr._chunkedWriteCalls).toHaveLength(1);
  });

  test('timeout is skipped if polling already sent', () => {
    mgr._screenText = '> ';

    mgr._createAndSendTask({
      name: 'w9',
      task: 'poll wins'
    });

    // Polling sends
    expect(mgr._pollingCallback()).toBe('sent');

    // Timeout does nothing
    expect(mgr._timeoutCallback()).toBe('skipped');
    expect(mgr._chunkedWriteCalls).toHaveLength(1);
  });

  test('existing dead worker is replaced cleanly', () => {
    mgr._createAndSendTask({ name: 'w10', task: 'first' });
    const w1 = mgr.workers.get('w10');
    w1.alive = false;

    mgr._createAndSendTask({ name: 'w10', task: 'second' });
    const w2 = mgr.workers.get('w10');

    expect(w2._pendingTask.task).toBe('second');
    expect(w2.alive).toBe(true);
  });

  test('alive worker cannot be replaced', () => {
    mgr._createAndSendTask({ name: 'w11', task: 'first' });

    const result = mgr._createAndSendTask({ name: 'w11', task: 'second' });
    expect(result.error).toContain('already alive');
  });

  test('no effortLevel means no setup wait', () => {
    mgr._screenText = '> ';
    mgr.config.workerDefaults = {};

    mgr._createAndSendTask({
      name: 'w12',
      task: 'no effort'
    });

    const w = mgr.workers.get('w12');

    // Sends immediately since no effort setup needed
    expect(mgr._pollingCallback()).toBe('sent');
    expect(w._pendingTaskSent).toBe(true);
    expect(w._taskText).toBe('no effort');
  });

  test('_dynamicEffort from entry takes precedence and blocks until setupDone', () => {
    mgr._screenText = '> ';

    mgr._createAndSendTask({
      name: 'w13',
      task: 'template effort',
      _templateEffort: 'low'
    });

    const w = mgr.workers.get('w13');

    // _dynamicEffort is set, so setup is needed
    expect(mgr._pollingCallback()).toBe('waiting');

    w.setupDone = true;
    expect(mgr._pollingCallback()).toBe('sent');
  });

  test('pendingTaskTimeout config is used in timeout snapshot', () => {
    mgr._screenText = 'loading...';
    mgr.config.workerDefaults = { pendingTaskTimeout: 5000 };

    mgr._createAndSendTask({
      name: 'w14',
      task: 'custom timeout'
    });

    const w = mgr.workers.get('w14');
    mgr._timeoutCallback();

    const snap = w.snapshots.find(s => s.screen.includes('timeout fallback'));
    expect(snap).toBeTruthy();
    expect(snap.screen).toContain('5000ms');
  });
});
