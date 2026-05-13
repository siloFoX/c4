import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type SkeletonVariant = 'text' | 'row' | 'card' | 'avatar' | 'rect';

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
