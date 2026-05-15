import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  TABLE_SORT_EVENT,
  tableSortStorageKey,
  useTableSort,
} from './use-table-sort';

const KEY = 'unit-test-table';
const STORAGE_KEY = tableSortStorageKey(KEY);

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
});

describe('useTableSort', () => {
  it('returns undefined sort when nothing is persisted and no default is given', () => {
    const { result } = renderHook(() => useTableSort(KEY));
    expect(result.current.sortKey).toBeUndefined();
    expect(result.current.sortDir).toBeUndefined();
  });

  it('returns the defaultSort when nothing is persisted', () => {
    const { result } = renderHook(() =>
      useTableSort(KEY, { key: 'total', dir: 'desc' }),
    );
    expect(result.current.sortKey).toBe('total');
    expect(result.current.sortDir).toBe('desc');
  });

  it('returns the persisted value when localStorage has a valid entry', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, key: 'input', dir: 'asc' }),
    );
    const { result } = renderHook(() =>
      useTableSort(KEY, { key: 'total', dir: 'desc' }),
    );
    expect(result.current.sortKey).toBe('input');
    expect(result.current.sortDir).toBe('asc');
  });

  it('persists onSortChange to localStorage', () => {
    const { result } = renderHook(() => useTableSort(KEY));
    act(() => result.current.onSortChange('worker', 'asc'));
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toEqual({ v: 1, key: 'worker', dir: 'asc' });
  });

  it('updates the returned key/dir after onSortChange', () => {
    const { result } = renderHook(() => useTableSort(KEY));
    act(() => result.current.onSortChange('total', 'desc'));
    expect(result.current.sortKey).toBe('total');
    expect(result.current.sortDir).toBe('desc');
  });

  it('reset() clears localStorage and reverts to the default', () => {
    const { result } = renderHook(() =>
      useTableSort(KEY, { key: 'total', dir: 'desc' }),
    );
    act(() => result.current.onSortChange('worker', 'asc'));
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    act(() => result.current.reset());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.sortKey).toBe('total');
    expect(result.current.sortDir).toBe('desc');
  });

  it('reset() returns undefined when no default is given', () => {
    const { result } = renderHook(() => useTableSort(KEY));
    act(() => result.current.onSortChange('input', 'desc'));
    act(() => result.current.reset());
    expect(result.current.sortKey).toBeUndefined();
    expect(result.current.sortDir).toBeUndefined();
  });

  it('clear() is an alias for reset()', () => {
    const { result } = renderHook(() =>
      useTableSort(KEY, { key: 'total', dir: 'asc' }),
    );
    act(() => result.current.onSortChange('worker', 'desc'));
    act(() => result.current.clear());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(result.current.sortKey).toBe('total');
  });

  it('ignores malformed JSON in localStorage and falls back to the default', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not-json');
    const { result } = renderHook(() =>
      useTableSort(KEY, { key: 'total', dir: 'desc' }),
    );
    expect(result.current.sortKey).toBe('total');
    expect(result.current.sortDir).toBe('desc');
  });

  it('ignores an entry with an invalid dir value', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ v: 1, key: 'total', dir: 'sideways' }),
    );
    const { result } = renderHook(() => useTableSort(KEY, { key: 'input', dir: 'asc' }));
    expect(result.current.sortKey).toBe('input');
    expect(result.current.sortDir).toBe('asc');
  });

  it('namespaces storage keys so distinct tableKeys do not collide', () => {
    const { result: a } = renderHook(() => useTableSort('table-a'));
    const { result: b } = renderHook(() => useTableSort('table-b'));
    act(() => a.current.onSortChange('col1', 'asc'));
    act(() => b.current.onSortChange('col2', 'desc'));
    expect(a.current.sortKey).toBe('col1');
    expect(b.current.sortKey).toBe('col2');
    expect(window.localStorage.getItem(tableSortStorageKey('table-a'))).not.toBeNull();
    expect(window.localStorage.getItem(tableSortStorageKey('table-b'))).not.toBeNull();
  });

  it('re-syncs on a cross-tab storage event for the matching key', () => {
    const { result } = renderHook(() => useTableSort(KEY));
    expect(result.current.sortKey).toBeUndefined();
    act(() => {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ v: 1, key: 'output', dir: 'desc' }),
      );
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: JSON.stringify({ v: 1, key: 'output', dir: 'desc' }),
        }),
      );
    });
    expect(result.current.sortKey).toBe('output');
    expect(result.current.sortDir).toBe('desc');
  });

  it('ignores cross-tab storage events for a different key', () => {
    const { result } = renderHook(() => useTableSort(KEY));
    act(() => result.current.onSortChange('total', 'asc'));
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'c4:something:else',
          newValue: 'irrelevant',
        }),
      );
    });
    expect(result.current.sortKey).toBe('total');
    expect(result.current.sortDir).toBe('asc');
  });

  it('re-syncs siblings in the same tab via the c4:table-sort-changed event', () => {
    const { result: a } = renderHook(() => useTableSort(KEY));
    const { result: b } = renderHook(() => useTableSort(KEY));
    act(() => a.current.onSortChange('input', 'desc'));
    expect(b.current.sortKey).toBe('input');
    expect(b.current.sortDir).toBe('desc');
  });

  it('reset() also fires the same-tab event so siblings re-sync', () => {
    const { result: a } = renderHook(() =>
      useTableSort(KEY, { key: 'total', dir: 'desc' }),
    );
    const { result: b } = renderHook(() =>
      useTableSort(KEY, { key: 'total', dir: 'desc' }),
    );
    act(() => a.current.onSortChange('worker', 'asc'));
    expect(b.current.sortKey).toBe('worker');
    act(() => a.current.reset());
    expect(b.current.sortKey).toBe('total');
    expect(b.current.sortDir).toBe('desc');
  });

  it('exports a stable TABLE_SORT_EVENT constant', () => {
    expect(TABLE_SORT_EVENT).toBe('c4:table-sort-changed');
  });

  it('tableSortStorageKey builds the c4:table-sort:<tableKey> form', () => {
    expect(tableSortStorageKey('foo')).toBe('c4:table-sort:foo');
    expect(tableSortStorageKey('per-task')).toBe('c4:table-sort:per-task');
  });
});
