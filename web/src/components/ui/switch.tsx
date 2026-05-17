import { forwardRef, useId } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { cn } from '../../lib/cn';
import { useReducedMotion } from '../../hooks/use-reduced-motion';

// (v1.11.305, TODO 11.287) Size variants + motion-safe thumb.
export type SwitchSize = 'sm' | 'md';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
  size?: SwitchSize;
  className?: string;
  'aria-label'?: string;
}

const SWITCH_BASE =
  'relative inline-flex shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

// (v1.11.305) Per-size dimensions. `md` keeps the prior
// 20x36 px footprint byte-for-byte (h-5 w-9). `sm` lands at
// 16x28 px (h-4 w-7) for dense rows like FeatureFlags
// override tables.
const SWITCH_SIZE: Record<SwitchSize, string> = {
  sm: 'h-4 w-7',
  md: 'h-5 w-9',
};

const THUMB_BASE =
  'pointer-events-none block rounded-full bg-background shadow-sm ring-0';

// Per-size thumb diameter. The translate values below match
// the difference between (track-width) and (thumb-width)
// minus the 2px padding so the thumb visually centres in
// each end of the track.
const THUMB_SIZE: Record<SwitchSize, string> = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
};

const THUMB_TX_OFF: Record<SwitchSize, string> = {
  sm: 'translate-x-0.5',
  md: 'translate-x-0.5',
};

const THUMB_TX_ON: Record<SwitchSize, string> = {
  sm: 'translate-x-3',
  md: 'translate-x-4',
};

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      onChange,
      label,
      disabled,
      id,
      size = 'md',
      className,
      'aria-label': ariaLabel,
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const reducedMotion = useReducedMotion();

    const toggle = () => {
      if (disabled) return;
      onChange(!checked);
    };

    const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
      if (disabled) {
        e.preventDefault();
        return;
      }
      toggle();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggle();
      }
    };

    const button = (
      <button
        ref={ref}
        type="button"
        role="switch"
        id={inputId}
        aria-checked={checked}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        data-section="switch"
        data-size={size}
        data-checked={checked ? 'true' : 'false'}
        data-reduced-motion={reducedMotion ? 'true' : 'false'}
        className={cn(
          SWITCH_BASE,
          SWITCH_SIZE[size],
          checked ? 'bg-primary' : 'bg-muted',
          className,
        )}
      >
        <span
          aria-hidden="true"
          data-section="switch-thumb"
          className={cn(
            THUMB_BASE,
            THUMB_SIZE[size],
            // (v1.11.305) Motion-safe thumb. The transform
            // transition is applied only when the operator
            // allows motion; reduced-motion users see the
            // thumb snap between the two states.
            !reducedMotion && 'transition-transform',
            checked ? THUMB_TX_ON[size] : THUMB_TX_OFF[size],
          )}
        />
      </button>
    );

    if (label == null) {
      return button;
    }

    return (
      <span
        className={cn(
          'inline-flex items-center gap-2',
          disabled && 'cursor-not-allowed opacity-50',
        )}
        data-section="switch-row"
      >
        {button}
        <label
          htmlFor={inputId}
          data-section="switch-label"
          onClick={(e) => {
            if (disabled) return;
            e.preventDefault();
            toggle();
          }}
          className={cn(
            'select-none text-sm font-medium leading-none text-foreground',
            disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          )}
        >
          {label}
        </label>
      </span>
    );
  },
);
Switch.displayName = 'Switch';
