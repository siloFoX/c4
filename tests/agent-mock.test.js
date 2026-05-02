'use strict';

// (v1.10.71 — 9.1 phase 2) MockAdapter tests.
//
// MockAdapter is the deterministic in-memory adapter that lets:
// (1) tests exercise agent-aware code without a live PTY/LLM,
// (2) new backend authors (codex, claude-agent-sdk) see the
//     minimum-viable adapter shape, and
// (3) the framework's `validateAdapter()` contract get exercised
//     against something other than the production Claude Code adapter.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateAdapter } = require('../src/agents/adapter');
const MockAdapter = require('../src/agents/mock');
const { createAdapter, listAdapterTypes, REGISTRY } = require('../src/agents');

describe('MockAdapter — Adapter contract', () => {
  it('passes validateAdapter()', () => {
    const m = new MockAdapter({}, {});
    assert.equal(validateAdapter(m), true);
  });

  it('exposes metadata + supportsPause', () => {
    const m = new MockAdapter({}, {});
    assert.equal(m.metadata.name, 'mock');
    assert.equal(typeof m.metadata.version, 'string');
    assert.equal(m.supportsPause, false);
  });

  it('honours custom name / version / supportsPause via opts', () => {
    const m = new MockAdapter({}, { name: 'codex-fixture', version: '0.1.0', supportsPause: true });
    assert.equal(m.metadata.name, 'codex-fixture');
    assert.equal(m.metadata.version, '0.1.0');
    assert.equal(m.supportsPause, true);
  });
});

describe('MockAdapter — input / key plumbing', () => {
  it('records sendInput chunks in trace', () => {
    const m = new MockAdapter({}, {});
    m.sendInput('hello');
    m.sendInput(' world');
    assert.deepEqual(m.trace().inputs, ['hello', ' world']);
  });

  it('records sendKey names in trace', () => {
    const m = new MockAdapter({}, {});
    m.sendKey('Enter');
    m.sendKey('Escape');
    assert.deepEqual(m.trace().keys, ['Enter', 'Escape']);
  });

  it('reset() clears inputs / keys / pending output (idle stays)', () => {
    const m = new MockAdapter({}, {});
    m.sendInput('x');
    m.sendKey('Enter');
    m.setIdle(true);
    m.setScript(['queued']);
    m.reset();
    const t = m.trace();
    assert.deepEqual(t.inputs, []);
    assert.deepEqual(t.keys, []);
    assert.equal(t.pending, 0);
    assert.equal(t.idle, true, 'idle survives reset');
  });
});

describe('MockAdapter — output listener', () => {
  it('pushOutput fires registered listeners', () => {
    const m = new MockAdapter({}, {});
    const seen = [];
    m.onOutput((c) => seen.push(c));
    m.pushOutput('a');
    m.pushOutput('b');
    assert.deepEqual(seen, ['a', 'b']);
  });

  it('queues output until first listener attaches, then flushes', () => {
    const m = new MockAdapter({}, {});
    m.pushOutput('early-1');
    m.pushOutput('early-2');
    const seen = [];
    m.onOutput((c) => seen.push(c));
    assert.deepEqual(seen, ['early-1', 'early-2']);
  });

  it('setScript queues multiple chunks for first listener', () => {
    const m = new MockAdapter({}, {});
    m.setScript(['a', 'b', 'c']);
    const seen = [];
    m.onOutput((c) => seen.push(c));
    assert.deepEqual(seen, ['a', 'b', 'c']);
  });

  it('returns unsubscribe fn', () => {
    const m = new MockAdapter({}, {});
    const seen = [];
    const off = m.onOutput((c) => seen.push(c));
    m.pushOutput('a');
    off();
    m.pushOutput('b');
    assert.deepEqual(seen, ['a']);
  });

  it('listener errors are swallowed (other listeners still fire)', () => {
    const m = new MockAdapter({}, {});
    const seen = [];
    m.onOutput(() => { throw new Error('boom'); });
    m.onOutput((c) => seen.push(c));
    m.pushOutput('survived');
    assert.deepEqual(seen, ['survived']);
  });
});

describe('MockAdapter — detectIdle', () => {
  it('returns false by default', () => {
    const m = new MockAdapter({}, {});
    assert.equal(m.detectIdle('any chunk'), false);
  });

  it('returns true after setIdle(true)', () => {
    const m = new MockAdapter({}, {});
    m.setIdle(true);
    assert.equal(m.detectIdle('chunk'), true);
  });

  it('only true === true flips it (truthy values do NOT)', () => {
    const m = new MockAdapter({}, {});
    m.setIdle(1);
    assert.equal(m.detectIdle(''), false);
    m.setIdle('yes');
    assert.equal(m.detectIdle(''), false);
    m.setIdle(true);
    assert.equal(m.detectIdle(''), true);
  });
});

describe('Factory — mock registration', () => {
  it('listAdapterTypes() includes "mock"', () => {
    const types = listAdapterTypes();
    assert.ok(types.includes('mock'), `expected "mock" in ${types.join(',')}`);
  });

  it('createAdapter({type:"mock"}) returns a MockAdapter', () => {
    const a = createAdapter({ type: 'mock' });
    assert.ok(a instanceof MockAdapter);
    assert.equal(validateAdapter(a), true);
  });

  it('createAdapter forwards options to the mock', () => {
    const a = createAdapter(
      { type: 'mock', options: { name: 'fake-codex', version: '2.0.0' } },
    );
    assert.equal(a.metadata.name, 'fake-codex');
    assert.equal(a.metadata.version, '2.0.0');
  });

  it('REGISTRY exposes the MockAdapter class', () => {
    assert.equal(REGISTRY['mock'], MockAdapter);
  });
});

describe('MockAdapter — init() context', () => {
  it('init() stores the worker context on _workerCtx', () => {
    const m = new MockAdapter({}, {});
    const ctx = { name: 'w1', proc: { pid: 999 } };
    m.init(ctx);
    assert.equal(m._workerCtx, ctx);
  });

  it('init(null) clears any previous context', () => {
    const m = new MockAdapter({}, {});
    m.init({ name: 'old' });
    m.init(null);
    assert.equal(m._workerCtx, null);
  });
});
