import { forwardRef } from 'react';
import type { ForwardedRef, HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { useReducedMotion } from '../../hooks/use-reduced-motion';
import {
  getLoadingMotionClass,
  getLoadingMotionStyle,
} from './loading-motion';
import { Skeleton } from './skeleton';

// (v1.11.420, TODO 11.402) SkeletonSet primitive.
//
// Predefined skeleton compositions for the four canonical
// page silhouettes the operator hits while waiting on data:
//
//   - card        -- a grid of N skeleton cards (default 3).
//   - list        -- a stacked row pattern (avatar + 2 text
//                    lines per row) used for inbox / activity
//                    feeds (default 6 rows).
//   - table       -- a header row + N body rows of M columns
//                    (default 5 rows / 4 cols).
//   - detail-page -- a hero header + 2-column main / side body
//                    (paragraph + 3-line section / 2 stat
//                    cards).
//
// Every shape inherits the shared loading-motion shimmer; the
// `useReducedMotion()` hook drops the pulse animation when the
// OS-level preference is set. Builds on the per-shape Skeleton
// primitives in `skeleton.tsx` (11.135 / 11.174 / 11.208 / 11.255)
// so callers get the consistent rhythm + token colour without
// re-implementing the silhouette.
//
// Reference: /root/c4/arps-design-system-v1/.

export type SkeletonSetVariant =
  | 'card'
  | 'list'
  | 'table'
  | 'detail-page';

export interface SkeletonSetProps
  extends HTMLAttributes<HTMLDivElement> {
  variant: SkeletonSetVariant;
  count?: number;
  rows?: number;
  cols?: number;
  showAvatar?: boolean;
  linesPerRow?: number;
  className?: string;
  ariaLabel?: string;
}

const DEFAULTS: Record<
  SkeletonSetVariant,
  { count: number; rows: number; cols: number }
> = {
  card: { count: 3, rows: 0, cols: 0 },
  list: { count: 0, rows: 6, cols: 0 },
  table: { count: 0, rows: 5, cols: 4 },
  'detail-page': { count: 0, rows: 0, cols: 0 },
};

function clampPositive(v: number | undefined, fallback: number): number {
  if (v === undefined) return fallback;
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

export const SkeletonSet = forwardRef(function SkeletonSet(
  {
    variant,
    count,
    rows,
    cols,
    showAvatar = false,
    linesPerRow = 2,
    className,
    ariaLabel,
    ...rest
  }: SkeletonSetProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reduced = useReducedMotion();
  const animationClass = getLoadingMotionClass('skeleton', reduced);
  const animationStyle = getLoadingMotionStyle('skeleton', reduced);

  const defaultLabel = `Loading ${variant}`;
  const label = ariaLabel ?? defaultLabel;
  const defs = DEFAULTS[variant];

  let body: React.ReactNode = null;

  if (variant === 'card') {
    const n = clampPositive(count, defs.count);
    body = (
      <div
        data-section="skeleton-set-cards"
        data-card-count={n}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {Array.from({ length: n }).map((_, i) => (
          <Skeleton.Card
            key={i}
            data-skeleton-set-card-index={i}
          />
        ))}
      </div>
    );
  } else if (variant === 'list') {
    const r = clampPositive(rows, defs.rows);
    const lines = Math.max(1, Math.floor(linesPerRow));
    body = (
      <Skeleton.List
        data-section="skeleton-set-list"
        rows={r}
        showAvatar={showAvatar}
        linesPerRow={lines}
      />
    );
  } else if (variant === 'table') {
    const r = clampPositive(rows, defs.rows);
    const c = clampPositive(cols, defs.cols);
    body = (
      <Skeleton.Table
        data-section="skeleton-set-table"
        rows={r}
        cols={c}
      />
    );
  } else if (variant === 'detail-page') {
    body = (
      <div
        data-section="skeleton-set-detail"
        className="flex flex-col gap-4"
      >
        <div
          data-section="skeleton-set-detail-header"
          className="flex flex-col gap-2"
        >
          <div
            data-skeleton-detail="title"
            className={cn(
              animationClass,
              'h-7 w-1/2 rounded-md bg-muted',
            )}
            style={animationStyle}
          />
          <div
            data-skeleton-detail="subtitle"
            className={cn(
              animationClass,
              'h-4 w-1/3 rounded bg-muted',
            )}
            style={animationStyle}
          />
        </div>
        <div
          data-section="skeleton-set-detail-body"
          className="grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          <div
            data-section="skeleton-set-detail-main"
            className="flex flex-col gap-3 md:col-span-2"
          >
            <Skeleton.Text lines={3} />
            <Skeleton.Card />
          </div>
          <div
            data-section="skeleton-set-detail-side"
            className="flex flex-col gap-3"
          >
            <Skeleton.Card />
            <Skeleton.Card />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      role="status"
      aria-label={label}
      aria-busy="true"
      data-section="skeleton-set"
      data-variant={variant}
      data-motion-reduced={reduced ? 'true' : 'false'}
      className={cn('w-full', className)}
      {...rest}
    >
      {body}
    </div>
  );
});

SkeletonSet.displayName = 'SkeletonSet';
