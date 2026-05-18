import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';
import { Button } from './button';

// (v1.11.356, TODO 11.338) IntersectionObserver-based
// infinite-scroll primitive.
//
// Renders the supplied `children` plus a sentinel
// element at the bottom. When the sentinel intersects
// the viewport (or a custom scroll root), the primitive
// fires `onLoadMore()`. Adopters control the loading /
// error / hasMore state externally so the same primitive
// works for paginated APIs, cursor-based feeds, and
// SSE-buffered timelines.
//
// Three terminal states surface inline, in this priority
// order:
//
//   1. `error` truthy        -> render `errorContent`
//      (default: an inline retry card) + stop calling
//      `onLoadMore` until the caller clears the error.
//   2. `loading` truthy      -> render `loadingContent`
//      (default: a dim "Loading more..." line) inside
//      the sentinel so the operator sees a fetch in
//      flight.
//   3. `!hasMore`            -> render `endContent`
//      (default: a "End of list" marker) so the
//      operator knows the bottom is reached.
//
// When none of the above hold, the sentinel is an
// empty 1px-tall observed element; it fires
// `onLoadMore()` the moment it becomes visible.
//
// jsdom does NOT implement IntersectionObserver. Tests
// can mock it via `globalThis.IntersectionObserver =
// vi.fn(...)` or call the imperative
// `triggerLoadMore()` via the ref handle the component
// exposes.

export interface InfiniteScrollHandle {
  // Imperatively trigger onLoadMore. Useful for tests
  // + a "Load more" button affordance that needs to
  // share the same fetch path. No-ops when the
  // primitive is in a loading / error / end state.
  triggerLoadMore: () => void;
  // Convenience accessor for the sentinel element so
  // tests can fire synthetic intersection events
  // against it.
  getSentinel: () => HTMLDivElement | null;
}

export interface InfiniteScrollProps {
  children: ReactNode;
  // Whether more items are available. When false the
  // primitive renders `endContent` and stops calling
  // `onLoadMore`.
  hasMore: boolean;
  // Whether a load is in flight. While true the
  // primitive renders `loadingContent` and skips the
  // intersection trigger.
  loading: boolean;
  // Most recent load error. When set, the primitive
  // renders `errorContent` (default: inline retry
  // card) and stops calling `onLoadMore` until the
  // caller clears it (via `onRetry`).
  error: Error | null;
  // Fired once per "sentinel entered viewport" event.
  // The caller is expected to flip `loading` to true
  // and fetch the next page; the primitive itself
  // does NOT track in-flight state.
  onLoadMore: () => void;
  // Fired when the operator clicks the inline retry
  // button in the default error fallback. Should clear
  // `error` and re-fetch.
  onRetry?: () => void;
  // Optional overrides for the three terminal states.
  loadingContent?: ReactNode;
  errorContent?: ReactNode | ((retry: () => void) => ReactNode);
  endContent?: ReactNode;
  // IntersectionObserver options. Pre-load before the
  // sentinel is fully visible by setting a positive
  // rootMargin (e.g., `'200px 0px'` to fire 200px
  // before the bottom edge).
  rootMargin?: string;
  threshold?: number | number[];
  // Optional scroll root. When omitted the observer
  // uses the viewport.
  root?: Element | null;
  className?: string;
  ariaLabel?: string;
  // Ref handle for imperative triggers.
  scrollRef?: React.Ref<InfiniteScrollHandle>;
}

const DEFAULT_ROOT_MARGIN = '200px 0px';

function defaultErrorContent(
  error: Error | null,
  onRetry: (() => void) | undefined,
): ReactNode {
  return (
    <div
      data-section="infinite-scroll-error"
      role="alert"
      className="flex flex-col items-center gap-2 px-3 py-4 text-sm text-destructive"
    >
      <span>{error?.message || 'Failed to load more.'}</span>
      {onRetry ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRetry}
          data-testid="infinite-scroll-retry"
        >
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function defaultLoadingContent(): ReactNode {
  return (
    <div
      data-section="infinite-scroll-loading"
      role="status"
      aria-live="polite"
      className="px-3 py-4 text-center text-xs text-muted-foreground"
    >
      Loading more...
    </div>
  );
}

function defaultEndContent(): ReactNode {
  return (
    <div
      data-section="infinite-scroll-end"
      className="px-3 py-4 text-center text-xs text-muted-foreground"
    >
      End of list
    </div>
  );
}

export function InfiniteScroll(props: InfiniteScrollProps): JSX.Element {
  const {
    children,
    hasMore,
    loading,
    error,
    onLoadMore,
    onRetry,
    loadingContent,
    errorContent,
    endContent,
    rootMargin = DEFAULT_ROOT_MARGIN,
    threshold = 0,
    root,
    className,
    ariaLabel,
    scrollRef,
  } = props;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Latest callback in a ref so the observer effect can
  // stay referentially stable across renders. Without
  // this the observer would tear down + reconnect on
  // every onLoadMore identity change.
  const loadMoreRef = useRef(onLoadMore);
  loadMoreRef.current = onLoadMore;
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;
  const errorRef = useRef<Error | null>(error);
  errorRef.current = error;

  // Imperative handle: manual trigger + sentinel accessor.
  const triggerLoadMore = useCallback(() => {
    if (loadingRef.current) return;
    if (errorRef.current) return;
    if (!hasMoreRef.current) return;
    loadMoreRef.current();
  }, []);

  // Forward the imperative handle via the supplied ref
  // (object or callback form). React.useImperativeHandle
  // works on forwardRef components only; since this is a
  // plain function component, we assign via a useEffect.
  useEffect(() => {
    if (!scrollRef) return undefined;
    const handle: InfiniteScrollHandle = {
      triggerLoadMore,
      getSentinel: () => sentinelRef.current,
    };
    if (typeof scrollRef === 'function') {
      scrollRef(handle);
      return () => {
        scrollRef(null);
      };
    }
    (scrollRef as React.MutableRefObject<InfiniteScrollHandle | null>).current =
      handle;
    return () => {
      (
        scrollRef as React.MutableRefObject<InfiniteScrollHandle | null>
      ).current = null;
    };
  }, [scrollRef, triggerLoadMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (loadingRef.current) return;
          if (errorRef.current) return;
          if (!hasMoreRef.current) return;
          loadMoreRef.current();
          return;
        }
      },
      {
        rootMargin,
        threshold,
        ...(root !== undefined ? { root } : {}),
      },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [rootMargin, threshold, root]);

  let sentinelInner: ReactNode = null;
  if (error) {
    sentinelInner =
      typeof errorContent === 'function'
        ? errorContent(onRetry ?? (() => undefined))
        : errorContent ?? defaultErrorContent(error, onRetry);
  } else if (loading) {
    sentinelInner = loadingContent ?? defaultLoadingContent();
  } else if (!hasMore) {
    sentinelInner = endContent ?? defaultEndContent();
  }

  return (
    <div
      data-section="infinite-scroll"
      data-state={
        error
          ? 'error'
          : loading
            ? 'loading'
            : hasMore
              ? 'idle'
              : 'end'
      }
      aria-label={ariaLabel}
      className={cn('flex flex-col', className)}
    >
      {children}
      <div
        ref={sentinelRef}
        data-testid="infinite-scroll-sentinel"
        // 1px-tall sentinel so the observer sees an
        // actual element to track. The inner content
        // (loading / error / end) renders above it.
        style={{ minHeight: '1px' }}
      >
        {sentinelInner}
      </div>
    </div>
  );
}

InfiniteScroll.displayName = 'InfiniteScroll';
