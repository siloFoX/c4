// (11.190) ExportButton: a small composite primitive that wraps a
// Button with a Download icon and either fires a single export or
// opens a DropdownMenu when multiple formats are offered.

import { forwardRef, useMemo } from 'react';
import { Download } from 'lucide-react';
import { Button } from './button';
import type { ButtonProps } from './button';
import { DropdownMenu } from './dropdown-menu';
import type { DropdownMenuItem } from './dropdown-menu';
import { cn } from '../../lib/cn';
import { exportData } from '../../lib/export';
import type { ColumnDef } from '../../lib/export';

export type ExportFormat = 'csv' | 'json';

export interface ExportButtonProps
  extends Omit<ButtonProps, 'onClick' | 'children'> {
  rows: unknown[];
  columns?: ColumnDef<unknown>[];
  filename: string;
  formats?: ExportFormat[];
  className?: string;
  label?: string;
}

export const ExportButton = forwardRef<HTMLButtonElement, ExportButtonProps>(
  (
    {
      rows,
      columns,
      filename,
      formats = ['csv', 'json'],
      className,
      disabled,
      label = 'Export',
      variant = 'outline',
      size = 'sm',
      ...rest
    },
    ref,
  ) => {
    const doExport = (format: ExportFormat) =>
      exportData({ rows, columns, format, filename });

    const items = useMemo<DropdownMenuItem[]>(
      () =>
        formats.map((f) => ({
          key: f,
          label: f.toUpperCase(),
          onSelect: () => doExport(f),
        })),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [formats.join('|'), rows, columns, filename],
    );

    const trigger = (
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size={size}
        disabled={disabled}
        className={cn('gap-2', className)}
        onClick={
          formats.length === 1
            ? () => doExport(formats[0] as ExportFormat)
            : undefined
        }
        {...rest}
      >
        <Download aria-hidden="true" className="h-3.5 w-3.5" />
        <span>{label}</span>
      </Button>
    );

    if (formats.length <= 1) {
      return trigger;
    }
    return (
      <DropdownMenu
        trigger={trigger}
        items={items}
        ariaLabel="Export format"
        placement="bottom"
      />
    );
  },
);
ExportButton.displayName = 'ExportButton';
