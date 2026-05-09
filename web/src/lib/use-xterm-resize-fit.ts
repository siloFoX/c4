import { useEffect, useLayoutEffect, type MutableRefObject } from 'react';

// (v1.10.715) Extracted from XtermView. Three
// resize-tracking effects that all just invoke the
// shared `scheduleFit` callback returned by
// useXtermAutofit:
//
//   1. ResizeObserver on the container so a sidebar
//      collapse / panel split / dev-tools open re-fits.
//      Cleanup also drops the pending fitTimerRef so an
//      unmount mid-debounce does not leak a setTimeout
//      handle.
//   2. window resize listener — some browsers debounce
//      ResizeObserver for off-screen elements, which
//      defeats 8.27 auto-fit when the terminal tab is
//      hidden. window.resize keeps firing.
//   3. useLayoutEffect on `visible` — when the parent
//      flips a CSS visibility toggle, the next fit
//      must run synchronously after layout so the
//      first paint already shows the right size.

export function useXtermResizeFit(args: {
  containerRef: MutableRefObject<HTMLElement | null>;
  scheduleFit: () => void;
  visible: boolean;
  fitTimerRef: MutableRefObject<number | null>;
}): void {
  const { containerRef, scheduleFit, visible, fitTimerRef } = args;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => {
      scheduleFit();
    });
    obs.observe(container);
    return () => {
      try {
        obs.disconnect();
      } catch {
        // ignore teardown race
      }
      if (fitTimerRef.current != null) {
        window.clearTimeout(fitTimerRef.current);
        fitTimerRef.current = null;
      }
    };
  }, [containerRef, scheduleFit, fitTimerRef]);

  useEffect(() => {
    const onResize = () => scheduleFit();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [scheduleFit]);

  useLayoutEffect(() => {
    if (visible) scheduleFit();
  }, [visible, scheduleFit]);
}
