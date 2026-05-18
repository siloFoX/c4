import { useCallback, useEffect, useMemo, useState } from 'react';

// (v1.11.373, TODO 11.355) Data-table state helpers.
//
// Pure functions for multi-column sort, type-aware
// filters, and URL state serialisation. The
// `DataTable` component in `components/ui/data-table.tsx`
// composes these helpers; tests drive them directly
// without rendering.

// ---- Sort -----------------------------------------------------

export type SortDir = 'asc' | 'desc';

export interface SortDescriptor {
  // Column key (matches the `Column.key` on the
  // DataTable surface).
  key: string;
  dir: SortDir;
}

export type Comparable = string | number | boolean | Date | null | undefined;

function compareValues(a: Comparable, b: Comparable): number {
  // Nulls sort last regardless of direction; the
  // caller flips the sign via `dir`.
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return (a === b) ? 0 : a ? 1 : -1;
  }
  // Fallback: string compare with locale-aware
  // numeric ordering ('item-2' < 'item-10').
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export type SortAccessor<T> = (row: T, key: string) => Comparable;

const defaultSortAccessor: SortAccessor<unknown> = (row, key) => {
  if (row == null || typeof row !== 'object') return null;
  return (row as Record<string, Comparable>)[key] ?? null;
};

export function applyMultiSort<T>(
  rows: readonly T[],
  sortBy: readonly SortDescriptor[],
  accessor: SortAccessor<T> = defaultSortAccessor as SortAccessor<T>,
): T[] {
  if (sortBy.length === 0) return [...rows];
  // Decorate-sort-undecorate to keep the sort
  // stable (Array.prototype.sort has been stable
  // since ES2019; defence in depth via the index
  // tiebreaker).
  const decorated = rows.map((row, index) => ({ row, index }));
  decorated.sort((a, b) => {
    for (const descriptor of sortBy) {
      const va = accessor(a.row, descriptor.key);
      const vb = accessor(b.row, descriptor.key);
      const cmp = compareValues(va, vb);
      if (cmp === 0) continue;
      // Nulls-last invariant: the dir flip skips
      // null-vs-non-null comparisons. compareValues
      // always sorts nulls AFTER non-nulls
      // regardless of direction.
      if (va == null || vb == null) return cmp;
      return descriptor.dir === 'desc' ? -cmp : cmp;
    }
    return a.index - b.index;
  });
  return decorated.map((d) => d.row);
}

// Returns the next sort list after the operator
// clicks `columnKey`. Default semantics:
//
//   - Plain click on a non-sorted column: replace
//     the sort list with `[{ key, dir: 'asc' }]`.
//   - Plain click on the active asc column: flip
//     to desc.
//   - Plain click on the active desc column: clear.
//   - Shift+click: append (or flip in place) so the
//     existing sort priority is preserved -- this
//     is the multi-column path.

export interface ToggleSortOptions {
  shiftKey?: boolean;
}

export function toggleSort(
  current: readonly SortDescriptor[],
  columnKey: string,
  options: ToggleSortOptions = {},
): SortDescriptor[] {
  const idx = current.findIndex((d) => d.key === columnKey);
  const append = !!options.shiftKey;
  if (idx === -1) {
    const next: SortDescriptor = { key: columnKey, dir: 'asc' };
    return append ? [...current, next] : [next];
  }
  const existing = current[idx];
  if (!existing) {
    return append ? [...current] : [];
  }
  if (existing.dir === 'asc') {
    const flipped: SortDescriptor = { key: columnKey, dir: 'desc' };
    if (append) {
      const out = [...current];
      out[idx] = flipped;
      return out;
    }
    return [flipped];
  }
  // existing.dir === 'desc' -> clear.
  if (append) {
    return current.filter((d) => d.key !== columnKey);
  }
  return [];
}

// ---- Filters --------------------------------------------------

export type FilterType = 'text' | 'select' | 'range' | 'date';

export interface TextFilter {
  type: 'text';
  // Case-insensitive substring match. Empty string
  // disables the filter.
  value: string;
}

export interface SelectFilter {
  type: 'select';
  // Empty array disables the filter; otherwise the
  // row passes when its value is one of the
  // entries.
  values: readonly string[];
}

export interface RangeFilter {
  type: 'range';
  min?: number;
  max?: number;
}

export interface DateFilter {
  type: 'date';
  // ISO date strings (YYYY-MM-DD) inclusive.
  from?: string;
  to?: string;
}

export type ColumnFilter =
  | TextFilter
  | SelectFilter
  | RangeFilter
  | DateFilter;

export type FilterAccessor<T> = (row: T, key: string) => Comparable;

const defaultFilterAccessor: FilterAccessor<unknown> = (row, key) => {
  if (row == null || typeof row !== 'object') return null;
  return (row as Record<string, Comparable>)[key] ?? null;
};

function isoToDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function rowPassesFilter<T>(
  row: T,
  key: string,
  filter: ColumnFilter,
  accessor: FilterAccessor<T>,
): boolean {
  const raw = accessor(row, key);
  switch (filter.type) {
    case 'text': {
      const needle = filter.value.trim().toLowerCase();
      if (!needle) return true;
      if (raw == null) return false;
      return String(raw).toLowerCase().includes(needle);
    }
    case 'select': {
      if (filter.values.length === 0) return true;
      if (raw == null) return false;
      return filter.values.includes(String(raw));
    }
    case 'range': {
      if (filter.min == null && filter.max == null) return true;
      if (typeof raw !== 'number' || Number.isNaN(raw)) return false;
      if (filter.min != null && raw < filter.min) return false;
      if (filter.max != null && raw > filter.max) return false;
      return true;
    }
    case 'date': {
      if (!filter.from && !filter.to) return true;
      const rowDate =
        raw instanceof Date
          ? raw
          : typeof raw === 'string'
            ? isoToDate(raw)
            : null;
      if (!rowDate) return false;
      if (filter.from) {
        const fromDate = isoToDate(filter.from);
        if (fromDate && rowDate < fromDate) return false;
      }
      if (filter.to) {
        const toDate = isoToDate(filter.to);
        if (toDate) {
          // Inclusive: bump `to` to end of day so
          // 2026-05-18 includes events at 23:59.
          const endOfDay = new Date(toDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (rowDate > endOfDay) return false;
        }
      }
      return true;
    }
    default:
      return true;
  }
}

export function applyFilters<T>(
  rows: readonly T[],
  filters: Record<string, ColumnFilter | undefined>,
  accessor: FilterAccessor<T> = defaultFilterAccessor as FilterAccessor<T>,
): T[] {
  const entries = Object.entries(filters).filter(
    (entry): entry is [string, ColumnFilter] => entry[1] != null,
  );
  if (entries.length === 0) return [...rows];
  return rows.filter((row) =>
    entries.every(([key, filter]) =>
      rowPassesFilter(row, key, filter, accessor),
    ),
  );
}

// ---- URL serialisation ----------------------------------------

// The URL state is serialised as one query
// parameter per dimension:
//
//   sort=col1:asc,col2:desc
//   f.<col>=text:foo
//   f.<col>=select:open|done
//   f.<col>=range:1..100
//   f.<col>=date:2026-05-01..2026-05-18
//
// `paramPrefix` lets two tables coexist on the
// same route (`paramPrefix='users-'` -> keys
// `users-sort`, `users-f.role`).

const FILTER_PREFIX = 'f.';

export interface SerialisedTableState {
  // The query parameter map. Keys are the actual
  // URL parameter names (prefix included). Values
  // are the encoded strings.
  params: Record<string, string>;
}

export function serializeTableState(opts: {
  sortBy: readonly SortDescriptor[];
  filters: Record<string, ColumnFilter | undefined>;
  paramPrefix?: string;
}): SerialisedTableState {
  const prefix = opts.paramPrefix ?? '';
  const params: Record<string, string> = {};
  if (opts.sortBy.length > 0) {
    params[`${prefix}sort`] = opts.sortBy
      .map((d) => `${d.key}:${d.dir}`)
      .join(',');
  }
  for (const [col, filter] of Object.entries(opts.filters)) {
    if (!filter) continue;
    const key = `${prefix}${FILTER_PREFIX}${col}`;
    switch (filter.type) {
      case 'text': {
        if (!filter.value.trim()) continue;
        params[key] = `text:${filter.value}`;
        break;
      }
      case 'select': {
        if (filter.values.length === 0) continue;
        params[key] = `select:${filter.values.join('|')}`;
        break;
      }
      case 'range': {
        if (filter.min == null && filter.max == null) continue;
        params[key] = `range:${filter.min ?? ''}..${filter.max ?? ''}`;
        break;
      }
      case 'date': {
        if (!filter.from && !filter.to) continue;
        params[key] = `date:${filter.from ?? ''}..${filter.to ?? ''}`;
        break;
      }
    }
  }
  return { params };
}

export interface ParsedTableState {
  sortBy: SortDescriptor[];
  filters: Record<string, ColumnFilter>;
}

export function parseTableState(
  params: URLSearchParams | Record<string, string>,
  paramPrefix = '',
): ParsedTableState {
  const get = (key: string): string | null => {
    if (params instanceof URLSearchParams) return params.get(key);
    return params[key] ?? null;
  };
  const entries: Array<[string, string]> =
    params instanceof URLSearchParams
      ? Array.from(params.entries())
      : Object.entries(params);
  const sortRaw = get(`${paramPrefix}sort`);
  const sortBy: SortDescriptor[] = [];
  if (sortRaw) {
    for (const seg of sortRaw.split(',')) {
      const [key, dir] = seg.split(':');
      if (!key || (dir !== 'asc' && dir !== 'desc')) continue;
      sortBy.push({ key, dir });
    }
  }
  const filters: Record<string, ColumnFilter> = {};
  const filterPrefix = `${paramPrefix}${FILTER_PREFIX}`;
  for (const [paramKey, paramValue] of entries) {
    if (!paramKey.startsWith(filterPrefix)) continue;
    const col = paramKey.slice(filterPrefix.length);
    if (!col) continue;
    const sep = paramValue.indexOf(':');
    if (sep < 0) continue;
    const type = paramValue.slice(0, sep);
    const rest = paramValue.slice(sep + 1);
    switch (type) {
      case 'text': {
        filters[col] = { type: 'text', value: rest };
        break;
      }
      case 'select': {
        const values = rest ? rest.split('|') : [];
        filters[col] = { type: 'select', values };
        break;
      }
      case 'range': {
        const [minStr, maxStr] = rest.split('..');
        const filter: RangeFilter = { type: 'range' };
        if (minStr) {
          const min = Number(minStr);
          if (Number.isFinite(min)) filter.min = min;
        }
        if (maxStr) {
          const max = Number(maxStr);
          if (Number.isFinite(max)) filter.max = max;
        }
        filters[col] = filter;
        break;
      }
      case 'date': {
        const [from, to] = rest.split('..');
        const filter: DateFilter = { type: 'date' };
        if (from) filter.from = from;
        if (to) filter.to = to;
        filters[col] = filter;
        break;
      }
      default:
        break;
    }
  }
  return { sortBy, filters };
}

// ---- React hook -----------------------------------------------

export interface UseUrlTableStateOptions {
  // URL parameter prefix to namespace multiple
  // tables on one route. Defaults to '' (single
  // table per route).
  paramPrefix?: string;
  // Default state applied when the URL has no
  // matching parameters.
  defaultSort?: readonly SortDescriptor[];
  defaultFilters?: Record<string, ColumnFilter>;
  // Custom writer for tests / non-browser hosts.
  // Defaults to `window.history.replaceState`.
  onWrite?: (params: URLSearchParams) => void;
  // Custom reader for tests. Defaults to
  // `window.location.search`.
  read?: () => URLSearchParams;
}

export interface UseUrlTableStateResult {
  sortBy: SortDescriptor[];
  filters: Record<string, ColumnFilter>;
  setSortBy: (next: readonly SortDescriptor[]) => void;
  setFilter: (column: string, filter: ColumnFilter | null) => void;
  setFilters: (next: Record<string, ColumnFilter>) => void;
  reset: () => void;
}

function readWindowSearch(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function writeWindowSearch(params: URLSearchParams): void {
  if (typeof window === 'undefined') return;
  const search = params.toString();
  const next = `${window.location.pathname}${search ? '?' : ''}${search}${window.location.hash}`;
  try {
    window.history.replaceState(null, '', next);
  } catch {
    // ignore: a sandboxed iframe rejects
    // replaceState, the in-memory state still
    // works.
  }
}

export function useUrlTableState(
  options: UseUrlTableStateOptions = {},
): UseUrlTableStateResult {
  const {
    paramPrefix = '',
    defaultSort = [],
    defaultFilters = {},
    onWrite = writeWindowSearch,
    read = readWindowSearch,
  } = options;

  const initial = useMemo(() => {
    const parsed = parseTableState(read(), paramPrefix);
    return {
      sortBy:
        parsed.sortBy.length > 0
          ? parsed.sortBy
          : Array.from(defaultSort),
      filters:
        Object.keys(parsed.filters).length > 0
          ? parsed.filters
          : { ...defaultFilters },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [sortBy, setSortByState] = useState<SortDescriptor[]>(initial.sortBy);
  const [filters, setFiltersState] = useState<Record<string, ColumnFilter>>(
    initial.filters,
  );

  // Sync to URL whenever state changes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const { params: nextParams } = serializeTableState({
      sortBy,
      filters,
      paramPrefix,
    });
    // Preserve every OTHER param that lives on
    // the URL so the table state does not nuke
    // unrelated query state (auth tokens, page
    // ids).
    const current = read();
    for (const key of Array.from(current.keys())) {
      if (
        key === `${paramPrefix}sort` ||
        key.startsWith(`${paramPrefix}${FILTER_PREFIX}`)
      ) {
        current.delete(key);
      }
    }
    for (const [k, v] of Object.entries(nextParams)) {
      current.set(k, v);
    }
    onWrite(current);
  }, [sortBy, filters, paramPrefix, onWrite, read]);

  const setSortBy = useCallback((next: readonly SortDescriptor[]) => {
    setSortByState([...next]);
  }, []);

  const setFilter = useCallback(
    (column: string, filter: ColumnFilter | null) => {
      setFiltersState((prev) => {
        const next = { ...prev };
        if (filter == null) {
          delete next[column];
        } else {
          next[column] = filter;
        }
        return next;
      });
    },
    [],
  );

  const setFilters = useCallback((next: Record<string, ColumnFilter>) => {
    setFiltersState({ ...next });
  }, []);

  const reset = useCallback(() => {
    setSortByState(Array.from(defaultSort));
    setFiltersState({ ...defaultFilters });
  }, [defaultSort, defaultFilters]);

  return {
    sortBy,
    filters,
    setSortBy,
    setFilter,
    setFilters,
    reset,
  };
}
