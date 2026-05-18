import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './spinner';
import { VisuallyHidden } from './visually-hidden';

// (v1.11.329, TODO 11.311) IconButton primitive
// enhancements. Square-footprint button optimised for
// icon-only actions where the visible label is the icon
// alone. The `aria-label` prop is mandatory at the TS
// level (the interface requires it) so an icon-only
// button cannot ship with a blank accessible name.
//
// Added in this patch:
//   - `tone` prop: 'neutral' | 'danger' | 'accent'. The
//     neutral tone is the pre-existing baseline (the
//     muted-foreground icon that flips to
//     accent-foreground on hover). Danger emits the red
//     destructive palette for delete-style affordances.
//     Accent emits the primary-tinted palette for the
//     "highlight this action" cases.
//   - `size` prop: 'sm' | 'md' | 'lg'. Square footprints
//     of 32px / 36px / 40px. The 44x44 minimum touch
//     target is preserved on small viewports via
//     `min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0`.
//   - `loading` prop mirroring the Button primitive's
//     loading state (v1.11.326): renders an inline
//     Spinner in place of the icon, auto-disables the
//     click target, and emits a VisuallyHidden SR
//     announcement.
//   - `data-section`, `data-tone`, `data-size`,
//     `data-loading` attributes for e2e selectors.

export type IconButtonTone = 'neutral' | 'danger' | 'accent';
export type IconButtonSize = 'sm' | 'md' | 'lg';

const TONE_CLASSES: Record<IconButtonTone, string> = {
  neutral:
    'text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-primary',
  danger:
    'text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:ring-destructive',
  accent:
    'text-primary hover:bg-primary/10 hover:text-primary focus-visible:ring-primary',
};

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0',
  md: 'h-9 w-9 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0',
  lg: 'h-10 w-10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0',
};

const SPINNER_SIZE: Record<IconButtonSize, 'xs' | 'sm' | 'md'> = {
  sm: 'xs',
  md: 'sm',
  lg: 'sm',
};

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  // Mandatory accessible name. Enforced at the TS
  // level so an icon-only button cannot accidentally
  // ship with a blank accessible name.
  'aria-label': string;
  // (v1.11.329, TODO 11.311) Tone preset. Default
  // `'neutral'`.
  tone?: IconButtonTone;
  // (v1.11.329, TODO 11.311) Size preset. Default
  // `'md'`.
  size?: IconButtonSize;
  // (v1.11.329, TODO 11.311) Loading state. Mirrors
  // the Button primitive's contract: spinner replaces
  // the icon, button auto-disables, aria-busy="true"
  // is emitted, and a VisuallyHidden announcement
  // narrates the pending state.
  loading?: boolean;
  // SR-only text emitted while loading. Default
  // 'Loading'. Call sites with a more specific
  // message ('Deleting', 'Saving') pass their own.
  loadingLabel?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      className,
      icon,
      type = 'button',
      tone = 'neutral',
      size = 'md',
      loading = false,
      loadingLabel = 'Loading',
      disabled,
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;
    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={loading || undefined}
        data-section="icon-button"
        data-tone={tone}
        data-size={size}
        data-loading={loading ? 'true' : 'false'}
        className={cn(
          'inline-flex items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-safe:transition-transform motion-safe:duration-75 motion-safe:active:scale-95',
          SIZE_CLASSES[size],
          TONE_CLASSES[tone],
          className,
        )}
        {...props}
      >
        {loading ? (
          <>
            <Spinner
              size={SPINNER_SIZE[size]}
              data-section="icon-button-spinner"
              aria-hidden="true"
            />
            <VisuallyHidden>{loadingLabel}</VisuallyHidden>
          </>
        ) : (
          <span data-section="icon-button-icon" aria-hidden="true">
            {icon}
          </span>
        )}
      </button>
    );
  },
);
IconButton.displayName = 'IconButton';
