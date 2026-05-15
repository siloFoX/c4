import { useCallback } from 'react';
import type { KeyboardEvent, RefObject } from 'react';

export type FocusCycleOrientation = 'horizontal' | 'vertical' | 'both';

export interface UseFocusCycleOptions {
  containerRef: RefObject<HTMLElement>;
  itemSelector?: string;
  orientation?: FocusCycleOrientation;
  wrap?: boolean;
  onSelect?: (el: HTMLElement) => void;
}

export interface UseFocusCycleResult {
  handleKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  focusFirst: () => void;
  focusLast: () => void;
  focusIndex: (idx: number) => void;
}

const DEFAULT_SELECTOR =
  '[role=menuitem], [role=tab], [role=option], button:not([disabled])';

function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hasAttribute('hidden')) return false;
  return true;
}

function collectItems(
  container: HTMLElement | null,
  selector: string,
): HTMLElement[] {
  if (!container) return [];
  const all = Array.from(container.querySelectorAll<HTMLElement>(selector));
  return all.filter(isVisible);
}

export function useFocusCycle(
  opts: UseFocusCycleOptions,
): UseFocusCycleResult {
  const {
    containerRef,
    itemSelector = DEFAULT_SELECTOR,
    orientation = 'vertical',
    wrap = true,
    onSelect,
  } = opts;

  const getItems = useCallback(
    () => collectItems(containerRef.current, itemSelector),
    [containerRef, itemSelector],
  );

  const focusAt = useCallback(
    (items: HTMLElement[], idx: number) => {
      const target = items[idx];
      if (!target) return;
      target.focus();
      onSelect?.(target);
    },
    [onSelect],
  );

  const focusFirst = useCallback(() => {
    const items = getItems();
    focusAt(items, 0);
  }, [getItems, focusAt]);

  const focusLast = useCallback(() => {
    const items = getItems();
    focusAt(items, items.length - 1);
  }, [getItems, focusAt]);

  const focusIndex = useCallback(
    (idx: number) => {
      const items = getItems();
      focusAt(items, idx);
    },
    [getItems, focusAt],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Tab') return;

      const horizontal = orientation === 'horizontal' || orientation === 'both';
      const vertical = orientation === 'vertical' || orientation === 'both';

      const isNext =
        (vertical && e.key === 'ArrowDown') ||
        (horizontal && e.key === 'ArrowRight');
      const isPrev =
        (vertical && e.key === 'ArrowUp') ||
        (horizontal && e.key === 'ArrowLeft');
      const isHome = e.key === 'Home';
      const isEnd = e.key === 'End';

      if (!isNext && !isPrev && !isHome && !isEnd) return;

      const items = getItems();
      if (items.length === 0) return;

      e.preventDefault();
      e.stopPropagation();

      const active = (typeof document !== 'undefined'
        ? (document.activeElement as HTMLElement | null)
        : null);
      const currentIdx = active ? items.indexOf(active) : -1;

      let nextIdx = currentIdx;
      if (isHome) {
        nextIdx = 0;
      } else if (isEnd) {
        nextIdx = items.length - 1;
      } else if (isNext) {
        if (currentIdx < 0) {
          nextIdx = 0;
        } else if (currentIdx >= items.length - 1) {
          nextIdx = wrap ? 0 : items.length - 1;
        } else {
          nextIdx = currentIdx + 1;
        }
      } else if (isPrev) {
        if (currentIdx < 0) {
          nextIdx = items.length - 1;
        } else if (currentIdx <= 0) {
          nextIdx = wrap ? items.length - 1 : 0;
        } else {
          nextIdx = currentIdx - 1;
        }
      }

      focusAt(items, nextIdx);
    },
    [orientation, wrap, getItems, focusAt],
  );

  return { handleKeyDown, focusFirst, focusLast, focusIndex };
}
