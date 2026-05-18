// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import {
  STORAGE_KEY,
  EVENT_NAME,
  MAX_ENTRIES,
  getRecentlyUsedShortcuts,
  markShortcutUsed,
  clearRecentlyUsedShortcuts,
  useRecentlyUsedShortcuts,
  useMarkShortcutUsed,
} from './shortcut-recently-used';

describe('shortcut-recently-used (storage)', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });

  it('returns [] when storage is empty', () => {
    expect(getRecentlyUsedShortcuts()).toEqual([]);
  });

  it('markShortcutUsed prepends the label to the list', () => {
    markShortcutUsed('Ctrl+B');
    expect(getRecentlyUsedShortcuts()).toEqual(['Ctrl+B']);
  });

  it('moves an existing label to the front (dedup)', () => {
    markShortcutUsed('Ctrl+B');
    markShortcutUsed('Ctrl+F');
    markShortcutUsed('Ctrl+B');
    expect(getRecentlyUsedShortcuts()).toEqual(['Ctrl+B', 'Ctrl+F']);
  });

  it(`caps the list at ${MAX_ENTRIES} entries`, () => {
    for (let i = 0; i < MAX_ENTRIES + 3; i += 1) {
      markShortcutUsed(`key-${i}`);
    }
    const list = getRecentlyUsedShortcuts();
    expect(list.length).toBe(MAX_ENTRIES);
    // Most recent first.
    expect(list[0]).toBe(`key-${MAX_ENTRIES + 2}`);
  });

  it('ignores empty labels', () => {
    markShortcutUsed('');
    expect(getRecentlyUsedShortcuts()).toEqual([]);
  });

  it('persists to localStorage', () => {
    markShortcutUsed('Ctrl+B');
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual(['Ctrl+B']);
  });

  it('clearRecentlyUsedShortcuts wipes the list', () => {
    markShortcutUsed('Ctrl+B');
    clearRecentlyUsedShortcuts();
    expect(getRecentlyUsedShortcuts()).toEqual([]);
  });

  it('survives a malformed storage value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json');
    expect(getRecentlyUsedShortcuts()).toEqual([]);
  });

  it('survives a non-array JSON value', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ a: 1 }));
    expect(getRecentlyUsedShortcuts()).toEqual([]);
  });

  it('drops non-string entries silently', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['a', 1, null, 'b']),
    );
    expect(getRecentlyUsedShortcuts()).toEqual(['a', 'b']);
  });

  it('dispatches a change event on mark', () => {
    const spy = vi.fn();
    window.addEventListener(EVENT_NAME, spy as EventListener);
    try {
      markShortcutUsed('Ctrl+B');
      expect(spy).toHaveBeenCalledTimes(1);
      const evt = spy.mock.calls[0]?.[0] as CustomEvent<string[]>;
      expect(evt.detail).toEqual(['Ctrl+B']);
    } finally {
      window.removeEventListener(EVENT_NAME, spy as EventListener);
    }
  });
});

describe('useRecentlyUsedShortcuts hook', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });
  afterEach(() => cleanup());

  it('returns the initial storage value', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['Ctrl+B']));
    const { result } = renderHook(() => useRecentlyUsedShortcuts());
    expect(result.current).toEqual(['Ctrl+B']);
  });

  it('updates when markShortcutUsed fires the change event', () => {
    const { result } = renderHook(() => useRecentlyUsedShortcuts());
    expect(result.current).toEqual([]);
    act(() => {
      markShortcutUsed('Ctrl+F');
    });
    expect(result.current).toEqual(['Ctrl+F']);
  });

  it('updates when clearRecentlyUsedShortcuts is called', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['x']));
    const { result, rerender } = renderHook(() =>
      useRecentlyUsedShortcuts(),
    );
    expect(result.current).toEqual(['x']);
    act(() => {
      clearRecentlyUsedShortcuts();
    });
    rerender();
    expect(result.current).toEqual([]);
  });
});

describe('useMarkShortcutUsed hook', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
  });
  afterEach(() => cleanup());

  it('returns a stable callback that records the shortcut', () => {
    const { result } = renderHook(() => useMarkShortcutUsed());
    act(() => {
      result.current('Ctrl+B');
    });
    expect(getRecentlyUsedShortcuts()).toEqual(['Ctrl+B']);
  });
});
