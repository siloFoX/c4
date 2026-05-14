import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Label } from './label';
import { cn } from '../../lib/cn';

const RADIO_CLASSES =
  'h-4 w-4 shrink-0 cursor-pointer rounded-full border border-input bg-background text-primary accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50';

export interface RadioProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ id, label, className, disabled, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    const input = (
      <input
        ref={ref}
        type="radio"
        id={inputId}
        disabled={disabled}
        className={cn(RADIO_CLASSES, className)}
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
Radio.displayName = 'Radio';
