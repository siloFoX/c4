import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebounce, useDebouncedCallback } from './use-debounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebounce', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(({ v }) => useDebounce(v, 200), {
      initialProps: { v: 'a' },
    });
    expect(result.current).toBe('a');
  });

  it('holds old value until ms elapses, then updates', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 200), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('b');
  });

  it('rapid changes restart the timer so the latest value wins', () => {
    const { result, rerender } = renderHook(({ v }) => useDebounce(v, 200), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    rerender({ v: 'c' });
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe('c');
  });

  it('cancels the pending update on unmount', () => {
    const { result, rerender, unmount } = renderHook(({ v }) => useDebounce(v, 200), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe('a');
  });
});

describe('useDebouncedCallback', () => {
  it('fires once after ms with the last set of args', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 100));
    act(() => {
      result.current('a' as never);
      result.current('b' as never);
      result.current('c' as never);
    });
    expect(fn).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('c');
  });

  it('uses the latest fn at fire time', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ f }) => useDebouncedCallback(f, 100), {
      initialProps: { f: first },
    });
    act(() => {
      result.current('x' as never);
    });
    rerender({ f: second });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('x');
  });

  it('cancels pending callback on unmount', () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 100));
    act(() => {
      result.current('q' as never);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns a stable reference while ms is unchanged', () => {
    const fn = vi.fn();
    const { result, rerender } = renderHook(({ f }) => useDebouncedCallback(f, 100), {
      initialProps: { f: fn },
    });
    const first = result.current;
    rerender({ f: vi.fn() });
    expect(result.current).toBe(first);
  });
});
