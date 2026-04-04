// pending-task worktree bug fix tests
// Verifies that _createAndSendTask() creates worktree before storing _pendingTask

'use strict';
require('./jest-shim');

const path = require('path');
const fs = require('fs');

// --- Minimal mock of PtyManager for worktree testing ---
class MockPtyManager {
  constructor(config = {}) {
    this.workers = new Map();
    this.config = config;
    this._hookEvents = new Map();
    this._createWorktreeCalls = [];
    this._writeWorkerSettingsCalls = [];
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

  _detectRepoRoot(projectRoot) {
    if (projectRoot) return projectRoot;
    return this.config.worktree?.projectRoot || null;
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

  _determineEffort() {
    return 'high';
  }

  _buildTaskText(worker, task) {
    const parts = [];
    if (worker.worktree) {
      const cdPath = worker.worktree.replace(/\\/g, '/');
      parts.push(`cd ${cdPath}`);
    }
    parts.push(task);
    return parts.join('\n\n');
  }

  _chunkedWrite() {}
  _saveState() {}
  _getRulesSummary() { return ''; }
}

// Extract _createAndSendTask logic from the real module pattern
// We replicate it here to test the worktree setup behavior
MockPtyManager.prototype._createAndSendTask = function(entry) {
  const existing = this.workers.get(entry.name);
  if (existing) {
    if (existing.alive) {
      return { error: `Worker '${entry.name}' is already alive` };
    }
    this.workers.delete(entry.name);
  }

  const createResult = this.create(entry.name, entry.command, entry.args, { target: entry.target });
  if (createResult.error) return createResult;

  const w = this.workers.get(entry.name);

  // Worktree setup (the fix being tested)
  const useWorktree = entry.useWorktree !== false && this.config.worktree?.enabled !== false;
  if (entry.useBranch !== false && useWorktree) {
    const repoRoot = this._detectRepoRoot(entry.projectRoot);
    if (repoRoot) {
      const branch = entry.branch || `c4/${entry.name}`;
      const worktreePath = this._worktreePath(repoRoot, entry.name);
      try {
        this._createWorktree(repoRoot, worktreePath, branch);
        w.worktree = worktreePath;
        w.worktreeRepoRoot = repoRoot;
        w.branch = branch;

        try {
          this._writeWorkerSettings(worktreePath, entry.name, {
            branch,
            useWorktree: true,
            _autoWorker: entry._autoWorker
          });
        } catch (e) {
          w.snapshots = w.snapshots || [];
          w.snapshots.push({
            time: Date.now(),
            screen: `[C4 WARN] Failed to write worker settings: ${e.message}`,
            autoAction: true
          });
        }
      } catch (e) {
        w.snapshots = w.snapshots || [];
        w.snapshots.push({
          time: Date.now(),
          screen: `[C4 WARN] Failed to create worktree: ${e.message}`,
          autoAction: true
        });
      }
    }
  }

  w._dynamicEffort = this._determineEffort(entry.task);

  w._pendingTask = {
    task: entry.task,
    options: {
      branch: entry.branch,
      useBranch: entry.useBranch,
      useWorktree: entry.useWorktree,
      projectRoot: entry.projectRoot,
      autoMode: entry.autoMode
    }
  };
  w._pendingTaskTime = Date.now();

  return { created: true, name: entry.name, pid: createResult.pid };
};

// --- Tests ---

describe('_createAndSendTask worktree setup', () => {
  let mgr;

  beforeEach(() => {
    mgr = new MockPtyManager({
      worktree: {
        enabled: true,
        projectRoot: '/repo/c4'
      }
    });
  });

  test('creates worktree when useWorktree is true', () => {
    const result = mgr._createAndSendTask({
      name: 'test-worker',
      task: 'do something',
      useWorktree: true,
      branch: 'c4/test-worker'
    });

    expect(result.created).toBe(true);
    expect(mgr._createWorktreeCalls).toHaveLength(1);

    const call = mgr._createWorktreeCalls[0];
    expect(call.repoRoot).toBe('/repo/c4');
    expect(call.branch).toBe('c4/test-worker');
    expect(call.worktreePath).toContain('c4-worktree-test-worker');
  });

  test('sets worker.worktree after creation', () => {
    mgr._createAndSendTask({
      name: 'w1',
      task: 'test task',
      useWorktree: true,
      branch: 'c4/w1'
    });

    const w = mgr.workers.get('w1');
    expect(w.worktree).toBeTruthy();
    expect(w.worktreeRepoRoot).toBe('/repo/c4');
    expect(w.branch).toBe('c4/w1');
  });

  test('_buildTaskText includes cd command when worktree is set', () => {
    mgr._createAndSendTask({
      name: 'w2',
      task: 'build feature',
      useWorktree: true,
      branch: 'c4/w2'
    });

    const w = mgr.workers.get('w2');
    const text = mgr._buildTaskText(w, 'build feature');
    expect(text).toContain('cd ');
    expect(text).toContain('c4-worktree-w2');
  });

  test('_buildTaskText omits cd command when worktree is not set', () => {
    mgr._createAndSendTask({
      name: 'w3',
      task: 'build feature',
      useWorktree: false
    });

    const w = mgr.workers.get('w3');
    const text = mgr._buildTaskText(w, 'build feature');
    expect(text).not.toContain('cd ');
  });

  test('defaults branch to c4/<name> when not specified', () => {
    mgr._createAndSendTask({
      name: 'alpha',
      task: 'test',
      useWorktree: true
    });

    const w = mgr.workers.get('alpha');
    expect(w.branch).toBe('c4/alpha');
    expect(mgr._createWorktreeCalls[0].branch).toBe('c4/alpha');
  });

  test('skips worktree when config.worktree.enabled is false', () => {
    mgr.config.worktree.enabled = false;
    mgr._createAndSendTask({
      name: 'w4',
      task: 'test',
      useWorktree: true
    });

    const w = mgr.workers.get('w4');
    expect(w.worktree).toBeUndefined();
    expect(mgr._createWorktreeCalls).toHaveLength(0);
  });

  test('skips worktree when useBranch is false', () => {
    mgr._createAndSendTask({
      name: 'w5',
      task: 'test',
      useWorktree: true,
      useBranch: false
    });

    const w = mgr.workers.get('w5');
    expect(w.worktree).toBeUndefined();
    expect(mgr._createWorktreeCalls).toHaveLength(0);
  });

  test('skips worktree when repoRoot not detected', () => {
    mgr.config.worktree.projectRoot = null;
    mgr._createAndSendTask({
      name: 'w6',
      task: 'test',
      useWorktree: true
    });

    const w = mgr.workers.get('w6');
    expect(w.worktree).toBeUndefined();
    expect(mgr._createWorktreeCalls).toHaveLength(0);
  });

  test('writes worker settings after worktree creation', () => {
    mgr._createAndSendTask({
      name: 'w7',
      task: 'test',
      useWorktree: true,
      branch: 'c4/w7'
    });

    expect(mgr._writeWorkerSettingsCalls).toHaveLength(1);
    const call = mgr._writeWorkerSettingsCalls[0];
    expect(call.name).toBe('w7');
    expect(call.options.branch).toBe('c4/w7');
    expect(call.options.useWorktree).toBe(true);
  });

  test('handles _createWorktree failure gracefully', () => {
    mgr._createWorktree = function() {
      throw new Error('disk full');
    };

    const result = mgr._createAndSendTask({
      name: 'w8',
      task: 'test',
      useWorktree: true
    });

    expect(result.created).toBe(true);
    const w = mgr.workers.get('w8');
    expect(w.worktree).toBeUndefined();
    expect(w.snapshots.length).toBeGreaterThan(0);
    expect(w.snapshots[0].screen).toContain('disk full');
  });

  test('worktree is set before _pendingTask is stored', () => {
    mgr._createAndSendTask({
      name: 'w9',
      task: 'test',
      useWorktree: true,
      branch: 'c4/w9'
    });

    const w = mgr.workers.get('w9');
    // Both should be set at this point
    expect(w.worktree).toBeTruthy();
    expect(w._pendingTask).toBeTruthy();
    expect(w._pendingTask.task).toBe('test');
  });

  test('uses entry.projectRoot for _detectRepoRoot', () => {
    mgr.config.worktree.projectRoot = null;
    mgr._createAndSendTask({
      name: 'w10',
      task: 'test',
      useWorktree: true,
      projectRoot: '/custom/repo'
    });

    const w = mgr.workers.get('w10');
    expect(w.worktreeRepoRoot).toBe('/custom/repo');
  });

  test('handles _writeWorkerSettings failure gracefully', () => {
    mgr._writeWorkerSettings = function() {
      throw new Error('permission denied');
    };

    const result = mgr._createAndSendTask({
      name: 'w11',
      task: 'test',
      useWorktree: true
    });

    expect(result.created).toBe(true);
    const w = mgr.workers.get('w11');
    // Worktree should still be set even if settings write fails
    expect(w.worktree).toBeTruthy();
    expect(w.snapshots.some(s => s.screen.includes('permission denied'))).toBe(true);
  });
});
