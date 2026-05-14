import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type NavbarVariant = 'plain' | 'bordered' | 'elevated';

export interface NavbarProps
  extends Omit<HTMLAttributes<HTMLElement>, 'role' | 'children'> {
  brand?: ReactNode;
  center?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
  variant?: NavbarVariant;
  className?: string;
  innerClassName?: string;
}

const VARIANT_CLASSES: Record<NavbarVariant, string> = {
  plain: '',
  bordered: 'border-b border-border',
  elevated: 'shadow-sm',
};

const STICKY_CLASSES =
  'sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60';

export const Navbar = forwardRef<HTMLElement, NavbarProps>(
  (
    {
      brand,
      center,
      actions,
      sticky = false,
      variant = 'plain',
      className,
      innerClassName,
      ...rest
    },
    ref,
  ) => {
    return (
      <header
        ref={ref}
        role="banner"
        className={cn(
          'w-full',
          VARIANT_CLASSES[variant],
          sticky && STICKY_CLASSES,
          className,
        )}
        {...rest}
      >
        <nav
          role="navigation"
          aria-label="Primary"
          className={cn(
            'grid grid-cols-[auto_1fr_auto] items-center gap-2 px-4 py-3 md:px-6 md:py-4',
            innerClassName,
          )}
        >
          <div className="flex min-w-0 items-center gap-2">{brand}</div>
          <div className="flex min-w-0 flex-1 items-center justify-center">
            {center}
          </div>
          <div className="flex items-center justify-end gap-2">{actions}</div>
        </nav>
      </header>
    );
  },
);
Navbar.displayName = 'Navbar';
