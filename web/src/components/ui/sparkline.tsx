import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.279, TODO 11.261) Sparkline -- tiny inline SVG line
// chart for trend rows. No axes, no gridlines, no legend; just
// the polyline that tells the operator "this number is going
// up / down / flat" at a glance. Optional dot markers + a
// last-value label give callers two affordances on top.
//
// Built on the same point-building algorithm that
// `StatCard.sparkline` has used since v1.10.x, lifted out to a
// reusable primitive so list-row cells (TokenUsage per-task,
// Health metrics history, Uptime restart counter) can drop
// trend lines next to their numbers without re-implementing
// the math.

export type SparklineSize = 'sm' | 'md' | 'lg';

export type SparklineVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'destructive'
  | 'info'
  | 'muted';

export interface SparklineProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  data: number[];
  size?: SparklineSize;
  // Explicit width override in pixels (or any CSS length string).
  // Defaults to a per-size pixel value; pass "100%" to fill the
  // column. The internal viewBox stays at 100x<size-height> so
  // the polyline scales smoothly regardless.
  width?: number | string;
  variant?: SparklineVariant;
  showDots?: boolean;
  // Render the final value as a trailing label. Custom format
  // via `lastValueFormatter`; default falls back to Number.toString().
  showLastValue?: boolean;
  lastValueFormatter?: (value: number) => string;
  // Optional accessible label. When omitted falls back to
  // "Trend: N samples, last <last>" for screen readers.
  ariaLabel?: string;
  className?: string;
}

const VIEW_BOX_HEIGHT = 24;
const VIEW_BOX_WIDTH = 100;

const SIZE_CLASSES: Record<SparklineSize, {
  height: string;
  width: string;
  label: string;
  dotR: number;
}> = {
  sm: {
    height: 'h-3',
    width: 'w-12',
    label: 'text-[10px]',
    dotR: 1.25,
  },
  md: {
    height: 'h-4',
    width: 'w-16',
    label: 'text-[11px]',
    dotR: 1.5,
  },
  lg: {
    height: 'h-8',
    width: 'w-24',
    label: 'text-xs',
    dotR: 2,
  },
};

// Stroke + label colour tokens, picking up shadcn theme tokens
// rather than raw Tailwind hues so dark/light parity is
// automatic.
const VARIANT_STROKE: Record<SparklineVariant, string> = {
  default: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  info: 'text-info',
  muted: 'text-muted-foreground',
};

// Exported so call sites that want to render their own SVG
// (e.g. the legacy StatCard inline polyline) can share the same
// point math without re-implementing it. Returns the
// space-separated "x,y x,y ..." polyline string suitable for
// dropping straight into <polyline points="...">.
export function buildSparklinePoints(
  data: number[],
  width: number = VIEW_BOX_WIDTH,
  height: number = VIEW_BOX_HEIGHT,
): string {
  if (data.length === 0) return '';
  if (data.length === 1) {
    const y = height / 2;
    return `0,${y} ${width},${y}`;
  }
  let min = data[0]!;
  let max = data[0]!;
  for (const n of data) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  return data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

// Companion helper: builds the [x, y][] point list for
// rendering per-sample dot markers, sharing the same scale.
function buildSparklineDots(
  data: number[],
  width: number = VIEW_BOX_WIDTH,
  height: number = VIEW_BOX_HEIGHT,
): Array<{ x: number; y: number; value: number }> {
  if (data.length === 0) return [];
  if (data.length === 1) {
    return [{ x: width / 2, y: height / 2, value: data[0]! }];
  }
  let min = data[0]!;
  let max = data[0]!;
  for (const n of data) {
    if (n < min) min = n;
    if (n > max) max = n;
  }
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  return data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return { x, y, value: v };
  });
}

function defaultFormatter(value: number): string {
  if (Number.isInteger(value)) return value.toString();
  // Keep two significant digits for fractional values so the
  // label doesn't visually overflow a tight row cell.
  return value.toFixed(2);
}

export const Sparkline = forwardRef<HTMLSpanElement, SparklineProps>(
  (
    {
      data,
      size = 'md',
      width,
      variant = 'default',
      showDots = false,
      showLastValue = false,
      lastValueFormatter,
      ariaLabel,
      className,
      ...rest
    },
    ref,
  ) => {
    const sizing = SIZE_CLASSES[size];
    const stroke = VARIANT_STROKE[variant];
    const points = buildSparklinePoints(data);
    const dots = showDots ? buildSparklineDots(data) : [];
    const last = data.length > 0 ? data[data.length - 1]! : null;
    const fmt = lastValueFormatter ?? defaultFormatter;
    const isEmpty = data.length === 0;

    const widthClass =
      width === undefined ? sizing.width : '';
    const widthStyle =
      width === undefined
        ? undefined
        : typeof width === 'number'
          ? { width: `${width}px` }
          : { width };

    const accessibleLabel =
      ariaLabel ??
      (isEmpty
        ? 'Trend: no data'
        : `Trend: ${data.length} samples, last ${fmt(last as number)}`);

    return (
      <span
        ref={ref}
        role="img"
        aria-label={accessibleLabel}
        data-section="sparkline"
        data-size={size}
        data-variant={variant}
        data-empty={isEmpty ? 'true' : 'false'}
        className={cn(
          'inline-flex shrink-0 items-center gap-1',
          className,
        )}
        {...rest}
      >
        {/* Empty-state: a single horizontal dash at mid-height.
            Keeps the column width predictable when a row has no
            data yet so the table doesn't reflow once samples
            arrive. */}
        {isEmpty ? (
          <svg
            data-sparkline-empty="true"
            className={cn(sizing.height, widthClass, 'text-muted-foreground/40')}
            viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            style={widthStyle}
          >
            <line
              x1="0"
              x2={VIEW_BOX_WIDTH}
              y1={VIEW_BOX_HEIGHT / 2}
              y2={VIEW_BOX_HEIGHT / 2}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          </svg>
        ) : (
          <svg
            data-sparkline-svg="true"
            className={cn(sizing.height, widthClass, stroke)}
            viewBox={`0 0 ${VIEW_BOX_WIDTH} ${VIEW_BOX_HEIGHT}`}
            preserveAspectRatio="none"
            aria-hidden="true"
            style={widthStyle}
          >
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={points}
              data-sparkline-line="true"
            />
            {showDots
              ? dots.map((d, i) => (
                  <circle
                    key={i}
                    cx={d.x}
                    cy={d.y}
                    r={sizing.dotR}
                    fill="currentColor"
                    data-sparkline-dot={
                      i === dots.length - 1 ? 'last' : 'sample'
                    }
                  />
                ))
              : null}
          </svg>
        )}
        {showLastValue && !isEmpty ? (
          <span
            data-sparkline-last-value="true"
            className={cn(
              'tabular-nums font-mono text-muted-foreground',
              sizing.label,
            )}
          >
            {fmt(last as number)}
          </span>
        ) : null}
      </span>
    );
  },
);
Sparkline.displayName = 'Sparkline';
