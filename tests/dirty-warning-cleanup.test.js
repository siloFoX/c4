// Tests for dirty worktree Slack warning (5.15) and cleanup command (5.33)
'use strict';
require('./jest-shim');

const path = require('path');
const fs = require('fs');
const os = require('os');

// --- Mock PtyManager for testing ---
class MockPtyManager {
  constructor(config = {}) {
    this.workers = new Map();
    this.config = config;
    this._notifications = null;
    this._removeWorktreeCalls = [];
    this._dirtyPaths = new Set();
    this._savedState = false;
  }

  _detectRepoRoot() {
    return this.config.worktree?.projectRoot || null;
  }

  _removeWorktree(repoRoot, worktreePath) {
    this._removeWorktreeCalls.push({ repoRoot, worktreePath });
  }

  _isWorktreeDirty(worktreePath) {
    return this._dirtyPaths.has(worktreePath.replace(/\\/g, '/'));
  }

  _saveState() {
    this._savedState = true;
  }

  // Replicate healthCheck dirty worktree detection (5.15)
  _healthCheckDirtyWarning() {
    if (this._notifications) {
      for (const [name, w] of this.workers) {
        if (!w.alive || !w.worktree) continue;
        if (this._isWorktreeDirty(w.worktree)) {
          if (!w._dirtyNotified) {
            w._dirtyNotified = true;
            this._notifications.pushAll(`[DIRTY] ${name}: worktree has uncommitted changes`);
          }
        } else {
          w._dirtyNotified = false;
        }
      }
    }
  }

  // Replicate cleanup() method (5.33)
  cleanup(dryRun = false) {
    const repoRoot = this._detectRepoRoot();
    const results = { branches: [], worktrees: [], directories: [] };

    for (const [name, w] of this.workers) {
      if (w.alive) continue;

      if (w.branch && w.branch.startsWith('c4/')) {
        results.branches.push(w.branch);
      }

      if (w.worktree && fs.existsSync(w.worktree)) {
        results.worktrees.push(w.worktree);
        if (!dryRun && repoRoot) {
          this._removeWorktree(repoRoot, w.worktree);
        }
      }

      if (!dryRun) {
        if (w.rawLogStream && !w.rawLogStream.destroyed) w.rawLogStream.end();
        this.workers.delete(name);
      }
    }

    if (repoRoot) {
      const parentDir = path.dirname(repoRoot);
      try {
        const entries = fs.readdirSync(parentDir);
        for (const entry of entries) {
          if (!entry.startsWith('c4-worktree-')) continue;
          const fullPath = path.join(parentDir, entry);
          let inUse = false;
          for (const [, w] of this.workers) {
            if (w.worktree && path.resolve(w.worktree) === path.resolve(fullPath) && w.alive) {
              inUse = true; break;
            }
          }
          if (!inUse) {
            results.directories.push(fullPath);
            if (!dryRun) {
              try { fs.rmSync(fullPath, { recursive: true, force: true }); } catch {}
            }
          }
        }
      } catch {}
    }

    if (!dryRun) this._saveState();
    return { dryRun, ...results };
  }
}

class MockNotifications {
  constructor() { this.messages = []; }
  pushAll(msg) { this.messages.push(msg); }
}

// --- 5.15 Tests: Dirty worktree Slack warning ---
describe('5.15 Dirty worktree Slack warning', () => {
  let mgr, notif;

  beforeEach(() => {
    mgr = new MockPtyManager({ worktree: { projectRoot: '/repo' } });
    notif = new MockNotifications();
    mgr._notifications = notif;
  });

  test('sends notification for alive worker with dirty worktree', () => {
    mgr._dirtyPaths.add('/wt/dirty');
    mgr.workers.set('w1', { alive: true, worktree: '/wt/dirty' });
    mgr._healthCheckDirtyWarning();
    expect(notif.messages).toHaveLength(1);
    expect(notif.messages[0]).toContain('[DIRTY]');
    expect(notif.messages[0]).toContain('w1');
  });

  test('does not re-notify after first notification', () => {
    mgr._dirtyPaths.add('/wt/dirty');
    mgr.workers.set('w1', { alive: true, worktree: '/wt/dirty' });
    mgr._healthCheckDirtyWarning();
    mgr._healthCheckDirtyWarning();
    expect(notif.messages).toHaveLength(1);
  });

  test('resets notification flag when worktree becomes clean', () => {
    mgr._dirtyPaths.add('/wt/dirty');
    mgr.workers.set('w1', { alive: true, worktree: '/wt/dirty' });
    mgr._healthCheckDirtyWarning();
    expect(notif.messages).toHaveLength(1);

    // Worktree becomes clean
    mgr._dirtyPaths.delete('/wt/dirty');
    mgr._healthCheckDirtyWarning();
    const w = mgr.workers.get('w1');
    expect(w._dirtyNotified).toBe(false);

    // Dirty again: should re-notify
    mgr._dirtyPaths.add('/wt/dirty');
    mgr._healthCheckDirtyWarning();
    expect(notif.messages).toHaveLength(2);
  });

  test('skips dead workers', () => {
    mgr._dirtyPaths.add('/wt/dirty');
    mgr.workers.set('w1', { alive: false, worktree: '/wt/dirty' });
    mgr._healthCheckDirtyWarning();
    expect(notif.messages).toHaveLength(0);
  });

  test('skips workers without worktree', () => {
    mgr.workers.set('w1', { alive: true, worktree: null });
    mgr._healthCheckDirtyWarning();
    expect(notif.messages).toHaveLength(0);
  });

  test('does nothing when notifications disabled', () => {
    mgr._notifications = null;
    mgr._dirtyPaths.add('/wt/dirty');
    mgr.workers.set('w1', { alive: true, worktree: '/wt/dirty' });
    mgr._healthCheckDirtyWarning();
    // No crash, no messages
  });
});

// --- 5.33 Tests: cleanup command ---
describe('5.33 cleanup command', () => {
  let tmpDir, repoRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-cleanup-'));
    repoRoot = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoRoot, { recursive: true });
  });

  test('dry-run does not delete anything', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('w1', { alive: false, branch: 'c4/test', worktree: null });

    const result = mgr.cleanup(true);
    expect(result.dryRun).toBe(true);
    expect(result.branches).toContain('c4/test');
    expect(mgr.workers.has('w1')).toBe(true); // Not deleted
    expect(mgr._savedState).toBe(false);
  });

  test('removes dead workers from map on cleanup', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('w1', { alive: false, branch: 'c4/test', worktree: null });
    mgr.workers.set('w2', { alive: true, branch: 'c4/live', worktree: null });

    const result = mgr.cleanup(false);
    expect(mgr.workers.has('w1')).toBe(false);
    expect(mgr.workers.has('w2')).toBe(true);
    expect(result.branches).toContain('c4/test');
    expect(mgr._savedState).toBe(true);
  });

  test('collects worktree paths for dead workers', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-w1');
    fs.mkdirSync(wtPath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('w1', { alive: false, branch: 'c4/w1', worktree: wtPath });

    const result = mgr.cleanup(false);
    expect(result.worktrees).toContain(wtPath);
    expect(mgr._removeWorktreeCalls).toHaveLength(1);
  });

  test('finds orphan c4-worktree-* directories', () => {
    const orphan = path.join(tmpDir, 'c4-worktree-orphan');
    fs.mkdirSync(orphan, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });

    const result = mgr.cleanup(false);
    expect(result.directories.length).toBeGreaterThanOrEqual(1);
    const found = result.directories.some(d => d.includes('c4-worktree-orphan'));
    expect(found).toBe(true);
  });

  test('skips active worker worktrees from orphan scan', () => {
    const activeWt = path.join(tmpDir, 'c4-worktree-active');
    fs.mkdirSync(activeWt, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('active', { alive: true, worktree: activeWt });

    const result = mgr.cleanup(false);
    const found = result.directories.some(d => d.includes('c4-worktree-active'));
    expect(found).toBe(false);
  });

  test('ignores non-c4 branches', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('w1', { alive: false, branch: 'feature/xyz', worktree: null });

    const result = mgr.cleanup(false);
    expect(result.branches).toHaveLength(0);
  });

  test('ends rawLogStream on cleanup', () => {
    let ended = false;
    const stream = { destroyed: false, end() { ended = true; } };
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('w1', { alive: false, branch: 'c4/test', worktree: null, rawLogStream: stream });

    mgr.cleanup(false);
    expect(ended).toBe(true);
  });
});
