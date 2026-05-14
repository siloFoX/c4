import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSelectedFeatureId } from './use-selected-feature-id';

// useSelectedFeatureId owns the Features-tab selection state:
//   - readInitialFeature priority: window.location.hash (#/feature/<id>)
//     > localStorage[FEATURE_KEY] > FEATURES[0].id (currently 'scribe')
//   - Every state change persists back to BOTH surfaces via a single
//     effect: localStorage.setItem + writeHash (history.replaceState so
//     the browser back stack is not polluted by rapid tab clicks).
//   - A hashchange listener picks up valid feature ids that arrive
//     from elsewhere (manual URL edit, share link, back/forward nav)
//     and syncs state; unknown ids are ignored.
//   - writeHash short-circuits when window.location.hash already
//     matches the next value (idempotent).

const FEATURE_KEY = 'c4.features.selected';

beforeEach(() => {
  try { window.localStorage.removeItem(FEATURE_KEY); } catch { /* ignore */ }
  // Reset URL to clear any hash from a previous test's effect.
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
});

describe('useSelectedFeatureId', () => {
  it('falls back to FEATURES[0].id (scribe) when hash + localStorage are empty', () => {
    const { result } = renderHook(() => useSelectedFeatureId());
    expect(result.current[0]).toBe('scribe');
    expect(typeof result.current[1]).toBe('function');
  });

  it('seeds initial state from window.location.hash when a valid feature id is present', () => {
    window.history.replaceState(null, '', '#/feature/morning');
    const { result } = renderHook(() => useSelectedFeatureId());
    expect(result.current[0]).toBe('morning');
  });

  it('seeds initial state from localStorage when no hash is set', () => {
    window.localStorage.setItem(FEATURE_KEY, 'auto');
    const { result } = renderHook(() => useSelectedFeatureId());
    expect(result.current[0]).toBe('auto');
  });

  it('hash takes precedence over localStorage on mount', () => {
    window.localStorage.setItem(FEATURE_KEY, 'auto');
    window.history.replaceState(null, '', '#/feature/queue');
    const { result } = renderHook(() => useSelectedFeatureId());
    expect(result.current[0]).toBe('queue');
  });

  it('invalid hash feature id falls through to localStorage', () => {
    window.localStorage.setItem(FEATURE_KEY, 'auto');
    window.history.replaceState(null, '', '#/feature/not-a-feature');
    const { result } = renderHook(() => useSelectedFeatureId());
    expect(result.current[0]).toBe('auto');
  });

  it('invalid localStorage value falls back to FEATURES[0]', () => {
    window.localStorage.setItem(FEATURE_KEY, 'phony');
    const { result } = renderHook(() => useSelectedFeatureId());
    expect(result.current[0]).toBe('scribe');
  });

  it('non-#/feature/ hash prefix is treated as no hash (uses localStorage)', () => {
    window.history.replaceState(null, '', '#/something-else');
    window.localStorage.setItem(FEATURE_KEY, 'health');
    const { result } = renderHook(() => useSelectedFeatureId());
    expect(result.current[0]).toBe('health');
  });

  it('setter updates state and persists the new id to localStorage', () => {
    const { result } = renderHook(() => useSelectedFeatureId());
    act(() => { result.current[1]('plan'); });
    expect(result.current[0]).toBe('plan');
    expect(window.localStorage.getItem(FEATURE_KEY)).toBe('plan');
  });

  it('setter rewrites window.location.hash to #/feature/<id>', () => {
    const { result } = renderHook(() => useSelectedFeatureId());
    act(() => { result.current[1]('rbac'); });
    expect(window.location.hash).toBe('#/feature/rbac');
  });

  it('hashchange event with a valid feature id syncs state', () => {
    const { result } = renderHook(() => useSelectedFeatureId());
    expect(result.current[0]).toBe('scribe');
    act(() => {
      window.history.replaceState(null, '', '#/feature/health');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current[0]).toBe('health');
  });

  it('hashchange event with unknown feature id does not modify state', () => {
    const { result } = renderHook(() => useSelectedFeatureId());
    act(() => {
      window.history.replaceState(null, '', '#/feature/not-real');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current[0]).toBe('scribe');
  });

  it('hashchange event without the #/feature/ prefix is ignored', () => {
    const { result } = renderHook(() => useSelectedFeatureId());
    act(() => {
      window.history.replaceState(null, '', '#/random');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current[0]).toBe('scribe');
  });

  it('removes the hashchange listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useSelectedFeatureId());
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('hashchange', expect.any(Function));
  });

  it('setter to the current id keeps the existing hash entry (idempotent writeHash)', () => {
    const { result } = renderHook(() => useSelectedFeatureId());
    act(() => { result.current[1]('plan'); });
    expect(window.location.hash).toBe('#/feature/plan');
    act(() => { result.current[1]('plan'); });
    expect(window.location.hash).toBe('#/feature/plan');
    expect(result.current[0]).toBe('plan');
  });
});
