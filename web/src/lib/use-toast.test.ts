import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useToast, TOAST_QUEUE_LIMIT } from './use-toast';

// useToast is a queue-backed ToastState store (v1.11.137). It still
// exposes the legacy single-slot triple ({toast, showToast,
// dismissToast}) so existing pages keep working unchanged: toast
// resolves to the most recent record in the queue, and dismissToast()
// with no id clears the whole queue, matching the prior semantics.
// The new surface is `toasts: ToastState[]` for the multi-toast case
// plus a `dismissToast(id)` overload to remove a specific entry.

describe('useToast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle: toast=null, toasts=[], and exposes showToast + dismissToast functions', () => {
    const { result } = renderHook(() => useToast());
    expect(result.current.toast).toBeNull();
    expect(result.current.toasts).toEqual([]);
    expect(typeof result.current.showToast).toBe('function');
    expect(typeof result.current.dismissToast).toBe('function');
  });

  it('showToast pushes a { id, message, type } record onto the queue', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('hello', 'success');
    });
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toast).not.toBeNull();
    expect(result.current.toast?.message).toBe('hello');
    expect(result.current.toast?.type).toBe('success');
    expect(typeof result.current.toast?.id).toBe('number');
  });

  it('first showToast id matches Date.now() (no tiebreak applied yet)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));
    const expected = Date.now();
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('msg', 'info');
    });
    expect(result.current.toast?.id).toBe(expected);
  });

  it('dismissToast() with no id clears the entire queue back to null', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('a', 'info');
      result.current.showToast('b', 'info');
    });
    expect(result.current.toasts.length).toBeGreaterThan(0);
    act(() => {
      result.current.dismissToast();
    });
    expect(result.current.toast).toBeNull();
    expect(result.current.toasts).toEqual([]);
  });

  it('a second showToast appends to the queue; toast singular tracks the latest', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('first', 'info');
    });
    const firstId = result.current.toast?.id;
    vi.advanceTimersByTime(10);
    act(() => {
      result.current.showToast('second', 'error');
    });
    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toast?.message).toBe('second');
    expect(result.current.toast?.type).toBe('error');
    expect(result.current.toast?.id).not.toBe(firstId);
    expect(result.current.toasts[0]?.message).toBe('first');
    expect(result.current.toasts[1]?.message).toBe('second');
  });

  it('two showToast calls produce different ids when system clock advances', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('a', 'info');
    });
    const idA = result.current.toasts[0]?.id;
    vi.advanceTimersByTime(50);
    act(() => {
      result.current.showToast('b', 'info');
    });
    const idB = result.current.toasts[1]?.id;
    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    expect(idB).toBeGreaterThan(idA!);
  });

  it('preserves each of the three ToastType values', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('s', 'success');
    });
    expect(result.current.toast?.type).toBe('success');
    act(() => {
      result.current.showToast('e', 'error');
    });
    expect(result.current.toast?.type).toBe('error');
    act(() => {
      result.current.showToast('i', 'info');
    });
    expect(result.current.toast?.type).toBe('info');
  });

  it('passes an empty message through verbatim (no validation)', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('', 'info');
    });
    expect(result.current.toast).not.toBeNull();
    expect(result.current.toast?.message).toBe('');
  });

  it('dismissToast() is a no-op when the queue is already empty', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.dismissToast();
    });
    expect(result.current.toast).toBeNull();
    expect(result.current.toasts).toEqual([]);
    act(() => {
      result.current.dismissToast();
    });
    expect(result.current.toast).toBeNull();
    expect(result.current.toasts).toEqual([]);
  });

  it('showToast reference is stable across renders (useCallback empty deps)', () => {
    const { result, rerender } = renderHook(() => useToast());
    const firstShow = result.current.showToast;
    rerender();
    expect(result.current.showToast).toBe(firstShow);
  });

  it('dismissToast reference is stable across renders (useCallback empty deps)', () => {
    const { result, rerender } = renderHook(() => useToast());
    const firstDismiss = result.current.dismissToast;
    rerender();
    expect(result.current.dismissToast).toBe(firstDismiss);
  });

  it('show then dismiss then show again returns to a populated slot', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('once', 'success');
    });
    act(() => {
      result.current.dismissToast();
    });
    expect(result.current.toast).toBeNull();
    act(() => {
      result.current.showToast('twice', 'error');
    });
    expect(result.current.toast?.message).toBe('twice');
    expect(result.current.toast?.type).toBe('error');
  });

  // ---- queue surface (v1.11.137) --------------------------------

  it('exposes the full queue via `toasts` as an array of ToastState records', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('a', 'success');
      result.current.showToast('b', 'info');
      result.current.showToast('c', 'error');
    });
    expect(result.current.toasts).toHaveLength(3);
    expect(result.current.toasts.map((t) => t.message)).toEqual(['a', 'b', 'c']);
    expect(result.current.toasts.map((t) => t.type)).toEqual([
      'success',
      'info',
      'error',
    ]);
  });

  it('caps the visible queue at TOAST_QUEUE_LIMIT, dropping older entries first', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      // Push one more than the limit; the oldest should be evicted.
      for (let i = 0; i < TOAST_QUEUE_LIMIT + 2; i++) {
        result.current.showToast(`m${i}`, 'info');
      }
    });
    expect(result.current.toasts).toHaveLength(TOAST_QUEUE_LIMIT);
    // After dropping the two oldest, the tail starts at m2 and
    // ends at the last pushed entry.
    expect(result.current.toasts[0]?.message).toBe('m2');
    expect(result.current.toasts[TOAST_QUEUE_LIMIT - 1]?.message).toBe(
      `m${TOAST_QUEUE_LIMIT + 1}`,
    );
  });

  it('dismissToast(id) removes only the matching record from the queue', () => {
    const { result } = renderHook(() => useToast());
    let middleId: number | null = null;
    act(() => {
      result.current.showToast('first', 'info');
      middleId = result.current.showToast('middle', 'success');
      result.current.showToast('last', 'error');
    });
    expect(result.current.toasts).toHaveLength(3);
    act(() => {
      result.current.dismissToast(middleId!);
    });
    expect(result.current.toasts).toHaveLength(2);
    expect(result.current.toasts.map((t) => t.message)).toEqual(['first', 'last']);
    // `toast` singular tracks the newest remaining entry.
    expect(result.current.toast?.message).toBe('last');
  });

  it('dismissToast(id) for an unknown id is a no-op', () => {
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('a', 'info');
    });
    const before = result.current.toasts;
    act(() => {
      result.current.dismissToast(999999999);
    });
    expect(result.current.toasts).toEqual(before);
  });

  it('showToast returns the id of the newly inserted record', () => {
    const { result } = renderHook(() => useToast());
    let returned = 0;
    act(() => {
      returned = result.current.showToast('with-return', 'info');
    });
    expect(returned).toBe(result.current.toast?.id);
  });

  it('rapid same-tick showToast calls still produce unique ids (tiebreak counter)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-13T12:00:00Z'));
    const { result } = renderHook(() => useToast());
    act(() => {
      result.current.showToast('a', 'info');
      result.current.showToast('b', 'info');
      result.current.showToast('c', 'info');
    });
    const ids = result.current.toasts.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
