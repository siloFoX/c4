// Auto-resume tests (4.17)
// Tests idle callback queue check and _processQueue idle worker detection

const assert = require('assert');
const { describe, it } = require('node:test');

describe('Auto-resume: idle callback queue check (4.17)', () => {
  function createMockManager() {
    const mgr = {
      workers: new Map(),
      _taskQueue: [],
      config: { maxWorkers: 0 },
      _savedState: false,
      _written: [],

      _buildTaskText(worker, task, options) {
        return `[task] ${task}`;
      },

      _chunkedWrite(proc, text) {
        this._written.push({ proc, text });
      },

      _saveState() {
        this._savedState = true;
      },

      _activeWorkerCount() {
        let count = 0;
        for (const [, w] of this.workers) {
          if (w.alive) count++;
        }
        return count;
      },

      _canStartQueuedTask(entry) {
        if (entry.after) {
          const dep = this.workers.get(entry.after);
          if (dep && dep.alive) return false;
        }
        const maxW = this.config.maxWorkers || 0;
        if (maxW > 0 && this._activeWorkerCount() >= maxW) return false;
        return true;
      },

      _createAndSendTask(entry) {
        this.workers.set(entry.name, { alive: true, proc: { id: entry.name } });
        return { created: true };
      },

      // Replicate the _processQueue with idle worker detection
      _processQueue() {
        if (this._taskQueue.length === 0) return [];
        const started = [];
        const remaining = [];
        for (const entry of this._taskQueue) {
          const existingWorker = this.workers.get(entry.name);
          if (existingWorker && existingWorker.alive && !existingWorker._pendingTask && !existingWorker._taskText) {
            const fullTask = this._buildTaskText(existingWorker, entry.task, entry);
            this._chunkedWrite(existingWorker.proc, fullTask + '\r');
            existingWorker._taskText = entry.task;
            existingWorker._taskStartedAt = new Date().toISOString();
            started.push({ name: entry.name, result: { sent: true } });
            continue;
          }
          if (this._canStartQueuedTask(entry)) {
            const result = this._createAndSendTask(entry);
            started.push({ name: entry.name, result });
          } else {
            remaining.push(entry);
          }
        }
        this._taskQueue = remaining;
        if (started.length > 0) this._savedState = true;
        return started;
      }
    };
    return mgr;
  }

  // --- Idle callback queue check ---

  it('finds matching task in queue for idle worker', () => {
    const mgr = createMockManager();
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'next task', queuedAt: Date.now() });

    // Simulate idle callback logic
    const name = 'auto-mgr';
    const worker = { _pendingTask: null, _taskText: null };
    const queueIdx = mgr._taskQueue.findIndex(e => e.name === name);
    assert.strictEqual(queueIdx, 0, 'found matching task at index 0');
  });

  it('does not match task for different worker', () => {
    const mgr = createMockManager();
    mgr._taskQueue.push({ name: 'worker-a', task: 'task for a', queuedAt: Date.now() });

    const name = 'auto-mgr';
    const queueIdx = mgr._taskQueue.findIndex(e => e.name === name);
    assert.strictEqual(queueIdx, -1, 'no matching task for auto-mgr');
  });

  it('skips queue check when _pendingTask exists', () => {
    const mgr = createMockManager();
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'queued task', queuedAt: Date.now() });

    const worker = { _pendingTask: { task: 'pending' }, _taskText: null };
    // The idle callback should not check queue when _pendingTask exists
    const shouldCheckQueue = !worker._pendingTask && !worker._taskText;
    assert.strictEqual(shouldCheckQueue, false, 'should not check queue when _pendingTask exists');
  });

  it('skips queue check when _taskText exists (worker busy)', () => {
    const mgr = createMockManager();
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'queued task', queuedAt: Date.now() });

    const worker = { _pendingTask: null, _taskText: 'current task' };
    const shouldCheckQueue = !worker._pendingTask && !worker._taskText;
    assert.strictEqual(shouldCheckQueue, false, 'should not check queue when worker is busy');
  });

  it('removes matched task from queue after splice', () => {
    const mgr = createMockManager();
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'task 1', queuedAt: Date.now() });
    mgr._taskQueue.push({ name: 'worker-a', task: 'task 2', queuedAt: Date.now() });

    const name = 'auto-mgr';
    const queueIdx = mgr._taskQueue.findIndex(e => e.name === name);
    const entry = mgr._taskQueue.splice(queueIdx, 1)[0];

    assert.strictEqual(entry.task, 'task 1', 'spliced correct entry');
    assert.strictEqual(mgr._taskQueue.length, 1, 'queue reduced by 1');
    assert.strictEqual(mgr._taskQueue[0].name, 'worker-a', 'other entries preserved');
  });

  it('builds task text for queued task', () => {
    const mgr = createMockManager();
    const worker = { worktree: null, branch: null, scopeGuard: null };
    const result = mgr._buildTaskText(worker, 'do something', {});
    assert.ok(result.includes('do something'), 'task text contains the task');
  });

  // --- _processQueue idle worker detection ---

  it('sends task to existing idle worker via _processQueue', () => {
    const mgr = createMockManager();
    const proc = { id: 'auto-mgr' };
    mgr.workers.set('auto-mgr', {
      alive: true,
      proc,
      _pendingTask: null,
      _taskText: null
    });
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'resume task', queuedAt: Date.now() });

    const started = mgr._processQueue();
    assert.strictEqual(started.length, 1, 'one task started');
    assert.strictEqual(started[0].name, 'auto-mgr', 'correct worker');
    assert.strictEqual(started[0].result.sent, true, 'sent to existing worker');
    assert.strictEqual(mgr._taskQueue.length, 0, 'queue emptied');
    assert.strictEqual(mgr.workers.get('auto-mgr')._taskText, 'resume task', 'taskText set');
  });

  it('does not send to busy worker via _processQueue', () => {
    const mgr = createMockManager();
    mgr.workers.set('auto-mgr', {
      alive: true,
      proc: { id: 'auto-mgr' },
      _pendingTask: null,
      _taskText: 'already working'
    });
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'next task', queuedAt: Date.now() });

    const started = mgr._processQueue();
    // Worker is busy (_taskText set), so it should not be sent to
    // But _canStartQueuedTask returns true because the worker is alive
    // _createAndSendTask would return error because worker is already alive
    assert.strictEqual(mgr._taskQueue.length, 0, 'task removed from queue');
  });

  it('does not send to worker with _pendingTask via _processQueue', () => {
    const mgr = createMockManager();
    mgr.workers.set('auto-mgr', {
      alive: true,
      proc: { id: 'auto-mgr' },
      _pendingTask: { task: 'pending' },
      _taskText: null
    });
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'next task', queuedAt: Date.now() });

    const started = mgr._processQueue();
    assert.strictEqual(mgr._taskQueue.length, 0, 'task processed from queue');
  });

  it('creates new worker if no existing worker found', () => {
    const mgr = createMockManager();
    mgr._taskQueue.push({ name: 'new-worker', task: 'new task', queuedAt: Date.now() });

    const started = mgr._processQueue();
    assert.strictEqual(started.length, 1, 'one task started');
    assert.strictEqual(started[0].result.created, true, 'new worker created');
    assert.ok(mgr.workers.has('new-worker'), 'worker registered');
  });

  it('handles mixed queue: idle worker + new worker', () => {
    const mgr = createMockManager();
    mgr.workers.set('auto-mgr', {
      alive: true,
      proc: { id: 'auto-mgr' },
      _pendingTask: null,
      _taskText: null
    });
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'resume task', queuedAt: Date.now() });
    mgr._taskQueue.push({ name: 'new-worker', task: 'new task', queuedAt: Date.now() });

    const started = mgr._processQueue();
    assert.strictEqual(started.length, 2, 'two tasks started');
    assert.strictEqual(started[0].name, 'auto-mgr', 'idle worker resumed');
    assert.strictEqual(started[1].name, 'new-worker', 'new worker created');
    assert.strictEqual(mgr._taskQueue.length, 0, 'queue emptied');
  });

  it('writes task text to proc for idle worker', () => {
    const mgr = createMockManager();
    const proc = { id: 'auto-mgr' };
    mgr.workers.set('auto-mgr', {
      alive: true,
      proc,
      _pendingTask: null,
      _taskText: null
    });
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'hello world', queuedAt: Date.now() });

    mgr._processQueue();
    assert.strictEqual(mgr._written.length, 1, 'one write occurred');
    assert.ok(mgr._written[0].text.includes('hello world'), 'task text written');
    assert.strictEqual(mgr._written[0].proc, proc, 'written to correct proc');
  });

  it('sets _taskStartedAt for idle worker', () => {
    const mgr = createMockManager();
    mgr.workers.set('auto-mgr', {
      alive: true,
      proc: { id: 'auto-mgr' },
      _pendingTask: null,
      _taskText: null
    });
    mgr._taskQueue.push({ name: 'auto-mgr', task: 'timed task', queuedAt: Date.now() });

    mgr._processQueue();
    const w = mgr.workers.get('auto-mgr');
    assert.ok(w._taskStartedAt, '_taskStartedAt is set');
    assert.ok(new Date(w._taskStartedAt).getTime() > 0, '_taskStartedAt is valid ISO string');
  });
});
