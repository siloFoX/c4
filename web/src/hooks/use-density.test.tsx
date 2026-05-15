import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  DEFAULT_DENSITY,
  DENSITY_EVENT,
  DENSITY_SCALE,
  DENSITY_VALUES,
  useDensity,
} from './use-density';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-density');
});

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-density');
});

describe('useDensity', () => {
  it('defaults to "comfortable" when nothing is persisted', () => {
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe('comfortable');
    expect(DEFAULT_DENSITY).toBe('comfortable');
  });

  it('hydrates from localStorage when a valid value is stored', () => {
    window.localStorage.setItem('c4:density', 'compact');
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe('compact');
  });

  it('falls back to default when the stored value is malformed', () => {
    window.localStorage.setItem('c4:density', 'spacious');
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe('comfortable');
  });

  it('writes the chosen density to localStorage', () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.setDensity('cozy'));
    expect(window.localStorage.getItem('c4:density')).toBe('cozy');
  });

  it('applies the density to <html data-density="...">', () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.setDensity('compact'));
    expect(document.documentElement.getAttribute('data-density')).toBe(
      'compact',
    );
    act(() => result.current.setDensity('cozy'));
    expect(document.documentElement.getAttribute('data-density')).toBe('cozy');
  });

  it('applies the initial density on mount (effect fires)', () => {
    window.localStorage.setItem('c4:density', 'cozy');
    renderHook(() => useDensity());
    expect(document.documentElement.getAttribute('data-density')).toBe('cozy');
  });

  it('exports the canonical event name', () => {
    expect(DENSITY_EVENT).toBe('c4:density-changed');
  });

  it('exports the canonical DENSITY_VALUES tuple', () => {
    expect(DENSITY_VALUES).toEqual(['compact', 'comfortable', 'cozy']);
  });

  it('exports a DENSITY_SCALE record covering every value', () => {
    for (const d of DENSITY_VALUES) {
      expect(DENSITY_SCALE[d]).toBeDefined();
      expect(typeof DENSITY_SCALE[d].rowHeightPx).toBe('number');
      expect(typeof DENSITY_SCALE[d].cardPaddingPx).toBe('number');
      expect(typeof DENSITY_SCALE[d].gapXPx).toBe('number');
    }
  });

  it('row heights climb monotonically from compact to cozy', () => {
    expect(DENSITY_SCALE.compact.rowHeightPx).toBeLessThan(
      DENSITY_SCALE.comfortable.rowHeightPx,
    );
    expect(DENSITY_SCALE.comfortable.rowHeightPx).toBeLessThan(
      DENSITY_SCALE.cozy.rowHeightPx,
    );
  });

  it('cross-tab storage event syncs same-key density updates', () => {
    const { result } = renderHook(() => useDensity());
    expect(result.current.density).toBe('comfortable');
    act(() => {
      window.localStorage.setItem('c4:density', 'compact');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'c4:density',
          newValue: 'compact',
        }),
      );
    });
    expect(result.current.density).toBe('compact');
  });

  it('cross-tab storage event for an unrelated key is ignored', () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.setDensity('cozy'));
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'unrelated',
          newValue: 'compact',
        }),
      );
    });
    expect(result.current.density).toBe('cozy');
  });

  it('same-tab CustomEvent re-syncs sibling instances', () => {
    const { result: a } = renderHook(() => useDensity());
    const { result: b } = renderHook(() => useDensity());
    act(() => a.current.setDensity('compact'));
    expect(b.current.density).toBe('compact');
  });

  it('falls back to default when storage event newValue is malformed', () => {
    const { result } = renderHook(() => useDensity());
    act(() => result.current.setDensity('cozy'));
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'c4:density',
          newValue: 'spacious',
        }),
      );
    });
    expect(result.current.density).toBe('comfortable');
  });
});
