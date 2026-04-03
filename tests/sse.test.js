const assert = require('assert');
const { describe, it } = require('node:test');
const { EventEmitter } = require('events');

// Test the SSE event emission logic extracted from PtyManager
describe('SSE Event Streaming (3.5)', () => {
  function createMockManager() {
    const emitter = new EventEmitter();
    emitter._sseClients = new Set();

    emitter._emitSSE = function (type, data) {
      const event = { type, ...data, timestamp: Date.now() };
      this.emit('sse', event);
    };

    emitter.addSSEClient = function (res) {
      this._sseClients.add(res);
      res.on('close', () => this._sseClients.delete(res));
    };

    return emitter;
  }

  it('emits permission event with correct fields', (t, done) => {
    const mgr = createMockManager();
    mgr.on('sse', (event) => {
      assert.strictEqual(event.type, 'permission');
      assert.strictEqual(event.worker, 'test-worker');
      assert.strictEqual(event.promptType, 'bash');
      assert.strictEqual(event.detail, 'npm test');
      assert.ok(event.timestamp > 0);
      done();
    });
    mgr._emitSSE('permission', { worker: 'test-worker', promptType: 'bash', detail: 'npm test' });
  });

  it('emits complete event on worker exit', (t, done) => {
    const mgr = createMockManager();
    mgr.on('sse', (event) => {
      assert.strictEqual(event.type, 'complete');
      assert.strictEqual(event.worker, 'worker-a');
      assert.strictEqual(event.exitCode, 0);
      done();
    });
    mgr._emitSSE('complete', { worker: 'worker-a', exitCode: 0, signal: null });
  });

  it('emits error event on escalation', (t, done) => {
    const mgr = createMockManager();
    mgr.on('sse', (event) => {
      assert.strictEqual(event.type, 'error');
      assert.strictEqual(event.worker, 'worker-b');
      assert.strictEqual(event.escalation, true);
      assert.strictEqual(event.count, 3);
      done();
    });
    mgr._emitSSE('error', { worker: 'worker-b', line: 'npm ERR!', count: 3, escalation: true });
  });

  it('emits question event', (t, done) => {
    const mgr = createMockManager();
    mgr.on('sse', (event) => {
      assert.strictEqual(event.type, 'question');
      assert.strictEqual(event.worker, 'worker-c');
      assert.ok(event.line.includes('할까요'));
      done();
    });
    mgr._emitSSE('question', { worker: 'worker-c', line: 'A 방식으로 할까요?', pattern: '할까요\\?' });
  });

  it('tracks SSE clients', () => {
    const mgr = createMockManager();
    const fakeRes = new EventEmitter();
    mgr.addSSEClient(fakeRes);
    assert.strictEqual(mgr._sseClients.size, 1);

    // Simulate close
    fakeRes.emit('close');
    assert.strictEqual(mgr._sseClients.size, 0);
  });

  it('multiple clients receive same event', () => {
    const mgr = createMockManager();
    const received = [];

    mgr.on('sse', (event) => received.push({ client: 1, ...event }));
    mgr.on('sse', (event) => received.push({ client: 2, ...event }));

    mgr._emitSSE('complete', { worker: 'x', exitCode: 0 });
    assert.strictEqual(received.length, 2);
    assert.strictEqual(received[0].type, 'complete');
    assert.strictEqual(received[1].type, 'complete');
  });

  it('event includes timestamp', () => {
    const mgr = createMockManager();
    const events = [];
    mgr.on('sse', (e) => events.push(e));

    const before = Date.now();
    mgr._emitSSE('permission', { worker: 'w' });
    const after = Date.now();

    assert.ok(events[0].timestamp >= before);
    assert.ok(events[0].timestamp <= after);
  });
});
