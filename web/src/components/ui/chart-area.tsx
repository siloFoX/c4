import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef, MouseEvent as ReactMouseEvent } from 'react';
import { cn } from '../../lib/cn';
import { getDefaultBarColor } from './chart-bar';
import {
  formatChartLineTick,
  getChartLineTicks,
  getLinearScale,
} from './chart-line';

// (v1.11.459, TODO 11.441) ChartArea primitive.
//
// Pure-SVG area chart with multi-series support, an
// `overlaid` (each series fills from baseline 0) and
// `stacked` (cumulative sum baseline) mode toggle, hover
// tooltip listing every series at the cursor, axis grid +
// optional tick labels, and a smooth-curve toggle.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ChartAreaMode = 'overlaid' | 'stacked';

export interface ChartAreaDataPoint {
  x: number;
  y: number;
}

export interface ChartAreaSeries {
  id: string;
  label: string;
  data: readonly ChartAreaDataPoint[];
  color?: string;
}

export interface ChartAreaProps {
  series: readonly ChartAreaSeries[];
  mode?: ChartAreaMode;
  width?: number;
  height?: number;
  padding?: number;
  axisLabel?: { x?: string; y?: string };
  smooth?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showLines?: boolean;
  animate?: boolean;
  fillOpacity?: number;
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

export const DEFAULT_CHART_AREA_WIDTH = 520;
export const DEFAULT_CHART_AREA_HEIGHT = 280;
export const DEFAULT_CHART_AREA_PADDING = 36;
export const DEFAULT_CHART_AREA_TICK_COUNT = 4;
export const DEFAULT_CHART_AREA_FILL_OPACITY = 0.35;
export const DEFAULT_CHART_AREA_MODE: ChartAreaMode = 'overlaid';

export interface ChartAreaStackedPoint {
  x: number;
  y0: number; // baseline
  y1: number; // top
  value: number; // original series value (y1 - y0)
}

// Reshape series for the configured mode:
//   - overlaid: every series has y0=0, y1=value
//   - stacked: cumulative baseline; each series sits on top
//     of the previous series at the same x.
// Stacked assumes all series share the same x ordering.
export function buildAreaStack(
  series: readonly ChartAreaSeries[],
  mode: ChartAreaMode,
): ChartAreaStackedPoint[][] {
  if (series.length === 0) return [];
  if (mode === 'overlaid') {
    return series.map((s) =>
      s.data.map((p) => ({
        x: p.x,
        y0: 0,
        y1: Number.isFinite(p.y) ? p.y : 0,
        value: Number.isFinite(p.y) ? p.y : 0,
      })),
    );
  }
  // Stacked. Cumulative baseline by x.
  const baselines = new Map<number, number>();
  return series.map((s) =>
    s.data.map((p) => {
      const v = Number.isFinite(p.y) ? Math.max(0, p.y) : 0;
      const y0 = baselines.get(p.x) ?? 0;
      const y1 = y0 + v;
      baselines.set(p.x, y1);
      return { x: p.x, y0, y1, value: v };
    }),
  );
}

export interface ChartAreaBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export function getChartAreaBounds(
  stack: readonly ChartAreaStackedPoint[][],
  xDomain?: [number, number],
  yDomain?: [number, number],
): ChartAreaBounds {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMax = 0;
  for (const points of stack) {
    for (const p of points) {
      if (Number.isFinite(p.x)) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
      }
      if (Number.isFinite(p.y1) && p.y1 > yMax) yMax = p.y1;
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = 0;
    xMax = 1;
  }
  if (xMin === xMax) xMax = xMin + 1;
  if (yMax <= 0) yMax = 1;
  if (xDomain) {
    xMin = xDomain[0];
    xMax = xDomain[1];
  }
  let yMin = 0;
  if (yDomain) {
    yMin = yDomain[0];
    yMax = yDomain[1];
  }
  return { xMin, xMax, yMin, yMax };
}

export interface ScreenAreaPoint {
  x: number;
  yTop: number;
  yBottom: number;
}

export function buildAreaPath(
  points: readonly ScreenAreaPoint[],
  smooth: boolean = false,
): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x.toFixed(2)} ${p.yTop.toFixed(2)} L ${p.x.toFixed(2)} ${p.yBottom.toFixed(2)} Z`;
  }
  // Top edge (left -> right)
  const top = smooth
    ? smoothEdge(points.map((p) => ({ x: p.x, y: p.yTop })))
    : straightEdge(points.map((p) => ({ x: p.x, y: p.yTop })));
  // Bottom edge (right -> left)
  const bottomPts = [...points]
    .reverse()
    .map((p) => ({ x: p.x, y: p.yBottom }));
  const bottom = smooth
    ? smoothEdge(bottomPts, true)
    : straightEdge(bottomPts, true);
  return `${top} ${bottom} Z`;
}

function straightEdge(
  points: Array<{ x: number; y: number }>,
  asLine: boolean = false,
): string {
  if (points.length === 0) return '';
  const head = `${asLine ? 'L' : 'M'} ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  const tail = points
    .slice(1)
    .map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  return tail ? `${head} ${tail}` : head;
}

function smoothEdge(
  points: Array<{ x: number; y: number }>,
  asLine: boolean = false,
): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `${asLine ? 'L' : 'M'} ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  }
  if (points.length === 2) {
    return straightEdge(points, asLine);
  }
  const head = `${asLine ? 'L' : 'M'} ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
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

export function findNearestAreaIndex(
  data: readonly ChartAreaStackedPoint[],
  xValue: number,
): number {
  if (data.length === 0) return -1;
  let bestIdx = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < data.length; i += 1) {
    const p = data[i]!;
    if (!Number.isFinite(p.x)) continue;
    const d = Math.abs(p.x - xValue);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartArea = forwardRef(function ChartArea(
  {
    series,
    mode = DEFAULT_CHART_AREA_MODE,
    width = DEFAULT_CHART_AREA_WIDTH,
    height = DEFAULT_CHART_AREA_HEIGHT,
    padding = DEFAULT_CHART_AREA_PADDING,
    axisLabel,
    smooth = false,
    showGrid = true,
    showTooltip = true,
    showAxisTicks = true,
    showLines = true,
    animate = true,
    fillOpacity = DEFAULT_CHART_AREA_FILL_OPACITY,
    className,
    ariaLabel = 'Area chart',
    formatX,
    formatY,
    tickCount = DEFAULT_CHART_AREA_TICK_COUNT,
    xDomain,
    yDomain,
  }: ChartAreaProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const stack = useMemo(
    () => buildAreaStack(series, mode),
    [mode, series],
  );

  const bounds = useMemo(
    () => getChartAreaBounds(stack, xDomain, yDomain),
    [stack, xDomain, yDomain],
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

  const screen = useMemo(
    () =>
      stack.map((points) =>
        points.map<ScreenAreaPoint>((p) => ({
          x: padding + xScale(p.x),
          yTop: height - padding - yScale(p.y1),
          yBottom: height - padding - yScale(p.y0),
        })),
      ),
    [height, padding, stack, xScale, yScale],
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

  const handleMove = useCallback(
    (event: ReactMouseEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio =
        rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
      const local = ratio * width;
      const inner = local - padding;
      if (inner < 0 || inner > innerWidth) {
        setHoverX(null);
        return;
      }
      const v =
        bounds.xMin +
        (inner / innerWidth) * (bounds.xMax - bounds.xMin);
      setHoverX(v);
    },
    [
      bounds.xMax,
      bounds.xMin,
      innerWidth,
      padding,
      width,
    ],
  );

  const handleLeave = useCallback(() => {
    setHoverX(null);
  }, []);

  const hoverInfo = useMemo(() => {
    if (hoverX === null) return null;
    return stack.map((points, idx) => {
      const i = findNearestAreaIndex(points, hoverX);
      if (i < 0) return null;
      const sp = screen[idx]?.[i];
      const dp = points[i];
      if (!sp || !dp) return null;
      return {
        series: series[idx]!,
        point: dp,
        screen: sp,
      };
    });
  }, [hoverX, screen, series, stack]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-area"
      data-mode={mode}
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
        data-section="chart-area-svg"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="h-auto w-full"
      >
        {/* Axes */}
        <line
          aria-hidden="true"
          data-section="chart-area-axis-x"
          x1={padding}
          y1={height - padding}
          x2={width - padding}
          y2={height - padding}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        <line
          aria-hidden="true"
          data-section="chart-area-axis-y"
          x1={padding}
          y1={padding}
          x2={padding}
          y2={height - padding}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {/* Grid + tick labels */}
        {showGrid
          ? yTicks.map((tick, idx) => {
              const y = height - padding - yScale(tick);
              return (
                <g
                  key={`y-${idx}`}
                  data-section="chart-area-grid-y"
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
                      data-section="chart-area-tick-y"
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
                  data-section="chart-area-grid-x"
                  data-tick-value={tick}
                >
                  <text
                    aria-hidden="true"
                    data-section="chart-area-tick-x"
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
        {/* Series areas + lines */}
        {series.map((s, idx) => {
          const color = s.color ?? getDefaultBarColor(idx);
          const pts = screen[idx] ?? [];
          const areaD = buildAreaPath(pts, smooth);
          const topLineD =
            pts.length === 0
              ? ''
              : smooth
                ? smoothEdge(
                    pts.map((p) => ({ x: p.x, y: p.yTop })),
                  )
                : straightEdge(
                    pts.map((p) => ({ x: p.x, y: p.yTop })),
                  );
          return (
            <g
              key={s.id}
              data-section="chart-area-series"
              data-series-id={s.id}
              data-series-color={color}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <path
                data-section="chart-area-fill"
                role="graphics-symbol"
                aria-label={s.label}
                d={areaD}
                fill={color}
                fillOpacity={fillOpacity}
                stroke="none"
              />
              {showLines ? (
                <path
                  data-section="chart-area-line"
                  d={topLineD}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ) : null}
            </g>
          );
        })}
        {/* Hover layer */}
        {hoverInfo
          ? (() => {
              const first = hoverInfo.find((h) => h !== null);
              if (!first) return null;
              const xHover = first.screen.x;
              return (
                <g
                  aria-hidden="true"
                  data-section="chart-area-hover-layer"
                >
                  <line
                    data-section="chart-area-hover-rule"
                    x1={xHover}
                    y1={padding}
                    x2={xHover}
                    y2={height - padding}
                    stroke="currentColor"
                    strokeOpacity={0.25}
                    strokeDasharray="2 2"
                  />
                  {hoverInfo.map((h, idx) =>
                    h ? (
                      <circle
                        key={`hover-${idx}`}
                        data-section="chart-area-hover-dot"
                        data-series-id={h.series.id}
                        cx={h.screen.x}
                        cy={h.screen.yTop}
                        r={3.5}
                        fill={
                          h.series.color ?? getDefaultBarColor(idx)
                        }
                        stroke="white"
                        strokeWidth={1.5}
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
            data-section="chart-area-axis-x-label"
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
            data-section="chart-area-axis-y-label"
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
          data-section="chart-area-tooltip"
          className="pointer-events-none absolute left-2 top-2 rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          {hoverInfo.map((h, idx) =>
            h ? (
              <div
                key={`t-${idx}`}
                data-section="chart-area-tooltip-row"
                data-series-id={h.series.id}
                className="flex items-center gap-2"
              >
                <span
                  aria-hidden="true"
                  data-section="chart-area-tooltip-swatch"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{
                    backgroundColor:
                      h.series.color ?? getDefaultBarColor(idx),
                  }}
                />
                <span
                  data-section="chart-area-tooltip-label"
                  className="font-medium"
                >
                  {h.series.label}
                </span>
                <span
                  data-section="chart-area-tooltip-value"
                  className="font-mono text-muted-foreground"
                >
                  {formatChartLineTick(h.point.value, formatY)}
                </span>
              </div>
            ) : null,
          )}
        </div>
      ) : null}
    </div>
  );
});

ChartArea.displayName = 'ChartArea';
