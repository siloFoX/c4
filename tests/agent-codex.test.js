'use strict';

// (v1.10.75) CodexAdapter tests.
//
// CodexAdapter is a PTY-driven scaffold for OpenAI's codex CLI.
// C4 ships the wiring; the operator supplies the binary path +
// readyPrompt / readyIndicator patterns via config (since codex's
// UI text drifts release-to-release). These tests cover the
// adapter contract + the operator-configurable surface without
// spawning a real codex process.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateAdapter } = require('../src/agents/adapter');
const CodexAdapter = require('../src/agents/codex');
const { createAdapter, listAdapterTypes, REGISTRY } = require('../src/agents');

function makeStubProc() {
  const writes = [];
  return {
    proc: {
      write(data) { writes.push(data); },
    },
    writes,
  };
}

describe('CodexAdapter — Adapter contract', () => {
  it('passes validateAdapter()', () => {
    const a = new CodexAdapter({}, {});
    assert.equal(validateAdapter(a), true);
  });

  it('exposes metadata.name=codex and version', () => {
    const a = new CodexAdapter({}, {});
    assert.equal(a.metadata.name, 'codex');
    assert.equal(typeof a.metadata.version, 'string');
    assert.ok(a.metadata.version.length > 0);
  });

  it('supportsPause defaults to false', () => {
    const a = new CodexAdapter({}, {});
    assert.equal(a.supportsPause, false);
  });

  it('supportsPause respects opts override', () => {
    const a = new CodexAdapter({}, { supportsPause: true });
    assert.equal(a.supportsPause, true);
  });
});

describe('CodexAdapter — pattern + binary plumbing', () => {
  it('binary defaults to "codex"', () => {
    const a = new CodexAdapter({}, {});
    assert.equal(a.binary, 'codex');
  });

  it('binary respects opts override', () => {
    const a = new CodexAdapter({}, { binary: '/usr/local/bin/codex' });
    assert.equal(a.binary, '/usr/local/bin/codex');
  });

  it('args defaults to empty array', () => {
    const a = new CodexAdapter({}, {});
    assert.deepEqual(a.args, []);
  });

  it('args respects opts override + is copied (not aliased)', () => {
    const args = ['--no-color'];
    const a = new CodexAdapter({}, { args });
    assert.deepEqual(a.args, ['--no-color']);
    args.push('mutated');
    assert.deepEqual(a.args, ['--no-color'], 'args must be a copy');
  });

  it('patterns from positional arg merge over options.patterns', () => {
    // Per-type sub-bag (options.patterns) supplies defaults, positional
    // patterns arg wins for legacy callers.
    const a = new CodexAdapter(
      { readyPrompt: 'pos>' },
      { patterns: { readyPrompt: 'opts>', readyIndicator: 'help' } }
    );
    assert.equal(a.patterns.readyPrompt, 'pos>');
    assert.equal(a.patterns.readyIndicator, 'help');
  });

  it('patterns supplied via options.patterns alone are honored', () => {
    const a = new CodexAdapter({}, {
      patterns: { readyPrompt: 'OK>', readyIndicator: 'shortcuts' },
    });
    assert.equal(a.patterns.readyPrompt, 'OK>');
    assert.equal(a.patterns.readyIndicator, 'shortcuts');
  });
});

describe('CodexAdapter — input / key forwarding', () => {
  it('sendInput writes to workerCtx.proc', () => {
    const a = new CodexAdapter({}, {});
    const ctx = makeStubProc();
    a.init(ctx);
    a.sendInput('hello');
    a.sendInput(' world');
    assert.deepEqual(ctx.writes, ['hello', ' world']);
  });

  it('sendInput is a no-op when no proc attached', () => {
    const a = new CodexAdapter({}, {});
    a.init(null);
    a.sendInput('hello');  // must not throw
  });

  it('sendInput throws on non-string', () => {
    const a = new CodexAdapter({}, {});
    a.init(makeStubProc());
    assert.throws(() => a.sendInput(123), { name: 'TypeError' });
  });

  it('sendKey maps Enter / Escape / arrows / C-c via KEY_MAP', () => {
    const a = new CodexAdapter({}, {});
    const ctx = makeStubProc();
    a.init(ctx);
    a.sendKey('Enter');
    a.sendKey('Escape');
    a.sendKey('Up');
    a.sendKey('C-c');
    assert.deepEqual(ctx.writes, ['\r', '\x1b', '\x1b[A', '\x03']);
  });

  it('sendKey passes through unknown names as raw bytes', () => {
    const a = new CodexAdapter({}, {});
    const ctx = makeStubProc();
    a.init(ctx);
    a.sendKey('x');
    a.sendKey('\x1b[5~');  // PageUp — not in default map
    assert.deepEqual(ctx.writes, ['x', '\x1b[5~']);
  });
});

describe('CodexAdapter — detectIdle (conservative defaults)', () => {
  it('returns false when patterns are unset', () => {
    const a = new CodexAdapter({}, {});
    assert.equal(a.detectIdle('any chunk with > prompt'), false);
  });

  it('returns false when only readyPrompt is set', () => {
    const a = new CodexAdapter({ readyPrompt: '> ' }, {});
    assert.equal(a.detectIdle('> '), false);
  });

  it('returns false when only readyIndicator is set', () => {
    const a = new CodexAdapter({ readyIndicator: 'shortcuts' }, {});
    assert.equal(a.detectIdle('press Tab for shortcuts'), false);
  });

  it('returns true when BOTH patterns are present in the chunk', () => {
    const a = new CodexAdapter(
      { readyPrompt: '> ', readyIndicator: 'shortcuts' },
      {}
    );
    assert.equal(a.detectIdle('> press Tab for shortcuts'), true);
  });

  it('returns false when patterns are configured but absent in chunk', () => {
    const a = new CodexAdapter(
      { readyPrompt: '> ', readyIndicator: 'shortcuts' },
      {}
    );
    assert.equal(a.detectIdle('still working...'), false);
  });

  it('handles null / undefined chunk without throwing', () => {
    const a = new CodexAdapter(
      { readyPrompt: '> ', readyIndicator: 'shortcuts' },
      {}
    );
    assert.equal(a.detectIdle(null), false);
    assert.equal(a.detectIdle(undefined), false);
  });
});

describe('Factory — codex registration', () => {
  it('listAdapterTypes() includes "codex"', () => {
    const types = listAdapterTypes();
    assert.ok(types.includes('codex'), `expected "codex" in ${types.join(',')}`);
  });

  it('createAdapter({type:"codex"}) returns a CodexAdapter', () => {
    const a = createAdapter({ type: 'codex' });
    assert.ok(a instanceof CodexAdapter);
    assert.equal(validateAdapter(a), true);
  });

  it('createAdapter forwards options to the codex adapter', () => {
    const a = createAdapter({
      type: 'codex',
      options: {
        binary: '/opt/codex',
        args: ['--quiet'],
        patterns: { readyPrompt: 'codex>', readyIndicator: 'help' },
      },
    });
    assert.equal(a.binary, '/opt/codex');
    assert.deepEqual(a.args, ['--quiet']);
    assert.equal(a.patterns.readyPrompt, 'codex>');
    assert.equal(a.patterns.readyIndicator, 'help');
  });

  it('REGISTRY exposes the CodexAdapter class', () => {
    assert.equal(REGISTRY['codex'], CodexAdapter);
  });
});

describe('CodexAdapter — init() context', () => {
  it('init() stores worker context on _workerCtx', () => {
    const a = new CodexAdapter({}, {});
    const ctx = { name: 'w1', proc: { write() {} } };
    a.init(ctx);
    assert.equal(a._workerCtx, ctx);
  });

  it('init(null) clears any previous context', () => {
    const a = new CodexAdapter({}, {});
    a.init({ name: 'old', proc: { write() {} } });
    a.init(null);
    assert.equal(a._workerCtx, null);
  });
});
