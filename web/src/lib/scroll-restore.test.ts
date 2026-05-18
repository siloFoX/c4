import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearAllScrollPositions,
  clearScrollPosition,
  getScrollPosition,
  saveScrollPosition,
  shouldRestoreScroll,
  useWindowScrollRestore,
} from './scroll-restore';

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('saveScrollPosition / getScrollPosition / clearScrollPosition', () => {
  it('round-trips a value through sessionStorage', () => {
    expect(saveScrollPosition('workers', 240)).toBe(true);
    expect(getScrollPosition('workers')).toBe(240);
  });

  it('returns null when no value is stored', () => {
    expect(getScrollPosition('never-saved')).toBeNull();
  });

  it('rounds non-integer values', () => {
    saveScrollPosition('workers', 240.7);
    expect(getScrollPosition('workers')).toBe(241);
  });

  it('rejects negative or NaN values (returns false, does not write)', () => {
    expect(saveScrollPosition('workers', -10)).toBe(false);
    expect(saveScrollPosition('workers', Number.NaN)).toBe(false);
    expect(saveScrollPosition('workers', Number.POSITIVE_INFINITY)).toBe(false);
    expect(getScrollPosition('workers')).toBeNull();
  });

  it('clear() removes the entry', () => {
    saveScrollPosition('workers', 99);
    expect(getScrollPosition('workers')).toBe(99);
    clearScrollPosition('workers');
    expect(getScrollPosition('workers')).toBeNull();
  });

  it('treats colon-bearing keys as fully-qualified', () => {
    saveScrollPosition('custom:scope:foo', 50);
    expect(window.sessionStorage.getItem('custom:scope:foo')).toBe('50');
  });

  it('uses the c4:scroll-restore: prefix for bare keys', () => {
    saveScrollPosition('workers', 50);
    expect(window.sessionStorage.getItem('c4:scroll-restore:workers')).toBe('50');
  });
});

describe('clearAllScrollPositions', () => {
  it('removes only the prefixed entries', () => {
    saveScrollPosition('workers', 1);
    saveScrollPosition('history', 2);
    window.sessionStorage.setItem('unrelated', 'keep');
    const removed = clearAllScrollPositions();
    expect(removed).toBe(2);
    expect(getScrollPosition('workers')).toBeNull();
    expect(getScrollPosition('history')).toBeNull();
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep');
  });

  it('returns 0 when there is nothing to remove', () => {
    expect(clearAllScrollPositions()).toBe(0);
  });
});

describe('shouldRestoreScroll', () => {
  it('returns true for pop / replace', () => {
    expect(shouldRestoreScroll('pop')).toBe(true);
    expect(shouldRestoreScroll('replace')).toBe(true);
  });
  it('returns false for forward', () => {
    expect(shouldRestoreScroll('forward')).toBe(false);
  });
});

describe('useWindowScrollRestore (with targetRef element)', () => {
  function makeRef(): { current: HTMLElement } {
    const el = document.createElement('div');
    el.scrollTop = 0;
    return { current: el };
  }

  it('forward navigation resets the element scroll to 0', () => {
    const ref = makeRef();
    ref.current.scrollTop = 300;
    renderHook(() =>
      useWindowScrollRestore({
        routeKey: 'workers',
        navigationType: 'forward',
        targetRef: ref,
      }),
    );
    expect(ref.current.scrollTop).toBe(0);
  });

  it('forward navigation clears any stale stored value for the route', () => {
    saveScrollPosition('workers', 500);
    const ref = makeRef();
    renderHook(() =>
      useWindowScrollRestore({
        routeKey: 'workers',
        navigationType: 'forward',
        targetRef: ref,
      }),
    );
    expect(getScrollPosition('workers')).toBeNull();
  });

  it('pop navigation restores the saved scroll position', () => {
    saveScrollPosition('workers', 250);
    const ref = makeRef();
    renderHook(() =>
      useWindowScrollRestore({
        routeKey: 'workers',
        navigationType: 'pop',
        targetRef: ref,
      }),
    );
    expect(ref.current.scrollTop).toBe(250);
  });

  it('pop navigation with no saved value scrolls to 0', () => {
    const ref = makeRef();
    ref.current.scrollTop = 99;
    renderHook(() =>
      useWindowScrollRestore({
        routeKey: 'workers',
        navigationType: 'pop',
        targetRef: ref,
      }),
    );
    expect(ref.current.scrollTop).toBe(0);
  });

  it('saves the outgoing scroll position when the routeKey changes', () => {
    const ref = makeRef();
    const { rerender } = renderHook(
      ({ routeKey }: { routeKey: string }) =>
        useWindowScrollRestore({
          routeKey,
          navigationType: 'forward',
          targetRef: ref,
        }),
      { initialProps: { routeKey: 'workers' } },
    );
    // Simulate the operator scrolling on /workers
    ref.current.scrollTop = 400;
    // Move to history
    rerender({ routeKey: 'history' });
    expect(getScrollPosition('workers')).toBe(400);
  });

  it('debounces scroll-event writes', () => {
    vi.useFakeTimers();
    const ref = makeRef();
    renderHook(() =>
      useWindowScrollRestore({
        routeKey: 'workers',
        navigationType: 'pop',
        targetRef: ref,
        debounceMs: 50,
      }),
    );
    ref.current.scrollTop = 120;
    ref.current.dispatchEvent(new Event('scroll'));
    // Not yet written
    expect(getScrollPosition('workers')).toBeNull();
    vi.advanceTimersByTime(60);
    expect(getScrollPosition('workers')).toBe(120);
    vi.useRealTimers();
  });

  it('flushes a final write on unmount', () => {
    vi.useFakeTimers();
    const ref = makeRef();
    const { unmount } = renderHook(() =>
      useWindowScrollRestore({
        routeKey: 'workers',
        navigationType: 'pop',
        targetRef: ref,
        debounceMs: 50,
      }),
    );
    ref.current.scrollTop = 75;
    ref.current.dispatchEvent(new Event('scroll'));
    // Unmount before the debounce fires
    unmount();
    expect(getScrollPosition('workers')).toBe(75);
    vi.useRealTimers();
  });
});

describe('useWindowScrollRestore (window-scroll target)', () => {
  it('reads + writes window.scrollY when no targetRef is passed', () => {
    saveScrollPosition('home', 800);
    const scrollTo = vi.spyOn(window, 'scrollTo');
    renderHook(() =>
      useWindowScrollRestore({
        routeKey: 'home',
        navigationType: 'pop',
      }),
    );
    expect(scrollTo).toHaveBeenCalled();
  });
});
