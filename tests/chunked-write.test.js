const { describe, test } = require('node:test');
const assert = require('node:assert');
const EventEmitter = require('node:events');

describe('_chunkedWrite (Promise-based sequential write)', () => {
  function createMockProc(opts = {}) {
    const proc = new EventEmitter();
    proc.written = [];
    proc.write = (data) => {
      proc.written.push(data);
      if (opts.backpressure && proc.written.length % 2 === 0) {
        setTimeout(() => proc.emit('drain'), 5);
        return false;
      }
      return true;
    };
    return proc;
  }

  // Inline _chunkedWrite from PtyManager (avoids node-pty dependency)
  async function _chunkedWrite(proc, text, chunkSize = 500, delayMs = 50) {
    // (7.17) Honor backpressure on the single-chunk fast path too.
    if (text.length <= chunkSize) {
      const ok = proc.write(text);
      if (ok === false && typeof proc.once === 'function') {
        await new Promise(resolve => proc.once('drain', resolve));
      }
      return;
    }
    for (let i = 0; i < text.length; i += chunkSize) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      const chunk = text.slice(i, i + chunkSize);
      const ok = proc.write(chunk);
      if (ok === false && typeof proc.once === 'function') {
        await new Promise(resolve => proc.once('drain', resolve));
      }
    }
  }

  test('short text: writes immediately without chunking', async () => {
    const proc = createMockProc();
    await _chunkedWrite(proc, 'hello');
    assert.deepStrictEqual(proc.written, ['hello']);
  });

  test('exact chunk size: writes immediately', async () => {
    const proc = createMockProc();
    const text = 'a'.repeat(500);
    await _chunkedWrite(proc, text);
    assert.deepStrictEqual(proc.written, [text]);
  });

  test('long text: splits into chunks sequentially', async () => {
    const proc = createMockProc();
    const text = 'a'.repeat(501) + '\r';
    await _chunkedWrite(proc, text, 500, 10);
    assert.strictEqual(proc.written.length, 2);
    assert.strictEqual(proc.written[0], 'a'.repeat(500));
    assert.strictEqual(proc.written[1], 'a' + '\r');
    assert.strictEqual(proc.written.join(''), text);
  });

  test('preserves CR at end across chunks', async () => {
    const proc = createMockProc();
    const body = 'x'.repeat(1000);
    const text = body + '\r';
    await _chunkedWrite(proc, text, 500, 10);
    assert.strictEqual(proc.written.length, 3);
    const reassembled = proc.written.join('');
    assert.ok(reassembled.endsWith('\r'), 'CR must be at end');
    assert.strictEqual(reassembled, text);
  });

  test('handles backpressure via drain event', async () => {
    const proc = createMockProc({ backpressure: true });
    const text = 'b'.repeat(1500);
    await _chunkedWrite(proc, text, 500, 10);
    assert.strictEqual(proc.written.length, 3);
    assert.strictEqual(proc.written.join(''), text);
  });

  test('returns promise (async function)', () => {
    const proc = createMockProc();
    const result = _chunkedWrite(proc, 'test');
    assert.ok(result instanceof Promise);
  });

  test('multiple chunks maintain order', async () => {
    const proc = createMockProc();
    const text = 'ABCDE'.repeat(300) + '\r'; // 1501 chars
    await _chunkedWrite(proc, text, 500, 5);
    const reassembled = proc.written.join('');
    assert.strictEqual(reassembled, text);
    assert.strictEqual(proc.written.length, 4);
  });

  // (7.17) Fast path must also respect backpressure so that a subsequent
  // proc.write('\r') does not race ahead of an unflushed text buffer.
  test('fast path awaits drain when proc.write returns false', async () => {
    const proc = new EventEmitter();
    proc.written = [];
    proc.write = (data) => {
      proc.written.push(data);
      setTimeout(() => proc.emit('drain'), 5);
      return false; // force backpressure on the single-chunk path
    };
    const start = Date.now();
    await _chunkedWrite(proc, 'short');
    const elapsed = Date.now() - start;
    assert.deepStrictEqual(proc.written, ['short']);
    // Elapsed must include the 5ms drain wait. Allow slack for CI timing.
    assert.ok(elapsed >= 4, `expected drain wait ~5ms, got ${elapsed}ms`);
  });

  test('fast path returns immediately when proc.write returns true', async () => {
    const proc = new EventEmitter();
    proc.written = [];
    proc.write = (data) => { proc.written.push(data); return true; };
    let drainListeners = 0;
    const origOnce = proc.once.bind(proc);
    proc.once = (ev, fn) => { drainListeners++; return origOnce(ev, fn); };
    await _chunkedWrite(proc, 'x');
    assert.strictEqual(drainListeners, 0, 'no drain listener should attach on ok=true');
  });
});
