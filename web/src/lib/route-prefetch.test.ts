import { describe, it, expect, vi } from 'vitest';
import { prefetch, prefetchHandlers } from './route-prefetch';

describe('prefetch()', () => {
  it('calls the loader once and returns its promise', async () => {
    const value = { ok: true };
    const loader = vi.fn(() => Promise.resolve(value));
    const result = prefetch(loader);
    expect(loader).toHaveBeenCalledTimes(1);
    await expect(result).resolves.toEqual(value);
  });

  it('memoizes by loader identity (second call does not re-fire)', () => {
    const loader = vi.fn(() => Promise.resolve(1));
    prefetch(loader);
    prefetch(loader);
    prefetch(loader);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('treats distinct loader functions as distinct cache entries', () => {
    const a = vi.fn(() => Promise.resolve('a'));
    const b = vi.fn(() => Promise.resolve('b'));
    prefetch(a);
    prefetch(b);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('drops the cache entry on rejection so a retry is possible', async () => {
    let attempt = 0;
    const loader = vi.fn(() => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new Error('boom'))
        : Promise.resolve('ok');
    });
    // First attempt -- the rejection should be swallowed and the
    // cache cleared on the microtask tick.
    prefetch(loader);
    // Flush microtasks so the catch handler runs.
    await Promise.resolve();
    await Promise.resolve();
    // Second attempt should refire because the cache cleared.
    const second = prefetch(loader);
    expect(loader).toHaveBeenCalledTimes(2);
    await expect(second).resolves.toBe('ok');
  });

  it('returns undefined when the loader synchronously throws', () => {
    const loader = () => {
      throw new Error('sync-throw');
    };
    expect(prefetch(loader)).toBeUndefined();
  });

  it('returns undefined when the loader returns a non-thenable', () => {
    // Cast is needed because the public type expects a Promise; the
    // runtime guard exists for defensive callers.
    const loader = (() => 42) as unknown as () => Promise<unknown>;
    expect(prefetch(loader)).toBeUndefined();
  });
});

describe('prefetchHandlers()', () => {
  it('returns the canonical onMouseEnter / onFocus / onTouchStart triple', () => {
    const loader = vi.fn(() => Promise.resolve());
    const handlers = prefetchHandlers(loader);
    expect(typeof handlers.onMouseEnter).toBe('function');
    expect(typeof handlers.onFocus).toBe('function');
    expect(typeof handlers.onTouchStart).toBe('function');
  });

  it('every handler fires prefetch exactly once thanks to the cache', () => {
    const loader = vi.fn(() => Promise.resolve());
    const handlers = prefetchHandlers(loader);
    handlers.onMouseEnter();
    handlers.onFocus();
    handlers.onTouchStart();
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
