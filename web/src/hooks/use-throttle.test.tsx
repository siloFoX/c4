import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useThrottle, useThrottledCallback } from './use-throttle';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useThrottle', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(({ v }) => useThrottle(v, 200), {
      initialProps: { v: 1 },
    });
    expect(result.current).toBe(1);
  });

  it('propagates the first update immediately (leading-edge)', () => {
    const { result, rerender } = renderHook(({ v }) => useThrottle(v, 200), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    expect(result.current).toBe(2);
  });

  it('suppresses subsequent updates inside the window', () => {
    const { result, rerender } = renderHook(({ v }) => useThrottle(v, 200), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    expect(result.current).toBe(2);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender({ v: 3 });
    expect(result.current).toBe(2);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    rerender({ v: 4 });
    expect(result.current).toBe(2);
  });

  it('after ms elapses, the next update propagates', () => {
    const { result, rerender } = renderHook(({ v }) => useThrottle(v, 100), {
      initialProps: { v: 'a' },
    });
    rerender({ v: 'b' });
    expect(result.current).toBe('b');
    rerender({ v: 'c' });
    expect(result.current).toBe('b');
    act(() => {
      vi.advanceTimersByTime(120);
    });
    rerender({ v: 'd' });
    expect(result.current).toBe('d');
  });

  it('does not crash when the component unmounts', () => {
    const { rerender, unmount } = renderHook(({ v }) => useThrottle(v, 200), {
      initialProps: { v: 1 },
    });
    rerender({ v: 2 });
    expect(() => unmount()).not.toThrow();
  });
});

describe('useThrottledCallback', () => {
  it('fires the first call immediately (leading-edge)', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(fn, 100));
    act(() => {
      result.current('a' as never);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('suppresses calls inside the window then accepts the next call after ms', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useThrottledCallback(fn, 100));
    act(() => {
      result.current('a' as never);
      result.current('b' as never);
      result.current('c' as never);
    });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');
    act(() => {
      vi.advanceTimersByTime(120);
    });
    act(() => {
      result.current('d' as never);
    });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('d');
  });

  it('uses the latest fn at call time', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(({ f }) => useThrottledCallback(f, 100), {
      initialProps: { f: first },
    });
    rerender({ f: second });
    act(() => {
      result.current('x' as never);
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('x');
  });

  it('ignores calls after unmount', () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useThrottledCallback(fn, 100));
    unmount();
    act(() => {
      result.current('x' as never);
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns a stable reference while ms is unchanged', () => {
    const fn = vi.fn();
    const { result, rerender } = renderHook(({ f }) => useThrottledCallback(f, 100), {
      initialProps: { f: fn },
    });
    const first = result.current;
    rerender({ f: vi.fn() });
    expect(result.current).toBe(first);
  });
});
