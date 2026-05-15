import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useViewportSize } from './use-viewport-size';

// Test harness:
//   - Stub window.innerWidth / innerHeight + dispatch 'resize'.
//   - Stub window.requestAnimationFrame / cancelAnimationFrame so
//     we control when the throttled flush runs (so we can verify
//     batching of multiple resize events into a single frame).

interface ViewportHarness {
  setSize: (width: number, height?: number) => void;
  flush: () => void;
  rafCalls: () => number;
  cafCalls: () => number;
  pending: () => number;
}

let harness: ViewportHarness;
let rafSpy: ReturnType<typeof vi.spyOn> | null = null;
let cafSpy: ReturnType<typeof vi.spyOn> | null = null;

function installHarness(initialWidth: number, initialHeight = 800): ViewportHarness {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: initialWidth,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: initialHeight,
  });
  const queue: FrameRequestCallback[] = [];
  let nextId = 1;
  let rafCount = 0;
  let cafCount = 0;
  rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafCount += 1;
    queue.push(cb);
    return nextId++;
  });
  cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
    cafCount += 1;
    // Effect-side bookkeeping; drop pending callbacks so a late
    // flush does not fire after unmount.
    queue.length = 0;
  });
  return {
    setSize(width, height = window.innerHeight) {
      (window as unknown as { innerWidth: number }).innerWidth = width;
      (window as unknown as { innerHeight: number }).innerHeight = height;
      window.dispatchEvent(new Event('resize'));
    },
    flush() {
      const drained = queue.splice(0);
      for (const cb of drained) cb(performance.now());
    },
    rafCalls: () => rafCount,
    cafCalls: () => cafCount,
    pending: () => queue.length,
  };
}

beforeEach(() => {
  harness = installHarness(1440, 900);
});

afterEach(() => {
  rafSpy?.mockRestore();
  cafSpy?.mockRestore();
  rafSpy = null;
  cafSpy = null;
});

describe('useViewportSize', () => {
  it('classifies width > 1024 as desktop on mount', () => {
    harness = installHarness(1440, 900);
    const { result } = renderHook(() => useViewportSize());
    // First state was set during render via the useState
    // initialiser; the mount-time flush is queued but not yet
    // run, so result is already correct.
    expect(result.current).toEqual({
      width: 1440,
      height: 900,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
    });
  });

  it('classifies width 767 as mobile (just below the 768 boundary)', () => {
    harness = installHarness(767, 500);
    const { result } = renderHook(() => useViewportSize());
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.width).toBe(767);
    expect(result.current.height).toBe(500);
  });

  it('classifies width 768 as tablet (lower inclusive boundary)', () => {
    harness = installHarness(768, 1024);
    const { result } = renderHook(() => useViewportSize());
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isDesktop).toBe(false);
  });

  it('classifies width 1024 as tablet (upper inclusive boundary)', () => {
    harness = installHarness(1024, 768);
    const { result } = renderHook(() => useViewportSize());
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isDesktop).toBe(false);
  });

  it('classifies width 1025 as desktop (just above 1024)', () => {
    harness = installHarness(1025);
    const { result } = renderHook(() => useViewportSize());
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(true);
  });

  it('updates from desktop to mobile on resize', () => {
    harness = installHarness(1440, 900);
    const { result } = renderHook(() => useViewportSize());
    expect(result.current.isDesktop).toBe(true);
    act(() => {
      harness.setSize(400, 800);
      harness.flush();
    });
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.width).toBe(400);
    expect(result.current.height).toBe(800);
  });

  it('updates from mobile to tablet to desktop in sequence', () => {
    harness = installHarness(320);
    const { result } = renderHook(() => useViewportSize());
    expect(result.current.isMobile).toBe(true);
    act(() => {
      harness.setSize(800);
      harness.flush();
    });
    expect(result.current.isTablet).toBe(true);
    act(() => {
      harness.setSize(1440);
      harness.flush();
    });
    expect(result.current.isDesktop).toBe(true);
  });

  it('coalesces multiple resize events into a single rAF flush', () => {
    harness = installHarness(1200);
    renderHook(() => useViewportSize());
    // Drain the mount-time flush (initial sync) so the next rAF
    // we count is purely from resize coalescing.
    act(() => harness.flush());
    const rafBefore = harness.rafCalls();
    act(() => {
      harness.setSize(900);
      harness.setSize(800);
      harness.setSize(500);
    });
    // Three resize events, but only one rAF should be scheduled
    // while a frame is still pending.
    expect(harness.rafCalls() - rafBefore).toBe(1);
    expect(harness.pending()).toBe(1);
  });

  it('removes the resize listener and cancels pending frame on unmount', () => {
    harness = installHarness(1200);
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount, result } = renderHook(() => useViewportSize());
    const beforeUnmount = result.current;
    // Schedule a frame that will be pending at unmount time.
    act(() => {
      harness.setSize(400);
    });
    unmount();
    expect(harness.cafCalls()).toBeGreaterThan(0);
    // Listener cleanup observed.
    const calls = removeSpy.mock.calls.filter((c) => c[0] === 'resize');
    expect(calls.length).toBeGreaterThan(0);
    // Late events after unmount must not throw or mutate the
    // captured snapshot.
    harness.setSize(200);
    harness.flush();
    expect(result.current).toEqual(beforeUnmount);
    removeSpy.mockRestore();
  });

  it('keeps reference identity when a resize lands on the same bucket and dimensions', () => {
    harness = installHarness(1200);
    const { result } = renderHook(() => useViewportSize());
    act(() => harness.flush());
    const first = result.current;
    act(() => {
      // Fire a resize without changing width/height. The hook
      // should bail out of setState and preserve the prior
      // object reference.
      harness.setSize(1200);
      harness.flush();
    });
    expect(result.current).toBe(first);
  });
});
