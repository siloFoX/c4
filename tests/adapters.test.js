// 9.1 adapter pattern smoke tests.

'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const adapters = require('../src/adapters');
const AgentAdapter = require('../src/adapters/agent-adapter');
const ClaudeCodeAdapter = require('../src/adapters/claude-code-adapter');

describe('adapter registry (9.1)', () => {
  it('lists builtin adapters', () => {
    const list = adapters.listAdapters();
    assert.ok(list.includes('claude-code'));
    assert.ok(list.includes('generic'));
  });

  it('getAdapter("claude-code") returns ClaudeCodeAdapter', () => {
    const a = adapters.getAdapter('claude-code');
    assert.ok(a instanceof ClaudeCodeAdapter);
  });

  it('getAdapter falls back to claude-code for unknown names', () => {
    const a = adapters.getAdapter('nope');
    assert.ok(a instanceof ClaudeCodeAdapter);
  });

  it('register adds custom adapter', () => {
    class FakeAdapter extends AgentAdapter {
      constructor(opts) { super({ ...opts, name: 'fake' }); }
    }
    adapters.register('fake', FakeAdapter);
    const a = adapters.getAdapter('fake');
    assert.ok(a instanceof FakeAdapter);
    assert.strictEqual(a.name, 'fake');
  });

  it('claude-code adapter exposes the TerminalInterface API', () => {
    const a = adapters.getAdapter('claude-code');
    assert.strictEqual(typeof a.isTrustPrompt, 'function');
    assert.strictEqual(a.isTrustPrompt('please trust this folder'), true);
    assert.strictEqual(a.isReady('❯ for shortcuts'), true);
    assert.strictEqual(a.getTrustKeys(), '\r');
  });

  it('matchVersion accepts current 2.x', () => {
    const a = adapters.getAdapter('claude-code');
    assert.ok(a.matchVersion('2.1.123'));
    assert.ok(!a.matchVersion('1.5.0'));
  });

  it('local-llm adapter never reports permission/trust prompts', () => {
    const a = adapters.getAdapter('local-llm');
    assert.strictEqual(a.isTrustPrompt('please trust this folder'), false);
    assert.strictEqual(a.isPermissionPrompt('Do you want to proceed?'), false);
    assert.strictEqual(a.isModelMenu('press arrows to adjust effort'), false);
  });

  it('local-llm spawnCommand returns runtime + model args', () => {
    const a = adapters.getAdapter('local-llm', { runtime: 'ollama', model: 'qwen2.5' });
    const [cmd, args] = a.spawnCommand();
    assert.strictEqual(cmd, 'ollama');
    assert.deepStrictEqual(args, ['run', 'qwen2.5']);
  });

  // 11.2 ComputerUseAdapter

  it('computer-use adapter declares its mode + non-PTY surface', () => {
    const a = adapters.getAdapter('computer-use');
    assert.strictEqual(a.mode, 'computer-use');
    assert.strictEqual(a.isReady('whatever'), true);
    assert.strictEqual(a.isPermissionPrompt('Do you want to proceed?'), false);
  });

  it('computer-use runStep delegates to injected runner', async () => {
    const calls = [];
    const a = adapters.getAdapter('computer-use', {
      runner: async (req) => { calls.push(req); return { type: 'click', x: 10, y: 20 }; },
    });
    const r = await a.runStep({ goal: 'click button', screenshot: 'b64' });
    assert.strictEqual(r.type, 'click');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].goal, 'click button');
  });

  it('computer-use runGoal loops until done', async () => {
    const queue = [
      { type: 'click', x: 1, y: 1 },
      { type: 'type', text: 'hello' },
      { type: 'done', summary: 'sent message' },
    ];
    const a = adapters.getAdapter('computer-use', {
      runner: async () => queue.shift(),
    });
    const r = await a.runGoal({
      goal: 'send hello in chat',
      screenshot: 'shot0',
      executor: async () => ({ screenshot: 'shotN' }),
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.summary, 'sent message');
    assert.strictEqual(r.history.length, 3);
  });

  it('computer-use runGoal stops at maxSteps if no done', async () => {
    const a = adapters.getAdapter('computer-use', {
      maxSteps: 3,
      runner: async () => ({ type: 'wait', ms: 0 }),
    });
    const r = await a.runGoal({
      goal: 'never done',
      screenshot: 'x',
      executor: async () => ({ screenshot: 'x' }),
    });
    assert.strictEqual(r.ok, false);
    assert.match(r.lastError, /maxSteps/);
  });
});
