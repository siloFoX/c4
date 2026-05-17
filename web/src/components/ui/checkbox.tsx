import { forwardRef, useEffect, useId, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Label } from './label';
import { cn } from '../../lib/cn';

// (v1.11.307, TODO 11.289) New `size` + `error` props. The
// default (md, no error) is byte-identical to the prior
// surface so existing tests + adopters keep their current
// rendering.
export type CheckboxSize = 'sm' | 'md';

const CHECKBOX_BASE =
  'shrink-0 cursor-pointer rounded border bg-background text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

const CHECKBOX_SIZE: Record<CheckboxSize, string> = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
};

const CHECKBOX_BORDER = 'border-input';
const CHECKBOX_BORDER_ERROR = 'border-destructive';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
  indeterminate?: boolean;
  // (v1.11.307, TODO 11.289)
  size?: CheckboxSize;
  // (v1.11.307, TODO 11.289) Error state -- flips `aria-invalid`
  // on the input AND swaps in the destructive-tone border so
  // the surface signals validation failure without the caller
  // wrapping the checkbox in a separate error chrome.
  error?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      id,
      label,
      className,
      disabled,
      indeterminate,
      size = 'md',
      error = false,
      ...props
    },
    forwardedRef,
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const innerRef = useRef<HTMLInputElement | null>(null);

    const setRefs = (node: HTMLInputElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef) {
        (forwardedRef as { current: HTMLInputElement | null }).current = node;
      }
    };

    useEffect(() => {
      if (innerRef.current) {
        innerRef.current.indeterminate = indeterminate === true;
      }
    }, [indeterminate]);

    const input = (
      <input
        ref={setRefs}
        type="checkbox"
        id={inputId}
        disabled={disabled}
        aria-checked={indeterminate ? 'mixed' : undefined}
        aria-invalid={error || undefined}
        data-section="checkbox"
        data-size={size}
        data-error={error ? 'true' : 'false'}
        data-indeterminate={indeterminate ? 'true' : 'false'}
        className={cn(
          CHECKBOX_BASE,
          CHECKBOX_SIZE[size],
          error ? CHECKBOX_BORDER_ERROR : CHECKBOX_BORDER,
          className,
        )}
        {...props}
      />
    );

    if (label == null) {
      return input;
    }

    return (
      <Label
        htmlFor={inputId}
        data-section="checkbox-row"
        className={cn(
          'inline-flex cursor-pointer items-center gap-2',
          disabled && 'cursor-not-allowed opacity-70',
        )}
      >
        {input}
        <span data-section="checkbox-label">{label}</span>
      </Label>
    );
  },
);
Checkbox.displayName = 'Checkbox';
