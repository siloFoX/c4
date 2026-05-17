import { forwardRef } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { useReducedMotion } from '../../hooks/use-reduced-motion';
import {
  getLoadingMotionClass,
  getLoadingMotionStyle,
} from './loading-motion';

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

// (v1.11.243, TODO 11.225) Shimmer timing now flows through the
// shared loading-motion contract (ui/loading-motion.ts) and the
// `animate-pulse` utility is dropped under
// `prefers-reduced-motion: reduce`. The SHAPE_BASE / VARIANT_BASE
// constants below keep the colour token (`bg-muted`) -- the
// animation class is appended per render via the helper.
const SKELETON_COLOR_BASE = 'bg-muted';
const VARIANT_BASE = SKELETON_COLOR_BASE;

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
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);
  if (variant === 'text' && lines && lines > 1) {
    return (
      <div
        className={cn('flex flex-col gap-2', className)}
        role="status"
        aria-hidden="true"
        data-motion-reduced={reduced ? '' : undefined}
        {...rest}
      >
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            data-skeleton-line={i}
            className={cn(animationClass, VARIANT_BASE, VARIANT_CLASS.text, i === lines - 1 && 'w-4/5')}
            style={animationStyle}
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
        data-motion-reduced={reduced ? '' : undefined}
        {...rest}
      >
        <div
          data-skeleton-page="header"
          className={cn(animationClass, VARIANT_BASE, 'h-6 w-2/5 rounded-md')}
          style={animationStyle}
        />
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            data-skeleton-page="body"
            data-skeleton-line={i}
            className={cn(animationClass, VARIANT_BASE, VARIANT_CLASS.line, i === 2 && 'w-4/5')}
            style={animationStyle}
          />
        ))}
      </div>
    );
  }
  const inlineStyle = { ...animationStyle, ...toStyle(width, height), ...style };
  return (
    <div
      role="status"
      aria-hidden="true"
      data-motion-reduced={reduced ? '' : undefined}
      className={cn(animationClass, VARIANT_BASE, VARIANT_CLASS[variant], className)}
      style={Object.keys(inlineStyle).length ? inlineStyle : undefined}
      {...rest}
    />
  );
}

// -- v1.11.174 composable shape variants --------------------------
//
// (v1.11.243, TODO 11.225) Like the top-level Skeleton, every
// composable shape below routes its animation class + duration
// through the shared loading-motion contract so the shimmer keeps
// pulsing at the same rhythm everywhere -- and stops entirely
// when `prefers-reduced-motion: reduce` is active.
const SHAPE_BASE = 'bg-muted';

export interface TextLineProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  className?: string;
}

export const TextLine = forwardRef<HTMLDivElement, TextLineProps>(
  ({ width = '100%', height = '0.875em', className, style, ...rest }, ref) => {
    const reduced = useReducedMotion();
    const animationClass = getLoadingMotionClass('skeleton', reduced);
    const animationStyle = getLoadingMotionStyle('skeleton', reduced);
    const resolvedWidth = typeof width === 'number' ? `${width}px` : width;
    const resolvedHeight = typeof height === 'number' ? `${height}px` : height;
    return (
      <div
        ref={ref}
        role="status"
        aria-hidden="true"
        data-skeleton-shape="text-line"
        data-motion-reduced={reduced ? '' : undefined}
        className={cn(animationClass, SHAPE_BASE, 'rounded', className)}
        style={{ ...animationStyle, width: resolvedWidth, height: resolvedHeight, ...style }}
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
    const reduced = useReducedMotion();
    const animationClass = getLoadingMotionClass('skeleton', reduced);
    const animationStyle = getLoadingMotionStyle('skeleton', reduced);
    const resolvedWidth = width === undefined ? undefined : typeof width === 'number' ? `${width}px` : width;
    const resolvedHeight = height === undefined ? undefined : typeof height === 'number' ? `${height}px` : height;
    const merged: CSSProperties = { ...animationStyle, ...style };
    if (resolvedWidth !== undefined) merged.width = resolvedWidth;
    if (resolvedHeight !== undefined) merged.height = resolvedHeight;
    return (
      <div
        ref={ref}
        role="status"
        aria-hidden="true"
        data-skeleton-shape="rect"
        data-motion-reduced={reduced ? '' : undefined}
        className={cn(animationClass, SHAPE_BASE, RECT_ROUNDED[rounded], className)}
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
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);
  const resolved = typeof size === 'number' ? `${size}px` : size;
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-shape="circle"
      data-motion-reduced={reduced ? '' : undefined}
      className={cn(animationClass, SHAPE_BASE, 'rounded-full', className)}
      style={{ ...animationStyle, width: resolved, height: resolved, ...style }}
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
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);
  const dim = AVATAR_SHAPE_SIZE[size];
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-shape="avatar"
      data-avatar-size={size}
      data-motion-reduced={reduced ? '' : undefined}
      className={cn(animationClass, SHAPE_BASE, 'rounded-full', AVATAR_SHAPE_CLASS[size], className)}
      style={{ ...animationStyle, width: dim, height: dim, ...style }}
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

// -- v1.11.208 Skeleton.* compound sub-components -----------------
// Higher-level, named building blocks attached to the Skeleton
// primitive via Object.assign. These cover the most common ad-hoc
// loading shapes (single text line, avatar, card, table) so call
// sites can swap inline `animate-pulse rounded-md bg-muted` divs
// for a typed, accessible API. The pixel sizes for Skeleton.Avatar
// (24 / 32 / 48) intentionally differ from the older AvatarShape
// (24 / 40 / 56) -- the new sub-component targets list / row
// affordances while AvatarShape is sized for profile / detail
// surfaces. Both remain available.

export interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  lines?: number;
  className?: string;
}

function SkeletonText({
  width = '100%',
  height = '1em',
  lines = 1,
  className,
  style,
  ...rest
}: SkeletonTextProps) {
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);
  const safeLines = Math.max(1, Math.floor(lines));
  const resolvedWidth = typeof width === 'number' ? `${width}px` : width;
  const resolvedHeight = typeof height === 'number' ? `${height}px` : height;
  if (safeLines === 1) {
    return (
      <div
        role="status"
        aria-hidden="true"
        data-skeleton-sub="text"
        data-motion-reduced={reduced ? '' : undefined}
        className={cn(animationClass, SHAPE_BASE, 'rounded', className)}
        style={{ ...animationStyle, width: resolvedWidth, height: resolvedHeight, ...style }}
        {...rest}
      />
    );
  }
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-sub="text"
      data-motion-reduced={reduced ? '' : undefined}
      className={cn('flex flex-col gap-2', className)}
      style={style}
      {...rest}
    >
      {Array.from({ length: safeLines }).map((_, i) => (
        <div
          key={i}
          data-skeleton-line={i}
          className={cn(
            animationClass,
            SHAPE_BASE,
            'rounded',
            i === safeLines - 1 && 'w-4/5',
          )}
          style={{
            ...animationStyle,
            width: i === safeLines - 1 ? undefined : resolvedWidth,
            height: resolvedHeight,
          }}
        />
      ))}
    </div>
  );
}

export type SkeletonAvatarSize = 'sm' | 'md' | 'lg';

const SKELETON_AVATAR_PX: Record<SkeletonAvatarSize, number> = {
  sm: 24,
  md: 32,
  lg: 48,
};

export interface SkeletonAvatarProps extends HTMLAttributes<HTMLDivElement> {
  size?: SkeletonAvatarSize;
  className?: string;
}

function SkeletonAvatar({
  size = 'md',
  className,
  style,
  ...rest
}: SkeletonAvatarProps) {
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);
  const dim = SKELETON_AVATAR_PX[size];
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-sub="avatar"
      data-skeleton-avatar-size={size}
      data-motion-reduced={reduced ? '' : undefined}
      className={cn(animationClass, SHAPE_BASE, 'rounded-full', className)}
      style={{ ...animationStyle, width: `${dim}px`, height: `${dim}px`, ...style }}
      {...rest}
    />
  );
}

export interface SkeletonCardProps extends HTMLAttributes<HTMLDivElement> {
  className?: string;
}

function SkeletonCard({ className, ...rest }: SkeletonCardProps) {
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-sub="card"
      data-motion-reduced={reduced ? '' : undefined}
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border p-4',
        className,
      )}
      {...rest}
    >
      <div
        data-skeleton-card="header"
        className={cn(animationClass, SHAPE_BASE, 'h-5 w-2/5 rounded')}
        style={animationStyle}
      />
      <div
        data-skeleton-card="line"
        data-skeleton-line={0}
        className={cn(animationClass, SHAPE_BASE, 'h-3 w-full rounded')}
        style={animationStyle}
      />
      <div
        data-skeleton-card="line"
        data-skeleton-line={1}
        className={cn(animationClass, SHAPE_BASE, 'h-3 w-4/5 rounded')}
        style={animationStyle}
      />
    </div>
  );
}

export interface SkeletonTableProps extends HTMLAttributes<HTMLDivElement> {
  rows?: number;
  cols?: number;
  className?: string;
}

function SkeletonTable({
  rows = 5,
  cols = 3,
  className,
  ...rest
}: SkeletonTableProps) {
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);
  const safeRows = Math.max(0, Math.floor(rows));
  const safeCols = Math.max(0, Math.floor(cols));
  const renderCells = (rowIndex: number, isHeader: boolean) =>
    Array.from({ length: safeCols }).map((_, c) => (
      <div
        key={c}
        data-skeleton-table-cell={c}
        className={cn(
          animationClass,
          SHAPE_BASE,
          'flex-1 rounded',
          isHeader ? 'h-4' : 'h-3',
          isHeader && c === safeCols - 1 && 'w-3/5',
        )}
        style={animationStyle}
        data-row-index={rowIndex}
      />
    ));
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-sub="table"
      data-motion-reduced={reduced ? '' : undefined}
      className={cn('flex flex-col gap-2', className)}
      {...rest}
    >
      <div
        data-skeleton-table-row="header"
        className="flex items-center gap-3 border-b border-border pb-2"
      >
        {renderCells(-1, true)}
      </div>
      {Array.from({ length: safeRows }).map((_, r) => (
        <div
          key={r}
          data-skeleton-table-row="body"
          data-row-index={r}
          className="flex items-center gap-3"
        >
          {renderCells(r, false)}
        </div>
      ))}
    </div>
  );
}

// (v1.11.312, TODO 11.294) ChipSkeleton -- pill placeholder for
// chip / tag / badge rows during loading. Matches the visual
// silhouette of the Chip primitive (small rounded-full bar) so
// the loading state does not jump when the real content lands.
export type ChipSkeletonSize = 'sm' | 'md' | 'lg';

const CHIP_SKELETON_SIZE: Record<ChipSkeletonSize, {
  height: string;
  width: string;
}> = {
  sm: { height: '0.875rem', width: '3rem' },
  md: { height: '1.125rem', width: '4rem' },
  lg: { height: '1.5rem', width: '5rem' },
};

export interface ChipSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  size?: ChipSkeletonSize;
  width?: string | number;
  className?: string;
}

export function ChipSkeleton({
  size = 'md',
  width,
  className,
  style,
  ...rest
}: ChipSkeletonProps) {
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);
  const dim = CHIP_SKELETON_SIZE[size];
  const resolvedWidth =
    width === undefined
      ? dim.width
      : typeof width === 'number'
        ? `${width}px`
        : width;
  return (
    <div
      role="status"
      aria-hidden="true"
      data-section="chip-skeleton"
      data-skeleton-shape="chip"
      data-chip-skeleton-size={size}
      data-motion-reduced={reduced ? '' : undefined}
      className={cn(
        animationClass,
        SHAPE_BASE,
        'rounded-full',
        className,
      )}
      style={{
        ...animationStyle,
        width: resolvedWidth,
        height: dim.height,
        ...style,
      }}
      {...rest}
    />
  );
}

ChipSkeleton.displayName = 'ChipSkeleton';

// (v1.11.312, TODO 11.294) Convenience aliases. The dispatch
// asked for `AvatarSkeleton` + `TableRowSkeleton` names; we
// re-export the existing AvatarShape + TableRowShape under the
// new names so callers can reach for the consistent
// `*Skeleton` vocabulary without breaking the existing
// AvatarShape / TableRowShape consumers.
export const AvatarSkeleton = AvatarShape;
export const TableRowSkeleton = TableRowShape;

// (v1.11.273, TODO 11.255) Skeleton.List -- stacked row shapes
// for list / row-style loading states. Each row optionally
// renders an avatar circle on the left next to two text lines.
// Defaults: 5 rows, no avatar, 2 lines per row. Spacing between
// rows tracks the `gap` prop (Tailwind gap-* scale, default 3).
// Shimmer routes through the same loading-motion contract so the
// pulse rhythm matches the rest of the Skeleton family and stops
// entirely when `prefers-reduced-motion: reduce` is active.

export interface SkeletonListProps extends HTMLAttributes<HTMLDivElement> {
  rows?: number;
  showAvatar?: boolean;
  // Lines of "text" per row beside / below the avatar. Defaults
  // to 2; clamped to >= 1.
  linesPerRow?: number;
  // Tailwind gap scale value between rows. Defaults to 3 (gap-3).
  gap?: number;
  className?: string;
}

function SkeletonList({
  rows = 5,
  showAvatar = false,
  linesPerRow = 2,
  gap = 3,
  className,
  ...rest
}: SkeletonListProps) {
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);
  const safeRows = Math.max(0, Math.floor(rows));
  const safeLines = Math.max(1, Math.floor(linesPerRow));
  const gapClass = `gap-${gap}`;
  return (
    <div
      role="status"
      aria-hidden="true"
      data-skeleton-sub="list"
      data-skeleton-rows={safeRows}
      data-motion-reduced={reduced ? '' : undefined}
      className={cn('flex flex-col', gapClass, className)}
      {...rest}
    >
      {Array.from({ length: safeRows }).map((_, r) => (
        <div
          key={r}
          data-skeleton-list-row={r}
          className="flex items-center gap-3"
        >
          {showAvatar ? (
            <div
              data-skeleton-list-avatar
              className={cn(
                animationClass,
                SHAPE_BASE,
                'h-8 w-8 shrink-0 rounded-full',
              )}
              style={animationStyle}
            />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {Array.from({ length: safeLines }).map((_, l) => (
              <div
                key={l}
                data-skeleton-line={l}
                className={cn(
                  animationClass,
                  SHAPE_BASE,
                  'h-3 rounded',
                  // First line full-width, subsequent lines
                  // taper for a more natural mock paragraph
                  // shape. The last line on each row is shortest.
                  l === 0 ? 'w-full' : l === safeLines - 1 ? 'w-3/5' : 'w-4/5',
                )}
                style={animationStyle}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

SkeletonText.displayName = 'Skeleton.Text';
SkeletonAvatar.displayName = 'Skeleton.Avatar';
SkeletonCard.displayName = 'Skeleton.Card';
SkeletonTable.displayName = 'Skeleton.Table';
SkeletonList.displayName = 'Skeleton.List';

export { SkeletonText, SkeletonAvatar, SkeletonCard, SkeletonTable, SkeletonList };

// Declaration-merge the sub-components onto the Skeleton function
// value so `Skeleton.Text`, `Skeleton.Avatar`, etc. are visible to
// TypeScript without altering the underlying function signature.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Skeleton {
  export const Text = SkeletonText;
  export const Avatar = SkeletonAvatar;
  export const Card = SkeletonCard;
  export const Table = SkeletonTable;
  export const List = SkeletonList;
}
