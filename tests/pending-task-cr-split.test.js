// pendingTask CR split (7.1)
// Verifies _writeTaskAndEnter writes the text and the '\r' as *separate*
// PTY writes. Combined `text + '\r'` writes can lose the CR due to PTY/
// Claude Code timing — same root cause as 5.18's send() fix that was not
// propagated to pendingTask delivery paths.
//
// Follows the repo convention of replicating the method under test in a
// mock class, because src/pty-manager.js requires node-pty (native binding).
//
// Real setTimeouts are avoided here so the shim's beforeExit runner doesn't
// re-fire after the first pass (the event loop would stay alive via timers
// and trigger an infinite re-run loop — see other tests' style).

'use strict';
require('./jest-shim');

class MockPtyManager {
  constructor() {
    this._enterDelays = []; // captures the delay arg passed to _writeTaskAndEnter
  }

  async _chunkedWrite(proc, text, chunkSize = 500) {
    // No real delay — chunking is just proc.write per slice
    if (text.length <= chunkSize) {
      proc.write(text);
      return;
    }
    for (let i = 0; i < text.length; i += chunkSize) {
      proc.write(text.slice(i, i + chunkSize));
    }
  }

  // Mirrors src/pty-manager.js:_writeTaskAndEnter semantics.
  // Captures the delay arg instead of sleeping, to keep the test sync.
  // (7.17) Default enterDelayMs raised 100→200ms.
  async _writeTaskAndEnter(proc, text, enterDelayMs = 200) {
    await this._chunkedWrite(proc, text);
    this._enterDelays.push(enterDelayMs);
    try { proc.write('\r'); } catch { /* proc closed */ }
  }
}

function makeMockProc() {
  const writes = [];
  return {
    writes,
    write(data) { writes.push(data); return true; },
  };
}

describe('_writeTaskAndEnter (7.1)', () => {
  test('writes task text and CR as two separate proc.write calls', async () => {
    const mgr = new MockPtyManager();
    const proc = makeMockProc();

    await mgr._writeTaskAndEnter(proc, 'hello world');

    expect(proc.writes).toHaveLength(2);
    expect(proc.writes[0]).toBe('hello world');
    expect(proc.writes[1]).toBe('\r');
  });

  test('does not embed \\r inside the task payload', async () => {
    const mgr = new MockPtyManager();
    const proc = makeMockProc();

    await mgr._writeTaskAndEnter(proc, 'task without CR');

    expect(proc.writes[0].endsWith('\r')).toBe(false);
    expect(proc.writes[0].includes('\r')).toBe(false);
  });

  test('passes the configured delay through (default 200ms, 7.17)', async () => {
    const mgr = new MockPtyManager();
    const proc = makeMockProc();

    await mgr._writeTaskAndEnter(proc, 'x');
    await mgr._writeTaskAndEnter(proc, 'y', 250);

    expect(mgr._enterDelays).toEqual([200, 250]);
  });

  test('handles long text via chunked writes and still sends separate CR', async () => {
    const mgr = new MockPtyManager();
    const proc = makeMockProc();
    const long = 'a'.repeat(1200); // > 500 chunkSize → 3 chunks

    await mgr._writeTaskAndEnter(proc, long);

    // 3 chunks + 1 CR
    expect(proc.writes).toHaveLength(4);
    expect(proc.writes[0]).toBe('a'.repeat(500));
    expect(proc.writes[1]).toBe('a'.repeat(500));
    expect(proc.writes[2]).toBe('a'.repeat(200));
    expect(proc.writes[3]).toBe('\r');
  });

  test('swallows write error when proc is already closed', async () => {
    const mgr = new MockPtyManager();
    const proc = {
      writes: [],
      _dead: false,
      write(data) {
        if (this._dead) throw new Error('proc closed');
        this.writes.push(data);
        this._dead = true; // first write succeeds, CR throws
        return true;
      },
    };

    await mgr._writeTaskAndEnter(proc, 'bye'); // must not throw

    expect(proc.writes).toHaveLength(1);
    expect(proc.writes[0]).toBe('bye');
  });
});
