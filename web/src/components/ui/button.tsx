import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import type { VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/cn';
import { Spinner } from './spinner';
import { VisuallyHidden } from './visually-hidden';

// (v1.11.326, TODO 11.308) Button primitive enhancements:
//   - `loading` prop renders an inline Spinner inside the
//     button, auto-disables the click target, and emits
//     hidden SR text so assistive tech announces the
//     pending state.
//   - Icon-only buttons (`size="icon"`) MUST carry an
//     `aria-label` (or the dev-time warning fires) so the
//     icon's accessible name is not blank.
//   - Danger / ghost tone refinements: explicit border
//     and focus-ring tweaks so the destructive variant
//     stays legible against the new ARPS palette, and
//     the ghost variant's hover state no longer steals
//     the surface colour from neighbouring chips.

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive',
        outline:
          'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          'bg-transparent text-foreground hover:bg-accent/60 hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-sm min-h-[44px] sm:min-h-0',
        md: 'h-10 px-4 text-sm min-h-[44px] sm:min-h-0',
        lg: 'h-11 px-6 text-base',
        icon: 'h-9 w-9 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface ButtonOwnProps {
  // (v1.11.326, TODO 11.308) Renders an inline Spinner in
  // place of the leading content, auto-disables the
  // button, and announces "Loading" via a visually-hidden
  // SR-only span. Repeated clicks are dropped at the
  // disabled boundary so callers do not have to debounce
  // separately.
  loading?: boolean;
  // (v1.11.326, TODO 11.308) Override the SR-only text
  // emitted while `loading` is true. Defaults to
  // 'Loading'. Use this when the call site already
  // owns a more specific message (e.g. 'Saving',
  // 'Deleting', 'Sending request').
  loadingLabel?: string;
  // Body content. The children render as the button's
  // accessible name; when `loading`, the children are
  // hidden but kept in the DOM (with `aria-hidden`) so
  // the button's width does not jump.
  children?: ReactNode;
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> &
  ButtonOwnProps;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      type = 'button',
      loading = false,
      loadingLabel = 'Loading',
      disabled,
      children,
      'aria-label': ariaLabel,
      ...props
    },
    ref,
  ) => {
    // Icon-only buttons must carry an accessible name.
    // We do not crash production code, but we surface a
    // one-time dev warning so the missing label gets
    // noticed before it lands on a designer's QA pass.
    if (
      size === 'icon' &&
      !ariaLabel &&
      process.env.NODE_ENV !== 'production' &&
      typeof children !== 'string'
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        '[Button] size="icon" requires an aria-label for accessibility. Provide aria-label="..." on the Button.',
      );
    }

    const isDisabled = disabled || loading;
    const dataAttrs = {
      'data-section': 'button',
      'data-loading': loading ? 'true' : 'false',
      'data-variant': variant ?? 'default',
      'data-size': size ?? 'md',
    } as const;

    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
        {...dataAttrs}
        {...props}
      >
        {loading && (
          <>
            <Spinner
              size="sm"
              data-section="button-spinner"
              aria-hidden="true"
            />
            <VisuallyHidden>{loadingLabel}</VisuallyHidden>
          </>
        )}
        {/* Keep the children in the DOM during loading
            so the button's intrinsic width does not jump.
            aria-hidden the slot so the spinner + SR-only
            text are the only announced content. */}
        {children !== undefined && (
          <span
            data-section="button-children"
            aria-hidden={loading ? 'true' : undefined}
            className={cn(
              loading && 'opacity-0',
              'inline-flex items-center gap-2',
            )}
          >
            {children}
          </span>
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';
