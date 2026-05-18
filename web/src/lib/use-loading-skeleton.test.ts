// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS,
  LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS,
  useLoadingSkeleton,
} from './use-loading-skeleton';

// (v1.11.353, TODO 11.335) The hook orchestrates two
// timers (show + hide). Fake timers let us drive every
// transition deterministically without sleeping.

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useLoadingSkeleton', () => {
  it('returns false on the very first render', () => {
    const { result } = renderHook(() => useLoadingSkeleton(false));
    expect(result.current).toBe(false);
  });

  it('exports the canonical default delays', () => {
    expect(LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS).toBe(120);
    expect(LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS).toBe(300);
  });

  // (v1.11.353, TODO 11.335) Fast responses (<showAfterMs)
  // never show the skeleton.
  it('does NOT show the skeleton when loading clears before showAfterMs', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useLoadingSkeleton(loading),
      { initialProps: { loading: true } },
    );
    // 50ms in, still under the default 120ms gate.
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe(false);
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(false);
  });

  // (v1.11.353, TODO 11.335) Loading still true after the
  // showAfterMs gate -- skeleton appears.
  it('shows the skeleton when loading stays true past showAfterMs', () => {
    const { result } = renderHook(() => useLoadingSkeleton(true));
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS);
    });
    expect(result.current).toBe(true);
  });

  // (v1.11.353, TODO 11.335) Min-display window: skeleton
  // stays visible for the full minDisplayMs even when
  // loading drops to false immediately after the show.
  it('keeps the skeleton visible for the full minDisplayMs after show', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useLoadingSkeleton(loading),
      { initialProps: { loading: true } },
    );
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS);
    });
    expect(result.current).toBe(true);
    // Loading drops 10ms after show. Skeleton must
    // stay visible until 290ms more elapse.
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(10);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS - 20);
    });
    // Right at minDisplay - 10 from the show; should still be true.
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(20);
    });
    // Past minDisplay -- skeleton hides.
    expect(result.current).toBe(false);
  });

  // (v1.11.353, TODO 11.335) Once min-display has elapsed,
  // a subsequent loading=false hides immediately.
  it('hides the skeleton immediately when loading clears after minDisplayMs', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useLoadingSkeleton(loading),
      { initialProps: { loading: true } },
    );
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS);
    });
    expect(result.current).toBe(true);
    // Stay loading well past the minDisplay window.
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS * 2);
    });
    rerender({ loading: false });
    act(() => {
      // Allow the hide effect to schedule (remaining=0 -> setTimeout(0)).
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(false);
  });

  // (v1.11.353, TODO 11.335) Caller-supplied options.
  it('honours a caller-supplied showAfterMs', () => {
    const { result } = renderHook(() =>
      useLoadingSkeleton(true, { showAfterMs: 50 }),
    );
    act(() => {
      vi.advanceTimersByTime(49);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('honours a caller-supplied minDisplayMs', () => {
    const { result, rerender } = renderHook(
      ({ loading }) =>
        useLoadingSkeleton(loading, {
          showAfterMs: 0,
          minDisplayMs: 100,
        }),
      { initialProps: { loading: true } },
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(result.current).toBe(true);
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe(true);
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe(false);
  });

  // (v1.11.353, TODO 11.335) Mid-window flip: loading
  // toggles true again WHILE we are in the min-display
  // hold. The skeleton should stay shown and the hide
  // timer should be cancelled.
  it('cancels the pending hide when loading flips true again during minDisplay', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useLoadingSkeleton(loading),
      { initialProps: { loading: true } },
    );
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS);
    });
    expect(result.current).toBe(true);
    // Loading drops + we are in the hide-window.
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    // Loading comes back. Cancel the hide; stay shown.
    rerender({ loading: true });
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS);
    });
    expect(result.current).toBe(true);
  });

  // (v1.11.353, TODO 11.335) Mid-window flip: loading
  // toggles false WHILE we are in the show-after delay.
  // The skeleton should never appear.
  it('cancels the pending show when loading drops during showAfterMs', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useLoadingSkeleton(loading),
      { initialProps: { loading: true } },
    );
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current).toBe(false);
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(false);
  });

  // (v1.11.353, TODO 11.335) Second loading cycle after a
  // clean first cycle works the same way as the first.
  it('handles consecutive loading cycles independently', () => {
    const { result, rerender } = renderHook(
      ({ loading }) => useLoadingSkeleton(loading),
      { initialProps: { loading: true } },
    );
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS);
    });
    expect(result.current).toBe(true);
    rerender({ loading: false });
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS);
    });
    expect(result.current).toBe(false);
    // Second cycle.
    rerender({ loading: true });
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS);
    });
    expect(result.current).toBe(true);
  });

  // (v1.11.353, TODO 11.335) Unmount cleanup: no
  // setState-after-unmount warning from the hide timer.
  it('clears pending timers on unmount (no setState after unmount)', () => {
    const { result, unmount } = renderHook(() =>
      useLoadingSkeleton(true),
    );
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS);
    });
    expect(result.current).toBe(true);
    unmount();
    // Advance past any pending callbacks; no error should
    // surface.
    act(() => {
      vi.advanceTimersByTime(LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS * 2);
    });
    // Test passes if no warning / throw happens.
  });
});
