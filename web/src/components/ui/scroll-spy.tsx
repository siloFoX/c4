import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.440, TODO 11.422) ScrollSpy primitive.
//
// Renders a navigation list whose active item tracks the
// section currently in the viewport. Uses
// `IntersectionObserver` to watch every linked section; on
// click the matching section is smooth-scrolled into view with
// an optional offset for sticky headers.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ScrollSpyItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

export type ScrollSpyOrientation = 'vertical' | 'horizontal';

export interface ScrollSpyItemRenderArgs {
  item: ScrollSpyItem;
  isActive: boolean;
  onClick: () => void;
}

export interface ScrollSpyProps {
  items: ScrollSpyItem[];
  activeId?: string | null;
  defaultActiveId?: string | null;
  onActiveChange?: (id: string | null) => void;
  rootMargin?: string;
  threshold?: number | number[];
  scrollBehavior?: 'smooth' | 'auto';
  orientation?: ScrollSpyOrientation;
  className?: string;
  ariaLabel?: string;
  scrollOffset?: number;
  renderItem?: (args: ScrollSpyItemRenderArgs) => ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_SCROLL_SPY_ROOT_MARGIN = '0px 0px -50% 0px';
export const DEFAULT_SCROLL_SPY_THRESHOLD = 0;
export const DEFAULT_SCROLL_SPY_ORIENTATION:
  ScrollSpyOrientation = 'vertical';
export const DEFAULT_SCROLL_SPY_OFFSET = 0;

// Minimal subset of IntersectionObserverEntry consumed by the
// pure helpers, exposed so tests + adopters can pass synthetic
// entry shapes without instantiating the full DOM type.
export interface ScrollSpyEntry {
  isIntersecting: boolean;
  intersectionRatio: number;
  target: { id: string };
}

export function getMostVisibleEntry(
  entries: readonly ScrollSpyEntry[],
): ScrollSpyEntry | null {
  let best: ScrollSpyEntry | null = null;
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    if (
      best == null ||
      entry.intersectionRatio > best.intersectionRatio
    ) {
      best = entry;
    }
  }
  return best;
}

// Merge a batch of fresh entries with the previously-active id
// to derive the new active id. Returns `null` when no section
// is currently intersecting AND the previously-active section
// is not in the incoming batch.
export function getActiveIdFromEntries(
  entries: readonly ScrollSpyEntry[],
  previousActive: string | null,
): string | null {
  const best = getMostVisibleEntry(entries);
  if (best) return best.target.id;
  // None of the batch is intersecting. Keep the previous
  // active id if it is not in this batch (we have no info to
  // refute it) or null otherwise.
  const ids = new Set(entries.map((e) => e.target.id));
  if (previousActive != null && !ids.has(previousActive)) {
    return previousActive;
  }
  return null;
}

export function scrollIntoViewWithOffset(
  element: HTMLElement | null | undefined,
  offset: number = DEFAULT_SCROLL_SPY_OFFSET,
  behavior: ScrollBehavior = 'smooth',
): void {
  if (!element) return;
  if (offset === 0) {
    element.scrollIntoView({ behavior, block: 'start' });
    return;
  }
  // jsdom safety: getBoundingClientRect / scrollY may be 0
  const rect = element.getBoundingClientRect();
  const top = rect.top + window.scrollY - offset;
  if (typeof window.scrollTo === 'function') {
    window.scrollTo({ top, behavior });
  } else {
    element.scrollIntoView({ behavior, block: 'start' });
  }
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ScrollSpy = forwardRef(function ScrollSpy(
  {
    items,
    activeId,
    defaultActiveId = null,
    onActiveChange,
    rootMargin = DEFAULT_SCROLL_SPY_ROOT_MARGIN,
    threshold = DEFAULT_SCROLL_SPY_THRESHOLD,
    scrollBehavior = 'smooth',
    orientation = DEFAULT_SCROLL_SPY_ORIENTATION,
    className,
    ariaLabel = 'Section navigation',
    scrollOffset = DEFAULT_SCROLL_SPY_OFFSET,
    renderItem,
  }: ScrollSpyProps,
  ref: ForwardedRef<HTMLElement>,
) {
  const isControlled = activeId !== undefined;
  const [internalActive, setInternalActive] = useState<string | null>(
    defaultActiveId,
  );
  const effectiveActive = isControlled
    ? (activeId ?? null)
    : internalActive;

  const onActiveChangeRef = useRef(onActiveChange);
  useEffect(() => {
    onActiveChangeRef.current = onActiveChange;
  }, [onActiveChange]);

  const lastActiveRef = useRef<string | null>(effectiveActive);
  useEffect(() => {
    lastActiveRef.current = effectiveActive;
  }, [effectiveActive]);

  const emitActive = useCallback(
    (next: string | null) => {
      if (lastActiveRef.current === next) return;
      lastActiveRef.current = next;
      if (!isControlled) setInternalActive(next);
      onActiveChangeRef.current?.(next);
    },
    [isControlled],
  );

  // --- IntersectionObserver wiring ------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (typeof window.IntersectionObserver === 'undefined') {
      // No IO available: leave active id as-is.
      return undefined;
    }
    const ids = items.filter((i) => !i.disabled).map((i) => i.id);
    const elements: HTMLElement[] = [];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) elements.push(el);
    }
    if (elements.length === 0) return undefined;

    const thresholdArg = threshold as number | number[];
    const observerInit: IntersectionObserverInit = {
      rootMargin,
      threshold: thresholdArg,
    };
    const observer = new window.IntersectionObserver(
      (entries) => {
        const next = getActiveIdFromEntries(
          entries.map(
            (e): ScrollSpyEntry => ({
              isIntersecting: e.isIntersecting,
              intersectionRatio: e.intersectionRatio,
              target: { id: (e.target as Element).id },
            }),
          ),
          lastActiveRef.current,
        );
        if (next != null) emitActive(next);
      },
      observerInit,
    );
    for (const el of elements) {
      observer.observe(el);
    }
    return () => {
      observer.disconnect();
    };
  }, [emitActive, items, rootMargin, threshold]);

  const handleItemClick = useCallback(
    (id: string) => {
      const element = document.getElementById(id);
      scrollIntoViewWithOffset(element, scrollOffset, scrollBehavior);
      emitActive(id);
    },
    [emitActive, scrollBehavior, scrollOffset],
  );

  const isVertical = orientation === 'vertical';

  return (
    <nav
      ref={ref}
      aria-label={ariaLabel}
      data-section="scroll-spy"
      data-orientation={orientation}
      data-active-id={effectiveActive ?? ''}
      data-item-count={items.length}
      className={cn('w-full', className)}
    >
      <ul
        data-section="scroll-spy-list"
        className={cn(
          isVertical
            ? 'flex flex-col gap-1'
            : 'flex flex-row items-center gap-2',
        )}
      >
        {items.map((item) => {
          const isActive = item.id === effectiveActive;
          const onClick = () => {
            if (item.disabled) return;
            handleItemClick(item.id);
          };
          if (renderItem) {
            return (
              <li
                key={item.id}
                data-section="scroll-spy-item"
                data-item-id={item.id}
                data-active={isActive ? 'true' : 'false'}
                data-disabled={item.disabled ? 'true' : 'false'}
              >
                {renderItem({ item, isActive, onClick })}
              </li>
            );
          }
          return (
            <li
              key={item.id}
              data-section="scroll-spy-item"
              data-item-id={item.id}
              data-active={isActive ? 'true' : 'false'}
              data-disabled={item.disabled ? 'true' : 'false'}
            >
              <a
                href={`#${item.id}`}
                aria-current={isActive ? 'location' : undefined}
                aria-disabled={item.disabled || undefined}
                data-section="scroll-spy-link"
                onClick={(event) => {
                  event.preventDefault();
                  onClick();
                }}
                className={cn(
                  'block rounded px-3 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  item.disabled &&
                    'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-muted-foreground',
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});

ScrollSpy.displayName = 'ScrollSpy';
