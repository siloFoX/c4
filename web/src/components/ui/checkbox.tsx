import { forwardRef, useEffect, useId, useRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Label } from './label';
import { cn } from '../../lib/cn';

const CHECKBOX_CLASSES =
  'h-4 w-4 shrink-0 cursor-pointer rounded border border-input bg-background text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    { id, label, className, disabled, indeterminate, ...props },
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
        className={cn(CHECKBOX_CLASSES, className)}
        {...props}
      />
    );

    if (label == null) {
      return input;
    }

    return (
      <Label
        htmlFor={inputId}
        className={cn(
          'inline-flex cursor-pointer items-center gap-2',
          disabled && 'cursor-not-allowed opacity-70',
        )}
      >
        {input}
        <span>{label}</span>
      </Label>
    );
  },
);
Checkbox.displayName = 'Checkbox';
