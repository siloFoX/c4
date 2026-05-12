import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTheme } from './use-theme';
import { THEME_KEY } from './preferences';

// Minimal MediaQueryList-shaped stub. The hook only touches
// addEventListener('change', fn) / removeEventListener('change', fn)
// and the .matches getter (via resolveTheme inside applyTheme).
interface MQStub {
  matches: boolean;
  media: string;
  addEventListener: MockInstance<MediaQueryList['addEventListener']>;
  removeEventListener: MockInstance<MediaQueryList['removeEventListener']>;
  dispatch: () => void;
  onchange: ((e: MediaQueryListEvent) => void) | null;
  addListener: MockInstance<(cb: (e: MediaQueryListEvent) => void) => void>;
  removeListener: MockInstance<(cb: (e: MediaQueryListEvent) => void) => void>;
}

function makeMQ(initialMatches: boolean): MQStub {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const stub: MQStub = {
    matches: initialMatches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn(
      (_type: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.add(cb);
      },
    ) as unknown as MQStub['addEventListener'],
    removeEventListener: vi.fn(
      (_type: string, cb: (e: MediaQueryListEvent) => void) => {
        listeners.delete(cb);
      },
    ) as unknown as MQStub['removeEventListener'],
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatch: () => {
      const event = {
        matches: stub.matches,
        media: stub.media,
      } as MediaQueryListEvent;
      for (const cb of listeners) cb(event);
    },
  };
  return stub;
}

let mq: MQStub;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
  mq = makeMQ(false);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mq as unknown as MediaQueryList),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.classList.remove('dark');
});

describe('useTheme', () => {
  it('falls back to the default dark theme when localStorage is empty', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
    expect(typeof result.current.setTheme).toBe('function');
  });

  it('reads the persisted theme from localStorage on mount', () => {
    window.localStorage.setItem(THEME_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('light');
  });

  it('rejects an unknown stored theme and falls back to the default', () => {
    window.localStorage.setItem(THEME_KEY, 'neon');
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe('dark');
  });

  it('writes to localStorage and applies the dark class when setTheme(dark) runs', () => {
    window.localStorage.setItem(THEME_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes the dark class when switching to the light theme', () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    const { result } = renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    act(() => result.current.setTheme('light'));
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('resolves system to dark when the OS prefers-color-scheme: dark matches', () => {
    mq.matches = true;
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('system'));
    expect(result.current.theme).toBe('system');
    expect(window.localStorage.getItem(THEME_KEY)).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('resolves system to light when the OS does not match dark', () => {
    mq.matches = false;
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme('system'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('subscribes to the matchMedia change event only while theme is system', () => {
    window.localStorage.setItem(THEME_KEY, 'light');
    const { result } = renderHook(() => useTheme());
    expect(mq.addEventListener).not.toHaveBeenCalled();
    act(() => result.current.setTheme('system'));
    expect(mq.addEventListener).toHaveBeenCalledTimes(1);
    expect(mq.addEventListener.mock.calls[0][0]).toBe('change');
  });

  it('re-applies on OS theme flips while theme is system', () => {
    window.localStorage.setItem(THEME_KEY, 'system');
    mq.matches = false;
    renderHook(() => useTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    mq.matches = true;
    act(() => mq.dispatch());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    mq.matches = false;
    act(() => mq.dispatch());
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('removes the matchMedia listener when leaving the system theme', () => {
    window.localStorage.setItem(THEME_KEY, 'system');
    const { result } = renderHook(() => useTheme());
    expect(mq.addEventListener).toHaveBeenCalledTimes(1);
    const registered = mq.addEventListener.mock.calls[0][1];
    act(() => result.current.setTheme('light'));
    expect(mq.removeEventListener).toHaveBeenCalledTimes(1);
    expect(mq.removeEventListener.mock.calls[0][1]).toBe(registered);
  });

  it('removes the matchMedia listener on unmount when theme was system', () => {
    window.localStorage.setItem(THEME_KEY, 'system');
    const { unmount } = renderHook(() => useTheme());
    expect(mq.addEventListener).toHaveBeenCalledTimes(1);
    const registered = mq.addEventListener.mock.calls[0][1];
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalledTimes(1);
    expect(mq.removeEventListener.mock.calls[0][1]).toBe(registered);
  });
});
