import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  applyFilters,
  applyMultiSort,
  parseTableState,
  serializeTableState,
  toggleSort,
  useUrlTableState,
  type ColumnFilter,
  type SortDescriptor,
} from './data-table-state';

interface Row {
  name: string;
  age: number;
  active: boolean;
  joined?: string;
}

const rows: Row[] = [
  { name: 'bob', age: 30, active: true, joined: '2026-04-01' },
  { name: 'alice', age: 25, active: false, joined: '2026-05-10' },
  { name: 'carol', age: 25, active: true, joined: '2026-03-15' },
  { name: 'dan', age: 40, active: true },
];

describe('applyMultiSort', () => {
  it('returns the original rows when sortBy is empty', () => {
    expect(applyMultiSort(rows, [])).toEqual(rows);
  });

  it('sorts by a single key ascending', () => {
    const sorted = applyMultiSort(rows, [{ key: 'name', dir: 'asc' }]);
    expect(sorted.map((r) => r.name)).toEqual(['alice', 'bob', 'carol', 'dan']);
  });

  it('sorts by a single key descending', () => {
    const sorted = applyMultiSort(rows, [{ key: 'age', dir: 'desc' }]);
    expect(sorted.map((r) => r.age)).toEqual([40, 30, 25, 25]);
  });

  it('falls back to the secondary key when the primary ties', () => {
    const sorted = applyMultiSort(rows, [
      { key: 'age', dir: 'asc' },
      { key: 'name', dir: 'asc' },
    ]);
    expect(sorted.map((r) => `${r.name}/${r.age}`)).toEqual([
      'alice/25',
      'carol/25',
      'bob/30',
      'dan/40',
    ]);
  });

  it('sorts nulls last regardless of direction', () => {
    const sorted = applyMultiSort(rows, [{ key: 'joined', dir: 'asc' }]);
    // joined null = dan should land last.
    expect(sorted[sorted.length - 1]?.name).toBe('dan');
    const desc = applyMultiSort(rows, [{ key: 'joined', dir: 'desc' }]);
    expect(desc[desc.length - 1]?.name).toBe('dan');
  });

  it('keeps the original sort stable for tie rows', () => {
    const tied: Row[] = [
      { name: 'a', age: 5, active: true },
      { name: 'b', age: 5, active: true },
      { name: 'c', age: 5, active: true },
    ];
    const sorted = applyMultiSort(tied, [{ key: 'age', dir: 'asc' }]);
    expect(sorted.map((r) => r.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('toggleSort', () => {
  it('appends a new column with asc on first click', () => {
    const next = toggleSort([], 'name');
    expect(next).toEqual([{ key: 'name', dir: 'asc' }]);
  });

  it('flips asc to desc on the second click', () => {
    const next = toggleSort([{ key: 'name', dir: 'asc' }], 'name');
    expect(next).toEqual([{ key: 'name', dir: 'desc' }]);
  });

  it('clears the column on the third click', () => {
    const next = toggleSort([{ key: 'name', dir: 'desc' }], 'name');
    expect(next).toEqual([]);
  });

  it('replaces the sort list on a plain click for a different column', () => {
    const next = toggleSort(
      [{ key: 'name', dir: 'asc' }],
      'age',
    );
    expect(next).toEqual([{ key: 'age', dir: 'asc' }]);
  });

  it('appends with shift+click on a new column', () => {
    const next = toggleSort(
      [{ key: 'name', dir: 'asc' }],
      'age',
      { shiftKey: true },
    );
    expect(next).toEqual([
      { key: 'name', dir: 'asc' },
      { key: 'age', dir: 'asc' },
    ]);
  });

  it('shift+click on an existing column flips its dir without losing the others', () => {
    const next = toggleSort(
      [
        { key: 'name', dir: 'asc' },
        { key: 'age', dir: 'asc' },
      ],
      'age',
      { shiftKey: true },
    );
    expect(next).toEqual([
      { key: 'name', dir: 'asc' },
      { key: 'age', dir: 'desc' },
    ]);
  });

  it('shift+click on a desc column removes it and keeps the rest', () => {
    const next = toggleSort(
      [
        { key: 'name', dir: 'asc' },
        { key: 'age', dir: 'desc' },
      ],
      'age',
      { shiftKey: true },
    );
    expect(next).toEqual([{ key: 'name', dir: 'asc' }]);
  });
});

describe('applyFilters', () => {
  it('returns all rows when filters are empty', () => {
    expect(applyFilters(rows, {})).toHaveLength(rows.length);
  });

  it('text filter does case-insensitive substring match', () => {
    const filters: Record<string, ColumnFilter> = {
      name: { type: 'text', value: 'AL' },
    };
    expect(applyFilters(rows, filters).map((r) => r.name)).toEqual(['alice']);
  });

  it('text filter with empty value is a no-op', () => {
    const filters: Record<string, ColumnFilter> = {
      name: { type: 'text', value: '   ' },
    };
    expect(applyFilters(rows, filters)).toHaveLength(rows.length);
  });

  it('select filter accepts any value in the list', () => {
    const filters: Record<string, ColumnFilter> = {
      name: { type: 'select', values: ['alice', 'dan'] },
    };
    expect(applyFilters(rows, filters).map((r) => r.name)).toEqual([
      'alice',
      'dan',
    ]);
  });

  it('select filter with empty list is a no-op', () => {
    const filters: Record<string, ColumnFilter> = {
      name: { type: 'select', values: [] },
    };
    expect(applyFilters(rows, filters)).toHaveLength(rows.length);
  });

  it('range filter respects min + max bounds', () => {
    const filters: Record<string, ColumnFilter> = {
      age: { type: 'range', min: 26, max: 35 },
    };
    expect(applyFilters(rows, filters).map((r) => r.name)).toEqual(['bob']);
  });

  it('range filter with only min is open-ended high', () => {
    const filters: Record<string, ColumnFilter> = {
      age: { type: 'range', min: 30 },
    };
    expect(applyFilters(rows, filters).map((r) => r.name).sort()).toEqual([
      'bob',
      'dan',
    ]);
  });

  it('date filter is inclusive on the to-bound (end of day)', () => {
    const filters: Record<string, ColumnFilter> = {
      joined: { type: 'date', from: '2026-04-01', to: '2026-05-10' },
    };
    const names = applyFilters(rows, filters).map((r) => r.name);
    expect(names.sort()).toEqual(['alice', 'bob']);
  });

  it('date filter excludes rows where the field is missing', () => {
    const filters: Record<string, ColumnFilter> = {
      joined: { type: 'date', from: '2020-01-01' },
    };
    const names = applyFilters(rows, filters).map((r) => r.name);
    expect(names).not.toContain('dan');
  });

  it('combines multiple filters with AND', () => {
    const filters: Record<string, ColumnFilter> = {
      name: { type: 'text', value: 'a' },
      age: { type: 'range', min: 30 },
    };
    expect(applyFilters(rows, filters).map((r) => r.name)).toEqual(['dan']);
  });
});

describe('serializeTableState + parseTableState', () => {
  it('round-trips multi-column sort', () => {
    const sortBy: SortDescriptor[] = [
      { key: 'name', dir: 'asc' },
      { key: 'age', dir: 'desc' },
    ];
    const { params } = serializeTableState({ sortBy, filters: {} });
    expect(params['sort']).toBe('name:asc,age:desc');
    const parsed = parseTableState(params);
    expect(parsed.sortBy).toEqual(sortBy);
  });

  it('round-trips text + select + range + date filters', () => {
    const filters: Record<string, ColumnFilter> = {
      name: { type: 'text', value: 'al' },
      status: { type: 'select', values: ['open', 'wip'] },
      age: { type: 'range', min: 20, max: 50 },
      joined: { type: 'date', from: '2026-01-01', to: '2026-12-31' },
    };
    const { params } = serializeTableState({ sortBy: [], filters });
    expect(params['f.name']).toBe('text:al');
    expect(params['f.status']).toBe('select:open|wip');
    expect(params['f.age']).toBe('range:20..50');
    expect(params['f.joined']).toBe('date:2026-01-01..2026-12-31');
    const parsed = parseTableState(params);
    expect(parsed.filters).toEqual(filters);
  });

  it('omits empty filters', () => {
    const filters: Record<string, ColumnFilter> = {
      name: { type: 'text', value: '   ' },
      status: { type: 'select', values: [] },
      age: { type: 'range' },
      joined: { type: 'date' },
    };
    const { params } = serializeTableState({ sortBy: [], filters });
    expect(params).toEqual({});
  });

  it('respects a custom paramPrefix', () => {
    const sortBy: SortDescriptor[] = [{ key: 'name', dir: 'asc' }];
    const { params } = serializeTableState({
      sortBy,
      filters: { name: { type: 'text', value: 'x' } },
      paramPrefix: 'users-',
    });
    expect(params['users-sort']).toBe('name:asc');
    expect(params['users-f.name']).toBe('text:x');
    const parsed = parseTableState(params, 'users-');
    expect(parsed.sortBy).toEqual(sortBy);
    expect(parsed.filters['name']).toEqual({ type: 'text', value: 'x' });
  });

  it('parseTableState accepts URLSearchParams', () => {
    const usp = new URLSearchParams('sort=name:desc&f.age=range:10..');
    const parsed = parseTableState(usp);
    expect(parsed.sortBy).toEqual([{ key: 'name', dir: 'desc' }]);
    expect(parsed.filters['age']).toEqual({ type: 'range', min: 10 });
  });

  it('ignores malformed sort segments', () => {
    const parsed = parseTableState({ sort: 'name:bad,:asc,age:desc' });
    expect(parsed.sortBy).toEqual([{ key: 'age', dir: 'desc' }]);
  });
});

describe('useUrlTableState', () => {
  function makeReaders() {
    let params = new URLSearchParams();
    return {
      read: () => params,
      onWrite: vi.fn((next: URLSearchParams) => {
        params = next;
      }),
      get: () => params,
    };
  }

  it('returns the default sort + filters when the URL is empty', () => {
    const { read, onWrite } = makeReaders();
    const { result } = renderHook(() =>
      useUrlTableState({
        read,
        onWrite,
        defaultSort: [{ key: 'name', dir: 'asc' }],
      }),
    );
    expect(result.current.sortBy).toEqual([{ key: 'name', dir: 'asc' }]);
    expect(result.current.filters).toEqual({});
  });

  it('parses initial state from the URL', () => {
    const params = new URLSearchParams(
      'sort=age:desc&f.name=text:al',
    );
    const onWrite = vi.fn();
    const { result } = renderHook(() =>
      useUrlTableState({
        read: () => params,
        onWrite,
      }),
    );
    expect(result.current.sortBy).toEqual([{ key: 'age', dir: 'desc' }]);
    expect(result.current.filters['name']).toEqual({
      type: 'text',
      value: 'al',
    });
  });

  it('writes updated state back to the URL via onWrite', () => {
    const { read, onWrite, get } = makeReaders();
    const { result } = renderHook(() => useUrlTableState({ read, onWrite }));
    act(() => result.current.setSortBy([{ key: 'name', dir: 'asc' }]));
    expect(get().get('sort')).toBe('name:asc');
  });

  it('setFilter(col, null) removes the filter from the URL', () => {
    const params = new URLSearchParams('f.name=text:al');
    const onWrite = vi.fn();
    const { result } = renderHook(() =>
      useUrlTableState({
        read: () => params,
        onWrite,
      }),
    );
    expect(result.current.filters['name']).toBeDefined();
    act(() => result.current.setFilter('name', null));
    expect(result.current.filters['name']).toBeUndefined();
  });

  it('reset() restores the default state', () => {
    const { read, onWrite } = makeReaders();
    const { result } = renderHook(() =>
      useUrlTableState({
        read,
        onWrite,
        defaultSort: [{ key: 'name', dir: 'asc' }],
      }),
    );
    act(() => result.current.setSortBy([{ key: 'age', dir: 'desc' }]));
    expect(result.current.sortBy).toEqual([{ key: 'age', dir: 'desc' }]);
    act(() => result.current.reset());
    expect(result.current.sortBy).toEqual([{ key: 'name', dir: 'asc' }]);
  });

  it('preserves unrelated URL params on write', () => {
    let params = new URLSearchParams('page=3&sort=age:desc');
    const onWrite = vi.fn((next: URLSearchParams) => {
      params = next;
    });
    const { result } = renderHook(() =>
      useUrlTableState({
        read: () => params,
        onWrite,
      }),
    );
    act(() => result.current.setSortBy([{ key: 'name', dir: 'asc' }]));
    expect(params.get('page')).toBe('3');
    expect(params.get('sort')).toBe('name:asc');
  });
});
