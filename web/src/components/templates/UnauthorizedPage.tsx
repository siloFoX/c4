import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { Lock } from 'lucide-react';
import { buttonVariants } from '../ui';
import { cn } from '../../lib/cn';

export interface UnauthorizedPageProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  signInHref?: string;
  homeHref?: string;
  title?: string;
  description?: string;
}

export const UnauthorizedPage = forwardRef<HTMLDivElement, UnauthorizedPageProps>(
  (
    {
      signInHref,
      homeHref,
      title = 'Unauthorized',
      description = 'You do not have permission to view this page.',
      className,
      ...rest
    },
    ref,
  ) => {
    const signIn = signInHref || '/login';
    const home = homeHref || '/';
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
          <div className="text-warning" aria-hidden="true">
            <Lock className="h-10 w-10" />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="mt-2 flex w-full flex-wrap justify-center gap-2">
            <a href={signIn} className={cn(buttonVariants({ variant: 'default' }))}>
              Sign in
            </a>
            <a href={home} className={cn(buttonVariants({ variant: 'outline' }))}>
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  },
);
UnauthorizedPage.displayName = 'UnauthorizedPage';
