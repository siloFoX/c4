import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { getDefaultBarColor } from './chart-bar';

// (v1.11.471, TODO 11.453) ChartStream primitive.
//
// Pure-SVG stream graph (centered-baseline stacked area).
// At every x position, the chart sums the per-series values
// and centers the stack around a horizontal baseline so the
// shape grows symmetrically up + down. Each series fills its
// own band; hover highlights the band and dims the others.
// Smooth interpolation uses a Catmull-Rom-to-cubic-Bezier
// pass so layer edges flow visually.
//
// Reference: /root/c4/arps-design-system-v1/.

export interface ChartStreamSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
}

export interface ChartStreamProps {
  series: readonly ChartStreamSeries[];
  xLabels?: readonly string[];
  width?: number;
  height?: number;
  padding?: number;
  smooth?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showAxisLabels?: boolean;
  highlightOnHover?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatXLabel?: (label: string, index: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onSeriesClick?: (args: {
    series: ChartStreamSeries;
    index: number;
    total: number;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_STREAM_WIDTH = 540;
export const DEFAULT_CHART_STREAM_HEIGHT = 240;
export const DEFAULT_CHART_STREAM_PADDING = 24;

// Sum of values at a given x index across all series.
// Non-finite + negative values are clamped to 0 so the
// stream never inverts.
export function getStreamTotalAt(
  series: readonly ChartStreamSeries[],
  index: number,
): number {
  let total = 0;
  for (const s of series) {
    const v = s.data[index];
    if (Number.isFinite(v) && (v as number) > 0) {
      total += v as number;
    }
  }
  return total;
}

// Largest column-sum across the series. Falls back to 1 so
// the chart still renders for empty / non-finite data.
export function getStreamMax(
  series: readonly ChartStreamSeries[],
): number {
  if (series.length === 0) return 1;
  const length = Math.max(
    0,
    ...series.map((s) => s.data.length),
  );
  if (length === 0) return 1;
  let max = 0;
  for (let i = 0; i < length; i += 1) {
    const total = getStreamTotalAt(series, i);
    if (total > max) max = total;
  }
  return max > 0 ? max : 1;
}

// Compute the per-x baseline (centered around chart middle)
// + per-series upper/lower polygon coordinates. Returns
// arrays of {x, upperY, lowerY} per series in the same
// order as `series`.
export interface StreamLayoutPoint {
  x: number;
  upperY: number;
  lowerY: number;
}

export function computeStreamLayout(
  series: readonly ChartStreamSeries[],
  innerWidth: number,
  innerHeight: number,
  paddingX: number,
  paddingY: number,
): {
  series: ChartStreamSeries;
  points: StreamLayoutPoint[];
}[] {
  if (series.length === 0) return [];
  const length = Math.max(
    0,
    ...series.map((s) => s.data.length),
  );
  if (length === 0) {
    return series.map((s) => ({ series: s, points: [] }));
  }
  const max = getStreamMax(series);
  const step =
    length === 1 ? 0 : innerWidth / (length - 1);
  const centerY = paddingY + innerHeight / 2;
  const scale = innerHeight / max;

  return series.map((s, seriesIndex) => {
    const pts: StreamLayoutPoint[] = [];
    for (let i = 0; i < length; i += 1) {
      const total = getStreamTotalAt(series, i);
      const totalH = total * scale;
      const stackTop = centerY - totalH / 2;
      let cumulativeBelow = 0;
      for (let j = 0; j < seriesIndex; j += 1) {
        const v = series[j]?.data[i];
        if (Number.isFinite(v) && (v as number) > 0) {
          cumulativeBelow += v as number;
        }
      }
      const valueRaw = s.data[i];
      const value =
        Number.isFinite(valueRaw) && (valueRaw as number) > 0
          ? (valueRaw as number)
          : 0;
      const upperY = stackTop + cumulativeBelow * scale;
      const lowerY = upperY + value * scale;
      pts.push({
        x: paddingX + i * step,
        upperY,
        lowerY,
      });
    }
    return { series: s, points: pts };
  });
}

// Build the SVG path for one stream band: upper edge
// left->right, then lower edge right->left, closed with Z.
// `smooth=true` uses a Catmull-Rom-to-cubic-Bezier pass on
// both edges for visual flow; `smooth=false` produces
// straight M / L polylines.
export function buildStreamPath(
  points: readonly StreamLayoutPoint[],
  smooth: boolean,
): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x.toFixed(2)} ${p.upperY.toFixed(2)} L ${p.x.toFixed(2)} ${p.lowerY.toFixed(2)} Z`;
  }
  const upperPath = pathThrough(
    points.map((p) => ({ x: p.x, y: p.upperY })),
    smooth,
    /*move*/ true,
  );
  const lowerReversed = [...points]
    .reverse()
    .map((p) => ({ x: p.x, y: p.lowerY }));
  const lowerPath = pathThrough(lowerReversed, smooth, false);
  return `${upperPath} L ${lowerReversed[0]!.x.toFixed(2)} ${lowerReversed[0]!.y.toFixed(2)} ${lowerPath} Z`;
}

function pathThrough(
  pts: readonly { x: number; y: number }[],
  smooth: boolean,
  move: boolean,
): string {
  if (pts.length === 0) return '';
  if (!smooth || pts.length < 3) {
    const out: string[] = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i]!;
      if (i === 0) {
        if (move) {
          out.push(`M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
        } else {
          out.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
        }
      } else {
        out.push(`L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
      }
    }
    return out.join(' ');
  }
  // Catmull-Rom-to-cubic-Bezier
  const out: string[] = [];
  if (move) {
    out.push(`M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`);
  } else {
    out.push(`L ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`);
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? pts[i + 1]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    out.push(
      `C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    );
  }
  return out.join(' ');
}

// One-line ARIA summary of the stream series.
export function describeStreamChart(
  series: readonly ChartStreamSeries[],
  formatValue?: (v: number) => string,
): string {
  if (series.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const length = Math.max(
    0,
    ...series.map((s) => s.data.length),
  );
  const parts = series.map((s) => {
    let sum = 0;
    for (const v of s.data) {
      if (Number.isFinite(v) && v > 0) sum += v;
    }
    return `${s.label} sum ${fv(sum)}`;
  });
  return `Stream graph with ${series.length} layers, ${length} samples. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartStream = forwardRef(function ChartStream(
  {
    series,
    xLabels,
    width = DEFAULT_CHART_STREAM_WIDTH,
    height = DEFAULT_CHART_STREAM_HEIGHT,
    padding = DEFAULT_CHART_STREAM_PADDING,
    smooth = true,
    showLegend = true,
    showTooltip = true,
    showAxisLabels = true,
    highlightOnHover = true,
    animate = true,
    className,
    ariaLabel = 'Stream graph',
    ariaDescription,
    formatValue,
    formatXLabel,
    legendPlacement = 'bottom',
    onSeriesClick,
  }: ChartStreamProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showAxisLabels ? 18 : padding),
  );
  const layout = useMemo(
    () =>
      computeStreamLayout(
        series,
        innerWidth,
        innerHeight,
        padding,
        padding,
      ),
    [innerHeight, innerWidth, padding, series],
  );
  const description = useMemo(
    () =>
      ariaDescription ??
      describeStreamChart(series, formatValue),
    [ariaDescription, formatValue, series],
  );

  const [hovered, setHovered] = useState<number | null>(null);
  const [hoveredX, setHoveredX] = useState<number | null>(null);
  const handleEnter = useCallback((idx: number, xIdx: number) => {
    setHovered(idx);
    setHoveredX(xIdx);
  }, []);
  const handleLeave = useCallback(() => {
    setHovered(null);
    setHoveredX(null);
  }, []);

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const fxl = (label: string, index: number) =>
    formatXLabel ? formatXLabel(label, index) : label;

  const length = Math.max(
    0,
    ...series.map((s) => s.data.length),
  );

  const hoveredSeries =
    hovered !== null ? series[hovered] : null;
  const hoveredValue =
    hoveredSeries !== null && hoveredX !== null
      ? hoveredSeries.data[hoveredX]
      : null;
  const hoveredTotal =
    hoveredX !== null ? getStreamTotalAt(series, hoveredX) : 0;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-stream"
      data-layer-count={series.length}
      data-sample-count={length}
      data-smooth={smooth ? 'true' : 'false'}
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
        data-section="chart-stream-canvas"
        className="relative shrink-0"
        style={{ width, height }}
      >
        <span
          data-section="chart-stream-aria-desc"
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
          data-section="chart-stream-svg"
          className="h-auto w-full"
        >
          {/* Layers */}
          {layout.map(({ series: s, points }, i) => {
            const color =
              s.color ?? getDefaultBarColor(i);
            const path = buildStreamPath(points, smooth);
            const isHovered = hovered === i;
            const opacity =
              highlightOnHover && hovered !== null
                ? isHovered
                  ? 1
                  : 0.25
                : 0.9;
            return (
              <g
                key={s.id}
                data-section="chart-stream-layer"
                data-series-id={s.id}
                data-series-index={i}
                data-series-color={color}
                data-hovered={isHovered ? 'true' : 'false'}
                className={cn(
                  animate && 'motion-safe:animate-fade-in',
                )}
              >
                <path
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={s.label}
                  data-section="chart-stream-band"
                  data-series-id={s.id}
                  d={path}
                  fill={color}
                  fillOpacity={opacity}
                  stroke={isHovered ? color : 'none'}
                  strokeWidth={isHovered ? 1.5 : 0}
                  onMouseEnter={(e) => {
                    // estimate x index from svg coordinates
                    const rect = (
                      e.currentTarget as SVGPathElement
                    ).ownerSVGElement!.getBoundingClientRect();
                    const localX =
                      ((e.clientX - rect.left) / rect.width) *
                      width;
                    const inWidth = Math.max(1, innerWidth);
                    const idx = Math.max(
                      0,
                      Math.min(
                        length - 1,
                        Math.round(
                          ((localX - padding) / inWidth) *
                            (length - 1),
                        ),
                      ),
                    );
                    handleEnter(i, idx);
                  }}
                  onMouseMove={(e) => {
                    const rect = (
                      e.currentTarget as SVGPathElement
                    ).ownerSVGElement!.getBoundingClientRect();
                    const localX =
                      ((e.clientX - rect.left) / rect.width) *
                      width;
                    const inWidth = Math.max(1, innerWidth);
                    const idx = Math.max(
                      0,
                      Math.min(
                        length - 1,
                        Math.round(
                          ((localX - padding) / inWidth) *
                            (length - 1),
                        ),
                      ),
                    );
                    handleEnter(i, idx);
                  }}
                  onMouseLeave={handleLeave}
                  onFocus={() => handleEnter(i, 0)}
                  onBlur={handleLeave}
                  onClick={
                    onSeriesClick
                      ? () =>
                          onSeriesClick({
                            series: s,
                            index: i,
                            total:
                              hoveredX !== null
                                ? hoveredTotal
                                : 0,
                          })
                      : undefined
                  }
                  style={{
                    cursor: onSeriesClick
                      ? 'pointer'
                      : 'default',
                  }}
                />
              </g>
            );
          })}
          {/* X axis tick labels */}
          {showAxisLabels && xLabels && length > 0
            ? xLabels.map((label, i) => {
                if (i >= length) return null;
                const step =
                  length === 1 ? 0 : innerWidth / (length - 1);
                const x = padding + i * step;
                return (
                  <text
                    key={`xlabel-${i}`}
                    aria-hidden="true"
                    data-section="chart-stream-xlabel"
                    data-label-index={i}
                    x={x}
                    y={height - 6}
                    textAnchor={
                      i === 0
                        ? 'start'
                        : i === length - 1
                          ? 'end'
                          : 'middle'
                    }
                    fontSize={10}
                    fill="currentColor"
                    fillOpacity={0.7}
                  >
                    {fxl(label, i)}
                  </text>
                );
              })
            : null}
        </svg>
        {showTooltip && hoveredSeries && hoveredX !== null ? (
          <div
            role="tooltip"
            data-section="chart-stream-tooltip"
            data-series-id={hoveredSeries.id}
            data-x-index={hoveredX}
            style={{
              left: padding + 12,
              top: padding,
            }}
            className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
          >
            <div
              data-section="chart-stream-tooltip-label"
              className="font-medium"
            >
              {hoveredSeries.label}
            </div>
            <div
              data-section="chart-stream-tooltip-value"
              className="font-mono"
            >
              {fv(
                Number.isFinite(hoveredValue)
                  ? (hoveredValue as number)
                  : 0,
              )}
            </div>
            {xLabels && xLabels[hoveredX] !== undefined ? (
              <div
                data-section="chart-stream-tooltip-x"
                className="text-muted-foreground"
              >
                {fxl(xLabels[hoveredX]!, hoveredX)}
              </div>
            ) : null}
            <div
              data-section="chart-stream-tooltip-total"
              className="text-muted-foreground"
            >
              total: {fv(hoveredTotal)}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-stream-legend"
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
                data-section="chart-stream-legend-item"
                data-series-id={s.id}
                className="flex items-center gap-1.5"
              >
                <span
                  aria-hidden="true"
                  data-section="chart-stream-legend-swatch"
                  className="inline-block h-3 w-3 rounded"
                  style={{ background: color }}
                />
                <span
                  data-section="chart-stream-legend-label"
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

ChartStream.displayName = 'ChartStream';
