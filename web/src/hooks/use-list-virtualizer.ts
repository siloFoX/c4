import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type RefObject,
  type UIEvent,
} from 'react';

// (v1.11.227 / patch 11.209) useListVirtualizer.
//
// Lightweight, dependency-free windowed-list hook for the web UI.
// Returns a small set of values (`items`, `totalHeight`, `offsetY`,
// `containerProps`) that callers wire onto a scroll container + an
// inner translated block. Fixed-height rows only in v1: there is no
// dynamic measurement and no ResizeObserver. Designed for SSR-safe
// import paths -- nothing touches `window` until a scroll event has
// actually fired (the SSR-render pass uses `window.innerHeight` only
// when `window` is defined; otherwise the viewport falls back to 0
// which renders an empty visible window without crashing).

export interface VirtualItem {
  index: number;
  top: number;
}

export interface UseListVirtualizerOptions {
  itemCount: number;
  itemHeight: number;
  overscan?: number;
  containerRef?: RefObject<HTMLElement | null>;
}

export interface UseListVirtualizerResult {
  items: VirtualItem[];
  totalHeight: number;
  offsetY: number;
  containerProps: {
    onScroll: (event: UIEvent<HTMLElement>) => void;
    style: CSSProperties;
  };
}

const DEFAULT_OVERSCAN = 3;

function readInitialViewport(
  containerRef?: RefObject<HTMLElement | null>,
): number {
  const node = containerRef?.current ?? null;
  if (node && typeof node.clientHeight === 'number' && node.clientHeight > 0) {
    return node.clientHeight;
  }
  if (typeof window !== 'undefined' && typeof window.innerHeight === 'number') {
    return window.innerHeight;
  }
  return 0;
}

export function useListVirtualizer(
  options: UseListVirtualizerOptions,
): UseListVirtualizerResult {
  const { itemCount, itemHeight, containerRef } = options;
  const overscan = options.overscan ?? DEFAULT_OVERSCAN;

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);

  const onScroll = useCallback((event: UIEvent<HTMLElement>) => {
    const el = event.currentTarget;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewportHeight(el.clientHeight);
  }, []);

  const effectiveViewport =
    viewportHeight !== null ? viewportHeight : readInitialViewport(containerRef);

  const safeItemHeight = itemHeight > 0 ? itemHeight : 0;
  const safeCount = itemCount > 0 ? itemCount : 0;

  const totalHeight = safeCount * safeItemHeight;

  const rawStart =
    safeItemHeight > 0 ? Math.floor(scrollTop / safeItemHeight) : 0;
  const visibleSpan =
    safeItemHeight > 0 ? Math.ceil(effectiveViewport / safeItemHeight) : 0;

  let startIndex = Math.max(0, rawStart - overscan);
  let endIndex = Math.min(safeCount, rawStart + visibleSpan + overscan);
  // If a runaway scrollTop pushes the start past the end of the
  // list, clamp the window onto the tail so callers always see a
  // sensible last-page render instead of an empty band.
  if (startIndex >= safeCount && safeCount > 0) {
    const windowSpan = visibleSpan + 2 * overscan;
    startIndex = Math.max(0, safeCount - windowSpan);
    endIndex = safeCount;
  }
  if (endIndex < startIndex) endIndex = startIndex;
  if (safeCount === 0) {
    startIndex = 0;
    endIndex = 0;
  }

  const items = useMemo<VirtualItem[]>(() => {
    if (safeCount === 0 || safeItemHeight === 0) return [];
    const out: VirtualItem[] = [];
    for (let i = startIndex; i < endIndex; i += 1) {
      out.push({ index: i, top: i * safeItemHeight });
    }
    return out;
  }, [startIndex, endIndex, safeItemHeight, safeCount]);

  const offsetY = startIndex * safeItemHeight;

  const containerStyle: CSSProperties = useMemo(
    () => ({
      overflowY: 'auto',
      position: 'relative',
    }),
    [],
  );

  return {
    items,
    totalHeight,
    offsetY,
    containerProps: {
      onScroll,
      style: containerStyle,
    },
  };
}
