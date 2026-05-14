import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  useWorkerBufferFlusher,
  WORKER_FLUSH_MS,
} from './use-worker-buffer-flusher';

// useWorkerBufferFlusher owns the PTY-output debounce. Contract:
//   - pendingBufRef is the write buffer the caller mutates directly
//     between scheduleFlush() calls
//   - flushWorkerBuffer reads the ref, clears it, then calls
//     appendLive('worker', stripAnsi(raw).trim()) — but only if the
//     cleaned text is non-empty
//   - scheduleFlush starts (or restarts) a WORKER_FLUSH_MS timeout that
//     fires flushWorkerBuffer; each new scheduleFlush call resets the
//     timer so bursts coalesce
//   - reset() drops the buffer and any pending timer without flushing
//   - flushWorkerBuffer also clears the timer so a no-op flush followed
//     by a timer fire does not double-flush

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWorkerBufferFlusher', () => {
  it('starts idle: pending buffer is empty, no pending timer', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    expect(result.current.pendingBufRef.current).toBe('');
    expect(result.current.flushTimerRef.current).toBeNull();
  });

  it('flushWorkerBuffer on an empty buffer does not call appendLive', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    act(() => {
      result.current.flushWorkerBuffer();
    });
    expect(appendLive).not.toHaveBeenCalled();
  });

  it('flushWorkerBuffer drains pendingBufRef and calls appendLive once with cleaned text', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    result.current.pendingBufRef.current = 'hello';
    act(() => {
      result.current.flushWorkerBuffer();
    });
    expect(appendLive).toHaveBeenCalledTimes(1);
    expect(appendLive).toHaveBeenCalledWith('worker', 'hello');
    expect(result.current.pendingBufRef.current).toBe('');
  });

  it('flushWorkerBuffer strips ANSI escape sequences before forwarding', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    result.current.pendingBufRef.current = '\x1b[31mhi\x1b[0m';
    act(() => {
      result.current.flushWorkerBuffer();
    });
    expect(appendLive).toHaveBeenCalledWith('worker', 'hi');
  });

  it('flushWorkerBuffer trims surrounding whitespace and skips when only whitespace remains', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    result.current.pendingBufRef.current = '   ';
    act(() => {
      result.current.flushWorkerBuffer();
    });
    expect(appendLive).not.toHaveBeenCalled();
    expect(result.current.pendingBufRef.current).toBe('');

    result.current.pendingBufRef.current = '  hello  ';
    act(() => {
      result.current.flushWorkerBuffer();
    });
    expect(appendLive).toHaveBeenCalledWith('worker', 'hello');
  });

  it('scheduleFlush schedules a WORKER_FLUSH_MS timer that fires flushWorkerBuffer', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    result.current.pendingBufRef.current = 'tick';
    act(() => {
      result.current.scheduleFlush();
    });
    expect(appendLive).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(WORKER_FLUSH_MS);
    });
    expect(appendLive).toHaveBeenCalledWith('worker', 'tick');
  });

  it('multiple scheduleFlush calls within the debounce window coalesce into one flush', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    result.current.pendingBufRef.current = 'part-1';
    act(() => {
      result.current.scheduleFlush();
    });
    act(() => {
      vi.advanceTimersByTime(WORKER_FLUSH_MS - 100);
    });
    // mid-burst: more bytes arrive
    result.current.pendingBufRef.current = 'part-1+part-2';
    act(() => {
      result.current.scheduleFlush();
    });
    // not yet expired
    act(() => {
      vi.advanceTimersByTime(WORKER_FLUSH_MS - 100);
    });
    expect(appendLive).not.toHaveBeenCalled();
    // now expire
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(appendLive).toHaveBeenCalledTimes(1);
    expect(appendLive).toHaveBeenCalledWith('worker', 'part-1+part-2');
  });

  it('flushWorkerBuffer clears flushTimerRef so a pending timer cannot double-flush', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    result.current.pendingBufRef.current = 'data';
    act(() => {
      result.current.scheduleFlush();
    });
    expect(result.current.flushTimerRef.current).not.toBeNull();
    act(() => {
      result.current.flushWorkerBuffer();
    });
    expect(result.current.flushTimerRef.current).toBeNull();
    // advance past the original deadline; the cleared timer must not
    // re-flush.
    act(() => {
      vi.advanceTimersByTime(WORKER_FLUSH_MS * 2);
    });
    expect(appendLive).toHaveBeenCalledTimes(1);
  });

  it('reset drops the buffer without calling appendLive', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    result.current.pendingBufRef.current = 'will be discarded';
    act(() => {
      result.current.reset();
    });
    expect(result.current.pendingBufRef.current).toBe('');
    expect(appendLive).not.toHaveBeenCalled();
  });

  it('reset clears a pending timer so it never fires', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    result.current.pendingBufRef.current = 'pending';
    act(() => {
      result.current.scheduleFlush();
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.flushTimerRef.current).toBeNull();
    act(() => {
      vi.advanceTimersByTime(WORKER_FLUSH_MS * 2);
    });
    expect(appendLive).not.toHaveBeenCalled();
  });

  it('the refs returned by the hook are stable across re-renders (refs by identity)', () => {
    const appendLive = vi.fn();
    const { result, rerender } = renderHook(() =>
      useWorkerBufferFlusher({ appendLive }),
    );
    const firstBuf = result.current.pendingBufRef;
    const firstTimer = result.current.flushTimerRef;
    rerender();
    expect(result.current.pendingBufRef).toBe(firstBuf);
    expect(result.current.flushTimerRef).toBe(firstTimer);
  });

  it('flushWorkerBuffer reference is stable when appendLive identity is unchanged', () => {
    const appendLive = vi.fn();
    const { result, rerender } = renderHook(() =>
      useWorkerBufferFlusher({ appendLive }),
    );
    const first = result.current.flushWorkerBuffer;
    rerender();
    expect(result.current.flushWorkerBuffer).toBe(first);
  });

  it('flushWorkerBuffer reference changes when appendLive identity changes (useCallback dep)', () => {
    const { result, rerender } = renderHook(
      ({ appendLive }: { appendLive: (role: 'worker', text: string) => void }) =>
        useWorkerBufferFlusher({ appendLive }),
      { initialProps: { appendLive: vi.fn() } },
    );
    const first = result.current.flushWorkerBuffer;
    rerender({ appendLive: vi.fn() });
    expect(result.current.flushWorkerBuffer).not.toBe(first);
  });

  it('WORKER_FLUSH_MS export is the documented 1200ms debounce window', () => {
    expect(WORKER_FLUSH_MS).toBe(1200);
  });

  it('reset is a safe no-op when nothing is pending', () => {
    const appendLive = vi.fn();
    const { result } = renderHook(() => useWorkerBufferFlusher({ appendLive }));
    expect(() => {
      act(() => {
        result.current.reset();
      });
    }).not.toThrow();
    expect(result.current.pendingBufRef.current).toBe('');
    expect(result.current.flushTimerRef.current).toBeNull();
    expect(appendLive).not.toHaveBeenCalled();
  });
});
