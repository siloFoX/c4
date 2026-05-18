import { forwardRef, useId, useCallback } from 'react';
import type {
  InputHTMLAttributes,
  MouseEventHandler,
  ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { Label } from './label';
import { cn } from '../../lib/cn';

// (v1.11.327, TODO 11.309) Input primitive enhancements:
//   - `leadingIcon` and `trailingIcon` slots for search
//     icons, status indicators, suffix labels (e.g. "@").
//   - `onClear` callback that renders a built-in clear
//     button (X icon) when the input has a non-empty
//     value. Auto-focuses the input after clearing so
//     the user can keep typing.
//   - Unified `warning` and `success` state slots that
//     mirror the existing `error` slot's behaviour
//     (message id, aria-describedby wiring, tone
//     classes). Precedence: error > warning > success
//     > default.
//   - Shared tone class set so FormField, NativeSelect,
//     and Input all flip the same border/background
//     colour for a given state.

const INPUT_BASE_CLASSES =
  'flex h-10 min-h-[44px] sm:min-h-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

// (v1.11.327, TODO 11.309) Tone class sets keyed by
// canonical state name. Same classes are used by
// FormField in a follow-up adoption patch so the visual
// vocabulary stays in lockstep.
const TONE_CLASSES = {
  default: '',
  error: 'border-destructive focus-visible:ring-destructive',
  warning: 'border-warning focus-visible:ring-warning',
  success: 'border-success focus-visible:ring-success',
} as const;

const MESSAGE_TONE_CLASSES = {
  default: 'text-muted-foreground',
  error: 'text-destructive',
  warning: 'text-warning',
  success: 'text-success',
} as const;

export type InputState = 'default' | 'error' | 'warning' | 'success';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  // (v1.11.327, TODO 11.309) New: warning / success
  // message slots mirroring `error`. Same id-suffix +
  // aria-describedby wiring; do NOT flip aria-invalid
  // (warning and success are non-blocking states).
  warning?: ReactNode;
  success?: ReactNode;
  // (v1.11.327, TODO 11.309) Icon slots. The slots
  // render as inline spans inside the input frame with
  // absolute positioning; the input padding is adjusted
  // automatically (`pl-9` when leadingIcon is set,
  // `pr-9` when trailingIcon OR clear button is set).
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  // (v1.11.327, TODO 11.309) Optional clear callback.
  // When provided AND the input has a non-empty value,
  // a built-in X button renders at the trailing edge.
  // Clicking it calls `onClear()` and focuses the
  // input.
  onClear?: () => void;
  // Caller-supplied SR label for the clear button.
  // Defaults to 'Clear'.
  clearLabel?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      label,
      hint,
      error,
      warning,
      success,
      leadingIcon,
      trailingIcon,
      onClear,
      clearLabel = 'Clear',
      id,
      value,
      defaultValue,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();

    // Precedence: error > warning > success > default.
    const state: InputState = error != null
      ? 'error'
      : warning != null
        ? 'warning'
        : success != null
          ? 'success'
          : 'default';

    // Clear button is rendered when onClear is provided
    // AND the input has a non-empty value. Use the
    // controlled `value` when present, otherwise fall
    // back to `defaultValue` for the initial render.
    const currentValue = value !== undefined ? value : defaultValue;
    const hasValue =
      currentValue !== undefined &&
      currentValue !== null &&
      String(currentValue).length > 0;
    const showClear = onClear !== undefined && hasValue;

    const inputRef = useCallback(
      (node: HTMLInputElement | null) => {
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLInputElement | null>).current =
            node;
        }
      },
      [ref],
    );

    const onClearClick: MouseEventHandler<HTMLButtonElement> = useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClear?.();
      },
      [onClear],
    );

    const hasSlots =
      label != null ||
      hint != null ||
      error != null ||
      warning != null ||
      success != null;
    const hasInlineDecoration =
      leadingIcon != null || trailingIcon != null || showClear;

    const inputId = id ?? generatedId;
    const hintId = hint != null ? `${inputId}-hint` : undefined;
    const errorId = error != null ? `${inputId}-error` : undefined;
    const warningId = warning != null ? `${inputId}-warning` : undefined;
    const successId = success != null ? `${inputId}-success` : undefined;

    const messageIdParts = [
      ariaDescribedBy,
      hintId,
      errorId,
      warningId,
      successId,
    ].filter(Boolean);
    const describedBy =
      messageIdParts.length > 0 ? messageIdParts.join(' ') : undefined;

    const toneClass = TONE_CLASSES[state];
    const showTrailingClear = showClear && trailingIcon == null;
    const showTrailingIcon = trailingIcon != null || showClear;

    const inputElement = (
      <input
        ref={inputRef}
        type={type}
        id={hasSlots ? inputId : id}
        value={value as InputHTMLAttributes<HTMLInputElement>['value']}
        defaultValue={defaultValue as InputHTMLAttributes<HTMLInputElement>['defaultValue']}
        aria-invalid={state === 'error' ? true : undefined}
        aria-describedby={describedBy}
        data-state={state}
        data-section="input-control"
        className={cn(
          INPUT_BASE_CLASSES,
          toneClass,
          leadingIcon != null && 'pl-9',
          showTrailingIcon && 'pr-9',
          className,
        )}
        {...props}
      />
    );

    const inputWithDecoration = hasInlineDecoration ? (
      <div
        data-section="input-wrap"
        data-state={state}
        className="relative"
      >
        {leadingIcon != null && (
          <span
            data-section="input-leading"
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 flex w-9 items-center justify-center text-muted-foreground"
          >
            {leadingIcon}
          </span>
        )}
        {inputElement}
        {showTrailingClear ? (
          <button
            type="button"
            data-section="input-clear"
            onClick={onClearClick}
            aria-label={clearLabel}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : trailingIcon != null ? (
          <span
            data-section="input-trailing"
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground"
          >
            {trailingIcon}
          </span>
        ) : null}
      </div>
    ) : (
      inputElement
    );

    if (!hasSlots) {
      return inputWithDecoration;
    }

    return (
      <div
        className="space-y-1.5"
        data-section="input-field"
        data-state={state}
      >
        {label != null ? <Label htmlFor={inputId}>{label}</Label> : null}
        {inputWithDecoration}
        {hint != null ? (
          <p
            id={hintId}
            data-section="input-hint"
            className={cn('text-xs', MESSAGE_TONE_CLASSES.default)}
          >
            {hint}
          </p>
        ) : null}
        {error != null ? (
          <p
            id={errorId}
            role="alert"
            data-section="input-error"
            className={cn('text-xs', MESSAGE_TONE_CLASSES.error)}
          >
            {error}
          </p>
        ) : null}
        {warning != null ? (
          <p
            id={warningId}
            data-section="input-warning"
            className={cn('text-xs', MESSAGE_TONE_CLASSES.warning)}
          >
            {warning}
          </p>
        ) : null}
        {success != null ? (
          <p
            id={successId}
            data-section="input-success"
            className={cn('text-xs', MESSAGE_TONE_CLASSES.success)}
          >
            {success}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
