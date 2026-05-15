import { useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.261, TODO 11.243) Sticky filter-bar primitive. Wraps a row
// of filter controls (search input, status select, chips, date
// range picker, sort menu, etc.) and pins it to the top of the
// nearest scroll container once the operator scrolls past it. A
// scroll-shadow lifts the bar visually so the row remains
// distinguishable from the now-floating list content underneath.
//
// Implementation:
//   - A zero-height sentinel <div> renders just above the sticky
//     wrapper. An IntersectionObserver tracks the sentinel: while
//     it is in view the bar is at its natural position (data-
//     pinned="false", no shadow). The instant the sentinel scrolls
//     out (above the viewport / scroll root) the bar is pinned
//     (data-pinned="true", shadow-md).
//   - The sticky positioning itself is pure CSS (`position: sticky`,
//     `top: <topOffset>`). The hook only drives the visual
//     elevation, not the layout.
//   - SSR-safe: the effect bails when `IntersectionObserver` is
//     missing so the component still renders in older / non-jsdom
//     environments.
//
// Props:
//   - `topOffset`: number (px) or any CSS length string. Defaults
//     to 0. Pass a value when the parent owns a fixed header that
//     should sit above the filter bar (e.g. `topOffset={48}` for a
//     48px global top bar).
//   - `zIndex`: number. Defaults to 10.
//   - any other HTMLDivElement props pass through to the wrapper
//     so the caller can wire `data-testid`, `aria-*`, etc.

export interface StickyFilterBarProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  topOffset?: number | string;
  zIndex?: number;
}

function formatTop(topOffset: number | string): string {
  return typeof topOffset === 'number' ? `${topOffset}px` : topOffset;
}

export function StickyFilterBar({
  children,
  className,
  topOffset = 0,
  zIndex = 10,
  ...rest
}: StickyFilterBarProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    // Negative rootMargin shifts the trigger line down by topOffset
    // so the bar flips pinned at the moment its top edge collides
    // with the offset, not when the sentinel itself crosses zero.
    const topPx = typeof topOffset === 'number' ? topOffset : 0;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        setPinned(!entry.isIntersecting);
      },
      {
        rootMargin: `-${topPx}px 0px 0px 0px`,
        threshold: [0, 1],
      },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [topOffset]);

  return (
    <>
      <div
        ref={sentinelRef}
        aria-hidden="true"
        data-testid="sticky-filter-bar-sentinel"
        className="h-0"
      />
      <div
        {...rest}
        data-section="sticky-filter-bar"
        data-pinned={pinned ? 'true' : 'false'}
        className={cn(
          'sticky bg-card transition-shadow duration-200',
          pinned ? 'shadow-md border-b border-border' : 'shadow-none',
          className,
        )}
        style={{
          top: formatTop(topOffset),
          zIndex,
          ...(rest.style ?? {}),
        }}
      >
        {children}
      </div>
    </>
  );
}

StickyFilterBar.displayName = 'StickyFilterBar';
