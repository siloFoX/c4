import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
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

export interface ScrollAreaProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode;
  className?: string;
  maxHeight?: number | string;
  height?: number | string;
  axis?: ScrollAxis;
  /** Override the responsive scrollbar size. Default `'auto'`. */
  size?: ScrollAreaSize;
  /** Reserve `env(safe-area-inset-*)` padding around the scroll edge. */
  safeArea?: boolean;
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

function sizeToCss(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  {
    children,
    className,
    maxHeight,
    height,
    axis = 'y',
    size = 'auto',
    safeArea = false,
    style,
    ...rest
  },
  ref,
) {
  const mh = sizeToCss(maxHeight);
  const h = sizeToCss(height);
  const mergedStyle: CSSProperties = {
    ...(mh !== undefined ? { maxHeight: mh } : {}),
    ...(h !== undefined ? { height: h } : {}),
    ...style,
  };
  const sizeClass = size === 'auto' ? null : SIZE_CLASSES[size];
  return (
    <div
      ref={ref}
      data-scrollarea-size={size}
      data-scrollarea-safe-area={safeArea ? '' : undefined}
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
});

ScrollArea.displayName = 'ScrollArea';
