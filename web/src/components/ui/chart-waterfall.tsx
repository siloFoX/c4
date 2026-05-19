import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.468, TODO 11.450) ChartWaterfall primitive.
//
// Pure-SVG waterfall bar chart. Each `delta` bar shows a
// positive or negative change relative to the running
// total; `total` bars are drawn from zero to the cumulative
// running total (start values / subtotals / final total).
// Thin connector lines link the top of each bar to the
// bottom of the next so adopters can read the cumulative
// flow at a glance. Positive deltas paint green, negative
// red, totals neutral by default; all colours overridable.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ChartWaterfallBarType = 'delta' | 'total';

export interface ChartWaterfallBar {
  id: string;
  label: string;
  value: number;
  type?: ChartWaterfallBarType;
  color?: string;
}

export interface ChartWaterfallProps {
  bars: readonly ChartWaterfallBar[];
  width?: number;
  height?: number;
  padding?: number;
  showLabels?: boolean;
  showValues?: boolean;
  showConnectors?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  positiveColor?: string;
  negativeColor?: string;
  totalColor?: string;
  tickCount?: number;
  barGap?: number;
  onBarClick?: (args: {
    bar: ChartWaterfallBar;
    index: number;
    start: number;
    end: number;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_WATERFALL_WIDTH = 480;
export const DEFAULT_CHART_WATERFALL_HEIGHT = 280;
export const DEFAULT_CHART_WATERFALL_PADDING = 36;
export const DEFAULT_CHART_WATERFALL_TICK_COUNT = 5;
export const DEFAULT_CHART_WATERFALL_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_WATERFALL_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_WATERFALL_TOTAL_COLOR = '#475569';
export const DEFAULT_CHART_WATERFALL_BAR_GAP = 6;

export interface WaterfallStep {
  bar: ChartWaterfallBar;
  index: number;
  start: number;
  end: number;
  delta: number;
  isTotal: boolean;
  runningTotal: number;
}

// Compute the running total + per-bar start/end for the
// waterfall. `delta` bars increment the running total by
// their value (can be negative). `total` bars draw from
// zero to the supplied value (typically the running total
// at that point) and reset the running total to that value
// so subsequent deltas stack on top.
export function computeWaterfallSteps(
  bars: readonly ChartWaterfallBar[],
): WaterfallStep[] {
  const out: WaterfallStep[] = [];
  let running = 0;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const isTotal = bar.type === 'total';
    if (isTotal) {
      const end = Number.isFinite(bar.value) ? bar.value : running;
      out.push({
        bar,
        index: i,
        start: 0,
        end,
        delta: end,
        isTotal: true,
        runningTotal: end,
      });
      running = end;
    } else {
      const delta = Number.isFinite(bar.value) ? bar.value : 0;
      const start = running;
      const end = running + delta;
      out.push({
        bar,
        index: i,
        start,
        end,
        delta,
        isTotal: false,
        runningTotal: end,
      });
      running = end;
    }
  }
  return out;
}

// Compute the chart vertical bounds. The min is the smaller
// of 0 and the lowest bar bottom; the max is the larger of
// 0 and the highest bar top. Falls back to (0, 1) when no
// finite bar is present so the chart still renders.
export function getWaterfallBounds(
  steps: readonly WaterfallStep[],
): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const s of steps) {
    if (Number.isFinite(s.start) && s.start < min) min = s.start;
    if (Number.isFinite(s.end) && s.end < min) min = s.end;
    if (Number.isFinite(s.start) && s.start > max) max = s.start;
    if (Number.isFinite(s.end) && s.end > max) max = s.end;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) {
    return { min: min === 0 ? 0 : min - 1, max: max + 1 };
  }
  return { min, max };
}

// Decide a bar's fill colour. Per-bar `color` wins;
// otherwise `total` -> totalColor, positive delta ->
// positiveColor, negative delta -> negativeColor, zero
// delta -> totalColor (neutral).
export function getWaterfallBarColor(
  step: WaterfallStep,
  positive: string,
  negative: string,
  total: string,
): string {
  if (step.bar.color) return step.bar.color;
  if (step.isTotal) return total;
  if (step.delta > 0) return positive;
  if (step.delta < 0) return negative;
  return total;
}

// Evenly-spaced numeric ticks across [min, max].
export function getWaterfallTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_WATERFALL_TICK_COUNT,
): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (max <= min) return [min];
  const safeCount = Math.max(2, Math.floor(count));
  const span = max - min;
  const step = span / (safeCount - 1);
  const ticks: number[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    ticks.push(min + i * step);
  }
  return ticks;
}

// Build the default ARIA description summarising every
// bar + running total.
export function describeWaterfallChart(
  bars: readonly ChartWaterfallBar[],
  formatValue?: (v: number) => string,
): string {
  if (bars.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const steps = computeWaterfallSteps(bars);
  const parts = steps.map((s) => {
    if (s.isTotal) {
      return `${s.bar.label} total ${fv(s.end)}`;
    }
    const sign = s.delta >= 0 ? '+' : '';
    return `${s.bar.label} ${sign}${fv(s.delta)} -> ${fv(s.end)}`;
  });
  return `Waterfall with ${bars.length} bars. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartWaterfall = forwardRef(function ChartWaterfall(
  {
    bars,
    width = DEFAULT_CHART_WATERFALL_WIDTH,
    height = DEFAULT_CHART_WATERFALL_HEIGHT,
    padding = DEFAULT_CHART_WATERFALL_PADDING,
    showLabels = true,
    showValues = true,
    showConnectors = true,
    showTooltip = true,
    showAxisTicks = true,
    showZeroLine = true,
    animate = true,
    className,
    ariaLabel = 'Waterfall chart',
    ariaDescription,
    formatValue,
    positiveColor = DEFAULT_CHART_WATERFALL_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_WATERFALL_NEGATIVE_COLOR,
    totalColor = DEFAULT_CHART_WATERFALL_TOTAL_COLOR,
    tickCount = DEFAULT_CHART_WATERFALL_TICK_COUNT,
    barGap = DEFAULT_CHART_WATERFALL_BAR_GAP,
    onBarClick,
  }: ChartWaterfallProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const steps = useMemo(
    () => computeWaterfallSteps(bars),
    [bars],
  );
  const bounds = useMemo(
    () => getWaterfallBounds(steps),
    [steps],
  );
  const ticks = useMemo(
    () => getWaterfallTicks(bounds.min, bounds.max, tickCount),
    [bounds.max, bounds.min, tickCount],
  );

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showAxisTicks ? 16 : 0) - 4,
  );

  const barCount = steps.length;
  const barWidth =
    barCount > 0
      ? Math.max(
          1,
          (innerWidth - barGap * Math.max(0, barCount - 1)) /
            barCount,
        )
      : 0;

  const span = bounds.max - bounds.min;
  const yFor = useCallback(
    (value: number) => {
      if (span <= 0) return padding + innerHeight;
      const ratio = (value - bounds.min) / span;
      return padding + innerHeight - innerHeight * ratio;
    },
    [bounds.min, innerHeight, padding, span],
  );

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const description = useMemo(
    () =>
      ariaDescription ?? describeWaterfallChart(bars, formatValue),
    [ariaDescription, bars, formatValue],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const hoveredStep = hovered !== null ? steps[hovered] : null;

  const zeroY = yFor(0);

  // Build connector segments between consecutive bars
  const connectors = useMemo(() => {
    const out: {
      x1: number;
      y: number;
      x2: number;
      from: number;
      to: number;
    }[] = [];
    for (let i = 0; i < steps.length - 1; i += 1) {
      const curr = steps[i]!;
      const next = steps[i + 1]!;
      const xCurrEnd =
        padding + i * (barWidth + barGap) + barWidth;
      const xNextStart = padding + (i + 1) * (barWidth + barGap);
      const y = yFor(curr.end);
      out.push({
        x1: xCurrEnd,
        y,
        x2: xNextStart,
        from: i,
        to: i + 1,
      });
    }
    return out;
  }, [barGap, barWidth, padding, steps, yFor]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-waterfall"
      data-bar-count={barCount}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-waterfall-aria-desc"
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
        data-section="chart-waterfall-svg"
        className="h-auto w-full"
      >
        {/* Y axis line */}
        <line
          aria-hidden="true"
          data-section="chart-waterfall-axis-y"
          x1={padding}
          y1={padding}
          x2={padding}
          y2={padding + innerHeight}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {/* Tick labels */}
        {showAxisTicks
          ? ticks.map((t, idx) => {
              const y = yFor(t);
              return (
                <g
                  key={`tick-${idx}`}
                  data-section="chart-waterfall-tick"
                  data-tick-value={t}
                >
                  <line
                    aria-hidden="true"
                    x1={padding}
                    y1={y}
                    x2={width - padding / 2}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.06}
                    strokeDasharray="2 4"
                  />
                  <text
                    aria-hidden="true"
                    data-section="chart-waterfall-tick-label"
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
        {/* Zero line */}
        {showZeroLine && bounds.min < 0 && bounds.max > 0 ? (
          <line
            aria-hidden="true"
            data-section="chart-waterfall-zero-line"
            x1={padding}
            y1={zeroY}
            x2={width - padding}
            y2={zeroY}
            stroke="currentColor"
            strokeOpacity={0.35}
          />
        ) : null}
        {/* Connectors first so bars paint on top */}
        {showConnectors
          ? connectors.map((c, idx) => (
              <line
                key={`conn-${idx}`}
                aria-hidden="true"
                data-section="chart-waterfall-connector"
                data-from-index={c.from}
                data-to-index={c.to}
                x1={c.x1}
                y1={c.y}
                x2={c.x2}
                y2={c.y}
                stroke="currentColor"
                strokeOpacity={0.45}
                strokeDasharray="3 3"
              />
            ))
          : null}
        {/* Bars */}
        {steps.map((step, i) => {
          const x = padding + i * (barWidth + barGap);
          const yTop = yFor(Math.max(step.start, step.end));
          const yBot = yFor(Math.min(step.start, step.end));
          const h = Math.max(1, yBot - yTop);
          const color = getWaterfallBarColor(
            step,
            positiveColor,
            negativeColor,
            totalColor,
          );
          const isHovered = hovered === i;
          return (
            <g
              key={step.bar.id}
              data-section="chart-waterfall-bar"
              data-bar-id={step.bar.id}
              data-bar-index={i}
              data-bar-type={step.isTotal ? 'total' : 'delta'}
              data-bar-color={color}
              data-bar-direction={
                step.isTotal
                  ? 'total'
                  : step.delta >= 0
                    ? 'positive'
                    : 'negative'
              }
              data-bar-start={step.start}
              data-bar-end={step.end}
              data-bar-delta={step.delta}
              data-hovered={isHovered ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <rect
                role="graphics-symbol"
                tabIndex={0}
                aria-label={
                  step.isTotal
                    ? `${step.bar.label} total: ${fv(step.end)}`
                    : `${step.bar.label} delta: ${step.delta >= 0 ? '+' : ''}${fv(step.delta)}`
                }
                data-section="chart-waterfall-rect"
                data-bar-id={step.bar.id}
                x={x}
                y={yTop}
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
                          bar: step.bar,
                          index: i,
                          start: step.start,
                          end: step.end,
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
                  data-section="chart-waterfall-label"
                  data-bar-id={step.bar.id}
                  x={x + barWidth / 2}
                  y={padding + innerHeight + 12}
                  textAnchor="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.75}
                >
                  {step.bar.label}
                </text>
              ) : null}
              {showValues ? (
                <text
                  aria-hidden="true"
                  data-section="chart-waterfall-value"
                  data-bar-id={step.bar.id}
                  x={x + barWidth / 2}
                  y={yTop - 3}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="currentColor"
                  fillOpacity={0.9}
                >
                  {step.isTotal
                    ? fv(step.end)
                    : `${step.delta >= 0 ? '+' : ''}${fv(step.delta)}`}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {showTooltip && hoveredStep ? (
        <div
          role="tooltip"
          data-section="chart-waterfall-tooltip"
          data-bar-id={hoveredStep.bar.id}
          style={{
            left:
              padding +
              hoveredStep.index * (barWidth + barGap) +
              barWidth +
              8,
            top: yFor(Math.max(hoveredStep.start, hoveredStep.end)),
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-waterfall-tooltip-label"
            className="font-medium"
          >
            {hoveredStep.bar.label}
          </div>
          <div
            data-section="chart-waterfall-tooltip-delta"
            className="font-mono"
          >
            {hoveredStep.isTotal
              ? fv(hoveredStep.end)
              : `${hoveredStep.delta >= 0 ? '+' : ''}${fv(hoveredStep.delta)}`}
          </div>
          {!hoveredStep.isTotal ? (
            <div
              data-section="chart-waterfall-tooltip-running"
              className="text-muted-foreground"
            >
              total: {fv(hoveredStep.end)}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

ChartWaterfall.displayName = 'ChartWaterfall';
