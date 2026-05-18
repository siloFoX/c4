import { forwardRef, useCallback, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import {
  VirtualizedList,
  type VirtualizedListHandle,
} from './virtualized-list';
import {
  applyFilters,
  applyMultiSort,
  toggleSort,
  type ColumnFilter,
  type Comparable,
  type SortDescriptor,
  type SortAccessor,
  type FilterAccessor,
} from '../../lib/data-table-state';

// (v1.11.393, TODO 11.375) VirtualTable -- composes
// `<VirtualizedList>` (11.333 / v1.11.351) with the
// sort + filter helpers from `lib/data-table-state.ts`
// (11.355 / v1.11.373) into one declarative primitive
// for 10k+ row tables. The dispatch explicitly names
// three features: header sticky, horizontal scroll
// sync between header and body, row selection.
//
// Architecture:
//
//   - The outer wrapper owns horizontal scroll
//     (`overflow-x: auto`). Header + body share the
//     same wrapper so they scroll in lockstep.
//   - The header is `position: sticky; top: 0` within
//     a fixed-height container so it stays pinned as
//     the body scrolls vertically.
//   - The body is a `<VirtualizedList>` -- only
//     `start..end` rows mount at any moment, with the
//     standard overscan window.
//   - Each row is a CSS grid laid out by the same
//     `gridTemplateColumns` string as the header, so
//     cells stay perfectly aligned even when the
//     wrapper scrolls horizontally.
//   - Selection is opt-in via `selectable=true`.
//     When on, a leading checkbox column appears in
//     both the header (select-all over the visible
//     rows) and each body row. Selection state is
//     owned by the host as a `Set<string>` keyed by
//     `rowKey(row)`.
//   - Sort + filter are pass-through to the existing
//     `applyMultiSort` / `applyFilters` helpers, so
//     adopters can wire URL state via the existing
//     `useUrlTableState` hook from
//     `lib/data-table-state.ts`.

export interface VirtualTableColumn<T> {
  key: string;
  label: ReactNode;
  // Explicit column width. Accepts any valid
  // CSS grid track size:
  //   - `'120px'` -- fixed pixel width
  //   - `'1fr'` -- flex share
  //   - `'minmax(100px, 1fr)'` -- minimum + flex
  // Defaults to `'1fr'` when omitted.
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (row: T, rowIndex: number) => ReactNode;
  accessor?: (row: T) => Comparable;
  filterAccessor?: (row: T) => Comparable;
  className?: string;
}

export interface VirtualTableProps<T> {
  columns: readonly VirtualTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string;

  // Row height in pixels for the virtualizer.
  // Default 36px (one line of text + padding).
  rowHeight?: number;
  // Body viewport height in pixels. Default 480.
  height?: number;
  overscan?: number;

  // Sort + filter (pass-through to
  // `lib/data-table-state`). When omitted the rows
  // render in input order without filtering.
  sortBy?: readonly SortDescriptor[];
  onSortByChange?: (next: readonly SortDescriptor[]) => void;
  filters?: Record<string, ColumnFilter>;

  // Selection.
  selectable?: boolean;
  // Selected row keys. Read-only Set so the host
  // can pass a fresh set every render without
  // mutating; the component never mutates this.
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (next: Set<string>) => void;

  // Header bar visibility. Default true.
  stickyHeader?: boolean;

  emptyContent?: ReactNode;
  ariaLabel?: string;
  className?: string;
  'data-testid'?: string;
}

export interface VirtualTableHandle {
  scrollToIndex: (index: number) => void;
  getScrollTop: () => number;
}

function alignClass(align?: VirtualTableColumn<unknown>['align']): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

// (v1.11.393, TODO 11.375) Build the column-template
// string. Adds a leading 36px column for the
// selection checkbox when `selectable=true`.
export function buildGridTemplate(
  columns: ReadonlyArray<{ width?: string }>,
  selectable: boolean,
): string {
  const tracks: string[] = [];
  if (selectable) tracks.push('36px');
  for (const c of columns) tracks.push(c.width ?? '1fr');
  return tracks.join(' ');
}

// (v1.11.393, TODO 11.375) Pure helper to derive the
// visible rows after applying filters + sort. Exported
// for unit tests so a regression in the order of
// operations does not hide inside React's effect
// lifecycle.
export function applyTableTransforms<T>(args: {
  rows: readonly T[];
  filters?: Record<string, ColumnFilter>;
  sortBy?: readonly SortDescriptor[];
  filterAccessor: FilterAccessor<T>;
  sortAccessor: SortAccessor<T>;
}): T[] {
  const { rows, filters, sortBy, filterAccessor, sortAccessor } = args;
  let out: T[] = [...rows];
  if (filters && Object.keys(filters).length > 0) {
    out = applyFilters(out, filters, filterAccessor);
  }
  if (sortBy && sortBy.length > 0) {
    out = applyMultiSort(out, sortBy, sortAccessor);
  }
  return out;
}

function defaultRowCell<T>(row: T, key: string): ReactNode {
  if (row == null || typeof row !== 'object') return null;
  const v = (row as Record<string, unknown>)[key];
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return null;
}

function defaultAccessor<T>(row: T, key: string): Comparable {
  if (row == null || typeof row !== 'object') return null;
  const v = (row as Record<string, unknown>)[key];
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return v;
  }
  return null;
}

function VirtualTableInner<T>(
  props: VirtualTableProps<T>,
  forwardedRef: React.Ref<VirtualTableHandle>,
): JSX.Element {
  const {
    columns,
    rows,
    rowKey,
    rowHeight = 36,
    height = 480,
    overscan,
    sortBy,
    onSortByChange,
    filters,
    selectable = false,
    selectedIds,
    onSelectionChange,
    stickyHeader = true,
    emptyContent,
    ariaLabel,
    className,
    ...rest
  } = props;

  const listRef = useRef<VirtualizedListHandle | null>(null);

  // (v1.11.393) Build column-keyed accessor maps so
  // the sort + filter helpers see the right value
  // per column.
  const sortAccessor: SortAccessor<T> = useCallback(
    (row, key) => {
      const col = columns.find((c) => c.key === key);
      if (col?.accessor) return col.accessor(row);
      return defaultAccessor(row, key);
    },
    [columns],
  );
  const filterAccessor: FilterAccessor<T> = useCallback(
    (row, key) => {
      const col = columns.find((c) => c.key === key);
      if (col?.filterAccessor) return col.filterAccessor(row);
      if (col?.accessor) return col.accessor(row);
      return defaultAccessor(row, key);
    },
    [columns],
  );

  const visibleRows = useMemo<T[]>(
    () =>
      applyTableTransforms<T>({
        rows,
        ...(filters !== undefined ? { filters } : {}),
        ...(sortBy !== undefined ? { sortBy } : {}),
        filterAccessor,
        sortAccessor,
      }),
    [rows, filters, sortBy, filterAccessor, sortAccessor],
  );

  const gridTemplate = useMemo(
    () => buildGridTemplate(columns, selectable),
    [columns, selectable],
  );

  // Forward a thin handle to the host. Tests + hosts
  // that want imperative scroll-to can use it.
  if (typeof forwardedRef === 'function') {
    forwardedRef({
      scrollToIndex: (idx) => listRef.current?.scrollToIndex(idx),
      getScrollTop: () => listRef.current?.getScrollTop() ?? 0,
    });
  } else if (forwardedRef && typeof forwardedRef === 'object') {
    (forwardedRef as React.MutableRefObject<VirtualTableHandle | null>).current = {
      scrollToIndex: (idx) => listRef.current?.scrollToIndex(idx),
      getScrollTop: () => listRef.current?.getScrollTop() ?? 0,
    };
  }

  // ----- selection helpers ---------------------------

  const visibleKeys = useMemo(
    () => visibleRows.map((r, i) => rowKey(r, i)),
    [visibleRows, rowKey],
  );

  // (v1.11.393) Select-all reflects the visible
  // (post-filter, post-sort) rows. Tri-state: when
  // every visible row is selected the box is
  // checked; when some are the box is indeterminate
  // (rendered via data-indeterminate); when none are
  // selected the box is unchecked.
  const selectedCount = useMemo(() => {
    if (!selectedIds) return 0;
    let n = 0;
    for (const key of visibleKeys) {
      if (selectedIds.has(key)) n += 1;
    }
    return n;
  }, [selectedIds, visibleKeys]);

  const allSelected =
    visibleKeys.length > 0 && selectedCount === visibleKeys.length;
  const someSelected = selectedCount > 0 && !allSelected;

  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds ?? []);
    if (allSelected) {
      for (const key of visibleKeys) next.delete(key);
    } else {
      for (const key of visibleKeys) next.add(key);
    }
    onSelectionChange(next);
  }, [allSelected, onSelectionChange, selectedIds, visibleKeys]);

  const handleToggleRow = useCallback(
    (key: string) => {
      if (!onSelectionChange) return;
      const next = new Set(selectedIds ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onSelectionChange(next);
    },
    [onSelectionChange, selectedIds],
  );

  // ----- header ------------------------------------

  const handleHeaderClick = useCallback(
    (col: VirtualTableColumn<T>, e: React.MouseEvent<HTMLButtonElement>) => {
      if (!col.sortable || !onSortByChange) return;
      onSortByChange(
        toggleSort(sortBy ?? [], col.key, { shiftKey: e.shiftKey }),
      );
    },
    [onSortByChange, sortBy],
  );

  const sortDirFor = (key: string): 'asc' | 'desc' | null => {
    if (!sortBy) return null;
    const entry = sortBy.find((s) => s.key === key);
    return entry ? entry.dir : null;
  };
  const sortPriorityFor = (key: string): number | null => {
    if (!sortBy) return null;
    const idx = sortBy.findIndex((s) => s.key === key);
    return idx >= 0 ? idx + 1 : null;
  };

  const headerEl = (
    <div
      role="row"
      data-section="virtual-table-header"
      className={cn(
        'grid border-b border-border bg-card text-xs font-semibold text-muted-foreground',
        stickyHeader && 'sticky top-0 z-10',
      )}
      style={{ gridTemplateColumns: gridTemplate }}
    >
      {selectable ? (
        <div
          role="columnheader"
          data-section="virtual-table-header-cell"
          data-column="__select__"
          className="flex items-center justify-center border-r border-border px-2 py-2"
        >
          <input
            type="checkbox"
            aria-label="Select all rows"
            data-section="virtual-table-select-all"
            data-indeterminate={someSelected ? 'true' : 'false'}
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={handleSelectAll}
            disabled={!onSelectionChange || visibleKeys.length === 0}
            className="h-3.5 w-3.5"
          />
        </div>
      ) : null}
      {columns.map((col) => {
        const dir = sortDirFor(col.key);
        const priority = sortPriorityFor(col.key);
        const interactive = !!(col.sortable && onSortByChange);
        return (
          <div
            key={col.key}
            role="columnheader"
            data-section="virtual-table-header-cell"
            data-column={col.key}
            aria-sort={
              dir == null
                ? undefined
                : dir === 'asc'
                  ? 'ascending'
                  : 'descending'
            }
            className={cn(
              'flex items-center gap-1 border-r border-border px-3 py-2 last:border-r-0',
              alignClass(col.align),
              col.className,
            )}
          >
            {interactive ? (
              <button
                type="button"
                data-section="virtual-table-header-sort"
                data-column={col.key}
                data-sort-direction={dir ?? 'none'}
                onClick={(e) => handleHeaderClick(col, e)}
                className="inline-flex items-center gap-1 truncate text-left hover:text-foreground"
              >
                <span className="truncate">{col.label}</span>
                <span
                  aria-hidden="true"
                  data-section="virtual-table-sort-indicator"
                  className="text-[10px]"
                >
                  {dir == null ? '↕' : dir === 'asc' ? '↑' : '↓'}
                </span>
                {priority != null && (sortBy?.length ?? 0) > 1 ? (
                  <span
                    aria-hidden="true"
                    data-section="virtual-table-sort-priority"
                    className="rounded-full bg-muted px-1.5 text-[9px] font-semibold text-foreground"
                  >
                    {priority}
                  </span>
                ) : null}
              </button>
            ) : (
              <span className="truncate">{col.label}</span>
            )}
          </div>
        );
      })}
    </div>
  );

  // ----- body --------------------------------------

  const renderRow = useCallback(
    (row: T, index: number): ReactNode => {
      const key = rowKey(row, index);
      const isSelected = selectedIds?.has(key) ?? false;
      return (
        <div
          role="row"
          data-section="virtual-table-row"
          data-row-key={key}
          data-row-selected={isSelected ? 'true' : 'false'}
          aria-selected={selectable ? isSelected : undefined}
          className={cn(
            'grid border-b border-border text-sm',
            'hover:bg-accent/30',
            isSelected && 'bg-accent/20',
          )}
          style={{
            gridTemplateColumns: gridTemplate,
            height: `${rowHeight}px`,
          }}
        >
          {selectable ? (
            <div
              role="cell"
              data-section="virtual-table-cell"
              data-column="__select__"
              className="flex items-center justify-center border-r border-border px-2"
            >
              <input
                type="checkbox"
                aria-label={`Select row ${key}`}
                data-section="virtual-table-row-select"
                data-row-key={key}
                checked={isSelected}
                onChange={() => handleToggleRow(key)}
                disabled={!onSelectionChange}
                className="h-3.5 w-3.5"
              />
            </div>
          ) : null}
          {columns.map((col) => (
            <div
              key={col.key}
              role="cell"
              data-section="virtual-table-cell"
              data-column={col.key}
              className={cn(
                'flex items-center truncate border-r border-border px-3 last:border-r-0',
                alignClass(col.align),
                col.className,
              )}
            >
              {col.render
                ? col.render(row, index)
                : defaultRowCell(row, col.key)}
            </div>
          ))}
        </div>
      );
    },
    [
      columns,
      gridTemplate,
      handleToggleRow,
      onSelectionChange,
      rowHeight,
      rowKey,
      selectable,
      selectedIds,
    ],
  );

  return (
    <div
      role="table"
      aria-label={ariaLabel ?? 'Table'}
      data-section="virtual-table"
      data-row-count={visibleRows.length}
      className={cn(
        'relative w-full overflow-x-auto rounded-md border border-border',
        className,
      )}
      {...rest}
    >
      {headerEl}
      <VirtualizedList<T>
        ref={listRef}
        items={visibleRows}
        rowHeight={rowHeight}
        renderRow={renderRow}
        keyFor={rowKey}
        emptyContent={emptyContent}
        {...(ariaLabel !== undefined ? { ariaLabel } : {})}
        {...(overscan !== undefined ? { overscan } : {})}
        style={{ height: `${height}px` }}
      />
    </div>
  );
}

// (v1.11.393) forwardRef cannot accept a generic, so the
// generic is re-applied at the cast step (mirrors the
// pattern used by `<VirtualizedList>`).
export const VirtualTable = forwardRef(VirtualTableInner) as <T>(
  props: VirtualTableProps<T> & { ref?: React.Ref<VirtualTableHandle> },
) => JSX.Element;

(VirtualTable as unknown as { displayName: string }).displayName = 'VirtualTable';
