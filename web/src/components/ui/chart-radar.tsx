import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { getDefaultBarColor } from './chart-bar';

// (v1.11.463, TODO 11.445) ChartRadar primitive.
//
// Pure-SVG radar / spider chart. Each axis is a labelled
// dimension; each series draws a filled polygon connecting
// per-axis values. The polar grid is rendered as N
// concentric polygons + one radial spoke per axis. Hovering
// a data point opens a tooltip with the series + axis +
// formatted value. Legend renders to the right (default) or
// below the chart.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartRadarAxis {
  id: string;
  label: string;
  max?: number;
}

export interface ChartRadarSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
  fillOpacity?: number;
}

export interface ChartRadarProps {
  axes: readonly ChartRadarAxis[];
  series: readonly ChartRadarSeries[];
  size?: number;
  padding?: number;
  levels?: number;
  maxValue?: number;
  showGrid?: boolean;
  showAxisLabels?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showPoints?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  onPointClick?: (args: {
    series: ChartRadarSeries;
    axis: ChartRadarAxis;
    value: number;
    seriesIndex: number;
    axisIndex: number;
  }) => void;
  legendPlacement?: 'right' | 'bottom';
  pointSize?: number;
  strokeWidth?: number;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_RADAR_SIZE = 320;
export const DEFAULT_CHART_RADAR_PADDING = 48;
export const DEFAULT_CHART_RADAR_LEVELS = 4;
export const DEFAULT_CHART_RADAR_FILL_OPACITY = 0.2;
export const DEFAULT_CHART_RADAR_POINT_SIZE = 3;
export const DEFAULT_CHART_RADAR_STROKE_WIDTH = 1.5;

// Returns the polar angle (radians) for the Nth axis on a
// chart with `total` axes. The first axis sits straight up
// (12 o'clock) and axes go clockwise.
export function getRadarAxisAngle(
  axisIndex: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return (axisIndex / total) * Math.PI * 2 - Math.PI / 2;
}

// Map a data value through a per-axis or global max onto a
// 2D coordinate around (cx, cy) with the supplied chart
// radius. Non-finite / negative values clamp to 0 so the
// polygon stays inside the chart.
export function getRadarPoint(
  value: number,
  max: number,
  angle: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number } {
  let ratio = 0;
  if (Number.isFinite(value) && max > 0) {
    ratio = Math.max(0, Math.min(1, value / max));
  }
  const r = radius * ratio;
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

// Compute the max value across all series, honouring
// per-axis `max` overrides. Returns 1 when no finite values
// are present so the radar still renders.
export function getRadarMax(
  axes: readonly ChartRadarAxis[],
  series: readonly ChartRadarSeries[],
  maxOverride?: number,
): number {
  if (maxOverride !== undefined && Number.isFinite(maxOverride)) {
    return maxOverride > 0 ? maxOverride : 1;
  }
  let max = Number.NEGATIVE_INFINITY;
  for (let ai = 0; ai < axes.length; ai += 1) {
    const axisMax = axes[ai]?.max;
    if (axisMax !== undefined && Number.isFinite(axisMax)) {
      if (axisMax > max) max = axisMax;
    }
  }
  for (const s of series) {
    for (const v of s.data) {
      if (Number.isFinite(v) && v > max) max = v;
    }
  }
  if (!Number.isFinite(max) || max <= 0) return 1;
  return max;
}

// Build the polygon outline of a level grid line at the
// supplied ratio (0..1) of the chart radius.
export function buildRadarGridLevelPoints(
  axisCount: number,
  ratio: number,
  cx: number,
  cy: number,
  radius: number,
): string {
  if (axisCount <= 0) return '';
  const r = radius * Math.max(0, Math.min(1, ratio));
  const pts: string[] = [];
  for (let i = 0; i < axisCount; i += 1) {
    const a = getRadarAxisAngle(i, axisCount);
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

// Build the polygon outline for a single series.
export function buildRadarSeriesPoints(
  series: ChartRadarSeries,
  axes: readonly ChartRadarAxis[],
  max: number,
  cx: number,
  cy: number,
  radius: number,
): string {
  const pts: string[] = [];
  for (let i = 0; i < axes.length; i += 1) {
    const value = series.data[i] ?? 0;
    const axisMax = axes[i]?.max;
    const useMax =
      axisMax !== undefined && axisMax > 0 ? axisMax : max;
    const { x, y } = getRadarPoint(
      value,
      useMax,
      getRadarAxisAngle(i, axes.length),
      cx,
      cy,
      radius,
    );
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

// Find the closest series-point to (sx, sy) in screen space.
export function findRadarPointHit(
  positions: ReadonlyArray<
    ReadonlyArray<{ x: number; y: number }>
  >,
  sx: number,
  sy: number,
  maxDistance: number = 18,
): {
  seriesIndex: number;
  axisIndex: number;
  distance: number;
} | null {
  let best:
    | { seriesIndex: number; axisIndex: number; distance: number }
    | null = null;
  for (let si = 0; si < positions.length; si += 1) {
    const points = positions[si] ?? [];
    for (let ai = 0; ai < points.length; ai += 1) {
      const p = points[ai]!;
      const dx = p.x - sx;
      const dy = p.y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDistance) continue;
      if (best === null || dist < best.distance) {
        best = { seriesIndex: si, axisIndex: ai, distance: dist };
      }
    }
  }
  return best;
}

// Default ARIA description summarising the data.
export function describeRadarChart(
  axes: readonly ChartRadarAxis[],
  series: readonly ChartRadarSeries[],
  formatValue?: (v: number) => string,
): string {
  if (axes.length === 0 || series.length === 0) {
    return 'No data';
  }
  const fmt = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const parts = series.map((s) => {
    const items = axes
      .map((axis, i) => {
        const value = s.data[i] ?? 0;
        return `${axis.label} ${fmt(value)}`;
      })
      .join(', ');
    return `${s.label}: ${items}`;
  });
  return `Radar with ${axes.length} axes. ${parts.join('. ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartRadar = forwardRef(function ChartRadar(
  {
    axes,
    series,
    size = DEFAULT_CHART_RADAR_SIZE,
    padding = DEFAULT_CHART_RADAR_PADDING,
    levels = DEFAULT_CHART_RADAR_LEVELS,
    maxValue,
    showGrid = true,
    showAxisLabels = true,
    showLegend = true,
    showTooltip = true,
    showPoints = true,
    animate = true,
    className,
    ariaLabel = 'Radar chart',
    ariaDescription,
    formatValue,
    onPointClick,
    legendPlacement = 'right',
    pointSize = DEFAULT_CHART_RADAR_POINT_SIZE,
    strokeWidth = DEFAULT_CHART_RADAR_STROKE_WIDTH,
  }: ChartRadarProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.max(0, size / 2 - padding);
  const max = useMemo(
    () => getRadarMax(axes, series, maxValue),
    [axes, maxValue, series],
  );

  const axisEnds = useMemo(
    () =>
      axes.map((_axis, i) => {
        const a = getRadarAxisAngle(i, axes.length);
        return {
          x: cx + radius * Math.cos(a),
          y: cy + radius * Math.sin(a),
          angle: a,
        };
      }),
    [axes, cx, cy, radius],
  );

  const seriesPositions = useMemo(
    () =>
      series.map((s) => {
        const arr: { x: number; y: number }[] = [];
        for (let i = 0; i < axes.length; i += 1) {
          const value = s.data[i] ?? 0;
          const axisMax = axes[i]?.max;
          const useMax =
            axisMax !== undefined && axisMax > 0
              ? axisMax
              : max;
          arr.push(
            getRadarPoint(
              value,
              useMax,
              getRadarAxisAngle(i, axes.length),
              cx,
              cy,
              radius,
            ),
          );
        }
        return arr;
      }),
    [axes, cx, cy, max, radius, series],
  );

  const description = useMemo(
    () =>
      ariaDescription ?? describeRadarChart(axes, series, formatValue),
    [ariaDescription, axes, formatValue, series],
  );

  const levelRatios = useMemo(() => {
    const arr: number[] = [];
    const n = Math.max(1, levels);
    for (let i = 1; i <= n; i += 1) arr.push(i / n);
    return arr;
  }, [levels]);

  const [hovered, setHovered] = useState<{
    seriesIndex: number;
    axisIndex: number;
  } | null>(null);

  const handleEnter = useCallback(
    (seriesIndex: number, axisIndex: number) => {
      setHovered({ seriesIndex, axisIndex });
    },
    [],
  );
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const hoveredInfo = useMemo(() => {
    if (!hovered) return null;
    const s = series[hovered.seriesIndex];
    const a = axes[hovered.axisIndex];
    const pos = seriesPositions[hovered.seriesIndex]?.[hovered.axisIndex];
    if (!s || !a || !pos) return null;
    const value = s.data[hovered.axisIndex] ?? 0;
    return { series: s, axis: a, value, screen: pos };
  }, [axes, hovered, series, seriesPositions]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-radar"
      data-axis-count={axes.length}
      data-series-count={series.length}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'flex w-full items-start gap-4',
        legendPlacement === 'bottom' && 'flex-col items-stretch',
        className,
      )}
    >
      <div
        data-section="chart-radar-canvas"
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <span
          data-section="chart-radar-aria-desc"
          className="sr-only"
        >
          {description}
        </span>
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          data-section="chart-radar-svg"
          className="h-auto w-full"
        >
          {showGrid
            ? levelRatios.map((ratio, idx) => (
                <polygon
                  key={`level-${idx}`}
                  aria-hidden="true"
                  data-section="chart-radar-grid-level"
                  data-level-index={idx}
                  data-level-ratio={ratio.toFixed(4)}
                  points={buildRadarGridLevelPoints(
                    axes.length,
                    ratio,
                    cx,
                    cy,
                    radius,
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={idx === levelRatios.length - 1 ? 0.25 : 0.12}
                />
              ))
            : null}
          {showGrid
            ? axisEnds.map((end, i) => (
                <line
                  key={`spoke-${i}`}
                  aria-hidden="true"
                  data-section="chart-radar-spoke"
                  data-axis-id={axes[i]?.id}
                  x1={cx}
                  y1={cy}
                  x2={end.x}
                  y2={end.y}
                  stroke="currentColor"
                  strokeOpacity={0.15}
                />
              ))
            : null}
          {showAxisLabels
            ? axes.map((axis, i) => {
                const a = axisEnds[i];
                if (!a) return null;
                const labelRadius = radius + 16;
                const lx = cx + labelRadius * Math.cos(a.angle);
                const ly = cy + labelRadius * Math.sin(a.angle);
                const anchor =
                  Math.abs(Math.cos(a.angle)) < 0.2
                    ? 'middle'
                    : Math.cos(a.angle) > 0
                      ? 'start'
                      : 'end';
                return (
                  <text
                    key={`axis-label-${axis.id}`}
                    aria-hidden="true"
                    data-section="chart-radar-axis-label"
                    data-axis-id={axis.id}
                    x={lx}
                    y={ly}
                    textAnchor={anchor}
                    alignmentBaseline="middle"
                    fontSize={11}
                    fill="currentColor"
                    fillOpacity={0.75}
                  >
                    {axis.label}
                  </text>
                );
              })
            : null}
          {series.map((s, si) => {
            const color = s.color ?? getDefaultBarColor(si);
            const fillOpacity =
              s.fillOpacity ?? DEFAULT_CHART_RADAR_FILL_OPACITY;
            const points = buildRadarSeriesPoints(
              s,
              axes,
              max,
              cx,
              cy,
              radius,
            );
            return (
              <g
                key={s.id}
                data-section="chart-radar-series"
                data-series-id={s.id}
                data-series-color={color}
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                <polygon
                  aria-hidden="true"
                  data-section="chart-radar-polygon"
                  data-series-id={s.id}
                  points={points}
                  fill={color}
                  fillOpacity={fillOpacity}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                />
                {showPoints
                  ? seriesPositions[si]?.map((p, ai) => {
                      const isHovered =
                        hovered?.seriesIndex === si &&
                        hovered?.axisIndex === ai;
                      const r = isHovered
                        ? pointSize + 1
                        : pointSize;
                      const value = s.data[ai] ?? 0;
                      const axis = axes[ai];
                      const aria = axis
                        ? `${s.label} ${axis.label}: ${formatValue ? formatValue(value) : value}`
                        : `${s.label}: ${formatValue ? formatValue(value) : value}`;
                      return (
                        <circle
                          key={`pt-${s.id}-${ai}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={aria}
                          data-section="chart-radar-point"
                          data-series-id={s.id}
                          data-axis-id={axes[ai]?.id}
                          data-axis-index={ai}
                          data-hovered={isHovered ? 'true' : 'false'}
                          cx={p.x}
                          cy={p.y}
                          r={r}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => handleEnter(si, ai)}
                          onMouseLeave={handleLeave}
                          onFocus={() => handleEnter(si, ai)}
                          onBlur={handleLeave}
                          onClick={
                            onPointClick && axes[ai]
                              ? () =>
                                  onPointClick({
                                    series: s,
                                    axis: axes[ai]!,
                                    value,
                                    seriesIndex: si,
                                    axisIndex: ai,
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
        {showTooltip && hoveredInfo ? (
          <div
            role="tooltip"
            data-section="chart-radar-tooltip"
            data-series-id={hoveredInfo.series.id}
            data-axis-id={hoveredInfo.axis.id}
            style={{
              left: hoveredInfo.screen.x + 8,
              top: hoveredInfo.screen.y - 8,
            }}
            className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
          >
            <div
              data-section="chart-radar-tooltip-series"
              className="font-medium"
            >
              {hoveredInfo.series.label}
            </div>
            <div
              data-section="chart-radar-tooltip-axis"
              className="text-muted-foreground"
            >
              {hoveredInfo.axis.label}
            </div>
            <div
              data-section="chart-radar-tooltip-value"
              className="font-mono"
            >
              {formatValue
                ? formatValue(hoveredInfo.value)
                : hoveredInfo.value}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-radar-legend"
          data-placement={legendPlacement}
          className={cn(
            'flex flex-col gap-1 text-xs',
            legendPlacement === 'bottom' &&
              'flex-row flex-wrap gap-3',
          )}
        >
          {series.map((s, si) => {
            const color = s.color ?? getDefaultBarColor(si);
            return (
              <li
                key={s.id}
                data-section="chart-radar-legend-item"
                data-series-id={s.id}
                className="flex items-center gap-1.5"
              >
                <span
                  aria-hidden="true"
                  data-section="chart-radar-legend-swatch"
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: color }}
                />
                <span
                  data-section="chart-radar-legend-label"
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

ChartRadar.displayName = 'ChartRadar';
