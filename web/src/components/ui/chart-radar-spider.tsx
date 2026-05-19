import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { polarToCartesian } from './chart-radial-bar';

// (v1.11.482, TODO 11.464) ChartRadarSpider primitive.
//
// Pure-SVG spider / radar variant. Unlike `<ChartRadar>`
// (11.445) which renders one filled polygon per series
// (colour-by-series), `<ChartRadarSpider>` decomposes each
// series's polygon into per-axis wedges -- each wedge is
// the triangle from chart centre through the data point at
// axis N to the data point at axis N+1, coloured by axis.
// The result emphasises the per-axis contribution rather
// than the per-series silhouette; great for highlighting
// which dimensions dominate a single profile.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartRadarSpiderAxis {
  id: string;
  label: string;
  max?: number;
  color?: string;
}

export interface ChartRadarSpiderSeries {
  id: string;
  label: string;
  data: readonly number[];
  outlineColor?: string;
}

export interface ChartRadarSpiderProps {
  axes: readonly ChartRadarSpiderAxis[];
  series: readonly ChartRadarSpiderSeries[];
  size?: number;
  padding?: number;
  levels?: number;
  maxValue?: number;
  showGrid?: boolean;
  showAxisLabels?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showPoints?: boolean;
  showOutline?: boolean;
  animate?: boolean;
  wedgeOpacity?: number;
  outlineOpacity?: number;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onWedgeClick?: (args: {
    series: ChartRadarSpiderSeries;
    axis: ChartRadarSpiderAxis;
    seriesIndex: number;
    axisIndex: number;
    value: number;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_RADAR_SPIDER_SIZE = 320;
export const DEFAULT_CHART_RADAR_SPIDER_PADDING = 48;
export const DEFAULT_CHART_RADAR_SPIDER_LEVELS = 4;
export const DEFAULT_CHART_RADAR_SPIDER_WEDGE_OPACITY = 0.28;
export const DEFAULT_CHART_RADAR_SPIDER_OUTLINE_OPACITY = 0.85;

// Per-axis colour palette. Distinct from the per-series
// palette used elsewhere so the primitive's identity stays
// clear at a glance.
export const DEFAULT_CHART_RADAR_SPIDER_AXIS_PALETTE = [
  '#0ea5e9', // sky
  '#22c55e', // green
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#f97316', // orange
  '#14b8a6', // teal
  '#eab308', // yellow
] as const;

// Default per-axis colour by index. Wraps around the
// palette modulo. Negative indices return the first colour.
export function getDefaultRadarSpiderAxisColor(
  index: number,
): string {
  const palette = DEFAULT_CHART_RADAR_SPIDER_AXIS_PALETTE;
  if (index < 0) return palette[0];
  return palette[index % palette.length]!;
}

// Polar angle (degrees) for the Nth axis. Axis 0 sits at
// 12 o'clock; the rest go clockwise. Total = 0 short-
// circuits to 0.
export function getRadarSpiderAngle(
  axisIndex: number,
  total: number,
): number {
  if (total <= 0) return -90;
  return (axisIndex / total) * 360 - 90;
}

// Compute the chart-wide maximum value. Honours an
// explicit override (positive + finite) first; then per-
// axis `max`; then the largest series datum. Falls back to
// 1 so the chart still renders.
export function getRadarSpiderMax(
  axes: readonly ChartRadarSpiderAxis[],
  series: readonly ChartRadarSpiderSeries[],
  override?: number,
): number {
  if (
    override !== undefined &&
    Number.isFinite(override) &&
    override > 0
  ) {
    return override;
  }
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < axes.length; i += 1) {
    const aMax = axes[i]?.max;
    if (
      aMax !== undefined &&
      Number.isFinite(aMax) &&
      aMax > max
    ) {
      max = aMax;
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

// Clamp value / max into [0, 1]. Non-finite / non-positive
// inputs collapse to 0.
export function getRadarSpiderRatio(
  value: number,
  max: number,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  if (value >= max) return 1;
  return value / max;
}

// Project a data value onto the chart for the given axis.
// Returns the cartesian (x, y) for the point along the
// axis at the supplied ratio.
export function getRadarSpiderPoint(
  axisIndex: number,
  totalAxes: number,
  ratio: number,
  cx: number,
  cy: number,
  radius: number,
): { x: number; y: number } {
  const angle = getRadarSpiderAngle(axisIndex, totalAxes);
  const r = radius * Math.max(0, Math.min(1, ratio));
  return polarToCartesian(cx, cy, r, angle);
}

// Build the SVG path for one wedge triangle (centre,
// pointA, pointB, close).
export function buildRadarSpiderWedgePath(
  cx: number,
  cy: number,
  pa: { x: number; y: number },
  pb: { x: number; y: number },
): string {
  if (
    !Number.isFinite(pa.x) ||
    !Number.isFinite(pa.y) ||
    !Number.isFinite(pb.x) ||
    !Number.isFinite(pb.y)
  ) {
    return '';
  }
  return [
    `M ${cx.toFixed(2)} ${cy.toFixed(2)}`,
    `L ${pa.x.toFixed(2)} ${pa.y.toFixed(2)}`,
    `L ${pb.x.toFixed(2)} ${pb.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// Build a level-ring polygon (grid line) at ratio `r` (in
// [0, 1]) around chart centre.
export function buildRadarSpiderGridPolygon(
  axisCount: number,
  ratio: number,
  cx: number,
  cy: number,
  radius: number,
): string {
  if (axisCount <= 0) return '';
  const pts: string[] = [];
  for (let i = 0; i < axisCount; i += 1) {
    const p = getRadarSpiderPoint(
      i,
      axisCount,
      ratio,
      cx,
      cy,
      radius,
    );
    pts.push(`${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  return pts.join(' ');
}

// Build a one-line ARIA description summarising the
// per-axis dominant series.
export function describeRadarSpiderChart(
  axes: readonly ChartRadarSpiderAxis[],
  series: readonly ChartRadarSpiderSeries[],
  formatValue?: (v: number) => string,
): string {
  if (axes.length === 0 || series.length === 0) {
    return 'No data';
  }
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const summary = series
    .map((s) => {
      const labels = axes
        .map((ax, i) => {
          const v = s.data[i];
          return `${ax.label} ${typeof v === 'number' && Number.isFinite(v) ? fv(v) : '?'}`;
        })
        .join(', ');
      return `${s.label}: ${labels}`;
    })
    .join('. ');
  return `Spider chart with ${axes.length} axes and ${series.length} series. ${summary}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartRadarSpider = forwardRef(function ChartRadarSpider(
  {
    axes,
    series,
    size = DEFAULT_CHART_RADAR_SPIDER_SIZE,
    padding = DEFAULT_CHART_RADAR_SPIDER_PADDING,
    levels = DEFAULT_CHART_RADAR_SPIDER_LEVELS,
    maxValue,
    showGrid = true,
    showAxisLabels = true,
    showLegend = true,
    showTooltip = true,
    showPoints = true,
    showOutline = true,
    animate = true,
    wedgeOpacity = DEFAULT_CHART_RADAR_SPIDER_WEDGE_OPACITY,
    outlineOpacity = DEFAULT_CHART_RADAR_SPIDER_OUTLINE_OPACITY,
    className,
    ariaLabel = 'Spider chart',
    ariaDescription,
    formatValue,
    legendPlacement = 'right',
    onWedgeClick,
  }: ChartRadarSpiderProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = Math.max(0, size / 2 - padding);
  const totalAxes = axes.length;

  const max = useMemo(
    () => getRadarSpiderMax(axes, series, maxValue),
    [axes, maxValue, series],
  );

  const axisColors = useMemo(() => {
    return axes.map(
      (ax, i) => ax.color ?? getDefaultRadarSpiderAxisColor(i),
    );
  }, [axes]);

  const axisRatios = useMemo(
    () =>
      series.map((s) =>
        axes.map((ax, i) => {
          const v = s.data[i];
          if (typeof v !== 'number' || !Number.isFinite(v)) {
            return 0;
          }
          const axisMax =
            ax.max !== undefined && ax.max > 0 ? ax.max : max;
          return getRadarSpiderRatio(v, axisMax);
        }),
      ),
    [axes, max, series],
  );

  const seriesPoints = useMemo(() => {
    return axisRatios.map((ratios) =>
      ratios.map((r, i) =>
        getRadarSpiderPoint(i, totalAxes, r, cx, cy, radius),
      ),
    );
  }, [axisRatios, cx, cy, radius, totalAxes]);

  const levelRatios = useMemo(() => {
    const out: number[] = [];
    const n = Math.max(1, levels);
    for (let i = 1; i <= n; i += 1) out.push(i / n);
    return out;
  }, [levels]);

  const description = useMemo(
    () =>
      ariaDescription ??
      describeRadarSpiderChart(axes, series, formatValue),
    [ariaDescription, axes, formatValue, series],
  );

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

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;

  const hoveredSeries =
    hovered ? series[hovered.seriesIndex] : null;
  const hoveredAxis = hovered ? axes[hovered.axisIndex] : null;
  const hoveredValue =
    hoveredSeries && hovered !== null
      ? hoveredSeries.data[hovered.axisIndex]
      : null;
  const hoveredPoint =
    hovered
      ? seriesPoints[hovered.seriesIndex]?.[hovered.axisIndex]
      : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-radar-spider"
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
        data-section="chart-radar-spider-canvas"
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <span
          data-section="chart-radar-spider-aria-desc"
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
          data-section="chart-radar-spider-svg"
          className="h-auto w-full"
        >
          {/* Grid level polygons */}
          {showGrid
            ? levelRatios.map((r, idx) => (
                <polygon
                  key={`grid-${idx}`}
                  aria-hidden="true"
                  data-section="chart-radar-spider-grid-level"
                  data-level-index={idx}
                  data-level-ratio={r.toFixed(4)}
                  points={buildRadarSpiderGridPolygon(
                    totalAxes,
                    r,
                    cx,
                    cy,
                    radius,
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeOpacity={
                    idx === levelRatios.length - 1 ? 0.3 : 0.12
                  }
                />
              ))
            : null}
          {/* Axis spokes */}
          {showGrid
            ? axes.map((ax, i) => {
                const tip = getRadarSpiderPoint(
                  i,
                  totalAxes,
                  1,
                  cx,
                  cy,
                  radius,
                );
                return (
                  <line
                    key={`spoke-${ax.id}`}
                    aria-hidden="true"
                    data-section="chart-radar-spider-spoke"
                    data-axis-id={ax.id}
                    x1={cx}
                    y1={cy}
                    x2={tip.x}
                    y2={tip.y}
                    stroke={axisColors[i]}
                    strokeOpacity={0.45}
                  />
                );
              })
            : null}
          {/* Axis labels */}
          {showAxisLabels
            ? axes.map((ax, i) => {
                const labelRadius = radius + 14;
                const p = getRadarSpiderPoint(
                  i,
                  totalAxes,
                  labelRadius / Math.max(1, radius),
                  cx,
                  cy,
                  radius,
                );
                const angle = getRadarSpiderAngle(i, totalAxes);
                const cosA = Math.cos((angle * Math.PI) / 180);
                const anchor =
                  Math.abs(cosA) < 0.2
                    ? 'middle'
                    : cosA > 0
                      ? 'start'
                      : 'end';
                return (
                  <text
                    key={`axis-label-${ax.id}`}
                    aria-hidden="true"
                    data-section="chart-radar-spider-axis-label"
                    data-axis-id={ax.id}
                    x={p.x}
                    y={p.y}
                    textAnchor={anchor}
                    alignmentBaseline="middle"
                    fontSize={11}
                    fontWeight={500}
                    fill={axisColors[i]}
                    fillOpacity={0.95}
                  >
                    {ax.label}
                  </text>
                );
              })
            : null}
          {/* Per-series wedges (one triangle per axis) */}
          {series.map((s, si) => {
            const pts = seriesPoints[si] ?? [];
            const outlinePath =
              pts.length > 0
                ? `M ${pts
                    .map(
                      (p, idx) =>
                        `${idx === 0 ? '' : 'L '}${p.x.toFixed(2)} ${p.y.toFixed(2)}`,
                    )
                    .join(' ')} Z`
                : '';
            return (
              <g
                key={`series-${s.id}`}
                data-section="chart-radar-spider-series"
                data-series-id={s.id}
                data-series-index={si}
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                {pts.map((pa, ai) => {
                  const pb = pts[(ai + 1) % pts.length];
                  if (!pb) return null;
                  const path = buildRadarSpiderWedgePath(
                    cx,
                    cy,
                    pa,
                    pb,
                  );
                  if (!path) return null;
                  const axis = axes[ai]!;
                  const color = axisColors[ai];
                  const isHovered =
                    hovered?.seriesIndex === si &&
                    hovered?.axisIndex === ai;
                  const op = isHovered
                    ? Math.max(wedgeOpacity + 0.3, 0.7)
                    : wedgeOpacity;
                  const value = s.data[ai];
                  return (
                    <path
                      key={`wedge-${s.id}-${axis.id}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} / ${axis.label}: ${typeof value === 'number' && Number.isFinite(value) ? fv(value) : '?'}`}
                      data-section="chart-radar-spider-wedge"
                      data-series-id={s.id}
                      data-axis-id={axis.id}
                      data-axis-index={ai}
                      data-wedge-color={color}
                      data-hovered={isHovered ? 'true' : 'false'}
                      d={path}
                      fill={color}
                      fillOpacity={op}
                      stroke={color}
                      strokeOpacity={isHovered ? 0.95 : 0.45}
                      strokeWidth={isHovered ? 1.5 : 0.75}
                      strokeLinejoin="round"
                      onMouseEnter={() => handleEnter(si, ai)}
                      onMouseLeave={handleLeave}
                      onFocus={() => handleEnter(si, ai)}
                      onBlur={handleLeave}
                      onClick={
                        onWedgeClick
                          ? () =>
                              onWedgeClick({
                                series: s,
                                axis,
                                seriesIndex: si,
                                axisIndex: ai,
                                value:
                                  typeof value === 'number' &&
                                  Number.isFinite(value)
                                    ? value
                                    : 0,
                              })
                          : undefined
                      }
                      style={{
                        cursor: onWedgeClick
                          ? 'pointer'
                          : 'default',
                      }}
                    />
                  );
                })}
                {/* Outline polygon connecting per-axis points */}
                {showOutline && outlinePath ? (
                  <path
                    aria-hidden="true"
                    data-section="chart-radar-spider-outline"
                    data-series-id={s.id}
                    d={outlinePath}
                    fill="none"
                    stroke={s.outlineColor ?? '#0f172a'}
                    strokeOpacity={outlineOpacity}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                ) : null}
                {/* Per-axis data points */}
                {showPoints
                  ? pts.map((p, ai) => {
                      const color = axisColors[ai];
                      return (
                        <circle
                          key={`pt-${s.id}-${axes[ai]?.id ?? ai}`}
                          aria-hidden="true"
                          data-section="chart-radar-spider-point"
                          data-series-id={s.id}
                          data-axis-id={axes[ai]?.id}
                          cx={p.x}
                          cy={p.y}
                          r={3}
                          fill={color}
                          stroke="#ffffff"
                          strokeWidth={1}
                        />
                      );
                    })
                  : null}
              </g>
            );
          })}
        </svg>
        {showTooltip &&
        hoveredSeries &&
        hoveredAxis &&
        hoveredPoint &&
        hovered !== null ? (
          <div
            role="tooltip"
            data-section="chart-radar-spider-tooltip"
            data-series-id={hoveredSeries.id}
            data-axis-id={hoveredAxis.id}
            style={{
              left: hoveredPoint.x + 8,
              top: hoveredPoint.y - 8,
            }}
            className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
          >
            <div
              data-section="chart-radar-spider-tooltip-series"
              className="font-medium"
            >
              {hoveredSeries.label}
            </div>
            <div
              data-section="chart-radar-spider-tooltip-axis"
              className="text-muted-foreground"
            >
              {hoveredAxis.label}
            </div>
            <div
              data-section="chart-radar-spider-tooltip-value"
              className="font-mono"
            >
              {typeof hoveredValue === 'number' &&
              Number.isFinite(hoveredValue)
                ? fv(hoveredValue)
                : '?'}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend && axes.length > 0 ? (
        <ul
          data-section="chart-radar-spider-legend"
          data-placement={legendPlacement}
          className={cn(
            'flex flex-col gap-1 text-xs',
            legendPlacement === 'bottom' &&
              'flex-row flex-wrap gap-3',
          )}
        >
          {axes.map((ax, i) => (
            <li
              key={ax.id}
              data-section="chart-radar-spider-legend-item"
              data-axis-id={ax.id}
              className="flex items-center gap-1.5"
            >
              <span
                aria-hidden="true"
                data-section="chart-radar-spider-legend-swatch"
                className="inline-block h-3 w-3 rounded"
                style={{ background: axisColors[i] }}
              />
              <span
                data-section="chart-radar-spider-legend-label"
                className="text-foreground"
              >
                {ax.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});

ChartRadarSpider.displayName = 'ChartRadarSpider';
