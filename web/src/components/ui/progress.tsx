import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type ProgressVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'destructive'
  // (v1.11.274, TODO 11.256) New 'info' variant -- maps to the
  // sky/info palette so an "accent" tone reads as informational
  // rather than primary action. Used by TokenUsage's per-day
  // breakdown where the bar represents a measurement, not an
  // action target.
  | 'info';

// (v1.11.274, TODO 11.256) Size scale. Default `md` matches the
// prior fixed h-2 layout so every existing caller stays
// byte-identical. `sm` is a hairline for dense rows (token
// per-task table, sidebar widgets) and `lg` is a chunkier bar
// for hero / upload surfaces.
export type ProgressSize = 'sm' | 'md' | 'lg';

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
  // When `true`, the legacy boolean shows the inline label row
  // (with percent / "Working..." for indeterminate). The new
  // `labelText` prop lets the caller add free-form copy ("Uploading
  // snapshot...") that renders on the left of the same row; the
  // percent number still renders on the right unless
  // `showPercent={false}` is passed.
  label?: boolean;
  labelText?: ReactNode;
  showPercent?: boolean;
  variant?: ProgressVariant;
  size?: ProgressSize;
  className?: string;
  // (v1.11.345, TODO 11.327) Accessible name for the
  // role=progressbar element. Required by axe-core's
  // aria-progressbar-name rule. When a string-typed
  // `labelText` is provided, it doubles as the
  // aria-label so callers do not have to repeat
  // themselves. The fallback "Progress" keeps the
  // surface accessible even when neither prop is set.
  ariaLabel?: string;
}

const VARIANT_BG: Record<ProgressVariant, string> = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
};

const SIZE_CLASSES: Record<ProgressSize, string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

function clampPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  const pct = (value / max) * 100;
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

export function Progress({
  value,
  max = 100,
  indeterminate = false,
  label = false,
  labelText,
  showPercent,
  variant = 'default',
  size = 'md',
  className,
  ariaLabel,
  ...rest
}: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const hasValue = !indeterminate && typeof value === 'number';
  const percent = hasValue ? clampPercent(value as number, safeMax) : 0;
  const percentText = `${Math.round(percent)}%`;
  const variantBg = VARIANT_BG[variant];
  const ariaProps: Record<string, number | string> = {
    'aria-valuemin': 0,
    'aria-valuemax': safeMax,
  };
  if (hasValue) ariaProps['aria-valuenow'] = Math.max(0, Math.min(safeMax, value as number));

  // (v1.11.274, TODO 11.256) Label row resolution. The legacy
  // boolean `label` toggles the entire row on/off; the new
  // `labelText` adds free-form copy on the left and the percent
  // stays on the right unless `showPercent={false}` opts out.
  // Passing `labelText` without `label` auto-enables the row so
  // callers don't have to set both.
  const showLabelRow = label || labelText !== undefined;
  const showPercentResolved =
    showPercent === undefined ? true : showPercent;

  return (
    <div
      data-section="progress"
      data-size={size}
      className={cn('flex flex-col gap-1', className)}
      {...rest}
    >
      {showLabelRow ? (
        <div
          className="flex items-center justify-between text-xs text-muted-foreground"
          data-progress-label="true"
        >
          {labelText !== undefined ? (
            <span data-progress-label-text>{labelText}</span>
          ) : null}
          {showPercentResolved ? (
            <span data-progress-percent>
              {indeterminate ? 'Working...' : percentText}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        // (v1.11.345, TODO 11.327) Accessible name precedence:
        // explicit `ariaLabel` -> string `labelText` ->
        // fallback "Progress" so the rendered progressbar
        // always satisfies axe-core's aria-progressbar-name
        // rule.
        aria-label={
          ariaLabel ?? (typeof labelText === 'string' ? labelText : 'Progress')
        }
        {...ariaProps}
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-muted',
          SIZE_CLASSES[size],
        )}
      >
        {indeterminate ? (
          <div
            data-progress-indeterminate="true"
            className={cn(
              'absolute inset-y-0 left-0 w-1/3 animate-pulse rounded-full',
              variantBg,
            )}
          />
        ) : (
          <div
            data-progress-fill="true"
            className={cn('h-full rounded-full transition-all', variantBg)}
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
    </div>
  );
}

// (v1.11.274, TODO 11.256) ProgressBar export alias. The dispatch
// names the primitive "ProgressBar" while the legacy file is
// `progress.tsx` with the `Progress` component. Re-export under
// both names so callers can write either; the underlying
// component is the same.
export const ProgressBar = Progress;
export type ProgressBarProps = ProgressProps;
export type ProgressBarSize = ProgressSize;
export type ProgressBarVariant = ProgressVariant;
