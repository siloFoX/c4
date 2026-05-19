import { forwardRef, useMemo } from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.464, TODO 11.446) ChartBullet primitive.
//
// Pure-SVG bullet chart (Stephen Few). Visualises a single
// primary measure against a target plus a stack of
// qualitative range bands (e.g., bad / fair / good).
// Horizontal or vertical orientation. Carries
// `role="progressbar"` so screen readers describe the
// measure as a percentage of the chart max.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartBulletRange {
  max: number;
  label?: string;
  color?: string;
}

export interface ChartBulletProps {
  value: number;
  target?: number;
  ranges?: readonly ChartBulletRange[];
  max?: number;
  label?: string;
  subLabel?: string;
  width?: number;
  height?: number;
  orientation?: 'horizontal' | 'vertical';
  measureColor?: string;
  targetColor?: string;
  showAxisTicks?: boolean;
  tickCount?: number;
  formatValue?: (v: number) => string;
  ariaLabel?: string;
  className?: string;
  measureThickness?: number;
  animate?: boolean;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_BULLET_WIDTH = 360;
export const DEFAULT_CHART_BULLET_HEIGHT = 48;
export const DEFAULT_CHART_BULLET_MEASURE_COLOR = '#1f2937';
export const DEFAULT_CHART_BULLET_TARGET_COLOR = '#ef4444';
export const DEFAULT_CHART_BULLET_TICK_COUNT = 5;
export const DEFAULT_CHART_BULLET_MEASURE_THICKNESS = 0.4;

// Default qualitative band palette (3 tiers) - light to dark
// neutral so the measure bar (dark) reads on top.
export const DEFAULT_CHART_BULLET_RANGE_COLORS = [
  '#e5e7eb',
  '#cbd5e1',
  '#94a3b8',
] as const;

// Compute the effective chart maximum. Honours an explicit
// override; otherwise picks the largest of value, target,
// and the highest range max. Falls back to 1 when nothing
// finite is provided so the chart still renders.
export function getBulletMax(
  value: number,
  target?: number,
  ranges?: readonly ChartBulletRange[],
  override?: number,
): number {
  if (override !== undefined && Number.isFinite(override) && override > 0) {
    return override;
  }
  let max = Number.NEGATIVE_INFINITY;
  if (Number.isFinite(value) && value > max) max = value;
  if (target !== undefined && Number.isFinite(target) && target > max) {
    max = target;
  }
  if (ranges) {
    for (const r of ranges) {
      if (Number.isFinite(r.max) && r.max > max) max = r.max;
    }
  }
  if (!Number.isFinite(max) || max <= 0) return 1;
  return max;
}

// Three default qualitative bands at 33% / 66% / 100% of
// the chart max so adopters get a "looks reasonable" view
// without configuring ranges manually.
export function getDefaultBulletRanges(
  max: number,
): ChartBulletRange[] {
  if (!Number.isFinite(max) || max <= 0) return [];
  return [
    {
      max: max * (1 / 3),
      label: 'Low',
      color: DEFAULT_CHART_BULLET_RANGE_COLORS[0],
    },
    {
      max: max * (2 / 3),
      label: 'Medium',
      color: DEFAULT_CHART_BULLET_RANGE_COLORS[1],
    },
    {
      max,
      label: 'High',
      color: DEFAULT_CHART_BULLET_RANGE_COLORS[2],
    },
  ];
}

// Linear ratio of value to max, clamped to [0, 1]. Returns
// 0 when value is non-finite, negative, or when max <= 0.
export function getBulletRatio(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  if (value <= 0) return 0;
  if (value >= max) return 1;
  return value / max;
}

// Build evenly-spaced numeric ticks across [0, max]. Returns
// at least `count` ticks (default 5) including both endpoints.
export function getBulletTicks(
  max: number,
  count: number = DEFAULT_CHART_BULLET_TICK_COUNT,
): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const safeCount = Math.max(2, Math.floor(count));
  const step = max / (safeCount - 1);
  const ticks: number[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    ticks.push(i * step);
  }
  return ticks;
}

// Sort ranges ascending by max so the painter starts with
// the largest band, then layers smaller bands on top. The
// caller decides which order to render in but the helper
// returns a deterministic ascending list.
export function sortBulletRangesAscending(
  ranges: readonly ChartBulletRange[],
): ChartBulletRange[] {
  return [...ranges].sort((a, b) => a.max - b.max);
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartBullet = forwardRef(function ChartBullet(
  {
    value,
    target,
    ranges,
    max: maxOverride,
    label,
    subLabel,
    width = DEFAULT_CHART_BULLET_WIDTH,
    height = DEFAULT_CHART_BULLET_HEIGHT,
    orientation = 'horizontal',
    measureColor = DEFAULT_CHART_BULLET_MEASURE_COLOR,
    targetColor = DEFAULT_CHART_BULLET_TARGET_COLOR,
    showAxisTicks = true,
    tickCount = DEFAULT_CHART_BULLET_TICK_COUNT,
    formatValue,
    ariaLabel,
    className,
    measureThickness = DEFAULT_CHART_BULLET_MEASURE_THICKNESS,
    animate = true,
  }: ChartBulletProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const max = useMemo(
    () => getBulletMax(value, target, ranges, maxOverride),
    [maxOverride, ranges, target, value],
  );
  const resolvedRanges = useMemo(
    () => sortBulletRangesAscending(ranges ?? getDefaultBulletRanges(max)),
    [max, ranges],
  );
  const ratio = useMemo(
    () => getBulletRatio(value, max),
    [max, value],
  );
  const ticks = useMemo(
    () => getBulletTicks(max, tickCount),
    [max, tickCount],
  );

  const isHorizontal = orientation === 'horizontal';
  const trackInset = 6;
  const trackWidth = Math.max(0, width - trackInset * 2);
  const trackHeight = Math.max(
    0,
    (showAxisTicks ? height - 14 : height) - trackInset,
  );
  const measureSpan = Math.max(
    0,
    (isHorizontal ? trackHeight : trackWidth) * measureThickness,
  );
  const measureOffset = isHorizontal
    ? trackInset + (trackHeight - measureSpan) / 2
    : trackInset + (trackWidth - measureSpan) / 2;

  const fmt = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const ariaValueText = useMemo(() => {
    const baseValue = fmt(value);
    if (target === undefined) return baseValue;
    return `${baseValue} of ${fmt(target)} target`;
    // formatValue captured implicitly via fmt
  }, [fmt, target, value]);

  const computedAriaLabel =
    ariaLabel ?? label ?? 'Bullet chart';

  return (
    <div
      ref={ref}
      role="progressbar"
      aria-label={computedAriaLabel}
      aria-valuenow={Number.isFinite(value) ? value : 0}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={ariaValueText}
      data-section="chart-bullet"
      data-orientation={orientation}
      data-animate={animate ? 'true' : 'false'}
      data-value={value}
      data-target={target ?? ''}
      data-max={max}
      data-ratio={ratio.toFixed(4)}
      className={cn('flex flex-col gap-1', className)}
    >
      {label || subLabel ? (
        <div
          data-section="chart-bullet-header"
          className="flex items-baseline justify-between gap-2"
        >
          <div className="flex flex-col">
            {label ? (
              <span
                data-section="chart-bullet-label"
                className="text-sm font-medium text-foreground"
              >
                {label}
              </span>
            ) : null}
            {subLabel ? (
              <span
                data-section="chart-bullet-sublabel"
                className="text-xs text-muted-foreground"
              >
                {subLabel}
              </span>
            ) : null}
          </div>
          <span
            data-section="chart-bullet-value"
            className="font-mono text-xs text-muted-foreground"
          >
            {fmt(value)}
            {target !== undefined ? (
              <span
                data-section="chart-bullet-target-text"
                className="ml-1"
              >
                / {fmt(target)}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-bullet-svg"
        className={cn(
          'h-auto w-full',
          animate && 'motion-safe:animate-fade-in',
        )}
      >
        {/* Qualitative range bands (largest -> smallest so
            smaller bands paint on top) */}
        {[...resolvedRanges]
          .sort((a, b) => b.max - a.max)
          .map((range, idx) => {
            const rRatio = getBulletRatio(range.max, max);
            const fill =
              range.color ??
              DEFAULT_CHART_BULLET_RANGE_COLORS[
                Math.min(
                  resolvedRanges.length - 1 - idx,
                  DEFAULT_CHART_BULLET_RANGE_COLORS.length - 1,
                )
              ];
            if (isHorizontal) {
              return (
                <rect
                  key={`range-${range.label ?? idx}-${range.max}`}
                  data-section="chart-bullet-range"
                  data-range-label={range.label ?? ''}
                  data-range-max={range.max}
                  data-range-ratio={rRatio.toFixed(4)}
                  x={trackInset}
                  y={trackInset}
                  width={trackWidth * rRatio}
                  height={trackHeight}
                  fill={fill}
                />
              );
            }
            const bandHeight = trackHeight * rRatio;
            return (
              <rect
                key={`range-${range.label ?? idx}-${range.max}`}
                data-section="chart-bullet-range"
                data-range-label={range.label ?? ''}
                data-range-max={range.max}
                data-range-ratio={rRatio.toFixed(4)}
                x={trackInset}
                y={trackInset + trackHeight - bandHeight}
                width={trackWidth}
                height={bandHeight}
                fill={fill}
              />
            );
          })}
        {/* Measure bar */}
        {isHorizontal ? (
          <rect
            data-section="chart-bullet-measure"
            data-value={value}
            data-ratio={ratio.toFixed(4)}
            x={trackInset}
            y={measureOffset}
            width={trackWidth * ratio}
            height={measureSpan}
            fill={measureColor}
            rx={2}
            ry={2}
          />
        ) : (
          <rect
            data-section="chart-bullet-measure"
            data-value={value}
            data-ratio={ratio.toFixed(4)}
            x={measureOffset}
            y={trackInset + trackHeight - trackHeight * ratio}
            width={measureSpan}
            height={trackHeight * ratio}
            fill={measureColor}
            rx={2}
            ry={2}
          />
        )}
        {/* Target marker */}
        {target !== undefined && Number.isFinite(target) ? (
          isHorizontal ? (
            <line
              data-section="chart-bullet-target"
              data-target={target}
              data-target-ratio={getBulletRatio(target, max).toFixed(4)}
              x1={trackInset + trackWidth * getBulletRatio(target, max)}
              x2={trackInset + trackWidth * getBulletRatio(target, max)}
              y1={trackInset + 1}
              y2={trackInset + trackHeight - 1}
              stroke={targetColor}
              strokeWidth={3}
              strokeLinecap="round"
            />
          ) : (
            <line
              data-section="chart-bullet-target"
              data-target={target}
              data-target-ratio={getBulletRatio(target, max).toFixed(4)}
              x1={trackInset + 1}
              x2={trackInset + trackWidth - 1}
              y1={
                trackInset +
                trackHeight -
                trackHeight * getBulletRatio(target, max)
              }
              y2={
                trackInset +
                trackHeight -
                trackHeight * getBulletRatio(target, max)
              }
              stroke={targetColor}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )
        ) : null}
        {/* Tick labels */}
        {showAxisTicks
          ? ticks.map((t, idx) => {
              const r = getBulletRatio(t, max);
              if (isHorizontal) {
                const x = trackInset + trackWidth * r;
                return (
                  <text
                    key={`tick-${idx}`}
                    data-section="chart-bullet-tick"
                    data-tick-value={t}
                    x={x}
                    y={height - 2}
                    textAnchor={
                      idx === 0
                        ? 'start'
                        : idx === ticks.length - 1
                          ? 'end'
                          : 'middle'
                    }
                    fontSize={10}
                    fill="currentColor"
                    fillOpacity={0.6}
                  >
                    {fmt(t)}
                  </text>
                );
              }
              const y =
                trackInset + trackHeight - trackHeight * r;
              return (
                <text
                  key={`tick-${idx}`}
                  data-section="chart-bullet-tick"
                  data-tick-value={t}
                  x={width - 2}
                  y={y}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.6}
                >
                  {fmt(t)}
                </text>
              );
            })
          : null}
      </svg>
    </div>
  );
});

ChartBullet.displayName = 'ChartBullet';
