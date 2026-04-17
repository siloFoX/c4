// (9.11) Worktree GC automation tests
// Extracts _runWorktreeGc / _worktreeGcDecision / _listC4Worktrees /
// startWorktreeGc / stopWorktreeGc from src/pty-manager.js via regex + new
// Function so the tests stay coupled to the real implementation. Leaf probes
// (_isWorktreeDirty, _isBranchMerged, _getWorktreeInactiveMs, _detectRepoRoot,
//  _removeWorktree, _notifyLostDirty) and the git shell-out are stubbed so the
// tests never touch a real git repository.

'use strict';
require('./jest-shim');

const fs = require('fs');
const path = require('path');

const PTY_MANAGER_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'pty-manager.js'),
  'utf8'
);

function extractMethod(name, regexParams, signatureParams) {
  // Non-greedy body match up to the line that closes the method ("  }").
  const re = new RegExp(
    `  ${name}\\(${regexParams}\\)\\s*\\{[\\s\\S]*?\\n  \\}`,
    'm'
  );
  const match = PTY_MANAGER_SRC.match(re);
  if (!match) throw new Error(`Could not locate ${name} in pty-manager.js`);
  const header = new RegExp(`^  ${name}\\(${regexParams}\\)\\s*\\{`);
  const body = match[0].replace(header, '').replace(/\n  \}$/, '');
  return new Function(
    'execSyncSafe', 'fs', 'path',
    `return function(${signatureParams}) {${body}\n};`
  );
}

const runWorktreeGcSrc = extractMethod('_runWorktreeGc', 'overrides = \\{\\}', 'overrides = {}');
const worktreeGcDecisionSrc = extractMethod('_worktreeGcDecision', 'repoRoot, entry, opts', 'repoRoot, entry, opts');
const listC4WorktreesSrc = extractMethod('_listC4Worktrees', 'repoRoot', 'repoRoot');
const startWorktreeGcSrc = extractMethod('startWorktreeGc', '', '');
const stopWorktreeGcSrc = extractMethod('stopWorktreeGc', '', '');

function attachMethods(execSyncSafe) {
  return {
    _runWorktreeGc: runWorktreeGcSrc(execSyncSafe, fs, path),
    _worktreeGcDecision: worktreeGcDecisionSrc(execSyncSafe, fs, path),
    _listC4Worktrees: listC4WorktreesSrc(execSyncSafe, fs, path),
    startWorktreeGc: startWorktreeGcSrc(execSyncSafe, fs, path),
    stopWorktreeGc: stopWorktreeGcSrc(execSyncSafe, fs, path),
  };
}

function makeManager({ config = {}, workers = new Map(), entries = [] } = {}) {
  const execSpy = jest.fn();
  const methods = attachMethods(execSpy);
  const mgr = {
    config,
    workers,
    _execSpy: execSpy,
    _isWorktreeDirtySpy: jest.fn().mockReturnValue(false),
    _isBranchMergedSpy: jest.fn().mockReturnValue(true),
    _getWorktreeInactiveMsSpy: jest.fn().mockReturnValue(48 * 3600 * 1000),
    _removeWorktreeSpy: jest.fn(),
    _notifyLostDirtySpy: jest.fn(),
    _detectRepoRoot() { return '/repo'; },
    _isWorktreeDirty(p) { return this._isWorktreeDirtySpy(p); },
    _isBranchMerged(repo, br, main) { return this._isBranchMergedSpy(repo, br, main); },
    _getWorktreeInactiveMs(p, now) { return this._getWorktreeInactiveMsSpy(p, now); },
    _removeWorktree(repo, p) { this._removeWorktreeSpy(repo, p); },
    _notifyLostDirty(name, p) { this._notifyLostDirtySpy(name, p); },
    ...methods,
  };
  // Override _listC4Worktrees to return preset entries (avoids real git call).
  mgr._listC4Worktrees = () => entries.map(e => ({ ...e }));
  return mgr;
}

describe('(9.11) _runWorktreeGc', () => {
  test('(a) skips active workers - worktree owned by alive worker is preserved', () => {
    const wt = '/repo/../c4-worktree-active';
    const workers = new Map();
    workers.set('active-worker', { alive: true, worktree: wt });
    const mgr = makeManager({
      workers,
      entries: [{ worktree: wt, branch: 'c4/active' }],
    });

    const result = mgr._runWorktreeGc();

    expect(result.scanned).toBe(1);
    expect(result.removed).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe('active-worker');
    expect(mgr._removeWorktreeSpy).not.toHaveBeenCalled();
    expect(mgr._execSpy).not.toHaveBeenCalled();
  });

  test('(b) removes inactive merged worktree - clean + idle + merged goes away', () => {
    const wt = '/repo/../c4-worktree-done';
    const mgr = makeManager({
      entries: [{ worktree: wt, branch: 'c4/done' }],
    });
    mgr._isWorktreeDirtySpy.mockReturnValue(false);
    mgr._isBranchMergedSpy.mockReturnValue(true);
    mgr._getWorktreeInactiveMsSpy.mockReturnValue(72 * 3600 * 1000); // 3 days

    const result = mgr._runWorktreeGc();

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0].path).toBe(wt);
    expect(result.removed[0].branch).toBe('c4/done');
    expect(result.skipped).toHaveLength(0);
    expect(mgr._removeWorktreeSpy).toHaveBeenCalledTimes(1);
    // Branch delete was issued via execSyncSafe.
    expect(mgr._execSpy).toHaveBeenCalled();
    const calls = mgr._execSpy.mock.calls;
    const sawBranchDelete = calls.some(c => /branch -D "c4\/done"/.test(c[0]));
    expect(sawBranchDelete).toBe(true);
  });

  test('(c) respects uncommitted changes - dirty worktree skipped with warning', () => {
    const wt = '/repo/../c4-worktree-wip';
    const mgr = makeManager({
      entries: [{ worktree: wt, branch: 'c4/wip' }],
    });
    mgr._isWorktreeDirtySpy.mockReturnValue(true);
    mgr._getWorktreeInactiveMsSpy.mockReturnValue(72 * 3600 * 1000);

    const warnCalls = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnCalls.push(args.join(' '));
    try {
      const result = mgr._runWorktreeGc();

      expect(result.removed).toHaveLength(0);
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0].reason).toBe('uncommitted-changes');
      expect(mgr._removeWorktreeSpy).not.toHaveBeenCalled();
      expect(mgr._notifyLostDirtySpy).toHaveBeenCalled();
      const sawWarn = warnCalls.some(m => m.includes('[GC WARN]') && m.includes('uncommitted changes'));
      expect(sawWarn).toBe(true);
    } finally {
      console.warn = originalWarn;
    }
  });

  test('(d) config disabled - GC is a no-op and short-circuits', () => {
    const wt = '/repo/../c4-worktree-off';
    const mgr = makeManager({
      config: { daemon: { worktreeGc: { enabled: false } } },
      entries: [{ worktree: wt, branch: 'c4/off' }],
    });
    mgr._isWorktreeDirtySpy.mockReturnValue(false);
    mgr._isBranchMergedSpy.mockReturnValue(true);
    mgr._getWorktreeInactiveMsSpy.mockReturnValue(72 * 3600 * 1000);

    const result = mgr._runWorktreeGc();

    expect(result.enabled).toBe(false);
    expect(result.disabled).toBe(true);
    expect(result.scanned).toBe(0);
    expect(result.removed).toHaveLength(0);
    expect(mgr._removeWorktreeSpy).not.toHaveBeenCalled();
    expect(mgr._execSpy).not.toHaveBeenCalled();
  });
});

describe('(9.11) _worktreeGcDecision', () => {
  test('skip branch-not-merged even when clean and inactive', () => {
    const mgr = makeManager();
    mgr._isWorktreeDirtySpy.mockReturnValue(false);
    mgr._getWorktreeInactiveMsSpy.mockReturnValue(72 * 3600 * 1000);
    mgr._isBranchMergedSpy.mockReturnValue(false);

    const decision = mgr._worktreeGcDecision(
      '/repo',
      { worktree: '/wt', branch: 'c4/x', activeWorker: false },
      { inactiveHours: 24 }
    );
    expect(decision.skip).toBe(true);
    expect(decision.reason).toBe('branch-not-merged');
  });

  test('skip recent-activity when mtime < threshold', () => {
    const mgr = makeManager();
    mgr._getWorktreeInactiveMsSpy.mockReturnValue(1 * 3600 * 1000); // 1h
    const decision = mgr._worktreeGcDecision(
      '/repo',
      { worktree: '/wt', branch: 'c4/x', activeWorker: false },
      { inactiveHours: 24 }
    );
    expect(decision.skip).toBe(true);
    expect(decision.reason).toBe('recent-activity');
  });

  test('allows GC when inactive + clean + merged', () => {
    const mgr = makeManager();
    mgr._getWorktreeInactiveMsSpy.mockReturnValue(48 * 3600 * 1000);
    mgr._isWorktreeDirtySpy.mockReturnValue(false);
    mgr._isBranchMergedSpy.mockReturnValue(true);
    const decision = mgr._worktreeGcDecision(
      '/repo',
      { worktree: '/wt', branch: 'c4/x', activeWorker: false },
      { inactiveHours: 24 }
    );
    expect(decision.skip).toBe(false);
    expect(decision.reason).toBe('inactive-merged-clean');
  });
});

describe('(9.11) startWorktreeGc / stopWorktreeGc', () => {
  test('start is a no-op when disabled - no timer scheduled', () => {
    const mgr = makeManager({
      config: { daemon: { worktreeGc: { enabled: false } } },
    });
    mgr.startWorktreeGc();
    expect(mgr._worktreeGcTimer).toBeUndefined();
  });

  test('start schedules a timer when enabled; stop clears it', () => {
    const mgr = makeManager({
      config: { daemon: { worktreeGc: { enabled: true, intervalSec: 60 } } },
    });
    mgr.startWorktreeGc();
    expect(mgr._worktreeGcTimer).toBeDefined();
    expect(mgr._worktreeGcTimer).not.toBeNull();
    mgr.stopWorktreeGc();
    expect(mgr._worktreeGcTimer).toBeNull();
  });

  test('start is idempotent - calling twice does not double-schedule', () => {
    const mgr = makeManager({
      config: { daemon: { worktreeGc: { enabled: true, intervalSec: 60 } } },
    });
    mgr.startWorktreeGc();
    const first = mgr._worktreeGcTimer;
    mgr.startWorktreeGc();
    expect(mgr._worktreeGcTimer).toBe(first);
    mgr.stopWorktreeGc();
  });
});

describe('(9.11) daemon lifecycle wiring - source lock', () => {
  const daemonSrc = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'daemon.js'),
    'utf8'
  );
  test('daemon startup calls startWorktreeGc', () => {
    expect(daemonSrc).toContain('manager.startWorktreeGc()');
  });
  test('daemon SIGINT calls stopWorktreeGc', () => {
    const sigIntBlock = daemonSrc.split("process.on('SIGINT'")[1].split('});')[0];
    expect(sigIntBlock).toContain('manager.stopWorktreeGc()');
  });
  test('daemon SIGTERM calls stopWorktreeGc', () => {
    const sigTermBlock = daemonSrc.split("process.on('SIGTERM'")[1].split('});')[0];
    expect(sigTermBlock).toContain('manager.stopWorktreeGc()');
  });
});

describe('(9.11) config.example.json lock', () => {
  const cfgSrc = fs.readFileSync(
    path.join(__dirname, '..', 'config.example.json'),
    'utf8'
  );
  const cfg = JSON.parse(cfgSrc);
  test('daemon.worktreeGc present with documented defaults', () => {
    expect(cfg.daemon).toBeDefined();
    expect(cfg.daemon.worktreeGc).toBeDefined();
    expect(cfg.daemon.worktreeGc.enabled).toBe(true);
    expect(cfg.daemon.worktreeGc.intervalSec).toBe(3600);
    expect(cfg.daemon.worktreeGc.inactiveHours).toBe(24);
  });
});
