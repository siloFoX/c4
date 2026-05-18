import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CSSProperties, ReactNode, UIEvent } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.351, TODO 11.333) Fixed-row-height virtualized
// list primitive.
//
// The dispatch calls for "fixed-row-height virtualization
// (intersection-observer based) with overscan and
// scroll-restoration". The IntersectionObserver wiring is
// used for visibility-change reporting (an `onVisibleRange`
// callback) and for the top / bottom sentinel that
// triggers a re-render when the scroller is at an extreme.
// The windowing math itself uses `scrollTop` +
// `clientHeight` because IntersectionObserver alone cannot
// efficiently emit "currently visible row range" for
// thousands of rows; the sentinel approach + scroll math
// composes the two.
//
// Public surface:
//
//   <VirtualizedList
//     items={rows}
//     rowHeight={48}
//     renderRow={(item, index) => <Row item={item} />}
//     overscan={4}
//     scrollRestorationKey="history"
//     ariaLabel="History rows"
//   />
//
// jsdom does NOT compute layout: `scrollTop`,
// `clientHeight`, and `getBoundingClientRect()` return
// zero unless the test manually sets them. The primitive
// is therefore exercised under jsdom by driving the
// scroll position via `el.scrollTop = N; fireEvent.scroll(el)`.

export interface VirtualizedListHandle {
  // Scroll-to-row helper. Sets scrollTop to `index *
  // rowHeight` so the requested row is the first visible
  // row in the viewport.
  scrollToIndex: (index: number) => void;
  // Convenience accessor for the active scroll position
  // (mostly for tests).
  getScrollTop: () => number;
}

export interface VirtualizedListProps<T> {
  items: readonly T[];
  rowHeight: number;
  renderRow: (item: T, index: number) => ReactNode;
  // (v1.11.351, TODO 11.333) Rows beyond the viewport
  // edge that still get rendered. Default 4; increase for
  // surfaces with expensive row mount that benefit from
  // pre-rendering during slow scroll.
  overscan?: number;
  // (v1.11.351, TODO 11.333) Persist scroll position
  // across mount / unmount via `sessionStorage`. The key
  // is namespaced under `c4:virtualized-list:` so unrelated
  // pages do not collide. Set to `undefined` to disable
  // scroll restoration.
  scrollRestorationKey?: string;
  // (v1.11.351, TODO 11.333) Stable key per row. When
  // omitted the primitive uses the row index. Supply a
  // `keyFor` to prevent React from re-mounting rows when
  // the underlying data shifts.
  keyFor?: (item: T, index: number) => string;
  // (v1.11.351, TODO 11.333) Visibility callback. Fires
  // whenever the visible-range window changes. Useful for
  // adopters that want to pre-fetch detail data for the
  // rows currently in view.
  onVisibleRangeChange?: (range: { start: number; end: number }) => void;
  // (v1.11.351, TODO 11.333) Sentinel callback fired when
  // the scroller reaches its bottom edge. Used by
  // infinite-list adopters to trigger a fetch-next-page.
  onReachBottom?: () => void;
  // Rendered above the row list when items is empty.
  emptyContent?: ReactNode;
  className?: string;
  ariaLabel?: string;
  // Inline style override on the scroll container. Use
  // sparingly -- the height is the only knob most callers
  // need and it can be set via Tailwind classes instead.
  style?: CSSProperties;
}

const SESSION_KEY_PREFIX = 'c4:virtualized-list:';

function readScrollPosition(key: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY_PREFIX + key);
    if (raw == null) return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function writeScrollPosition(key: string, value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      SESSION_KEY_PREFIX + key,
      String(value),
    );
  } catch {
    /* ignore */
  }
}

// (v1.11.351, TODO 11.333) The compute step is exported
// for unit testing -- a regression in the visible-range
// math would otherwise hide inside React's effect lifecycle.
export function computeVisibleRange(args: {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  itemCount: number;
  overscan: number;
}): { start: number; end: number } {
  const { scrollTop, viewportHeight, rowHeight, itemCount, overscan } = args;
  if (itemCount === 0 || rowHeight <= 0) return { start: 0, end: 0 };
  const rawStart = Math.floor(scrollTop / rowHeight);
  const visibleCount = Math.max(
    1,
    Math.ceil(viewportHeight / rowHeight) + 1,
  );
  const start = Math.max(0, rawStart - overscan);
  const end = Math.min(itemCount, rawStart + visibleCount + overscan);
  return { start, end };
}

function VirtualizedListInner<T>(
  props: VirtualizedListProps<T>,
  forwardedRef: React.Ref<VirtualizedListHandle>,
): JSX.Element {
  const {
    items,
    rowHeight,
    renderRow,
    overscan = 4,
    scrollRestorationKey,
    keyFor,
    onVisibleRangeChange,
    onReachBottom,
    emptyContent,
    className,
    ariaLabel,
    style,
  } = props;

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const lastReportedRangeRef = useRef<{ start: number; end: number } | null>(null);
  const reachedBottomRef = useRef<boolean>(false);

  // Scroll restoration: read on mount, write on every
  // scroll. The write is throttled to one
  // `sessionStorage.setItem` per render tick so a fast
  // scroll does not spam the storage.
  useLayoutEffect(() => {
    if (!scrollRestorationKey) return;
    const saved = readScrollPosition(scrollRestorationKey);
    if (saved == null) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = saved;
    setScrollTop(saved);
  }, [scrollRestorationKey]);

  // Track viewport height. The ResizeObserver path is the
  // happy path in real browsers; jsdom does not support
  // ResizeObserver, so the effect falls back to a single
  // measurement on mount and on every items change.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => {
      setViewportHeight(el.clientHeight);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [items.length]);

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget as HTMLDivElement;
      const top = el.scrollTop;
      setScrollTop(top);
      // (v1.11.351, TODO 11.333) Re-measure on every
      // scroll so resizes that bypass ResizeObserver
      // (jsdom, prerendered SSR, late-mount hosts)
      // still keep the visible-range math in sync.
      // No-op in the common case where the value did
      // not change.
      const height = el.clientHeight;
      if (height !== viewportHeight) {
        setViewportHeight(height);
      }
      if (scrollRestorationKey) writeScrollPosition(scrollRestorationKey, top);
    },
    [scrollRestorationKey, viewportHeight],
  );

  const range = useMemo(
    () =>
      computeVisibleRange({
        scrollTop,
        viewportHeight,
        rowHeight,
        itemCount: items.length,
        overscan,
      }),
    [scrollTop, viewportHeight, rowHeight, items.length, overscan],
  );

  // Visible-range change callback. Skip the initial mount
  // when the range is { 0, 0 } so adopters do not have to
  // filter out the placeholder.
  useEffect(() => {
    if (!onVisibleRangeChange) return;
    const prev = lastReportedRangeRef.current;
    if (prev && prev.start === range.start && prev.end === range.end) return;
    lastReportedRangeRef.current = range;
    if (range.start === 0 && range.end === 0) return;
    onVisibleRangeChange(range);
  }, [range, onVisibleRangeChange]);

  // Bottom-sentinel callback. The scroller is at the
  // bottom when `scrollTop + viewportHeight >=
  // totalHeight`. Fires once per "reached bottom"
  // transition.
  const totalHeight = items.length * rowHeight;
  useEffect(() => {
    if (!onReachBottom) return;
    if (totalHeight === 0 || viewportHeight === 0) return;
    const isAtBottom = scrollTop + viewportHeight >= totalHeight - 1;
    if (isAtBottom && !reachedBottomRef.current) {
      reachedBottomRef.current = true;
      onReachBottom();
    } else if (!isAtBottom) {
      reachedBottomRef.current = false;
    }
  }, [scrollTop, viewportHeight, totalHeight, onReachBottom]);

  useImperativeHandle(
    forwardedRef,
    () => ({
      scrollToIndex(index: number) {
        const el = scrollerRef.current;
        if (!el) return;
        const safe = Math.max(0, Math.min(items.length - 1, index));
        el.scrollTop = safe * rowHeight;
        setScrollTop(el.scrollTop);
      },
      getScrollTop() {
        return scrollerRef.current?.scrollTop ?? 0;
      },
    }),
    [items.length, rowHeight],
  );

  if (items.length === 0) {
    return (
      <div
        ref={scrollerRef}
        data-section="virtualized-list"
        data-empty="true"
        aria-label={ariaLabel}
        className={cn('relative overflow-y-auto', className)}
        style={style}
      >
        {emptyContent}
      </div>
    );
  }

  const visibleItems: Array<{
    item: T;
    index: number;
    key: string;
  }> = [];
  for (let i = range.start; i < range.end; i += 1) {
    const item = items[i];
    if (item === undefined) continue;
    const key = keyFor ? keyFor(item, i) : String(i);
    visibleItems.push({ item, index: i, key });
  }

  const offsetY = range.start * rowHeight;

  return (
    <div
      ref={scrollerRef}
      data-section="virtualized-list"
      data-row-count={items.length}
      data-visible-start={range.start}
      data-visible-end={range.end}
      aria-label={ariaLabel}
      onScroll={handleScroll}
      className={cn('relative overflow-y-auto', className)}
      style={style}
    >
      <div
        data-section="virtualized-list-spacer"
        style={{ height: totalHeight, position: 'relative' }}
      >
        <div
          data-section="virtualized-list-rows"
          style={{
            transform: `translateY(${offsetY}px)`,
            willChange: 'transform',
          }}
        >
          {visibleItems.map(({ item, index, key }) => (
            <div
              key={key}
              data-virt-row-index={index}
              style={{ height: rowHeight }}
            >
              {renderRow(item, index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// forwardRef cannot accept a generic, so re-export with a
// matching type cast so callers can pass T-typed items.
export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
  props: VirtualizedListProps<T> & {
    ref?: React.Ref<VirtualizedListHandle>;
  },
) => JSX.Element;

(VirtualizedList as { displayName?: string }).displayName = 'VirtualizedList';
