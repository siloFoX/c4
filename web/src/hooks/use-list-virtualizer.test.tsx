import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRef, type UIEvent } from 'react';
import { useListVirtualizer } from './use-list-virtualizer';

// Synthetic scroll event helper. The hook reads scrollTop +
// clientHeight off `event.currentTarget`, so we hand it a minimal
// object that satisfies the shape without mounting a real DOM
// container.
function fireScroll(
  onScroll: (event: UIEvent<HTMLElement>) => void,
  scrollTop: number,
  clientHeight: number,
) {
  onScroll({
    currentTarget: { scrollTop, clientHeight } as unknown as HTMLElement,
  } as unknown as UIEvent<HTMLElement>);
}

const ORIGINAL_INNER_HEIGHT = window.innerHeight;

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: 600,
  });
});

afterEach(() => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: ORIGINAL_INNER_HEIGHT,
  });
});

describe('useListVirtualizer', () => {
  it('returns a top-anchored window of items at scrollTop=0 (default render)', () => {
    const { result } = renderHook(() =>
      useListVirtualizer({ itemCount: 1000, itemHeight: 50 }),
    );
    // viewport defaults to window.innerHeight (600) -> 12 visible
    // rows + 3 overscan above (clamped to 0) + 3 overscan below.
    expect(result.current.items[0]?.index).toBe(0);
    expect(result.current.items[0]?.top).toBe(0);
    expect(result.current.items.length).toBe(15);
    expect(result.current.offsetY).toBe(0);
  });

  it('updates the visible window on a scroll event', () => {
    const { result } = renderHook(() =>
      useListVirtualizer({ itemCount: 1000, itemHeight: 50 }),
    );
    act(() => {
      fireScroll(result.current.containerProps.onScroll, 500, 600);
    });
    // rawStart = floor(500/50) = 10; window 10..(10+12); overscan 3.
    expect(result.current.items[0]?.index).toBe(7);
    expect(result.current.items[result.current.items.length - 1]?.index).toBe(
      24,
    );
    expect(result.current.offsetY).toBe(7 * 50);
  });

  it('honours custom overscan above and below the visible band', () => {
    const { result } = renderHook(() =>
      useListVirtualizer({ itemCount: 1000, itemHeight: 50, overscan: 5 }),
    );
    act(() => {
      fireScroll(result.current.containerProps.onScroll, 500, 600);
    });
    // rawStart=10, overscan=5 -> start=5, end=10+12+5=27.
    expect(result.current.items[0]?.index).toBe(5);
    expect(result.current.items[result.current.items.length - 1]?.index).toBe(
      26,
    );
  });

  it('totalHeight equals itemCount * itemHeight', () => {
    const { result } = renderHook(() =>
      useListVirtualizer({ itemCount: 217, itemHeight: 32 }),
    );
    expect(result.current.totalHeight).toBe(217 * 32);
  });

  it('offsetY moves with startIndex as the user scrolls', () => {
    const { result } = renderHook(() =>
      useListVirtualizer({ itemCount: 1000, itemHeight: 40, overscan: 0 }),
    );
    act(() => {
      fireScroll(result.current.containerProps.onScroll, 0, 400);
    });
    expect(result.current.offsetY).toBe(0);
    act(() => {
      fireScroll(result.current.containerProps.onScroll, 800, 400);
    });
    // rawStart=20, overscan=0 -> startIndex=20.
    expect(result.current.items[0]?.index).toBe(20);
    expect(result.current.offsetY).toBe(20 * 40);
  });

  it('itemCount=0 returns an empty items array and totalHeight=0', () => {
    const { result } = renderHook(() =>
      useListVirtualizer({ itemCount: 0, itemHeight: 50 }),
    );
    expect(result.current.items).toEqual([]);
    expect(result.current.totalHeight).toBe(0);
    expect(result.current.offsetY).toBe(0);
  });

  it('clamps the visible window to the last items when scrolled past the end', () => {
    const { result } = renderHook(() =>
      useListVirtualizer({ itemCount: 30, itemHeight: 50, overscan: 2 }),
    );
    // total scroll height = 30 * 50 = 1500. Push scrollTop way past it.
    act(() => {
      fireScroll(result.current.containerProps.onScroll, 9999, 200);
    });
    const last = result.current.items[result.current.items.length - 1];
    expect(last?.index).toBe(29);
    // No item index should overrun the count.
    for (const item of result.current.items) {
      expect(item.index).toBeLessThan(30);
    }
  });

  it('uses containerRef.clientHeight as the initial viewport when provided', () => {
    const ref = createRef<HTMLElement>();
    Object.defineProperty(ref, 'current', {
      writable: true,
      value: { clientHeight: 320 } as HTMLElement,
    });
    const { result } = renderHook(() =>
      useListVirtualizer({
        itemCount: 1000,
        itemHeight: 40,
        overscan: 0,
        containerRef: ref,
      }),
    );
    // 320 / 40 = 8 visible rows at top.
    expect(result.current.items.length).toBe(8);
  });

  it('falls back to 0 viewport when window.innerHeight is unavailable (SSR-safe)', () => {
    // Real SSR strips `window` entirely, but we cannot remove it
    // here because React DOM's renderer reads it. Instead, simulate
    // the SSR path by clearing innerHeight -- the hook's guard
    // (`typeof window.innerHeight === 'number'`) then falls through
    // to the 0-viewport branch and renders no items rather than
    // crashing.
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const { result } = renderHook(() =>
      useListVirtualizer({ itemCount: 100, itemHeight: 20 }),
    );
    expect(result.current.totalHeight).toBe(2000);
    expect(result.current.offsetY).toBe(0);
    // viewport collapses to 0 -> only the overscan band renders.
    expect(result.current.items.length).toBe(3);
    expect(result.current.items[0]?.index).toBe(0);
  });
});
