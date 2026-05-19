import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { getDefaultBarColor } from './chart-bar';

// (v1.11.458, TODO 11.440) ChartPie primitive.
//
// Pure-SVG pie / donut chart. Hovering a slice expands it
// outward by a small offset, a legend lists every slice with
// its color + percentage, optional per-slice percent labels
// sit on top of the arc, and the donut variant renders a
// configurable total readout in the centre. The root carries
// an `aria-describedby` reference to a visually-hidden text
// region that summarises every slice for screen readers.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartPieSlice {
  id: string;
  label: string;
  value: number;
  color?: string;
}

export interface ChartPieProps {
  data: readonly ChartPieSlice[];
  width?: number;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
  showPercentLabels?: boolean;
  showTotal?: boolean;
  totalLabel?: ReactNode;
  formatValue?: (n: number) => string;
  formatPercent?: (percent: number) => string;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  onSliceClick?: (slice: ChartPieSlice) => void;
  startAngle?: number;
  hoverExpand?: number;
  legendPlacement?: 'right' | 'bottom';
  legendFormat?: (slice: ChartPieSlice, percent: number) => ReactNode;
  emptyState?: ReactNode;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_PIE_WIDTH = 320;
export const DEFAULT_CHART_PIE_HEIGHT = 240;
export const DEFAULT_CHART_PIE_HOVER_EXPAND = 6;

export function getPieTotal(data: readonly ChartPieSlice[]): number {
  let sum = 0;
  for (const d of data) {
    if (Number.isFinite(d.value) && d.value > 0) sum += d.value;
  }
  return sum;
}

export interface ComputedSlice {
  slice: ChartPieSlice;
  index: number;
  value: number;
  percent: number;
  startAngle: number;
  endAngle: number;
  midAngle: number;
}

// Build per-slice angle ranges starting at `startAngle`
// (radians; default -PI/2 so the first slice begins at the
// top of the circle and progresses clockwise).
export function computePieSlices(
  data: readonly ChartPieSlice[],
  startAngle: number = -Math.PI / 2,
): { slices: ComputedSlice[]; total: number } {
  const total = getPieTotal(data);
  if (total <= 0) return { slices: [], total: 0 };
  const slices: ComputedSlice[] = [];
  let cursor = startAngle;
  for (let i = 0; i < data.length; i += 1) {
    const d = data[i]!;
    const value =
      Number.isFinite(d.value) && d.value > 0 ? d.value : 0;
    const percent = (value / total) * 100;
    const sweep = (value / total) * Math.PI * 2;
    const end = cursor + sweep;
    slices.push({
      slice: d,
      index: i,
      value,
      percent,
      startAngle: cursor,
      endAngle: end,
      midAngle: cursor + sweep / 2,
    });
    cursor = end;
  }
  return { slices, total };
}

export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angle: number,
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function arcPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  if (outerRadius <= 0) return '';
  if (Math.abs(endAngle - startAngle) >= Math.PI * 2 - 1e-9) {
    // Full circle (or annulus). Split into two arcs.
    const oTop = polarToCartesian(cx, cy, outerRadius, 0);
    const oBottom = polarToCartesian(cx, cy, outerRadius, Math.PI);
    if (innerRadius > 0) {
      const iTop = polarToCartesian(cx, cy, innerRadius, 0);
      const iBottom = polarToCartesian(cx, cy, innerRadius, Math.PI);
      return [
        `M ${oTop.x.toFixed(2)} ${oTop.y.toFixed(2)}`,
        `A ${outerRadius} ${outerRadius} 0 1 1 ${oBottom.x.toFixed(2)} ${oBottom.y.toFixed(2)}`,
        `A ${outerRadius} ${outerRadius} 0 1 1 ${oTop.x.toFixed(2)} ${oTop.y.toFixed(2)}`,
        'Z',
        `M ${iTop.x.toFixed(2)} ${iTop.y.toFixed(2)}`,
        `A ${innerRadius} ${innerRadius} 0 1 0 ${iBottom.x.toFixed(2)} ${iBottom.y.toFixed(2)}`,
        `A ${innerRadius} ${innerRadius} 0 1 0 ${iTop.x.toFixed(2)} ${iTop.y.toFixed(2)}`,
        'Z',
      ].join(' ');
    }
    return [
      `M ${oTop.x.toFixed(2)} ${oTop.y.toFixed(2)}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${oBottom.x.toFixed(2)} ${oBottom.y.toFixed(2)}`,
      `A ${outerRadius} ${outerRadius} 0 1 1 ${oTop.x.toFixed(2)} ${oTop.y.toFixed(2)}`,
      'Z',
    ].join(' ');
  }
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const startOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  if (innerRadius > 0) {
    const startInner = polarToCartesian(cx, cy, innerRadius, endAngle);
    const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);
    return [
      `M ${startOuter.x.toFixed(2)} ${startOuter.y.toFixed(2)}`,
      `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x.toFixed(2)} ${endOuter.y.toFixed(2)}`,
      `L ${startInner.x.toFixed(2)} ${startInner.y.toFixed(2)}`,
      `A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${endInner.x.toFixed(2)} ${endInner.y.toFixed(2)}`,
      'Z',
    ].join(' ');
  }
  return [
    `M ${cx.toFixed(2)} ${cy.toFixed(2)}`,
    `L ${startOuter.x.toFixed(2)} ${startOuter.y.toFixed(2)}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${endOuter.x.toFixed(2)} ${endOuter.y.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export function formatPiePercent(
  percent: number,
  formatter?: (p: number) => string,
): string {
  if (formatter) return formatter(percent);
  if (!Number.isFinite(percent)) return '0%';
  if (percent >= 99.95) return '100%';
  return `${percent.toFixed(percent < 10 ? 1 : 0)}%`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartPie = forwardRef(function ChartPie(
  {
    data,
    width = DEFAULT_CHART_PIE_WIDTH,
    height = DEFAULT_CHART_PIE_HEIGHT,
    innerRadius,
    outerRadius,
    showLegend = true,
    showPercentLabels = false,
    showTotal = true,
    totalLabel,
    formatValue,
    formatPercent,
    animate = true,
    className,
    ariaLabel = 'Pie chart',
    ariaDescription,
    onSliceClick,
    startAngle = -Math.PI / 2,
    hoverExpand = DEFAULT_CHART_PIE_HOVER_EXPAND,
    legendPlacement = 'right',
    legendFormat,
    emptyState = 'No data',
  }: ChartPieProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const cx = width / 2;
  const cy = height / 2;
  const fitRadius = Math.min(width, height) / 2 - 12;
  const outerR =
    outerRadius !== undefined && outerRadius > 0
      ? outerRadius
      : fitRadius;
  const innerR =
    innerRadius !== undefined && innerRadius > 0
      ? Math.min(innerRadius, outerR - 1)
      : 0;
  const isDonut = innerR > 0;

  const { slices, total } = useMemo(
    () => computePieSlices(data, startAngle),
    [data, startAngle],
  );

  const [hoverId, setHoverId] = useState<string | null>(null);
  const handleEnter = useCallback((id: string) => {
    setHoverId(id);
  }, []);
  const handleLeave = useCallback(() => {
    setHoverId(null);
  }, []);

  const descId = useMemo(
    () => `chart-pie-desc-${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  const description = useMemo(() => {
    if (ariaDescription !== undefined) return ariaDescription;
    if (slices.length === 0) return 'No data';
    return slices
      .map(
        (s) =>
          `${s.slice.label}: ${formatPiePercent(s.percent, formatPercent)}`,
      )
      .join(', ');
  }, [ariaDescription, formatPercent, slices]);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      data-section="chart-pie"
      data-slice-count={data.length}
      data-donut={isDonut ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'flex w-full items-center gap-4',
        legendPlacement === 'bottom' && 'flex-col items-stretch',
        className,
      )}
    >
      <div
        data-section="chart-pie-canvas"
        className="relative shrink-0"
        style={{ width, height }}
      >
        <p
          data-section="chart-pie-aria-desc"
          id={descId}
          className="sr-only"
        >
          {description}
        </p>
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          data-section="chart-pie-svg"
          className="h-auto w-full"
        >
          {slices.length === 0 ? (
            <text
              x={cx}
              y={cy}
              textAnchor="middle"
              alignmentBaseline="middle"
              fontSize={12}
              fill="currentColor"
              fillOpacity={0.5}
              data-section="chart-pie-empty"
            >
              {emptyState}
            </text>
          ) : (
            slices.map((s, idx) => {
              const isHovered = hoverId === s.slice.id;
              const fill = s.slice.color ?? getDefaultBarColor(idx);
              const radius = isHovered ? outerR + hoverExpand : outerR;
              const d = arcPath(
                cx,
                cy,
                innerR,
                radius,
                s.startAngle,
                s.endAngle,
              );
              const labelPos = polarToCartesian(
                cx,
                cy,
                (innerR + outerR) / 2,
                s.midAngle,
              );
              return (
                <g
                  key={s.slice.id}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${s.slice.label}: ${formatPiePercent(s.percent, formatPercent)}`}
                  data-section="chart-pie-slice"
                  data-slice-id={s.slice.id}
                  data-hovered={isHovered ? 'true' : 'false'}
                  onMouseEnter={() => handleEnter(s.slice.id)}
                  onMouseLeave={handleLeave}
                  onFocus={() => handleEnter(s.slice.id)}
                  onBlur={handleLeave}
                  onClick={
                    onSliceClick ? () => onSliceClick(s.slice) : undefined
                  }
                  className={cn(
                    'transition-opacity',
                    animate && 'motion-safe:animate-fade-in',
                    onSliceClick &&
                      'cursor-pointer focus:outline-none focus-visible:outline-2 focus-visible:outline-primary',
                  )}
                >
                  <path
                    data-section="chart-pie-arc"
                    d={d}
                    fill={fill}
                    stroke="white"
                    strokeWidth={1}
                  />
                  {showPercentLabels && s.percent >= 5 ? (
                    <text
                      aria-hidden="true"
                      data-section="chart-pie-label"
                      x={labelPos.x}
                      y={labelPos.y}
                      textAnchor="middle"
                      alignmentBaseline="middle"
                      fontSize={11}
                      fill="white"
                      fontWeight={600}
                    >
                      {formatPiePercent(s.percent, formatPercent)}
                    </text>
                  ) : null}
                </g>
              );
            })
          )}
          {isDonut && showTotal && slices.length > 0 ? (
            <g
              aria-hidden="true"
              data-section="chart-pie-center"
            >
              <text
                data-section="chart-pie-center-total"
                x={cx}
                y={cy - 4}
                textAnchor="middle"
                alignmentBaseline="middle"
                fontSize={16}
                fontWeight={600}
                fill="currentColor"
              >
                {formatValue ? formatValue(total) : total.toString()}
              </text>
              {totalLabel !== undefined ? (
                <text
                  data-section="chart-pie-center-label"
                  x={cx}
                  y={cy + 12}
                  textAnchor="middle"
                  alignmentBaseline="middle"
                  fontSize={10}
                  fill="currentColor"
                  fillOpacity={0.6}
                >
                  {typeof totalLabel === 'string' ? totalLabel : ''}
                </text>
              ) : null}
            </g>
          ) : null}
        </svg>
      </div>
      {showLegend && slices.length > 0 ? (
        <ul
          data-section="chart-pie-legend"
          data-placement={legendPlacement}
          className={cn(
            'flex flex-col gap-1 text-xs',
            legendPlacement === 'bottom' && 'flex-row flex-wrap gap-3',
          )}
        >
          {slices.map((s, idx) => {
            const color = s.slice.color ?? getDefaultBarColor(idx);
            return (
              <li
                key={s.slice.id}
                data-section="chart-pie-legend-item"
                data-slice-id={s.slice.id}
                className="flex items-center gap-1"
              >
                <span
                  aria-hidden="true"
                  data-section="chart-pie-legend-swatch"
                  className="inline-block h-2 w-2 rounded-sm"
                  style={{ backgroundColor: color }}
                />
                <span
                  data-section="chart-pie-legend-label"
                  className="text-foreground"
                >
                  {legendFormat
                    ? legendFormat(s.slice, s.percent)
                    : s.slice.label}
                </span>
                {!legendFormat ? (
                  <span
                    data-section="chart-pie-legend-percent"
                    className="font-mono text-muted-foreground"
                  >
                    {formatPiePercent(s.percent, formatPercent)}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartPie.displayName = 'ChartPie';
