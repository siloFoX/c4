// Slash-command worker setup tests (7.19)
// Verifies _executeSetupPhase2 sends /effort and /model slash commands
// (Claude Code v2.1.112+) instead of TUI arrow-key navigation.
//
// Strategy: mirror the real _executeSetupPhase2 / _finishSetup logic in a
// MockPtyManager, but stub setTimeout so the setTimeout chain runs
// synchronously and we can assert write order + contents deterministically.

'use strict';
require('./jest-shim');

const fs = require('fs');
const path = require('path');

// --- Synchronous setTimeout shim ---
const realSetTimeout = global.setTimeout;
function useSyncTimers() {
  global.setTimeout = (cb) => { cb(); return 0; };
}
function restoreTimers() {
  global.setTimeout = realSetTimeout;
}

// --- Minimal PtyManager mock that embeds the real method logic ---
class MockPtyManager {
  constructor(config = {}) {
    this.config = config;
    this._termInterface = { isReady: () => false };
    this.proc = {
      writes: [],
      write: (txt) => this.proc.writes.push(txt),
    };
    this.worker = {
      alive: true,
      setupDone: false,
      setupPhase: 'waitMenu',      // pre-seeded so guard passes (set by idle handler in real flow)
      setupPhaseStart: Date.now(),
      setupRetries: 0,
      snapshots: [],
      _dynamicEffort: null,
      _pendingTask: null,
      _pendingTaskSent: false,
      screen: {},
    };
  }

  _getScreenText() { return ''; }
  async _writeTaskAndEnter() {}
  _buildTaskText(_w, t) { return t; }
}

// Mirror of pty-manager.js _executeSetupPhase2 (7.19).
MockPtyManager.prototype._executeSetupPhase2 = function(worker, proc) {
  if (worker.setupPhase !== 'waitMenu') return;

  const effortLevel = worker._dynamicEffort || this.config.workerDefaults?.effortLevel || 'max';
  const model = this.config.workerDefaults?.model;
  const setupCfg = this.config.workerDefaults?.effortSetup || {};
  const inputDelayMs = setupCfg.inputDelayMs ?? 500;
  const confirmDelayMs = setupCfg.confirmDelayMs ?? 500;

  if (process.env.MSYS_NO_PATHCONV !== '1') {
    process.env.MSYS_NO_PATHCONV = '1';
  }

  worker.setupPhase = 'done';

  setTimeout(() => {
    proc.write(`/effort ${effortLevel}\r`);
    setTimeout(() => {
      if (model && model !== 'default') {
        proc.write(`/model ${model}\r`);
        setTimeout(() => this._finishSetup(worker, proc, effortLevel, model), confirmDelayMs);
      } else {
        this._finishSetup(worker, proc, effortLevel, null);
      }
    }, confirmDelayMs);
  }, inputDelayMs);
};

MockPtyManager.prototype._finishSetup = function(worker, _proc, effortLevel, model) {
  worker.setupDone = true;
  worker.setupPhase = null;
  worker.setupPhaseStart = null;
  worker.snapshots.push({
    time: Date.now(),
    screen: `[C4 SETUP] /effort ${effortLevel}` +
      (model ? ` + /model ${model}` : '') +
      (worker.setupRetries ? ` (after ${worker.setupRetries} retries)` : ''),
    autoAction: true,
  });
};

describe('Setup Slash Commands (7.19)', () => {
  let mgr;

  beforeEach(() => {
    useSyncTimers();
    mgr = new MockPtyManager({
      workerDefaults: {
        effortLevel: 'max',
        model: 'default',
        effortSetup: { inputDelayMs: 0, confirmDelayMs: 0 },
      },
    });
  });

  test('sends /effort max with carriage return', () => {
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    expect(mgr.proc.writes).toContain('/effort max\r');
  });

  test('uses configured effortLevel (not hardcoded max)', () => {
    mgr.config.workerDefaults.effortLevel = 'high';
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    expect(mgr.proc.writes).toContain('/effort high\r');
    expect(mgr.proc.writes).not.toContain('/effort max\r');
  });

  test('uses _dynamicEffort override when set on worker', () => {
    mgr.worker._dynamicEffort = 'low';
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    expect(mgr.proc.writes).toContain('/effort low\r');
  });

  test('does NOT send /model when workerDefaults.model is "default"', () => {
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    const hasModel = mgr.proc.writes.some(w => w.startsWith('/model'));
    expect(hasModel).toBe(false);
  });

  test('does NOT send /model when workerDefaults.model is missing', () => {
    delete mgr.config.workerDefaults.model;
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    const hasModel = mgr.proc.writes.some(w => w.startsWith('/model'));
    expect(hasModel).toBe(false);
  });

  test('sends /model <value> when workerDefaults.model is a non-default value', () => {
    mgr.config.workerDefaults.model = 'opus';
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    expect(mgr.proc.writes).toContain('/model opus\r');
  });

  test('sends both /effort and /model when model override is set', () => {
    mgr.config.workerDefaults.effortLevel = 'high';
    mgr.config.workerDefaults.model = 'sonnet';
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    expect(mgr.proc.writes).toContain('/effort high\r');
    expect(mgr.proc.writes).toContain('/model sonnet\r');
    // /effort is sent before /model
    const effortIdx = mgr.proc.writes.indexOf('/effort high\r');
    const modelIdx = mgr.proc.writes.indexOf('/model sonnet\r');
    expect(effortIdx).toBeLessThan(modelIdx);
  });

  test('ensures MSYS_NO_PATHCONV=1 before writing slash commands', () => {
    // Simulate a Git Bash session where MSYS_NO_PATHCONV was unset/cleared.
    const prev = process.env.MSYS_NO_PATHCONV;
    delete process.env.MSYS_NO_PATHCONV;

    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    expect(process.env.MSYS_NO_PATHCONV).toBe('1');

    // restore
    if (prev !== undefined) process.env.MSYS_NO_PATHCONV = prev;
  });

  test('guards against double execution (setupPhase != waitMenu)', () => {
    mgr.worker.setupPhase = 'done';
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    expect(mgr.proc.writes).toHaveLength(0);
  });

  test('setupDone is set true after /effort only (no /model)', () => {
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    expect(mgr.worker.setupDone).toBe(true);
    expect(mgr.worker.setupPhase).toBeNull();
  });

  test('setupDone is set true after /effort + /model path', () => {
    mgr.config.workerDefaults.model = 'opus';
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    expect(mgr.worker.setupDone).toBe(true);
    expect(mgr.worker.setupPhase).toBeNull();
  });

  test('snapshot records slash command strings (not arrow-key description)', () => {
    mgr.config.workerDefaults.model = 'opus';
    mgr._executeSetupPhase2(mgr.worker, mgr.proc);
    restoreTimers();

    const snap = mgr.worker.snapshots.find(s => s.screen.includes('[C4 SETUP]'));
    expect(snap).toBeTruthy();
    expect(snap.screen).toContain('/effort max');
    expect(snap.screen).toContain('/model opus');
  });
});

// --- Source-level assertion: the real pty-manager.js implements the slash path ---
describe('Setup Slash Commands — source integrity (7.19)', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'pty-manager.js'),
    'utf8'
  );

  test('pty-manager.js _executeSetupPhase2 writes /effort slash command', () => {
    const match = src.match(/_executeSetupPhase2\(worker, proc\)\s*\{[\s\S]*?\n  \}/);
    expect(match).toBeTruthy();
    const body = match[0];
    expect(body).toContain('/effort ${effortLevel}\\r');
  });

  test('pty-manager.js _executeSetupPhase2 sends /model only when non-default', () => {
    const match = src.match(/_executeSetupPhase2\(worker, proc\)\s*\{[\s\S]*?\n  \}/);
    const body = match[0];
    expect(body).toContain("model !== 'default'");
    expect(body).toContain('/model ${model}\\r');
  });

  test('cli.js sets MSYS_NO_PATHCONV=1 at process start', () => {
    const cliSrc = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'cli.js'),
      'utf8'
    );
    expect(cliSrc).toContain("process.env.MSYS_NO_PATHCONV = '1'");
  });

  test('pty-manager.js defensively re-asserts MSYS_NO_PATHCONV before write', () => {
    const match = src.match(/_executeSetupPhase2\(worker, proc\)\s*\{[\s\S]*?\n  \}/);
    const body = match[0];
    expect(body).toContain('MSYS_NO_PATHCONV');
  });
});
