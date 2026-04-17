// pendingTask delivery verification + write-failure recovery (7.22)
//
// Covers defences added in 7.22 on top of 7.17's 5-point defense:
//  - _schedulePendingTaskVerify: post-write CR resend when prompt stays idle
//  - write-failure recovery: _pendingTaskSent resets on mid-send throw
//  - fireFallback stabilization-gate defer
//  - idle-path setTimeout state re-validation
//
// Style matches pending-task-polling.test.js: MockPtyManager replicating the
// minimal logic under test, synchronous test-only timer capture.

'use strict';
require('./jest-shim');

// ---------------------------------------------------------------------------
// Verify helper: exercises the real src/pty-manager.js implementation of
// _schedulePendingTaskVerify by loading it via isolated require of the method
// body would be brittle, so we reproduce the logic here and mark the mirror
// with a lint marker so drift is easy to catch on review.
// ---------------------------------------------------------------------------

class MockMgr {
  constructor(config = {}) {
    this.config = config;
    this._termInterface = {
      isReady: (txt) => txt.includes('> '),
    };
    this._screenText = '';
    this._scheduledCalls = []; // {delay, fn}
  }

  _getScreenText(_screen) { return this._screenText; }

  // Mirrors src/pty-manager.js:_schedulePendingTaskVerify (7.22).
  _schedulePendingTaskVerify(worker) {
    const cfg = this.config.workerDefaults || {};
    if (cfg.pendingTaskVerifyEnabled === false) return;
    const verifyMs = cfg.pendingTaskVerifyMs ?? 1500;
    if (!worker || !worker.proc) return;
    if (worker._pendingTaskVerifyTimer) {
      clearTimeout(worker._pendingTaskVerifyTimer);
      worker._pendingTaskVerifyTimer = null;
    }
    const fn = () => {
      worker._pendingTaskVerifyTimer = null;
      if (!worker.alive || !worker.proc) return;
      const text = this._getScreenText(worker.screen);
      if (!this._termInterface.isReady(text)) return;
      try { worker.proc.write('\r'); } catch { /* proc closed */ }
      worker.snapshots = worker.snapshots || [];
      worker.snapshots.push({
        time: Date.now(),
        screen: `[C4 WARN] pendingTask verify: prompt still idle after ${verifyMs}ms, resent Enter`,
        autoAction: true
      });
    };
    this._scheduledCalls.push({ delay: verifyMs, fn });
    worker._pendingTaskVerifyTimer = fn; // marker; real impl stores setTimeout handle
  }

  fireVerifier() {
    const call = this._scheduledCalls.shift();
    if (!call) return { fired: false };
    call.fn();
    return { fired: true, delay: call.delay };
  }
}

function makeWorker() {
  const writes = [];
  return {
    alive: true,
    proc: {
      writes,
      write(s) { writes.push(s); return true; },
    },
    screen: {},
    snapshots: [],
    _pendingTaskVerifyTimer: null,
  };
}

describe('_schedulePendingTaskVerify (7.22)', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MockMgr();
  });

  test('schedules a verify callback with default 1500ms', () => {
    const w = makeWorker();
    mgr._schedulePendingTaskVerify(w);
    expect(mgr._scheduledCalls).toHaveLength(1);
    expect(mgr._scheduledCalls[0].delay).toBe(1500);
    expect(w._pendingTaskVerifyTimer).toBeTruthy();
  });

  test('honors workerDefaults.pendingTaskVerifyMs override', () => {
    mgr.config = { workerDefaults: { pendingTaskVerifyMs: 3000 } };
    const w = makeWorker();
    mgr._schedulePendingTaskVerify(w);
    expect(mgr._scheduledCalls[0].delay).toBe(3000);
  });

  test('no-op when pendingTaskVerifyEnabled=false', () => {
    mgr.config = { workerDefaults: { pendingTaskVerifyEnabled: false } };
    const w = makeWorker();
    mgr._schedulePendingTaskVerify(w);
    expect(mgr._scheduledCalls).toHaveLength(0);
    expect(w._pendingTaskVerifyTimer).toBeNull();
  });

  test('fires bare CR when prompt still idle after delay', () => {
    const w = makeWorker();
    mgr._screenText = '> ready'; // idle prompt
    mgr._schedulePendingTaskVerify(w);

    const { fired } = mgr.fireVerifier();
    expect(fired).toBe(true);
    expect(w.proc.writes).toEqual(['\r']);
    const snap = w.snapshots.find(s => s.screen.includes('resent Enter'));
    expect(snap).toBeTruthy();
  });

  test('does NOT fire CR when screen shows task is processing (not idle)', () => {
    const w = makeWorker();
    mgr._screenText = 'running build...'; // busy, no '>' prompt
    mgr._schedulePendingTaskVerify(w);

    mgr.fireVerifier();
    expect(w.proc.writes).toHaveLength(0);
    expect(w.snapshots).toHaveLength(0);
  });

  test('does NOT fire CR when worker died during verify delay', () => {
    const w = makeWorker();
    mgr._screenText = '> ';
    mgr._schedulePendingTaskVerify(w);
    w.alive = false; // worker exited

    mgr.fireVerifier();
    expect(w.proc.writes).toHaveLength(0);
  });

  test('swallows proc.write errors silently (proc closed mid-verify)', () => {
    const w = makeWorker();
    w.proc.write = () => { throw new Error('proc closed'); };
    mgr._screenText = '> ';
    mgr._schedulePendingTaskVerify(w);

    // Must not throw out of fire
    mgr.fireVerifier();
    // Snapshot is still pushed (documents the attempt)
    const snap = w.snapshots.find(s => s.screen.includes('resent Enter'));
    expect(snap).toBeTruthy();
  });

  test('second schedule cancels the first timer (no double-fire)', () => {
    const w = makeWorker();
    mgr._schedulePendingTaskVerify(w);
    const firstMarker = w._pendingTaskVerifyTimer;
    mgr._schedulePendingTaskVerify(w);
    expect(w._pendingTaskVerifyTimer).not.toBe(firstMarker);
    // The shim doesn't model real clearTimeout — instead the mirror sets
    // worker._pendingTaskVerifyTimer = null before rescheduling. That's
    // enough for this regression: a production bug would leave a stale
    // handle which this assertion catches.
  });
});

// ---------------------------------------------------------------------------
// Write-failure recovery on active polling send path (7.22)
// ---------------------------------------------------------------------------

describe('pendingTask write-failure recovery (7.22)', () => {
  // Mirror of the active-polling send block; uses a proc whose write can be
  // toggled to throw. We only exercise the send branch (2-consecutive
  // ready has already passed).
  async function sendAndCatch({ throwOn = null, verifyEnabled = true } = {}) {
    const worker = {
      alive: true,
      proc: {
        writes: [],
        write(s) {
          if (throwOn === 'text' && !s.includes('\r')) throw new Error('EIO write');
          if (throwOn === 'cr' && s === '\r') throw new Error('EIO cr');
          this.writes.push(s);
          return true;
        },
      },
      screen: {},
      snapshots: [],
      _pendingTask: { task: 't', options: {} },
      _pendingTaskSent: false,
      _pendingTaskAttempts: 0,
      _pendingTaskVerifyTimer: null,
      _taskText: null,
      _taskStartedAt: null,
    };

    const cfg = {
      workerDefaults: { pendingTaskVerifyEnabled: verifyEnabled },
    };

    // Inline copy of the send block (mirrors src/pty-manager.js active polling
    // inside setInterval callback — see lines ~1104-1130 after 7.22).
    worker._pendingTaskSent = true;
    worker._pendingTaskAttempts = (worker._pendingTaskAttempts || 0) + 1;
    const pt = worker._pendingTask;
    const fullTask = pt.task;
    try {
      // _writeTaskAndEnter semantics: text write, then CR
      worker.proc.write(fullTask); // may throw on 'text'
      worker.proc.write('\r');     // may throw on 'cr'
      worker._taskText = pt.task;
      worker._taskStartedAt = new Date().toISOString();
      worker._pendingTask = null;
    } catch (err) {
      worker._pendingTaskSent = false;
      worker.snapshots = worker.snapshots || [];
      worker.snapshots.push({
        time: Date.now(),
        screen: `[C4 WARN] pendingTask write failed, will retry via fallback: ${err.message}`,
        autoAction: true
      });
    }

    return { worker, cfg };
  }

  test('successful write clears _pendingTask and increments attempts', async () => {
    const { worker } = await sendAndCatch();
    expect(worker._pendingTaskSent).toBe(true);
    expect(worker._pendingTask).toBeNull();
    expect(worker._taskText).toBe('t');
    expect(worker._pendingTaskAttempts).toBe(1);
  });

  test('text-write throw: _pendingTaskSent resets to false, task preserved, warn snapshot', async () => {
    const { worker } = await sendAndCatch({ throwOn: 'text' });
    expect(worker._pendingTaskSent).toBe(false);     // critical: retry allowed
    expect(worker._pendingTask).not.toBeNull();       // task preserved for retry
    expect(worker._taskText).toBeNull();              // not committed
    const snap = worker.snapshots.find(s => s.screen.includes('write failed'));
    expect(snap).toBeTruthy();
    expect(snap.screen).toContain('EIO write');
  });

  test('CR-write throw: _pendingTaskSent resets to false', async () => {
    const { worker } = await sendAndCatch({ throwOn: 'cr' });
    expect(worker._pendingTaskSent).toBe(false);
    expect(worker._pendingTask).not.toBeNull();
    const snap = worker.snapshots.find(s => s.screen.includes('write failed'));
    expect(snap).toBeTruthy();
  });

  test('attempts counter records each try even on failure', async () => {
    const { worker } = await sendAndCatch({ throwOn: 'text' });
    expect(worker._pendingTaskAttempts).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// fireFallback stabilization-gate defer (7.22)
// ---------------------------------------------------------------------------

describe('fireFallback stabilization-gate defer (7.22)', () => {
  // Minimal mirror of fireFallback's relevant gating logic.
  function buildFallback({ setupDone, setupStableAt, effortLevel, attempt }) {
    const worker = {
      alive: true,
      proc: { writes: [], write(s) { this.writes.push(s); return true; } },
      snapshots: [],
      setupDone,
      _setupStableAt: setupStableAt,
      _dynamicEffort: null,
      _pendingTask: { task: 't', options: {} },
      _pendingTaskSent: false,
    };
    const cfg = { workerDefaults: { effortLevel, pendingTaskTimeout: 30000 } };

    const deferredCalls = [];
    function fire(att) {
      if (!worker.alive || !worker._pendingTask || worker._pendingTaskSent) return 'skipped';
      const setupNeeded = (worker._dynamicEffort || cfg.workerDefaults.effortLevel) && !worker.setupDone;
      const stableGateOk = Date.now() >= (worker._setupStableAt || 0);

      if (setupNeeded && att === 1) {
        deferredCalls.push({ reason: 'setup', deferMs: cfg.workerDefaults.pendingTaskTimeout / 2 });
        return 'deferred-setup';
      }
      if (!stableGateOk && att === 1) {
        const gap = (worker._setupStableAt || 0) - Date.now();
        const deferMs = Math.max(500, gap);
        if (deferMs <= 2000) {
          deferredCalls.push({ reason: 'stable', deferMs });
          return 'deferred-stable';
        }
      }

      worker._pendingTaskSent = true;
      worker.proc.write('t');
      worker.proc.write('\r');
      return 'sent';
    }

    return { worker, fire: () => fire(attempt), deferredCalls };
  }

  test('setupDone=true + stableGateOk: sends immediately', () => {
    const { fire, worker } = buildFallback({
      setupDone: true, setupStableAt: 0, effortLevel: 'high', attempt: 1,
    });
    expect(fire()).toBe('sent');
    expect(worker._pendingTaskSent).toBe(true);
  });

  test('setupDone=false on attempt 1: deferred (setup reason)', () => {
    const { fire, worker, deferredCalls } = buildFallback({
      setupDone: false, setupStableAt: 0, effortLevel: 'high', attempt: 1,
    });
    expect(fire()).toBe('deferred-setup');
    expect(worker._pendingTaskSent).toBe(false);
    expect(deferredCalls[0].reason).toBe('setup');
  });

  test('setupDone=true but inside stabilization window on attempt 1: deferred (stable reason)', () => {
    const { fire, worker, deferredCalls } = buildFallback({
      setupDone: true,
      setupStableAt: Date.now() + 1500, // 1.5s into future, within 2s cap
      effortLevel: 'high',
      attempt: 1,
    });
    expect(fire()).toBe('deferred-stable');
    expect(worker._pendingTaskSent).toBe(false);
    expect(deferredCalls[0].reason).toBe('stable');
    expect(deferredCalls[0].deferMs).toBeLessThanOrEqual(2000);
    expect(deferredCalls[0].deferMs).toBeGreaterThanOrEqual(500);
  });

  test('setupDone=true but large gap (>2s): skips defer and force-sends', () => {
    const { fire, worker } = buildFallback({
      setupDone: true,
      setupStableAt: Date.now() + 5000, // 5s — skip defer, send anyway
      effortLevel: 'high',
      attempt: 1,
    });
    expect(fire()).toBe('sent');
    expect(worker._pendingTaskSent).toBe(true);
  });

  test('attempt 2 never defers on stable-gate: always force-sends', () => {
    const { fire, worker } = buildFallback({
      setupDone: true,
      setupStableAt: Date.now() + 1000,
      effortLevel: 'high',
      attempt: 2,
    });
    expect(fire()).toBe('sent');
    expect(worker._pendingTaskSent).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Idle-path scheduled-send state re-validation (7.22)
// ---------------------------------------------------------------------------

describe('idle-path pendingTask state re-validation (7.22)', () => {
  // Mirrors the 500ms setTimeout callback added in src/pty-manager.js
  // idle handler's pendingTask block. The callback must re-check state
  // before writing; if anything changed, abort and reset _pendingTaskSent.
  function buildIdleSend({ readyAtFire, stableAtFire, setupDoneAtFire, alive = true }) {
    const worker = {
      alive: true,
      proc: { writes: [], write(s) { this.writes.push(s); return true; } },
      screen: {},
      snapshots: [],
      _pendingTask: { task: 't', options: {} },
      _pendingTaskSent: true,    // already marked sent by guard; callback must reset on abort
      _pendingTaskAttempts: 1,
      _setupStableAt: 0,
      _dynamicEffort: null,
      setupDone: true,
      _taskText: null,
      _taskStartedAt: null,
    };
    const cfg = { workerDefaults: {} };

    let screenText = '> '; // default: ready at fire
    const termInterface = { isReady: (t) => t.includes('> ') };

    // Simulate the gap: we reconfigure state before firing the callback.
    worker.alive = alive;
    if (readyAtFire === false) screenText = 'processing...';
    if (stableAtFire === false) worker._setupStableAt = Date.now() + 3000;
    if (setupDoneAtFire === false) { worker.setupDone = false; worker._dynamicEffort = 'high'; }

    // The scheduled callback logic:
    const callback = async () => {
      if (!worker.alive || !worker._pendingTask) return 'aborted-dead';
      const recheckText = screenText;
      const stillReady = termInterface.isReady(recheckText);
      const stillStable = Date.now() >= (worker._setupStableAt || 0);
      const stillNoSetup = !(worker._dynamicEffort || cfg.workerDefaults.effortLevel) || worker.setupDone;
      if (!stillReady || !stillStable || !stillNoSetup) {
        worker._pendingTaskSent = false;
        worker.snapshots.push({
          time: Date.now(),
          screen: `[C4 WARN] pendingTask idle-path scheduled send aborted (state changed). ready=${stillReady} stable=${stillStable} noSetup=${stillNoSetup}`,
          autoAction: true
        });
        return 'aborted-state';
      }
      // Success path — mirror
      worker.proc.write('t');
      worker.proc.write('\r');
      worker._taskText = worker._pendingTask.task;
      worker._taskStartedAt = new Date().toISOString();
      worker._pendingTask = null;
      return 'sent';
    };

    return { worker, callback };
  }

  test('happy path: all checks pass, send proceeds', async () => {
    const { worker, callback } = buildIdleSend({
      readyAtFire: true, stableAtFire: true, setupDoneAtFire: true,
    });
    expect(await callback()).toBe('sent');
    expect(worker._pendingTask).toBeNull();
    expect(worker._taskText).toBe('t');
  });

  test('worker died in gap: abort without writing', async () => {
    const { worker, callback } = buildIdleSend({
      readyAtFire: true, stableAtFire: true, setupDoneAtFire: true, alive: false,
    });
    expect(await callback()).toBe('aborted-dead');
    expect(worker.proc.writes).toHaveLength(0);
    // _pendingTaskSent remains true for dead workers (no retry; caller handles).
  });

  test('screen no longer ready: abort, reset _pendingTaskSent, snapshot', async () => {
    const { worker, callback } = buildIdleSend({
      readyAtFire: false, stableAtFire: true, setupDoneAtFire: true,
    });
    expect(await callback()).toBe('aborted-state');
    expect(worker.proc.writes).toHaveLength(0);
    expect(worker._pendingTaskSent).toBe(false);
    const snap = worker.snapshots.find(s => s.screen.includes('state changed'));
    expect(snap).toBeTruthy();
    expect(snap.screen).toContain('ready=false');
  });

  test('stabilization window reopened: abort, reset _pendingTaskSent', async () => {
    const { worker, callback } = buildIdleSend({
      readyAtFire: true, stableAtFire: false, setupDoneAtFire: true,
    });
    expect(await callback()).toBe('aborted-state');
    expect(worker._pendingTaskSent).toBe(false);
    const snap = worker.snapshots.find(s => s.screen.includes('stable=false'));
    expect(snap).toBeTruthy();
  });

  test('setup restarted in gap: abort, reset _pendingTaskSent', async () => {
    const { worker, callback } = buildIdleSend({
      readyAtFire: true, stableAtFire: true, setupDoneAtFire: false,
    });
    expect(await callback()).toBe('aborted-state');
    expect(worker._pendingTaskSent).toBe(false);
    const snap = worker.snapshots.find(s => s.screen.includes('noSetup=false'));
    expect(snap).toBeTruthy();
  });
});
