import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  DEFAULT_LAYOUT,
  EVENT_NAME,
  STORAGE_KEY,
  getLayout,
  resetLayout,
  setLayout,
  useHealthLayout,
  type HealthLayoutKey,
} from './use-health-layout';

beforeEach(() => {
  window.localStorage.clear();
});

describe('use-health-layout', () => {
  it('getLayout returns DEFAULT_LAYOUT when no override', () => {
    expect(getLayout()).toEqual([...DEFAULT_LAYOUT]);
  });

  it('setLayout persists order to localStorage', () => {
    const next: HealthLayoutKey[] = ['workers', 'queue', 'uptime'];
    setLayout(next);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(next);
    expect(getLayout()).toEqual(next);
  });

  it('getLayout merges any new defaults at the end of stored order', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['workers']));
    const layout = getLayout();
    expect(layout[0]).toBe('workers');
    expect(layout).toContain('uptime');
    expect(layout).toContain('queue');
    expect(layout.length).toBe(DEFAULT_LAYOUT.length);
  });

  it('getLayout filters out invalid keys', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(['bogus', 'workers', 'also-bad', 'uptime']),
    );
    const layout = getLayout();
    expect(layout).toEqual(['workers', 'uptime', 'queue']);
  });

  it('resetLayout clears storage and restores default', () => {
    setLayout(['queue', 'workers', 'uptime']);
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    resetLayout();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getLayout()).toEqual([...DEFAULT_LAYOUT]);
  });

  it('CustomEvent fires on setLayout and resetLayout', () => {
    const spy = vi.fn();
    window.addEventListener(EVENT_NAME, spy);
    setLayout(['workers', 'uptime', 'queue']);
    expect(spy).toHaveBeenCalledTimes(1);
    resetLayout();
    expect(spy).toHaveBeenCalledTimes(2);
    window.removeEventListener(EVENT_NAME, spy);
  });

  it('useHealthLayout reflects setLayout via event', () => {
    const { result } = renderHook(() => useHealthLayout());
    expect(result.current[0]).toEqual([...DEFAULT_LAYOUT]);
    act(() => {
      result.current[1](['queue', 'workers', 'uptime']);
    });
    expect(result.current[0]).toEqual(['queue', 'workers', 'uptime']);
    act(() => {
      result.current[2]();
    });
    expect(result.current[0]).toEqual([...DEFAULT_LAYOUT]);
  });

  it('setLayout de-duplicates and filters invalid keys before persisting', () => {
    setLayout([
      'workers',
      'workers',
      // @ts-expect-error - intentional invalid key
      'bogus',
      'queue',
    ]);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(JSON.parse(raw as string)).toEqual(['workers', 'queue']);
    expect(getLayout()).toEqual(['workers', 'queue', 'uptime']);
  });
});
