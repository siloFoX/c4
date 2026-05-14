import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.135) New loading-state variants -- 'line' (thin horizontal bar,
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
//
// (v1.11.174) Composable shape variants -- TextLine, Rect, Circle,
// AvatarShape, StatCardShape, TableRowShape. Each is a tiny wrapper
// around the same `animate-pulse bg-muted` base used by Skeleton, kept
// as a separate export so loading states can be assembled
// structurally instead of reaching for ad-hoc inline blocks. The
// Skeleton's avatar shape is exported as AvatarShape to avoid the
// name clash with the unrelated Avatar primitive in avatar.tsx.

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

// -- v1.11.174 composable shape variants --------------------------

const SHAPE_BASE = 'animate-pulse bg-muted';

export interface TextLineProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export const TextLine = forwardRef<HTMLDivElement, TextLineProps>(
  ({ width = '100%', height = '0.875em', className, style, ...rest }, ref) => {
    const resolvedWidth = typeof width === 'number' ? `${width}px` : width;
    const resolvedHeight = typeof height === 'number' ? `${height}px` : height;
    return (
      <div
        ref={ref}
        role="status"
        aria-hidden="true"
        data-skeleton-shape="text-line"
        className={cn(SHAPE_BASE, 'rounded', className)}
        style={{ width: resolvedWidth, height: resolvedHeight, ...style }}
        {...rest}
      />
    );
  },
);
TextLine.displayName = 'TextLine';

export type RectRounded = 'sm' | 'md' | 'lg' | 'xl' | 'full';

const RECT_ROUNDED: Record<RectRounded, string> = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  full: 'rounded-full',
};

export interface RectProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: RectRounded;
  className?: string;
}

export const Rect = forwardRef<HTMLDivElement, RectProps>(
  ({ width, height, rounded = 'md', className, style, ...rest }, ref) => {
    const resolvedWidth = width === undefined ? undefined : typeof width === 'number' ? `${width}px` : width;
    const resolvedHeight = height === undefined ? undefined : typeof height === 'number' ? `${height}px` : height;
    const merged: CSSProperties = { ...style };
    if (resolvedWidth !== undefined) merged.width = resolvedWidth;
    if (resolvedHeight !== undefined) merged.height = resolvedHeight;
    return (
      <div
        ref={ref}
        role="status"
        aria-hidden="true"
        data-skeleton-shape="rect"
        className={cn(SHAPE_BASE, RECT_ROUNDED[rounded], className)}
        style={Object.keys(merged).length ? merged : undefined}
        {...rest}
      />
    );
  },
);
Rect.displayName = 'Rect';

export interface CircleProps extends HTMLAttributes<HTMLDivElement> {
  size?: string | number;
  className?: string;
}

export function Circle({ size = '2.5rem', className, style, ...rest }: CircleProps) {
  const resolved = typeof size === 'number' ? `${size}px` : size;
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-shape="circle"
      className={cn(SHAPE_BASE, 'rounded-full', className)}
      style={{ width: resolved, height: resolved, ...style }}
      {...rest}
    />
  );
}

export type AvatarShapeSize = 'sm' | 'md' | 'lg';

const AVATAR_SHAPE_SIZE: Record<AvatarShapeSize, string> = {
  sm: '1.5rem',
  md: '2.5rem',
  lg: '3.5rem',
};

// Tailwind-equivalent class hints for the chosen rem sizes
// (1.5rem -> 6, 2.5rem -> 10, 3.5rem -> 14). The inline style is the
// source of truth; the classes simplify visual debugging + class-based
// test assertions.
const AVATAR_SHAPE_CLASS: Record<AvatarShapeSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-10 w-10',
  lg: 'h-14 w-14',
};

export interface AvatarShapeProps extends HTMLAttributes<HTMLDivElement> {
  size?: AvatarShapeSize;
  className?: string;
}

export function AvatarShape({ size = 'md', className, style, ...rest }: AvatarShapeProps) {
  const dim = AVATAR_SHAPE_SIZE[size];
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-shape="avatar"
      data-avatar-size={size}
      className={cn(SHAPE_BASE, 'rounded-full', AVATAR_SHAPE_CLASS[size], className)}
      style={{ width: dim, height: dim, ...style }}
      {...rest}
    />
  );
}

export interface StatCardShapeProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function StatCardShape({ className, ...rest }: StatCardShapeProps) {
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-shape="stat-card"
      className={cn('flex flex-col gap-2 rounded-xl border border-border bg-card p-5', className)}
      {...rest}
    >
      <Rect data-stat-card-shape="label" width="40%" height="0.75rem" rounded="sm" />
      <Rect data-stat-card-shape="number" width="60%" height="2rem" rounded="md" />
      <Rect data-stat-card-shape="delta" width="30%" height="0.75rem" rounded="sm" />
    </div>
  );
}

const TABLE_ROW_WIDTHS = ['60%', '100%', '45%', '70%', '30%'];

export interface TableRowShapeProps extends HTMLAttributes<HTMLDivElement> {
  columns?: number;
  className?: string;
}

export function TableRowShape({ columns = 5, className, ...rest }: TableRowShapeProps) {
  const safeColumns = Math.max(0, Math.floor(columns));
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-shape="table-row"
      className={cn('flex items-center gap-3', className)}
      {...rest}
    >
      {Array.from({ length: safeColumns }).map((_, i) => (
        <Rect
          key={i}
          data-table-row-cell={i}
          width={TABLE_ROW_WIDTHS[i % TABLE_ROW_WIDTHS.length]}
          height="0.875rem"
          rounded="sm"
          className="flex-1"
        />
      ))}
    </div>
  );
}
