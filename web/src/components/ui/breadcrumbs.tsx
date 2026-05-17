import { Fragment, forwardRef } from 'react';
import type { HTMLAttributes, MouseEvent, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Tooltip } from './tooltip';

export interface BreadcrumbItem {
  id: string;
  label: ReactNode;
  href?: string;
  // (v1.11.301, TODO 11.283) SPA navigation hook -- if onClick
  // is set, the item renders as a <button> instead of an
  // <a>, calls onClick on activation, and skips the
  // browser-default href navigation. Use this for in-app
  // routing where href is a synthetic placeholder.
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}

export interface BreadcrumbsProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  maxItems?: number;
  ellipsisLabel?: string;
  // (v1.11.301, TODO 11.283) Truncate-middle threshold. When a
  // string label exceeds this many characters, the breadcrumb
  // renders `<head>...<tail>` so the start AND end of the path
  // segment stay visible. Set to 0 / undefined to skip.
  maxLabelLength?: number;
  className?: string;
}

// (v1.11.301, TODO 11.283) Truncate the middle of a label so
// `the-very-long-feature-branch` reads as `the-very...e-branch`
// at small viewports while still hinting at both ends.
export function truncateMiddle(input: string, maxLength: number): string {
  if (maxLength <= 0) return input;
  if (input.length <= maxLength) return input;
  const ellipsis = '...';
  const room = maxLength - ellipsis.length;
  if (room <= 0) return ellipsis;
  const head = Math.ceil(room / 2);
  const tail = Math.floor(room / 2);
  return `${input.slice(0, head)}${ellipsis}${input.slice(input.length - tail)}`;
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
  const head = items[0]!;
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
      maxLabelLength,
      className,
      ...rest
    },
    ref,
  ) => {
    const sep = separator !== undefined ? separator : <ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />;
    const slots = buildSlots(items, maxItems);
    // (v1.11.301, TODO 11.283) When `maxLabelLength` is set,
    // wrap the visible label in a span carrying both the
    // truncated text and a `title` with the full label so a
    // hover surfaces what got clipped.
    const renderLabel = (label: ReactNode): ReactNode => {
      if (typeof label !== 'string') return label;
      if (!maxLabelLength || maxLabelLength <= 0) return label;
      if (label.length <= maxLabelLength) return label;
      return (
        <span title={label} data-section="breadcrumb-truncated">
          {truncateMiddle(label, maxLabelLength)}
        </span>
      );
    };
    return (
      <nav
        ref={ref}
        aria-label="breadcrumb"
        data-section="breadcrumbs"
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
                    <li
                      aria-hidden="true"
                      data-section="breadcrumb-separator"
                      className="flex items-center text-muted-foreground/70"
                    >
                      {sep}
                    </li>
                  ) : null}
                  <li
                    data-section="breadcrumb-ellipsis"
                    className="flex items-center"
                  >
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
            const isCurrent = isLast || (!item.href && !item.onClick);
            const visibleLabel = renderLabel(item.label);
            return (
              <Fragment key={item.id}>
                {showSeparator ? (
                  <li
                    aria-hidden="true"
                    data-section="breadcrumb-separator"
                    className="flex items-center text-muted-foreground/70"
                  >
                    {sep}
                  </li>
                ) : null}
                <li
                  data-section="breadcrumb-item"
                  data-breadcrumb-current={isCurrent ? 'true' : 'false'}
                  className="flex items-center"
                >
                  {isCurrent ? (
                    <span
                      aria-current="page"
                      className="text-foreground"
                    >
                      {visibleLabel}
                    </span>
                  ) : item.onClick ? (
                    <button
                      type="button"
                      onClick={item.onClick}
                      className="rounded text-muted-foreground hover:text-foreground hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      {visibleLabel}
                    </button>
                  ) : (
                    <a
                      href={item.href}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {visibleLabel}
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
