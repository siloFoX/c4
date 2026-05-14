import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export type ProgressVariant = 'default' | 'success' | 'warning' | 'destructive';

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
  label?: boolean;
  variant?: ProgressVariant;
  className?: string;
}

const VARIANT_BG: Record<ProgressVariant, string> = {
  default: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
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
  variant = 'default',
  className,
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

  return (
    <div className={cn('flex flex-col gap-1', className)} {...rest}>
      {label ? (
        <div className="text-xs text-muted-foreground" data-progress-label="true">
          {indeterminate ? 'Working...' : percentText}
        </div>
      ) : null}
      <div
        role="progressbar"
        {...ariaProps}
        className="relative h-2 w-full overflow-hidden rounded-full bg-muted"
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
