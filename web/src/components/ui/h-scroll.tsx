import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.171) Horizontal scroll list primitive. Wraps children in a
// single-row flex container with overflow-x scrolling, optional CSS
// scroll-snap (snap-x snap-mandatory + snap-start on each direct child
// marked with data-h-scroll-item), and optional hover-revealed left /
// right arrow buttons that scrollBy ~80% of the container width. Ref
// exposes an imperative handle (scrollToIndex / scrollToEl) rather
// than the underlying div so callers cannot reach in and mutate
// scroll geometry directly.

export type HScrollGap = 'sm' | 'md' | 'lg';

export interface HScrollHandle {
  scrollToIndex: (index: number, opts?: ScrollIntoViewOptions) => void;
  scrollToEl: (el: Element, opts?: ScrollIntoViewOptions) => void;
}

export interface HScrollProps {
  children?: ReactNode;
  snap?: boolean;
  arrows?: boolean;
  gap?: HScrollGap;
  className?: string;
}

function gapClass(gap: HScrollGap): string {
  switch (gap) {
    case 'sm':
      return 'gap-2';
    case 'lg':
      return 'gap-4';
    case 'md':
    default:
      return 'gap-3';
  }
}

const ARROW_BTN =
  'absolute top-1/2 -translate-y-1/2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background/90 text-foreground shadow-sm opacity-0 transition-opacity pointer-events-none data-[visible=true]:opacity-100 data-[visible=true]:pointer-events-auto group-hover:data-[visible=true]:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary';

export const HScroll = forwardRef<HScrollHandle, HScrollProps>(function HScroll(
  { children, snap = true, arrows = false, gap = 'md', className },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const recompute = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    recompute();
    el.addEventListener('scroll', recompute, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(recompute) : null;
    if (ro) ro.observe(el);
    window.addEventListener('resize', recompute);
    return () => {
      el.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
      if (ro) ro.disconnect();
    };
  }, [recompute]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToIndex(index, opts) {
        const root = containerRef.current;
        if (!root) return;
        const items = root.querySelectorAll('[data-h-scroll-item]');
        const target = items.item(index);
        if (target) {
          (target as Element).scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center',
            ...opts,
          });
        }
      },
      scrollToEl(el, opts) {
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
          ...opts,
        });
      },
    }),
    [],
  );

  const scrollByFrac = (dir: 1 | -1) => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  };

  return (
    <div className={cn('group relative', className)}>
      <div
        ref={containerRef}
        className={cn(
          'flex overflow-x-auto',
          snap && 'snap-x snap-mandatory',
          '[&>*]:shrink-0',
          snap && '[&>[data-h-scroll-item]]:snap-start',
          gapClass(gap),
        )}
      >
        {children}
      </div>
      {arrows ? (
        <>
          <button
            type="button"
            aria-label="Scroll left"
            data-visible={canLeft ? 'true' : 'false'}
            onClick={() => scrollByFrac(-1)}
            className={cn(ARROW_BTN, 'left-1')}
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M7.5 2.5 L3.5 6 L7.5 9.5" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Scroll right"
            data-visible={canRight ? 'true' : 'false'}
            onClick={() => scrollByFrac(1)}
            className={cn(ARROW_BTN, 'right-1')}
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4.5 2.5 L8.5 6 L4.5 9.5" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );
});

HScroll.displayName = 'HScroll';
