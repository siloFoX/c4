// --cwd and --no-branch worktree behavior tests (5.37)
// Verifies: useBranch===false disables worktree, --cwd uses cwd-based repo detection

'use strict';
require('./jest-shim');

const path = require('path');

// --- Minimal mock of PtyManager ---
class MockPtyManager {
  constructor(config = {}) {
    this.workers = new Map();
    this.config = config;
    this._createWorktreeCalls = [];
    this._writeWorkerSettingsCalls = [];
    this._execSyncCalls = [];
  }

  create(name) {
    const worker = {
      alive: true,
      proc: { write() {} },
      snapshots: []
    };
    this.workers.set(name, worker);
    return { pid: 1234 };
  }

  _detectRepoRoot(projectRoot, cwd) {
    if (projectRoot) return projectRoot;
    const configRoot = this.config.worktree?.projectRoot;
    if (configRoot) return path.resolve(configRoot);
    // Track the cwd used for detection
    this._execSyncCalls.push({ cwd: cwd || null });
    if (cwd) return cwd; // simulate detecting repo root from cwd
    return '/default/c4/repo';
  }

  _worktreePath(repoRoot, name) {
    return path.resolve(repoRoot, '..', `c4-worktree-${name}`);
  }

  _createWorktree(repoRoot, worktreePath, branch) {
    this._createWorktreeCalls.push({ repoRoot, worktreePath, branch });
  }

  _writeWorkerSettings(worktreePath, name, options) {
    this._writeWorkerSettingsCalls.push({ worktreePath, name, options });
  }

  _resolveTarget(targetName) {
    if (targetName === 'local') return { type: 'local', defaultCwd: '' };
    return null;
  }

  _determineEffort() { return 'high'; }
  _chunkedWrite() {}
  _saveState() {}
  _getRulesSummary() { return ''; }

  _buildTaskText(worker, task) {
    const parts = [];
    if (worker.worktree) {
      const cdPath = worker.worktree.replace(/\\/g, '/');
      parts.push(`cd ${cdPath}`);
    }
    parts.push(task);
    return parts.join('\n\n');
  }

  _maybeWriteTaskFile(worker, fullText) { return fullText; }
}

// Replicate _createAndSendTask with 5.37 fixes
MockPtyManager.prototype._createAndSendTask = function(entry) {
  const existing = this.workers.get(entry.name);
  if (existing && existing.alive) {
    return { error: `Worker '${entry.name}' is already alive` };
  }

  const targetResolved = this._resolveTarget(entry.target || 'local');
  const isSshTarget = targetResolved && targetResolved.type === 'ssh';
  // (5.37) --no-branch disables worktree
  const useWorktree = !isSshTarget && entry.useWorktree !== false && entry.useBranch !== false && this.config.worktree?.enabled !== false;
  let worktreePath = null;
  let worktreeRepoRoot = null;
  let worktreeBranch = null;

  if (entry.useBranch !== false && useWorktree) {
    // (5.37) pass cwd to _detectRepoRoot
    const repoRoot = this._detectRepoRoot(entry.projectRoot, entry.cwd);
    if (repoRoot) {
      worktreeBranch = entry.branch || `c4/${entry.name}`;
      worktreePath = this._worktreePath(repoRoot, entry.name);
      worktreeRepoRoot = repoRoot;
      this._createWorktree(repoRoot, worktreePath, worktreeBranch);
      this._writeWorkerSettings(worktreePath, entry.name, {
        branch: worktreeBranch, useWorktree: true
      });
    }
  }

  const createResult = this.create(entry.name);
  if (createResult.error) return createResult;

  const w = this.workers.get(entry.name);
  if (worktreePath) {
    w.worktree = worktreePath;
    w.worktreeRepoRoot = worktreeRepoRoot;
    w.branch = worktreeBranch;
  }

  w._pendingTask = {
    task: entry.task,
    options: {
      branch: entry.branch,
      useBranch: entry.useBranch,
      useWorktree: entry.useWorktree,
      cwd: entry.cwd,
      projectRoot: entry.projectRoot,
    }
  };

  return { pid: 1234, worktree: worktreePath, branch: worktreeBranch };
};

// --- Tests ---

describe('--no-branch disables worktree (5.37)', () => {
  test('useBranch=false skips worktree creation in _createAndSendTask', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: '/repo' } });
    const result = mgr._createAndSendTask({
      name: 'w1',
      task: 'test task',
      target: 'local',
      branch: 'c4/w1',
      useBranch: false,
    });

    expect(result.error).toBeUndefined();
    expect(mgr._createWorktreeCalls).toHaveLength(0);
    expect(mgr._writeWorkerSettingsCalls).toHaveLength(0);
    const w = mgr.workers.get('w1');
    expect(w.worktree).toBeUndefined();
  });

  test('useBranch=true creates worktree normally', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: '/repo' } });
    const result = mgr._createAndSendTask({
      name: 'w2',
      task: 'test task',
      target: 'local',
      branch: 'c4/w2',
      useBranch: true,
    });

    expect(result.error).toBeUndefined();
    expect(mgr._createWorktreeCalls).toHaveLength(1);
    expect(mgr._createWorktreeCalls[0].branch).toBe('c4/w2');
    const w = mgr.workers.get('w2');
    expect(w.worktree).toBeTruthy();
  });

  test('useBranch undefined (default) creates worktree', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: '/repo' } });
    mgr._createAndSendTask({
      name: 'w3',
      task: 'test task',
      target: 'local',
    });

    expect(mgr._createWorktreeCalls).toHaveLength(1);
  });

  test('pendingTask stores cwd in options', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: '/repo' } });
    mgr._createAndSendTask({
      name: 'w4',
      task: 'test task',
      target: 'local',
      useBranch: false,
      cwd: '/other/repo/src',
    });

    const w = mgr.workers.get('w4');
    expect(w._pendingTask.options.cwd).toBe('/other/repo/src');
  });
});

describe('--cwd uses cwd-based repo detection (5.37)', () => {
  test('_detectRepoRoot with cwd param detects from cwd', () => {
    const mgr = new MockPtyManager({});
    const root = mgr._detectRepoRoot(null, '/other/repo/src');

    expect(root).toBe('/other/repo/src');
    expect(mgr._execSyncCalls).toHaveLength(1);
    expect(mgr._execSyncCalls[0].cwd).toBe('/other/repo/src');
  });

  test('_detectRepoRoot with projectRoot ignores cwd', () => {
    const mgr = new MockPtyManager({});
    const root = mgr._detectRepoRoot('/explicit/root', '/other/cwd');

    expect(root).toBe('/explicit/root');
    expect(mgr._execSyncCalls).toHaveLength(0);
  });

  test('_detectRepoRoot with config.worktree.projectRoot ignores cwd', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: '/config/root' } });
    const root = mgr._detectRepoRoot(null, '/other/cwd');

    expect(root).toBe(path.resolve('/config/root'));
    expect(mgr._execSyncCalls).toHaveLength(0);
  });

  test('_detectRepoRoot without cwd falls back to default', () => {
    const mgr = new MockPtyManager({});
    const root = mgr._detectRepoRoot(null);

    expect(root).toBe('/default/c4/repo');
    expect(mgr._execSyncCalls).toHaveLength(1);
    expect(mgr._execSyncCalls[0].cwd).toBeNull();
  });

  test('--cwd creates worktree in external repo', () => {
    const mgr = new MockPtyManager({});
    mgr._createAndSendTask({
      name: 'ext1',
      task: 'work on external repo',
      target: 'local',
      cwd: '/home/user/external-project/src',
    });

    expect(mgr._createWorktreeCalls).toHaveLength(1);
    // repo root detected from cwd
    expect(mgr._createWorktreeCalls[0].repoRoot).toBe('/home/user/external-project/src');
  });

  test('--repo takes precedence over --cwd', () => {
    const mgr = new MockPtyManager({});
    mgr._createAndSendTask({
      name: 'ext2',
      task: 'work with both flags',
      target: 'local',
      projectRoot: '/explicit/repo',
      cwd: '/other/path',
    });

    expect(mgr._createWorktreeCalls).toHaveLength(1);
    expect(mgr._createWorktreeCalls[0].repoRoot).toBe('/explicit/repo');
    // _detectRepoRoot should not have been called with cwd fallback
    expect(mgr._execSyncCalls).toHaveLength(0);
  });
});

describe('--no-branch + --cwd combined', () => {
  test('--no-branch + --cwd: no worktree, cwd stored in pending', () => {
    const mgr = new MockPtyManager({});
    mgr._createAndSendTask({
      name: 'combo1',
      task: 'no-branch with cwd',
      target: 'local',
      useBranch: false,
      cwd: '/other/repo',
    });

    expect(mgr._createWorktreeCalls).toHaveLength(0);
    const w = mgr.workers.get('combo1');
    expect(w.worktree).toBeUndefined();
    expect(w._pendingTask.options.cwd).toBe('/other/repo');
    expect(w._pendingTask.options.useBranch).toBe(false);
  });
});
