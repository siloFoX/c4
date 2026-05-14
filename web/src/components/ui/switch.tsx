import { forwardRef, useId } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { cn } from '../../lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

const SWITCH_CLASSES =
  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const THUMB_CLASSES =
  'pointer-events-none block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform';

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked,
      onChange,
      label,
      disabled,
      id,
      className,
      'aria-label': ariaLabel,
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

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
        className={cn(
          SWITCH_CLASSES,
          checked ? 'bg-primary' : 'bg-muted',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            THUMB_CLASSES,
            checked ? 'translate-x-4' : 'translate-x-0.5',
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
      >
        {button}
        <label
          htmlFor={inputId}
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
