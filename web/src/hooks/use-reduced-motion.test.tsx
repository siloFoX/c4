import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReducedMotion } from './use-reduced-motion';

type Listener = (e: MediaQueryListEvent) => void;

interface MockMQL {
  matches: boolean;
  media: string;
  onchange: null;
  addEventListener: (type: 'change', l: Listener) => void;
  removeEventListener: (type: 'change', l: Listener) => void;
  addListener: (l: Listener) => void;
  removeListener: (l: Listener) => void;
  dispatchEvent: (e: Event) => boolean;
  _fire: (matches: boolean) => void;
}

function installMatchMedia(initial: boolean): MockMQL {
  const listeners = new Set<Listener>();
  const mql: MockMQL = {
    matches: initial,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: (_type, l) => {
      listeners.add(l);
    },
    removeEventListener: (_type, l) => {
      listeners.delete(l);
    },
    addListener: (l) => listeners.add(l),
    removeListener: (l) => listeners.delete(l),
    dispatchEvent: () => true,
    _fire(matches: boolean) {
      mql.matches = matches;
      const evt = { matches, media: mql.media } as MediaQueryListEvent;
      for (const l of listeners) l(evt);
    },
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockReturnValue(mql),
  });
  return mql;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  installMatchMedia(false);
});

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia,
  });
});

describe('useReducedMotion', () => {
  it('returns false when matchMedia.matches is false', () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when matchMedia.matches is true', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('updates when matchMedia change fires', () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => mql._fire(true));
    expect(result.current).toBe(true);
    act(() => mql._fire(false));
    expect(result.current).toBe(false);
  });

  it('falls back to false when matchMedia is unavailable (SSR-safe path)', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('uses legacy addListener/removeListener when addEventListener missing', () => {
    const listeners = new Set<Listener>();
    const mql = {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addListener: (l: Listener) => listeners.add(l),
      removeListener: (l: Listener) => listeners.delete(l),
    } as unknown as MediaQueryList;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue(mql),
    });
    const { result, unmount } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => {
      for (const l of listeners) l({ matches: true, media: mql.media } as MediaQueryListEvent);
    });
    expect(result.current).toBe(true);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
