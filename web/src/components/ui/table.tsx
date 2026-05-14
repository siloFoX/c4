import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type TableSortDir = 'asc' | 'desc';

export interface TableColumn<T = unknown> {
  key: string;
  label: ReactNode;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  render?: (row: T, rowIndex: number) => ReactNode;
}

export interface TableProps<T = unknown> {
  columns: TableColumn<T>[];
  rows: T[];
  sortKey?: string;
  sortDir?: TableSortDir;
  onSortChange?: (key: string, dir: TableSortDir) => void;
  striped?: boolean;
  stickyHeader?: boolean;
  ariaLabel?: string;
  className?: string;
  rowKey?: (row: T, index: number) => string | number;
  emptyMessage?: ReactNode;
}

function alignClass(align?: 'left' | 'center' | 'right') {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

export function Table<T>({
  columns,
  rows,
  sortKey,
  sortDir,
  onSortChange,
  striped,
  stickyHeader,
  ariaLabel,
  className,
  rowKey,
  emptyMessage,
}: TableProps<T>) {
  const handleSort = (col: TableColumn<T>) => {
    if (!col.sortable || !onSortChange) return;
    const nextDir: TableSortDir =
      sortKey === col.key && sortDir === 'asc' ? 'desc' : 'asc';
    onSortChange(col.key, nextDir);
  };

  return (
    <table
      aria-label={ariaLabel}
      className={cn('w-full text-left text-sm', className)}
    >
      <thead
        className={cn(
          'text-muted-foreground',
          stickyHeader && 'sticky top-0 z-10 bg-background',
        )}
      >
        <tr>
          {columns.map((col) => {
            const isActive = sortKey === col.key;
            const ariaSort: 'ascending' | 'descending' | 'none' | undefined =
              col.sortable
                ? isActive
                  ? sortDir === 'desc'
                    ? 'descending'
                    : 'ascending'
                  : 'none'
                : undefined;
            return (
              <th
                key={col.key}
                scope="col"
                aria-sort={ariaSort}
                className={cn(
                  'py-1 pr-2 font-medium',
                  alignClass(col.align),
                  col.className,
                )}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={() => handleSort(col)}
                    className={cn(
                      'inline-flex items-center gap-1 font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-sm',
                    )}
                  >
                    <span>{col.label}</span>
                    {isActive && (
                      <span aria-hidden="true" className="text-xs">
                        {sortDir === 'desc' ? '↓' : '↑'}
                      </span>
                    )}
                  </button>
                ) : (
                  col.label
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && emptyMessage ? (
          <tr>
            <td
              colSpan={columns.length}
              className="py-2 text-center text-muted-foreground"
            >
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row, rowIndex) => {
            const isOdd = rowIndex % 2 === 1;
            const key = rowKey ? rowKey(row, rowIndex) : rowIndex;
            return (
              <tr
                key={key}
                className={cn(
                  'border-t border-border/60 text-foreground',
                  striped && isOdd && 'bg-muted/40',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn('py-1 pr-2', alignClass(col.align))}
                  >
                    {col.render
                      ? col.render(row, rowIndex)
                      : ((row as Record<string, unknown>)[col.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

Table.displayName = 'Table';
