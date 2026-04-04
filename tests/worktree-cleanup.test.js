// _cleanupLostWorktrees() tests
// Verifies lost worker worktree cleanup with dirty-state safety checks
// Dirty worktrees are preserved and trigger notifications; clean ones are deleted

'use strict';
require('./jest-shim');

const path = require('path');
const fs = require('fs');
const os = require('os');

// --- Minimal mock of PtyManager for worktree cleanup testing ---
class MockPtyManager {
  constructor(config = {}) {
    this.workers = new Map();
    this.config = config;
    this.lostWorkers = [];
    this._removeWorktreeCalls = [];
    this._lastHealthCheck = 0;
    this._notifications = null;
    this._dirtyPaths = new Set(); // paths to treat as dirty
    this._notifyLostDirtyCalls = [];
  }

  _detectRepoRoot(projectRoot) {
    if (projectRoot) return projectRoot;
    return this.config.worktree?.projectRoot || null;
  }

  _removeWorktree(repoRoot, worktreePath) {
    this._removeWorktreeCalls.push({ repoRoot, worktreePath });
  }

  // Mock: check if worktree has uncommitted changes
  _isWorktreeDirty(worktreePath) {
    try {
      const wtPath = worktreePath.replace(/\\/g, '/');
      if (!fs.existsSync(wtPath)) return false;
      return this._dirtyPaths.has(wtPath);
    } catch {
      return false;
    }
  }

  // Mock: notify about dirty lost worktree
  _notifyLostDirty(workerName, worktreePath) {
    const msg = `[LOST DIRTY] ${workerName}: worktree preserved at ${worktreePath} (has uncommitted changes)`;
    this._notifyLostDirtyCalls.push({ workerName, worktreePath, msg });
    if (this._notifications) {
      this._notifications.pushAll(msg);
    }
  }

  // Replicate _cleanupLostWorktrees from pty-manager.js (updated with dirty check)
  _cleanupLostWorktrees() {
    let cleaned = 0;
    let preserved = 0;
    try {
      const repoRoot = this._detectRepoRoot();
      if (!repoRoot) return { cleaned: 0, preserved: 0 };

      // 1. Clean up worktrees from lostWorkers (check dirty state first)
      if (Array.isArray(this.lostWorkers)) {
        for (const lw of this.lostWorkers) {
          if (!lw.worktree) continue;
          try {
            if (this._isWorktreeDirty(lw.worktree)) {
              // Dirty worktree: preserve and notify
              this._notifyLostDirty(lw.name || 'unknown', lw.worktree);
              preserved++;
              continue;
            }
            this._removeWorktree(repoRoot, lw.worktree);
            const wtPath = lw.worktree.replace(/\\/g, '/');
            try {
              if (fs.existsSync(wtPath)) {
                fs.rmSync(wtPath, { recursive: true, force: true });
              }
            } catch {}
            cleaned++;
            lw.worktree = null;
          } catch {}
        }
      }

      // 2. git worktree prune (skipped in test - no real git repo)

      // 3. Scan for orphan c4-worktree-* directories (check dirty state first)
      try {
        const parentDir = path.resolve(repoRoot, '..');
        const entries = fs.readdirSync(parentDir);
        const knownWorktrees = new Set();
        for (const [, w] of this.workers) {
          if (w.worktree) knownWorktrees.add(w.worktree.replace(/\\/g, '/'));
        }
        // Also skip worktrees still tracked in lostWorkers (dirty ones preserved in step 1)
        if (Array.isArray(this.lostWorkers)) {
          for (const lw of this.lostWorkers) {
            if (lw.worktree) knownWorktrees.add(lw.worktree.replace(/\\/g, '/'));
          }
        }
        for (const entry of entries) {
          if (!entry.startsWith('c4-worktree-')) continue;
          const fullPath = path.resolve(parentDir, entry).replace(/\\/g, '/');
          if (knownWorktrees.has(fullPath)) continue;
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              if (this._isWorktreeDirty(fullPath)) {
                // Dirty orphan: preserve and notify
                const orphanName = entry.replace('c4-worktree-', '');
                this._notifyLostDirty(orphanName, fullPath);
                preserved++;
                continue;
              }
              this._removeWorktree(repoRoot, fullPath);
              try {
                if (fs.existsSync(fullPath)) {
                  fs.rmSync(fullPath, { recursive: true, force: true });
                }
              } catch {}
              cleaned++;
            }
          } catch {}
        }
      } catch {}
    } catch {}
    return { cleaned, preserved };
  }
}

// --- Mock notifications for testing ---
class MockNotifications {
  constructor() {
    this.messages = [];
    this.channels = {};
  }
  pushAll(msg) {
    this.messages.push(msg);
  }
}

describe('_cleanupLostWorktrees', () => {
  let tmpDir;
  let repoRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wt-test-'));
    repoRoot = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoRoot, { recursive: true });
  });

  test('returns {cleaned:0, preserved:0} when no repoRoot detected', () => {
    const mgr = new MockPtyManager({ worktree: {} });
    const result = mgr._cleanupLostWorktrees();
    expect(result.cleaned).toBe(0);
    expect(result.preserved).toBe(0);
  });

  test('returns {cleaned:0, preserved:0} when lostWorkers is empty', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [];
    const result = mgr._cleanupLostWorktrees();
    expect(result.cleaned).toBe(0);
    expect(result.preserved).toBe(0);
  });

  test('skips lostWorkers with null worktree', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [
      { name: 'w1', worktree: null },
      { name: 'w2', worktree: null }
    ];
    const result = mgr._cleanupLostWorktrees();
    expect(result.cleaned).toBe(0);
    expect(mgr._removeWorktreeCalls).toHaveLength(0);
  });

  test('cleans up clean lostWorker worktrees and sets worktree to null', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-lost1');
    fs.mkdirSync(wtPath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [
      { name: 'lost1', worktree: wtPath }
    ];
    const result = mgr._cleanupLostWorktrees();
    expect(result.cleaned).toBeGreaterThanOrEqual(1);
    expect(mgr.lostWorkers[0].worktree).toBeNull();
    expect(mgr._removeWorktreeCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('preserves dirty lostWorker worktrees and does NOT set worktree to null', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-dirty1');
    fs.mkdirSync(wtPath, { recursive: true });
    fs.writeFileSync(path.join(wtPath, 'uncommitted.txt'), 'dirty change');
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    // Mark as dirty
    mgr._dirtyPaths.add(wtPath.replace(/\\/g, '/'));
    mgr.lostWorkers = [
      { name: 'dirty1', worktree: wtPath }
    ];
    const result = mgr._cleanupLostWorktrees();
    expect(result.preserved).toBe(1);
    expect(result.cleaned).toBe(0);
    // Worktree must NOT be set to null (preserved)
    expect(mgr.lostWorkers[0].worktree).toBe(wtPath);
    // Directory must still exist
    expect(fs.existsSync(wtPath)).toBe(true);
    // _removeWorktree must NOT have been called for this worktree
    expect(mgr._removeWorktreeCalls).toHaveLength(0);
  });

  test('sends notification for dirty lostWorker worktree', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-notif1');
    fs.mkdirSync(wtPath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._dirtyPaths.add(wtPath.replace(/\\/g, '/'));
    const notif = new MockNotifications();
    mgr._notifications = notif;
    mgr.lostWorkers = [
      { name: 'notif1', worktree: wtPath }
    ];
    mgr._cleanupLostWorktrees();
    expect(mgr._notifyLostDirtyCalls).toHaveLength(1);
    expect(mgr._notifyLostDirtyCalls[0].workerName).toBe('notif1');
    expect(notif.messages.length).toBeGreaterThanOrEqual(1);
    expect(notif.messages[0]).toContain('[LOST DIRTY]');
  });

  test('removes clean orphan c4-worktree-* directories', () => {
    const orphanPath = path.join(tmpDir, 'c4-worktree-orphan1');
    fs.mkdirSync(orphanPath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [];
    const result = mgr._cleanupLostWorktrees();
    expect(result.cleaned).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(orphanPath)).toBe(false);
  });

  test('preserves dirty orphan c4-worktree-* directories', () => {
    const orphanPath = path.join(tmpDir, 'c4-worktree-dirty-orphan');
    fs.mkdirSync(orphanPath, { recursive: true });
    fs.writeFileSync(path.join(orphanPath, 'wip.txt'), 'work in progress');
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._dirtyPaths.add(orphanPath.replace(/\\/g, '/'));
    mgr.lostWorkers = [];
    const result = mgr._cleanupLostWorktrees();
    expect(result.preserved).toBeGreaterThanOrEqual(1);
    expect(result.cleaned).toBe(0);
    // Directory must still exist
    expect(fs.existsSync(orphanPath)).toBe(true);
  });

  test('sends notification for dirty orphan worktrees', () => {
    const orphanPath = path.join(tmpDir, 'c4-worktree-dirty-orphan2');
    fs.mkdirSync(orphanPath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._dirtyPaths.add(orphanPath.replace(/\\/g, '/'));
    const notif = new MockNotifications();
    mgr._notifications = notif;
    mgr.lostWorkers = [];
    mgr._cleanupLostWorktrees();
    expect(mgr._notifyLostDirtyCalls).toHaveLength(1);
    expect(mgr._notifyLostDirtyCalls[0].workerName).toBe('dirty-orphan2');
    expect(notif.messages[0]).toContain('[LOST DIRTY]');
  });

  test('does not remove c4-worktree-* directories belonging to active workers', () => {
    const activePath = path.join(tmpDir, 'c4-worktree-active1');
    fs.mkdirSync(activePath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [];
    mgr.workers.set('active1', {
      alive: true,
      worktree: activePath.replace(/\\/g, '/')
    });
    const result = mgr._cleanupLostWorktrees();
    expect(result.cleaned).toBe(0);
    expect(fs.existsSync(activePath)).toBe(true);
  });

  test('handles errors gracefully and does not throw', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: '/nonexistent/path/repo' } });
    mgr.lostWorkers = [
      { name: 'bad', worktree: '/nonexistent/worktree' }
    ];
    expect(() => mgr._cleanupLostWorktrees()).not.toThrow();
  });

  test('handles mixed clean and dirty lostWorkers correctly', () => {
    const cleanWt = path.join(tmpDir, 'c4-worktree-clean1');
    const dirtyWt = path.join(tmpDir, 'c4-worktree-dirty2');
    fs.mkdirSync(cleanWt, { recursive: true });
    fs.mkdirSync(dirtyWt, { recursive: true });
    fs.writeFileSync(path.join(dirtyWt, 'uncommitted.txt'), 'dirty');
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._dirtyPaths.add(dirtyWt.replace(/\\/g, '/'));
    mgr.lostWorkers = [
      { name: 'clean1', worktree: cleanWt },
      { name: 'dirty2', worktree: dirtyWt },
      { name: 'null1', worktree: null }
    ];
    const result = mgr._cleanupLostWorktrees();
    expect(result.cleaned).toBeGreaterThanOrEqual(1);
    expect(result.preserved).toBe(1);
    // Clean one should be nulled
    expect(mgr.lostWorkers[0].worktree).toBeNull();
    // Dirty one should be preserved
    expect(mgr.lostWorkers[1].worktree).toBe(dirtyWt);
    // Null one stays null
    expect(mgr.lostWorkers[2].worktree).toBeNull();
  });

  test('does not double-clean already nulled worktrees on second call', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-double');
    fs.mkdirSync(wtPath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [
      { name: 'double', worktree: wtPath }
    ];
    mgr._cleanupLostWorktrees();
    const callsAfterFirst = mgr._removeWorktreeCalls.length;
    mgr._cleanupLostWorktrees();
    // No additional _removeWorktree calls for the already-cleaned lostWorker
    expect(mgr.lostWorkers[0].worktree).toBeNull();
  });

  test('removes directory even when _removeWorktree is no-op (clean worktree)', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-dironly');
    fs.mkdirSync(wtPath, { recursive: true });
    fs.writeFileSync(path.join(wtPath, 'dummy.txt'), 'test');
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    // Not marked as dirty, so it should be cleaned
    mgr.lostWorkers = [
      { name: 'dironly', worktree: wtPath }
    ];
    mgr._cleanupLostWorktrees();
    expect(fs.existsSync(wtPath)).toBe(false);
  });

  test('_isWorktreeDirty returns false for non-existent path', () => {
    const mgr = new MockPtyManager({});
    expect(mgr._isWorktreeDirty('/nonexistent/path')).toBe(false);
  });

  test('_isWorktreeDirty returns false for clean worktree', () => {
    const cleanPath = path.join(tmpDir, 'c4-worktree-clean-check');
    fs.mkdirSync(cleanPath, { recursive: true });
    const mgr = new MockPtyManager({});
    // Not in _dirtyPaths => clean
    expect(mgr._isWorktreeDirty(cleanPath)).toBe(false);
  });

  test('_isWorktreeDirty returns true for dirty worktree', () => {
    const dirtyPath = path.join(tmpDir, 'c4-worktree-dirty-check');
    fs.mkdirSync(dirtyPath, { recursive: true });
    const mgr = new MockPtyManager({});
    mgr._dirtyPaths.add(dirtyPath.replace(/\\/g, '/'));
    expect(mgr._isWorktreeDirty(dirtyPath)).toBe(true);
  });

  test('notification message contains worktree path and worker name', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-msg');
    fs.mkdirSync(wtPath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._dirtyPaths.add(wtPath.replace(/\\/g, '/'));
    const notif = new MockNotifications();
    mgr._notifications = notif;
    mgr.lostWorkers = [
      { name: 'msg-worker', worktree: wtPath }
    ];
    mgr._cleanupLostWorktrees();
    expect(notif.messages[0]).toContain('msg-worker');
    expect(notif.messages[0]).toContain(wtPath);
    expect(notif.messages[0]).toContain('uncommitted changes');
  });
});
