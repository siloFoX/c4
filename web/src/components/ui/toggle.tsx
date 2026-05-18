import { forwardRef, useCallback, useState } from 'react';
import type {
  ButtonHTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from 'react';
import { cn } from '../../lib/cn';

// (v1.11.390, TODO 11.372) Toggle -- a button that carries a
// pressed/unpressed state, matching the WAI-ARIA toggle-button
// pattern (`role="button" aria-pressed="true|false"`). Pairs
// with the existing `<Switch>` (11.287 / v1.11.305): Switch is
// the right surface when the affordance is "on or off"
// (a setting that gates behaviour); Toggle is the right
// surface when the affordance is "this format / mode applies
// to the next action" (text-editor bold, view-mode chip,
// filter-pin, etc.).
//
// API:
//   - Controlled: pass `pressed` + `onPressedChange`.
//   - Uncontrolled: pass `defaultPressed`; the component
//     keeps state internally and still calls
//     `onPressedChange` when wired.
//   - Mixed: `pressed` always wins.
//
// Sizes: sm / md / lg. Variants: default (filled when
// pressed) / outline (border-only when pressed). Icon is a
// leading slot; the body renders `icon` then `children`.

export type ToggleSize = 'sm' | 'md' | 'lg';
export type ToggleVariant = 'default' | 'outline';

export interface ToggleProps
  extends Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    'onChange' | 'children' | 'type'
  > {
  // Controlled state. When omitted, the component runs in
  // uncontrolled mode and tracks state from `defaultPressed`.
  pressed?: boolean;
  // Uncontrolled initial pressed state. Default false.
  // Ignored when `pressed` is supplied.
  defaultPressed?: boolean;
  // Fires every time the pressed state changes.
  onPressedChange?: (next: boolean) => void;
  size?: ToggleSize;
  variant?: ToggleVariant;
  // Leading icon. Pure presentation; the body renders this
  // before `children`. Hidden from assistive tech unless the
  // caller wires an `aria-label` to describe the toggle.
  icon?: ReactNode;
  children?: ReactNode;
  // Inherit the legacy `type="button"` default so the
  // toggle does not accidentally submit a surrounding form.
  type?: 'button' | 'submit' | 'reset';
}

const TOGGLE_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const TOGGLE_SIZE: Record<ToggleSize, string> = {
  sm: 'h-7 px-2 text-xs',
  md: 'h-9 px-3 text-sm',
  lg: 'h-11 px-4 text-base',
};

// (v1.11.390, TODO 11.372) Per-variant pressed/unpressed
// palette. `default` flips to filled accent when pressed;
// `outline` flips to bordered accent.
const TOGGLE_VARIANT_UNPRESSED: Record<ToggleVariant, string> = {
  default: 'bg-transparent text-foreground hover:bg-accent/40 hover:text-accent-foreground',
  outline:
    'border border-input bg-transparent text-foreground hover:bg-accent/40 hover:text-accent-foreground',
};

const TOGGLE_VARIANT_PRESSED: Record<ToggleVariant, string> = {
  default: 'bg-accent text-accent-foreground',
  outline: 'border border-accent bg-accent/20 text-accent-foreground',
};

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  function Toggle(
    {
      pressed: pressedProp,
      defaultPressed = false,
      onPressedChange,
      size = 'md',
      variant = 'default',
      icon,
      children,
      type = 'button',
      disabled,
      className,
      onClick,
      onKeyDown,
      ...rest
    },
    ref,
  ) {
    const isControlled = pressedProp !== undefined;
    const [internalPressed, setInternalPressed] = useState<boolean>(
      defaultPressed,
    );
    const pressed = isControlled ? (pressedProp as boolean) : internalPressed;

    const togglePressed = useCallback(() => {
      if (disabled) return;
      const next = !pressed;
      if (!isControlled) setInternalPressed(next);
      onPressedChange?.(next);
    }, [disabled, pressed, isControlled, onPressedChange]);

    const handleClick = useCallback(
      (e: MouseEvent<HTMLButtonElement>) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        togglePressed();
        onClick?.(e);
      },
      [disabled, togglePressed, onClick],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLButtonElement>) => {
        onKeyDown?.(e);
        if (e.defaultPrevented) return;
        // Native <button> already handles Space + Enter via
        // the click synthesis; nothing to override here. We
        // keep this hook so callers can attach extra
        // keystroke handlers without losing the native
        // pressed-state behaviour.
      },
      [onKeyDown],
    );

    return (
      <button
        ref={ref}
        type={type}
        role="button"
        aria-pressed={pressed}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        data-section="toggle"
        data-pressed={pressed ? 'true' : 'false'}
        data-size={size}
        data-variant={variant}
        className={cn(
          TOGGLE_BASE,
          TOGGLE_SIZE[size],
          pressed
            ? TOGGLE_VARIANT_PRESSED[variant]
            : TOGGLE_VARIANT_UNPRESSED[variant],
          className,
        )}
        {...rest}
      >
        {icon != null ? (
          <span
            data-section="toggle-icon"
            aria-hidden="true"
            className="inline-flex shrink-0 items-center"
          >
            {icon}
          </span>
        ) : null}
        {children != null ? (
          <span data-section="toggle-label" className="truncate">
            {children}
          </span>
        ) : null}
      </button>
    );
  },
);
Toggle.displayName = 'Toggle';
