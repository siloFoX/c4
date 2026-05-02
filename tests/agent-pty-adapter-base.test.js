'use strict';

// (v1.10.78) PtyAdapterBase tests.
//
// Locks in the shared scaffolding for PTY-driven adapters
// (claude-code, codex, future Aider/etc). Subclasses inherit
// init / sendInput / sendKey / DEFAULT_KEY_MAP and just add
// their adapter-specific metadata + detectIdle + helpers.
//
// PtyAdapterBase still requires concrete subclasses for
// metadata / supportsPause / detectIdle — these tests build a
// minimal `PtyTestAdapter` that fills those in so we can exercise
// the inherited surface without dragging in claude-code or codex
// specifics.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Adapter, validateAdapter } = require('../src/agents/adapter');
const PtyAdapterBase = require('../src/agents/pty-adapter-base');
const { DEFAULT_KEY_MAP } = require('../src/agents/pty-adapter-base');

class PtyTestAdapter extends PtyAdapterBase {
  get metadata() { return { name: 'pty-test', version: '1.0.0' }; }
  get supportsPause() { return false; }
  detectIdle(chunk) { return String(chunk || '').includes('READY'); }
}

function makeStubProc() {
  const writes = [];
  return {
    proc: { write(d) { writes.push(d); } },
    writes,
  };
}

describe('PtyAdapterBase — abstract / inheritance', () => {
  it('extends Adapter (transitive instanceof)', () => {
    const a = new PtyTestAdapter();
    assert.ok(a instanceof PtyAdapterBase);
    assert.ok(a instanceof Adapter);
  });

  it('PtyAdapterBase itself is abstract via the Adapter constructor guard', () => {
    // Adapter base throws "abstract" only when invoked directly
    // (new.target check). PtyAdapterBase is allowed because
    // new.target !== Adapter at that point.
    assert.doesNotThrow(() => new PtyAdapterBase());
  });

  it('a subclass that implements metadata + supportsPause + detectIdle passes validateAdapter()', () => {
    const a = new PtyTestAdapter();
    assert.equal(validateAdapter(a), true);
  });
});

describe('PtyAdapterBase — DEFAULT_KEY_MAP', () => {
  it('exports a frozen map', () => {
    assert.equal(typeof DEFAULT_KEY_MAP, 'object');
    assert.ok(Object.isFrozen(DEFAULT_KEY_MAP));
  });

  it('covers Enter / Escape / Tab / Backspace / arrows / C-c / C-d', () => {
    const required = ['Enter', 'Return', 'Escape', 'Esc', 'Tab',
      'Backspace', 'Up', 'Down', 'Left', 'Right', 'C-c', 'C-d'];
    for (const k of required) {
      assert.ok(typeof DEFAULT_KEY_MAP[k] === 'string',
        `missing required key: ${k}`);
      assert.ok(DEFAULT_KEY_MAP[k].length > 0,
        `empty mapping for ${k}`);
    }
  });

  it('arrow keys produce CSI sequences', () => {
    assert.equal(DEFAULT_KEY_MAP.Up, '\x1b[A');
    assert.equal(DEFAULT_KEY_MAP.Down, '\x1b[B');
    assert.equal(DEFAULT_KEY_MAP.Right, '\x1b[C');
    assert.equal(DEFAULT_KEY_MAP.Left, '\x1b[D');
  });

  it('control sequences match POSIX (C-c=0x03, C-d=0x04)', () => {
    assert.equal(DEFAULT_KEY_MAP['C-c'], '\x03');
    assert.equal(DEFAULT_KEY_MAP['C-d'], '\x04');
  });
});

describe('PtyAdapterBase — init() lifecycle', () => {
  it('init(ctx) stores on _workerCtx', () => {
    const a = new PtyTestAdapter();
    const ctx = { name: 'w1', proc: { write() {} } };
    a.init(ctx);
    assert.equal(a._workerCtx, ctx);
  });

  it('init(null) clears any previous context', () => {
    const a = new PtyTestAdapter();
    a.init({ name: 'old' });
    a.init(null);
    assert.equal(a._workerCtx, null);
  });

  it('init() with no arg falls through to null', () => {
    const a = new PtyTestAdapter();
    a.init();
    assert.equal(a._workerCtx, null);
  });
});

describe('PtyAdapterBase — sendInput', () => {
  it('writes to ctx.proc when attached', () => {
    const a = new PtyTestAdapter();
    const ctx = makeStubProc();
    a.init(ctx);
    a.sendInput('hello');
    a.sendInput(' world');
    assert.deepEqual(ctx.writes, ['hello', ' world']);
  });

  it('is a no-op when no proc attached', () => {
    const a = new PtyTestAdapter();
    a.init(null);
    a.sendInput('hello');  // must not throw
  });

  it('is a no-op when ctx has no proc', () => {
    const a = new PtyTestAdapter();
    a.init({ name: 'no-proc' });
    a.sendInput('hello');  // must not throw
  });

  it('throws TypeError on non-string', () => {
    const a = new PtyTestAdapter();
    a.init(makeStubProc());
    assert.throws(() => a.sendInput(123), { name: 'TypeError' });
    assert.throws(() => a.sendInput(null), { name: 'TypeError' });
    assert.throws(() => a.sendInput(undefined), { name: 'TypeError' });
  });

  it('empty string is forwarded (not coerced to no-op)', () => {
    const a = new PtyTestAdapter();
    const ctx = makeStubProc();
    a.init(ctx);
    a.sendInput('');
    assert.deepEqual(ctx.writes, ['']);
  });
});

describe('PtyAdapterBase — sendKey', () => {
  it('maps named keys via DEFAULT_KEY_MAP', () => {
    const a = new PtyTestAdapter();
    const ctx = makeStubProc();
    a.init(ctx);
    a.sendKey('Enter');
    a.sendKey('Escape');
    a.sendKey('C-c');
    a.sendKey('Up');
    assert.deepEqual(ctx.writes, ['\r', '\x1b', '\x03', '\x1b[A']);
  });

  it('passes unknown names through as raw bytes', () => {
    const a = new PtyTestAdapter();
    const ctx = makeStubProc();
    a.init(ctx);
    a.sendKey('x');
    a.sendKey('\x1b[5~');  // PageUp
    assert.deepEqual(ctx.writes, ['x', '\x1b[5~']);
  });

  it('subclass-supplied _keyMap takes precedence', () => {
    class CustomKeyAdapter extends PtyAdapterBase {
      constructor() {
        super();
        // Spread DEFAULT then override + add
        this._keyMap = { ...DEFAULT_KEY_MAP, Enter: '\n', F1: '\x1bOP' };
      }
      get metadata() { return { name: 'custom', version: '1.0' }; }
      get supportsPause() { return false; }
      detectIdle() { return false; }
    }
    const a = new CustomKeyAdapter();
    const ctx = makeStubProc();
    a.init(ctx);
    a.sendKey('Enter');  // \n (overridden), not \r
    a.sendKey('F1');     // new mapping
    a.sendKey('Tab');    // inherited from DEFAULT
    assert.deepEqual(ctx.writes, ['\n', '\x1bOP', '\t']);
  });
});

describe('PtyAdapterBase — onOutput inherited from Adapter base', () => {
  it('returns an unsubscribe fn', () => {
    const a = new PtyTestAdapter();
    const off = a.onOutput(() => {});
    assert.equal(typeof off, 'function');
  });

  it('rejects non-function callback (TypeError)', () => {
    const a = new PtyTestAdapter();
    assert.throws(() => a.onOutput('not a function'), { name: 'TypeError' });
  });

  it('_emitOutput fans to all listeners with per-handler isolation', () => {
    const a = new PtyTestAdapter();
    const seen = [];
    a.onOutput(() => { throw new Error('boom'); });
    a.onOutput((c) => seen.push(c));
    a._emitOutput('survived');
    assert.deepEqual(seen, ['survived']);
  });
});

describe('PtyAdapterBase — production adapters use it', () => {
  it('ClaudeCodeAdapter extends PtyAdapterBase', () => {
    const ClaudeCodeAdapter = require('../src/agents/claude-code');
    const a = new ClaudeCodeAdapter({}, {});
    assert.ok(a instanceof PtyAdapterBase,
      'ClaudeCodeAdapter must extend PtyAdapterBase');
  });

  it('CodexAdapter extends PtyAdapterBase', () => {
    const CodexAdapter = require('../src/agents/codex');
    const a = new CodexAdapter({}, {});
    assert.ok(a instanceof PtyAdapterBase,
      'CodexAdapter must extend PtyAdapterBase');
  });
});
