import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface PanelBreadcrumb {
  label: string;
  href?: string;
}

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title?: string;
  action?: ReactNode;
  description?: string;
  breadcrumbs?: Array<PanelBreadcrumb>;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  (
    { className, icon, title, action, description, breadcrumbs, children, ...props },
    ref,
  ) => {
    const hasOldHeader = Boolean(icon || title || action);
    const hasBreadcrumbs = Array.isArray(breadcrumbs) && breadcrumbs.length > 0;
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
                <nav
                  aria-label="Breadcrumb"
                  className="flex flex-wrap items-center text-xs text-muted-foreground"
                >
                  {breadcrumbs!.map((crumb, idx) => (
                    <span key={idx} className="flex items-center">
                      {idx > 0 ? (
                        <span className="mx-1 text-muted-foreground" aria-hidden="true">
                          /
                        </span>
                      ) : null}
                      {crumb.href ? (
                        <a href={crumb.href} className="hover:underline">
                          {crumb.label}
                        </a>
                      ) : (
                        <span>{crumb.label}</span>
                      )}
                    </span>
                  ))}
                </nav>
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
