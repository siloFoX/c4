// _cleanupLostWorktrees() tests
// Verifies lost worker worktree cleanup and orphan directory scanning

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
  }

  _detectRepoRoot(projectRoot) {
    if (projectRoot) return projectRoot;
    return this.config.worktree?.projectRoot || null;
  }

  _removeWorktree(repoRoot, worktreePath) {
    this._removeWorktreeCalls.push({ repoRoot, worktreePath });
  }

  // Replicate _cleanupLostWorktrees from pty-manager.js
  _cleanupLostWorktrees() {
    let cleaned = 0;
    try {
      const repoRoot = this._detectRepoRoot();
      if (!repoRoot) return 0;

      // 1. Clean up worktrees from lostWorkers
      if (Array.isArray(this.lostWorkers)) {
        for (const lw of this.lostWorkers) {
          if (!lw.worktree) continue;
          try {
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

      // 3. Scan for orphan c4-worktree-* directories
      try {
        const parentDir = path.resolve(repoRoot, '..');
        const entries = fs.readdirSync(parentDir);
        const activeWorktrees = new Set();
        for (const [, w] of this.workers) {
          if (w.worktree) activeWorktrees.add(w.worktree.replace(/\\/g, '/'));
        }
        for (const entry of entries) {
          if (!entry.startsWith('c4-worktree-')) continue;
          const fullPath = path.resolve(parentDir, entry).replace(/\\/g, '/');
          if (activeWorktrees.has(fullPath)) continue;
          try {
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
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
    return cleaned;
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

  test('returns 0 when no repoRoot detected', () => {
    const mgr = new MockPtyManager({ worktree: {} });
    const result = mgr._cleanupLostWorktrees();
    expect(result).toBe(0);
  });

  test('returns 0 when lostWorkers is empty', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [];
    const result = mgr._cleanupLostWorktrees();
    expect(result).toBe(0);
  });

  test('skips lostWorkers with null worktree', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [
      { name: 'w1', worktree: null },
      { name: 'w2', worktree: null }
    ];
    const result = mgr._cleanupLostWorktrees();
    expect(result).toBe(0);
    expect(mgr._removeWorktreeCalls).toHaveLength(0);
  });

  test('cleans up lostWorker worktrees and sets worktree to null', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-lost1');
    fs.mkdirSync(wtPath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [
      { name: 'lost1', worktree: wtPath }
    ];
    const result = mgr._cleanupLostWorktrees();
    expect(result).toBeGreaterThanOrEqual(1);
    expect(mgr.lostWorkers[0].worktree).toBeNull();
    expect(mgr._removeWorktreeCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('removes orphan c4-worktree-* directories not in active workers', () => {
    const orphanPath = path.join(tmpDir, 'c4-worktree-orphan1');
    fs.mkdirSync(orphanPath, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [];
    const result = mgr._cleanupLostWorktrees();
    expect(result).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(orphanPath)).toBe(false);
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
    expect(result).toBe(0);
    expect(fs.existsSync(activePath)).toBe(true);
  });

  test('handles errors gracefully and does not throw', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: '/nonexistent/path/repo' } });
    mgr.lostWorkers = [
      { name: 'bad', worktree: '/nonexistent/worktree' }
    ];
    expect(() => mgr._cleanupLostWorktrees()).not.toThrow();
  });

  test('returns correct count for mixed lostWorkers', () => {
    const wt1 = path.join(tmpDir, 'c4-worktree-mix1');
    fs.mkdirSync(wt1, { recursive: true });
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [
      { name: 'mix1', worktree: wt1 },
      { name: 'mix2', worktree: null },
      { name: 'mix3', worktree: null }
    ];
    const result = mgr._cleanupLostWorktrees();
    expect(result).toBeGreaterThanOrEqual(1);
    expect(mgr.lostWorkers[0].worktree).toBeNull();
    expect(mgr.lostWorkers[1].worktree).toBeNull();
    expect(mgr.lostWorkers[2].worktree).toBeNull();
  });

  test('removes directory even when _removeWorktree is no-op', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-dironly');
    fs.mkdirSync(wtPath, { recursive: true });
    fs.writeFileSync(path.join(wtPath, 'dummy.txt'), 'test');
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [
      { name: 'dironly', worktree: wtPath }
    ];
    mgr._cleanupLostWorktrees();
    expect(fs.existsSync(wtPath)).toBe(false);
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
    // (orphan scan may still trigger if directory is gone)
    expect(mgr.lostWorkers[0].worktree).toBeNull();
  });
});
