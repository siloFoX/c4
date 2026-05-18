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
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.419, TODO 11.401) ListVirtualizer primitive.
//
// Generalised virtual list with:
//   - Dynamic row heights (per-row estimate; measured ref-callback
//     after mount, fed back into the cumulative offset array).
//   - Smooth scroll (`scrollToIndex(idx, behaviour?)` imperative
//     handle).
//   - Sticky headers (items can be `type: 'header'`; the active
//     header pins to the top of the viewport while scrolling).
//   - Keyboard navigation (ArrowUp / ArrowDown / PageUp / PageDown
//     / Home / End; `activeIndex` controlled or uncontrolled;
//     active row auto-scrolled into view).
//   - End-reached callback (fires when the user reaches within
//     `endReachedThreshold` px of the bottom).
//
// Distinct from `<VirtualList>` (11.197, fixed-height) and
// `<VirtualTable>` (11.375, tabular). This primitive owns the
// general one-column case with variable row heights.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ListVirtualizerItemType = 'row' | 'header';

export interface ListVirtualizerItem<T = unknown> {
  id: string | number;
  data: T;
  type?: ListVirtualizerItemType;
  estimatedHeight?: number;
  disabled?: boolean;
}

export interface ListVirtualizerHandle {
  scrollToIndex: (
    index: number,
    behavior?: ScrollBehavior,
  ) => void;
  scrollToTop: (behavior?: ScrollBehavior) => void;
  getScrollTop: () => number;
}

export interface ListVirtualizerProps<T = unknown> {
  items: ListVirtualizerItem<T>[];
  renderItem: (
    item: ListVirtualizerItem<T>,
    context: {
      index: number;
      isActive: boolean;
      isSticky: boolean;
    },
  ) => ReactNode;
  estimatedRowHeight?: number;
  overscan?: number;
  height?: number | string;
  ariaLabel?: string;
  className?: string;

  activeIndex?: number;
  defaultActiveIndex?: number;
  onActiveIndexChange?: (index: number) => void;

  stickyHeaders?: boolean;
  scrollBehavior?: ScrollBehavior;

  onEndReached?: () => void;
  endReachedThreshold?: number;

  enableKeyboardNav?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export function computeItemOffsets<T>(
  items: ListVirtualizerItem<T>[],
  measured: Map<number, number>,
  defaultHeight: number,
): number[] {
  // offsets[i] = cumulative top of item i, offsets[items.length] = total height
  const offsets: number[] = new Array(items.length + 1).fill(0);
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    offsets[i] = acc;
    const m = measured.get(i);
    if (m !== undefined && Number.isFinite(m) && m > 0) {
      acc += m;
    } else {
      const item = items[i]!;
      const est =
        item.estimatedHeight !== undefined &&
        Number.isFinite(item.estimatedHeight) &&
        item.estimatedHeight > 0
          ? item.estimatedHeight
          : defaultHeight;
      acc += est;
    }
  }
  offsets[items.length] = acc;
  return offsets;
}

export interface VisibleRange {
  start: number;
  end: number;
}

export function findVisibleRange(
  offsets: number[],
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
): VisibleRange {
  const itemCount = offsets.length - 1;
  if (itemCount <= 0) return { start: 0, end: 0 };
  // Binary search for first item whose bottom > scrollTop
  let lo = 0;
  let hi = itemCount - 1;
  let start = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const bottom = offsets[mid + 1] ?? 0;
    if (bottom <= scrollTop) {
      lo = mid + 1;
    } else {
      start = mid;
      hi = mid - 1;
    }
  }
  // Walk forward for end
  const bottomLimit = scrollTop + viewportHeight;
  let end = start;
  while (end < itemCount && (offsets[end] ?? 0) < bottomLimit) {
    end += 1;
  }
  const overscanStart = Math.max(0, start - overscan);
  const overscanEnd = Math.min(itemCount, end + overscan);
  return { start: overscanStart, end: overscanEnd };
}

export function findStickyHeaderIndex<T>(
  items: ListVirtualizerItem<T>[],
  offsets: number[],
  scrollTop: number,
): number | null {
  let lastHeaderIdx: number | null = null;
  for (let i = 0; i < items.length; i++) {
    if (items[i]?.type !== 'header') continue;
    const top = offsets[i] ?? 0;
    if (top <= scrollTop) {
      lastHeaderIdx = i;
    } else {
      break;
    }
  }
  return lastHeaderIdx;
}

function clampIndex(idx: number, total: number): number {
  if (total <= 0) return 0;
  if (idx < 0) return 0;
  if (idx > total - 1) return total - 1;
  return idx;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const DEFAULT_ESTIMATED_HEIGHT = 48;
const DEFAULT_OVERSCAN = 4;
const DEFAULT_END_THRESHOLD = 64;

function sizeToCss(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

function ListVirtualizerInner<T>(
  {
    items,
    renderItem,
    estimatedRowHeight = DEFAULT_ESTIMATED_HEIGHT,
    overscan = DEFAULT_OVERSCAN,
    height = '100%',
    ariaLabel = 'List',
    className,
    activeIndex,
    defaultActiveIndex = 0,
    onActiveIndexChange,
    stickyHeaders = false,
    scrollBehavior = 'auto',
    onEndReached,
    endReachedThreshold = DEFAULT_END_THRESHOLD,
    enableKeyboardNav = true,
  }: ListVirtualizerProps<T>,
  ref: React.Ref<ListVirtualizerHandle>,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [measured, setMeasured] = useState<Map<number, number>>(
    () => new Map(),
  );

  // Per-row ref callback that stashes measured height.
  const setRowEl = useCallback(
    (index: number, el: HTMLDivElement | null) => {
      if (!el) return;
      const height = el.getBoundingClientRect().height;
      if (!Number.isFinite(height) || height <= 0) return;
      setMeasured((prev) => {
        if (prev.get(index) === height) return prev;
        const next = new Map(prev);
        next.set(index, height);
        return next;
      });
    },
    [],
  );

  // When items length shrinks, drop stale measurements.
  useEffect(() => {
    setMeasured((prev) => {
      let changed = false;
      const next = new Map<number, number>();
      for (const [idx, h] of prev.entries()) {
        if (idx < items.length) {
          next.set(idx, h);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items.length]);

  const offsets = useMemo(
    () => computeItemOffsets(items, measured, estimatedRowHeight),
    [items, measured, estimatedRowHeight],
  );

  const totalHeight = offsets[offsets.length - 1] ?? 0;

  const visibleRange = useMemo(
    () =>
      findVisibleRange(offsets, scrollTop, viewportH, overscan),
    [offsets, scrollTop, viewportH, overscan],
  );

  const stickyIdx = useMemo(
    () =>
      stickyHeaders
        ? findStickyHeaderIndex(items, offsets, scrollTop)
        : null,
    [stickyHeaders, items, offsets, scrollTop],
  );

  // --- Active index (keyboard + scrollToIndex) -------------------
  const isActiveControlled = activeIndex !== undefined;
  const [internalActive, setInternalActive] = useState<number>(
    () => clampIndex(defaultActiveIndex, items.length),
  );
  const effectiveActive = isActiveControlled
    ? clampIndex(activeIndex, items.length)
    : internalActive;

  const onActiveChangeRef = useRef(onActiveIndexChange);
  const onEndReachedRef = useRef(onEndReached);
  useEffect(() => {
    onActiveChangeRef.current = onActiveIndexChange;
    onEndReachedRef.current = onEndReached;
  }, [onActiveIndexChange, onEndReached]);

  const setActive = useCallback(
    (next: number) => {
      const clamped = clampIndex(next, items.length);
      if (!isActiveControlled) setInternalActive(clamped);
      onActiveChangeRef.current?.(clamped);
    },
    [items.length, isActiveControlled],
  );

  // --- Scroll handlers -----------------------------------------
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = el.scrollTop;
    setScrollTop(next);
    // End-reached detection
    if (onEndReachedRef.current) {
      const distanceFromBottom =
        el.scrollHeight - (next + el.clientHeight);
      if (distanceFromBottom <= endReachedThreshold) {
        onEndReachedRef.current();
      }
    }
  }, [endReachedThreshold]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportH(el.clientHeight);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scrollToIndex = useCallback(
    (index: number, behavior?: ScrollBehavior) => {
      const el = scrollRef.current;
      if (!el) return;
      if (typeof el.scrollTo !== 'function') return;
      const target = clampIndex(index, items.length);
      const offset = offsets[target] ?? 0;
      el.scrollTo({
        top: offset,
        behavior: behavior ?? scrollBehavior,
      });
    },
    [items.length, offsets, scrollBehavior],
  );

  const scrollToTop = useCallback(
    (behavior?: ScrollBehavior) => {
      const el = scrollRef.current;
      if (!el) return;
      if (typeof el.scrollTo !== 'function') return;
      el.scrollTo({
        top: 0,
        behavior: behavior ?? scrollBehavior,
      });
    },
    [scrollBehavior],
  );

  useImperativeHandle(
    ref,
    (): ListVirtualizerHandle => ({
      scrollToIndex,
      scrollToTop,
      getScrollTop: () => scrollRef.current?.scrollTop ?? 0,
    }),
    [scrollToIndex, scrollToTop],
  );

  // Auto-scroll active row into view when it changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (items.length === 0) return;
    if (typeof el.scrollTo !== 'function') return;
    const top = offsets[effectiveActive] ?? 0;
    const bottom = offsets[effectiveActive + 1] ?? 0;
    if (top < el.scrollTop) {
      el.scrollTo({ top, behavior: scrollBehavior });
    } else if (bottom > el.scrollTop + el.clientHeight) {
      const target = bottom - el.clientHeight;
      el.scrollTo({ top: target, behavior: scrollBehavior });
    }
  }, [effectiveActive, offsets, items.length, scrollBehavior]);

  // --- Keyboard -------------------------------------------------
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!enableKeyboardNav) return;
      if (items.length === 0) return;
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          setActive(effectiveActive + 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          setActive(effectiveActive - 1);
          break;
        case 'PageDown':
          event.preventDefault();
          {
            // Jump by one viewport's worth of items.
            const el = scrollRef.current;
            const step = el
              ? Math.max(1, Math.floor(el.clientHeight / estimatedRowHeight))
              : 5;
            setActive(effectiveActive + step);
          }
          break;
        case 'PageUp':
          event.preventDefault();
          {
            const el = scrollRef.current;
            const step = el
              ? Math.max(1, Math.floor(el.clientHeight / estimatedRowHeight))
              : 5;
            setActive(effectiveActive - step);
          }
          break;
        case 'Home':
          event.preventDefault();
          setActive(0);
          break;
        case 'End':
          event.preventDefault();
          setActive(items.length - 1);
          break;
        default:
          break;
      }
    },
    [enableKeyboardNav, items.length, effectiveActive, setActive, estimatedRowHeight],
  );

  // --- Render ----------------------------------------------------
  const visibleItems: number[] = [];
  for (let i = visibleRange.start; i < visibleRange.end; i++) {
    visibleItems.push(i);
  }

  const containerStyle: CSSProperties = {
    height: sizeToCss(height) ?? '100%',
    position: 'relative',
    overflowY: 'auto',
  };
  const spacerStyle: CSSProperties = {
    height: `${totalHeight}px`,
    position: 'relative',
  };

  return (
    <div
      ref={scrollRef}
      role="region"
      aria-label={ariaLabel}
      tabIndex={enableKeyboardNav ? 0 : -1}
      data-section="list-virtualizer"
      data-item-count={items.length}
      data-active-index={effectiveActive}
      data-sticky-headers={stickyHeaders ? 'true' : 'false'}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      style={containerStyle}
      className={cn(
        'rounded-md border border-border bg-card outline-none focus-visible:ring-2 focus-visible:ring-primary',
        className,
      )}
    >
      <div
        data-section="list-virtualizer-spacer"
        style={spacerStyle}
      >
        {stickyIdx !== null ? (
          <div
            data-section="list-virtualizer-sticky"
            data-sticky-index={stickyIdx}
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              transform: `translateY(${scrollTop}px)`,
              width: '100%',
            }}
          >
            {(() => {
              const item = items[stickyIdx]!;
              return (
                <div
                  data-section="list-virtualizer-item"
                  data-item-id={String(item.id)}
                  data-item-index={stickyIdx}
                  data-item-type="header"
                  data-active={
                    stickyIdx === effectiveActive ? 'true' : 'false'
                  }
                  data-sticky="true"
                >
                  {renderItem(item, {
                    index: stickyIdx,
                    isActive: stickyIdx === effectiveActive,
                    isSticky: true,
                  })}
                </div>
              );
            })()}
          </div>
        ) : null}
        {visibleItems.map((idx) => {
          const item = items[idx]!;
          const top = offsets[idx] ?? 0;
          const isHeader = item.type === 'header';
          // Skip rendering the sticky header in its anchored
          // position too (avoid duplicate).
          if (stickyHeaders && isHeader && idx === stickyIdx) {
            // Render a placeholder of the correct height to keep
            // the scroll math right (the sticky is positioned
            // separately above).
            return null;
          }
          const rowStyle: CSSProperties = {
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${top}px`,
          };
          return (
            <div
              key={item.id}
              ref={(el) => setRowEl(idx, el)}
              data-section="list-virtualizer-item"
              data-item-id={String(item.id)}
              data-item-index={idx}
              data-item-type={item.type ?? 'row'}
              data-active={idx === effectiveActive ? 'true' : 'false'}
              data-disabled={item.disabled === true ? 'true' : 'false'}
              style={rowStyle}
            >
              {renderItem(item, {
                index: idx,
                isActive: idx === effectiveActive,
                isSticky: false,
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ListVirtualizer = forwardRef(ListVirtualizerInner) as <T>(
  props: ListVirtualizerProps<T> & {
    ref?: React.Ref<ListVirtualizerHandle>;
  },
) => ReturnType<typeof ListVirtualizerInner>;

(ListVirtualizer as unknown as { displayName: string }).displayName =
  'ListVirtualizer';
