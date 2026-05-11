import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { TOUR_STORAGE_KEY } from '../components/SessionsView';
import { useSessionsTour } from './use-sessions-tour';

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useSessionsTour', () => {
  it('shows the tour on first mount when no done marker is stored', () => {
    const { result } = renderHook(() => useSessionsTour());
    expect(result.current.showTour).toBe(true);
  });

  it('keeps the tour hidden when localStorage already has the done marker', () => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, 'done');
    const { result } = renderHook(() => useSessionsTour());
    expect(result.current.showTour).toBe(false);
  });

  it('swallows getItem errors silently (private-mode browsers) and leaves the tour hidden', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: localStorage is unavailable');
    });
    const { result } = renderHook(() => useSessionsTour());
    expect(result.current.showTour).toBe(false);
  });

  it('dismissTour flips showTour back to false', () => {
    const { result } = renderHook(() => useSessionsTour());
    expect(result.current.showTour).toBe(true);
    act(() => result.current.dismissTour());
    expect(result.current.showTour).toBe(false);
  });

  it('dismissTour persists the done marker to localStorage', () => {
    const { result } = renderHook(() => useSessionsTour());
    act(() => result.current.dismissTour());
    expect(window.localStorage.getItem(TOUR_STORAGE_KEY)).toBe('done');
  });

  it('dismissTour does not throw when setItem fails (still hides the tour)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useSessionsTour());
    expect(() => {
      act(() => result.current.dismissTour());
    }).not.toThrow();
    expect(result.current.showTour).toBe(false);
  });

  it('ref-guard: the storage probe runs only once even when the component re-renders', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem');
    const { rerender } = renderHook(() => useSessionsTour());
    const after1 = spy.mock.calls.filter(
      ([k]) => k === TOUR_STORAGE_KEY,
    ).length;
    rerender();
    rerender();
    const after3 = spy.mock.calls.filter(
      ([k]) => k === TOUR_STORAGE_KEY,
    ).length;
    expect(after1).toBe(1);
    expect(after3).toBe(1);
  });

  it('keeps the dismissTour reference stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useSessionsTour());
    const first = result.current.dismissTour;
    rerender();
    expect(result.current.dismissTour).toBe(first);
  });
});
