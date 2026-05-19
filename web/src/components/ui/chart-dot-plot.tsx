import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { getBoxplotQuantile } from './chart-boxplot';

// (v1.11.483, TODO 11.465) ChartDotPlot primitive.
//
// Pure-SVG dot plot for categorical-numeric data. Each
// category gets a vertical slot; every data point in that
// category renders as a circle at the value's y position.
// Optional deterministic jitter spreads overlapping dots
// horizontally; optional median tick draws a short
// horizontal segment at each category's median. Hover a
// dot to surface its category + value.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartDotPlotCategory {
  id: string;
  label: string;
  values: readonly number[];
  color?: string;
}

export interface ChartDotPlotProps {
  categories: readonly ChartDotPlotCategory[];
  width?: number;
  height?: number;
  padding?: number;
  dotRadius?: number;
  jitter?: number;
  jitterSeed?: number;
  showMedianTick?: boolean;
  medianTickWidth?: number;
  showLabels?: boolean;
  showAxisTicks?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  defaultDotColor?: string;
  dotOpacity?: number;
  tickCount?: number;
  legendPlacement?: 'right' | 'bottom';
  onDotClick?: (args: {
    category: ChartDotPlotCategory;
    categoryIndex: number;
    value: number;
    valueIndex: number;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_DOT_PLOT_WIDTH = 520;
export const DEFAULT_CHART_DOT_PLOT_HEIGHT = 320;
export const DEFAULT_CHART_DOT_PLOT_PADDING = 36;
export const DEFAULT_CHART_DOT_PLOT_DOT_RADIUS = 3.5;
export const DEFAULT_CHART_DOT_PLOT_JITTER = 0.35;
export const DEFAULT_CHART_DOT_PLOT_JITTER_SEED = 1;
export const DEFAULT_CHART_DOT_PLOT_DOT_COLOR = '#2563eb';
export const DEFAULT_CHART_DOT_PLOT_DOT_OPACITY = 0.7;
export const DEFAULT_CHART_DOT_PLOT_MEDIAN_TICK_WIDTH = 0.65;
export const DEFAULT_CHART_DOT_PLOT_TICK_COUNT = 5;

// Compute the chart-wide y min/max across every category.
// Non-finite values are dropped. Falls back to (0, 1) when
// no finite value is present. Collapsed range expands by
// +/- 0.5 so the chart still renders.
export function getDotPlotBounds(
  categories: readonly ChartDotPlotCategory[],
): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const c of categories) {
    for (const v of c.values) {
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

// Compute the median of a category's values. Non-finite
// values are dropped first. Empty input returns null so
// the caller can suppress the median tick.
export function getDotPlotCategoryMedian(
  values: readonly number[],
): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return null;
  const sorted = [...finite].sort((a, b) => a - b);
  return getBoxplotQuantile(sorted, 0.5);
}

// Mulberry32-style deterministic pseudo-random based on
// (seed, idx). Returns a value in [0, 1). Same inputs
// always produce the same output so adopters can rely on
// snapshots / E2E tests not flapping.
export function getDotPlotPseudoRandom(
  seed: number,
  index: number,
): number {
  const safeSeed = Number.isFinite(seed) ? seed : 0;
  let x =
    (((safeSeed | 0) + index * 0x9e3779b9) | 0) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}

// Compute the per-dot horizontal jitter offset (in px).
// `jitter` is a fraction of `slotWidth` (e.g., 0.3 gives
// up to +/- 15% of the slot). Returns 0 when jitter <= 0
// or slotWidth <= 0 so callers can pass through safely.
export function getDotPlotJitterOffset(
  seed: number,
  index: number,
  jitter: number,
  slotWidth: number,
): number {
  if (
    !Number.isFinite(jitter) ||
    jitter <= 0 ||
    !Number.isFinite(slotWidth) ||
    slotWidth <= 0
  ) {
    return 0;
  }
  const r = getDotPlotPseudoRandom(seed, index);
  return (r - 0.5) * jitter * slotWidth;
}

// Evenly-spaced numeric ticks across [min, max].
export function getDotPlotTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_DOT_PLOT_TICK_COUNT,
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
export function describeDotPlot(
  categories: readonly ChartDotPlotCategory[],
  formatValue?: (v: number) => string,
): string {
  if (categories.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const parts = categories.map((c) => {
    const median = getDotPlotCategoryMedian(c.values);
    const n = c.values.filter((v) => Number.isFinite(v)).length;
    return `${c.label} n=${n}${median !== null ? `, median ${fv(median)}` : ''}`;
  });
  return `Dot plot with ${categories.length} categories. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartDotPlot = forwardRef(function ChartDotPlot(
  {
    categories,
    width = DEFAULT_CHART_DOT_PLOT_WIDTH,
    height = DEFAULT_CHART_DOT_PLOT_HEIGHT,
    padding = DEFAULT_CHART_DOT_PLOT_PADDING,
    dotRadius = DEFAULT_CHART_DOT_PLOT_DOT_RADIUS,
    jitter = DEFAULT_CHART_DOT_PLOT_JITTER,
    jitterSeed = DEFAULT_CHART_DOT_PLOT_JITTER_SEED,
    showMedianTick = true,
    medianTickWidth = DEFAULT_CHART_DOT_PLOT_MEDIAN_TICK_WIDTH,
    showLabels = true,
    showAxisTicks = true,
    showTooltip = true,
    showLegend = false,
    animate = true,
    className,
    ariaLabel = 'Dot plot',
    ariaDescription,
    formatValue,
    defaultDotColor = DEFAULT_CHART_DOT_PLOT_DOT_COLOR,
    dotOpacity = DEFAULT_CHART_DOT_PLOT_DOT_OPACITY,
    tickCount = DEFAULT_CHART_DOT_PLOT_TICK_COUNT,
    legendPlacement = 'right',
    onDotClick,
  }: ChartDotPlotProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const bounds = useMemo(
    () => getDotPlotBounds(categories),
    [categories],
  );
  const ticks = useMemo(
    () => getDotPlotTicks(bounds.min, bounds.max, tickCount),
    [bounds.max, bounds.min, tickCount],
  );

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showLabels ? 18 : 0) - 4,
  );
  const slotWidth =
    categories.length > 0
      ? innerWidth / categories.length
      : 0;
  const medianHalfWidth = Math.max(
    1,
    (slotWidth * Math.max(0, Math.min(1, medianTickWidth))) / 2,
  );

  const span = bounds.max - bounds.min;
  const yFor = useCallback(
    (v: number) => {
      if (span <= 0) return padding + innerHeight;
      const ratio = (v - bounds.min) / span;
      return padding + innerHeight - innerHeight * ratio;
    },
    [bounds.min, innerHeight, padding, span],
  );

  const description = useMemo(
    () =>
      ariaDescription ?? describeDotPlot(categories, formatValue),
    [ariaDescription, categories, formatValue],
  );

  const [hovered, setHovered] = useState<{
    categoryIndex: number;
    valueIndex: number;
  } | null>(null);

  const handleEnter = useCallback(
    (categoryIndex: number, valueIndex: number) => {
      setHovered({ categoryIndex, valueIndex });
    },
    [],
  );
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const hoveredCategory =
    hovered ? categories[hovered.categoryIndex] : null;
  const hoveredValue =
    hovered && hoveredCategory
      ? hoveredCategory.values[hovered.valueIndex]
      : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-dot-plot"
      data-category-count={categories.length}
      data-jitter={jitter}
      data-jitter-seed={jitterSeed}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'flex w-full items-start gap-4',
        legendPlacement === 'bottom' && 'flex-col items-stretch',
        className,
      )}
      style={{ width }}
    >
      <div
        data-section="chart-dot-plot-canvas"
        className="relative shrink-0"
        style={{ width, height }}
      >
        <span
          data-section="chart-dot-plot-aria-desc"
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
          data-section="chart-dot-plot-svg"
          className="h-auto w-full"
        >
          {/* Y axis */}
          <line
            aria-hidden="true"
            data-section="chart-dot-plot-axis-y"
            x1={padding}
            y1={padding}
            x2={padding}
            y2={padding + innerHeight}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          {/* Axis ticks + grid lines */}
          {showAxisTicks
            ? ticks.map((t, idx) => {
                const y = yFor(t);
                return (
                  <g
                    key={`tick-${idx}`}
                    data-section="chart-dot-plot-tick"
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
                      data-section="chart-dot-plot-tick-label"
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
          {/* Per-category groups */}
          {categories.map((cat, ci) => {
            const centerX = padding + ci * slotWidth + slotWidth / 2;
            const color = cat.color ?? defaultDotColor;
            const median = getDotPlotCategoryMedian(cat.values);
            return (
              <g
                key={cat.id}
                data-section="chart-dot-plot-category"
                data-category-id={cat.id}
                data-category-index={ci}
                data-category-color={color}
                data-category-count={cat.values.length}
                data-category-median={
                  median !== null ? median : ''
                }
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                {/* Median tick */}
                {showMedianTick && median !== null ? (
                  <line
                    aria-hidden="true"
                    data-section="chart-dot-plot-median"
                    data-category-id={cat.id}
                    data-median-value={median}
                    x1={centerX - medianHalfWidth}
                    y1={yFor(median)}
                    x2={centerX + medianHalfWidth}
                    y2={yFor(median)}
                    stroke="#0f172a"
                    strokeWidth={2}
                    strokeOpacity={0.85}
                  />
                ) : null}
                {/* Dots */}
                {cat.values.map((value, vi) => {
                  if (!Number.isFinite(value)) return null;
                  const offset = getDotPlotJitterOffset(
                    jitterSeed,
                    ci * 1000 + vi,
                    jitter,
                    slotWidth,
                  );
                  const x = centerX + offset;
                  const y = yFor(value);
                  const isHovered =
                    hovered?.categoryIndex === ci &&
                    hovered?.valueIndex === vi;
                  return (
                    <circle
                      key={`dot-${cat.id}-${vi}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${cat.label}: ${fv(value)}`}
                      data-section="chart-dot-plot-dot"
                      data-category-id={cat.id}
                      data-value-index={vi}
                      data-value={value}
                      data-hovered={isHovered ? 'true' : 'false'}
                      cx={x}
                      cy={y}
                      r={isHovered ? dotRadius + 1 : dotRadius}
                      fill={color}
                      fillOpacity={isHovered ? 1 : dotOpacity}
                      stroke={isHovered ? '#0f172a' : '#ffffff'}
                      strokeWidth={isHovered ? 1.5 : 0.75}
                      onMouseEnter={() => handleEnter(ci, vi)}
                      onMouseLeave={handleLeave}
                      onFocus={() => handleEnter(ci, vi)}
                      onBlur={handleLeave}
                      onClick={
                        onDotClick
                          ? () =>
                              onDotClick({
                                category: cat,
                                categoryIndex: ci,
                                value,
                                valueIndex: vi,
                              })
                          : undefined
                      }
                      style={{
                        cursor: onDotClick
                          ? 'pointer'
                          : 'default',
                      }}
                    />
                  );
                })}
                {/* Category label */}
                {showLabels ? (
                  <text
                    aria-hidden="true"
                    data-section="chart-dot-plot-label"
                    data-category-id={cat.id}
                    x={centerX}
                    y={padding + innerHeight + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="currentColor"
                    fillOpacity={0.75}
                  >
                    {cat.label}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        {showTooltip &&
        hoveredCategory &&
        hovered !== null &&
        typeof hoveredValue === 'number' &&
        Number.isFinite(hoveredValue) ? (
          <div
            role="tooltip"
            data-section="chart-dot-plot-tooltip"
            data-category-id={hoveredCategory.id}
            data-value-index={hovered.valueIndex}
            style={{
              left:
                padding +
                hovered.categoryIndex * slotWidth +
                slotWidth / 2 +
                10,
              top: yFor(hoveredValue) - 8,
            }}
            className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
          >
            <div
              data-section="chart-dot-plot-tooltip-label"
              className="font-medium"
            >
              {hoveredCategory.label}
            </div>
            <div
              data-section="chart-dot-plot-tooltip-value"
              className="font-mono"
            >
              {fv(hoveredValue)}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend && categories.length > 0 ? (
        <ul
          data-section="chart-dot-plot-legend"
          data-placement={legendPlacement}
          className={cn(
            'flex flex-col gap-1 text-xs',
            legendPlacement === 'bottom' &&
              'flex-row flex-wrap gap-3',
          )}
        >
          {categories.map((cat) => (
            <li
              key={cat.id}
              data-section="chart-dot-plot-legend-item"
              data-category-id={cat.id}
              className="flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                data-section="chart-dot-plot-legend-swatch"
                className="inline-block h-3 w-3 rounded-full"
                style={{
                  background: cat.color ?? defaultDotColor,
                }}
              />
              <span
                data-section="chart-dot-plot-legend-label"
                className="text-foreground"
              >
                {cat.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});

ChartDotPlot.displayName = 'ChartDotPlot';
