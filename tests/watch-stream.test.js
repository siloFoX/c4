const assert = require('assert');
const { describe, it } = require('node:test');
const { EventEmitter } = require('events');

// Test the watch stream logic (5.42)
describe('Watch Stream (5.42)', () => {
  // Minimal mock replicating PtyManager's watchWorker + onData watcher dispatch
  function createMockManager() {
    const workers = new Map();

    function createWorker(name) {
      const worker = {
        name,
        alive: true,
        _watchers: null,
        // simulate proc.onData dispatch
        simulateData(data) {
          if (worker._watchers && worker._watchers.size > 0) {
            for (const cb of worker._watchers) {
              try { cb(data); } catch (e) { /* ignore */ }
            }
          }
        }
      };
      workers.set(name, worker);
      return worker;
    }

    function watchWorker(name, cb) {
      const w = workers.get(name);
      if (!w) return null;
      if (!w._watchers) w._watchers = new Set();
      w._watchers.add(cb);
      return () => {
        if (w._watchers) w._watchers.delete(cb);
      };
    }

    return { workers, createWorker, watchWorker };
  }

  it('returns null for non-existent worker', () => {
    const mgr = createMockManager();
    const result = mgr.watchWorker('no-such-worker', () => {});
    assert.strictEqual(result, null);
  });

  it('registers watcher and receives data', () => {
    const mgr = createMockManager();
    const w = mgr.createWorker('test-w');
    const received = [];

    mgr.watchWorker('test-w', (data) => received.push(data));
    w.simulateData('hello');
    w.simulateData(' world');

    assert.deepStrictEqual(received, ['hello', ' world']);
  });

  it('unwatch stops receiving data', () => {
    const mgr = createMockManager();
    const w = mgr.createWorker('test-w');
    const received = [];

    const unwatch = mgr.watchWorker('test-w', (data) => received.push(data));
    w.simulateData('before');
    unwatch();
    w.simulateData('after');

    assert.deepStrictEqual(received, ['before']);
  });

  it('multiple watchers receive same data', () => {
    const mgr = createMockManager();
    const w = mgr.createWorker('test-w');
    const r1 = [], r2 = [];

    mgr.watchWorker('test-w', (data) => r1.push(data));
    mgr.watchWorker('test-w', (data) => r2.push(data));
    w.simulateData('msg');

    assert.deepStrictEqual(r1, ['msg']);
    assert.deepStrictEqual(r2, ['msg']);
  });

  it('unwatching one does not affect others', () => {
    const mgr = createMockManager();
    const w = mgr.createWorker('test-w');
    const r1 = [], r2 = [];

    const unwatch1 = mgr.watchWorker('test-w', (data) => r1.push(data));
    mgr.watchWorker('test-w', (data) => r2.push(data));

    w.simulateData('a');
    unwatch1();
    w.simulateData('b');

    assert.deepStrictEqual(r1, ['a']);
    assert.deepStrictEqual(r2, ['a', 'b']);
  });

  it('watcher error does not break other watchers', () => {
    const mgr = createMockManager();
    const w = mgr.createWorker('test-w');
    const received = [];

    mgr.watchWorker('test-w', () => { throw new Error('boom'); });
    mgr.watchWorker('test-w', (data) => received.push(data));

    w.simulateData('ok');
    assert.deepStrictEqual(received, ['ok']);
  });

  it('no watchers means no error on data', () => {
    const mgr = createMockManager();
    const w = mgr.createWorker('test-w');
    // No watchers registered, simulateData should not throw
    assert.doesNotThrow(() => w.simulateData('data'));
  });

  it('SSE data format: base64 encoded output', () => {
    // Verify the SSE format the daemon would send
    const rawData = 'Hello \x1b[32mWorld\x1b[0m';
    const encoded = Buffer.from(rawData).toString('base64');
    const ssePayload = JSON.stringify({ type: 'output', data: encoded });

    // Client-side decode
    const parsed = JSON.parse(ssePayload);
    assert.strictEqual(parsed.type, 'output');
    const decoded = Buffer.from(parsed.data, 'base64').toString();
    assert.strictEqual(decoded, rawData);
  });
});
