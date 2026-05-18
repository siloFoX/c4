import { forwardRef, useCallback, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.391, TODO 11.373) Slider + RangeSlider primitives.
// Implements the WAI-ARIA slider pattern with full keyboard
// navigation. Horizontal orientation only in v1; vertical
// can be added on a follow-on (geometry is mirror-symmetric).
//
// Both components are keyboard-driven; drag-to-set is a
// follow-on (pointermove handlers across the track surface).
// Per the dispatch, the keyboard contract (ArrowLeft/Right +
// PageUp/Down + Home/End) is the canonical interaction.

// ----- shared helpers --------------------------------------

// Pure helper exported for unit testing. Clamps `value` to
// `[min, max]` then snaps it to the nearest `step` increment
// (anchored at `min`). Returns NaN when min > max or step
// <= 0 -- callers should guard their bounds. Math.round is
// used so 50.4 with step=1 becomes 50 and 50.5 becomes 51.
export function clampToStep(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  if (!Number.isFinite(value)) return min;
  if (step <= 0 || min > max) return value;
  if (value <= min) return min;
  if (value >= max) return max;
  const steps = Math.round((value - min) / step);
  const snapped = min + steps * step;
  if (snapped > max) return max;
  return snapped;
}

function percentOf(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const pct = ((value - min) / (max - min)) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

function defaultPageStep(min: number, max: number, step: number): number {
  // Default page step = max(step, 10% of the range).
  const tenPercent = Math.abs(max - min) / 10;
  return tenPercent > step ? tenPercent : step;
}

function formatDefault(value: number): string {
  return String(value);
}

// ----- single-value Slider ---------------------------------

export interface SliderProps {
  // Controlled value. When omitted, the component runs in
  // uncontrolled mode and tracks state from `defaultValue`.
  value?: number;
  defaultValue?: number;
  onChange?: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  // Override the page step for PageUp/PageDown. Default =
  // max(step, 10% of range).
  pageStep?: number;
  // When true (default), a small floating label above the
  // thumb shows the current value. Hidden until focus or
  // hover via the `data-section="slider-tooltip"` selector.
  showTooltip?: boolean;
  // Format the value for the tooltip + aria-valuetext.
  // Default is `String(value)`.
  formatValue?: (value: number) => string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
}

export const Slider = forwardRef<HTMLDivElement, SliderProps>(
  function Slider(
    {
      value: valueProp,
      defaultValue,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      pageStep,
      showTooltip = true,
      formatValue = formatDefault,
      ariaLabel,
      disabled = false,
      className,
      ...rest
    },
    ref,
  ) {
    const isControlled = valueProp !== undefined;
    const initial = clampToStep(
      defaultValue !== undefined ? defaultValue : min,
      min,
      max,
      step,
    );
    const [internalValue, setInternalValue] = useState<number>(initial);
    const rawValue = isControlled ? (valueProp as number) : internalValue;
    const value = clampToStep(rawValue, min, max, step);

    const pageStepResolved = pageStep ?? defaultPageStep(min, max, step);

    const commit = useCallback(
      (next: number) => {
        const snapped = clampToStep(next, min, max, step);
        if (!isControlled) setInternalValue(snapped);
        if (snapped !== value) onChange?.(snapped);
      },
      [isControlled, min, max, step, onChange, value],
    );

    const handleKeyDown = useCallback(
      (e: KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowUp':
            e.preventDefault();
            commit(value + step);
            break;
          case 'ArrowLeft':
          case 'ArrowDown':
            e.preventDefault();
            commit(value - step);
            break;
          case 'PageUp':
            e.preventDefault();
            commit(value + pageStepResolved);
            break;
          case 'PageDown':
            e.preventDefault();
            commit(value - pageStepResolved);
            break;
          case 'Home':
            e.preventDefault();
            commit(min);
            break;
          case 'End':
            e.preventDefault();
            commit(max);
            break;
          default:
            break;
        }
      },
      [disabled, commit, value, step, pageStepResolved, min, max],
    );

    const pct = percentOf(value, min, max);
    const valueText = formatValue(value);

    return (
      <div
        ref={ref}
        data-section="slider"
        data-disabled={disabled ? 'true' : 'false'}
        className={cn(
          'relative flex h-6 w-full select-none items-center',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        {...rest}
      >
        <div
          data-section="slider-track"
          className="absolute inset-x-0 h-1 rounded-full bg-muted"
        />
        <div
          data-section="slider-track-filled"
          className="absolute h-1 rounded-full bg-primary"
          style={{ left: 0, width: `${pct}%` }}
        />
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={valueText}
          aria-orientation="horizontal"
          aria-label={ariaLabel}
          aria-disabled={disabled || undefined}
          data-section="slider-thumb"
          data-value={value}
          onKeyDown={handleKeyDown}
          className={cn(
            'absolute h-4 w-4 -translate-x-1/2 rounded-full border border-primary bg-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'cursor-grab active:cursor-grabbing',
          )}
          style={{ left: `${pct}%` }}
        >
          {showTooltip ? (
            <span
              aria-hidden="true"
              data-section="slider-tooltip"
              className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 transition-opacity group-hover:opacity-100"
              data-tooltip-value={valueText}
            >
              {valueText}
            </span>
          ) : null}
        </div>
      </div>
    );
  },
);
Slider.displayName = 'Slider';

// ----- range slider ----------------------------------------

export interface RangeSliderProps {
  // Controlled pair [low, high]. Either bound being NaN/-Inf
  // is rejected by the clamp helper.
  values?: [number, number];
  defaultValues?: [number, number];
  onChange?: (next: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  pageStep?: number;
  showTooltip?: boolean;
  formatValue?: (value: number) => string;
  ariaLabelLow?: string;
  ariaLabelHigh?: string;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
}

export const RangeSlider = forwardRef<HTMLDivElement, RangeSliderProps>(
  function RangeSlider(
    {
      values: valuesProp,
      defaultValues,
      onChange,
      min = 0,
      max = 100,
      step = 1,
      pageStep,
      showTooltip = true,
      formatValue = formatDefault,
      ariaLabelLow,
      ariaLabelHigh,
      disabled = false,
      className,
      ...rest
    },
    ref,
  ) {
    const isControlled = valuesProp !== undefined;
    const initial: [number, number] = [
      clampToStep(
        defaultValues ? defaultValues[0] : min,
        min,
        max,
        step,
      ),
      clampToStep(
        defaultValues ? defaultValues[1] : max,
        min,
        max,
        step,
      ),
    ];
    const [internalValues, setInternalValues] = useState<[number, number]>(
      initial,
    );
    const rawValues = isControlled
      ? (valuesProp as [number, number])
      : internalValues;
    // Always clamp + sort so low <= high.
    const a = clampToStep(rawValues[0], min, max, step);
    const b = clampToStep(rawValues[1], min, max, step);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    const pageStepResolved = pageStep ?? defaultPageStep(min, max, step);

    const commit = useCallback(
      (which: 'low' | 'high', nextRaw: number) => {
        const snapped = clampToStep(nextRaw, min, max, step);
        let nextLo = lo;
        let nextHi = hi;
        if (which === 'low') {
          nextLo = Math.min(snapped, hi);
        } else {
          nextHi = Math.max(snapped, lo);
        }
        const out: [number, number] = [nextLo, nextHi];
        if (!isControlled) setInternalValues(out);
        if (out[0] !== lo || out[1] !== hi) onChange?.(out);
      },
      [isControlled, min, max, step, onChange, lo, hi],
    );

    const buildKeyDown = useCallback(
      (which: 'low' | 'high', current: number) =>
        (e: KeyboardEvent<HTMLDivElement>) => {
          if (disabled) return;
          switch (e.key) {
            case 'ArrowRight':
            case 'ArrowUp':
              e.preventDefault();
              commit(which, current + step);
              break;
            case 'ArrowLeft':
            case 'ArrowDown':
              e.preventDefault();
              commit(which, current - step);
              break;
            case 'PageUp':
              e.preventDefault();
              commit(which, current + pageStepResolved);
              break;
            case 'PageDown':
              e.preventDefault();
              commit(which, current - pageStepResolved);
              break;
            case 'Home':
              e.preventDefault();
              commit(which, min);
              break;
            case 'End':
              e.preventDefault();
              commit(which, max);
              break;
            default:
              break;
          }
        },
      [disabled, commit, step, pageStepResolved, min, max],
    );

    const pctLo = percentOf(lo, min, max);
    const pctHi = percentOf(hi, min, max);
    const loText = formatValue(lo);
    const hiText = formatValue(hi);

    return (
      <div
        ref={ref}
        data-section="range-slider"
        data-disabled={disabled ? 'true' : 'false'}
        className={cn(
          'relative flex h-6 w-full select-none items-center',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
        {...rest}
      >
        <div
          data-section="range-slider-track"
          className="absolute inset-x-0 h-1 rounded-full bg-muted"
        />
        <div
          data-section="range-slider-track-filled"
          className="absolute h-1 rounded-full bg-primary"
          style={{ left: `${pctLo}%`, width: `${pctHi - pctLo}%` }}
        />
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-valuemin={min}
          aria-valuemax={hi}
          aria-valuenow={lo}
          aria-valuetext={loText}
          aria-orientation="horizontal"
          aria-label={ariaLabelLow ?? 'Minimum'}
          aria-disabled={disabled || undefined}
          data-section="range-slider-thumb-low"
          data-value={lo}
          onKeyDown={buildKeyDown('low', lo)}
          className={cn(
            'absolute h-4 w-4 -translate-x-1/2 rounded-full border border-primary bg-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'cursor-grab active:cursor-grabbing',
          )}
          style={{ left: `${pctLo}%` }}
        >
          {showTooltip ? (
            <span
              aria-hidden="true"
              data-section="range-slider-tooltip-low"
              className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 transition-opacity"
            >
              {loText}
            </span>
          ) : null}
        </div>
        <div
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-valuemin={lo}
          aria-valuemax={max}
          aria-valuenow={hi}
          aria-valuetext={hiText}
          aria-orientation="horizontal"
          aria-label={ariaLabelHigh ?? 'Maximum'}
          aria-disabled={disabled || undefined}
          data-section="range-slider-thumb-high"
          data-value={hi}
          onKeyDown={buildKeyDown('high', hi)}
          className={cn(
            'absolute h-4 w-4 -translate-x-1/2 rounded-full border border-primary bg-background shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'cursor-grab active:cursor-grabbing',
          )}
          style={{ left: `${pctHi}%` }}
        >
          {showTooltip ? (
            <span
              aria-hidden="true"
              data-section="range-slider-tooltip-high"
              className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background opacity-0 transition-opacity"
            >
              {hiText}
            </span>
          ) : null}
        </div>
      </div>
    );
  },
);
RangeSlider.displayName = 'RangeSlider';

// (v1.11.391, TODO 11.373) Optional combined type re-export.
// Useful for callers that store slider config as a union.
export type AnySliderProps = SliderProps | RangeSliderProps;

// Trivial helper to keep TS happy when storing the formatter
// as a runtime value (without losing the type-parameter).
export const sliderFormatters = {
  none: formatDefault,
  withPercent: (v: number): string => `${v}%`,
  fixed1: (v: number): string => v.toFixed(1),
  fixed2: (v: number): string => v.toFixed(2),
} as const;

