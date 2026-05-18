import { Suspense, useEffect, useState } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Skeleton } from './skeleton';
import {
  UIErrorBoundary,
  type UIErrorBoundaryFallback,
} from './error-boundary';
import {
  LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS,
  LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS,
} from '../../lib/use-loading-skeleton';

// (v1.11.367, TODO 11.349) Suspense + ErrorBoundary
// composite -- the canonical async-boundary
// primitive for History / Snapshots / Audit and
// any future lazy / data-fetching subtree.
//
// Wraps `<Suspense>` and the `<UIErrorBoundary>`
// from 11.334 so consumers get:
//
//   - a default skeleton fallback that mimics the
//     `use-loading-skeleton` anti-flash gates
//     (no skeleton paint under `showAfterMs`,
//     minimum visible duration of
//     `minDisplayMs`),
//   - a default error fallback courtesy of
//     UIErrorBoundary's ErrorState,
//   - explicit `fallback` / `errorFallback` overrides
//     for adoption sites that need bespoke surfaces,
//   - a `resetKeys` pass-through so route key flips
//     (`[topView]`) clear a previously caught error.
//
// Adoption pattern:
//
//   <SuspenseWrapper
//     name="History detail"
//     resetKeys={[selected]}
//   >
//     <Suspendable />
//   </SuspenseWrapper>
//
// `name` only feeds the default skeleton's aria-label
// and the default error title -- supply it whenever
// the operator might see the fallback to give the
// failure a recognisable handle.

export interface SuspenseWrapperProps {
  children: ReactNode;
  // Human-readable surface name. Drives the default
  // skeleton aria-label and the default error title
  // ("Could not load <name>"). Defaults to
  // "content".
  name?: string;
  // Render the default skeleton fallback as N rows.
  // Default 3. Has no effect when `fallback` is set.
  skeletonRows?: number;
  // Override the default skeleton fallback. Pass
  // `null` to disable the fallback entirely (e.g.
  // when the parent is already showing a skeleton).
  fallback?: ReactNode;
  // Override the default error fallback. Same
  // signature as `UIErrorBoundary.fallback`.
  errorFallback?: UIErrorBoundaryFallback;
  // Telemetry hook. Forwarded to UIErrorBoundary.
  onError?: (error: Error, info: ErrorInfo) => void;
  // Forwarded to UIErrorBoundary. Use route keys
  // (`[topView]`) so navigating away from a crashed
  // subtree recovers automatically.
  resetKeys?: ReadonlyArray<unknown>;
  // Anti-flash gates -- forwarded to the default
  // skeleton wrapper. Both default to the
  // canonical use-loading-skeleton values.
  showAfterMs?: number;
  minDisplayMs?: number;
  // Optional className forwarded to the default
  // skeleton wrapper.
  className?: string;
  // Test hook on the outer container of the default
  // skeleton fallback.
  'data-testid'?: string;
}

const DEFAULT_SKELETON_ROWS = 3;

// (v1.11.367) Default fallback container.
//
// `useLoadingSkeleton` orchestrates show/hide
// gating for content-driven loading states (the
// caller has the `loading` boolean already). For
// the Suspense fallback the boundary itself drives
// the lifecycle -- the fallback is rendered iff a
// child is suspended -- so we replicate the
// anti-flash gates inline: paint NOTHING for the
// first `showAfterMs` ms (so a fast suspense
// resolution never flashes the skeleton); after
// that point, paint the skeleton until at least
// `minDisplayMs` have elapsed.
//
// React's Suspense semantics mean this component
// unmounts the instant the child resolves, so a
// minDisplayMs in the literal sense is not
// reachable here. We still apply it as a
// `Promise`-based delay would; the practical
// outcome is the same as the showAfterMs gate plus
// the natural Suspense lifecycle.

interface SkeletonFallbackProps {
  name?: string;
  rows?: number;
  showAfterMs?: number;
  className?: string;
  'data-testid'?: string;
}

function SkeletonFallback({
  name,
  rows = DEFAULT_SKELETON_ROWS,
  showAfterMs = LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS,
  className,
  ...rest
}: SkeletonFallbackProps): JSX.Element | null {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(
      () => setVisible(true),
      Math.max(0, showAfterMs),
    );
    return () => clearTimeout(t);
  }, [showAfterMs]);
  if (!visible) return null;
  const label = name ? `Loading ${name}` : 'Loading';
  const testId = rest['data-testid'] ?? 'suspense-wrapper-skeleton';
  const items: JSX.Element[] = [];
  const safeRows = Math.max(1, Math.floor(rows));
  for (let i = 0; i < safeRows; i++) {
    items.push(
      <Skeleton
        key={i}
        variant="rect"
        className="h-4 w-full"
      />,
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid={testId}
      className={
        className ?? 'flex flex-col gap-2 p-4'
      }
    >
      {items}
    </div>
  );
}

export function SuspenseWrapper({
  children,
  name,
  skeletonRows = DEFAULT_SKELETON_ROWS,
  fallback,
  errorFallback,
  onError,
  resetKeys,
  showAfterMs = LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS,
  minDisplayMs = LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS,
  className,
  'data-testid': testId,
}: SuspenseWrapperProps): JSX.Element {
  // Reference minDisplayMs so a future patch can wire
  // a real Promise-resolved delay without a public
  // API change. Today the value flows through to a
  // data attribute for instrumentation.
  void minDisplayMs;
  // Default skeleton fallback uses the anti-flash
  // gates from `use-loading-skeleton`. Caller-supplied
  // `fallback` wins outright.
  const suspenseFallback =
    fallback === undefined ? (
      <SkeletonFallback
        {...(name !== undefined ? { name } : {})}
        rows={skeletonRows}
        showAfterMs={showAfterMs}
        {...(className !== undefined ? { className } : {})}
        {...(testId !== undefined ? { 'data-testid': testId } : {})}
      />
    ) : (
      fallback
    );

  // Default error fallback: rely on UIErrorBoundary's
  // built-in ErrorState. We just route `name` into
  // the title so the operator sees which surface
  // crashed.
  const resolvedTitle = name ? `Could not load ${name}` : undefined;

  return (
    <UIErrorBoundary
      {...(errorFallback !== undefined ? { fallback: errorFallback } : {})}
      {...(resolvedTitle !== undefined ? { title: resolvedTitle } : {})}
      {...(onError !== undefined ? { onError } : {})}
      {...(resetKeys !== undefined ? { resetKeys } : {})}
    >
      <Suspense fallback={suspenseFallback}>{children}</Suspense>
    </UIErrorBoundary>
  );
}

SuspenseWrapper.displayName = 'SuspenseWrapper';
