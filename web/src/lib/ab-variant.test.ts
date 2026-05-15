import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  SESSION_KEY,
  STORAGE_KEY,
  EVENT_NAME,
  hashString,
  assignVariant,
  getSessionId,
  getVariant,
  setVariant,
  clearVariants,
  useABVariant,
} from './ab-variant';

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('ab-variant lib', () => {
  it('hashString is deterministic for the same input', () => {
    const a = hashString('hello:world');
    const b = hashString('hello:world');
    expect(a).toBe(b);
    expect(hashString('hello:world')).not.toBe(hashString('hello:other'));
    expect(typeof a).toBe('number');
    expect(a).toBeGreaterThanOrEqual(0);
  });

  it('assignVariant returns A or B deterministically per sessionId', () => {
    for (let i = 0; i < 50; i += 1) {
      const sid = `session-${i}`;
      const first = assignVariant('exp-1', sid);
      const second = assignVariant('exp-1', sid);
      expect(first).toBe(second);
      expect(['A', 'B']).toContain(first);
    }
  });

  it('50/50 split distributes roughly evenly over 1000 sessions', () => {
    let aCount = 0;
    let bCount = 0;
    for (let i = 0; i < 1000; i += 1) {
      const v = assignVariant('exp-fifty', `sid-${i}`);
      if (v === 'A') aCount += 1;
      else bCount += 1;
    }
    expect(aCount + bCount).toBe(1000);
    expect(aCount).toBeGreaterThan(400);
    expect(aCount).toBeLessThan(600);
    expect(bCount).toBeGreaterThan(400);
    expect(bCount).toBeLessThan(600);
  });

  it('80/20 split honors weights', () => {
    let aCount = 0;
    let bCount = 0;
    for (let i = 0; i < 1000; i += 1) {
      const v = assignVariant('exp-eighty', `sid-${i}`, [0.8, 0.2]);
      if (v === 'A') aCount += 1;
      else bCount += 1;
    }
    expect(aCount).toBeGreaterThan(700);
    expect(aCount).toBeLessThan(900);
    expect(bCount).toBeGreaterThan(100);
    expect(bCount).toBeLessThan(300);
  });

  it('getSessionId persists across calls in sessionStorage', () => {
    const first = getSessionId();
    const second = getSessionId();
    expect(first).toBe(second);
    expect(window.sessionStorage.getItem(SESSION_KEY)).toBe(first);
  });

  it('setVariant persists override to localStorage', () => {
    setVariant('exp-x', 'B');
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({ 'exp-x': 'B' });
  });

  it('getVariant returns override when present, ignoring assignment', () => {
    setVariant('exp-y', 'A');
    expect(getVariant('exp-y')).toBe('A');
    setVariant('exp-y', 'B');
    expect(getVariant('exp-y')).toBe('B');
  });

  it('clearVariants empties the override store', () => {
    setVariant('exp-clear', 'B');
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    clearVariants();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('useABVariant reflects setVariant via CustomEvent', () => {
    const { result } = renderHook(() => useABVariant('exp-hook'));
    const initial = result.current[0];
    const flipped = initial === 'A' ? 'B' : 'A';
    act(() => {
      window.dispatchEvent(
        new CustomEvent(EVENT_NAME, {
          detail: { experiment: 'exp-hook', variant: flipped },
        }),
      );
    });
    expect(result.current[0]).toBe(flipped);
  });

  it('useABVariant set() persists and updates the hook state', () => {
    const { result } = renderHook(() => useABVariant('exp-hook-set'));
    act(() => {
      result.current[1]('B');
    });
    expect(result.current[0]).toBe('B');
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) as string)).toEqual({
      'exp-hook-set': 'B',
    });
  });

  it('malformed JSON in localStorage falls back to assigned variant', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    const v = getVariant('exp-fallback');
    expect(['A', 'B']).toContain(v);
    // Deterministic for the same session
    expect(getVariant('exp-fallback')).toBe(v);
  });

  it('non-object payload in localStorage falls back to assigned variant', () => {
    window.localStorage.setItem(STORAGE_KEY, '"oops"');
    const v = getVariant('exp-fallback-2');
    expect(['A', 'B']).toContain(v);
  });
});
