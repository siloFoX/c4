import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, Button, buttonVariants } from '../ui';
import { cn } from '../../lib/cn';

export interface ErrorPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  error?: Error | unknown;
  resetError?: () => void;
  homeHref?: string;
  title?: string;
  description?: string;
}

function getErrorMessage(error: Error | unknown): string | null {
  if (!error) return null;
  if (error instanceof Error) return error.message || null;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const candidate = (error as { message?: unknown }).message;
    if (typeof candidate === 'string') return candidate;
  }
  return null;
}

export const ErrorPage = forwardRef<HTMLDivElement, ErrorPageProps>(
  (
    {
      error,
      resetError,
      homeHref,
      title = 'Something went wrong',
      description = 'An unexpected error occurred. Try again, or head back home.',
      className,
      ...rest
    },
    ref,
  ) => {
    const message = getErrorMessage(error);
    const href = homeHref || '/';
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(
          'flex min-h-full w-full flex-1 items-center justify-center p-6',
          className,
        )}
        {...rest}
      >
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <div className="text-destructive" aria-hidden="true">
            <AlertCircle className="h-10 w-10" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          {message ? (
            <Alert variant="error" className="w-full text-left" role="alert">
              {message}
            </Alert>
          ) : null}
          <div className="mt-2 flex w-full flex-wrap justify-center gap-2">
            {resetError ? (
              <Button type="button" variant="default" onClick={resetError}>
                Try again
              </Button>
            ) : null}
            <a href={href} className={cn(buttonVariants({ variant: resetError ? 'outline' : 'default' }))}>
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  },
);
ErrorPage.displayName = 'ErrorPage';
