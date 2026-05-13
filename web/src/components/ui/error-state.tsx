import { AlertTriangle } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface ErrorStateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: string;
  description?: string | ReactNode;
  error?: Error | string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

function errorText(error: Error | string | undefined): string | null {
  if (error === undefined) return null;
  if (typeof error === 'string') return error;
  return error.message || String(error);
}

export function ErrorState({
  title,
  description,
  error,
  onRetry,
  retryLabel = 'Retry',
  className,
  ...rest
}: ErrorStateProps) {
  const message = errorText(error);
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center gap-3 rounded-md border border-border bg-card p-6 text-center',
        className,
      )}
      {...rest}
    >
      <AlertTriangle aria-hidden="true" className="h-6 w-6 text-destructive" />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold text-destructive">{title}</span>
        {description ? (
          <span className="text-sm text-muted-foreground">{description}</span>
        ) : null}
        {message ? (
          <span className="break-words font-mono text-xs text-muted-foreground">
            {message}
          </span>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex h-8 items-center justify-center rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
