import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { FileQuestion } from 'lucide-react';
import { buttonVariants } from '../ui';
import { cn } from '../../lib/cn';

export interface NotFoundPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  homeHref?: string;
  title?: string;
  description?: string;
}

export const NotFoundPage = forwardRef<HTMLDivElement, NotFoundPageProps>(
  (
    {
      homeHref,
      title = 'Page not found',
      description = 'The page you are looking for has moved or no longer exists.',
      className,
      ...rest
    },
    ref,
  ) => {
    const href = homeHref || '/';
    return (
      <div
        ref={ref}
        className={cn(
          'flex min-h-full w-full flex-1 items-center justify-center p-6',
          className,
        )}
        {...rest}
      >
        <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-lg border border-border bg-card p-8 text-center shadow-sm">
          <div className="text-muted-foreground" aria-hidden="true">
            <FileQuestion className="h-10 w-10" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <a href={href} className={cn(buttonVariants({ variant: 'default' }), 'mt-2')}>
            Go home
          </a>
        </div>
      </div>
    );
  },
);
NotFoundPage.displayName = 'NotFoundPage';
