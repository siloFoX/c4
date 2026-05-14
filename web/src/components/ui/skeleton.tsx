import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.135) New loading-state variants — 'line' (thin horizontal bar,
// alias for the prior default), 'circle' (square aspect, rounded-full),
// 'card' (taller rounded block), and 'page' (hero placeholder: one
// header line stacked over three body lines). The legacy variant names
// ('text', 'row', 'avatar', 'rect') still resolve to the same classes
// they always have, so existing call sites do not need to change. The
// shimmer base color stays on the project's `bg-muted` Tailwind class
// (mapped to `hsl(var(--muted))`); the ARPS design-system surface tokens
// (--surface-2 / --surface-panel) are not wired into this bundle yet so
// the existing class scheme is preserved verbatim per the v1.11.134
// CHANGELOG note.

export type SkeletonVariant =
  | 'text'
  | 'row'
  | 'card'
  | 'avatar'
  | 'rect'
  | 'line'
  | 'circle'
  | 'page';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  lines?: number;
  className?: string;
}

const VARIANT_BASE = 'animate-pulse bg-muted';

const VARIANT_CLASS: Record<SkeletonVariant, string> = {
  text: 'h-3 w-full rounded',
  row: 'h-8 w-full rounded-md',
  card: 'h-32 w-full rounded-md',
  avatar: 'h-10 w-10 rounded-full',
  rect: 'rounded-md',
  line: 'h-3 w-full rounded',
  circle: 'h-10 w-10 rounded-full',
  page: 'h-40 w-full rounded-md',
};

function toStyle(width?: number | string, height?: number | string): CSSProperties | undefined {
  if (width === undefined && height === undefined) return undefined;
  const style: CSSProperties = {};
  if (width !== undefined) style.width = typeof width === 'number' ? `${width}px` : width;
  if (height !== undefined) style.height = typeof height === 'number' ? `${height}px` : height;
  return style;
}

export function Skeleton({
  variant = 'rect',
  width,
  height,
  lines,
  className,
  style,
  ...rest
}: SkeletonProps) {
  if (variant === 'text' && lines && lines > 1) {
    return (
      <div
        className={cn('flex flex-col gap-2', className)}
        role="status"
        aria-hidden="true"
        {...rest}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            data-skeleton-line={i}
            className={cn(VARIANT_BASE, VARIANT_CLASS.text, i === lines - 1 && 'w-4/5')}
          />
        ))}
      </div>
    );
  }
  if (variant === 'page') {
    return (
      <div
        className={cn('flex flex-col gap-3', className)}
        role="status"
        aria-hidden="true"
        {...rest}
      >
        <div
          data-skeleton-page="header"
          className={cn(VARIANT_BASE, 'h-6 w-2/5 rounded-md')}
        />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-skeleton-page="body"
            data-skeleton-line={i}
            className={cn(VARIANT_BASE, VARIANT_CLASS.line, i === 2 && 'w-4/5')}
          />
        ))}
      </div>
    );
  }
  const inlineStyle = { ...toStyle(width, height), ...style };
  return (
    <div
      role="status"
      aria-hidden="true"
      className={cn(VARIANT_BASE, VARIANT_CLASS[variant], className)}
      style={Object.keys(inlineStyle).length ? inlineStyle : undefined}
      {...rest}
    />
  );
}
