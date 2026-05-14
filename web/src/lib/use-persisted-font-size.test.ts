import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePersistedFontSize } from './use-persisted-font-size';

// usePersistedFontSize owns a clamped terminal font size that
// persists to window.localStorage under 'c4.term.fontSize'. The
// initial value is read lazily on mount, every change writes
// back through a useEffect (quota / disabled-storage errors are
// swallowed), and the `bumpFont(delta)` helper applies the same
// clamp + Math.floor as the initial-read path. Non-finite inputs
// collapse to minFont.

const KEY = 'c4.term.fontSize';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('usePersistedFontSize', () => {
  it('starts idle: returns defaultFont when localStorage has no entry, plus setFontSize and bumpFont', () => {
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    expect(result.current.fontSize).toBe(14);
    expect(typeof result.current.setFontSize).toBe('function');
    expect(typeof result.current.bumpFont).toBe('function');
  });

  it('reads a previously persisted numeric value as the initial fontSize', () => {
    window.localStorage.setItem(KEY, '18');
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    expect(result.current.fontSize).toBe(18);
  });

  it('clamps the persisted value to minFont when it is below the floor', () => {
    window.localStorage.setItem(KEY, '4');
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    expect(result.current.fontSize).toBe(8);
  });

  it('clamps the persisted value to maxFont when it is above the ceiling', () => {
    window.localStorage.setItem(KEY, '99');
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    expect(result.current.fontSize).toBe(32);
  });

  it('floors fractional persisted values (clamp uses Math.floor)', () => {
    window.localStorage.setItem(KEY, '14.9');
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    expect(result.current.fontSize).toBe(14);
  });

  it('falls back to minFont when the persisted value is not a finite number', () => {
    window.localStorage.setItem(KEY, 'not-a-number');
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    // 'not-a-number' parses to NaN -> readNumberStorage returns the
    // defaultFont fallback (14), which is finite and inside bounds.
    expect(result.current.fontSize).toBe(14);
  });

  it('writes the initial fontSize through the mount effect so the key is established on a cold start', () => {
    expect(window.localStorage.getItem(KEY)).toBeNull();
    renderHook(() =>
      usePersistedFontSize({ defaultFont: 16, minFont: 8, maxFont: 32 }),
    );
    expect(window.localStorage.getItem(KEY)).toBe('16');
  });

  it('setFontSize updates state and persists the raw value to localStorage', () => {
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    act(() => result.current.setFontSize(22));
    expect(result.current.fontSize).toBe(22);
    expect(window.localStorage.getItem(KEY)).toBe('22');
  });

  it('bumpFont(+2) increments the current value and persists', () => {
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    act(() => result.current.bumpFont(2));
    expect(result.current.fontSize).toBe(16);
    expect(window.localStorage.getItem(KEY)).toBe('16');
  });

  it('bumpFont(-3) decrements the current value', () => {
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    act(() => result.current.bumpFont(-3));
    expect(result.current.fontSize).toBe(11);
  });

  it('bumpFont clamps to minFont when the delta would drop below the floor', () => {
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 10, minFont: 8, maxFont: 32 }),
    );
    act(() => result.current.bumpFont(-50));
    expect(result.current.fontSize).toBe(8);
  });

  it('bumpFont clamps to maxFont when the delta would push above the ceiling', () => {
    const { result } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 30, minFont: 8, maxFont: 32 }),
    );
    act(() => result.current.bumpFont(50));
    expect(result.current.fontSize).toBe(32);
  });

  it('bumpFont reference is stable across re-renders when min/max are unchanged', () => {
    const { result, rerender } = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    const first = result.current.bumpFont;
    rerender();
    expect(result.current.bumpFont).toBe(first);
  });

  it('swallows a localStorage.setItem throw (quota / disabled storage) without crashing the render', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('QuotaExceededError');
      });
    expect(() =>
      renderHook(() =>
        usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
      ),
    ).not.toThrow();
    spy.mockRestore();
  });

  it('persisted writes survive an unmount + remount of the hook', () => {
    const first = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    act(() => first.result.current.setFontSize(20));
    first.unmount();
    const second = renderHook(() =>
      usePersistedFontSize({ defaultFont: 14, minFont: 8, maxFont: 32 }),
    );
    expect(second.result.current.fontSize).toBe(20);
  });
});
