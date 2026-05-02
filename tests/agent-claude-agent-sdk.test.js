'use strict';

// (v1.10.77) ClaudeAgentSdkAdapter tests.
//
// Scaffold for Anthropic's Claude Agent SDK. The SDK is not
// bundled — operator wires a `queryFn` programmatically. Tests
// stub the queryFn so no real SDK call goes out.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateAdapter } = require('../src/agents/adapter');
const ClaudeAgentSdkAdapter = require('../src/agents/claude-agent-sdk');
const { createAdapter, listAdapterTypes, REGISTRY } = require('../src/agents');

// Helper: build an async-iterable from an array of events.
function asStream(events) {
  return (async function* () {
    for (const e of events) {
      yield e;
    }
  })();
}

// Helper: queryFn that yields scripted events. Records call args
// for assertions.
function makeStubQueryFn(eventsByPrompt) {
  const calls = [];
  const fn = async (prompt, opts) => {
    calls.push({ prompt, opts });
    const events = eventsByPrompt[prompt] || eventsByPrompt._default || [];
    return asStream(events);
  };
  fn.calls = calls;
  return fn;
}

describe('ClaudeAgentSdkAdapter — Adapter contract', () => {
  it('passes validateAdapter()', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    assert.equal(validateAdapter(a), true);
  });

  it('exposes metadata.name=claude-agent-sdk + version', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    assert.equal(a.metadata.name, 'claude-agent-sdk');
    assert.equal(typeof a.metadata.version, 'string');
    assert.ok(a.metadata.version.length > 0);
  });

  it('metadata carries the model field', () => {
    const a = new ClaudeAgentSdkAdapter({}, { model: 'claude-sonnet-4-6' });
    assert.equal(a.metadata.model, 'claude-sonnet-4-6');
  });

  it('supportsPause defaults to false; opts override honored', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    assert.equal(a.supportsPause, false);
    const b = new ClaudeAgentSdkAdapter({}, { supportsPause: true });
    assert.equal(b.supportsPause, true);
  });

  it('default model is claude-opus-4-7', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    assert.equal(a.model, 'claude-opus-4-7');
  });
});

describe('ClaudeAgentSdkAdapter — input / key / trace plumbing', () => {
  it('sendInput records on _inputs (mirrors MockAdapter shape)', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    a.sendInput('hello');
    a.sendInput(' world');
    assert.deepEqual(a.trace().inputs, ['hello', ' world']);
  });

  it('sendKey records on _keys', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    a.sendKey('Enter');
    a.sendKey('Escape');
    assert.deepEqual(a.trace().keys, ['Enter', 'Escape']);
  });

  it('trace() snapshot includes idle + busy flags', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    const t = a.trace();
    assert.equal(t.idle, false);
    assert.equal(t.busy, false);
  });
});

describe('ClaudeAgentSdkAdapter — onOutput plumbing', () => {
  it('onOutput returns an unsubscribe fn', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    const off = a.onOutput(() => {});
    assert.equal(typeof off, 'function');
    off();
  });

  it('onOutput rejects non-function callback', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    assert.throws(() => a.onOutput('not a function'), { name: 'TypeError' });
  });

  it('listener errors are swallowed per-handler', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    const seen = [];
    a.onOutput(() => { throw new Error('boom'); });
    a.onOutput((c) => seen.push(c));
    a._emitChunk('survived');
    assert.deepEqual(seen, ['survived']);
  });
});

describe('ClaudeAgentSdkAdapter — runQuery streaming', () => {
  it('streams text events through onOutput + returns assembled text', async () => {
    const queryFn = makeStubQueryFn({
      'hello': [
        { type: 'text', text: 'Hi' },
        { type: 'text', text: ', ' },
        { type: 'text', text: 'there!' },
      ],
    });
    const a = new ClaudeAgentSdkAdapter({}, { queryFn });
    const seen = [];
    a.onOutput((c) => seen.push(c));
    const result = await a.runQuery('hello');
    assert.deepEqual(seen, ['Hi', ', ', 'there!']);
    assert.equal(result, 'Hi, there!');
  });

  it('passes prompt + model + systemPrompt + signal to queryFn', async () => {
    const queryFn = makeStubQueryFn({ _default: [] });
    const a = new ClaudeAgentSdkAdapter({}, {
      model: 'claude-sonnet-4-6',
      systemPrompt: 'be helpful',
      queryFn,
    });
    await a.runQuery('hi');
    assert.equal(queryFn.calls.length, 1);
    assert.equal(queryFn.calls[0].prompt, 'hi');
    assert.equal(queryFn.calls[0].opts.model, 'claude-sonnet-4-6');
    assert.equal(queryFn.calls[0].opts.systemPrompt, 'be helpful');
    assert.ok(queryFn.calls[0].opts.signal instanceof AbortSignal);
  });

  it('error events surface through onOutput', async () => {
    const queryFn = makeStubQueryFn({
      _default: [{ type: 'error', text: 'rate limit' }],
    });
    const a = new ClaudeAgentSdkAdapter({}, { queryFn });
    const seen = [];
    a.onOutput((c) => seen.push(c));
    await a.runQuery('hi');
    assert.equal(seen.length, 1);
    assert.match(seen[0], /\[claude-agent-sdk\] error: rate limit/);
  });

  it('tool_use events are ignored (scaffold)', async () => {
    const queryFn = makeStubQueryFn({
      _default: [
        { type: 'text', text: 'before' },
        { type: 'tool_use', name: 'bash', input: {} },
        { type: 'text', text: 'after' },
      ],
    });
    const a = new ClaudeAgentSdkAdapter({}, { queryFn });
    const seen = [];
    a.onOutput((c) => seen.push(c));
    await a.runQuery('hi');
    assert.deepEqual(seen, ['before', 'after']);
  });

  it('detectIdle returns true after a successful query', async () => {
    const queryFn = makeStubQueryFn({
      _default: [{ type: 'text', text: 'done' }],
    });
    const a = new ClaudeAgentSdkAdapter({}, { queryFn });
    assert.equal(a.detectIdle(), false);
    await a.runQuery('hi');
    assert.equal(a.detectIdle(), true);
  });

  it('thrown queryFn errors surface inline (no leak)', async () => {
    const queryFn = async () => { throw new Error('network down'); };
    const a = new ClaudeAgentSdkAdapter({}, { queryFn });
    const seen = [];
    a.onOutput((c) => seen.push(c));
    await a.runQuery('hi');  // must NOT throw
    assert.equal(seen.length, 1);
    assert.match(seen[0], /\[claude-agent-sdk\] error: network down/);
  });

  it('non-AsyncIterable return surfaces as error', async () => {
    const queryFn = async () => ({ totally: 'wrong' });
    const a = new ClaudeAgentSdkAdapter({}, { queryFn });
    const seen = [];
    a.onOutput((c) => seen.push(c));
    await a.runQuery('hi');
    assert.equal(seen.length, 1);
    assert.match(seen[0], /did not return an AsyncIterable/);
  });

  it('runQuery without queryFn surfaces as error (scaffold mode)', async () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    const seen = [];
    a.onOutput((c) => seen.push(c));
    const result = await a.runQuery('hi');
    assert.equal(result, '');
    assert.equal(seen.length, 1);
    assert.match(seen[0], /queryFn not configured/);
  });

  it('concurrent runQuery is rejected (busy guard)', async () => {
    let resolveStream;
    const stream = new Promise((res) => { resolveStream = res; });
    const queryFn = async () => {
      // Block until test releases — simulates slow inference.
      await stream;
      return asStream([{ type: 'text', text: 'late' }]);
    };
    const a = new ClaudeAgentSdkAdapter({}, { queryFn });
    const seen = [];
    a.onOutput((c) => seen.push(c));
    const p1 = a.runQuery('first');
    // Don't await yet; busy is true now.
    // Wait a microtask so the queryFn promise registers.
    await Promise.resolve();
    const p2 = a.runQuery('second');  // must error inline
    const r2 = await p2;
    assert.equal(r2, '');
    const sawBusy = seen.some((s) => /another query is in flight/.test(s));
    assert.ok(sawBusy, 'expected busy-guard error in output');
    resolveStream();
    await p1;  // cleanup
  });
});

describe('ClaudeAgentSdkAdapter — dispose()', () => {
  it('aborts in-flight query', async () => {
    let signalCaptured = null;
    const queryFn = async (_p, opts) => {
      signalCaptured = opts.signal;
      // Yield once, then never resolve — simulates long stream.
      return (async function* () {
        await new Promise(() => {});
      })();
    };
    const a = new ClaudeAgentSdkAdapter({}, { queryFn });
    const p = a.runQuery('hi');
    // Wait one microtask so queryFn is invoked.
    await Promise.resolve();
    a.dispose();
    assert.ok(signalCaptured);
    assert.equal(signalCaptured.aborted, true);
    // Ensure the runQuery promise eventually settles (signal abort
    // should let the for-await loop bail).
    Promise.race([p, new Promise((res) => setTimeout(res, 50))]);
  });

  it('clears output handlers', async () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    const seen = [];
    a.onOutput((c) => seen.push(c));
    a.dispose();
    a._emitChunk('after-dispose');
    assert.deepEqual(seen, []);
  });
});

describe('Factory — claude-agent-sdk registration', () => {
  it('listAdapterTypes() includes "claude-agent-sdk"', () => {
    const types = listAdapterTypes();
    assert.ok(types.includes('claude-agent-sdk'),
      `expected "claude-agent-sdk" in ${types.join(',')}`);
  });

  it('createAdapter({type:"claude-agent-sdk"}) returns the adapter', () => {
    const a = createAdapter({ type: 'claude-agent-sdk' });
    assert.ok(a instanceof ClaudeAgentSdkAdapter);
    assert.equal(validateAdapter(a), true);
  });

  it('createAdapter forwards options to the adapter', () => {
    const a = createAdapter({
      type: 'claude-agent-sdk',
      options: { model: 'claude-haiku-4-5-20251001', systemPrompt: 'short answers' },
    });
    assert.equal(a.model, 'claude-haiku-4-5-20251001');
    assert.equal(a.systemPrompt, 'short answers');
  });

  it('REGISTRY exposes the ClaudeAgentSdkAdapter class', () => {
    assert.equal(REGISTRY['claude-agent-sdk'], ClaudeAgentSdkAdapter);
  });
});

describe('ClaudeAgentSdkAdapter — init() context', () => {
  it('init() stores worker context on _workerCtx', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    const ctx = { name: 'w1' };
    a.init(ctx);
    assert.equal(a._workerCtx, ctx);
  });

  it('init(null) clears any previous context', () => {
    const a = new ClaudeAgentSdkAdapter({}, {});
    a.init({ name: 'old' });
    a.init(null);
    assert.equal(a._workerCtx, null);
  });
});
