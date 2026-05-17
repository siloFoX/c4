import { forwardRef, useCallback } from 'react';
import type { ChangeEvent, FocusEvent, KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../../lib/cn';

// (11.175) NumberInput primitive. Numeric text input flanked by
// up/down stepper buttons. Controlled value (number | undefined).
// On blur, clamps to [min, max] and applies precision via toFixed.

export interface NumberInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  // (v1.11.287, TODO 11.269) Optional leading prefix for the
  // input -- mirrors `unit` but sits on the left of the
  // input. Use for currency symbols ("$", "K", "T"), unit
  // names that read better as a prefix ("max"), or short
  // labels ("MB " before a megabyte number).
  prefix?: string;
  precision?: number;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  inputClassName?: string;
  size?: 'sm' | 'md';
}

function clamp(n: number, min?: number, max?: number): number {
  let out = n;
  if (min != null && out < min) out = min;
  if (max != null && out > max) out = max;
  return out;
}

function parseInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      step = 1,
      unit,
      prefix,
      precision,
      placeholder,
      disabled,
      ariaLabel,
      className,
      inputClassName,
      size = 'md',
    },
    ref,
  ) => {
    const atMin = value != null && min != null && value <= min;
    const atMax = value != null && max != null && value >= max;

    const stepBy = useCallback(
      (delta: number) => {
        if (disabled) return;
        const base = value ?? min ?? 0;
        const next = clamp(base + delta, min, max);
        onChange(next);
      },
      [value, min, max, onChange, disabled],
    );

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      onChange(parseInput(e.target.value));
    };

    const handleBlur = (_e: FocusEvent<HTMLInputElement>) => {
      if (value == null) return;
      let next = clamp(value, min, max);
      if (precision != null) {
        next = Number(next.toFixed(precision));
      }
      if (next !== value) onChange(next);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        stepBy(step);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        stepBy(-step);
      }
    };

    const sizeClasses =
      size === 'sm'
        ? 'h-7 text-[12px]'
        : 'h-10 min-h-[44px] sm:min-h-0 text-sm';
    const btnSize = size === 'sm' ? 'h-7 w-7' : 'h-10 w-10';
    const iconSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

    const displayValue = value == null ? '' : String(value);

    return (
      <div
        data-section="number-input"
        data-size={size}
        className={cn(
          'inline-flex items-stretch rounded-md border border-input bg-background',
          'focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-background',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        <button
          type="button"
          aria-label="Decrement"
          data-number-input-action="decrement"
          onClick={() => stepBy(-step)}
          disabled={disabled || atMin}
          className={cn(
            'flex items-center justify-center border-r border-input text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
            btnSize,
          )}
        >
          <Minus className={iconSize} aria-hidden />
        </button>
        {prefix ? (
          <span
            data-number-input-prefix="true"
            className={cn(
              'flex select-none items-center pl-2 text-muted-foreground',
              size === 'sm' ? 'text-[11px]' : 'text-xs',
            )}
            aria-hidden
          >
            {prefix}
          </span>
        ) : null}
        <input
          ref={ref}
          type="text"
          inputMode={precision != null && precision > 0 ? 'decimal' : 'numeric'}
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            'min-w-0 flex-1 bg-transparent px-2 text-center outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed',
            sizeClasses,
            inputClassName,
          )}
        />
        {unit ? (
          <span
            data-number-input-unit="true"
            className={cn(
              'flex select-none items-center pr-2 text-muted-foreground',
              size === 'sm' ? 'text-[11px]' : 'text-xs',
            )}
            aria-hidden
          >
            {unit}
          </span>
        ) : null}
        <button
          type="button"
          aria-label="Increment"
          data-number-input-action="increment"
          onClick={() => stepBy(step)}
          disabled={disabled || atMax}
          className={cn(
            'flex items-center justify-center border-l border-input text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
            btnSize,
          )}
        >
          <Plus className={iconSize} aria-hidden />
        </button>
      </div>
    );
  },
);
NumberInput.displayName = 'NumberInput';
