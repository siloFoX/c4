// (5.41) worktree close verification + orphan cleanup by git worktree list
// Tests for _removeWorktree fs.existsSync fallback, close() post-cleanup verification,
// and _cleanupOrphanWorktreesByList healthCheck enhancement.

'use strict';
require('./jest-shim');

const path = require('path');
const fs = require('fs');
const os = require('os');

// --- Minimal mock of PtyManager for worktree verify testing ---
class MockPtyManager {
  constructor(config = {}) {
    this.workers = new Map();
    this.config = config;
    this.lostWorkers = [];
    this._notifications = null;
    this._notifyLostDirtyCalls = [];
    this._dirtyPaths = new Set();
    // Track calls
    this._removeWorktreeCalls = [];
    this._rmSyncCalls = [];
    this._pruneCalls = 0;
    this._gitWorktreeListOutput = ''; // mock output for git worktree list --porcelain
  }

  _detectRepoRoot() {
    return this.config.worktree?.projectRoot || null;
  }

  _isWorktreeDirty(worktreePath) {
    const wtPath = worktreePath.replace(/\\/g, '/');
    if (!fs.existsSync(wtPath)) return false;
    return this._dirtyPaths.has(wtPath);
  }

  _notifyLostDirty(workerName, worktreePath) {
    const msg = `[LOST DIRTY] ${workerName}: worktree preserved at ${worktreePath} (has uncommitted changes)`;
    this._notifyLostDirtyCalls.push({ workerName, worktreePath, msg });
    if (this._notifications) {
      this._notifications.pushAll(msg);
    }
  }

  // Replicate _removeWorktree with (5.41) fs.existsSync fallback
  _removeWorktree(repoRoot, worktreePath) {
    const gitPath = worktreePath.replace(/\\/g, '/');
    this._removeWorktreeCalls.push({ repoRoot, worktreePath: gitPath });
    // Simulate: git worktree remove (may or may not delete dir)
    // In test we control whether dir exists after this call

    // (5.41) Verify directory actually removed; fs.rmSync fallback + prune
    if (fs.existsSync(gitPath)) {
      try {
        fs.rmSync(gitPath, { recursive: true, force: true });
        this._rmSyncCalls.push(gitPath);
      } catch {}
      this._pruneCalls++;
    }
  }

  // Replicate close() worktree cleanup with (5.41) verification
  close(name) {
    const w = this.workers.get(name);
    if (!w) return { error: `Worker '${name}' not found` };

    // Cleanup worktree
    if (w.worktree) {
      const repoRoot = w.worktreeRepoRoot || this._detectRepoRoot();
      if (repoRoot) {
        this._removeWorktree(repoRoot, w.worktree);
      }
    }

    this.workers.delete(name);
    return { success: true, name };
  }

  // Replicate _cleanupOrphanWorktreesByList from pty-manager.js (5.41)
  _cleanupOrphanWorktreesByList() {
    let cleaned = 0;
    let preserved = 0;
    try {
      const repoRoot = this._detectRepoRoot();
      if (!repoRoot) return { cleaned: 0, preserved: 0 };

      // Parse mock porcelain output
      const gitWorktrees = [];
      for (const line of this._gitWorktreeListOutput.split('\n')) {
        if (line.startsWith('worktree ')) {
          gitWorktrees.push(line.slice('worktree '.length).trim().replace(/\\/g, '/'));
        }
      }

      // Build set of known worktree paths
      const knownWorktrees = new Set();
      for (const [, w] of this.workers) {
        if (w.worktree) knownWorktrees.add(w.worktree.replace(/\\/g, '/'));
      }
      if (Array.isArray(this.lostWorkers)) {
        for (const lw of this.lostWorkers) {
          if (lw.worktree) knownWorktrees.add(lw.worktree.replace(/\\/g, '/'));
        }
      }

      // Find orphan c4-worktree-* entries
      for (const wtPath of gitWorktrees) {
        const basename = path.basename(wtPath);
        if (!basename.startsWith('c4-worktree-')) continue;
        if (knownWorktrees.has(wtPath)) continue;

        if (fs.existsSync(wtPath) && this._isWorktreeDirty(wtPath)) {
          const orphanName = basename.replace('c4-worktree-', '');
          this._notifyLostDirty(orphanName, wtPath);
          preserved++;
          continue;
        }

        this._removeWorktree(repoRoot, wtPath);
        cleaned++;
      }
    } catch {}
    return { cleaned, preserved };
  }
}

class MockNotifications {
  constructor() { this.messages = []; }
  pushAll(msg) { this.messages.push(msg); }
}

// === Tests ===

describe('_removeWorktree fs.existsSync fallback (5.41)', () => {
  let tmpDir;
  let repoRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wt-verify-'));
    repoRoot = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoRoot, { recursive: true });
  });

  test('removes directory via fs.rmSync when git worktree remove leaves it behind', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-leftover');
    fs.mkdirSync(wtPath, { recursive: true });
    fs.writeFileSync(path.join(wtPath, 'file.txt'), 'data');

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._removeWorktree(repoRoot, wtPath);

    // Directory should be gone after fallback
    expect(fs.existsSync(wtPath)).toBe(false);
    expect(mgr._rmSyncCalls.length).toBeGreaterThanOrEqual(1);
  });

  test('runs git worktree prune after fs.rmSync fallback', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-prune');
    fs.mkdirSync(wtPath, { recursive: true });

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._removeWorktree(repoRoot, wtPath);

    expect(mgr._pruneCalls).toBeGreaterThanOrEqual(1);
  });

  test('does not call fs.rmSync when directory already removed', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-already-gone');
    // Directory does NOT exist

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._removeWorktree(repoRoot, wtPath);

    expect(mgr._rmSyncCalls).toHaveLength(0);
    expect(mgr._pruneCalls).toBe(0);
  });
});

describe('close() worktree verification (5.41)', () => {
  let tmpDir;
  let repoRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wt-close-'));
    repoRoot = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoRoot, { recursive: true });
  });

  test('close removes worktree directory completely', () => {
    const wtPath = path.join(tmpDir, 'c4-worktree-w1');
    fs.mkdirSync(wtPath, { recursive: true });
    fs.writeFileSync(path.join(wtPath, 'code.js'), 'console.log("hello")');

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('w1', {
      alive: false,
      worktree: wtPath,
      worktreeRepoRoot: repoRoot,
      proc: { kill() {} }
    });

    const result = mgr.close('w1');
    expect(result.success).toBe(true);
    expect(fs.existsSync(wtPath)).toBe(false);
  });

  test('close returns error for non-existent worker', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    const result = mgr.close('nonexistent');
    expect(result.error).toContain('not found');
  });

  test('close handles worker without worktree', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('no-wt', { alive: false, worktree: null });

    const result = mgr.close('no-wt');
    expect(result.success).toBe(true);
    expect(mgr._removeWorktreeCalls).toHaveLength(0);
  });
});

describe('_cleanupOrphanWorktreesByList (5.41)', () => {
  let tmpDir;
  let repoRoot;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4-wt-orphan-'));
    repoRoot = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoRoot, { recursive: true });
  });

  test('returns {cleaned:0, preserved:0} when no repoRoot', () => {
    const mgr = new MockPtyManager({});
    const result = mgr._cleanupOrphanWorktreesByList();
    expect(result.cleaned).toBe(0);
    expect(result.preserved).toBe(0);
  });

  test('returns {cleaned:0, preserved:0} when git worktree list is empty', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._gitWorktreeListOutput = '';
    const result = mgr._cleanupOrphanWorktreesByList();
    expect(result.cleaned).toBe(0);
    expect(result.preserved).toBe(0);
  });

  test('cleans orphan c4-worktree-* found in git worktree list but not in workers', () => {
    const orphanPath = path.join(tmpDir, 'c4-worktree-orphan1').replace(/\\/g, '/');
    fs.mkdirSync(orphanPath, { recursive: true });

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._gitWorktreeListOutput = [
      `worktree ${repoRoot.replace(/\\/g, '/')}`,
      'HEAD abc123',
      'branch refs/heads/main',
      '',
      `worktree ${orphanPath}`,
      'HEAD def456',
      'branch refs/heads/c4/orphan1',
      ''
    ].join('\n');

    const result = mgr._cleanupOrphanWorktreesByList();
    expect(result.cleaned).toBe(1);
    expect(result.preserved).toBe(0);
    expect(fs.existsSync(orphanPath)).toBe(false);
  });

  test('preserves dirty orphan and sends notification', () => {
    const dirtyPath = path.join(tmpDir, 'c4-worktree-dirty-orphan').replace(/\\/g, '/');
    fs.mkdirSync(dirtyPath, { recursive: true });
    fs.writeFileSync(path.join(dirtyPath, 'wip.txt'), 'uncommitted');

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._dirtyPaths.add(dirtyPath);
    const notif = new MockNotifications();
    mgr._notifications = notif;

    mgr._gitWorktreeListOutput = `worktree ${dirtyPath}\nHEAD abc\nbranch refs/heads/c4/x\n`;

    const result = mgr._cleanupOrphanWorktreesByList();
    expect(result.preserved).toBe(1);
    expect(result.cleaned).toBe(0);
    expect(fs.existsSync(dirtyPath)).toBe(true);
    expect(mgr._notifyLostDirtyCalls).toHaveLength(1);
    expect(notif.messages[0]).toContain('[LOST DIRTY]');
  });

  test('skips non-c4-worktree entries from git worktree list', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._gitWorktreeListOutput = [
      `worktree ${repoRoot.replace(/\\/g, '/')}`,
      'HEAD abc',
      'branch refs/heads/main',
      '',
      `worktree /some/other/worktree`,
      'HEAD def',
      'branch refs/heads/feature',
      ''
    ].join('\n');

    const result = mgr._cleanupOrphanWorktreesByList();
    expect(result.cleaned).toBe(0);
    expect(result.preserved).toBe(0);
  });

  test('skips c4-worktree entries that belong to active workers', () => {
    const activePath = path.join(tmpDir, 'c4-worktree-active').replace(/\\/g, '/');
    fs.mkdirSync(activePath, { recursive: true });

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('active', { alive: true, worktree: activePath });

    mgr._gitWorktreeListOutput = `worktree ${activePath}\nHEAD abc\nbranch refs/heads/c4/active\n`;

    const result = mgr._cleanupOrphanWorktreesByList();
    expect(result.cleaned).toBe(0);
    expect(fs.existsSync(activePath)).toBe(true);
  });

  test('skips c4-worktree entries that belong to lostWorkers', () => {
    const lostPath = path.join(tmpDir, 'c4-worktree-lost').replace(/\\/g, '/');
    fs.mkdirSync(lostPath, { recursive: true });

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.lostWorkers = [{ name: 'lost', worktree: lostPath }];

    mgr._gitWorktreeListOutput = `worktree ${lostPath}\nHEAD abc\nbranch refs/heads/c4/lost\n`;

    const result = mgr._cleanupOrphanWorktreesByList();
    expect(result.cleaned).toBe(0);
    expect(fs.existsSync(lostPath)).toBe(true);
  });

  test('handles mixed orphan and active worktrees', () => {
    const activePath = path.join(tmpDir, 'c4-worktree-active2').replace(/\\/g, '/');
    const orphanPath = path.join(tmpDir, 'c4-worktree-orphan2').replace(/\\/g, '/');
    fs.mkdirSync(activePath, { recursive: true });
    fs.mkdirSync(orphanPath, { recursive: true });

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr.workers.set('active2', { alive: true, worktree: activePath });

    mgr._gitWorktreeListOutput = [
      `worktree ${activePath}`,
      'HEAD abc',
      'branch refs/heads/c4/active2',
      '',
      `worktree ${orphanPath}`,
      'HEAD def',
      'branch refs/heads/c4/orphan2',
      ''
    ].join('\n');

    const result = mgr._cleanupOrphanWorktreesByList();
    expect(result.cleaned).toBe(1);
    expect(result.preserved).toBe(0);
    expect(fs.existsSync(activePath)).toBe(true);
    expect(fs.existsSync(orphanPath)).toBe(false);
  });

  test('handles git worktree list failure gracefully', () => {
    const mgr = new MockPtyManager({ worktree: { projectRoot: '/nonexistent/repo' } });
    mgr._gitWorktreeListOutput = '';
    expect(() => mgr._cleanupOrphanWorktreesByList()).not.toThrow();
  });

  test('cleans orphan that directory no longer exists on disk', () => {
    const gonePath = '/tmp/c4-worktree-gone';

    const mgr = new MockPtyManager({ worktree: { projectRoot: repoRoot } });
    mgr._gitWorktreeListOutput = `worktree ${gonePath}\nHEAD abc\nbranch refs/heads/c4/gone\n`;

    const result = mgr._cleanupOrphanWorktreesByList();
    // Still counts as cleaned (git worktree remove called)
    expect(result.cleaned).toBe(1);
    // fs.rmSync fallback should not be called since dir doesn't exist
    expect(mgr._rmSyncCalls).toHaveLength(0);
  });
});
