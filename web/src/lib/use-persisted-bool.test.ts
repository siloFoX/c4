import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistedBool } from './use-persisted-bool';

// usePersistedBool stores its boolean as the string '1' / '0'
// in window.localStorage rather than the JSON-encoded 'true' /
// 'false' so the keys stay readable by the older ad-hoc reader/
// writer pairs scattered across WorkerList + friends. The hook
// reads via a lazy initializer (no re-read on subsequent
// renders) and writes through a useEffect on every value or
// key change. The third tuple slot is a stable toggle().

const KEY = 'c4.test.persisted-bool';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('usePersistedBool', () => {
  it('starts idle: returns the fallback when localStorage has no entry, plus a setter and a toggle', () => {
    const { result } = renderHook(() => usePersistedBool(KEY, false));
    expect(result.current[0]).toBe(false);
    expect(typeof result.current[1]).toBe('function');
    expect(typeof result.current[2]).toBe('function');
  });

  it('honors fallback=true when localStorage has no entry', () => {
    const { result } = renderHook(() => usePersistedBool(KEY, true));
    expect(result.current[0]).toBe(true);
  });

  it("reads a previously persisted '1' as true on mount", () => {
    window.localStorage.setItem(KEY, '1');
    const { result } = renderHook(() => usePersistedBool(KEY, false));
    expect(result.current[0]).toBe(true);
  });

  it("reads a previously persisted '0' as false on mount even if fallback=true", () => {
    window.localStorage.setItem(KEY, '0');
    const { result } = renderHook(() => usePersistedBool(KEY, true));
    expect(result.current[0]).toBe(false);
  });

  it('falls back when the stored value is malformed (not exactly "1" or "0")', () => {
    window.localStorage.setItem(KEY, 'yes');
    const { result } = renderHook(() => usePersistedBool(KEY, true));
    expect(result.current[0]).toBe(true);
  });

  it('falls back when the stored value is the JSON-encoded "true" (legacy string is rejected)', () => {
    window.localStorage.setItem(KEY, 'true');
    const { result } = renderHook(() => usePersistedBool(KEY, false));
    expect(result.current[0]).toBe(false);
  });

  it("writes '1' to localStorage when setValue(true) runs", () => {
    const { result } = renderHook(() => usePersistedBool(KEY, false));
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('1');
  });

  it("writes '0' to localStorage when setValue(false) runs", () => {
    window.localStorage.setItem(KEY, '1');
    const { result } = renderHook(() => usePersistedBool(KEY, false));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe('0');
  });

  it('writes the initial value through the mount effect so the key is established even on a cold start', () => {
    expect(window.localStorage.getItem(KEY)).toBeNull();
    renderHook(() => usePersistedBool(KEY, true));
    expect(window.localStorage.getItem(KEY)).toBe('1');
  });

  it('toggle() flips false -> true -> false and persists each transition', () => {
    const { result } = renderHook(() => usePersistedBool(KEY, false));
    act(() => result.current[2]());
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('1');
    act(() => result.current[2]());
    expect(result.current[0]).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe('0');
  });

  it('toggle reference is stable across re-renders', () => {
    const { result, rerender } = renderHook(() => usePersistedBool(KEY, false));
    const first = result.current[2];
    rerender();
    expect(result.current[2]).toBe(first);
  });

  it('setValue supports the functional updater form', () => {
    const { result } = renderHook(() => usePersistedBool(KEY, false));
    act(() => result.current[1]((v) => !v));
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('1');
  });

  it('changing the key prop writes the current value to the new key on the next effect', () => {
    const OTHER = 'c4.test.persisted-bool.other';
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => usePersistedBool(key, false),
      { initialProps: { key: KEY } },
    );
    act(() => result.current[1](true));
    expect(window.localStorage.getItem(KEY)).toBe('1');
    rerender({ key: OTHER });
    // The lazy initializer doesn't re-read on key change, so value
    // stays true and the effect copies it to the new key.
    expect(result.current[0]).toBe(true);
    expect(window.localStorage.getItem(OTHER)).toBe('1');
    window.localStorage.removeItem(OTHER);
  });

  it('an empty stored value falls back (defense against a writer that called setItem(key, ""))', () => {
    window.localStorage.setItem(KEY, '');
    const { result } = renderHook(() => usePersistedBool(KEY, true));
    expect(result.current[0]).toBe(true);
  });

  it('persisted writes survive an unmount + remount of the hook at the same key', () => {
    const first = renderHook(() => usePersistedBool(KEY, false));
    act(() => first.result.current[1](true));
    first.unmount();
    const second = renderHook(() => usePersistedBool(KEY, false));
    expect(second.result.current[0]).toBe(true);
  });
});
