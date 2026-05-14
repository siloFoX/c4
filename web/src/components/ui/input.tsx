import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Label } from './label';
import { cn } from '../../lib/cn';

const INPUT_CLASSES =
  'flex h-10 min-h-[44px] sm:min-h-0 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      label,
      hint,
      error,
      id,
      'aria-describedby': ariaDescribedBy,
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const hasSlots = label != null || hint != null || error != null;

    if (!hasSlots) {
      return (
        <input
          ref={ref}
          type={type}
          id={id}
          aria-describedby={ariaDescribedBy}
          className={cn(INPUT_CLASSES, className)}
          {...props}
        />
      );
    }

    const inputId = id ?? generatedId;
    const hintId = hint != null ? `${inputId}-hint` : undefined;
    const errorId = error != null ? `${inputId}-error` : undefined;
    const describedBy =
      [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="space-y-1.5">
        {label != null ? <Label htmlFor={inputId}>{label}</Label> : null}
        <input
          ref={ref}
          type={type}
          id={inputId}
          aria-invalid={error != null ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            INPUT_CLASSES,
            error != null && 'border-destructive',
            className,
          )}
          {...props}
        />
        {hint != null ? (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
        {error != null ? (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';
