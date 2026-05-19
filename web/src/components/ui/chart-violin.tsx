import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import {
  getBoxplotQuantile,
  getBoxplotStats,
} from './chart-boxplot';

// (v1.11.476, TODO 11.458) ChartViolin primitive.
//
// Pure-SVG violin plot. Each series renders as a violin
// silhouette mirrored around a vertical axis; the width at
// every y-position is proportional to the local kernel
// density estimate (Gaussian kernel + Silverman bandwidth).
// A median dot marks the centre; an optional inner box +
// whisker overlay overlays a mini-boxplot on the same axis.
// Hover tooltip surfaces median, Q1, Q3, and sample count.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartViolinSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
}

export interface ChartViolinProps {
  series: readonly ChartViolinSeries[];
  width?: number;
  height?: number;
  padding?: number;
  violinGap?: number;
  bandwidth?: number;
  resolution?: number;
  showMedian?: boolean;
  showInnerBox?: boolean;
  showLabels?: boolean;
  showAxisTicks?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  defaultViolinColor?: string;
  tickCount?: number;
  onViolinClick?: (args: {
    series: ChartViolinSeries;
    index: number;
    stats: ViolinStats;
  }) => void;
}

export interface ViolinStats {
  median: number;
  q1: number;
  q3: number;
  min: number;
  max: number;
  mean: number;
  count: number;
  bandwidth: number;
  density: ViolinDensityPoint[];
  maxDensity: number;
}

export interface ViolinDensityPoint {
  y: number;
  density: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_VIOLIN_WIDTH = 560;
export const DEFAULT_CHART_VIOLIN_HEIGHT = 320;
export const DEFAULT_CHART_VIOLIN_PADDING = 40;
export const DEFAULT_CHART_VIOLIN_GAP = 16;
export const DEFAULT_CHART_VIOLIN_RESOLUTION = 64;
export const DEFAULT_CHART_VIOLIN_TICK_COUNT = 5;
export const DEFAULT_CHART_VIOLIN_COLOR = '#2563eb';

// Standard Gaussian kernel.
export function gaussianKernel(u: number): number {
  if (!Number.isFinite(u)) return 0;
  return Math.exp(-(u * u) / 2) / Math.sqrt(2 * Math.PI);
}

// Population standard deviation of an array.
export function getViolinStdDev(
  data: readonly number[],
): number {
  const finite = data.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return 0;
  let sum = 0;
  for (const v of finite) sum += v;
  const mean = sum / finite.length;
  let varSum = 0;
  for (const v of finite) varSum += (v - mean) * (v - mean);
  return Math.sqrt(varSum / finite.length);
}

// Silverman's rule-of-thumb bandwidth.
// h = 1.06 * sigma * n^(-1/5).
export function silvermanBandwidth(
  data: readonly number[],
): number {
  const finite = data.filter((v) => Number.isFinite(v));
  if (finite.length < 2) return 1;
  const sigma = getViolinStdDev(finite);
  if (sigma <= 0) return 1;
  return 1.06 * sigma * Math.pow(finite.length, -1 / 5);
}

// Evaluate KDE at every point in `evalPoints` using a
// Gaussian kernel. Returns an array of density values
// matching `evalPoints` in order.
export function computeKDE(
  data: readonly number[],
  evalPoints: readonly number[],
  bandwidth: number,
): number[] {
  const finite = data.filter((v) => Number.isFinite(v));
  const h =
    Number.isFinite(bandwidth) && bandwidth > 0
      ? bandwidth
      : 1;
  if (finite.length === 0) {
    return evalPoints.map(() => 0);
  }
  return evalPoints.map((y) => {
    let sum = 0;
    for (const x of finite) {
      sum += gaussianKernel((y - x) / h);
    }
    return sum / (finite.length * h);
  });
}

// Build evenly-spaced y-axis evaluation points between
// [min, max]. Density points fall back to a single point
// when min === max.
export function getViolinEvalPoints(
  min: number,
  max: number,
  resolution: number = DEFAULT_CHART_VIOLIN_RESOLUTION,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) return [min];
  const n = Math.max(2, Math.floor(resolution));
  const step = (max - min) / (n - 1);
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(min + i * step);
  return out;
}

// Compute the full violin stats for a single series.
export function getViolinStats(
  data: readonly number[],
  options: {
    bandwidth?: number;
    resolution?: number;
    rangeMin?: number;
    rangeMax?: number;
  } = {},
): ViolinStats {
  const finite = data.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return {
      median: 0,
      q1: 0,
      q3: 0,
      min: 0,
      max: 0,
      mean: 0,
      count: 0,
      bandwidth: 1,
      density: [],
      maxDensity: 0,
    };
  }
  const sorted = [...finite].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const median = getBoxplotQuantile(sorted, 0.5);
  const q1 = getBoxplotQuantile(sorted, 0.25);
  const q3 = getBoxplotQuantile(sorted, 0.75);
  let sum = 0;
  for (const v of sorted) sum += v;
  const mean = sum / sorted.length;
  const h =
    options.bandwidth !== undefined &&
    Number.isFinite(options.bandwidth) &&
    options.bandwidth > 0
      ? options.bandwidth
      : silvermanBandwidth(sorted);
  const rMin =
    options.rangeMin !== undefined &&
    Number.isFinite(options.rangeMin)
      ? options.rangeMin
      : min;
  const rMax =
    options.rangeMax !== undefined &&
    Number.isFinite(options.rangeMax)
      ? options.rangeMax
      : max;
  const evalPoints = getViolinEvalPoints(
    rMin,
    rMax,
    options.resolution ?? DEFAULT_CHART_VIOLIN_RESOLUTION,
  );
  const densities = computeKDE(sorted, evalPoints, h);
  let maxDensity = 0;
  for (const d of densities) {
    if (d > maxDensity) maxDensity = d;
  }
  const density: ViolinDensityPoint[] = evalPoints.map(
    (y, i) => ({ y, density: densities[i] ?? 0 }),
  );
  return {
    median,
    q1,
    q3,
    min,
    max,
    mean,
    count: sorted.length,
    bandwidth: h,
    density,
    maxDensity,
  };
}

// Chart-wide bounds across every series. Falls back to
// (0, 1) when no finite data is present.
export function getViolinBounds(
  series: readonly ChartViolinSeries[],
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
export function getViolinTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_VIOLIN_TICK_COUNT,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max <= min) return [min];
  const safeCount = Math.max(2, Math.floor(count));
  const step = (max - min) / (safeCount - 1);
  const out: number[] = [];
  for (let i = 0; i < safeCount; i += 1) out.push(min + i * step);
  return out;
}

// Build the SVG path for one mirrored violin silhouette.
// The right edge walks density top->bottom; the left edge
// mirrors back bottom->top.
export function buildViolinPath(
  density: readonly ViolinDensityPoint[],
  centerX: number,
  halfWidth: number,
  maxDensity: number,
  yFor: (v: number) => number,
): string {
  if (density.length === 0) return '';
  const scale = (d: number) =>
    maxDensity > 0
      ? (d / maxDensity) * halfWidth
      : 0;
  const right: string[] = [];
  for (let i = 0; i < density.length; i += 1) {
    const p = density[i]!;
    const x = centerX + scale(p.density);
    const y = yFor(p.y);
    right.push(
      `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`,
    );
  }
  const left: string[] = [];
  for (let i = density.length - 1; i >= 0; i -= 1) {
    const p = density[i]!;
    const x = centerX - scale(p.density);
    const y = yFor(p.y);
    left.push(`L ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `${right.join(' ')} ${left.join(' ')} Z`;
}

// One-line ARIA summary.
export function describeViolinChart(
  series: readonly ChartViolinSeries[],
  formatValue?: (v: number) => string,
): string {
  if (series.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const parts = series.map((s) => {
    const stats = getViolinStats(s.data);
    return `${s.label} median ${fv(stats.median)} n=${stats.count}`;
  });
  return `Violin plot with ${series.length} series. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartViolin = forwardRef(function ChartViolin(
  {
    series,
    width = DEFAULT_CHART_VIOLIN_WIDTH,
    height = DEFAULT_CHART_VIOLIN_HEIGHT,
    padding = DEFAULT_CHART_VIOLIN_PADDING,
    violinGap = DEFAULT_CHART_VIOLIN_GAP,
    bandwidth,
    resolution = DEFAULT_CHART_VIOLIN_RESOLUTION,
    showMedian = true,
    showInnerBox = true,
    showLabels = true,
    showAxisTicks = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Violin plot',
    ariaDescription,
    formatValue,
    defaultViolinColor = DEFAULT_CHART_VIOLIN_COLOR,
    tickCount = DEFAULT_CHART_VIOLIN_TICK_COUNT,
    onViolinClick,
  }: ChartViolinProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const bounds = useMemo(
    () => getViolinBounds(series),
    [series],
  );
  const ticks = useMemo(
    () => getViolinTicks(bounds.min, bounds.max, tickCount),
    [bounds.max, bounds.min, tickCount],
  );
  const stats = useMemo(
    () =>
      series.map((s) =>
        getViolinStats(s.data, {
          bandwidth,
          resolution,
          rangeMin: bounds.min,
          rangeMax: bounds.max,
        }),
      ),
    [bandwidth, bounds.max, bounds.min, resolution, series],
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
          (innerWidth - violinGap * Math.max(0, seriesCount - 1)) /
            seriesCount,
        )
      : 0;
  const violinHalfWidth = Math.max(1, slotWidth * 0.5);
  const boxHalfWidth = Math.max(1, slotWidth * 0.12);

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
      ariaDescription ?? describeViolinChart(series, formatValue),
    [ariaDescription, formatValue, series],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const hoveredSeries =
    hovered !== null ? series[hovered] : null;
  const hoveredStats =
    hovered !== null ? stats[hovered] : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-violin"
      data-series-count={series.length}
      data-resolution={resolution}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-violin-aria-desc"
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
        data-section="chart-violin-svg"
        className="h-auto w-full"
      >
        {/* Y axis */}
        <line
          aria-hidden="true"
          data-section="chart-violin-axis-y"
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
                  data-section="chart-violin-tick"
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
                    data-section="chart-violin-tick-label"
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
        {/* Violins */}
        {series.map((s, i) => {
          const stat = stats[i]!;
          const slotX = padding + i * (slotWidth + violinGap);
          const centerX = slotX + slotWidth / 2;
          const path = buildViolinPath(
            stat.density,
            centerX,
            violinHalfWidth,
            stat.maxDensity,
            yFor,
          );
          const color = s.color ?? defaultViolinColor;
          const isHovered = hovered === i;
          const yMedian = yFor(stat.median);
          const yQ1 = yFor(stat.q1);
          const yQ3 = yFor(stat.q3);
          const boxLeft = centerX - boxHalfWidth;
          const boxRight = centerX + boxHalfWidth;
          return (
            <g
              key={s.id}
              data-section="chart-violin-series"
              data-series-id={s.id}
              data-series-index={i}
              data-series-color={color}
              data-series-count={stat.count}
              data-series-median={stat.median}
              data-series-bandwidth={stat.bandwidth.toFixed(4)}
              data-hovered={isHovered ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${s.label}: median ${fv(stat.median)}, n=${stat.count}`}
                data-section="chart-violin-shape"
                data-series-id={s.id}
                d={path}
                fill={color}
                fillOpacity={isHovered ? 0.5 : 0.32}
                stroke={color}
                strokeWidth={isHovered ? 2 : 1.25}
                strokeLinejoin="round"
                onMouseEnter={() => handleEnter(i)}
                onMouseLeave={handleLeave}
                onFocus={() => handleEnter(i)}
                onBlur={handleLeave}
                onClick={
                  onViolinClick
                    ? () =>
                        onViolinClick({
                          series: s,
                          index: i,
                          stats: stat,
                        })
                    : undefined
                }
                style={{
                  cursor: onViolinClick
                    ? 'pointer'
                    : 'default',
                }}
              />
              {/* Inner box overlay (mini boxplot) */}
              {showInnerBox && stat.count > 0 ? (
                <g
                  data-section="chart-violin-inner-box"
                  data-series-id={s.id}
                  aria-hidden="true"
                >
                  <line
                    data-section="chart-violin-inner-whisker"
                    x1={centerX}
                    y1={yFor(stat.min)}
                    x2={centerX}
                    y2={yFor(stat.max)}
                    stroke="#0f172a"
                    strokeWidth={1}
                    strokeOpacity={0.85}
                  />
                  <rect
                    data-section="chart-violin-inner-iqr"
                    x={boxLeft}
                    y={Math.min(yQ1, yQ3)}
                    width={boxHalfWidth * 2}
                    height={Math.max(1, Math.abs(yQ1 - yQ3))}
                    fill="#0f172a"
                    fillOpacity={0.85}
                  />
                </g>
              ) : null}
              {/* Median dot */}
              {showMedian && stat.count > 0 ? (
                <circle
                  aria-hidden="true"
                  data-section="chart-violin-median"
                  data-series-id={s.id}
                  data-median-value={stat.median}
                  cx={centerX}
                  cy={yMedian}
                  r={3}
                  fill="#ffffff"
                  stroke="#0f172a"
                  strokeWidth={1}
                />
              ) : null}
              {showLabels ? (
                <text
                  aria-hidden="true"
                  data-section="chart-violin-label"
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
          data-section="chart-violin-tooltip"
          data-series-id={hoveredSeries.id}
          style={{
            left:
              padding +
              (hovered ?? 0) * (slotWidth + violinGap) +
              slotWidth +
              8,
            top: yFor(hoveredStats.q3),
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-violin-tooltip-label"
            className="font-medium"
          >
            {hoveredSeries.label}
          </div>
          <div
            data-section="chart-violin-tooltip-median"
            className="font-mono"
          >
            median: {fv(hoveredStats.median)}
          </div>
          <div
            data-section="chart-violin-tooltip-iqr"
            className="font-mono text-muted-foreground"
          >
            IQR: {fv(hoveredStats.q1)} - {fv(hoveredStats.q3)}
          </div>
          <div
            data-section="chart-violin-tooltip-range"
            className="font-mono text-muted-foreground"
          >
            range: {fv(hoveredStats.min)} - {fv(hoveredStats.max)}
          </div>
          <div
            data-section="chart-violin-tooltip-count"
            className="text-muted-foreground"
          >
            n: {hoveredStats.count}
          </div>
        </div>
      ) : null}
    </div>
  );
});

ChartViolin.displayName = 'ChartViolin';

// Re-export the BoxplotStats helper for adopters who need
// the underlying summary without going through the full
// component. (Aliased here so the violin shape can be
// composed alongside <ChartBoxplot> without a second
// import.)
export { getBoxplotStats };
