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

// (v1.11.383, TODO 11.365) Circular progress variant. The linear
// `<Progress>` covers row/upload surfaces; circular is the
// canonical shape for compact loaders next to status text and
// for save-in-progress affordances inside cards. The geometry
// is pure SVG (no JS animation loop):
//
//   - track circle (muted) draws a full ring;
//   - arc circle (variant tone) is the same circumference with a
//     `stroke-dashoffset` that exposes the percent fraction --
//     determinate path is `dashoffset = (1 - pct) * circumference`;
//   - indeterminate path applies `animate-spin` on the whole svg
//     with a fixed quarter arc, which keeps the visual rhythm
//     consistent with the linear indeterminate stripe.
//
// `prefers-reduced-motion` is honored by `Spinner`'s logic at
// the call site if the operator wants to swap; this component
// keeps the SVG static but the wrapper does NOT add
// `animate-spin` when the value is determinate. So under
// reduced motion the determinate ring still shows the correct
// percent stroke; only the indeterminate spinning ring loses
// its rotation -- the operator sees a fixed quarter arc, which
// is still readable as "in progress" alongside the label.
export type CircularProgressSize = 'xs' | 'sm' | 'md' | 'lg';

export interface CircularProgressProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value?: number;
  max?: number;
  indeterminate?: boolean;
  size?: CircularProgressSize;
  variant?: ProgressVariant;
  // When `true`, renders the rounded percent inside the ring
  // (e.g. "42%"). When `labelText` is set, that wins. Hidden
  // by default so a 24px ring stays icon-sized.
  showPercent?: boolean;
  labelText?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

// (v1.11.383) Per-size geometry. Each entry maps to the outer
// box (`box` px), the stroke width, and the resolved radius +
// circumference. The radius is `box/2 - stroke/2 - 1` so the
// stroke stays inside the box bounds; the extra -1 prevents
// browsers from rounding the arc against the edge.
interface CircularGeometry {
  box: number;
  stroke: number;
  radius: number;
  circumference: number;
  labelClass: string;
}

function geometryFor(size: CircularProgressSize): CircularGeometry {
  const presets: Record<CircularProgressSize, { box: number; stroke: number; labelClass: string }> = {
    xs: { box: 24, stroke: 2, labelClass: 'text-[9px]' },
    sm: { box: 32, stroke: 3, labelClass: 'text-[10px]' },
    md: { box: 48, stroke: 4, labelClass: 'text-xs' },
    lg: { box: 64, stroke: 5, labelClass: 'text-sm' },
  };
  const { box, stroke, labelClass } = presets[size];
  const radius = box / 2 - stroke / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  return { box, stroke, radius, circumference, labelClass };
}

const CIRCULAR_VARIANT_STROKE: Record<ProgressVariant, string> = {
  default: 'stroke-primary',
  success: 'stroke-success',
  warning: 'stroke-warning',
  destructive: 'stroke-destructive',
  info: 'stroke-info',
};

export function CircularProgress({
  value,
  max = 100,
  indeterminate = false,
  size = 'md',
  variant = 'default',
  showPercent = false,
  labelText,
  className,
  ariaLabel,
  ...rest
}: CircularProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const hasValue = !indeterminate && typeof value === 'number';
  const percent = hasValue ? clampPercent(value as number, safeMax) : 0;
  const percentText = `${Math.round(percent)}%`;
  const geometry = geometryFor(size);
  const center = geometry.box / 2;
  // Indeterminate arc covers a quarter of the circle so the
  // spinning ring reads as a partial arc; determinate offset
  // exposes the percent fraction.
  const indeterminateOffset = geometry.circumference * 0.75;
  const determinateOffset = geometry.circumference * (1 - percent / 100);
  const dashOffset = indeterminate ? indeterminateOffset : determinateOffset;

  const ariaProps: Record<string, number | string> = {
    'aria-valuemin': 0,
    'aria-valuemax': safeMax,
  };
  if (hasValue) ariaProps['aria-valuenow'] = Math.max(0, Math.min(safeMax, value as number));

  const showLabel = labelText !== undefined || showPercent;
  const labelContent =
    labelText !== undefined
      ? labelText
      : indeterminate
        ? null
        : percentText;

  return (
    <div
      data-section="circular-progress"
      data-size={size}
      data-variant={variant}
      data-indeterminate={indeterminate ? 'true' : 'false'}
      role="progressbar"
      aria-label={
        ariaLabel ?? (typeof labelText === 'string' ? labelText : 'Progress')
      }
      {...ariaProps}
      className={cn(
        'relative inline-flex items-center justify-center text-muted-foreground',
        className,
      )}
      style={{ width: geometry.box, height: geometry.box }}
      {...rest}
    >
      <svg
        width={geometry.box}
        height={geometry.box}
        viewBox={`0 0 ${geometry.box} ${geometry.box}`}
        data-section="circular-progress-svg"
        className={cn(indeterminate ? 'animate-spin' : null)}
        aria-hidden="true"
      >
        <circle
          data-section="circular-progress-track"
          cx={center}
          cy={center}
          r={geometry.radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeWidth={geometry.stroke}
        />
        <circle
          data-section="circular-progress-arc"
          cx={center}
          cy={center}
          r={geometry.radius}
          fill="none"
          strokeLinecap="round"
          strokeWidth={geometry.stroke}
          className={cn(
            CIRCULAR_VARIANT_STROKE[variant],
            indeterminate ? null : 'transition-[stroke-dashoffset]',
          )}
          strokeDasharray={geometry.circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      {showLabel && labelContent !== null ? (
        <span
          data-section="circular-progress-label"
          className={cn(
            'absolute inset-0 flex items-center justify-center font-medium',
            geometry.labelClass,
          )}
        >
          {labelContent}
        </span>
      ) : null}
    </div>
  );
}

CircularProgress.displayName = 'CircularProgress';
