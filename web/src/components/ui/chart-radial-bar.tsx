import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { cn } from '../../lib/cn';

// (v1.11.470, TODO 11.452) ChartRadialBar primitive.
//
// Pure-SVG concentric radial bar chart. Each series gets a
// dedicated ring at its own radius; an arc inside the ring
// is drawn proportional to the value (0 -> max). A
// background "track" arc behind each bar provides the
// completion context. The center of the chart hosts an
// optional label slot for an aggregate value or legend.
// Hover / focus on an arc opens a tooltip with the series
// label + value + % of max.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartRadialBarSeries {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartRadialBarProps {
  series: readonly ChartRadialBarSeries[];
  width?: number;
  height?: number;
  maxValue?: number;
  startAngle?: number;
  endAngle?: number;
  barWidth?: number;
  barGap?: number;
  trackColor?: string;
  showCenterLabel?: boolean;
  centerLabel?: ReactNode;
  showLabels?: boolean;
  showValues?: boolean;
  showTooltip?: boolean;
  showAxisTicks?: boolean;
  tickCount?: number;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (v: number) => string;
  onSeriesClick?: (args: {
    series: ChartRadialBarSeries;
    index: number;
    value: number;
    ratio: number;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_RADIAL_BAR_WIDTH = 320;
export const DEFAULT_CHART_RADIAL_BAR_HEIGHT = 320;
export const DEFAULT_CHART_RADIAL_BAR_START_ANGLE = -90;
export const DEFAULT_CHART_RADIAL_BAR_END_ANGLE = 270;
export const DEFAULT_CHART_RADIAL_BAR_BAR_WIDTH = 14;
export const DEFAULT_CHART_RADIAL_BAR_BAR_GAP = 4;
export const DEFAULT_CHART_RADIAL_BAR_TRACK_COLOR = '#e2e8f0';
export const DEFAULT_CHART_RADIAL_BAR_TICK_COUNT = 4;

// Compute the chart maximum value. Honours the explicit
// override; otherwise picks the largest series value.
// Falls back to 1 when nothing finite is present so the
// chart still renders.
export function getRadialBarMax(
  series: readonly ChartRadialBarSeries[],
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
  for (const s of series) {
    if (Number.isFinite(s.value) && s.value > max) max = s.value;
  }
  if (!Number.isFinite(max) || max <= 0) return 1;
  return max;
}

// Clamp ratio of value / max into [0, 1].
export function getRadialBarRatio(
  value: number,
  max: number,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(max) || max <= 0) return 0;
  if (value >= max) return 1;
  return value / max;
}

// Convert polar coordinates (radius + degrees from East
// going counter-clockwise) to cartesian xy. We map degrees
// using the SVG convention: 0 = right (East), 90 = down,
// -90 = top.
export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleDegrees: number,
): { x: number; y: number } {
  const rad = (angleDegrees * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

// Build the SVG path for an annular arc segment between
// `innerRadius` and `outerRadius`, sweeping from
// `startAngle` to `endAngle` (degrees).
export function buildRadialArcPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  if (outerRadius <= 0 || innerRadius < 0) return '';
  const sweep = endAngle - startAngle;
  if (Math.abs(sweep) < 0.001) return '';
  const largeArc = Math.abs(sweep) > 180 ? 1 : 0;
  const sweepFlag = sweep > 0 ? 1 : 0;
  const innerSweepFlag = sweep > 0 ? 0 : 1;
  const p1 = polarToCartesian(cx, cy, outerRadius, startAngle);
  const p2 = polarToCartesian(cx, cy, outerRadius, endAngle);
  const p3 = polarToCartesian(cx, cy, innerRadius, endAngle);
  const p4 = polarToCartesian(cx, cy, innerRadius, startAngle);
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} ${sweepFlag} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArc} ${innerSweepFlag} ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

// Evenly-spaced angular tick positions (degrees) along the
// arc span. Always includes endpoints when count >= 2.
export function getRadialTickPositions(
  startAngle: number,
  endAngle: number,
  count: number = DEFAULT_CHART_RADIAL_BAR_TICK_COUNT,
): number[] {
  if (!Number.isFinite(startAngle) || !Number.isFinite(endAngle)) {
    return [];
  }
  const safeCount = Math.max(2, Math.floor(count));
  const span = endAngle - startAngle;
  const step = span / (safeCount - 1);
  const out: number[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    out.push(startAngle + i * step);
  }
  return out;
}

// One-line ARIA summary of the radial bar series.
export function describeRadialBarChart(
  series: readonly ChartRadialBarSeries[],
  max: number,
  formatValue?: (v: number) => string,
  formatPercent?: (v: number) => string,
): string {
  if (series.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const fp = (v: number) =>
    formatPercent
      ? formatPercent(v)
      : `${(v * 100).toFixed(1)}%`;
  const parts = series.map((s) => {
    const ratio = getRadialBarRatio(s.value, max);
    return `${s.label} ${fv(s.value)} (${fp(ratio)})`;
  });
  return `Radial bar chart with ${series.length} series. ${parts.join(', ')}.`;
}

// Default palette used when a series omits `color`.
export function getDefaultRadialBarColor(index: number): string {
  const palette = [
    '#2563eb',
    '#16a34a',
    '#dc2626',
    '#f59e0b',
    '#8b5cf6',
    '#0891b2',
    '#db2777',
    '#475569',
  ];
  if (index < 0) return palette[0]!;
  return palette[index % palette.length]!;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartRadialBar = forwardRef(function ChartRadialBar(
  {
    series,
    width = DEFAULT_CHART_RADIAL_BAR_WIDTH,
    height = DEFAULT_CHART_RADIAL_BAR_HEIGHT,
    maxValue,
    startAngle = DEFAULT_CHART_RADIAL_BAR_START_ANGLE,
    endAngle = DEFAULT_CHART_RADIAL_BAR_END_ANGLE,
    barWidth = DEFAULT_CHART_RADIAL_BAR_BAR_WIDTH,
    barGap = DEFAULT_CHART_RADIAL_BAR_BAR_GAP,
    trackColor = DEFAULT_CHART_RADIAL_BAR_TRACK_COLOR,
    showCenterLabel = true,
    centerLabel,
    showLabels = true,
    showValues = true,
    showTooltip = true,
    showAxisTicks = true,
    tickCount = DEFAULT_CHART_RADIAL_BAR_TICK_COUNT,
    animate = true,
    className,
    ariaLabel = 'Radial bar chart',
    ariaDescription,
    formatValue,
    formatPercent,
    onSeriesClick,
  }: ChartRadialBarProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const cx = width / 2;
  const cy = height / 2;
  const padding = 16;
  const max = useMemo(
    () => getRadialBarMax(series, maxValue),
    [maxValue, series],
  );
  const outerRadius = Math.min(cx, cy) - padding;
  const totalThickness =
    series.length === 0
      ? 0
      : series.length * barWidth +
        Math.max(0, series.length - 1) * barGap;
  // We render from outer-most ring -> inner-most ring as series order.
  // Each series occupies barWidth of radial thickness.

  const ringRadii = useMemo(() => {
    const rings: { inner: number; outer: number }[] = [];
    let outer = outerRadius;
    for (let i = 0; i < series.length; i += 1) {
      const inner = Math.max(0, outer - barWidth);
      rings.push({ inner, outer });
      outer = inner - barGap;
    }
    return rings;
  }, [barGap, barWidth, outerRadius, series.length]);

  const ticks = useMemo(
    () =>
      getRadialTickPositions(startAngle, endAngle, tickCount),
    [endAngle, startAngle, tickCount],
  );

  const description = useMemo(
    () =>
      ariaDescription ??
      describeRadialBarChart(
        series,
        max,
        formatValue,
        formatPercent,
      ),
    [
      ariaDescription,
      formatPercent,
      formatValue,
      max,
      series,
    ],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number) => {
    setHovered(idx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const fp = (v: number) =>
    formatPercent
      ? formatPercent(v)
      : `${(v * 100).toFixed(1)}%`;

  const hoveredSeries =
    hovered !== null ? series[hovered] : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-radial-bar"
      data-series-count={series.length}
      data-animate={animate ? 'true' : 'false'}
      data-max={max}
      className={cn(
        'relative inline-block w-full max-w-full',
        className,
      )}
      style={{ width }}
    >
      <span
        data-section="chart-radial-bar-aria-desc"
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
        data-section="chart-radial-bar-svg"
        className="h-auto w-full"
      >
        {/* Angular tick lines around the outer ring */}
        {showAxisTicks
          ? ticks.map((angle, idx) => {
              const inner = polarToCartesian(
                cx,
                cy,
                outerRadius + 4,
                angle,
              );
              const outer = polarToCartesian(
                cx,
                cy,
                outerRadius + 10,
                angle,
              );
              return (
                <line
                  key={`tick-${idx}`}
                  aria-hidden="true"
                  data-section="chart-radial-bar-tick"
                  data-tick-angle={angle.toFixed(2)}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="currentColor"
                  strokeOpacity={0.5}
                />
              );
            })
          : null}
        {/* Track + filled arc per series */}
        {series.map((s, i) => {
          const ring = ringRadii[i];
          if (!ring) return null;
          const ratio = getRadialBarRatio(s.value, max);
          const sweep = (endAngle - startAngle) * ratio;
          const valueEndAngle = startAngle + sweep;
          const color =
            s.color ?? getDefaultRadialBarColor(i);
          const isHovered = hovered === i;
          const trackPath = buildRadialArcPath(
            cx,
            cy,
            ring.inner,
            ring.outer,
            startAngle,
            endAngle,
          );
          const valuePath =
            ratio > 0
              ? buildRadialArcPath(
                  cx,
                  cy,
                  ring.inner,
                  ring.outer,
                  startAngle,
                  valueEndAngle,
                )
              : '';
          return (
            <g
              key={s.id}
              data-section="chart-radial-bar-series"
              data-series-id={s.id}
              data-series-index={i}
              data-series-color={color}
              data-series-value={s.value}
              data-series-ratio={ratio.toFixed(4)}
              data-hovered={isHovered ? 'true' : 'false'}
              className={cn(
                animate && 'motion-safe:animate-fade-in',
              )}
            >
              <path
                aria-hidden="true"
                data-section="chart-radial-bar-track"
                d={trackPath}
                fill={trackColor}
                fillOpacity={0.65}
              />
              {valuePath ? (
                <path
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${s.label}: ${fv(s.value)} (${fp(ratio)})`}
                  data-section="chart-radial-bar-arc"
                  data-series-id={s.id}
                  d={valuePath}
                  fill={color}
                  fillOpacity={isHovered ? 1 : 0.92}
                  stroke={isHovered ? color : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  onMouseEnter={() => handleEnter(i)}
                  onMouseLeave={handleLeave}
                  onFocus={() => handleEnter(i)}
                  onBlur={handleLeave}
                  onClick={
                    onSeriesClick
                      ? () =>
                          onSeriesClick({
                            series: s,
                            index: i,
                            value: s.value,
                            ratio,
                          })
                      : undefined
                  }
                  style={{
                    cursor: onSeriesClick
                      ? 'pointer'
                      : 'default',
                  }}
                />
              ) : null}
              {showLabels ? (
                <text
                  aria-hidden="true"
                  data-section="chart-radial-bar-label"
                  data-series-id={s.id}
                  x={polarToCartesian(
                    cx,
                    cy,
                    (ring.inner + ring.outer) / 2,
                    startAngle - 4,
                  ).x}
                  y={polarToCartesian(
                    cx,
                    cy,
                    (ring.inner + ring.outer) / 2,
                    startAngle - 4,
                  ).y}
                  textAnchor="end"
                  alignmentBaseline="middle"
                  fontSize={11}
                  fill="currentColor"
                  fillOpacity={0.85}
                >
                  {s.label}
                  {showValues ? ` (${fv(s.value)})` : ''}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* Center label slot */}
        {showCenterLabel && centerLabel !== undefined ? (
          <foreignObject
            data-section="chart-radial-bar-center"
            x={cx - 64}
            y={cy - 32}
            width={128}
            height={64}
          >
            <div className="flex h-full w-full items-center justify-center text-center text-sm font-medium text-foreground">
              {centerLabel}
            </div>
          </foreignObject>
        ) : null}
      </svg>
      {showTooltip && hoveredSeries && hovered !== null ? (
        <div
          role="tooltip"
          data-section="chart-radial-bar-tooltip"
          data-series-id={hoveredSeries.id}
          style={{
            left: cx + 8,
            top: cy + 8,
          }}
          className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
        >
          <div
            data-section="chart-radial-bar-tooltip-label"
            className="font-medium"
          >
            {hoveredSeries.label}
          </div>
          <div
            data-section="chart-radial-bar-tooltip-value"
            className="font-mono"
          >
            {fv(hoveredSeries.value)}
          </div>
          <div
            data-section="chart-radial-bar-tooltip-percent"
            className="text-muted-foreground"
          >
            {fp(getRadialBarRatio(hoveredSeries.value, max))}{' '}
            of max
          </div>
        </div>
      ) : null}
    </div>
  );
});

ChartRadialBar.displayName = 'ChartRadialBar';
