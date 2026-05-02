'use strict';

// (v1.10.74) Cross-adapter contract test.
//
// Runs the same shape + behaviour checks against every adapter in
// REGISTRY. Catches regressions in any registered adapter the
// moment one of them drifts out of contract — and forces new
// adapters that get added to REGISTRY to satisfy the same baseline
// before they ship.
//
// Per-adapter coverage:
//   1. validateAdapter() returns true on a fresh instance
//   2. metadata.name is a non-empty string
//   3. metadata.version is a non-empty string
//   4. supportsPause is a boolean
//   5. onOutput(fn) returns an unsubscribe function
//   6. unsubscribe is idempotent (calling twice doesn't throw)
//   7. init(null) doesn't throw
//   8. init({}) doesn't throw
//
// Adapter-specific construction needs (e.g. local-llm wants
// `fetch: null` so it doesn't try to bind global fetch) live in
// the ADAPTER_OPTS table below.

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateAdapter } = require('../src/agents/adapter');
const { REGISTRY, listAdapterTypes } = require('../src/agents');

// Per-type construction overrides. Empty for adapters that
// construct cleanly with `{} , {}`.
const ADAPTER_OPTS = {
  'local-ollama': { fetch: null },
  'local-llama-cpp': { fetch: null },
  'local-vllm': { fetch: null },
};

function buildInstance(type) {
  const Klass = REGISTRY[type];
  const opts = ADAPTER_OPTS[type] || {};
  return new Klass({}, opts);
}

describe('Adapter contract — uniform across REGISTRY', () => {
  const types = listAdapterTypes();

  it('REGISTRY is non-empty', () => {
    assert.ok(types.length > 0, 'expected at least one registered adapter');
  });

  for (const type of types) {
    describe(`adapter "${type}"`, () => {
      it('validateAdapter() returns true on a fresh instance', () => {
        const a = buildInstance(type);
        assert.equal(validateAdapter(a), true);
      });

      it('metadata.name is a non-empty string', () => {
        const a = buildInstance(type);
        const m = a.metadata;
        assert.ok(m && typeof m === 'object', 'metadata must be an object');
        assert.equal(typeof m.name, 'string');
        assert.ok(m.name.length > 0, 'metadata.name must be non-empty');
      });

      it('metadata.version is a non-empty string', () => {
        const a = buildInstance(type);
        const v = a.metadata.version;
        assert.equal(typeof v, 'string');
        assert.ok(v.length > 0, 'metadata.version must be non-empty');
      });

      it('supportsPause is a boolean', () => {
        const a = buildInstance(type);
        assert.equal(typeof a.supportsPause, 'boolean');
      });

      it('onOutput(fn) returns an unsubscribe function', () => {
        const a = buildInstance(type);
        const off = a.onOutput(() => {});
        assert.equal(typeof off, 'function', 'onOutput must return a function');
      });

      it('unsubscribe is idempotent (calling twice does not throw)', () => {
        const a = buildInstance(type);
        const off = a.onOutput(() => {});
        off();
        // Second call must not throw — even if the listener is already
        // gone. Some adapters splice; some filter; both styles must
        // tolerate a redundant unsubscribe.
        off();
      });

      it('init(null) does not throw', () => {
        const a = buildInstance(type);
        a.init(null);
      });

      it('init({}) does not throw', () => {
        const a = buildInstance(type);
        a.init({});
      });
    });
  }
});
