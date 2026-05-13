'use strict';

// Tests for src/cache-ttl.js — tiny TTL cache used by daemon hot paths
// (TODO 11.85 / v1.11.103).
//
// Covers get/set, getOrCompute, TTL expiry via injected clock, stampede
// protection (concurrent callers share one Promise), invalidate(key) and
// invalidate() clearing every entry, and key independence.

const { describe, it } = require('node:test');
const assert = require('assert');

const { createCache, DEFAULT_TTL_MS } = require('../src/cache-ttl');

// Helper: build a cache with a manually advanced clock so we can drive
// TTL expiry deterministically without setTimeout / vi.useFakeTimers.
function makeClockedCache(ttlMs) {
  const state = { t: 1000 };
  const cache = createCache({ ttlMs, now: () => state.t });
  return { cache, advance(ms) { state.t += ms; } };
}

describe('cache-ttl.createCache - basics', () => {
  it('get() returns undefined for a missing key', () => {
    const { cache } = makeClockedCache(2000);
    assert.strictEqual(cache.get('nothing'), undefined);
  });

  it('set() stores a value that get() returns within TTL', () => {
    const { cache } = makeClockedCache(2000);
    cache.set('k', 42);
    assert.strictEqual(cache.get('k'), 42);
  });

  it('different keys are independent', () => {
    const { cache } = makeClockedCache(2000);
    cache.set('a', 1);
    cache.set('b', 2);
    assert.strictEqual(cache.get('a'), 1);
    assert.strictEqual(cache.get('b'), 2);
    cache.invalidate('a');
    assert.strictEqual(cache.get('a'), undefined);
    assert.strictEqual(cache.get('b'), 2);
  });

  it('defaults ttlMs to 2000 when no options are provided', () => {
    assert.strictEqual(DEFAULT_TTL_MS, 2000);
    const cache = createCache();
    cache.set('k', 'v');
    assert.strictEqual(cache.get('k'), 'v');
  });
});

describe('cache-ttl.getOrCompute - freshness', () => {
  it('returns the cached value within TTL without re-invoking the compute', async () => {
    const { cache, advance } = makeClockedCache(2000);
    let calls = 0;
    const compute = async () => { calls += 1; return { rev: calls }; };

    const first = await cache.getOrCompute('list', compute);
    assert.deepStrictEqual(first, { rev: 1 });
    assert.strictEqual(calls, 1);

    advance(500);
    const second = await cache.getOrCompute('list', compute);
    assert.deepStrictEqual(second, { rev: 1 });
    assert.strictEqual(calls, 1, 'compute should not run a second time inside TTL');
  });

  it('re-runs the compute after TTL expires', async () => {
    const { cache, advance } = makeClockedCache(2000);
    let calls = 0;
    const compute = async () => { calls += 1; return calls; };

    const a = await cache.getOrCompute('list', compute);
    assert.strictEqual(a, 1);

    advance(2001);
    const b = await cache.getOrCompute('list', compute);
    assert.strictEqual(b, 2);
    assert.strictEqual(calls, 2);
  });

  it('exactly at TTL boundary counts as expired', async () => {
    const { cache, advance } = makeClockedCache(2000);
    let calls = 0;
    await cache.getOrCompute('k', async () => { calls += 1; return 'first'; });
    advance(2000);
    await cache.getOrCompute('k', async () => { calls += 1; return 'second'; });
    assert.strictEqual(calls, 2);
  });
});

describe('cache-ttl.getOrCompute - stampede protection', () => {
  it('two simultaneous callers share a single in-flight Promise', async () => {
    const { cache } = makeClockedCache(2000);
    let calls = 0;
    // Hold the compute open until we tell it to resolve, so both callers
    // queue up while the first is pending.
    let release;
    const gate = new Promise((r) => { release = r; });
    const compute = async () => {
      calls += 1;
      await gate;
      return { id: calls };
    };

    const p1 = cache.getOrCompute('list', compute);
    const p2 = cache.getOrCompute('list', compute);
    // Allow the microtask queue to drain so any extra compute invocation
    // would have already happened.
    await Promise.resolve();
    assert.strictEqual(calls, 1, 'second call must latch onto the in-flight Promise');
    release();
    const [a, b] = await Promise.all([p1, p2]);
    assert.deepStrictEqual(a, { id: 1 });
    assert.deepStrictEqual(b, { id: 1 });
    assert.strictEqual(calls, 1);
  });

  it('a third caller after the compute resolves hits the cache without recomputing', async () => {
    const { cache } = makeClockedCache(2000);
    let calls = 0;
    const compute = async () => { calls += 1; return calls; };
    await cache.getOrCompute('k', compute);
    const v = await cache.getOrCompute('k', compute);
    assert.strictEqual(v, 1);
    assert.strictEqual(calls, 1);
  });

  it('a rejected compute clears the in-flight slot so the next call retries', async () => {
    const { cache } = makeClockedCache(2000);
    let calls = 0;
    const compute = async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return 'ok';
    };
    await assert.rejects(cache.getOrCompute('k', compute), /boom/);
    const v = await cache.getOrCompute('k', compute);
    assert.strictEqual(v, 'ok');
    assert.strictEqual(calls, 2);
  });
});

describe('cache-ttl.invalidate', () => {
  it('invalidate(key) drops a single entry', () => {
    const { cache } = makeClockedCache(2000);
    cache.set('k', 'v');
    cache.invalidate('k');
    assert.strictEqual(cache.get('k'), undefined);
  });

  it('invalidate() with no arg clears every entry', () => {
    const { cache } = makeClockedCache(2000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    cache.invalidate();
    assert.strictEqual(cache.get('a'), undefined);
    assert.strictEqual(cache.get('b'), undefined);
    assert.strictEqual(cache.get('c'), undefined);
  });

  it('invalidate forces the next getOrCompute call to recompute', async () => {
    const { cache } = makeClockedCache(2000);
    let calls = 0;
    const compute = async () => { calls += 1; return calls; };
    await cache.getOrCompute('k', compute);
    cache.invalidate('k');
    await cache.getOrCompute('k', compute);
    assert.strictEqual(calls, 2);
  });
});
