import { Fragment, forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Tooltip } from './tooltip';

export interface BreadcrumbItem {
  id: string;
  label: ReactNode;
  href?: string;
}

export interface BreadcrumbsProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  maxItems?: number;
  ellipsisLabel?: string;
  className?: string;
}

interface CollapsedSlot {
  kind: 'ellipsis';
  collapsed: BreadcrumbItem[];
}

interface ItemSlot {
  kind: 'item';
  item: BreadcrumbItem;
  isLast: boolean;
}

type Slot = CollapsedSlot | ItemSlot;

function buildSlots(items: BreadcrumbItem[], maxItems?: number): Slot[] {
  if (!maxItems || items.length <= maxItems || maxItems < 2) {
    return items.map((item, idx) => ({
      kind: 'item',
      item,
      isLast: idx === items.length - 1,
    }));
  }
  const tailCount = Math.max(maxItems - 2, 0);
  const head = items[0];
  const tail = tailCount > 0 ? items.slice(items.length - tailCount) : [];
  const collapsed = items.slice(1, items.length - tail.length);
  const slots: Slot[] = [];
  slots.push({ kind: 'item', item: head, isLast: tail.length === 0 });
  slots.push({ kind: 'ellipsis', collapsed });
  tail.forEach((item, idx) => {
    slots.push({ kind: 'item', item, isLast: idx === tail.length - 1 });
  });
  return slots;
}

function ellipsisAriaLabel(label: string, collapsed: BreadcrumbItem[]): string {
  if (collapsed.length === 0) return label;
  const parts = collapsed
    .map((c) => (typeof c.label === 'string' ? c.label : ''))
    .filter(Boolean);
  if (parts.length === 0) return label;
  return `${label}: ${parts.join(', ')}`;
}

export const Breadcrumbs = forwardRef<HTMLElement, BreadcrumbsProps>(
  (
    {
      items,
      separator,
      maxItems,
      ellipsisLabel = 'Show collapsed breadcrumbs',
      className,
      ...rest
    },
    ref,
  ) => {
    const sep = separator !== undefined ? separator : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />;
    const slots = buildSlots(items, maxItems);
    return (
      <nav
        ref={ref}
        aria-label="breadcrumb"
        className={cn('text-xs text-muted-foreground', className)}
        {...rest}
      >
        <ol className="flex flex-wrap items-center gap-1">
          {slots.map((slot, idx) => {
            const showSeparator = idx > 0;
            if (slot.kind === 'ellipsis') {
              const collapsedLabels = slot.collapsed
                .map((c) => (typeof c.label === 'string' ? c.label : ''))
                .filter(Boolean);
              const tooltipLabel = collapsedLabels.length > 0
                ? collapsedLabels.join(' / ')
                : ellipsisLabel;
              return (
                <Fragment key={`ellipsis-${idx}`}>
                  {showSeparator ? (
                    <li aria-hidden="true" className="flex items-center text-muted-foreground/70">
                      {sep}
                    </li>
                  ) : null}
                  <li className="flex items-center">
                    <Tooltip label={tooltipLabel}>
                      <button
                        type="button"
                        aria-label={ellipsisAriaLabel(ellipsisLabel, slot.collapsed)}
                        className="rounded px-1 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        ...
                      </button>
                    </Tooltip>
                  </li>
                </Fragment>
              );
            }
            const { item, isLast } = slot;
            const isCurrent = isLast || !item.href;
            return (
              <Fragment key={item.id}>
                {showSeparator ? (
                  <li aria-hidden="true" className="flex items-center text-muted-foreground/70">
                    {sep}
                  </li>
                ) : null}
                <li className="flex items-center">
                  {isCurrent ? (
                    <span
                      aria-current="page"
                      className="text-foreground"
                    >
                      {item.label}
                    </span>
                  ) : (
                    <a
                      href={item.href}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {item.label}
                    </a>
                  )}
                </li>
              </Fragment>
            );
          })}
        </ol>
      </nav>
    );
  },
);

Breadcrumbs.displayName = 'Breadcrumbs';
