import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  FLAGS,
  STORAGE_KEY,
  EVENT_NAME,
  getFlag,
  setFlag,
  resetFlags,
  useFeatureFlag,
  useAllFlags,
} from './feature-flags';

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('feature-flags lib', () => {
  it('getFlag returns the defaultValue when localStorage is empty', () => {
    for (const f of FLAGS) {
      expect(getFlag(f.key)).toBe(f.defaultValue);
    }
  });

  it('setFlag persists to localStorage and getFlag returns the new value', () => {
    setFlag('gridDebug', true);
    expect(getFlag('gridDebug')).toBe(true);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.gridDebug).toBe(true);
  });

  it('setFlag dispatches a feature-flag-changed CustomEvent with the key + value', () => {
    const spy = vi.fn();
    const handler = (e: Event) => spy((e as CustomEvent).detail);
    window.addEventListener(EVENT_NAME, handler);
    try {
      setFlag('routeProgress', false);
      expect(spy).toHaveBeenCalledWith({ key: 'routeProgress', value: false });
    } finally {
      window.removeEventListener(EVENT_NAME, handler);
    }
  });

  it('useFeatureFlag returns the current value and updates when setFlag fires', () => {
    const { result } = renderHook(() => useFeatureFlag('motion'));
    expect(result.current[0]).toBe(true);
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });

  it('useFeatureFlag picks up external setFlag() calls via the event', () => {
    const { result } = renderHook(() => useFeatureFlag('pageTransitions'));
    expect(result.current[0]).toBe(true);
    act(() => {
      setFlag('pageTransitions', false);
    });
    expect(result.current[0]).toBe(false);
  });

  it('useAllFlags returns every registered flag and reflects updates', () => {
    const { result } = renderHook(() => useAllFlags());
    for (const f of FLAGS) {
      expect(result.current[f.key]).toBe(f.defaultValue);
    }
    act(() => {
      setFlag('reducedMotion', true);
    });
    expect(result.current.reducedMotion).toBe(true);
  });

  it('resetFlags clears localStorage and restores defaults via the event', () => {
    setFlag('gridDebug', true);
    setFlag('motion', false);
    expect(getFlag('gridDebug')).toBe(true);
    expect(getFlag('motion')).toBe(false);
    resetFlags();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    for (const f of FLAGS) {
      expect(getFlag(f.key)).toBe(f.defaultValue);
    }
  });

  it('malformed JSON in localStorage falls back to defaults', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json');
    for (const f of FLAGS) {
      expect(getFlag(f.key)).toBe(f.defaultValue);
    }
  });

  it('non-boolean stored values are ignored in favor of the default', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ gridDebug: 'yes', motion: 0 }),
    );
    expect(getFlag('gridDebug')).toBe(false);
    expect(getFlag('motion')).toBe(true);
  });
});
