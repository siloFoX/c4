import { isValidElement } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from './button';
import { cn } from '../../lib/cn';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode;
  title: string;
  description?: string | ReactNode;
  action?: EmptyStateAction | ReactNode;
  className?: string;
}

function isEmptyStateAction(value: unknown): value is EmptyStateAction {
  if (!value || typeof value !== 'object' || isValidElement(value)) return false;
  const candidate = value as { label?: unknown; onClick?: unknown };
  return typeof candidate.label === 'string' && typeof candidate.onClick === 'function';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-md border border-border bg-card p-6 text-center',
        className,
      )}
      {...rest}
    >
      {icon ? (
        <div className="text-muted-foreground" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        {description ? (
          <span className="text-sm text-muted-foreground">{description}</span>
        ) : null}
      </div>
      {action ? (
        isEmptyStateAction(action) ? (
          <Button type="button" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        ) : (
          action
        )
      ) : null}
    </div>
  );
}
