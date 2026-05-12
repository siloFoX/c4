import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useFeatureIdFromHash } from './use-feature-id-from-hash';

function setHash(hash: string): void {
  // jsdom updates location.hash on assignment but does not always fire
  // hashchange synchronously, so we dispatch the event ourselves to
  // drive the hook's listener deterministically.
  const oldUrl = window.location.href;
  window.location.hash = hash;
  window.dispatchEvent(
    new HashChangeEvent('hashchange', {
      oldURL: oldUrl,
      newURL: window.location.href,
    }),
  );
}

beforeEach(() => {
  setHash('');
});

afterEach(() => {
  vi.restoreAllMocks();
  setHash('');
});

describe('useFeatureIdFromHash', () => {
  it('returns null when the URL has no hash', () => {
    const { result } = renderHook(() => useFeatureIdFromHash());
    expect(result.current).toBeNull();
  });

  it('parses the initial #/feature/<id> hash on mount', () => {
    setHash('#/feature/markdown');
    const { result } = renderHook(() => useFeatureIdFromHash());
    expect(result.current).toBe('markdown');
  });

  it('returns null when the hash does not match the #/feature/ prefix', () => {
    setHash('#about');
    const { result } = renderHook(() => useFeatureIdFromHash());
    expect(result.current).toBeNull();
  });

  it('updates the active id when the hash changes to a feature deep link', () => {
    const { result } = renderHook(() => useFeatureIdFromHash());
    expect(result.current).toBeNull();
    act(() => setHash('#/feature/help'));
    expect(result.current).toBe('help');
    act(() => setHash('#/feature/conversation'));
    expect(result.current).toBe('conversation');
  });

  it('clears the active id when the hash leaves the #/feature/ prefix', () => {
    setHash('#/feature/x');
    const { result } = renderHook(() => useFeatureIdFromHash());
    expect(result.current).toBe('x');
    act(() => setHash('#other'));
    expect(result.current).toBeNull();
  });

  it('extracts an empty id from the bare prefix #/feature/', () => {
    const { result } = renderHook(() => useFeatureIdFromHash());
    act(() => setHash('#/feature/'));
    expect(result.current).toBe('');
  });

  it('registers exactly one hashchange listener on mount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useFeatureIdFromHash());
    const hashListeners = addSpy.mock.calls.filter(
      ([type]) => type === 'hashchange',
    );
    expect(hashListeners).toHaveLength(1);
  });

  it('removes its hashchange listener on unmount', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useFeatureIdFromHash());
    const addedFn = addSpy.mock.calls.find(
      ([type]) => type === 'hashchange',
    )?.[1];
    expect(addedFn).toBeDefined();
    unmount();
    const removedFn = removeSpy.mock.calls.find(
      ([type]) => type === 'hashchange',
    )?.[1];
    expect(removedFn).toBe(addedFn);
  });

  it('stops responding to hash changes after unmount', () => {
    const { result, unmount } = renderHook(() => useFeatureIdFromHash());
    act(() => setHash('#/feature/before-unmount'));
    expect(result.current).toBe('before-unmount');
    unmount();
    // After unmount the listener is gone, so the snapshot we already
    // hold should not update. We assert by re-reading the final value
    // returned from the hook before unmount, which must not have moved
    // even though the hash changed afterwards.
    act(() => setHash('#/feature/after-unmount'));
    expect(result.current).toBe('before-unmount');
  });
});
