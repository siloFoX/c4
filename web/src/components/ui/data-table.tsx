import { useMemo } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import {
  applyFilters,
  applyMultiSort,
  toggleSort,
  type ColumnFilter,
  type Comparable,
  type FilterType,
  type SortAccessor,
  type FilterAccessor,
  type SortDescriptor,
} from '../../lib/data-table-state';

// (v1.11.373, TODO 11.355) DataTable -- composes
// the multi-column sort + type-aware filter
// helpers from `lib/data-table-state.ts` into
// one declarative table primitive.
//
// What it does:
//
//   - Renders column headers as buttons that
//     cycle through asc / desc / clear. Shift-
//     click appends to the current sort list,
//     enabling multi-column sort. Active sort
//     columns show a priority badge (1, 2, 3).
//   - Renders an optional filter row beneath the
//     header. Each column declares a filter type
//     ('text' | 'select' | 'range' | 'date') and
//     the row picks the right input shape.
//   - Owns no state -- the caller wires
//     `sortBy` + `filters` + setters (typically
//     via `useUrlTableState` for URL sync). The
//     filter / sort math runs on every render so
//     the rendered rows always reflect the
//     committed state.
//
// What it does NOT do:
//
//   - Pagination: out of scope. Adopters wrap
//     with the existing Pagination primitive.
//   - Server-side sort / filter: the helpers run
//     client-side. A future adapter can swap the
//     local applyMultiSort / applyFilters for a
//     remote query.
//   - Editable cells: out of scope.

export interface DataTableColumn<T> {
  key: string;
  label: ReactNode;
  sortable?: boolean;
  // Optional explicit filter declaration. When
  // omitted, the column has no filter row entry.
  filter?: DataTableFilterDef;
  // Cell render override. Receives the row + the
  // row index. Defaults to the row's keyed value
  // (string-coerced).
  render?: (row: T, rowIndex: number) => ReactNode;
  // Column-level accessor for sort + filter.
  // Useful when the row stores derived data
  // somewhere other than `row[key]`.
  accessor?: (row: T) => Comparable;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export interface DataTableFilterDef {
  type: FilterType;
  // Filter input placeholder.
  placeholder?: string;
  // 'select' type: option list. Each entry is the
  // canonical row value the filter matches
  // against.
  options?: Array<{ value: string; label?: ReactNode }>;
  // 'select' type: when true, the filter input
  // renders as a multi-select (checkbox group).
  // Defaults to single-select. Single-select
  // emits a select with one chosen value;
  // multi-select emits the full array.
  multi?: boolean;
  // 'range' type: optional input step / min /
  // max attributes.
  step?: number;
  min?: number;
  max?: number;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  sortBy: readonly SortDescriptor[];
  onSortByChange: (next: readonly SortDescriptor[]) => void;
  filters: Record<string, ColumnFilter>;
  onFilterChange: (column: string, filter: ColumnFilter | null) => void;
  // Optional className applied to the outer
  // <table>.
  className?: string;
  // Accessible name forwarded to the <table>.
  ariaLabel?: string;
  // Optional row key.
  rowKey?: (row: T, index: number) => string | number;
  emptyMessage?: ReactNode;
  // Test hook.
  'data-testid'?: string;
}

function alignClass(align?: DataTableColumn<unknown>['align']): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function defaultCell<T>(row: T, key: string): ReactNode {
  if (row == null || typeof row !== 'object') return null;
  const value = (row as Record<string, unknown>)[key];
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function defaultAccessor<T>(row: T, key: string): Comparable {
  if (row == null || typeof row !== 'object') return null;
  return (row as Record<string, Comparable>)[key] ?? null;
}

export function DataTable<T>(props: DataTableProps<T>): JSX.Element {
  const {
    columns,
    rows,
    sortBy,
    onSortByChange,
    filters,
    onFilterChange,
    className,
    ariaLabel,
    rowKey,
    emptyMessage = 'No rows.',
    'data-testid': testId,
  } = props;

  // Per-column accessor wired into the sort +
  // filter helpers. Falls back to row[key] when
  // the column does not declare a custom
  // accessor.
  const accessorMap = useMemo(() => {
    const m = new Map<string, (row: T) => Comparable>();
    for (const col of columns) {
      if (col.accessor) m.set(col.key, col.accessor);
    }
    return m;
  }, [columns]);

  const sortAccessor: SortAccessor<T> = (row, key) => {
    const fn = accessorMap.get(key);
    return fn ? fn(row) : defaultAccessor(row, key);
  };
  const filterAccessor: FilterAccessor<T> = (row, key) => {
    const fn = accessorMap.get(key);
    return fn ? fn(row) : defaultAccessor(row, key);
  };

  const filteredRows = useMemo(
    () => applyFilters(rows, filters, filterAccessor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, filters, accessorMap],
  );
  const sortedRows = useMemo(
    () => applyMultiSort(filteredRows, sortBy, sortAccessor),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredRows, sortBy, accessorMap],
  );

  const hasFilterRow = columns.some((c) => c.filter);

  const sortIndex = (key: string): number =>
    sortBy.findIndex((d) => d.key === key);

  const handleHeaderClick = (
    col: DataTableColumn<T>,
    event: { shiftKey: boolean },
  ): void => {
    if (!col.sortable) return;
    const next = toggleSort(sortBy, col.key, { shiftKey: event.shiftKey });
    onSortByChange(next);
  };

  const renderHeaderIcon = (
    col: DataTableColumn<T>,
    descriptor: SortDescriptor | undefined,
    priority: number,
  ): ReactNode => {
    if (!col.sortable) return null;
    if (!descriptor) {
      return (
        <ChevronsUpDown
          aria-hidden="true"
          className="h-3 w-3 text-muted-foreground/60"
        />
      );
    }
    const Icon = descriptor.dir === 'desc' ? ArrowDown : ArrowUp;
    return (
      <span className="inline-flex items-center gap-1">
        <Icon aria-hidden="true" className="h-3 w-3 text-foreground" />
        {sortBy.length > 1 ? (
          <span
            aria-hidden="true"
            data-testid={`data-table-sort-priority-${col.key}`}
            className="rounded-sm border border-border bg-muted px-1 text-[10px] leading-none text-muted-foreground"
          >
            {priority + 1}
          </span>
        ) : null}
      </span>
    );
  };

  return (
    <table
      aria-label={ariaLabel}
      data-section="data-table"
      data-testid={testId}
      className={cn('w-full text-left text-sm', className)}
    >
      <thead className="text-muted-foreground">
        <tr>
          {columns.map((col) => {
            const idx = sortIndex(col.key);
            const descriptor = idx >= 0 ? sortBy[idx] : undefined;
            const ariaSort: 'ascending' | 'descending' | 'none' | undefined =
              col.sortable
                ? descriptor
                  ? descriptor.dir === 'desc'
                    ? 'descending'
                    : 'ascending'
                  : 'none'
                : undefined;
            return (
              <th
                key={col.key}
                scope="col"
                aria-sort={ariaSort}
                data-column-key={col.key}
                className={cn(
                  'py-1 pr-2 font-medium',
                  alignClass(col.align),
                  col.className,
                )}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={(event) =>
                      handleHeaderClick(col, { shiftKey: event.shiftKey })
                    }
                    data-testid={`data-table-sort-${col.key}`}
                    className="inline-flex items-center gap-1 rounded-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span>{col.label}</span>
                    {renderHeaderIcon(col, descriptor, idx)}
                  </button>
                ) : (
                  <span>{col.label}</span>
                )}
              </th>
            );
          })}
        </tr>
        {hasFilterRow ? (
          <tr data-section="data-table-filter-row">
            {columns.map((col) => (
              <th
                key={`filter-${col.key}`}
                scope="col"
                className={cn(
                  'pb-1 pr-2 font-normal',
                  alignClass(col.align),
                  col.className,
                )}
              >
                {col.filter ? (
                  <FilterInput
                    columnKey={col.key}
                    def={col.filter}
                    value={filters[col.key]}
                    onChange={(filter) => onFilterChange(col.key, filter)}
                  />
                ) : null}
              </th>
            ))}
          </tr>
        ) : null}
      </thead>
      <tbody className="divide-y divide-border">
        {sortedRows.length === 0 ? (
          <tr>
            <td
              colSpan={columns.length}
              className="px-3 py-6 text-center text-xs text-muted-foreground"
              data-section="data-table-empty"
            >
              {emptyMessage}
            </td>
          </tr>
        ) : (
          sortedRows.map((row, index) => (
            <tr
              key={rowKey ? rowKey(row, index) : index}
              data-row-index={index}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-3 py-1.5',
                    alignClass(col.align),
                    col.className,
                  )}
                >
                  {col.render ? col.render(row, index) : defaultCell(row, col.key)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

DataTable.displayName = 'DataTable';

// ---- Filter input ---------------------------------------------

interface FilterInputProps {
  columnKey: string;
  def: DataTableFilterDef;
  value: ColumnFilter | undefined;
  onChange: (next: ColumnFilter | null) => void;
}

function FilterInput({
  columnKey,
  def,
  value,
  onChange,
}: FilterInputProps): JSX.Element {
  const sharedClass =
    'w-full rounded border border-border bg-background px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary';

  switch (def.type) {
    case 'text': {
      const v = value?.type === 'text' ? value.value : '';
      return (
        <input
          type="text"
          value={v}
          placeholder={def.placeholder ?? 'Filter...'}
          data-testid={`data-table-filter-text-${columnKey}`}
          className={sharedClass}
          onChange={(e: ChangeEvent<HTMLInputElement>) => {
            const next = e.target.value;
            if (!next.trim()) onChange(null);
            else onChange({ type: 'text', value: next });
          }}
        />
      );
    }
    case 'select': {
      const current = value?.type === 'select' ? value.values : [];
      if (def.multi) {
        return (
          <select
            multiple
            value={[...current]}
            data-testid={`data-table-filter-select-${columnKey}`}
            className={sharedClass}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => {
              const next = Array.from(e.target.selectedOptions).map(
                (o) => o.value,
              );
              if (next.length === 0) onChange(null);
              else onChange({ type: 'select', values: next });
            }}
          >
            {(def.options ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {(opt.label as string) ?? opt.value}
              </option>
            ))}
          </select>
        );
      }
      const single = current[0] ?? '';
      return (
        <select
          value={single}
          data-testid={`data-table-filter-select-${columnKey}`}
          className={sharedClass}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            const next = e.target.value;
            if (!next) onChange(null);
            else onChange({ type: 'select', values: [next] });
          }}
        >
          <option value="">{def.placeholder ?? 'All'}</option>
          {(def.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {(opt.label as string) ?? opt.value}
            </option>
          ))}
        </select>
      );
    }
    case 'range': {
      const min = value?.type === 'range' ? value.min : undefined;
      const max = value?.type === 'range' ? value.max : undefined;
      const commit = (nextMin?: number, nextMax?: number): void => {
        if (nextMin == null && nextMax == null) onChange(null);
        else {
          const next: ColumnFilter = { type: 'range' };
          if (nextMin != null) next.min = nextMin;
          if (nextMax != null) next.max = nextMax;
          onChange(next);
        }
      };
      const numericOrUndefined = (s: string): number | undefined =>
        s.trim() === '' ? undefined : Number(s);
      return (
        <span className="inline-flex w-full items-center gap-1">
          <input
            type="number"
            value={min ?? ''}
            placeholder="min"
            step={def.step}
            min={def.min}
            max={def.max}
            data-testid={`data-table-filter-range-min-${columnKey}`}
            className={cn(sharedClass, 'w-1/2')}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              commit(numericOrUndefined(e.target.value), max);
            }}
          />
          <span aria-hidden="true" className="text-muted-foreground">
            -
          </span>
          <input
            type="number"
            value={max ?? ''}
            placeholder="max"
            step={def.step}
            min={def.min}
            max={def.max}
            data-testid={`data-table-filter-range-max-${columnKey}`}
            className={cn(sharedClass, 'w-1/2')}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              commit(min, numericOrUndefined(e.target.value));
            }}
          />
        </span>
      );
    }
    case 'date': {
      const from = value?.type === 'date' ? value.from : undefined;
      const to = value?.type === 'date' ? value.to : undefined;
      const commit = (nextFrom?: string, nextTo?: string): void => {
        if (!nextFrom && !nextTo) onChange(null);
        else {
          const next: ColumnFilter = { type: 'date' };
          if (nextFrom) next.from = nextFrom;
          if (nextTo) next.to = nextTo;
          onChange(next);
        }
      };
      return (
        <span className="inline-flex w-full items-center gap-1">
          <input
            type="date"
            value={from ?? ''}
            data-testid={`data-table-filter-date-from-${columnKey}`}
            className={cn(sharedClass, 'w-1/2')}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              commit(e.target.value || undefined, to);
            }}
          />
          <span aria-hidden="true" className="text-muted-foreground">
            -
          </span>
          <input
            type="date"
            value={to ?? ''}
            data-testid={`data-table-filter-date-to-${columnKey}`}
            className={cn(sharedClass, 'w-1/2')}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              commit(from, e.target.value || undefined);
            }}
          />
        </span>
      );
    }
    default:
      return <span aria-hidden="true" />;
  }
}
