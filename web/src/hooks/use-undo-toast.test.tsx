import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_UNDO_DURATION_MS,
  useUndoToast,
} from './use-undo-toast';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useUndoToast', () => {
  it('starts with no active toast', () => {
    const { result } = renderHook(() => useUndoToast());
    expect(result.current.active).toBeNull();
  });

  it('showUndo activates a toast with the given message', () => {
    const { result } = renderHook(() => useUndoToast());
    act(() => {
      result.current.showUndo({
        message: 'Cleared 3 items',
        onCommit: vi.fn(),
        onUndo: vi.fn(),
      });
    });
    expect(result.current.active).not.toBeNull();
    expect(result.current.active?.message).toBe('Cleared 3 items');
    expect(result.current.active?.durationMs).toBe(DEFAULT_UNDO_DURATION_MS);
    expect(result.current.active?.remainingMs).toBe(DEFAULT_UNDO_DURATION_MS);
    expect(result.current.active?.progress).toBe(0);
  });

  it('fires onCommit after the duration elapses', () => {
    const onCommit = vi.fn();
    const onUndo = vi.fn();
    const { result } = renderHook(() => useUndoToast());
    act(() => result.current.showUndo({ message: 'x', onCommit, onUndo }));
    act(() => {
      vi.advanceTimersByTime(DEFAULT_UNDO_DURATION_MS);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
    expect(result.current.active).toBeNull();
  });

  it('undo() fires onUndo, cancels onCommit, and clears the active toast', () => {
    const onCommit = vi.fn();
    const onUndo = vi.fn();
    const { result } = renderHook(() => useUndoToast());
    act(() => result.current.showUndo({ message: 'x', onCommit, onUndo }));
    act(() => {
      result.current.active?.undo();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.active).toBeNull();
    // Advancing past the duration must not fire a delayed commit.
    act(() => {
      vi.advanceTimersByTime(DEFAULT_UNDO_DURATION_MS + 100);
    });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('dismiss() commits immediately (no waiting for the timer)', () => {
    const onCommit = vi.fn();
    const onUndo = vi.fn();
    const { result } = renderHook(() => useUndoToast());
    act(() => result.current.showUndo({ message: 'x', onCommit, onUndo }));
    act(() => {
      result.current.active?.dismiss();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onUndo).not.toHaveBeenCalled();
    expect(result.current.active).toBeNull();
  });

  it('remainingMs counts down as time passes', () => {
    const { result } = renderHook(() => useUndoToast({ tickMs: 100 }));
    act(() => result.current.showUndo({ message: 'x', onCommit: vi.fn(), onUndo: vi.fn() }));
    expect(result.current.active?.remainingMs).toBe(DEFAULT_UNDO_DURATION_MS);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.active?.remainingMs).toBeLessThanOrEqual(
      DEFAULT_UNDO_DURATION_MS - 1000,
    );
    expect(result.current.active?.remainingMs).toBeGreaterThan(0);
  });

  it('progress increases from 0 toward 1 as the countdown elapses', () => {
    const { result } = renderHook(() => useUndoToast({ tickMs: 100 }));
    act(() => result.current.showUndo({ message: 'x', onCommit: vi.fn(), onUndo: vi.fn() }));
    expect(result.current.active?.progress).toBe(0);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.active?.progress).toBeGreaterThan(0);
    expect(result.current.active?.progress).toBeLessThanOrEqual(1);
  });

  it('respects a custom durationMs override', () => {
    const onCommit = vi.fn();
    const onUndo = vi.fn();
    const { result } = renderHook(() => useUndoToast({ durationMs: 2000 }));
    act(() => result.current.showUndo({ message: 'x', onCommit, onUndo }));
    expect(result.current.active?.durationMs).toBe(2000);
    act(() => {
      vi.advanceTimersByTime(1999);
    });
    expect(onCommit).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('showing a second toast commits the first', () => {
    const firstCommit = vi.fn();
    const firstUndo = vi.fn();
    const secondCommit = vi.fn();
    const secondUndo = vi.fn();
    const { result } = renderHook(() => useUndoToast());
    act(() =>
      result.current.showUndo({
        message: 'first',
        onCommit: firstCommit,
        onUndo: firstUndo,
      }),
    );
    act(() =>
      result.current.showUndo({
        message: 'second',
        onCommit: secondCommit,
        onUndo: secondUndo,
      }),
    );
    expect(firstCommit).toHaveBeenCalledTimes(1);
    expect(firstUndo).not.toHaveBeenCalled();
    expect(result.current.active?.message).toBe('second');
    expect(secondCommit).not.toHaveBeenCalled();
  });

  it('unmount cancels the pending commit (no leaked side effect)', () => {
    const onCommit = vi.fn();
    const onUndo = vi.fn();
    const { result, unmount } = renderHook(() => useUndoToast());
    act(() => result.current.showUndo({ message: 'x', onCommit, onUndo }));
    unmount();
    act(() => {
      vi.advanceTimersByTime(DEFAULT_UNDO_DURATION_MS + 1000);
    });
    expect(onCommit).not.toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('progress reaches 1 just before the commit fires', () => {
    const { result } = renderHook(() => useUndoToast({ tickMs: 50 }));
    act(() => result.current.showUndo({ message: 'x', onCommit: vi.fn(), onUndo: vi.fn() }));
    act(() => {
      vi.advanceTimersByTime(DEFAULT_UNDO_DURATION_MS - 50);
    });
    expect(result.current.active?.progress).toBeGreaterThan(0.9);
  });

  it('DEFAULT_UNDO_DURATION_MS exports the 5000 ms canonical value', () => {
    expect(DEFAULT_UNDO_DURATION_MS).toBe(5000);
  });
});
