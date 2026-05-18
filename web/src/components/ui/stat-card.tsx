import { forwardRef, useEffect, useRef, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Skeleton } from './skeleton';

// Polished KPI card used by pages/Auto.tsx's hero stats row. The
// value count-up is intentionally implemented with rAF (not CSS
// transitions on a CSS counter) so non-integer fixed strings like
// "5m ago" still render correctly when the parent passes a string
// in place of a number. The numeric path also exposes the resolved
// final value via data-stat-final so tests can read the target
// without racing the animation.

export type StatCardTone =
  | 'default'
  | 'primary'
  | 'success'
  | 'warning'
  | 'info';

export interface StatCardTrend {
  // Signed percent value. Sign drives arrow direction and color.
  value: number;
  label?: string;
}

// (v1.11.424, TODO 11.406) Comparison value -- shown beneath the
// primary metric to anchor the operator on a previous period or a
// target. `value` accepts number | string for flexibility; `label`
// defaults to "vs." when omitted.
export interface StatCardComparison {
  value: number | string;
  label?: string;
}

export interface StatCardProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode | undefined;
  label: string;
  value: number | string;
  hint?: ReactNode | undefined;
  loading?: boolean | undefined;
  tone?: StatCardTone | undefined;
  // Skip the count-up animation on number values. Used by tests so
  // assertions are deterministic without waitFor on every render.
  noAnimation?: boolean | undefined;
  trend?: StatCardTrend | undefined;
  sparkline?: number[] | undefined;
  // (v1.11.424, TODO 11.406) Caller-supplied sparkline body. When
  // present, replaces the built-in polyline render of `sparkline`.
  // Useful for plugging in a third-party chart library while
  // keeping the rest of the card structure.
  sparklineSlot?: ReactNode | undefined;
  // (v1.11.424, TODO 11.406) Comparison anchor (previous period,
  // target, etc.). Hidden when undefined.
  comparison?: StatCardComparison | undefined;
}

// (v1.11.424, TODO 11.406) Pure helper exported for tests +
// alternate hosts -- maps a trend value to a canonical direction
// label.
export type StatCardTrendDirection = 'up' | 'down' | 'flat';

export function getStatCardTrendDirection(
  value: number,
): StatCardTrendDirection {
  if (!Number.isFinite(value)) return 'flat';
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

function useCountUp(target: number, enabled: boolean, durationMs = 700): number {
  const [value, setValue] = useState<number>(enabled ? 0 : target);
  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    if (typeof requestAnimationFrame === 'undefined') {
      setValue(target);
      return;
    }
    const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let raf = 0;
    const step = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled, durationMs]);
  return value;
}

function useChangePulse(value: number | string): boolean {
  const [pulse, setPulse] = useState(false);
  const prev = useRef<number | string>(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setPulse(true);
    const id = window.setTimeout(() => setPulse(false), 600);
    return () => window.clearTimeout(id);
  }, [value]);
  return pulse;
}

const TONE_GRADIENT: Record<StatCardTone, string> = {
  default: 'from-muted/40 via-muted/10 to-transparent',
  primary: 'from-primary/20 via-primary/5 to-transparent',
  success: 'from-success/20 via-success/5 to-transparent',
  warning: 'from-warning/20 via-warning/5 to-transparent',
  info: 'from-info/20 via-info/5 to-transparent',
};

const TONE_ICON_RING: Record<StatCardTone, string> = {
  default: 'text-muted-foreground ring-border',
  primary: 'text-primary ring-primary/30',
  success: 'text-success ring-success/30',
  warning: 'text-warning ring-warning/30',
  info: 'text-info ring-info/30',
};

const TONE_SPARK_STROKE: Record<StatCardTone, string> = {
  default: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  info: 'text-info',
};

function buildSparklinePoints(
  data: number[],
  width: number,
  height: number,
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

export const StatCard = forwardRef<HTMLDivElement, StatCardProps>(
  (
    {
      className,
      icon,
      label,
      value,
      hint,
      loading = false,
      tone = 'default',
      noAnimation = false,
      trend,
      sparkline,
      sparklineSlot,
      comparison,
      ...props
    },
    ref,
  ) => {
    const isNumber = typeof value === 'number' && Number.isFinite(value);
    const animated = useCountUp(isNumber ? value : 0, isNumber && !noAnimation);
    const pulse = useChangePulse(value);
    const display = isNumber ? animated : value;
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
      setMounted(true);
    }, []);

    const trendDirection = trend
      ? getStatCardTrendDirection(trend.value)
      : undefined;

    return (
      <div
        ref={ref}
        data-section="stat-card"
        data-stat-card
        data-tone={tone}
        data-loading={loading ? 'true' : 'false'}
        className={cn(
          'group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md',
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
          className,
        )}
        {...props}
      >
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 -z-0 bg-gradient-to-br',
            TONE_GRADIENT[tone],
          )}
        />
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              data-section="stat-card-label"
              className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground"
            >
              {label}
            </p>
            {loading ? (
              <Skeleton
                aria-hidden={false}
                aria-label={`${label} loading`}
                width="5rem"
                height="2rem"
                className="mt-2 inline-block bg-muted/70"
              />
            ) : (
              <p
                data-section="stat-card-value"
                data-stat-value
                data-stat-final={String(value)}
                className={cn(
                  'mt-2 text-3xl font-semibold leading-tight tabular-nums text-foreground',
                  pulse && 'animate-pulse',
                )}
              >
                {display}
              </p>
            )}
            {comparison ? (
              <p
                data-section="stat-card-comparison"
                data-stat-comparison-value={String(comparison.value)}
                className="mt-1 truncate text-xs text-muted-foreground"
              >
                <span className="opacity-70">
                  {comparison.label ?? 'vs.'}
                </span>{' '}
                <span className="font-medium text-foreground">
                  {comparison.value}
                </span>
              </p>
            ) : null}
            {hint ? (
              <p
                data-section="stat-card-hint"
                className="mt-1 truncate text-xs text-muted-foreground"
              >
                {hint}
              </p>
            ) : null}
            {trend ? (
              <p
                data-section="stat-card-trend"
                data-stat-trend
                data-stat-trend-value={String(trend.value)}
                data-stat-trend-direction={trendDirection}
                className={cn(
                  'mt-1 flex items-center gap-1 text-xs font-medium',
                  trendDirection === 'up' && 'text-success',
                  trendDirection === 'down' && 'text-destructive',
                  trendDirection === 'flat' && 'text-muted-foreground',
                )}
              >
                <span
                  aria-hidden="true"
                  data-section="stat-card-trend-arrow"
                  data-stat-trend-arrow
                >
                  {trendDirection === 'up'
                    ? '▲'
                    : trendDirection === 'down'
                    ? '▼'
                    : '▬'}
                </span>
                <span data-section="stat-card-trend-value">
                  {Math.abs(trend.value)}%
                </span>
                {trend.label ? (
                  <span
                    data-section="stat-card-trend-label"
                    className="text-muted-foreground"
                  >
                    {trend.label}
                  </span>
                ) : null}
              </p>
            ) : null}
            {sparklineSlot !== undefined ? (
              <div
                data-section="stat-card-sparkline-slot"
                className="mt-2 w-full"
              >
                {sparklineSlot}
              </div>
            ) : sparkline && sparkline.length > 0 ? (
              <svg
                data-section="stat-card-sparkline"
                data-stat-sparkline
                className={cn(
                  'sparkline mt-2 h-8 w-full',
                  TONE_SPARK_STROKE[tone],
                )}
                viewBox="0 0 100 24"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={buildSparklinePoints(sparkline, 100, 24)}
                />
              </svg>
            ) : null}
          </div>
          {icon ? (
            <span
              aria-hidden="true"
              data-section="stat-card-icon"
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/70 ring-1 backdrop-blur-sm',
                TONE_ICON_RING[tone],
              )}
            >
              {icon}
            </span>
          ) : null}
        </div>
      </div>
    );
  },
);
StatCard.displayName = 'StatCard';
