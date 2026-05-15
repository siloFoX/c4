import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getLocalStorage,
  removeLocalStorage,
  setLocalStorage,
  useLocalStorage,
} from './use-local-storage';

const KEY = 'c4-test:use-local-storage';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('useLocalStorage', () => {
  it('returns the defaultValue when localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('returns the parsed JSON value when localStorage already has data', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ count: 7, label: 'a' }));
    const { result } = renderHook(() =>
      useLocalStorage(KEY, { count: 0, label: '' }),
    );
    expect(result.current[0]).toEqual({ count: 7, label: 'a' });
  });

  it('setValue updates state and writes to localStorage', () => {
    const { result } = renderHook(() => useLocalStorage<number[]>(KEY, []));
    act(() => {
      result.current[1]([1, 2, 3]);
    });
    expect(result.current[0]).toEqual([1, 2, 3]);
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify([1, 2, 3]));
  });

  it('remove() clears the key and restores the defaultValue', () => {
    window.localStorage.setItem(KEY, JSON.stringify('seeded'));
    const { result } = renderHook(() => useLocalStorage(KEY, 'fallback'));
    expect(result.current[0]).toBe('seeded');
    act(() => {
      result.current[2]();
    });
    expect(result.current[0]).toBe('fallback');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('falls back to defaultValue when the stored payload is malformed JSON', () => {
    window.localStorage.setItem(KEY, '{not json');
    const { result } = renderHook(() => useLocalStorage(KEY, { ok: true }));
    expect(result.current[0]).toEqual({ ok: true });
    // Direct helper call agrees.
    expect(getLocalStorage(KEY, { ok: true })).toEqual({ ok: true });
  });

  it('cross-tab: a real storage event for the same key updates state', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, 'initial'));
    act(() => {
      const ev = new StorageEvent('storage', {
        key: KEY,
        newValue: JSON.stringify('from-other-tab'),
        storageArea: window.localStorage,
      });
      window.dispatchEvent(ev);
    });
    expect(result.current[0]).toBe('from-other-tab');
  });

  it('ignores storage events for a different key', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, 'initial'));
    act(() => {
      const ev = new StorageEvent('storage', {
        key: 'unrelated',
        newValue: JSON.stringify('nope'),
        storageArea: window.localStorage,
      });
      window.dispatchEvent(ev);
    });
    expect(result.current[0]).toBe('initial');
  });

  it('keeps two hooks for the same key in sync inside the same tab', () => {
    const a = renderHook(() => useLocalStorage(KEY, 0));
    const b = renderHook(() => useLocalStorage(KEY, 0));
    act(() => {
      a.result.current[1](42);
    });
    expect(a.result.current[0]).toBe(42);
    expect(b.result.current[0]).toBe(42);

    act(() => {
      b.result.current[2]();
    });
    expect(a.result.current[0]).toBe(0);
    expect(b.result.current[0]).toBe(0);
  });

  it('re-seeds when the key changes between renders', () => {
    window.localStorage.setItem('k:a', JSON.stringify('A'));
    window.localStorage.setItem('k:b', JSON.stringify('B'));
    const { result, rerender } = renderHook(
      ({ k }) => useLocalStorage(k, 'fallback'),
      { initialProps: { k: 'k:a' } },
    );
    expect(result.current[0]).toBe('A');
    rerender({ k: 'k:b' });
    expect(result.current[0]).toBe('B');
  });

  it('imperative helpers round-trip and notify hooks', () => {
    const { result } = renderHook(() => useLocalStorage(KEY, 'initial'));
    act(() => {
      setLocalStorage(KEY, 'via-helper');
    });
    expect(result.current[0]).toBe('via-helper');
    expect(getLocalStorage(KEY, 'fallback')).toBe('via-helper');

    act(() => {
      removeLocalStorage(KEY);
    });
    expect(result.current[0]).toBe('initial');
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it('SSR-safe: helpers no-op when window is undefined', () => {
    const originalWindow = globalThis.window;
    // @ts-expect-error -- intentional SSR shape
    delete globalThis.window;
    try {
      expect(getLocalStorage('whatever', 'def')).toBe('def');
      expect(() => setLocalStorage('whatever', 'x')).not.toThrow();
      expect(() => removeLocalStorage('whatever')).not.toThrow();
    } finally {
      globalThis.window = originalWindow;
    }
  });
});
