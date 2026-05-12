import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useCopyPulse } from './use-copy-pulse';

let writeText: Mock<(text: string) => Promise<void>>;

beforeEach(() => {
  vi.useFakeTimers();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
});

describe('useCopyPulse', () => {
  it('starts with copied=false and exposes a copy callback', () => {
    const { result } = renderHook(() => useCopyPulse({ text: 'hi' }));
    expect(result.current.copied).toBe(false);
    expect(typeof result.current.copy).toBe('function');
  });

  it('flips copied=true after copy() resolves', async () => {
    const { result } = renderHook(() => useCopyPulse({ text: 'payload' }));
    await act(async () => {
      await result.current.copy();
    });
    expect(result.current.copied).toBe(true);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('payload');
  });

  it('auto-clears copied back to false after the default 1500ms', async () => {
    const { result } = renderHook(() => useCopyPulse({ text: 'x' }));
    await act(async () => {
      await result.current.copy();
    });
    expect(result.current.copied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1499);
    });
    expect(result.current.copied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.copied).toBe(false);
  });

  it('honors a per-hook durationMs override', async () => {
    const { result } = renderHook(() =>
      useCopyPulse({ text: 'x', durationMs: 500 }),
    );
    await act(async () => {
      await result.current.copy();
    });
    expect(result.current.copied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.copied).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.copied).toBe(false);
  });

  it('picks up the latest text when the prop changes (callback dep)', async () => {
    const { result, rerender } = renderHook(({ text }) => useCopyPulse({ text }), {
      initialProps: { text: 'one' },
    });
    rerender({ text: 'two' });
    await act(async () => {
      await result.current.copy();
    });
    expect(writeText).toHaveBeenLastCalledWith('two');
  });

  it('is SSR-safe: copy() does not throw when navigator.clipboard is undefined', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useCopyPulse({ text: 'no-clip' }));
    await act(async () => {
      await result.current.copy();
    });
    expect(result.current.copied).toBe(true);
    expect(writeText).not.toHaveBeenCalled();
  });

  it('does not throw when the pulse timer fires after unmount', async () => {
    const { result, unmount } = renderHook(() => useCopyPulse({ text: 'x' }));
    await act(async () => {
      await result.current.copy();
    });
    unmount();
    expect(() => {
      vi.advanceTimersByTime(5000);
    }).not.toThrow();
  });
});
