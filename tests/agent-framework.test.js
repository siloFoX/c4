'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert');

const { Adapter, validateAdapter } = require('../src/agents/adapter');
const ClaudeCodeAdapter = require('../src/agents/claude-code');
const {
  createAdapter,
  listAdapterTypes,
  REGISTRY,
} = require('../src/agents');
const TerminalInterface = require('../src/terminal-interface');

// ---------------------------------------------------------------------------
// Adapter base class contract
// ---------------------------------------------------------------------------

describe('Adapter (abstract base)', () => {
  test('cannot be instantiated directly', () => {
    assert.throws(() => new Adapter(), /abstract/i);
  });

  test('validateAdapter accepts a well-formed claude-code adapter', () => {
    const adapter = new ClaudeCodeAdapter();
    assert.strictEqual(validateAdapter(adapter), true);
  });

  test('validateAdapter rejects null / non-object', () => {
    assert.throws(() => validateAdapter(null), /must be an object/);
    assert.throws(() => validateAdapter('nope'), /must be an object/);
  });

  test('validateAdapter rejects missing required methods', () => {
    const incomplete = {
      metadata: { name: 'x', version: '0.0.1' },
      supportsPause: false,
      init() {},
      sendInput() {},
      sendKey() {},
      onOutput() {},
      // detectIdle missing
    };
    assert.throws(() => validateAdapter(incomplete), /detectIdle/);
  });

  test('validateAdapter rejects invalid metadata', () => {
    const bad = {
      metadata: { name: '', version: '1.0.0' },
      supportsPause: false,
      init() {},
      sendInput() {},
      sendKey() {},
      onOutput() {},
      detectIdle() {},
    };
    assert.throws(() => validateAdapter(bad), /metadata\.name/);
  });

  test('validateAdapter rejects non-boolean supportsPause', () => {
    const bad = {
      metadata: { name: 'x', version: '1.0.0' },
      supportsPause: 'yes',
      init() {},
      sendInput() {},
      sendKey() {},
      onOutput() {},
      detectIdle() {},
    };
    assert.throws(() => validateAdapter(bad), /supportsPause/);
  });
});

// ---------------------------------------------------------------------------
// Claude Code adapter: interface conformance + call forwarding
// ---------------------------------------------------------------------------

describe('ClaudeCodeAdapter', () => {
  test('conforms to the Adapter interface', () => {
    const a = new ClaudeCodeAdapter();
    assert.strictEqual(validateAdapter(a), true);
    assert.strictEqual(a.metadata.name, 'claude-code');
    assert.match(a.metadata.version, /^\d+\.\d+\.\d+$/);
    assert.strictEqual(a.supportsPause, false);
  });

  test('init stores worker context', () => {
    const a = new ClaudeCodeAdapter();
    const ctx = { name: 'w1', proc: { write() {} } };
    a.init(ctx);
    assert.strictEqual(a._workerCtx, ctx);
  });

  test('sendInput forwards to proc.write on the worker context', () => {
    const a = new ClaudeCodeAdapter();
    const writes = [];
    a.init({ proc: { write: (s) => writes.push(s) } });
    a.sendInput('hello');
    assert.deepStrictEqual(writes, ['hello']);
  });

  test('sendInput is a no-op when no proc is attached', () => {
    const a = new ClaudeCodeAdapter();
    // no init() call -> no proc
    assert.doesNotThrow(() => a.sendInput('ignored'));
  });

  test('sendInput rejects non-string input', () => {
    const a = new ClaudeCodeAdapter();
    a.init({ proc: { write() {} } });
    assert.throws(() => a.sendInput(123), /string/);
  });

  test('sendKey maps named keys to escape sequences', () => {
    const writes = [];
    const a = new ClaudeCodeAdapter();
    a.init({ proc: { write: (s) => writes.push(s) } });

    a.sendKey('Enter');
    a.sendKey('Escape');
    a.sendKey('Down');
    a.sendKey('Up');
    a.sendKey('Left');
    a.sendKey('Right');
    a.sendKey('C-c');
    a.sendKey('literal');

    assert.deepStrictEqual(writes, [
      '\r', '\x1b', '\x1b[B', '\x1b[A', '\x1b[D', '\x1b[C', '\x03', 'literal',
    ]);
  });

  test('onOutput registers listeners and returns an unsubscribe fn', () => {
    const a = new ClaudeCodeAdapter();
    const received = [];
    const off = a.onOutput((chunk) => received.push(chunk));
    a._emitOutput('one');
    a._emitOutput('two');
    off();
    a._emitOutput('three');
    assert.deepStrictEqual(received, ['one', 'two']);
  });

  test('onOutput rejects non-function callback', () => {
    const a = new ClaudeCodeAdapter();
    assert.throws(() => a.onOutput('nope'), /function/);
  });

  test('_emitOutput swallows listener errors so the PTY loop stays alive', () => {
    const a = new ClaudeCodeAdapter();
    a.onOutput(() => { throw new Error('boom'); });
    const good = [];
    a.onOutput((c) => good.push(c));
    assert.doesNotThrow(() => a._emitOutput('x'));
    assert.deepStrictEqual(good, ['x']);
  });

  test('detectIdle delegates to isReady(chunk)', () => {
    const a = new ClaudeCodeAdapter();
    assert.strictEqual(a.detectIdle('\u276f Type here (Esc for shortcuts)'), true);
    assert.strictEqual(a.detectIdle('busy output with no prompt'), false);
    assert.strictEqual(a.detectIdle(null), false);
    assert.strictEqual(a.detectIdle(undefined), false);
  });

  test('retains legacy TerminalInterface detection methods', () => {
    const a = new ClaudeCodeAdapter();
    assert.strictEqual(a.isTrustPrompt('Do you trust this folder?'), true);
    assert.strictEqual(a.isPermissionPrompt('Do you want to proceed?'), true);
    assert.strictEqual(a.isModelMenu('Press arrows to adjust effort'), true);
    assert.strictEqual(a.getPromptType('Do you want to create foo.js?'), 'create');
    assert.strictEqual(a.extractFileName('Do you want to create test.js?'), 'test.js');
    assert.strictEqual(a.getTrustKeys(), '\r');
    assert.strictEqual(a.getModelMenuKeys(), '/model\r');
    assert.strictEqual(a.getEscapeKey(), '\x1b');
  });

  test('alwaysApproveForSession flag threaded through options', () => {
    const a = new ClaudeCodeAdapter({}, { alwaysApproveForSession: true });
    assert.strictEqual(a.alwaysApproveForSession, true);
    assert.strictEqual(a.getApproveKeys('1. Yes\n2. Yes always\n3. No'), '\x1b[B\r');
  });

  test('custom patterns override defaults', () => {
    const a = new ClaudeCodeAdapter({ trustPrompt: 'CUSTOM TRUST' });
    assert.strictEqual(a.isTrustPrompt('CUSTOM TRUST'), true);
    assert.strictEqual(a.isTrustPrompt('trust this folder'), false);
  });
});

// ---------------------------------------------------------------------------
// Factory selection
// ---------------------------------------------------------------------------

describe('createAdapter factory', () => {
  test('defaults to claude-code when type omitted', () => {
    const a = createAdapter();
    assert.strictEqual(a.metadata.name, 'claude-code');
    assert.ok(a instanceof ClaudeCodeAdapter);
  });

  test('explicit claude-code selection returns ClaudeCodeAdapter', () => {
    const a = createAdapter({ type: 'claude-code' });
    assert.ok(a instanceof ClaudeCodeAdapter);
  });

  test('unknown agent type throws with a helpful message', () => {
    assert.throws(
      () => createAdapter({ type: 'aider-x' }),
      /Unknown agent type: aider-x.*Registered:.*claude-code/
    );
  });

  test('legacyOpts patterns and alwaysApproveForSession reach the adapter', () => {
    const a = createAdapter({ type: 'claude-code' }, {
      patterns: { trustPrompt: 'HELLO' },
      alwaysApproveForSession: true,
    });
    assert.strictEqual(a.isTrustPrompt('HELLO'), true);
    assert.strictEqual(a.alwaysApproveForSession, true);
  });

  test('agentConfig.options merges over legacyOpts on the same key', () => {
    const a = createAdapter(
      { type: 'claude-code', options: { alwaysApproveForSession: true } },
      { alwaysApproveForSession: false }
    );
    assert.strictEqual(a.alwaysApproveForSession, true);
  });

  test('listAdapterTypes reports registered types', () => {
    const types = listAdapterTypes();
    assert.ok(Array.isArray(types));
    assert.ok(types.includes('claude-code'));
  });

  test('REGISTRY contains the claude-code class reference', () => {
    assert.strictEqual(REGISTRY['claude-code'], ClaudeCodeAdapter);
  });
});

// ---------------------------------------------------------------------------
// Backward compat: TerminalInterface resolves through the factory
// ---------------------------------------------------------------------------

describe('TerminalInterface backward compatibility', () => {
  test('new TerminalInterface() returns a Claude Code adapter', () => {
    const ti = new TerminalInterface();
    assert.strictEqual(ti.metadata.name, 'claude-code');
    assert.ok(ti instanceof ClaudeCodeAdapter);
  });

  test('new TerminalInterface(patterns, options) threads legacy args', () => {
    const ti = new TerminalInterface(
      { trustPrompt: 'LEGACY TRUST' },
      { alwaysApproveForSession: true }
    );
    assert.strictEqual(ti.isTrustPrompt('LEGACY TRUST'), true);
    assert.strictEqual(ti.alwaysApproveForSession, true);
  });

  test('options.agent can steer the factory', () => {
    const ti = new TerminalInterface({}, { agent: { type: 'claude-code' } });
    assert.strictEqual(ti.metadata.name, 'claude-code');
  });

  test('module exposes createAdapter + Adapter for migration', () => {
    assert.strictEqual(typeof TerminalInterface.createAdapter, 'function');
    assert.strictEqual(typeof TerminalInterface.validateAdapter, 'function');
    assert.strictEqual(TerminalInterface.ClaudeCodeAdapter, ClaudeCodeAdapter);
  });
});
