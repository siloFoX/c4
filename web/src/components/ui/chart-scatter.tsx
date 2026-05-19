import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { getDefaultBarColor } from './chart-bar';
import {
  formatChartLineTick,
  getChartLineTicks,
  getLinearScale,
} from './chart-line';

// (v1.11.462, TODO 11.444) ChartScatter primitive.
//
// Pure-SVG scatter plot. Each series carries its own colour
// + shape (circle / square / triangle / diamond). Optional
// per-point `size` mapping turns the plot into a bubble
// chart. Hovering a dot opens a tooltip with the matched
// series + x / y / size values; click handlers receive both
// the series and the data point.
//
// Reference: /root/c4/arps-design-system-v1/.

export type ChartScatterShape =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'diamond';

export interface ChartScatterPoint {
  x: number;
  y: number;
  size?: number;
  label?: string;
}

export interface ChartScatterSeries {
  id: string;
  label: string;
  data: readonly ChartScatterPoint[];
  color?: string;
  shape?: ChartScatterShape;
}

export interface ChartScatterProps {
  series: readonly ChartScatterSeries[];
  width?: number;
  height?: number;
  padding?: number;
  axisLabel?: { x?: string; y?: string };
  showGrid?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  dotSize?: number;
  minDotSize?: number;
  maxDotSize?: number;
  className?: string;
  ariaLabel?: string;
  formatX?: (v: number) => string;
  formatY?: (v: number) => string;
  formatSize?: (v: number) => string;
  tickCount?: number;
  xDomain?: [number, number];
  yDomain?: [number, number];
  onPointClick?: (args: {
    series: ChartScatterSeries;
    point: ChartScatterPoint;
    seriesIndex: number;
    pointIndex: number;
  }) => void;
  legendPlacement?: 'right' | 'bottom';
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_SCATTER_WIDTH = 520;
export const DEFAULT_CHART_SCATTER_HEIGHT = 280;
export const DEFAULT_CHART_SCATTER_PADDING = 36;
export const DEFAULT_CHART_SCATTER_TICK_COUNT = 4;
export const DEFAULT_CHART_SCATTER_DOT_SIZE = 6;
export const DEFAULT_CHART_SCATTER_MIN_DOT_SIZE = 3;
export const DEFAULT_CHART_SCATTER_MAX_DOT_SIZE = 18;

export interface ChartScatterBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  sizeMin: number;
  sizeMax: number;
}

export function getChartScatterBounds(
  series: readonly ChartScatterSeries[],
  xDomain?: [number, number],
  yDomain?: [number, number],
): ChartScatterBounds {
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let sizeMin = Number.POSITIVE_INFINITY;
  let sizeMax = Number.NEGATIVE_INFINITY;
  for (const s of series) {
    for (const p of s.data) {
      if (Number.isFinite(p.x)) {
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
      }
      if (Number.isFinite(p.y)) {
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
      }
      if (p.size !== undefined && Number.isFinite(p.size)) {
        if (p.size < sizeMin) sizeMin = p.size;
        if (p.size > sizeMax) sizeMax = p.size;
      }
    }
  }
  if (!Number.isFinite(xMin) || !Number.isFinite(xMax)) {
    xMin = 0;
    xMax = 1;
  }
  if (xMin === xMax) xMax = xMin + 1;
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) yMax = yMin + 1;
  if (!Number.isFinite(sizeMin) || !Number.isFinite(sizeMax)) {
    sizeMin = 0;
    sizeMax = 0;
  }
  if (xDomain) {
    xMin = xDomain[0];
    xMax = xDomain[1];
  }
  if (yDomain) {
    yMin = yDomain[0];
    yMax = yDomain[1];
  }
  return { xMin, xMax, yMin, yMax, sizeMin, sizeMax };
}

export function getSizeScale(
  sizeMin: number,
  sizeMax: number,
  minPx: number,
  maxPx: number,
): (value: number | undefined) => number {
  const range = sizeMax - sizeMin;
  return (value: number | undefined) => {
    if (
      value === undefined ||
      !Number.isFinite(value) ||
      range <= 0
    ) {
      return minPx;
    }
    const ratio = Math.max(0, Math.min(1, (value - sizeMin) / range));
    return minPx + ratio * (maxPx - minPx);
  };
}

export function findNearestScatterPoint(
  series: readonly ChartScatterSeries[],
  screenX: number,
  screenY: number,
  positions: ReadonlyArray<ReadonlyArray<{ x: number; y: number }>>,
  maxDistance: number = 24,
): {
  seriesIndex: number;
  pointIndex: number;
  distance: number;
} | null {
  let best:
    | { seriesIndex: number; pointIndex: number; distance: number }
    | null = null;
  for (let si = 0; si < series.length; si += 1) {
    const points = positions[si] ?? [];
    for (let pi = 0; pi < points.length; pi += 1) {
      const p = points[pi]!;
      const dx = p.x - screenX;
      const dy = p.y - screenY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDistance) continue;
      if (best === null || dist < best.distance) {
        best = { seriesIndex: si, pointIndex: pi, distance: dist };
      }
    }
  }
  return best;
}

// Generate the SVG path/element coordinates for a shape
// centered at (cx, cy) with half-size `s`.
export function buildShapePath(
  shape: ChartScatterShape,
  cx: number,
  cy: number,
  s: number,
): string {
  if (shape === 'square') {
    return `M ${(cx - s).toFixed(2)} ${(cy - s).toFixed(2)} L ${(cx + s).toFixed(2)} ${(cy - s).toFixed(2)} L ${(cx + s).toFixed(2)} ${(cy + s).toFixed(2)} L ${(cx - s).toFixed(2)} ${(cy + s).toFixed(2)} Z`;
  }
  if (shape === 'triangle') {
    return `M ${cx.toFixed(2)} ${(cy - s).toFixed(2)} L ${(cx + s).toFixed(2)} ${(cy + s).toFixed(2)} L ${(cx - s).toFixed(2)} ${(cy + s).toFixed(2)} Z`;
  }
  if (shape === 'diamond') {
    return `M ${cx.toFixed(2)} ${(cy - s).toFixed(2)} L ${(cx + s).toFixed(2)} ${cy.toFixed(2)} L ${cx.toFixed(2)} ${(cy + s).toFixed(2)} L ${(cx - s).toFixed(2)} ${cy.toFixed(2)} Z`;
  }
  // circle approximated via SVG arc
  return `M ${(cx - s).toFixed(2)} ${cy.toFixed(2)} A ${s} ${s} 0 1 0 ${(cx + s).toFixed(2)} ${cy.toFixed(2)} A ${s} ${s} 0 1 0 ${(cx - s).toFixed(2)} ${cy.toFixed(2)} Z`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartScatter = forwardRef(function ChartScatter(
  {
    series,
    width = DEFAULT_CHART_SCATTER_WIDTH,
    height = DEFAULT_CHART_SCATTER_HEIGHT,
    padding = DEFAULT_CHART_SCATTER_PADDING,
    axisLabel,
    showGrid = true,
    showTooltip = true,
    showAxisTicks = true,
    showLegend = true,
    animate = true,
    dotSize = DEFAULT_CHART_SCATTER_DOT_SIZE,
    minDotSize = DEFAULT_CHART_SCATTER_MIN_DOT_SIZE,
    maxDotSize = DEFAULT_CHART_SCATTER_MAX_DOT_SIZE,
    className,
    ariaLabel = 'Scatter plot',
    formatX,
    formatY,
    formatSize,
    tickCount = DEFAULT_CHART_SCATTER_TICK_COUNT,
    xDomain,
    yDomain,
    onPointClick,
    legendPlacement = 'right',
  }: ChartScatterProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const bounds = useMemo(
    () => getChartScatterBounds(series, xDomain, yDomain),
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
  const sizeScale = useMemo(
    () =>
      getSizeScale(
        bounds.sizeMin,
        bounds.sizeMax,
        minDotSize,
        maxDotSize,
      ),
    [bounds.sizeMax, bounds.sizeMin, maxDotSize, minDotSize],
  );

  const positions = useMemo(
    () =>
      series.map((s) =>
        s.data.map((p) => ({
          x: padding + xScale(p.x),
          y: height - padding - yScale(p.y),
        })),
      ),
    [height, padding, series, xScale, yScale],
  );

  const xTicks = useMemo(
    () => getChartLineTicks(bounds.xMin, bounds.xMax, tickCount),
    [bounds.xMax, bounds.xMin, tickCount],
  );
  const yTicks = useMemo(
    () => getChartLineTicks(bounds.yMin, bounds.yMax, tickCount),
    [bounds.yMax, bounds.yMin, tickCount],
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

  const hoveredPoint = useMemo(() => {
    if (!hovered) return null;
    const s = series[hovered.seriesIndex];
    const p = s?.data[hovered.pointIndex];
    const pos = positions[hovered.seriesIndex]?.[hovered.pointIndex];
    if (!s || !p || !pos) return null;
    return { series: s, point: p, screen: pos };
  }, [hovered, positions, series]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-scatter"
      data-series-count={series.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'flex w-full items-start gap-4',
        legendPlacement === 'bottom' && 'flex-col items-stretch',
        className,
      )}
    >
      <div
        data-section="chart-scatter-canvas"
        className="relative shrink-0"
        style={{ width, height }}
      >
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          data-section="chart-scatter-svg"
          className="h-auto w-full"
        >
          {/* Axes */}
          <line
            aria-hidden="true"
            data-section="chart-scatter-axis-x"
            x1={padding}
            y1={height - padding}
            x2={width - padding}
            y2={height - padding}
            stroke="currentColor"
            strokeOpacity={0.2}
          />
          <line
            aria-hidden="true"
            data-section="chart-scatter-axis-y"
            x1={padding}
            y1={padding}
            x2={padding}
            y2={height - padding}
            stroke="currentColor"
            strokeOpacity={0.2}
          />
          {/* Grid */}
          {showGrid
            ? yTicks.map((tick, idx) => {
                const y = height - padding - yScale(tick);
                return (
                  <g
                    key={`y-${idx}`}
                    data-section="chart-scatter-grid-y"
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
                        data-section="chart-scatter-tick-y"
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
                    data-section="chart-scatter-grid-x"
                    data-tick-value={tick}
                  >
                    <text
                      aria-hidden="true"
                      data-section="chart-scatter-tick-x"
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
          {/* Points */}
          {series.map((s, si) => {
            const color = s.color ?? getDefaultBarColor(si);
            const shape: ChartScatterShape = s.shape ?? 'circle';
            return (
              <g
                key={s.id}
                data-section="chart-scatter-series"
                data-series-id={s.id}
                data-series-color={color}
                data-series-shape={shape}
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                {s.data.map((p, pi) => {
                  const pos = positions[si]?.[pi];
                  if (!pos) return null;
                  const sz =
                    p.size !== undefined
                      ? sizeScale(p.size)
                      : dotSize;
                  const isHovered =
                    hovered?.seriesIndex === si &&
                    hovered?.pointIndex === pi;
                  const d = buildShapePath(shape, pos.x, pos.y, sz);
                  return (
                    <path
                      key={`${s.id}-${pi}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={
                        p.label
                          ? p.label
                          : `${s.label}: x=${formatChartLineTick(p.x, formatX)}, y=${formatChartLineTick(p.y, formatY)}`
                      }
                      data-section="chart-scatter-point"
                      data-series-id={s.id}
                      data-point-index={pi}
                      data-hovered={isHovered ? 'true' : 'false'}
                      d={d}
                      fill={color}
                      fillOpacity={isHovered ? 0.95 : 0.7}
                      stroke={isHovered ? color : 'none'}
                      strokeWidth={isHovered ? 1.5 : 0}
                      onMouseEnter={() => handleEnter(si, pi)}
                      onMouseLeave={handleLeave}
                      onFocus={() => handleEnter(si, pi)}
                      onBlur={handleLeave}
                      onClick={
                        onPointClick
                          ? () =>
                              onPointClick({
                                series: s,
                                point: p,
                                seriesIndex: si,
                                pointIndex: pi,
                              })
                          : undefined
                      }
                      style={{
                        cursor: onPointClick ? 'pointer' : 'default',
                      }}
                    />
                  );
                })}
              </g>
            );
          })}
          {/* Axis title labels */}
          {axisLabel?.x ? (
            <text
              aria-hidden="true"
              data-section="chart-scatter-axis-x-label"
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
              data-section="chart-scatter-axis-y-label"
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
        {showTooltip && hoveredPoint ? (
          <div
            role="tooltip"
            data-section="chart-scatter-tooltip"
            data-series-id={hoveredPoint.series.id}
            style={{
              left: hoveredPoint.screen.x + 8,
              top: hoveredPoint.screen.y - 8,
            }}
            className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
          >
            <div
              data-section="chart-scatter-tooltip-label"
              className="font-medium"
            >
              {hoveredPoint.series.label}
            </div>
            <div
              data-section="chart-scatter-tooltip-coords"
              className="font-mono text-muted-foreground"
            >
              x={formatChartLineTick(hoveredPoint.point.x, formatX)},
              y={formatChartLineTick(hoveredPoint.point.y, formatY)}
            </div>
            {hoveredPoint.point.size !== undefined ? (
              <div
                data-section="chart-scatter-tooltip-size"
                className="font-mono text-muted-foreground"
              >
                size=
                {formatSize
                  ? formatSize(hoveredPoint.point.size)
                  : hoveredPoint.point.size}
              </div>
            ) : null}
            {hoveredPoint.point.label !== undefined ? (
              <div
                data-section="chart-scatter-tooltip-point-label"
                className="text-foreground"
              >
                {hoveredPoint.point.label}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-scatter-legend"
          data-placement={legendPlacement}
          className={cn(
            'flex flex-col gap-1 text-xs',
            legendPlacement === 'bottom' &&
              'flex-row flex-wrap gap-3',
          )}
        >
          {series.map((s, si) => {
            const color = s.color ?? getDefaultBarColor(si);
            const shape = s.shape ?? 'circle';
            return (
              <li
                key={s.id}
                data-section="chart-scatter-legend-item"
                data-series-id={s.id}
                className="flex items-center gap-1.5"
              >
                <svg
                  aria-hidden="true"
                  data-section="chart-scatter-legend-glyph"
                  data-shape={shape}
                  width={12}
                  height={12}
                  viewBox="0 0 12 12"
                >
                  <path
                    d={buildShapePath(shape, 6, 6, 5)}
                    fill={color}
                  />
                </svg>
                <span
                  data-section="chart-scatter-legend-label"
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

ChartScatter.displayName = 'ChartScatter';
