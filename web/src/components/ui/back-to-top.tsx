import {
  forwardRef,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '../../lib/cn';

// (v1.11.441, TODO 11.423) BackToTop primitive.
//
// Floating action button that appears once the page has been
// scrolled past a configurable threshold. Clicking the button
// smooth-scrolls the watched target back to its top with an
// optional offset, fires `onClick`, and (for non-Window
// targets) honours the host's preferred scroll behaviour.
//
// Reference: /root/c4/arps-design-system-v1/.

export type BackToTopPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'bottom-center';

export interface BackToTopProps {
  threshold?: number;
  scrollBehavior?: 'smooth' | 'auto';
  scrollTarget?: HTMLElement | Window | null;
  ariaLabel?: string;
  position?: BackToTopPosition;
  icon?: ReactNode;
  showLabel?: boolean;
  label?: ReactNode;
  className?: string;
  onClick?: () => void;
  initiallyVisible?: boolean;
  visible?: boolean;
  hideOnVisible?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_BACK_TO_TOP_THRESHOLD = 200;
export const DEFAULT_BACK_TO_TOP_POSITION: BackToTopPosition =
  'bottom-right';
export const DEFAULT_BACK_TO_TOP_LABEL = 'Back to top';

export function shouldShowBackToTop(
  scrollY: number,
  threshold: number = DEFAULT_BACK_TO_TOP_THRESHOLD,
): boolean {
  if (!Number.isFinite(scrollY)) return false;
  if (!Number.isFinite(threshold)) return false;
  return scrollY >= Math.max(0, threshold);
}

export function getScrollTop(
  target: HTMLElement | Window | null | undefined,
): number {
  if (target == null) return 0;
  if (target === window) {
    return typeof window.scrollY === 'number'
      ? window.scrollY
      : (document?.documentElement?.scrollTop ?? 0);
  }
  if (target instanceof HTMLElement) {
    return target.scrollTop;
  }
  return 0;
}

export function scrollTargetToTop(
  target: HTMLElement | Window | null | undefined,
  behavior: ScrollBehavior = 'smooth',
): void {
  if (target == null) return;
  if (target === window) {
    if (typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior });
    } else if (document?.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    return;
  }
  if (target instanceof HTMLElement) {
    if (typeof target.scrollTo === 'function') {
      target.scrollTo({ top: 0, behavior });
    } else {
      target.scrollTop = 0;
    }
  }
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

const POSITION_CLASS: Record<BackToTopPosition, string> = {
  'bottom-right': 'right-4 bottom-4',
  'bottom-left': 'left-4 bottom-4',
  'bottom-center': 'left-1/2 -translate-x-1/2 bottom-4',
};

export const BackToTop = forwardRef(function BackToTop(
  {
    threshold = DEFAULT_BACK_TO_TOP_THRESHOLD,
    scrollBehavior = 'smooth',
    scrollTarget,
    ariaLabel = DEFAULT_BACK_TO_TOP_LABEL,
    position = DEFAULT_BACK_TO_TOP_POSITION,
    icon,
    showLabel = false,
    label = DEFAULT_BACK_TO_TOP_LABEL,
    className,
    onClick,
    initiallyVisible = false,
    visible,
    hideOnVisible = true,
  }: BackToTopProps,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  const isControlled = visible !== undefined;
  const [internalVisible, setInternalVisible] = useState<boolean>(
    initiallyVisible,
  );
  const effectiveVisible = isControlled
    ? !!visible
    : internalVisible;

  useEffect(() => {
    if (isControlled) return undefined;
    if (typeof window === 'undefined') return undefined;
    const target = scrollTarget ?? window;
    const onScroll = () => {
      const top = getScrollTop(target);
      setInternalVisible(shouldShowBackToTop(top, threshold));
    };
    // Sync the visibility once on mount, but only when the
    // current scroll position already meets the threshold. This
    // preserves an explicit `initiallyVisible=true` override on
    // a fresh page (scrollY=0) while still revealing the button
    // when the user navigates to a deep-link / restored scroll
    // position past the threshold.
    const initialTop = getScrollTop(target);
    if (shouldShowBackToTop(initialTop, threshold)) {
      setInternalVisible(true);
    }
    const eventTarget =
      target instanceof HTMLElement ? target : window;
    eventTarget.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      eventTarget.removeEventListener('scroll', onScroll);
    };
  }, [isControlled, scrollTarget, threshold]);

  const handleClick = useCallback(() => {
    onClick?.();
    const target = scrollTarget ?? window;
    scrollTargetToTop(target, scrollBehavior);
    // Optimistically hide after click; the next scroll event will
    // re-sync once smooth-scroll lands at the top.
    if (!isControlled && hideOnVisible) {
      setInternalVisible(false);
    }
  }, [
    hideOnVisible,
    isControlled,
    onClick,
    scrollBehavior,
    scrollTarget,
  ]);

  return (
    <button
      ref={ref}
      type="button"
      aria-label={
        typeof ariaLabel === 'string' ? ariaLabel : 'Back to top'
      }
      aria-hidden={effectiveVisible ? undefined : 'true'}
      tabIndex={effectiveVisible ? 0 : -1}
      onClick={handleClick}
      data-section="back-to-top"
      data-visible={effectiveVisible ? 'true' : 'false'}
      data-position={position}
      className={cn(
        'fixed z-40 inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-primary-foreground shadow-lg',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'transition-opacity duration-200',
        POSITION_CLASS[position],
        effectiveVisible
          ? 'opacity-100 pointer-events-auto'
          : 'opacity-0 pointer-events-none',
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-section="back-to-top-icon"
        className="inline-flex items-center justify-center"
      >
        {icon ?? <ArrowUp className="h-4 w-4" />}
      </span>
      {showLabel ? (
        <span
          data-section="back-to-top-label"
          className="text-sm font-medium"
        >
          {label}
        </span>
      ) : null}
    </button>
  );
});

BackToTop.displayName = 'BackToTop';
