import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface PanelProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
  title?: string;
  action?: ReactNode;
}

export const Panel = forwardRef<HTMLDivElement, PanelProps>(
  ({ className, icon, title, action, children, ...props }, ref) => {
    const hasHeader = Boolean(icon || title || action);
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg border border-border bg-muted/40 p-4',
          className
        )}
        {...props}
      >
        {hasHeader ? (
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
        ) : null}
        {children}
      </div>
    );
  }
);
Panel.displayName = 'Panel';
