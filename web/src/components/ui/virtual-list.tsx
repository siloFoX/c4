import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.197) VirtualList primitive. Windowed list rendering for long
// fixed-height lists. Outer scroll container drives the visible range
// based on scrollTop + measured clientHeight + overscan rows. Each
// visible item is absolutely positioned over an inner spacer sized to
// items.length * itemHeight so the native scrollbar reflects the full
// list. ResizeObserver tracks container height changes; scroll uses a
// passive listener. Optional `onEndReached` callback is wired through
// an IntersectionObserver sentinel at the bottom of the spacer so
// callers can lazy-load more rows. No external libraries; cn() only.

export interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  height?: number | string;
  estimatedHeight?: number;
  className?: string;
  ariaLabel?: string;
  getKey?: (item: T, index: number) => string | number;
  onEndReached?: () => void;
}

function sizeToCss(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

function VirtualListInner<T>(
  {
    items,
    itemHeight,
    renderItem,
    overscan = 5,
    height = '100%',
    estimatedHeight,
    className,
    ariaLabel,
    getKey,
    onEndReached,
  }: VirtualListProps<T>,
  ref: React.Ref<HTMLDivElement>,
) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useImperativeHandle(ref, () => localRef.current as HTMLDivElement, []);

  const recompute = useCallback(() => {
    const el = localRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    setViewportH(el.clientHeight);
  }, []);

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    recompute();
    const onScroll = () => {
      setScrollTop(el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            setViewportH(el.clientHeight);
          })
        : null;
    if (ro) ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (ro) ro.disconnect();
    };
  }, [recompute]);

  useEffect(() => {
    if (!onEndReached) return;
    const sentinel = sentinelRef.current;
    const root = localRef.current;
    if (!sentinel || !root) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onEndReached();
            break;
          }
        }
      },
      { root, threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [onEndReached, items.length]);

  const spacerHeight =
    items.length === 0
      ? 0
      : Math.max(items.length * itemHeight, estimatedHeight ?? itemHeight);

  const effectiveViewport = viewportH > 0 ? viewportH : itemHeight * 0;
  const firstVisible = Math.max(
    0,
    Math.floor(scrollTop / itemHeight) - overscan,
  );
  const lastVisible = Math.min(
    items.length,
    Math.ceil((scrollTop + effectiveViewport) / itemHeight) + overscan,
  );

  const outerStyle: CSSProperties = {
    height: sizeToCss(height),
    position: 'relative',
  };
  const spacerStyle: CSSProperties = {
    height: spacerHeight,
    position: 'relative',
    width: '100%',
  };

  const visible: ReactNode[] = [];
  for (let i = firstVisible; i < lastVisible; i += 1) {
    const item = items[i];
    if (item === undefined) continue;
    const key = getKey ? getKey(item, i) : i;
    const style: CSSProperties = {
      position: 'absolute',
      top: i * itemHeight,
      left: 0,
      right: 0,
      height: itemHeight,
    };
    visible.push(
      <div key={key} role="listitem" style={style} data-virtual-index={i}>
        {renderItem(item, i)}
      </div>,
    );
  }

  return (
    <div
      ref={localRef}
      role="list"
      aria-label={ariaLabel}
      className={cn('overflow-auto', className)}
      style={outerStyle}
    >
      <div style={spacerStyle}>
        {visible}
        {onEndReached ? (
          <div
            ref={sentinelRef}
            aria-hidden="true"
            data-virtual-sentinel="end"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 1,
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

// forwardRef does not preserve generics directly; cast keeps T flowing.
export const VirtualList = forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => ReturnType<typeof VirtualListInner>;

(VirtualList as unknown as { displayName: string }).displayName = 'VirtualList';
