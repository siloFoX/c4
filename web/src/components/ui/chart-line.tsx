import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef, MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '../../lib/cn';
import {
  DEFAULT_CHART_BAR_PALETTE,
  getDefaultBarColor,
} from './chart-bar';

// (v1.11.457, TODO 11.439) ChartLine primitive.
//
// Pure-SVG line chart with axis grid, hover dot indicator,
// multi-series support, smooth-curve toggle, and null-aware
// gap handling so missing data points break the line cleanly
// instead of being interpolated through.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartLineDataPoint {
  x: number;
  y: number | null;
}

export interface ChartLineSeries {
  id: string;
  label: string;
  data: readonly ChartLineDataPoint[];
  color?: string;
}

export interface ChartLineProps {
  series: readonly ChartLineSeries[];
  width?: number;
  height?: number;
  padding?: number;
  axisLabel?: { x?: string; y?: string };
  smooth?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showDots?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  tickCount?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_LINE_WIDTH = 520;
export const DEFAULT_CHART_LINE_HEIGHT = 280;
export const DEFAULT_CHART_LINE_PADDING = 36;
export const DEFAULT_CHART_LINE_TICK_COUNT = 4;

export interface ChartLineBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function getChartLineBounds(
  series: readonly ChartLineSeries[],
  xDomain?: [number, number],
  yDomain?: [number, number],
): ChartLineBounds {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const p of s.data) {
      if (Number.isFinite(p.x)) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
      }
      if (p.y !== null && Number.isFinite(p.y)) {
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = 0;
    xMax = 1;
  }
  if (xMin === xMax) {
    xMax = xMin + 1;
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMax = yMin + 1;
  }
  if (xDomain) {
    xMin = xDomain[0];
    xMax = xDomain[1];
  }
  if (yDomain) {
    yMin = yDomain[0];
    yMax = yDomain[1];
  }
  return { xMin, xMax, yMin, yMax };
}

export function getLinearScale(
  min: number,
  max: number,
  length: number,
): (value: number) => number {
  const range = max - min;
  const safeRange = range === 0 ? 1 : range;
  const safeLength =
    Number.isFinite(length) && length > 0 ? length : 1;
  return (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return ((value - min) / safeRange) * safeLength;
  };
}

// Build an SVG path string for a series of (x, y) screen
// points. `null` y-values break the line into separate
// sub-paths so missing data is rendered as a gap.
export interface ScreenPoint {
  x: number;
  y: number | null;
}

export function buildLinePath(
  points: readonly ScreenPoint[],
  smooth: boolean = false,
): string {
  if (points.length === 0) return '';
  // Split into runs of consecutive non-null points.
  const runs: Array<Array<{ x: number; y: number }>> = [];
  let current: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    if (p.y === null || !Number.isFinite(p.y)) {
      if (current.length > 0) {
        runs.push(current);
        current = [];
      }
    } else {
      current.push({ x: p.x, y: p.y });
    }
  }
  if (current.length > 0) runs.push(current);
  if (runs.length === 0) return '';
  return runs
    .map((run) => (smooth ? smoothPath(run) : straightPath(run)))
    .join(' ');
}

function straightPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  const head = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  const tail = points
    .slice(1)
    .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  return tail ? `${head} ${tail}` : head;
}

// Smooth path: Catmull-Rom to cubic bezier.
function smoothPath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  }
  if (points.length === 2) {
    return straightPath(points);
  }
  const head = `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  const segs: string[] = [head];
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    segs.push(
      `C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    );
  }
  return segs.join(' ');
}

export function findNearestPointIndex(
  data: readonly ChartLineDataPoint[],
  xValue: number,
): number {
  if (data.length === 0) return -1;
  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < data.length; i += 1) {
    const point = data[i]!;
    if (!Number.isFinite(point.x)) continue;
    const dist = Math.abs(point.x - xValue);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function getChartLineTicks(
  min: number,
  max: number,
  count: number = DEFAULT_CHART_LINE_TICK_COUNT,
): number[] {
  const safeCount =
    Number.isFinite(count) && count > 0 ? Math.floor(count) : 1;
  const range = max - min;
  const step = range / safeCount;
  const ticks: number[] = [];
  for (let i = 0; i <= safeCount; i += 1) {
    ticks.push(min + step * i);
  }
  return ticks;
}

export function formatChartLineTick(
  value: number,
  formatter?: (n: number) => string,
): string {
  if (formatter) return formatter(value);
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return value.toString();
  return Number.parseFloat(value.toFixed(2)).toString();
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartLine = forwardRef(function ChartLine(
  {
    series,
    width = DEFAULT_CHART_LINE_WIDTH,
    height = DEFAULT_CHART_LINE_HEIGHT,
    padding = DEFAULT_CHART_LINE_PADDING,
    axisLabel,
    smooth = false,
    showGrid = true,
    showTooltip = true,
    showAxisTicks = true,
    showDots = false,
    animate = true,
    className,
    ariaLabel = 'Line chart',
    formatX,
    formatY,
    tickCount = DEFAULT_CHART_LINE_TICK_COUNT,
    xDomain,
    yDomain,
  }: ChartLineProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const bounds = useMemo(
    () => getChartLineBounds(series, xDomain, yDomain),
    [series, xDomain, yDomain],
  );

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(0, height - padding * 2);
  const xScale = useMemo(
    () => getLinearScale(bounds.xMin, bounds.xMax, innerWidth),
    [bounds.xMax, bounds.xMin, innerWidth],
  );
  const yScale = useMemo(
    () => getLinearScale(bounds.yMin, bounds.yMax, innerHeight),
    [bounds.yMax, bounds.yMin, innerHeight],
  );

  const screenPointsBySeries = useMemo(() => {
    return series.map((s) =>
      s.data.map((p) => ({
        x: padding + xScale(p.x),
        y:
          p.y === null || !Number.isFinite(p.y)
            ? null
            : height - padding - yScale(p.y),
      })),
    );
  }, [height, padding, series, xScale, yScale]);

  const paths = useMemo(
    () =>
      screenPointsBySeries.map((pts) => buildLinePath(pts, smooth)),
    [screenPointsBySeries, smooth],
  );

  const xTicks = useMemo(
    () => getChartLineTicks(bounds.xMin, bounds.xMax, tickCount),
    [bounds.xMax, bounds.xMin, tickCount],
  );
  const yTicks = useMemo(
    () => getChartLineTicks(bounds.yMin, bounds.yMax, tickCount),
    [bounds.yMax, bounds.yMin, tickCount],
  );

  const [hoverX, setHoverX] = useState<number | null>(null);

  const handlePointerMove = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      const svg = event.currentTarget;
      const rect = svg.getBoundingClientRect();
      const ratio =
        rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      const localX = ratio * width;
      const inner = localX - padding;
      if (inner < 0 || inner > innerWidth) {
        setHoverX(null);
        return;
      }
      const xValue =
        bounds.xMin + (inner / innerWidth) * (bounds.xMax - bounds.xMin);
      setHoverX(xValue);
    },
    [
      bounds.xMax,
      bounds.xMin,
      innerWidth,
      padding,
      width,
    ],
  );

  const handlePointerLeave = useCallback(() => {
    setHoverX(null);
  }, []);

  const hoverInfo = useMemo(() => {
    if (hoverX === null) return null;
    return series.map((s, idx) => {
      const i = findNearestPointIndex(s.data, hoverX);
      if (i < 0) return null;
      const dp = s.data[i]!;
      const screen = screenPointsBySeries[idx]![i]!;
      return {
        series: s,
        point: dp,
        screen,
      };
    });
  }, [hoverX, screenPointsBySeries, series]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-line"
      data-series-count={series.length}
      data-smooth={smooth ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={cn('relative w-full', className)}
    >
      <svg
        role="img"
        aria-label={ariaLabel}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        data-section="chart-line-svg"
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerLeave}
        className="h-auto w-full"
      >
        {/* Axes */}
        <line
          aria-hidden="true"
          data-section="chart-line-axis-x"
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        <line
          aria-hidden="true"
          data-section="chart-line-axis-y"
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {/* Grid lines */}
        {showGrid
          ? yTicks.map((tick, idx) => {
              const y = height - padding - yScale(tick);
              return (
                <g
                  key={`y-${idx}`}
                  data-section="chart-line-grid-y"
                  data-tick-value={tick}
                >
                  <line
                    aria-hidden="true"
                    x1={padding}
                    y1={y}
                    x2={width - padding}
                    y2={y}
                    stroke="currentColor"
                    strokeOpacity={0.07}
                    strokeDasharray="2 4"
                  />
                  {showAxisTicks ? (
                    <text
                      aria-hidden="true"
                      data-section="chart-line-tick-y"
                      x={padding - 6}
                      y={y}
                      textAnchor="end"
                      alignmentBaseline="middle"
                      fontSize={10}
                      fill="currentColor"
                      fillOpacity={0.6}
                    >
                      {formatChartLineTick(tick, formatY)}
                    </text>
                  ) : null}
                </g>
              );
            })
          : null}
        {showGrid && showAxisTicks
          ? xTicks.map((tick, idx) => {
              const x = padding + xScale(tick);
              return (
                <g
                  key={`x-${idx}`}
                  data-section="chart-line-grid-x"
                  data-tick-value={tick}
                >
                  <text
                    aria-hidden="true"
                    data-section="chart-line-tick-x"
                    x={x}
                    y={height - padding + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill="currentColor"
                    fillOpacity={0.6}
                  >
                    {formatChartLineTick(tick, formatX)}
                  </text>
                </g>
              );
            })
          : null}
        {/* Series paths */}
        {series.map((s, idx) => {
          const color = s.color ?? getDefaultBarColor(idx);
          const path = paths[idx]!;
          return (
            <g
              key={s.id}
              data-section="chart-line-series"
              data-series-id={s.id}
              data-series-color={color}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <path
                data-section="chart-line-path"
                d={path}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                aria-label={s.label}
              />
              {showDots
                ? screenPointsBySeries[idx]!.map((pt, pi) =>
                    pt.y !== null ? (
                      <circle
                        key={`${s.id}-${pi}`}
                        data-section="chart-line-dot"
                        data-point-index={pi}
                        cx={pt.x}
                        cy={pt.y}
                        r={2.5}
                        fill={color}
                      />
                    ) : null,
                  )
                : null}
            </g>
          );
        })}
        {/* Hover dot indicator + vertical line */}
        {hoverInfo
          ? (() => {
              const firstHovered = hoverInfo.find(
                (h) => h !== null && h.point.y !== null,
              );
              if (!firstHovered) return null;
              const xHover = firstHovered.screen.x;
              return (
                <g
                  aria-hidden="true"
                  data-section="chart-line-hover-layer"
                >
                  <line
                    data-section="chart-line-hover-rule"
                    x1={xHover}
                    y1={padding}
                    x2={xHover}
                    y2={height - padding}
                    stroke="currentColor"
                    strokeOpacity={0.25}
                    strokeDasharray="2 2"
                  />
                  {hoverInfo.map((h, idx) =>
                    h && h.point.y !== null ? (
                      <circle
                        key={`hover-${idx}`}
                        data-section="chart-line-hover-dot"
                        data-series-id={h.series.id}
                        cx={h.screen.x}
                        cy={h.screen.y!}
                        r={4}
                        fill={
                          h.series.color ?? getDefaultBarColor(idx)
                        }
                        stroke="white"
                        strokeWidth={2}
                      />
                    ) : null,
                  )}
                </g>
              );
            })()
          : null}
        {/* Axis title labels */}
        {axisLabel?.x ? (
          <text
            aria-hidden="true"
            data-section="chart-line-axis-x-label"
            x={width / 2}
            y={height - 4}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            fillOpacity={0.7}
          >
            {axisLabel.x}
          </text>
        ) : null}
        {axisLabel?.y ? (
          <text
            aria-hidden="true"
            data-section="chart-line-axis-y-label"
            x={12}
            y={height / 2}
            textAnchor="middle"
            fontSize={11}
            fill="currentColor"
            fillOpacity={0.7}
            transform={`rotate(-90 12 ${height / 2})`}
          >
            {axisLabel.y}
          </text>
        ) : null}
      </svg>
      {showTooltip && hoverInfo && hoverInfo.some(Boolean) ? (
        <div
          role="tooltip"
          data-section="chart-line-tooltip"
          className="pointer-events-none absolute left-2 top-2 rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          {hoverInfo.map((h, idx) =>
            h ? (
              <div
                key={`t-${idx}`}
                data-section="chart-line-tooltip-row"
                data-series-id={h.series.id}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  data-section="chart-line-tooltip-swatch"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      h.series.color ?? getDefaultBarColor(idx),
                  }}
                />
                <span
                  data-section="chart-line-tooltip-label"
                  className="font-medium"
                >
                  {h.series.label}
                </span>
                <span
                  data-section="chart-line-tooltip-value"
                  className="font-mono text-muted-foreground"
                >
                  {h.point.y === null
                    ? 'n/a'
                    : formatChartLineTick(h.point.y, formatY)}
                </span>
              </div>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
});

ChartLine.displayName = 'ChartLine';

// Re-export the palette helpers so adopters can keep
// per-series colours consistent across <ChartBar> and
// <ChartLine>.
export { DEFAULT_CHART_BAR_PALETTE as DEFAULT_CHART_LINE_PALETTE };
