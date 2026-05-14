import { forwardRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.164) Scroll-area primitive. Wraps a div in consistent custom
// scrollbar styling (thin track + themed thumb that fades in on
// hover/focus) so the rest of the app stops re-spelling
// overflow-y-auto + max-h-* on every scrollable container. The actual
// scrollbar look lives on .c4-scroll in index.css; this file owns the
// React shape (axis prop, size props, ref forwarding).

export type ScrollAxis = 'y' | 'x' | 'both';

export interface ScrollAreaProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode;
  className?: string;
  maxHeight?: number | string;
  height?: number | string;
  axis?: ScrollAxis;
}

const AXIS_CLASSES: Record<ScrollAxis, string> = {
  y: 'overflow-y-auto overflow-x-hidden',
  x: 'overflow-x-auto overflow-y-hidden',
  both: 'overflow-auto',
};

function sizeToCss(v: number | string | undefined): string | undefined {
  if (v === undefined) return undefined;
  return typeof v === 'number' ? `${v}px` : v;
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(function ScrollArea(
  { children, className, maxHeight, height, axis = 'y', style, ...rest },
  ref,
) {
  const mh = sizeToCss(maxHeight);
  const h = sizeToCss(height);
  const mergedStyle: CSSProperties = {
    ...(mh !== undefined ? { maxHeight: mh } : {}),
    ...(h !== undefined ? { height: h } : {}),
    ...style,
  };
  return (
    <div
      ref={ref}
      className={cn('c4-scroll', AXIS_CLASSES[axis], className)}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </div>
  );
});

ScrollArea.displayName = 'ScrollArea';
