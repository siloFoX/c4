import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { getDefaultBarColor } from './chart-bar';

// (v1.11.477, TODO 11.459) ChartStep primitive.
//
// Pure-SVG step chart (staircase plot). Adjacent points
// are connected by horizontal-then-vertical (or vertical-
// then-horizontal) segments, never interpolated. Three
// step variants are supported: `after` (classic
// staircase, default), `before` (jump first, then hold),
// and `middle` (jump at the midpoint between samples).
// Hover surfaces a dot indicator at the closest sample
// + tooltip with x label and y value(s). Optional area
// fill below the line.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ChartStepType = 'before' | 'after' | 'middle';

export interface ChartStepPoint {
  x: number | string;
  y: number;
}

export interface ChartStepSeries {
  id: string;
  label: string;
  data: readonly ChartStepPoint[];
  color?: string;
}

export interface ChartStepProps {
  series: readonly ChartStepSeries[];
  width?: number;
  height?: number;
  padding?: number;
  stepType?: ChartStepType;
  showDots?: boolean;
  showGrid?: boolean;
  showAxisTicks?: boolean;
  showLabels?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showArea?: boolean;
  areaOpacity?: number;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatX?: (v: number | string) => string;
  formatY?: (v: number) => string;
  tickCount?: number;
  strokeWidth?: number;
  legendPlacement?: 'right' | 'bottom';
  onPointClick?: (args: {
    series: ChartStepSeries;
    point: ChartStepPoint;
    index: number;
    seriesIndex: number;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_STEP_WIDTH = 560;
export const DEFAULT_CHART_STEP_HEIGHT = 280;
export const DEFAULT_CHART_STEP_PADDING = 36;
export const DEFAULT_CHART_STEP_TICK_COUNT = 5;
export const DEFAULT_CHART_STEP_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_STEP_AREA_OPACITY = 0.18;
export const DEFAULT_CHART_STEP_TYPE: ChartStepType = 'after';

// Chart-wide y bounds across all series. Falls back to
// (0, 1) when no finite value is present.
export function getStepYBounds(
  series: readonly ChartStepSeries[],
): { min: number; max: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const p of s.data) {
      if (!Number.isFinite(p.y)) continue;
      if (p.y < min) min = p.y;
      if (p.y > max) max = p.y;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) return { min: min - 0.5, max: max + 0.5 };
  return { min, max };
}

// Returns the canonical ordered x-axis labels across the
// supplied series (first occurrence wins).
export function getStepXLabels(
  series: readonly ChartStepSeries[],
): (number | string)[] {
  const seen: (number | string)[] = [];
  const set = new Set<string>();
  for (const s of series) {
    for (const p of s.data) {
      const key =
        typeof p.x === 'number' ? `n:${p.x}` : `s:${p.x}`;
      if (!set.has(key)) {
        set.add(key);
        seen.push(p.x);
      }
    }
  }
  return seen;
}

// Build a step path from (x, y) coordinate pairs using
// the supplied step type. Coordinates are already in svg
// space (the caller projects data values through xFor /
// yFor).
export interface StepXY {
  x: number;
  y: number;
}

export function buildStepPath(
  points: readonly StepXY[],
  stepType: ChartStepType,
): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  }
  const out: string[] = [
    `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`,
  ];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    if (stepType === 'before') {
      // Vertical first (jump y at prev.x), then horizontal
      out.push(`L ${prev.x.toFixed(2)} ${curr.y.toFixed(2)}`);
      out.push(`L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`);
    } else if (stepType === 'middle') {
      const midX = (prev.x + curr.x) / 2;
      out.push(`L ${midX.toFixed(2)} ${prev.y.toFixed(2)}`);
      out.push(`L ${midX.toFixed(2)} ${curr.y.toFixed(2)}`);
      out.push(`L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`);
    } else {
      // 'after' (default classic staircase): horizontal first, then vertical
      out.push(`L ${curr.x.toFixed(2)} ${prev.y.toFixed(2)}`);
      out.push(`L ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`);
    }
  }
  return out.join(' ');
}

// Build a closed area path under the step line, anchored
// at the supplied baseline y.
export function buildStepAreaPath(
  points: readonly StepXY[],
  stepType: ChartStepType,
  baselineY: number,
): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} L ${p.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
  }
  const line = buildStepPath(points, stepType);
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${line} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

// Pick the index of the closest sample (by horizontal
// distance only) within `maxDistance` px.
export function findStepHitIndex(
  positions: readonly StepXY[],
  screenX: number,
  maxDistance: number = 24,
): number {
  if (positions.length === 0) return -1;
  let bestIdx = -1;
  let bestDist = maxDistance;
  for (let i = 0; i < positions.length; i += 1) {
    const dx = Math.abs(positions[i]!.x - screenX);
    if (dx <= bestDist) {
      bestDist = dx;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// Evenly-spaced numeric ticks across [min, max].
export function getStepTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_STEP_TICK_COUNT,
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
export function describeStepChart(
  series: readonly ChartStepSeries[],
  formatY?: (v: number) => string,
): string {
  if (series.length === 0) return 'No data';
  const fy = (v: number) => (formatY ? formatY(v) : `${v}`);
  const parts = series.map((s) => {
    const first = s.data[0]?.y;
    const last = s.data[s.data.length - 1]?.y;
    if (first === undefined || last === undefined) {
      return `${s.label} empty`;
    }
    return `${s.label} from ${fy(first)} to ${fy(last)}`;
  });
  return `Step chart with ${series.length} series. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartStep = forwardRef(function ChartStep(
  {
    series,
    width = DEFAULT_CHART_STEP_WIDTH,
    height = DEFAULT_CHART_STEP_HEIGHT,
    padding = DEFAULT_CHART_STEP_PADDING,
    stepType = DEFAULT_CHART_STEP_TYPE,
    showDots = true,
    showGrid = true,
    showAxisTicks = true,
    showLabels = true,
    showLegend = true,
    showTooltip = true,
    showArea = false,
    areaOpacity = DEFAULT_CHART_STEP_AREA_OPACITY,
    animate = true,
    className,
    ariaLabel = 'Step chart',
    ariaDescription,
    formatX,
    formatY,
    tickCount = DEFAULT_CHART_STEP_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_STEP_STROKE_WIDTH,
    legendPlacement = 'right',
    onPointClick,
  }: ChartStepProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const yBounds = useMemo(
    () => getStepYBounds(series),
    [series],
  );
  const xLabels = useMemo(
    () => getStepXLabels(series),
    [series],
  );
  const yTicks = useMemo(
    () => getStepTicks(yBounds.min, yBounds.max, tickCount),
    [tickCount, yBounds.max, yBounds.min],
  );

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showLabels ? 16 : 0) - 4,
  );

  const xCount = xLabels.length;
  const xFor = useCallback(
    (label: number | string) => {
      if (xCount === 0) return padding;
      const idx = xLabels.findIndex((l) => l === label);
      if (idx < 0) return padding;
      if (xCount === 1) return padding + innerWidth / 2;
      const step = innerWidth / (xCount - 1);
      return padding + idx * step;
    },
    [innerWidth, padding, xCount, xLabels],
  );

  const span = yBounds.max - yBounds.min;
  const yFor = useCallback(
    (v: number) => {
      if (span <= 0) return padding + innerHeight;
      const ratio = (v - yBounds.min) / span;
      return padding + innerHeight - innerHeight * ratio;
    },
    [innerHeight, padding, span, yBounds.min],
  );

  const baselineY = useMemo(() => yFor(yBounds.min), [yBounds.min, yFor]);

  const seriesPositions = useMemo(() => {
    return series.map((s) =>
      s.data.map((p) => ({ x: xFor(p.x), y: yFor(p.y) })),
    );
  }, [series, xFor, yFor]);

  const fy = (v: number) => (formatY ? formatY(v) : `${v}`);
  const fx = (v: number | string) =>
    formatX ? formatX(v) : `${v}`;

  const description = useMemo(
    () =>
      ariaDescription ?? describeStepChart(series, formatY),
    [ariaDescription, formatY, series],
  );

  const [hovered, setHovered] = useState<{
    seriesIndex: number;
    pointIndex: number;
  } | null>(null);

  const handleEnter = useCallback(
    (seriesIndex: number, pointIndex: number) => {
      setHovered({ seriesIndex, pointIndex });
    },
    [],
  );
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const hoveredSeries =
    hovered ? series[hovered.seriesIndex] : null;
  const hoveredPoint =
    hovered && hoveredSeries
      ? hoveredSeries.data[hovered.pointIndex]
      : null;
  const hoveredPos =
    hovered
      ? seriesPositions[hovered.seriesIndex]?.[hovered.pointIndex]
      : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-step"
      data-series-count={series.length}
      data-step-type={stepType}
      data-sample-count={xCount}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'flex w-full items-start gap-4',
        legendPlacement === 'bottom' &&
          'flex-col items-stretch',
        className,
      )}
      style={{ width }}
    >
      <div
        data-section="chart-step-canvas"
        className="relative shrink-0"
        style={{ width, height }}
      >
        <span
          data-section="chart-step-aria-desc"
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
          data-section="chart-step-svg"
          className="h-auto w-full"
        >
          {/* Y axis */}
          <line
            aria-hidden="true"
            data-section="chart-step-axis-y"
            x1={padding}
            y1={padding}
            x2={padding}
            y2={padding + innerHeight}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          {/* Grid + tick labels */}
          {yTicks.map((t, idx) => {
            const y = yFor(t);
            return (
              <g
                key={`ytick-${idx}`}
                data-section="chart-step-tick"
                data-tick-value={t}
              >
                {showGrid ? (
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
                ) : null}
                {showAxisTicks ? (
                  <text
                    aria-hidden="true"
                    data-section="chart-step-tick-label"
                    x={padding - 4}
                    y={y}
                    textAnchor="end"
                    alignmentBaseline="middle"
                    fontSize={10}
                    fill="currentColor"
                    fillOpacity={0.65}
                  >
                    {fy(t)}
                  </text>
                ) : null}
              </g>
            );
          })}
          {/* X axis labels */}
          {showLabels
            ? xLabels.map((label, idx) => (
                <text
                  key={`xlabel-${idx}`}
                  aria-hidden="true"
                  data-section="chart-step-xlabel"
                  data-label-index={idx}
                  x={xFor(label)}
                  y={padding + innerHeight + 12}
                  textAnchor={
                    idx === 0
                      ? 'start'
                      : idx === xLabels.length - 1
                        ? 'end'
                        : 'middle'
                  }
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.65}
                >
                  {fx(label)}
                </text>
              ))
            : null}
          {/* Series */}
          {series.map((s, i) => {
            const pts = seriesPositions[i] ?? [];
            const color = s.color ?? getDefaultBarColor(i);
            const linePath = buildStepPath(pts, stepType);
            const areaPath = showArea
              ? buildStepAreaPath(pts, stepType, baselineY)
              : '';
            return (
              <g
                key={s.id}
                data-section="chart-step-series"
                data-series-id={s.id}
                data-series-index={i}
                data-series-color={color}
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                {showArea && areaPath ? (
                  <path
                    aria-hidden="true"
                    data-section="chart-step-area"
                    data-series-id={s.id}
                    d={areaPath}
                    fill={color}
                    fillOpacity={areaOpacity}
                    stroke="none"
                  />
                ) : null}
                {linePath ? (
                  <path
                    aria-hidden="true"
                    data-section="chart-step-line"
                    data-series-id={s.id}
                    d={linePath}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinejoin="miter"
                    strokeLinecap="butt"
                  />
                ) : null}
                {showDots
                  ? pts.map((p, j) => {
                      const isHovered =
                        hovered?.seriesIndex === i &&
                        hovered?.pointIndex === j;
                      const dataPt = s.data[j]!;
                      return (
                        <circle
                          key={`pt-${s.id}-${j}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label}: ${fx(dataPt.x)} -> ${fy(dataPt.y)}`}
                          data-section="chart-step-dot"
                          data-series-id={s.id}
                          data-point-index={j}
                          data-hovered={
                            isHovered ? 'true' : 'false'
                          }
                          cx={p.x}
                          cy={p.y}
                          r={isHovered ? 4 : 2.75}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => handleEnter(i, j)}
                          onMouseLeave={handleLeave}
                          onFocus={() => handleEnter(i, j)}
                          onBlur={handleLeave}
                          onClick={
                            onPointClick
                              ? () =>
                                  onPointClick({
                                    series: s,
                                    point: dataPt,
                                    index: j,
                                    seriesIndex: i,
                                  })
                              : undefined
                          }
                          style={{
                            cursor: onPointClick
                              ? 'pointer'
                              : 'default',
                          }}
                        />
                      );
                    })
                  : null}
              </g>
            );
          })}
        </svg>
        {showTooltip && hoveredSeries && hoveredPoint && hoveredPos ? (
          <div
            role="tooltip"
            data-section="chart-step-tooltip"
            data-series-id={hoveredSeries.id}
            style={{
              left: hoveredPos.x + 10,
              top: hoveredPos.y - 8,
            }}
            className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
          >
            <div
              data-section="chart-step-tooltip-label"
              className="font-medium"
            >
              {hoveredSeries.label}
            </div>
            <div
              data-section="chart-step-tooltip-x"
              className="font-mono text-muted-foreground"
            >
              x: {fx(hoveredPoint.x)}
            </div>
            <div
              data-section="chart-step-tooltip-y"
              className="font-mono"
            >
              y: {fy(hoveredPoint.y)}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-step-legend"
          data-placement={legendPlacement}
          className={cn(
            'flex flex-col gap-1 text-xs',
            legendPlacement === 'bottom' &&
              'flex-row flex-wrap gap-3',
          )}
        >
          {series.map((s, i) => {
            const color = s.color ?? getDefaultBarColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-step-legend-item"
                data-series-id={s.id}
                className="flex items-center gap-1.5"
              >
                <span
                  aria-hidden="true"
                  data-section="chart-step-legend-swatch"
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: color }}
                />
                <span
                  data-section="chart-step-legend-label"
                  className="text-foreground"
                >
                  {s.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartStep.displayName = 'ChartStep';
