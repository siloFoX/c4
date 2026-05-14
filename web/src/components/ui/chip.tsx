import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';

export const chipVariants = cva(
  'inline-flex items-center gap-1 rounded-full border font-medium transition-colors',
  {
    variants: {
      size: {
        sm: 'px-2 py-0.5 text-[11px]',
        md: 'px-2.5 py-1 text-xs',
      },
      variant: {
        subtle: 'border-transparent',
        solid: 'border-transparent',
        outline: 'bg-transparent',
      },
      tone: {
        neutral: '',
        primary: '',
        success: '',
        warning: '',
        danger: '',
      },
    },
    compoundVariants: [
      { variant: 'subtle', tone: 'neutral', className: 'bg-muted text-muted-foreground' },
      { variant: 'subtle', tone: 'primary', className: 'bg-primary/15 text-primary' },
      { variant: 'subtle', tone: 'success', className: 'bg-success/15 text-success' },
      { variant: 'subtle', tone: 'warning', className: 'bg-warning/15 text-warning' },
      { variant: 'subtle', tone: 'danger', className: 'bg-destructive/15 text-destructive' },
      { variant: 'solid', tone: 'neutral', className: 'bg-secondary text-secondary-foreground' },
      { variant: 'solid', tone: 'primary', className: 'bg-primary text-primary-foreground' },
      { variant: 'solid', tone: 'success', className: 'bg-success text-success-foreground' },
      { variant: 'solid', tone: 'warning', className: 'bg-warning text-warning-foreground' },
      { variant: 'solid', tone: 'danger', className: 'bg-destructive text-destructive-foreground' },
      { variant: 'outline', tone: 'neutral', className: 'border-border text-foreground' },
      { variant: 'outline', tone: 'primary', className: 'border-primary/40 text-primary' },
      { variant: 'outline', tone: 'success', className: 'border-success/40 text-success' },
      { variant: 'outline', tone: 'warning', className: 'border-warning/40 text-warning' },
      { variant: 'outline', tone: 'danger', className: 'border-destructive/40 text-destructive' },
    ],
    defaultVariants: {
      size: 'sm',
      variant: 'subtle',
      tone: 'neutral',
    },
  }
);

export interface ChipProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>,
    VariantProps<typeof chipVariants> {
  children?: ReactNode;
  icon?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

export type ChipTone = NonNullable<ChipProps['tone']>;
export type ChipVariant = NonNullable<ChipProps['variant']>;

export const Chip = forwardRef<HTMLSpanElement, ChipProps>(
  (
    { className, size, variant, tone, icon, onDismiss, dismissLabel = 'Remove', children, ...props },
    ref,
  ) => {
    return (
      <span
        ref={ref}
        className={cn(chipVariants({ size, variant, tone }), className)}
        {...props}
      >
        {icon != null ? (
          <span className="inline-flex shrink-0 items-center" aria-hidden>
            {icon}
          </span>
        ) : null}
        {children}
        {onDismiss ? (
          <button
            type="button"
            aria-label={dismissLabel}
            onClick={onDismiss}
            className="-mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-current/70 hover:bg-current/10 hover:text-current focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
          >
            <svg
              viewBox="0 0 12 12"
              className="h-2.5 w-2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M2.5 2.5 L9.5 9.5" />
              <path d="M9.5 2.5 L2.5 9.5" />
            </svg>
          </button>
        ) : null}
      </span>
    );
  },
);
Chip.displayName = 'Chip';
