import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.475, TODO 11.457) ChartBoxplot primitive.
//
// Pure-SVG box-and-whisker plot (Tukey). Each series's data
// renders as one box from Q1 to Q3 (interquartile range)
// with a median line, whiskers extending to the lowest and
// highest non-outlier values (default 1.5 * IQR fence),
// and outlier dots beyond the whiskers. Hovering a box
// opens a tooltip with the five-number summary plus mean
// and outlier count.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartBoxplotSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
}

export interface ChartBoxplotProps {
  series: readonly ChartBoxplotSeries[];
  width?: number;
  height?: number;
  padding?: number;
  boxGap?: number;
  outlierMultiplier?: number;
  showLabels?: boolean;
  showOutliers?: boolean;
  showMean?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  defaultBoxColor?: string;
  tickCount?: number;
  onBoxClick?: (args: {
    series: ChartBoxplotSeries;
    index: number;
    stats: BoxplotStats;
  }) => void;
}

export interface BoxplotStats {
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  mean: number;
  lowerWhisker: number;
  upperWhisker: number;
  outliers: number[];
  count: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_BOXPLOT_WIDTH = 560;
export const DEFAULT_CHART_BOXPLOT_HEIGHT = 320;
export const DEFAULT_CHART_BOXPLOT_PADDING = 40;
export const DEFAULT_CHART_BOXPLOT_BOX_GAP = 16;
export const DEFAULT_CHART_BOXPLOT_OUTLIER_MULTIPLIER = 1.5;
export const DEFAULT_CHART_BOXPLOT_TICK_COUNT = 5;
export const DEFAULT_CHART_BOXPLOT_BOX_COLOR = '#2563eb';

// Quantile from an ascending-sorted array. Uses linear
// interpolation between adjacent values (R-7 / Excel
// default). Returns 0 for empty arrays.
export function getBoxplotQuantile(
  sorted: readonly number[],
  q: number,
): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const clampedQ = Math.max(0, Math.min(1, q));
  const idx = clampedQ * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (idx - lo) * (sorted[hi]! - sorted[lo]!);
}

// Compute the five-number summary plus mean, whisker
// bounds, and outliers for a data series. Non-finite
// values are dropped. Empty / all-non-finite series fall
// back to zeros.
export function getBoxplotStats(
  data: readonly number[],
  outlierMultiplier: number = DEFAULT_CHART_BOXPLOT_OUTLIER_MULTIPLIER,
): BoxplotStats {
  const finite = data.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return {
      min: 0,
      q1: 0,
      median: 0,
      q3: 0,
      max: 0,
      mean: 0,
      lowerWhisker: 0,
      upperWhisker: 0,
      outliers: [],
      count: 0,
    };
  }
  const sorted = [...finite].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const q1 = getBoxplotQuantile(sorted, 0.25);
  const median = getBoxplotQuantile(sorted, 0.5);
  const q3 = getBoxplotQuantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - outlierMultiplier * iqr;
  const upperFence = q3 + outlierMultiplier * iqr;
  // Whiskers: min/max value within the fences
  let lowerWhisker = sorted[0]!;
  for (const v of sorted) {
    if (v >= lowerFence) {
      lowerWhisker = v;
      break;
    }
  }
  let upperWhisker = sorted[sorted.length - 1]!;
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i]! <= upperFence) {
      upperWhisker = sorted[i]!;
      break;
    }
  }
  const outliers = sorted.filter(
    (v) => v < lowerFence || v > upperFence,
  );
  let sum = 0;
  for (const v of sorted) sum += v;
  const mean = sum / sorted.length;
  return {
    min,
    q1,
    median,
    q3,
    max,
    mean,
    lowerWhisker,
    upperWhisker,
    outliers,
    count: sorted.length,
  };
}

// Chart-wide vertical bounds across every series. Falls
// back to (0, 1) when no finite data is present.
export function getBoxplotBounds(
  series: readonly ChartBoxplotSeries[],
): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const v of s.data) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) return { min: min - 0.5, max: max + 0.5 };
  return { min, max };
}

// Evenly-spaced numeric ticks across [min, max].
export function getBoxplotTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_BOXPLOT_TICK_COUNT,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max <= min) return [min];
  const safeCount = Math.max(2, Math.floor(count));
  const step = (max - min) / (safeCount - 1);
  const out: number[] = [];
  for (let i = 0; i < safeCount; i += 1) out.push(min + i * step);
  return out;
}

// One-line ARIA summary.
export function describeBoxplotChart(
  series: readonly ChartBoxplotSeries[],
  formatValue?: (v: number) => string,
): string {
  if (series.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const parts = series.map((s) => {
    const stats = getBoxplotStats(s.data);
    return `${s.label} median ${fv(stats.median)} IQR ${fv(stats.q1)}-${fv(stats.q3)}`;
  });
  return `Box plot with ${series.length} series. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartBoxplot = forwardRef(function ChartBoxplot(
  {
    series,
    width = DEFAULT_CHART_BOXPLOT_WIDTH,
    height = DEFAULT_CHART_BOXPLOT_HEIGHT,
    padding = DEFAULT_CHART_BOXPLOT_PADDING,
    boxGap = DEFAULT_CHART_BOXPLOT_BOX_GAP,
    outlierMultiplier = DEFAULT_CHART_BOXPLOT_OUTLIER_MULTIPLIER,
    showLabels = true,
    showOutliers = true,
    showMean = true,
    showTooltip = true,
    showAxisTicks = true,
    animate = true,
    className,
    ariaLabel = 'Box plot',
    ariaDescription,
    formatValue,
    defaultBoxColor = DEFAULT_CHART_BOXPLOT_BOX_COLOR,
    tickCount = DEFAULT_CHART_BOXPLOT_TICK_COUNT,
    onBoxClick,
  }: ChartBoxplotProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const stats = useMemo(
    () => series.map((s) => getBoxplotStats(s.data, outlierMultiplier)),
    [outlierMultiplier, series],
  );
  const bounds = useMemo(() => getBoxplotBounds(series), [series]);
  const ticks = useMemo(
    () => getBoxplotTicks(bounds.min, bounds.max, tickCount),
    [bounds.max, bounds.min, tickCount],
  );

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showLabels ? 18 : 0) - 4,
  );

  const seriesCount = series.length;
  const slotWidth =
    seriesCount > 0
      ? Math.max(
          1,
          (innerWidth - boxGap * Math.max(0, seriesCount - 1)) /
            seriesCount,
        )
      : 0;
  const boxWidth = Math.max(1, slotWidth * 0.6);

  const span = bounds.max - bounds.min;
  const yFor = useCallback(
    (v: number) => {
      if (span <= 0) return padding + innerHeight;
      const ratio = (v - bounds.min) / span;
      return padding + innerHeight - innerHeight * ratio;
    },
    [bounds.min, innerHeight, padding, span],
  );

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const description = useMemo(
    () =>
      ariaDescription ?? describeBoxplotChart(series, formatValue),
    [ariaDescription, formatValue, series],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const hoveredSeries = hovered !== null ? series[hovered] : null;
  const hoveredStats = hovered !== null ? stats[hovered] : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-boxplot"
      data-series-count={series.length}
      data-outlier-multiplier={outlierMultiplier}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-boxplot-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-boxplot-svg"
        className="h-auto w-full"
      >
        {/* Y axis */}
        <line
          aria-hidden="true"
          data-section="chart-boxplot-axis-y"
          x1={padding}
          y1={padding}
          x2={padding}
          y2={padding + innerHeight}
          stroke="currentColor"
          strokeOpacity={0.3}
        />
        {/* Ticks */}
        {showAxisTicks
          ? ticks.map((t, idx) => {
              const y = yFor(t);
              return (
                <g
                  key={`tick-${idx}`}
                  data-section="chart-boxplot-tick"
                  data-tick-value={t}
                >
                  <line
                    aria-hidden="true"
                    x1={padding}
                    y1={y}
                    x2={width - padding / 2}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.08}
                    strokeDasharray="2 4"
                  />
                  <text
                    aria-hidden="true"
                    data-section="chart-boxplot-tick-label"
                    x={padding - 4}
                    y={y}
                    textAnchor="end"
                    alignmentBaseline="middle"
                    fontSize={10}
                    fill="currentColor"
                    fillOpacity={0.65}
                  >
                    {fv(t)}
                  </text>
                </g>
              );
            })
          : null}
        {/* Boxes */}
        {series.map((s, i) => {
          const stat = stats[i]!;
          const slotX = padding + i * (slotWidth + boxGap);
          const centerX = slotX + slotWidth / 2;
          const boxLeft = centerX - boxWidth / 2;
          const boxRight = centerX + boxWidth / 2;
          const yQ1 = yFor(stat.q1);
          const yQ3 = yFor(stat.q3);
          const yMedian = yFor(stat.median);
          const yLowerW = yFor(stat.lowerWhisker);
          const yUpperW = yFor(stat.upperWhisker);
          const yMean = yFor(stat.mean);
          const color = s.color ?? defaultBoxColor;
          const isHovered = hovered === i;
          const boxHeight = Math.max(1, Math.abs(yQ1 - yQ3));
          const boxTop = Math.min(yQ1, yQ3);
          return (
            <g
              key={s.id}
              data-section="chart-boxplot-series"
              data-series-id={s.id}
              data-series-index={i}
              data-series-color={color}
              data-series-count={stat.count}
              data-series-median={stat.median}
              data-outlier-count={stat.outliers.length}
              data-hovered={isHovered ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              {/* Upper whisker line + cap */}
              <line
                aria-hidden="true"
                data-section="chart-boxplot-whisker-upper"
                x1={centerX}
                y1={yUpperW}
                x2={centerX}
                y2={yQ3}
                stroke={color}
                strokeWidth={1.2}
                strokeOpacity={0.85}
              />
              <line
                aria-hidden="true"
                data-section="chart-boxplot-whisker-cap-upper"
                x1={boxLeft + boxWidth * 0.2}
                y1={yUpperW}
                x2={boxRight - boxWidth * 0.2}
                y2={yUpperW}
                stroke={color}
                strokeWidth={1.2}
                strokeOpacity={0.85}
              />
              {/* Lower whisker line + cap */}
              <line
                aria-hidden="true"
                data-section="chart-boxplot-whisker-lower"
                x1={centerX}
                y1={yQ1}
                x2={centerX}
                y2={yLowerW}
                stroke={color}
                strokeWidth={1.2}
                strokeOpacity={0.85}
              />
              <line
                aria-hidden="true"
                data-section="chart-boxplot-whisker-cap-lower"
                x1={boxLeft + boxWidth * 0.2}
                y1={yLowerW}
                x2={boxRight - boxWidth * 0.2}
                y2={yLowerW}
                stroke={color}
                strokeWidth={1.2}
                strokeOpacity={0.85}
              />
              {/* IQR box */}
              <rect
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${s.label}: median ${fv(stat.median)}, Q1 ${fv(stat.q1)}, Q3 ${fv(stat.q3)}`}
                data-section="chart-boxplot-box"
                data-series-id={s.id}
                x={boxLeft}
                y={boxTop}
                width={boxWidth}
                height={boxHeight}
                fill={color}
                fillOpacity={isHovered ? 0.45 : 0.25}
                stroke={color}
                strokeWidth={isHovered ? 2 : 1.5}
                onMouseEnter={() => handleEnter(i)}
                onMouseLeave={handleLeave}
                onFocus={() => handleEnter(i)}
                onBlur={handleLeave}
                onClick={
                  onBoxClick
                    ? () =>
                        onBoxClick({
                          series: s,
                          index: i,
                          stats: stat,
                        })
                    : undefined
                }
                style={{
                  cursor: onBoxClick ? 'pointer' : 'default',
                }}
              />
              {/* Median line */}
              <line
                aria-hidden="true"
                data-section="chart-boxplot-median"
                x1={boxLeft}
                y1={yMedian}
                x2={boxRight}
                y2={yMedian}
                stroke={color}
                strokeWidth={2}
              />
              {/* Mean marker */}
              {showMean ? (
                <g
                  data-section="chart-boxplot-mean"
                  data-series-id={s.id}
                  data-mean-value={stat.mean}
                >
                  <line
                    aria-hidden="true"
                    x1={boxLeft + 2}
                    y1={yMean}
                    x2={boxRight - 2}
                    y2={yMean}
                    stroke={color}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    strokeOpacity={0.85}
                  />
                </g>
              ) : null}
              {/* Outlier dots */}
              {showOutliers
                ? stat.outliers.map((v, j) => (
                    <circle
                      key={`out-${i}-${j}`}
                      aria-hidden="true"
                      data-section="chart-boxplot-outlier"
                      data-series-id={s.id}
                      data-outlier-value={v}
                      cx={centerX}
                      cy={yFor(v)}
                      r={3}
                      fill={color}
                      fillOpacity={0.85}
                      stroke="#ffffff"
                      strokeWidth={0.5}
                    />
                  ))
                : null}
              {showLabels ? (
                <text
                  aria-hidden="true"
                  data-section="chart-boxplot-label"
                  data-series-id={s.id}
                  x={centerX}
                  y={padding + innerHeight + 12}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.8}
                >
                  {s.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {showTooltip && hoveredSeries && hoveredStats ? (
        <div
          role="tooltip"
          data-section="chart-boxplot-tooltip"
          data-series-id={hoveredSeries.id}
          style={{
            left:
              padding +
              (hovered ?? 0) * (slotWidth + boxGap) +
              slotWidth +
              8,
            top: yFor(hoveredStats.q3),
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-boxplot-tooltip-label"
            className="font-medium"
          >
            {hoveredSeries.label}
          </div>
          <div
            data-section="chart-boxplot-tooltip-min"
            className="font-mono text-muted-foreground"
          >
            min: {fv(hoveredStats.min)}
          </div>
          <div
            data-section="chart-boxplot-tooltip-q1"
            className="font-mono text-muted-foreground"
          >
            Q1: {fv(hoveredStats.q1)}
          </div>
          <div
            data-section="chart-boxplot-tooltip-median"
            className="font-mono"
          >
            median: {fv(hoveredStats.median)}
          </div>
          <div
            data-section="chart-boxplot-tooltip-q3"
            className="font-mono text-muted-foreground"
          >
            Q3: {fv(hoveredStats.q3)}
          </div>
          <div
            data-section="chart-boxplot-tooltip-max"
            className="font-mono text-muted-foreground"
          >
            max: {fv(hoveredStats.max)}
          </div>
          {showMean ? (
            <div
              data-section="chart-boxplot-tooltip-mean"
              className="font-mono text-muted-foreground"
            >
              mean: {fv(hoveredStats.mean)}
            </div>
          ) : null}
          {hoveredStats.outliers.length > 0 ? (
            <div
              data-section="chart-boxplot-tooltip-outliers"
              className="text-muted-foreground"
            >
              outliers: {hoveredStats.outliers.length}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ChartBoxplot.displayName = 'ChartBoxplot';
