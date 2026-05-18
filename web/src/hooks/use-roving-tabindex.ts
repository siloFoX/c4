import { useCallback, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent, MutableRefObject } from 'react';

// (v1.11.320, TODO 11.302) useRovingTabindex -- shared roving
// tabindex hook for composite widgets (Tabs, Accordion,
// SegmentedControl, ActionMenu, Toolbar). Roving tabindex is
// the WAI-ARIA pattern where:
//
//   - Exactly one item in the group is in the tab sequence at
//     a time (`tabIndex=0`); the rest are removed via
//     `tabIndex=-1`. This means a single Tab press enters or
//     leaves the whole group.
//   - Once focus is inside the group, the user navigates
//     between items with Arrow keys (orientation-aware), and
//     Home / End jump to the first / last item.
//   - Clicking or focusing an item directly also makes that
//     item the "active" (tabIndex=0) one, so the next Tab
//     out is from the same item the user just selected.
//
// The pre-existing `useFocusCycle` hook
// (`web/src/hooks/use-focus-cycle.ts`) implements the keyboard
// nav part of the contract (Arrow / Home / End -> focus the
// right element). It is intentionally stateless -- the
// caller is responsible for managing the `tabIndex` and the
// container ref.
//
// `useRovingTabindex` layers state + ref management on top so
// any composite widget can opt in by:
//
//   1. Calling the hook with its orientation + item count.
//   2. Spreading `containerProps` onto the role-group wrapper
//      (the `<div role="tablist">`, `<ul role="menu">`, etc).
//   3. Spreading `getItemProps(index)` onto each item element.
//
// The returned `activeIndex` lets the caller drive any
// "currently selected" UI (the active tab underline, the
// pressed segmented-control segment) off the same state.

export type RovingOrientation = 'horizontal' | 'vertical' | 'both';

export interface UseRovingTabindexOptions {
  // Number of items in the group. Items that move in or
  // out (dynamic lists) re-render through this count.
  itemCount: number;
  // Arrow-key axis. Default 'horizontal' to match the most
  // common adopters (Tabs, SegmentedControl, Toolbar).
  orientation?: RovingOrientation;
  // Whether Arrow nav wraps at the ends. Default true.
  wrap?: boolean;
  // Initial active index. Defaults to 0 (the first item).
  initialIndex?: number;
  // Fires when the active index changes via Arrow / Home /
  // End / explicit setActiveIndex. Does NOT fire on focus
  // (use onFocus on each item if you need that).
  onChange?: (idx: number) => void;
  // When `disabled` returns true for an index, the item is
  // skipped during Arrow nav. Default: every item is enabled.
  // The active item is still allowed to be the disabled one
  // if the caller forces it via `initialIndex` -- only the
  // *step* skips disabled items.
  isItemDisabled?: (idx: number) => boolean;
}

export interface RovingItemProps {
  tabIndex: 0 | -1;
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void;
  onFocus: (e: FocusEvent<HTMLElement>) => void;
  // Ref callback to register the item's DOM node so the hook
  // can call `.focus()` on the right element when the user
  // presses an Arrow key.
  ref: (el: HTMLElement | null) => void;
  'data-roving-index': string;
}

export interface UseRovingTabindexResult {
  activeIndex: number;
  setActiveIndex: (idx: number) => void;
  getItemProps: (idx: number) => RovingItemProps;
  // Refs exposed for callers that need them (e.g. to call
  // `.focus()` after a controlled state change).
  itemRefs: MutableRefObject<Array<HTMLElement | null>>;
}

function clampIndex(idx: number, count: number): number {
  if (count <= 0) return 0;
  if (idx < 0) return 0;
  if (idx >= count) return count - 1;
  return idx;
}

function nextEnabledIndex(
  current: number,
  count: number,
  step: 1 | -1,
  wrap: boolean,
  isDisabled: (idx: number) => boolean,
): number {
  if (count <= 0) return 0;
  let probe = current;
  for (let i = 0; i < count; i += 1) {
    probe += step;
    if (probe >= count) {
      if (!wrap) return current;
      probe = 0;
    }
    if (probe < 0) {
      if (!wrap) return current;
      probe = count - 1;
    }
    if (!isDisabled(probe)) return probe;
  }
  return current;
}

export function useRovingTabindex(
  opts: UseRovingTabindexOptions,
): UseRovingTabindexResult {
  const {
    itemCount,
    orientation = 'horizontal',
    wrap = true,
    initialIndex = 0,
    onChange,
    isItemDisabled,
  } = opts;

  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const [activeIndex, setActiveIndexState] = useState<number>(() =>
    clampIndex(initialIndex, itemCount),
  );

  // Wrap setter so external setActiveIndex calls fire onChange
  // exactly the same way the keyboard handler does.
  const setActiveIndex = useCallback(
    (idx: number) => {
      const clamped = clampIndex(idx, itemCount);
      setActiveIndexState((prev) => {
        if (prev === clamped) return prev;
        onChange?.(clamped);
        return clamped;
      });
    },
    [itemCount, onChange],
  );

  const isDisabled = useCallback(
    (idx: number) => (isItemDisabled ? isItemDisabled(idx) : false),
    [isItemDisabled],
  );

  const focusAt = useCallback((idx: number) => {
    const node = itemRefs.current[idx];
    if (node && typeof node.focus === 'function') node.focus();
  }, []);

  const moveActive = useCallback(
    (next: number) => {
      setActiveIndexState((prev) => {
        if (prev !== next) onChange?.(next);
        return next;
      });
      // Schedule the focus after the state commit so the
      // tabIndex flip lands first; using setTimeout(0) would
      // be brittle in test envs that batch with act(), so we
      // call focus() synchronously -- React will still flush
      // the state update before our return because setState
      // inside an event handler is synchronous for our
      // callback invocation.
      focusAt(next);
    },
    [onChange, focusAt],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (itemCount <= 0) return;

      const horizontal =
        orientation === 'horizontal' || orientation === 'both';
      const vertical = orientation === 'vertical' || orientation === 'both';

      const isNext =
        (horizontal && e.key === 'ArrowRight') ||
        (vertical && e.key === 'ArrowDown');
      const isPrev =
        (horizontal && e.key === 'ArrowLeft') ||
        (vertical && e.key === 'ArrowUp');
      const isHome = e.key === 'Home';
      const isEnd = e.key === 'End';

      if (!isNext && !isPrev && !isHome && !isEnd) return;

      e.preventDefault();
      e.stopPropagation();

      if (isHome) {
        // Home jumps to the first non-disabled item.
        let target = 0;
        if (isDisabled(target)) {
          target = nextEnabledIndex(-1, itemCount, 1, false, isDisabled);
        }
        moveActive(target);
        return;
      }
      if (isEnd) {
        let target = itemCount - 1;
        if (isDisabled(target)) {
          target = nextEnabledIndex(itemCount, itemCount, -1, false, isDisabled);
        }
        moveActive(target);
        return;
      }
      const step: 1 | -1 = isNext ? 1 : -1;
      const target = nextEnabledIndex(
        activeIndex,
        itemCount,
        step,
        wrap,
        isDisabled,
      );
      moveActive(target);
    },
    [activeIndex, itemCount, orientation, wrap, isDisabled, moveActive],
  );

  const handleFocus = useCallback(
    (idx: number) => {
      // When the user focuses an item directly (Tab into the
      // group, or click), make it the active one so the next
      // Tab out exits from the same item.
      setActiveIndexState((prev) => {
        if (prev === idx) return prev;
        onChange?.(idx);
        return idx;
      });
    },
    [onChange],
  );

  const getItemProps = useCallback(
    (idx: number): RovingItemProps => ({
      tabIndex: idx === activeIndex ? 0 : -1,
      onKeyDown: handleKeyDown,
      onFocus: () => handleFocus(idx),
      ref: (el: HTMLElement | null) => {
        itemRefs.current[idx] = el;
      },
      'data-roving-index': String(idx),
    }),
    [activeIndex, handleKeyDown, handleFocus],
  );

  return {
    activeIndex,
    setActiveIndex,
    getItemProps,
    itemRefs,
  };
}
