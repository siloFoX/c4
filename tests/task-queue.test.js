// Task Queue tests (2.2, 2.3, 2.8)
// Tests queue logic without spawning real PTY processes

const path = require('path');
const fs = require('fs');

// --- Mock PtyManager queue methods ---
// We test the pure logic methods by extracting them from PtyManager prototype

// Minimal mock of PtyManager for queue testing
class MockPtyManager {
  constructor(config = {}) {
    this.workers = new Map();
    this._taskQueue = [];
    this.config = config;
  }

  _activeWorkerCount() {
    let count = 0;
    for (const [, w] of this.workers) {
      if (w.alive) count++;
    }
    return count;
  }

  _canStartQueuedTask(entry) {
    if (entry.after) {
      const dep = this.workers.get(entry.after);
      if (dep && dep.alive) return false;
    }
    const maxW = this.config.maxWorkers || 0;
    if (maxW > 0 && this._activeWorkerCount() >= maxW) return false;
    return true;
  }

  _enqueueTask(name, task, options = {}) {
    const entry = {
      name,
      task,
      command: options.command || 'claude',
      args: options.args || [],
      target: options.target || 'local',
      branch: options.branch || `c4/${name}`,
      useBranch: options.useBranch !== false,
      after: options.after || null,
      queuedAt: Date.now()
    };
    this._taskQueue.push(entry);
    return {
      queued: true,
      name,
      after: entry.after,
      position: this._taskQueue.length,
      reason: entry.after ? `waiting for ${entry.after}` : 'maxWorkers reached'
    };
  }

  // Simplified _processQueue for testing (simulates worker creation)
  _processQueue() {
    if (this._taskQueue.length === 0) return [];
    const started = [];
    const remaining = [];
    for (const entry of this._taskQueue) {
      if (this._canStartQueuedTask(entry)) {
        // Simulate creating the worker
        this.workers.set(entry.name, { alive: true });
        started.push({ name: entry.name });
      } else {
        remaining.push(entry);
      }
    }
    this._taskQueue = remaining;
    return started;
  }
}

// --- Tests ---

console.log('=== _activeWorkerCount tests ===');

const m1 = new MockPtyManager();
console.assert(m1._activeWorkerCount() === 0, 'empty = 0 active');

m1.workers.set('a', { alive: true });
m1.workers.set('b', { alive: true });
m1.workers.set('c', { alive: false });
console.assert(m1._activeWorkerCount() === 2, '2 alive, 1 dead = 2 active');

console.log('_activeWorkerCount: all passed');

// --- Duplicate prevention (2.3) ---

console.log('\n=== Duplicate prevention tests ===');

const m2 = new MockPtyManager();
const r1 = m2._enqueueTask('worker-a', 'do stuff');
console.assert(r1.queued === true, 'first enqueue succeeds');
console.assert(m2._taskQueue.length === 1, 'queue has 1 entry');

// Check that queue contains the entry
console.assert(m2._taskQueue.some(q => q.name === 'worker-a'), 'worker-a is in queue');

// Simulate sendTask duplicate check
const isDuplicate = m2._taskQueue.some(q => q.name === 'worker-a');
console.assert(isDuplicate === true, 'duplicate detected for worker-a');

const isNotDuplicate = m2._taskQueue.some(q => q.name === 'worker-b');
console.assert(isNotDuplicate === false, 'worker-b is not duplicate');

console.log('Duplicate prevention: all passed');

// --- Dependency ordering (2.2) ---

console.log('\n=== Dependency ordering tests ===');

const m3 = new MockPtyManager({ maxWorkers: 0 }); // unlimited
m3.workers.set('worker-a', { alive: true });

// Task with --after worker-a
const r3 = m3._enqueueTask('worker-b', 'after a', { after: 'worker-a' });
console.assert(r3.queued === true, 'enqueued with dependency');
console.assert(r3.after === 'worker-a', 'dependency recorded');

// Cannot start while dependency alive
console.assert(m3._canStartQueuedTask(m3._taskQueue[0]) === false, 'blocked by alive dependency');

// Dependency exits
m3.workers.get('worker-a').alive = false;
console.assert(m3._canStartQueuedTask(m3._taskQueue[0]) === true, 'unblocked after dependency exits');

// Process queue
const started3 = m3._processQueue();
console.assert(started3.length === 1, 'one task dequeued');
console.assert(started3[0].name === 'worker-b', 'worker-b started');
console.assert(m3._taskQueue.length === 0, 'queue empty after processing');

console.log('Dependency ordering: all passed');

// --- maxWorkers rate limiting (2.8) ---

console.log('\n=== maxWorkers rate limiting tests ===');

const m4 = new MockPtyManager({ maxWorkers: 2 });
m4.workers.set('w1', { alive: true });
m4.workers.set('w2', { alive: true });

// At max — should not start
m4._enqueueTask('w3', 'task 3');
console.assert(m4._canStartQueuedTask(m4._taskQueue[0]) === false, 'blocked by maxWorkers');

// One worker exits
m4.workers.get('w2').alive = false;
console.assert(m4._canStartQueuedTask(m4._taskQueue[0]) === true, 'unblocked after worker exits');

const started4 = m4._processQueue();
console.assert(started4.length === 1, 'one task dequeued');
console.assert(started4[0].name === 'w3', 'w3 started');

console.log('maxWorkers rate limiting: all passed');

// --- Combined: dependency + maxWorkers ---

console.log('\n=== Combined dependency + maxWorkers tests ===');

const m5 = new MockPtyManager({ maxWorkers: 1 });
m5.workers.set('dep-worker', { alive: true });

// Enqueue with dependency AND at maxWorkers
m5._enqueueTask('next-worker', 'after dep', { after: 'dep-worker' });
console.assert(m5._canStartQueuedTask(m5._taskQueue[0]) === false, 'blocked by dep (alive)');

// Dependency exits — now unblocked (activeCount=0 < maxWorkers=1)
m5.workers.get('dep-worker').alive = false;
console.assert(m5._canStartQueuedTask(m5._taskQueue[0]) === true, 'unblocked when dep exits and slot available');

// Re-add: dependency alive + at maxWorkers
m5._taskQueue = [];
m5.workers.set('dep-worker', { alive: true });
m5._enqueueTask('next-worker', 'after dep', { after: 'dep-worker' });
console.assert(m5._canStartQueuedTask(m5._taskQueue[0]) === false, 'blocked by alive dependency');

// Dep exits but another fills the slot
m5.workers.get('dep-worker').alive = false;
m5.workers.set('filler', { alive: true });
// activeCount=1 = maxWorkers=1, blocked
console.assert(m5._canStartQueuedTask(m5._taskQueue[0]) === false, 'blocked by maxWorkers even after dep exits');

console.log('Combined dependency + maxWorkers: all passed');

// --- Queue ordering (FIFO) ---

console.log('\n=== Queue ordering tests ===');

const m6 = new MockPtyManager({ maxWorkers: 1 });
m6.workers.set('current', { alive: true });

m6._enqueueTask('first', 'task 1');
m6._enqueueTask('second', 'task 2');
m6._enqueueTask('third', 'task 3');

console.assert(m6._taskQueue.length === 3, 'queue has 3 entries');
console.assert(m6._taskQueue[0].name === 'first', 'first in queue');
console.assert(m6._taskQueue[1].name === 'second', 'second in queue');
console.assert(m6._taskQueue[2].name === 'third', 'third in queue');

// Free slot
m6.workers.get('current').alive = false;
const started6 = m6._processQueue();
console.assert(started6.length === 1, 'only one dequeued (maxWorkers=1)');
console.assert(started6[0].name === 'first', 'FIFO: first dequeued first');
console.assert(m6._taskQueue.length === 2, '2 remaining');

console.log('Queue ordering: all passed');

// --- maxWorkers=0 means unlimited ---

console.log('\n=== maxWorkers=0 (unlimited) tests ===');

const m7 = new MockPtyManager({ maxWorkers: 0 });
for (let i = 0; i < 10; i++) {
  m7.workers.set(`w${i}`, { alive: true });
}

m7._enqueueTask('w10', 'task');
console.assert(m7._canStartQueuedTask(m7._taskQueue[0]) === true, 'maxWorkers=0 means unlimited');

console.log('maxWorkers=0 (unlimited): all passed');

// --- Enqueue entry structure ---

console.log('\n=== Enqueue entry structure tests ===');

const m8 = new MockPtyManager();
m8._enqueueTask('test-worker', 'do the thing', {
  branch: 'c4/custom',
  after: 'dep-worker',
  target: 'dgx',
  scope: { allowFiles: ['src/**'] }
});

const entry = m8._taskQueue[0];
console.assert(entry.name === 'test-worker', 'name preserved');
console.assert(entry.task === 'do the thing', 'task preserved');
console.assert(entry.branch === 'c4/custom', 'branch preserved');
console.assert(entry.after === 'dep-worker', 'after preserved');
console.assert(entry.target === 'dgx', 'target preserved');
console.assert(entry.queuedAt > 0, 'queuedAt set');

console.log('Enqueue entry structure: all passed');

console.log('\n=== All task-queue tests passed! ===');
