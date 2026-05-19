import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.474, TODO 11.456) ChartPareto primitive.
//
// Pure-SVG Pareto chart: categories sorted by value
// descending render as bars (left axis), overlaid by a
// cumulative percentage line (right axis 0..100%). A
// dashed reference line at the configured Pareto threshold
// (default 80%) highlights the vital few. Per-bar tooltip
// shows label + value + cumulative percent.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartParetoCategory {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartParetoProps {
  categories: readonly ChartParetoCategory[];
  width?: number;
  height?: number;
  padding?: number;
  barGap?: number;
  paretoThreshold?: number;
  showBars?: boolean;
  showLine?: boolean;
  showThreshold?: boolean;
  showLabels?: boolean;
  showLeftAxis?: boolean;
  showRightAxis?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (v: number) => string;
  defaultBarColor?: string;
  lineColor?: string;
  thresholdColor?: string;
  tickCount?: number;
  onBarClick?: (args: {
    category: ChartParetoCategory;
    index: number;
    cumulativePercent: number;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_PARETO_WIDTH = 600;
export const DEFAULT_CHART_PARETO_HEIGHT = 320;
export const DEFAULT_CHART_PARETO_PADDING = 40;
export const DEFAULT_CHART_PARETO_BAR_GAP = 6;
export const DEFAULT_CHART_PARETO_THRESHOLD = 0.8;
export const DEFAULT_CHART_PARETO_TICK_COUNT = 5;
export const DEFAULT_CHART_PARETO_BAR_COLOR = '#2563eb';
export const DEFAULT_CHART_PARETO_LINE_COLOR = '#dc2626';
export const DEFAULT_CHART_PARETO_THRESHOLD_COLOR = '#f59e0b';

// Sort categories by value descending. Non-finite and
// non-positive values are dropped because Pareto only
// describes positive accumulations.
export function sortParetoCategoriesDesc(
  categories: readonly ChartParetoCategory[],
): ChartParetoCategory[] {
  const positive = categories.filter(
    (c) => Number.isFinite(c.value) && c.value > 0,
  );
  return positive.slice().sort((a, b) => b.value - a.value);
}

// Sum of category values. Empty / all-non-positive -> 0.
export function getParetoTotal(
  categories: readonly ChartParetoCategory[],
): number {
  let total = 0;
  for (const c of categories) {
    if (Number.isFinite(c.value) && c.value > 0) total += c.value;
  }
  return total;
}

// Running cumulative sum array (same length as input).
export function getParetoCumulative(
  categories: readonly ChartParetoCategory[],
): number[] {
  const out: number[] = [];
  let running = 0;
  for (const c of categories) {
    if (Number.isFinite(c.value) && c.value > 0) {
      running += c.value;
    }
    out.push(running);
  }
  return out;
}

// Cumulative as fraction of total in [0, 1]. Returns an
// array of zeros when total is 0.
export function getParetoCumulativePercent(
  categories: readonly ChartParetoCategory[],
): number[] {
  const total = getParetoTotal(categories);
  if (total <= 0) {
    return categories.map(() => 0);
  }
  const cum = getParetoCumulative(categories);
  return cum.map((v) => Math.max(0, Math.min(1, v / total)));
}

// Index of the first bar where cumulative percent crosses
// the threshold (0..1). Returns -1 when nothing crosses.
export function findParetoThresholdIndex(
  cumulativePercent: readonly number[],
  threshold: number,
): number {
  if (!Number.isFinite(threshold)) return -1;
  const t = Math.max(0, Math.min(1, threshold));
  for (let i = 0; i < cumulativePercent.length; i += 1) {
    if ((cumulativePercent[i] ?? 0) >= t) return i;
  }
  return -1;
}

// Evenly-spaced numeric ticks across [0, max] (or
// [0, 100] for percent axis).
export function getParetoTicks(
  max: number,
  count: number = DEFAULT_CHART_PARETO_TICK_COUNT,
): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0];
  const safeCount = Math.max(2, Math.floor(count));
  const step = max / (safeCount - 1);
  const out: number[] = [];
  for (let i = 0; i < safeCount; i += 1) out.push(i * step);
  return out;
}

// One-line ARIA summary.
export function describeParetoChart(
  categories: readonly ChartParetoCategory[],
  threshold: number,
  formatValue?: (v: number) => string,
  formatPercent?: (v: number) => string,
): string {
  if (categories.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const fp = (v: number) =>
    formatPercent
      ? formatPercent(v)
      : `${(v * 100).toFixed(1)}%`;
  const sorted = sortParetoCategoriesDesc(categories);
  if (sorted.length === 0) return 'No data';
  const cum = getParetoCumulativePercent(sorted);
  const tIdx = findParetoThresholdIndex(cum, threshold);
  const vitalFew =
    tIdx >= 0
      ? sorted
          .slice(0, tIdx + 1)
          .map((c) => c.label)
          .join(', ')
      : 'none reach threshold';
  const total = getParetoTotal(sorted);
  return `Pareto chart with ${sorted.length} categories. Total ${fv(total)}. Vital few (>= ${fp(threshold)}): ${vitalFew}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartPareto = forwardRef(function ChartPareto(
  {
    categories,
    width = DEFAULT_CHART_PARETO_WIDTH,
    height = DEFAULT_CHART_PARETO_HEIGHT,
    padding = DEFAULT_CHART_PARETO_PADDING,
    barGap = DEFAULT_CHART_PARETO_BAR_GAP,
    paretoThreshold = DEFAULT_CHART_PARETO_THRESHOLD,
    showBars = true,
    showLine = true,
    showThreshold = true,
    showLabels = true,
    showLeftAxis = true,
    showRightAxis = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Pareto chart',
    ariaDescription,
    formatValue,
    formatPercent,
    defaultBarColor = DEFAULT_CHART_PARETO_BAR_COLOR,
    lineColor = DEFAULT_CHART_PARETO_LINE_COLOR,
    thresholdColor = DEFAULT_CHART_PARETO_THRESHOLD_COLOR,
    tickCount = DEFAULT_CHART_PARETO_TICK_COUNT,
    onBarClick,
  }: ChartParetoProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const sorted = useMemo(
    () => sortParetoCategoriesDesc(categories),
    [categories],
  );
  const total = useMemo(() => getParetoTotal(sorted), [sorted]);
  const cumulativePercent = useMemo(
    () => getParetoCumulativePercent(sorted),
    [sorted],
  );
  const thresholdIndex = useMemo(
    () =>
      findParetoThresholdIndex(
        cumulativePercent,
        paretoThreshold,
      ),
    [cumulativePercent, paretoThreshold],
  );

  const max = useMemo(() => {
    let m = 0;
    for (const c of sorted) {
      if (Number.isFinite(c.value) && c.value > m) m = c.value;
    }
    return m > 0 ? m : 1;
  }, [sorted]);

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showLabels ? 18 : 0) - 4,
  );

  const barCount = sorted.length;
  const barWidth =
    barCount > 0
      ? Math.max(
          1,
          (innerWidth - barGap * Math.max(0, barCount - 1)) /
            barCount,
        )
      : 0;

  const yForValue = useCallback(
    (v: number) => {
      if (max <= 0) return padding + innerHeight;
      const ratio = Math.max(0, Math.min(1, v / max));
      return padding + innerHeight - innerHeight * ratio;
    },
    [innerHeight, max, padding],
  );

  const yForPercent = useCallback(
    (p: number) => {
      const ratio = Math.max(0, Math.min(1, p));
      return padding + innerHeight - innerHeight * ratio;
    },
    [innerHeight, padding],
  );

  const valueTicks = useMemo(
    () => getParetoTicks(max, tickCount),
    [max, tickCount],
  );
  const percentTicks = useMemo(
    () => getParetoTicks(1, tickCount),
    [tickCount],
  );

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const fp = (v: number) =>
    formatPercent
      ? formatPercent(v)
      : `${(v * 100).toFixed(0)}%`;

  const description = useMemo(
    () =>
      ariaDescription ??
      describeParetoChart(
        categories,
        paretoThreshold,
        formatValue,
        formatPercent,
      ),
    [
      ariaDescription,
      categories,
      formatPercent,
      formatValue,
      paretoThreshold,
    ],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const linePath = useMemo(() => {
    if (sorted.length === 0) return '';
    const out: string[] = [];
    for (let i = 0; i < sorted.length; i += 1) {
      const x = padding + i * (barWidth + barGap) + barWidth / 2;
      const y = yForPercent(cumulativePercent[i] ?? 0);
      out.push(
        `${i === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`,
      );
    }
    return out.join(' ');
  }, [
    barGap,
    barWidth,
    cumulativePercent,
    padding,
    sorted.length,
    yForPercent,
  ]);

  const hoveredCategory =
    hovered !== null ? sorted[hovered] : null;
  const hoveredCum =
    hovered !== null ? cumulativePercent[hovered] : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-pareto"
      data-category-count={sorted.length}
      data-threshold={paretoThreshold.toFixed(4)}
      data-vital-few-count={
        thresholdIndex >= 0 ? thresholdIndex + 1 : 0
      }
      data-total={total}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-pareto-aria-desc"
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
        data-section="chart-pareto-svg"
        className="h-auto w-full"
      >
        {/* Left axis */}
        {showLeftAxis ? (
          <g
            data-section="chart-pareto-left-axis"
            aria-hidden="true"
          >
            <line
              x1={padding}
              y1={padding}
              x2={padding}
              y2={padding + innerHeight}
              stroke="currentColor"
              strokeOpacity={0.3}
            />
            {valueTicks.map((t, idx) => (
              <g
                key={`left-${idx}`}
                data-section="chart-pareto-left-tick"
                data-tick-value={t}
              >
                <line
                  x1={padding - 4}
                  y1={yForValue(t)}
                  x2={padding}
                  y2={yForValue(t)}
                  stroke="currentColor"
                  strokeOpacity={0.3}
                />
                <text
                  data-section="chart-pareto-left-tick-label"
                  x={padding - 6}
                  y={yForValue(t)}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.65}
                >
                  {fv(t)}
                </text>
              </g>
            ))}
          </g>
        ) : null}
        {/* Right axis (percent) */}
        {showRightAxis ? (
          <g
            data-section="chart-pareto-right-axis"
            aria-hidden="true"
          >
            <line
              x1={width - padding}
              y1={padding}
              x2={width - padding}
              y2={padding + innerHeight}
              stroke="currentColor"
              strokeOpacity={0.3}
            />
            {percentTicks.map((t, idx) => (
              <g
                key={`right-${idx}`}
                data-section="chart-pareto-right-tick"
                data-tick-value={t}
              >
                <line
                  x1={width - padding}
                  y1={yForPercent(t)}
                  x2={width - padding + 4}
                  y2={yForPercent(t)}
                  stroke="currentColor"
                  strokeOpacity={0.3}
                />
                <text
                  data-section="chart-pareto-right-tick-label"
                  x={width - padding + 6}
                  y={yForPercent(t)}
                  textAnchor="start"
                  alignmentBaseline="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.65}
                >
                  {fp(t)}
                </text>
              </g>
            ))}
          </g>
        ) : null}
        {/* Threshold reference line */}
        {showThreshold ? (
          <g
            data-section="chart-pareto-threshold"
            data-threshold={paretoThreshold.toFixed(4)}
            aria-hidden="true"
          >
            <line
              x1={padding}
              y1={yForPercent(paretoThreshold)}
              x2={width - padding}
              y2={yForPercent(paretoThreshold)}
              stroke={thresholdColor}
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
            <text
              data-section="chart-pareto-threshold-label"
              x={padding + 6}
              y={yForPercent(paretoThreshold) - 4}
              fontSize={10}
              fill={thresholdColor}
              fillOpacity={0.95}
            >
              {fp(paretoThreshold)}
            </text>
          </g>
        ) : null}
        {/* Bars */}
        {showBars
          ? sorted.map((c, i) => {
              const x = padding + i * (barWidth + barGap);
              const y = yForValue(c.value);
              const h = Math.max(
                1,
                padding + innerHeight - y,
              );
              const color = c.color ?? defaultBarColor;
              const isHovered = hovered === i;
              const isVital =
                thresholdIndex >= 0 && i <= thresholdIndex;
              return (
                <g
                  key={c.id}
                  data-section="chart-pareto-bar"
                  data-category-id={c.id}
                  data-category-index={i}
                  data-category-color={color}
                  data-category-value={c.value}
                  data-vital-few={isVital ? 'true' : 'false'}
                  data-cumulative-percent={(
                    cumulativePercent[i] ?? 0
                  ).toFixed(4)}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={cn(
                    animate && 'motion-safe:animate-fade-in',
                  )}
                >
                  <rect
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${c.label}: ${fv(c.value)}, cumulative ${fp(cumulativePercent[i] ?? 0)}`}
                    data-section="chart-pareto-bar-rect"
                    data-category-id={c.id}
                    x={x}
                    y={y}
                    width={barWidth}
                    height={h}
                    fill={color}
                    fillOpacity={isHovered ? 1 : 0.92}
                    stroke={isHovered ? color : 'none'}
                    strokeWidth={isHovered ? 1.5 : 0}
                    rx={2}
                    ry={2}
                    onMouseEnter={() => handleEnter(i)}
                    onMouseLeave={handleLeave}
                    onFocus={() => handleEnter(i)}
                    onBlur={handleLeave}
                    onClick={
                      onBarClick
                        ? () =>
                            onBarClick({
                              category: c,
                              index: i,
                              cumulativePercent:
                                cumulativePercent[i] ?? 0,
                            })
                        : undefined
                    }
                    style={{
                      cursor: onBarClick ? 'pointer' : 'default',
                    }}
                  />
                  {showLabels ? (
                    <text
                      aria-hidden="true"
                      data-section="chart-pareto-label"
                      data-category-id={c.id}
                      x={x + barWidth / 2}
                      y={padding + innerHeight + 12}
                      textAnchor="middle"
                      fontSize={10}
                      fill="currentColor"
                      fillOpacity={0.75}
                    >
                      {c.label}
                    </text>
                  ) : null}
                </g>
              );
            })
          : null}
        {/* Cumulative line */}
        {showLine && linePath ? (
          <path
            aria-hidden="true"
            data-section="chart-pareto-line"
            d={linePath}
            fill="none"
            stroke={lineColor}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ) : null}
        {/* Line markers */}
        {showLine
          ? sorted.map((c, i) => {
              const x =
                padding + i * (barWidth + barGap) + barWidth / 2;
              const y = yForPercent(
                cumulativePercent[i] ?? 0,
              );
              return (
                <circle
                  key={`marker-${c.id}`}
                  aria-hidden="true"
                  data-section="chart-pareto-line-marker"
                  data-category-id={c.id}
                  cx={x}
                  cy={y}
                  r={3}
                  fill={lineColor}
                />
              );
            })
          : null}
      </svg>
      {showTooltip && hoveredCategory && hovered !== null ? (
        <div
          role="tooltip"
          data-section="chart-pareto-tooltip"
          data-category-id={hoveredCategory.id}
          style={{
            left:
              padding +
              hovered * (barWidth + barGap) +
              barWidth +
              8,
            top: yForValue(hoveredCategory.value),
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-pareto-tooltip-label"
            className="font-medium"
          >
            {hoveredCategory.label}
          </div>
          <div
            data-section="chart-pareto-tooltip-value"
            className="font-mono"
          >
            value: {fv(hoveredCategory.value)}
          </div>
          {hoveredCum !== null ? (
            <div
              data-section="chart-pareto-tooltip-cumulative"
              className="text-muted-foreground"
            >
              cumulative: {fp(hoveredCum)}
            </div>
          ) : null}
          {thresholdIndex >= 0 && hovered <= thresholdIndex ? (
            <div
              data-section="chart-pareto-tooltip-vital"
              className="text-muted-foreground"
            >
              vital few
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ChartPareto.displayName = 'ChartPareto';
