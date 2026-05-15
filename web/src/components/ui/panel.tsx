import { forwardRef, isValidElement } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Breadcrumbs } from './breadcrumbs';
import type { BreadcrumbItem } from './breadcrumbs';

export interface PanelBreadcrumb {
  label: string;
  href?: string;
}

export type PanelBreadcrumbsProp =
  | Array<PanelBreadcrumb | BreadcrumbItem>
  | ReactNode;

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  icon?: ReactNode;
  // (v1.11.264, TODO 11.246) Relaxed from `string` to `ReactNode`
  // so consumers can append inline glyphs (HelpTip, status chips)
  // next to the title without losing the Panel's built-in
  // header layout. String values keep working byte-identically.
  title?: ReactNode;
  action?: ReactNode;
  description?: string;
  breadcrumbs?: PanelBreadcrumbsProp;
  children?: ReactNode;
}

function isBreadcrumbArray(
  value: unknown,
): value is Array<PanelBreadcrumb | BreadcrumbItem> {
  if (!Array.isArray(value)) return false;
  return value.every(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      'label' in (entry as Record<string, unknown>),
  );
}

function normalizeItems(
  items: Array<PanelBreadcrumb | BreadcrumbItem>,
): BreadcrumbItem[] {
  return items.map((entry, idx) => {
    const id =
      'id' in entry && typeof entry.id === 'string' && entry.id.length > 0
        ? entry.id
        : `crumb-${idx}`;
    return { id, label: entry.label, href: entry.href };
  });
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  (
    { className, icon, title, action, description, breadcrumbs, children, ...props },
    ref,
  ) => {
    const hasOldHeader = Boolean(icon || title || action);
    const isItemArray = isBreadcrumbArray(breadcrumbs);
    const breadcrumbItems = isItemArray
      ? normalizeItems(breadcrumbs as Array<PanelBreadcrumb | BreadcrumbItem>)
      : null;
    const customBreadcrumbsNode =
      !isItemArray && breadcrumbs !== undefined && breadcrumbs !== null
        ? (breadcrumbs as ReactNode)
        : null;
    const hasBreadcrumbs =
      (breadcrumbItems !== null && breadcrumbItems.length > 0) ||
      isValidElement(customBreadcrumbsNode) ||
      (customBreadcrumbsNode !== null &&
        customBreadcrumbsNode !== false &&
        customBreadcrumbsNode !== undefined);
    const hasDescription = Boolean(description);
    const hasNewSlots = hasBreadcrumbs || hasDescription;
    const hasHeader = hasOldHeader || hasNewSlots;
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-border bg-muted/40 p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200',
          className,
        )}
        {...props}
      >
        {hasHeader ? (
          hasNewSlots ? (
            <div className="mb-3 flex flex-col gap-1">
              {hasBreadcrumbs ? (
                breadcrumbItems ? (
                  <Breadcrumbs items={breadcrumbItems} />
                ) : (
                  customBreadcrumbsNode
                )
              ) : null}
              {hasOldHeader ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {icon ? (
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                        {icon}
                      </span>
                    ) : null}
                    {title ? (
                      <h3 className="truncate text-sm font-semibold text-foreground">
                        {title}
                      </h3>
                    ) : null}
                  </div>
                  {action ? <div className="shrink-0">{action}</div> : null}
                </div>
              ) : null}
              {hasDescription ? (
                <p className="text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
          ) : (
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                {icon ? (
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
                    {icon}
                  </span>
                ) : null}
                {title ? (
                  <h3 className="truncate text-sm font-semibold text-foreground">
                    {title}
                  </h3>
                ) : null}
              </div>
              {action ? <div className="shrink-0">{action}</div> : null}
            </div>
          )
        ) : null}
        {children}
      </div>
    );
  },
);
Panel.displayName = 'Panel';
