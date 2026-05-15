import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { useScrollRestoration } from './use-scroll-restoration';

function makeContainer(initialScrollTop = 0): HTMLElement {
  const el = document.createElement('div');
  // jsdom does not implement layout; assigning to `scrollTop`
  // is sufficient for the hook's needs (it only reads/writes the
  // value, never triggers paint).
  el.scrollTop = initialScrollTop;
  return el;
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  window.sessionStorage.clear();
});

describe('useScrollRestoration', () => {
  it('restores scrollTop from sessionStorage on mount', () => {
    const el = makeContainer();
    window.sessionStorage.setItem('c4:scroll:list', '320');
    const ref = { current: el };
    renderHook(() =>
      useScrollRestoration({ containerRef: ref, storageKey: 'list' }),
    );
    expect(el.scrollTop).toBe(320);
  });

  it('writes scrollTop to sessionStorage after the debounce window', () => {
    const el = makeContainer();
    const ref = { current: el };
    renderHook(() =>
      useScrollRestoration({
        containerRef: ref,
        storageKey: 'list',
        debounceMs: 100,
      }),
    );
    el.scrollTop = 75;
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
    expect(window.sessionStorage.getItem('c4:scroll:list')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(window.sessionStorage.getItem('c4:scroll:list')).toBe('75');
  });

  it('debounces multiple rapid scrolls into a single write of the latest value', () => {
    const el = makeContainer();
    const ref = { current: el };
    const setSpy = vi.spyOn(Storage.prototype, 'setItem');
    renderHook(() =>
      useScrollRestoration({
        containerRef: ref,
        storageKey: 'list',
        debounceMs: 100,
      }),
    );
    for (const top of [10, 20, 30, 40, 50]) {
      el.scrollTop = top;
      act(() => {
        el.dispatchEvent(new Event('scroll'));
      });
      act(() => {
        vi.advanceTimersByTime(50);
      });
    }
    expect(setSpy).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    const writes = setSpy.mock.calls.filter(
      ([k]) => k === 'c4:scroll:list',
    );
    expect(writes.length).toBe(1);
    expect(writes[0]![1]).toBe('50');
    setSpy.mockRestore();
  });

  it('reset() clears the stored position', () => {
    const el = makeContainer();
    const ref = { current: el };
    window.sessionStorage.setItem('c4:scroll:list', '200');
    const { result } = renderHook(() =>
      useScrollRestoration({ containerRef: ref, storageKey: 'list' }),
    );
    act(() => {
      result.current.reset();
    });
    expect(window.sessionStorage.getItem('c4:scroll:list')).toBeNull();
  });

  it('removes the scroll listener on unmount (no further writes)', () => {
    const el = makeContainer();
    const ref = { current: el };
    const removeSpy = vi.spyOn(el, 'removeEventListener');
    const { unmount } = renderHook(() =>
      useScrollRestoration({
        containerRef: ref,
        storageKey: 'list',
        debounceMs: 100,
      }),
    );
    unmount();
    expect(
      removeSpy.mock.calls.some(([type]) => type === 'scroll'),
    ).toBe(true);
    window.sessionStorage.clear();
    el.scrollTop = 999;
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(window.sessionStorage.getItem('c4:scroll:list')).toBeNull();
  });

  it('initial scrollTop stays 0 when sessionStorage is empty', () => {
    const el = makeContainer(0);
    const ref = { current: el };
    renderHook(() =>
      useScrollRestoration({ containerRef: ref, storageKey: 'list' }),
    );
    expect(el.scrollTop).toBe(0);
  });

  it('does not crash when the container ref is null', () => {
    const ref = createRef<HTMLDivElement>();
    expect(() =>
      renderHook(() =>
        useScrollRestoration({ containerRef: ref, storageKey: 'list' }),
      ),
    ).not.toThrow();
  });

  it('keeps two instances with different keys independent', () => {
    const a = makeContainer();
    const b = makeContainer();
    window.sessionStorage.setItem('c4:scroll:alpha', '111');
    window.sessionStorage.setItem('c4:scroll:beta', '222');
    const refA = { current: a };
    const refB = { current: b };
    renderHook(() =>
      useScrollRestoration({ containerRef: refA, storageKey: 'alpha' }),
    );
    renderHook(() =>
      useScrollRestoration({ containerRef: refB, storageKey: 'beta' }),
    );
    expect(a.scrollTop).toBe(111);
    expect(b.scrollTop).toBe(222);

    a.scrollTop = 17;
    act(() => {
      a.dispatchEvent(new Event('scroll'));
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(window.sessionStorage.getItem('c4:scroll:alpha')).toBe('17');
    expect(window.sessionStorage.getItem('c4:scroll:beta')).toBe('222');
  });

  it('flushes a pending value through on unmount instead of losing it', () => {
    const el = makeContainer();
    const ref = { current: el };
    const { unmount } = renderHook(() =>
      useScrollRestoration({
        containerRef: ref,
        storageKey: 'list',
        debounceMs: 100,
      }),
    );
    el.scrollTop = 42;
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
    expect(window.sessionStorage.getItem('c4:scroll:list')).toBeNull();
    unmount();
    expect(window.sessionStorage.getItem('c4:scroll:list')).toBe('42');
  });
});
