import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEffectiveCollapsed } from './use-effective-collapsed';

interface MqlHarness {
  fire: (next: boolean) => void;
  listenerCount: () => number;
  matchMediaMock: ReturnType<typeof vi.fn>;
}

function installMatchMedia(initial: boolean): MqlHarness {
  let matches = initial;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: '(min-width: 768px)',
    onchange: null,
    addEventListener: vi.fn((_: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    }),
    removeEventListener: vi.fn(
      (_: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
    ),
    dispatchEvent: () => false,
    addListener: vi.fn(),
    removeListener: vi.fn(),
  };
  const matchMediaMock = vi.fn().mockReturnValue(mql);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: matchMediaMock,
  });
  return {
    fire(next: boolean) {
      matches = next;
      for (const cb of listeners) {
        cb({ matches: next } as MediaQueryListEvent);
      }
    },
    listenerCount: () => listeners.size,
    matchMediaMock,
  };
}

let harness: MqlHarness;

beforeEach(() => {
  harness = installMatchMedia(true);
});

afterEach(() => {
  // @ts-expect-error - test cleanup
  delete window.matchMedia;
});

describe('useEffectiveCollapsed', () => {
  it('returns false when collapsed=false on desktop', () => {
    const { result } = renderHook(() => useEffectiveCollapsed(false));
    expect(result.current).toBe(false);
  });

  it('returns false when collapsed=false on mobile', () => {
    harness = installMatchMedia(false);
    const { result } = renderHook(() => useEffectiveCollapsed(false));
    expect(result.current).toBe(false);
  });

  it('returns true when collapsed=true on desktop', () => {
    const { result } = renderHook(() => useEffectiveCollapsed(true));
    expect(result.current).toBe(true);
  });

  it('returns false when collapsed=true on mobile (breakpoint guard)', () => {
    harness = installMatchMedia(false);
    const { result } = renderHook(() => useEffectiveCollapsed(true));
    expect(result.current).toBe(false);
  });

  it('flips to false when the media query crosses desktop -> mobile while collapsed=true', () => {
    const { result } = renderHook(() => useEffectiveCollapsed(true));
    expect(result.current).toBe(true);
    act(() => harness.fire(false));
    expect(result.current).toBe(false);
  });

  it('flips back to true when the media query crosses mobile -> desktop while collapsed=true', () => {
    harness = installMatchMedia(false);
    const { result } = renderHook(() => useEffectiveCollapsed(true));
    expect(result.current).toBe(false);
    act(() => harness.fire(true));
    expect(result.current).toBe(true);
  });

  it('re-evaluates when the collapsed prop flips on desktop', () => {
    const { result, rerender } = renderHook(
      ({ c }) => useEffectiveCollapsed(c),
      { initialProps: { c: true } },
    );
    expect(result.current).toBe(true);
    rerender({ c: false });
    expect(result.current).toBe(false);
    rerender({ c: true });
    expect(result.current).toBe(true);
  });

  it('registers a matchMedia change listener on mount', () => {
    renderHook(() => useEffectiveCollapsed(true));
    expect(harness.listenerCount()).toBe(1);
  });

  it('removes the matchMedia change listener on unmount', () => {
    const { unmount } = renderHook(() => useEffectiveCollapsed(true));
    expect(harness.listenerCount()).toBe(1);
    unmount();
    expect(harness.listenerCount()).toBe(0);
  });
});
