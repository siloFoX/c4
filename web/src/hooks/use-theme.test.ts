import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from './use-theme';

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

function installMatchMedia(initialDark = false): MockMQL {
  const listeners = new Set<Listener>();
  const mql: MockMQL = {
    matches: initialDark,
    media: '(prefers-color-scheme: dark)',
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

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme');
  installMatchMedia(false);
});

afterEach(() => {
  window.localStorage.clear();
});

describe('useTheme', () => {
  it('defaults to system when no localStorage entry', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('reads light from localStorage on init', () => {
    window.localStorage.setItem('c4:theme', 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
    expect(result.current.resolvedTheme).toBe('light');
  });

  it('reads dark from localStorage on init', () => {
    window.localStorage.setItem('c4:theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('invalid localStorage value falls back to system', () => {
    window.localStorage.setItem('c4:theme', 'nonsense');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
  });

  it('setTheme(dark) updates resolvedTheme and adds dark class', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('setTheme(light) removes dark class', () => {
    window.localStorage.setItem('c4:theme', 'dark');
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => result.current.setTheme('light'));
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('setTheme persists to localStorage', () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('dark'));
    expect(window.localStorage.getItem('c4:theme')).toBe('dark');
    act(() => result.current.setTheme('system'));
    expect(window.localStorage.getItem('c4:theme')).toBe('system');
  });

  it('system mode tracks matchMedia changes', () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('system');
    expect(result.current.resolvedTheme).toBe('light');
    act(() => mql._fire(true));
    expect(result.current.resolvedTheme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => mql._fire(false));
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('explicit theme ignores OS pref changes', () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('light'));
    act(() => mql._fire(true));
    expect(result.current.resolvedTheme).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
