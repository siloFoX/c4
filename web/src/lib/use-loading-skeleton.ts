import { useEffect, useRef, useState } from 'react';

// (v1.11.353, TODO 11.335) Loading-skeleton orchestration
// hook.
//
// The naive pattern -- `loading ? <Skeleton /> : <Content />`
// -- has two failure modes:
//
//   1. **Flash-of-skeleton**: a fast response (sub-100ms)
//      flashes the skeleton for a frame or two then
//      replaces it with content. The user sees a visual
//      glitch instead of a smooth load.
//   2. **Flash-of-content**: a slow response that almost
//      finishes during the skeleton's first paint
//      replaces it instantly, so the user sees the
//      skeleton "blink" out the moment it appeared.
//
// `useLoadingSkeleton(loading, opts)` orchestrates two
// gates that defeat both modes:
//
//   - `showAfterMs` (default 120ms): only start showing
//     the skeleton if loading is STILL true after this
//     delay. Sub-120ms responses never show the
//     skeleton at all.
//   - `minDisplayMs` (default 300ms): once shown, keep
//     showing for at least this many ms even if loading
//     becomes false. The user sees a steady skeleton
//     followed by a clean content transition.
//
// Adoption pattern:
//
//   const showSkeleton = useLoadingSkeleton(loading);
//   return showSkeleton ? <Skeleton /> : <Content />;
//
// The hook returns `false` on the very first render so
// SSR-friendly hosts do not paint a skeleton during
// hydration when the data is already on hand.

export interface UseLoadingSkeletonOptions {
  // Time (ms) the `loading` flag must stay true before
  // the skeleton starts rendering. Default 120ms.
  // Sub-this responses never show a skeleton.
  showAfterMs?: number;
  // Minimum time (ms) the skeleton stays rendered once
  // it has started. Default 300ms. Prevents the skeleton
  // from blinking out when the response arrives soon
  // after the skeleton appears.
  minDisplayMs?: number;
}

const DEFAULT_SHOW_AFTER_MS = 120;
const DEFAULT_MIN_DISPLAY_MS = 300;

export function useLoadingSkeleton(
  loading: boolean,
  options: UseLoadingSkeletonOptions = {},
): boolean {
  const {
    showAfterMs = DEFAULT_SHOW_AFTER_MS,
    minDisplayMs = DEFAULT_MIN_DISPLAY_MS,
  } = options;

  const [showSkeleton, setShowSkeleton] = useState(false);

  // Track the timestamp when the skeleton first became
  // visible. Used by the loading=false branch to compute
  // how much more time the min-display window still owes.
  const shownAtRef = useRef<number | null>(null);
  // Refs for the two timers so an unmount / loading flip
  // mid-window does not leave stale callbacks.
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearShow = () => {
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };
    const clearHide = () => {
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };

    if (loading) {
      // Reset any pending hide while the loading state
      // is active again.
      clearHide();
      if (showSkeleton) return undefined;
      // Schedule the show transition; if loading drops
      // before this fires, the next branch cancels it.
      clearShow();
      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        shownAtRef.current = Date.now();
        setShowSkeleton(true);
      }, Math.max(0, showAfterMs));
      return () => {
        clearShow();
      };
    }

    // loading === false branch.
    // Case A: the skeleton never made it to the screen --
    // cancel the show timer and stay hidden.
    if (!showSkeleton) {
      clearShow();
      return undefined;
    }
    // Case B: the skeleton is visible. Compute the
    // remaining min-display owed; schedule a hide.
    clearHide();
    const shownAt = shownAtRef.current ?? Date.now();
    const elapsed = Date.now() - shownAt;
    const remaining = Math.max(0, minDisplayMs - elapsed);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      shownAtRef.current = null;
      setShowSkeleton(false);
    }, remaining);
    return () => {
      clearHide();
    };
  }, [loading, showAfterMs, minDisplayMs, showSkeleton]);

  // Defensive: clear both timers on full unmount.
  useEffect(() => {
    return () => {
      if (showTimerRef.current !== null) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
      if (hideTimerRef.current !== null) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  return showSkeleton;
}

// (v1.11.353, TODO 11.335) Defaults exported so callers
// + tests can reference the canonical values rather than
// hard-coding them again.
export const LOADING_SKELETON_DEFAULT_SHOW_AFTER_MS =
  DEFAULT_SHOW_AFTER_MS;
export const LOADING_SKELETON_DEFAULT_MIN_DISPLAY_MS =
  DEFAULT_MIN_DISPLAY_MS;
