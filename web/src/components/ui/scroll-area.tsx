import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.164) Scroll-area primitive. Wraps a div in consistent custom
// scrollbar styling (thin track + themed thumb that fades in on
// hover/focus) so the rest of the app stops re-spelling
// overflow-y-auto + max-h-* on every scrollable container. The actual
// scrollbar look lives on .c4-scroll in index.css; this file owns the
// React shape (axis prop, size props, ref forwarding).
//
// (v1.11.245, TODO 11.227) Responsive width + safe-area surface.
//   - `size`: 'auto' (default) inherits from `.c4-scroll`, which
//     renders 8 px on fine pointers and bumps to 14 px under
//     `@media (pointer: coarse)`. Explicit values 'thin' / 'default'
//     / 'wide' opt out of the auto-bump and pin the chrome sizes
//     (see index.css for the per-modifier pairs).
//   - `safeArea`: appends `.c4-scroll-safe-area` so a scrollable
//     surface pinned against the device chrome reserves
//     `env(safe-area-inset-{right,bottom})` of trailing padding +
//     scroll-padding. Defaults off because most ScrollArea consumers
//     live well inside parent layout; the autonomous queue editor
//     (Queue.tsx) and Sidebar are the call sites most likely to want
//     it on.

export type ScrollAxis = 'y' | 'x' | 'both';
export type ScrollAreaSize = 'auto' | 'thin' | 'default' | 'wide';
// (v1.11.400, TODO 11.382) Named max-height presets. The
// freeform `maxHeight` (number | string) prop keeps working;
// callers that want a consistent rhythm across surfaces can
// reach for the preset instead.
//   - sm:   16rem (256px)  -- dropdown / popover body
//   - md:   24rem (384px)  -- sidebar panel
//   - lg:   32rem (512px)  -- mid-page block
//   - xl:   48rem (768px)  -- modal body
//   - screen: 100vh        -- full-viewport scroller
export type ScrollAreaMaxHeightPreset =
  | 'sm'
  | 'md'
  | 'lg'
  | 'xl'
  | 'screen';

// (v1.11.400, TODO 11.382) Scroll position snapshot. Each
// numeric field mirrors the underlying scroll element; the
// `atTop` / `atBottom` / `atLeft` / `atRight` booleans are
// pre-computed so callers do not have to redo the math.
export interface ScrollAreaPosition {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
  atTop: boolean;
  atBottom: boolean;
  atLeft: boolean;
  atRight: boolean;
}

export interface ScrollAreaProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode;
  className?: string;
  maxHeight?: number | string;
  /**
   * (v1.11.400, TODO 11.382) Named max-height preset. When
   * set, `style.maxHeight` resolves to the matching rem /
   * vh value. Ignored when `maxHeight` is explicitly
   * supplied (the freeform value wins).
   */
  maxHeightPreset?: ScrollAreaMaxHeightPreset;
  height?: number | string;
  axis?: ScrollAxis;
  /** Override the responsive scrollbar size. Default `'auto'`. */
  size?: ScrollAreaSize;
  /** Reserve `env(safe-area-inset-*)` padding around the scroll edge. */
  safeArea?: boolean;
  /**
   * (v1.11.315, TODO 11.297) When true, render fade-shadow
   * indicators at the top + bottom edges of the scroll
   * surface. The shadows fade in / out as the user scrolls:
   * the top shadow appears when content is scrolled past the
   * first row; the bottom shadow appears while there is
   * still content below the viewport. Wrapper carries
   * `data-at-top="true|false"` and `data-at-bottom="true|false"`
   * so the shadows can be styled / asserted from CSS.
   */
  shadows?: boolean;
  /**
   * (v1.11.400, TODO 11.382) Scroll-position tracking
   * callback. Fires on mount + every scroll event + when
   * the surface or its content resizes. Receives the full
   * `ScrollAreaPosition` snapshot so callers can pull
   * exact scrollTop / scrollLeft + the pre-computed edge
   * flags. Default `undefined` = no listener installed.
   */
  onScrollPositionChange?: (position: ScrollAreaPosition) => void;
}

const AXIS_CLASSES: Record<ScrollAxis, string> = {
  y: 'overflow-y-auto overflow-x-hidden',
  x: 'overflow-x-auto overflow-y-hidden',
  both: 'overflow-auto',
};

const SIZE_CLASSES: Record<Exclude<ScrollAreaSize, 'auto'>, string> = {
  thin: 'c4-scroll-thin',
  default: 'c4-scroll-default',
  wide: 'c4-scroll-wide',
};

// (v1.11.400, TODO 11.382) Per-preset max-height values.
// Exported for tests + adopters that need to match the
// rhythm in a non-ScrollArea surface.
export const SCROLL_AREA_MAX_HEIGHT_PRESET: Record<
  ScrollAreaMaxHeightPreset,
  string
> = {
  sm: '16rem',
  md: '24rem',
  lg: '32rem',
  xl: '48rem',
  screen: '100vh',
};

function sizeToCss(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

// (v1.11.400, TODO 11.382) Pure helper exported for tests +
// custom callers. Snapshots the current scroll state of an
// HTMLElement; safe for non-overflowing surfaces (atTop +
// atBottom + atLeft + atRight all read `true`).
export function snapshotScrollPosition(el: HTMLElement): ScrollAreaPosition {
  const scrollTop = el.scrollTop;
  const scrollLeft = el.scrollLeft;
  const scrollHeight = el.scrollHeight;
  const scrollWidth = el.scrollWidth;
  const clientHeight = el.clientHeight;
  const clientWidth = el.clientWidth;
  const overflowsY = scrollHeight > clientHeight + 1;
  const overflowsX = scrollWidth > clientWidth + 1;
  return {
    scrollTop,
    scrollLeft,
    scrollHeight,
    scrollWidth,
    clientHeight,
    clientWidth,
    atTop: !overflowsY || scrollTop <= 0,
    atBottom: !overflowsY || scrollTop + clientHeight >= scrollHeight - 1,
    atLeft: !overflowsX || scrollLeft <= 0,
    atRight: !overflowsX || scrollLeft + clientWidth >= scrollWidth - 1,
  };
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  {
    children,
    className,
    maxHeight,
    maxHeightPreset,
    height,
    axis = 'y',
    size = 'auto',
    safeArea = false,
    shadows = false,
    onScrollPositionChange,
    style,
    ...rest
  },
  ref,
) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLDivElement);

  // (v1.11.315, TODO 11.297) Shadow indicator state. Starts
  // `atTop=true` + `atBottom=true` so a non-overflowing
  // surface renders no shadow at all. A scroll listener +
  // resize listener + content-resize observer keep the flags
  // current as the user scrolls or the content reflows.
  const [atTop, setAtTop] = useState<boolean>(true);
  const [atBottom, setAtBottom] = useState<boolean>(true);

  const recompute = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const overflows = el.scrollHeight > el.clientHeight + 1;
    if (!overflows) {
      setAtTop(true);
      setAtBottom(true);
      return;
    }
    setAtTop(el.scrollTop <= 0);
    setAtBottom(
      el.scrollTop + el.clientHeight >= el.scrollHeight - 1,
    );
  }, []);

  useEffect(() => {
    if (!shadows) return;
    const el = innerRef.current;
    if (!el) return;
    recompute();
    const onScroll = () => recompute();
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => recompute());
      ro.observe(el);
    }
    window.addEventListener('resize', onScroll);
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', onScroll);
    };
  }, [shadows, recompute]);

  // (v1.11.400, TODO 11.382) Scroll-position tracking effect.
  // Fires the callback on mount + every scroll + every
  // ResizeObserver tick + window resize. Independent of
  // `shadows` so callers can subscribe without enabling the
  // visual shadow indicators.
  useEffect(() => {
    if (!onScrollPositionChange) return;
    const el = innerRef.current;
    if (!el) return;
    const fire = () => {
      onScrollPositionChange(snapshotScrollPosition(el));
    };
    fire();
    el.addEventListener('scroll', fire, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(fire);
      ro.observe(el);
    }
    window.addEventListener('resize', fire);
    return () => {
      el.removeEventListener('scroll', fire);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', fire);
    };
  }, [onScrollPositionChange]);

  // (v1.11.400, TODO 11.382) Resolve max-height. Freeform
  // `maxHeight` wins; otherwise the named preset (if any)
  // maps to its rem / vh value.
  const presetMh =
    maxHeightPreset !== undefined
      ? SCROLL_AREA_MAX_HEIGHT_PRESET[maxHeightPreset]
      : undefined;
  const mh = sizeToCss(maxHeight) ?? presetMh;
  const h = sizeToCss(height);
  const mergedStyle: CSSProperties = {
    ...(mh !== undefined ? { maxHeight: mh } : {}),
    ...(h !== undefined ? { height: h } : {}),
    ...style,
  };
  const sizeClass = size === 'auto' ? null : SIZE_CLASSES[size];

  // When shadows are off the surface is the same single div
  // it has always been. When shadows are on we mount a
  // relative-positioned wrapper carrying the shadow overlays
  // + data-at-top / data-at-bottom flags.
  const inner = (
    <div
      ref={innerRef}
      data-scrollarea-size={size}
      data-scrollarea-safe-area={safeArea ? '' : undefined}
      data-section="scroll-area"
      data-axis={axis}
      data-max-height-preset={maxHeightPreset ?? undefined}
      data-shadows={shadows ? 'true' : 'false'}
      data-at-top={shadows ? (atTop ? 'true' : 'false') : undefined}
      data-at-bottom={shadows ? (atBottom ? 'true' : 'false') : undefined}
      className={cn(
        'c4-scroll',
        AXIS_CLASSES[axis],
        sizeClass,
        safeArea && 'c4-scroll-safe-area',
        className,
      )}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </div>
  );

  if (!shadows) return inner;

  return (
    <div
      className="relative"
      data-section="scroll-area-shadow-root"
      data-at-top={atTop ? 'true' : 'false'}
      data-at-bottom={atBottom ? 'true' : 'false'}
    >
      {inner}
      <div
        aria-hidden="true"
        data-section="scroll-area-shadow-top"
        className={cn(
          'pointer-events-none absolute left-0 right-0 top-0 h-4 bg-gradient-to-b from-background/80 to-transparent transition-opacity duration-150',
          atTop ? 'opacity-0' : 'opacity-100',
        )}
      />
      <div
        aria-hidden="true"
        data-section="scroll-area-shadow-bottom"
        className={cn(
          'pointer-events-none absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-background/80 to-transparent transition-opacity duration-150',
          atBottom ? 'opacity-0' : 'opacity-100',
        )}
      />
    </div>
  );
});

ScrollArea.displayName = 'ScrollArea';
