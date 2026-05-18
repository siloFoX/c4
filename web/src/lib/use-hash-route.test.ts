import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  makeBreadcrumbNavigator,
  parseHashParams,
  useHashRoute,
} from './use-hash-route';

beforeEach(() => {
  // Reset hash before each test.
  window.location.hash = '';
});

afterEach(() => {
  window.location.hash = '';
  vi.restoreAllMocks();
});

describe('parseHashParams', () => {
  it('returns empty object for empty input', () => {
    expect(parseHashParams('')).toEqual({});
    expect(parseHashParams('#')).toEqual({});
  });

  it('parses key=value pairs', () => {
    expect(parseHashParams('#feature=workers')).toEqual({
      feature: 'workers',
    });
  });

  it('parses multiple & separated pairs', () => {
    expect(parseHashParams('#feature=workers&worker=auto-w42')).toEqual({
      feature: 'workers',
      worker: 'auto-w42',
    });
  });

  it('URL-decodes values', () => {
    expect(parseHashParams('#name=hello%20world')).toEqual({
      name: 'hello world',
    });
  });

  it('skips malformed segments without a key', () => {
    expect(parseHashParams('#=novalue&feature=workers')).toEqual({
      feature: 'workers',
    });
  });

  it('skips segments without =', () => {
    expect(parseHashParams('#bare&feature=workers')).toEqual({
      feature: 'workers',
    });
  });

  it('handles missing leading #', () => {
    expect(parseHashParams('feature=workers')).toEqual({
      feature: 'workers',
    });
  });
});

describe('useHashRoute', () => {
  it('returns the current hash on mount', () => {
    window.location.hash = '#feature=workers';
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.hash).toBe('#feature=workers');
  });

  it('updates when the hashchange event fires', () => {
    const { result } = renderHook(() => useHashRoute());
    expect(result.current.hash).toBe('');
    act(() => {
      window.location.hash = '#feature=history';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(result.current.hash).toBe('#feature=history');
  });

  it('navigate() writes the target to location.hash with a leading #', () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current.navigate('feature=settings'));
    expect(window.location.hash).toBe('#feature=settings');
  });

  it('navigate() accepts a target that already has a leading #', () => {
    const { result } = renderHook(() => useHashRoute());
    act(() => result.current.navigate('#feature=workers'));
    expect(window.location.hash).toBe('#feature=workers');
  });

  it('removes the hashchange listener on unmount', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useHashRoute());
    unmount();
    const calls = remove.mock.calls.filter((c) => c[0] === 'hashchange');
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe('makeBreadcrumbNavigator', () => {
  it('returns a function that calls navigate(target)', () => {
    const navigate = vi.fn();
    const factory = makeBreadcrumbNavigator(navigate);
    const handler = factory('#feature=workers');
    handler({ preventDefault: () => {} });
    expect(navigate).toHaveBeenCalledWith('#feature=workers');
  });

  it('calls preventDefault on the event', () => {
    const navigate = vi.fn();
    const preventDefault = vi.fn();
    const handler = makeBreadcrumbNavigator(navigate)('#x');
    handler({ preventDefault });
    expect(preventDefault).toHaveBeenCalled();
  });

  it('survives events without a preventDefault function', () => {
    const navigate = vi.fn();
    const handler = makeBreadcrumbNavigator(navigate)('#x');
    expect(() => handler({})).not.toThrow();
    expect(navigate).toHaveBeenCalled();
  });
});
