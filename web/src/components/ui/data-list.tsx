import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Tooltip } from './tooltip';

export interface DataListItem {
  id: string;
  label: ReactNode;
  value: ReactNode;
  copyValue?: string;
  truncate?: boolean;
}

export type DataListOrientation = 'horizontal' | 'vertical';

export interface DataListProps extends Omit<HTMLAttributes<HTMLDListElement>, 'children'> {
  items: DataListItem[];
  orientation?: DataListOrientation;
  className?: string;
}

const ORIENTATION_CLS: Record<DataListOrientation, string> = {
  horizontal: 'flex flex-col gap-1',
  vertical: 'flex flex-col gap-2',
};

export const DataList = forwardRef<HTMLDListElement, DataListProps>(
  ({ items, orientation = 'horizontal', className, ...rest }, ref) => {
    return (
      <dl
        ref={ref}
        data-orientation={orientation}
        className={cn(ORIENTATION_CLS[orientation], className)}
        {...rest}
      >
        {items.map((item) => (
          <DataListRow key={item.id} item={item} orientation={orientation} />
        ))}
      </dl>
    );
  },
);
DataList.displayName = 'DataList';

interface RowProps {
  item: DataListItem;
  orientation: DataListOrientation;
}

function DataListRow({ item, orientation }: RowProps) {
  const { label, value, copyValue, truncate } = item;
  const horizontal = orientation === 'horizontal';
  const titleAttr =
    truncate && typeof value === 'string' ? value : undefined;

  const valueNode = (
    <span className={cn('min-w-0 flex-1', truncate ? 'block truncate' : '')} title={titleAttr}>
      {value}
    </span>
  );

  const wrappedValue =
    truncate && typeof value === 'string' ? (
      <Tooltip label={value}>{valueNode}</Tooltip>
    ) : (
      valueNode
    );

  if (horizontal) {
    return (
      <div className="flex items-baseline gap-3 py-0.5">
        <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="flex min-w-0 flex-1 items-center gap-2 text-sm text-foreground">
          {wrappedValue}
          {copyValue !== undefined ? (
            <CopyChip copyValue={copyValue} label={label} />
          ) : null}
        </dd>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="flex min-w-0 items-center gap-2 text-sm text-foreground">
        {wrappedValue}
        {copyValue !== undefined ? (
          <CopyChip copyValue={copyValue} label={label} />
        ) : null}
      </dd>
    </div>
  );
}

interface CopyChipProps {
  copyValue: string;
  label: ReactNode;
}

function CopyChip({ copyValue, label }: CopyChipProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    void navigator.clipboard?.writeText(copyValue);
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  }, [copyValue]);

  const ariaLabel =
    typeof label === 'string' ? `Copy ${label}` : 'Copy value';

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={ariaLabel}
      data-copied={copied || undefined}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
    >
      {copied ? (
        <Check className="h-3 w-3 text-success" aria-hidden="true" />
      ) : (
        <Copy className="h-3 w-3" aria-hidden="true" />
      )}
    </button>
  );
}
