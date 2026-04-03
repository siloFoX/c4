const assert = require('assert');
const { describe, it } = require('node:test');

describe('Manager Auto-Replacement (4.7)', () => {

  function createMockManager(configOverrides = {}) {
    const mgr = {
      config: {
        daemon: { port: 3456, host: '127.0.0.1' },
        managerRotation: { compactThreshold: 0 },
        healthCheck: { enabled: true },
        worktree: { enabled: true },
        autoApprove: {},
        ...configOverrides
      },
      workers: new Map(),
      _taskQueue: [],
      _sessionIds: {},
      _hookEvents: new Map(),
      _sseClients: new Set(),
      _notifications: null,
      _scribe: null,
    };

    mgr._emitSSE = function() {};
    mgr.scribeScan = function() { return { scanned: 0 }; };
    mgr._updateSessionId = function() {};
    mgr._detectRepoRoot = function() { return '/tmp/c4-test'; };

    // Simplified close
    mgr.close = function(name) {
      const w = this.workers.get(name);
      if (!w) return { error: `Worker '${name}' not found` };
      this.workers.delete(name);
      return { success: true, name };
    };

    // Simplified sendTask
    mgr.sendTask = function(name, task, options) {
      this.workers.set(name, {
        alive: true,
        _taskText: task,
        _autoWorker: options?._autoWorker || false,
        snapshots: [],
        _compactCount: 0,
        branch: options?.branch || null,
        worktree: null,
        worktreeRepoRoot: null,
        lastDataTime: Date.now(),
      });
      return { success: true, name };
    };

    // compactEvent
    mgr.compactEvent = function(workerName) {
      const w = this.workers.get(workerName);
      if (!w) return { error: `Worker '${workerName}' not found` };

      if (!w._compactCount) w._compactCount = 0;
      w._compactCount++;
      w._lastCompactAt = Date.now();

      w.snapshots.push({
        time: Date.now(),
        screen: `[COMPACT] context compaction #${w._compactCount} detected`,
        autoAction: true
      });

      this._emitSSE('compact', { worker: workerName, count: w._compactCount });

      const threshold = this.config.managerRotation?.compactThreshold ?? 0;
      if (threshold > 0 && w._compactCount >= threshold && w._autoWorker) {
        const replaceResult = this._replaceManager(workerName);
        return { compactCount: w._compactCount, replaced: true, ...replaceResult };
      }

      return { received: true, worker: workerName, compactCount: w._compactCount };
    };

    // _replaceManager
    mgr._replaceManager = function(oldName) {
      const old = this.workers.get(oldName);
      if (!old || !old.alive) return { error: `Worker '${oldName}' not alive` };

      try { this.scribeScan(); } catch {}
      this._updateSessionId(oldName);

      const newName = `${oldName}-${Date.now().toString(36)}`;
      const task = old._taskText || '';

      const contextInstructions = [
        `docs/session-context.md 파일을 읽어서 이전 관리자의 작업 맥락을 파악해.`,
        `TODO.md를 읽고 남은 작업을 이어서 진행해.`,
        `git log --oneline -20 으로 최근 진행 상황을 확인해.`,
        `이전 관리자(${oldName})의 작업을 이어받는 중이야.`
      ].join('\n');

      const fullMission = task
        ? `${contextInstructions}\n\n이전 작업 지시:\n${task}`
        : contextInstructions;

      old.snapshots.push({
        time: Date.now(),
        screen: `[MANAGER ROTATION] replacing with ${newName} after ${old._compactCount} compactions`,
        autoAction: true
      });

      if (this._notifications) {
        this._notifications.pushAll(`[MANAGER ROTATION] ${oldName} -> ${newName}`);
      }

      const sendResult = this.sendTask(newName, fullMission, {
        branch: `c4/${newName}`,
        useBranch: true,
        autoMode: true,
        _autoWorker: true
      });

      this.close(oldName);

      return {
        oldManager: oldName,
        newManager: newName,
        compactCount: old._compactCount || 0,
        sendResult
      };
    };

    return mgr;
  }

  // --- compactEvent ---

  it('increments compact count on event', () => {
    const mgr = createMockManager();
    mgr.workers.set('mgr', { alive: true, snapshots: [], _compactCount: 0, _autoWorker: true });
    const result = mgr.compactEvent('mgr');
    assert.strictEqual(result.compactCount, 1);
    assert.strictEqual(result.received, true);
  });

  it('tracks multiple compact events', () => {
    const mgr = createMockManager();
    mgr.workers.set('mgr', { alive: true, snapshots: [], _compactCount: 0, _autoWorker: true });
    mgr.compactEvent('mgr');
    mgr.compactEvent('mgr');
    const result = mgr.compactEvent('mgr');
    assert.strictEqual(result.compactCount, 3);
  });

  it('adds [COMPACT] snapshot on each event', () => {
    const mgr = createMockManager();
    mgr.workers.set('mgr', { alive: true, snapshots: [], _compactCount: 0, _autoWorker: true });
    mgr.compactEvent('mgr');
    const w = mgr.workers.get('mgr');
    assert.strictEqual(w.snapshots.length, 1);
    assert.ok(w.snapshots[0].screen.includes('[COMPACT]'));
    assert.ok(w.snapshots[0].screen.includes('#1'));
  });

  it('returns error for unknown worker', () => {
    const mgr = createMockManager();
    const result = mgr.compactEvent('nonexistent');
    assert.ok(result.error);
    assert.ok(result.error.includes('not found'));
  });

  // --- No replacement when threshold is 0 ---

  it('does not replace when compactThreshold is 0', () => {
    const mgr = createMockManager({ managerRotation: { compactThreshold: 0 } });
    mgr.workers.set('mgr', { alive: true, snapshots: [], _compactCount: 0, _autoWorker: true });
    for (let i = 0; i < 10; i++) {
      mgr.compactEvent('mgr');
    }
    // Manager should still exist
    assert.ok(mgr.workers.has('mgr'));
  });

  // --- Replacement at threshold ---

  it('replaces manager when compact count reaches threshold', () => {
    const mgr = createMockManager({ managerRotation: { compactThreshold: 3 } });
    mgr.workers.set('mgr', {
      alive: true,
      snapshots: [],
      _compactCount: 0,
      _autoWorker: true,
      _taskText: 'Build feature X',
      branch: 'c4/mgr',
      worktree: null,
      worktreeRepoRoot: null,
      lastDataTime: Date.now(),
    });

    mgr.compactEvent('mgr'); // count=1
    assert.ok(mgr.workers.has('mgr'));

    mgr.compactEvent('mgr'); // count=2
    assert.ok(mgr.workers.has('mgr'));

    const result = mgr.compactEvent('mgr'); // count=3 — triggers replacement
    assert.strictEqual(result.replaced, true);
    assert.strictEqual(result.oldManager, 'mgr');
    assert.ok(result.newManager.startsWith('mgr-'));
    // Old manager should be closed
    assert.ok(!mgr.workers.has('mgr'));
    // New manager should exist
    assert.ok(mgr.workers.has(result.newManager));
  });

  it('new manager receives context recovery instructions', () => {
    const mgr = createMockManager({ managerRotation: { compactThreshold: 2 } });
    mgr.workers.set('mgr', {
      alive: true,
      snapshots: [],
      _compactCount: 0,
      _autoWorker: true,
      _taskText: 'Original task',
      branch: 'c4/mgr',
      worktree: null,
      worktreeRepoRoot: null,
      lastDataTime: Date.now(),
    });

    mgr.compactEvent('mgr');
    const result = mgr.compactEvent('mgr'); // triggers replacement

    const newWorker = mgr.workers.get(result.newManager);
    assert.ok(newWorker);
    assert.ok(newWorker._taskText.includes('session-context.md'));
    assert.ok(newWorker._taskText.includes('TODO.md'));
    assert.ok(newWorker._taskText.includes('Original task'));
    assert.ok(newWorker._taskText.includes('mgr'));
  });

  it('new manager is marked as _autoWorker', () => {
    const mgr = createMockManager({ managerRotation: { compactThreshold: 1 } });
    mgr.workers.set('mgr', {
      alive: true,
      snapshots: [],
      _compactCount: 0,
      _autoWorker: true,
      _taskText: 'Task',
      branch: 'c4/mgr',
      worktree: null,
      worktreeRepoRoot: null,
      lastDataTime: Date.now(),
    });

    const result = mgr.compactEvent('mgr');
    const newWorker = mgr.workers.get(result.newManager);
    assert.strictEqual(newWorker._autoWorker, true);
  });

  // --- Non-auto workers don't get replaced ---

  it('non-auto workers are not replaced at threshold', () => {
    const mgr = createMockManager({ managerRotation: { compactThreshold: 2 } });
    mgr.workers.set('worker1', {
      alive: true,
      snapshots: [],
      _compactCount: 0,
      _autoWorker: false,
      _taskText: 'Regular task',
    });

    mgr.compactEvent('worker1');
    mgr.compactEvent('worker1');
    // Should still exist — not auto worker
    assert.ok(mgr.workers.has('worker1'));
    assert.strictEqual(mgr.workers.get('worker1')._compactCount, 2);
  });

  // --- _replaceManager ---

  it('_replaceManager returns error for dead worker', () => {
    const mgr = createMockManager();
    mgr.workers.set('dead', { alive: false, snapshots: [] });
    const result = mgr._replaceManager('dead');
    assert.ok(result.error);
  });

  it('_replaceManager returns error for unknown worker', () => {
    const mgr = createMockManager();
    const result = mgr._replaceManager('unknown');
    assert.ok(result.error);
  });

  it('_replaceManager handles missing task text gracefully', () => {
    const mgr = createMockManager({ managerRotation: { compactThreshold: 1 } });
    mgr.workers.set('mgr', {
      alive: true,
      snapshots: [],
      _compactCount: 1,
      _autoWorker: true,
      _taskText: null,
      branch: 'c4/mgr',
      worktree: null,
      worktreeRepoRoot: null,
      lastDataTime: Date.now(),
    });

    const result = mgr._replaceManager('mgr');
    assert.ok(result.newManager);
    const newWorker = mgr.workers.get(result.newManager);
    assert.ok(newWorker._taskText.includes('session-context.md'));
    // Should NOT contain "이전 작업 지시:" since original task was null
    assert.ok(!newWorker._taskText.includes('이전 작업 지시:'));
  });

  // --- Notification integration ---

  it('sends notification on manager replacement', () => {
    const mgr = createMockManager({ managerRotation: { compactThreshold: 1 } });
    const messages = [];
    mgr._notifications = {
      pushAll: (msg) => messages.push(msg)
    };
    mgr.workers.set('mgr', {
      alive: true,
      snapshots: [],
      _compactCount: 0,
      _autoWorker: true,
      _taskText: 'Task',
      branch: 'c4/mgr',
      worktree: null,
      worktreeRepoRoot: null,
      lastDataTime: Date.now(),
    });

    mgr.compactEvent('mgr');
    assert.ok(messages.length > 0);
    assert.ok(messages[0].includes('[MANAGER ROTATION]'));
  });
});
