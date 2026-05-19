import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
} from 'react';
import type { ForwardedRef } from 'react';
import { cn } from '../../lib/cn';
import { getDefaultBarColor } from './chart-bar';

// (v1.11.484, TODO 11.466) ChartStackedArea primitive.
//
// Pure-SVG stacked area chart with a toggleable
// absolute / percentage mode and clickable legend
// interaction for hiding individual series. Unlike
// `<ChartArea>` (11.441) which only renders overlaid /
// fixed stacked layers, this primitive emphasises the
// mode toggle, the legend-driven visibility filter, and
// the percentage normalisation (each column sums to 1).
//
// Reference: /root/c4/arps-design-system-v1/.

export type ChartStackedAreaMode = 'absolute' | 'percentage';

export interface ChartStackedAreaSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
}

export interface ChartStackedAreaProps {
  series: readonly ChartStackedAreaSeries[];
  xLabels?: readonly (string | number)[];
  width?: number;
  height?: number;
  padding?: number;
  mode?: ChartStackedAreaMode;
  defaultMode?: ChartStackedAreaMode;
  onModeChange?: (mode: ChartStackedAreaMode) => void;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showModeToggle?: boolean;
  showLegend?: boolean;
  showAxisTicks?: boolean;
  showGrid?: boolean;
  showTooltip?: boolean;
  showAxisLabels?: boolean;
  smooth?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatPercent?: (v: number) => string;
  formatXLabel?: (label: string | number, idx: number) => string;
  tickCount?: number;
  legendPlacement?: 'right' | 'bottom';
  onSeriesClick?: (args: {
    series: ChartStackedAreaSeries;
    index: number;
    hidden: boolean;
  }) => void;
}

// ---------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------

export const DEFAULT_CHART_STACKED_AREA_WIDTH = 560;
export const DEFAULT_CHART_STACKED_AREA_HEIGHT = 280;
export const DEFAULT_CHART_STACKED_AREA_PADDING = 36;
export const DEFAULT_CHART_STACKED_AREA_TICK_COUNT = 5;
export const DEFAULT_CHART_STACKED_AREA_MODE: ChartStackedAreaMode =
  'absolute';

// Sum positive finite values across visible series at a
// single x index. Hidden series, non-finite, and
// non-positive values are skipped.
export function getStackedAreaTotalAt(
  series: readonly ChartStackedAreaSeries[],
  hidden: ReadonlySet<string>,
  index: number,
): number {
  let total = 0;
  for (const s of series) {
    if (hidden.has(s.id)) continue;
    const v = s.data[index];
    if (Number.isFinite(v) && (v as number) > 0) {
      total += v as number;
    }
  }
  return total;
}

// Compute the largest column total across the series.
// Falls back to 1 for empty / all-zero data so the chart
// still renders.
export function getStackedAreaMaxTotal(
  series: readonly ChartStackedAreaSeries[],
  hidden: ReadonlySet<string>,
): number {
  if (series.length === 0) return 1;
  const length = Math.max(
    0,
    ...series
      .filter((s) => !hidden.has(s.id))
      .map((s) => s.data.length),
  );
  if (length === 0) return 1;
  let max = 0;
  for (let i = 0; i < length; i += 1) {
    const total = getStackedAreaTotalAt(series, hidden, i);
    if (total > max) max = total;
  }
  return max > 0 ? max : 1;
}

// Compute the per-series upper / lower y polygon points
// in svg space. For `mode === 'percentage'`, each column
// is normalised to total = 1; otherwise the chart scales
// to the largest column total.
export interface StackedAreaPoint {
  x: number;
  upperY: number;
  lowerY: number;
  rawValue: number;
  total: number;
  ratio: number;
}

export function computeStackedAreaLayout(
  series: readonly ChartStackedAreaSeries[],
  hidden: ReadonlySet<string>,
  mode: ChartStackedAreaMode,
  innerWidth: number,
  innerHeight: number,
  paddingX: number,
  paddingY: number,
): {
  series: ChartStackedAreaSeries;
  hidden: boolean;
  points: StackedAreaPoint[];
}[] {
  if (series.length === 0) return [];
  const length = Math.max(
    0,
    ...series.map((s) => s.data.length),
  );
  if (length === 0) {
    return series.map((s) => ({
      series: s,
      hidden: hidden.has(s.id),
      points: [],
    }));
  }
  const max = getStackedAreaMaxTotal(series, hidden);
  const step =
    length === 1 ? 0 : innerWidth / (length - 1);
  return series.map((s, seriesIndex) => {
    const isHidden = hidden.has(s.id);
    const pts: StackedAreaPoint[] = [];
    for (let i = 0; i < length; i += 1) {
      const total = getStackedAreaTotalAt(series, hidden, i);
      if (isHidden) {
        const y = paddingY + innerHeight;
        pts.push({
          x: paddingX + i * step,
          upperY: y,
          lowerY: y,
          rawValue: 0,
          total,
          ratio: 0,
        });
        continue;
      }
      let cumulativeBelow = 0;
      for (let j = 0; j < seriesIndex; j += 1) {
        const peer = series[j];
        if (!peer || hidden.has(peer.id)) continue;
        const pv = peer.data[i];
        if (Number.isFinite(pv) && (pv as number) > 0) {
          cumulativeBelow += pv as number;
        }
      }
      const raw = s.data[i];
      const value =
        Number.isFinite(raw) && (raw as number) > 0
          ? (raw as number)
          : 0;
      let upperRatio: number;
      let lowerRatio: number;
      if (mode === 'percentage') {
        if (total > 0) {
          upperRatio = cumulativeBelow / total;
          lowerRatio = (cumulativeBelow + value) / total;
        } else {
          upperRatio = 0;
          lowerRatio = 0;
        }
      } else {
        upperRatio = cumulativeBelow / max;
        lowerRatio = (cumulativeBelow + value) / max;
      }
      const yTop = paddingY + innerHeight - innerHeight * upperRatio;
      const yBot = paddingY + innerHeight - innerHeight * lowerRatio;
      pts.push({
        x: paddingX + i * step,
        upperY: Math.min(yTop, yBot),
        lowerY: Math.max(yTop, yBot),
        rawValue: value,
        total,
        ratio:
          mode === 'percentage' && total > 0
            ? value / total
            : 0,
      });
    }
    return { series: s, hidden: isHidden, points: pts };
  });
}

// Build the SVG path for one stacked-area band: upper
// edge left->right, then lower edge right->left, closed
// with Z. `smooth=true` uses a Catmull-Rom-to-cubic-Bezier
// pass on both edges (matches the chart-stream smoother).
export function buildStackedAreaBandPath(
  points: readonly StackedAreaPoint[],
  smooth: boolean,
): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x.toFixed(2)} ${p.upperY.toFixed(2)} L ${p.x.toFixed(2)} ${p.lowerY.toFixed(2)} Z`;
  }
  const upperPts = points.map((p) => ({ x: p.x, y: p.upperY }));
  const lowerPts = [...points]
    .reverse()
    .map((p) => ({ x: p.x, y: p.lowerY }));
  const upperPath = pathThrough(upperPts, smooth, true);
  const lowerPath = pathThrough(lowerPts, smooth, false);
  return `${upperPath} L ${lowerPts[0]!.x.toFixed(2)} ${lowerPts[0]!.y.toFixed(2)} ${lowerPath} Z`;
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
  const out: string[] = [];
  if (move) {
    out.push(
      `M ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`,
    );
  } else {
    out.push(
      `L ${pts[0]!.x.toFixed(2)} ${pts[0]!.y.toFixed(2)}`,
    );
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

// Evenly-spaced y-axis ticks.
export function getStackedAreaTicks(
  max: number,
  mode: ChartStackedAreaMode,
  count: number = DEFAULT_CHART_STACKED_AREA_TICK_COUNT,
): number[] {
  const limit = mode === 'percentage' ? 1 : max;
  if (!Number.isFinite(limit) || limit <= 0) return [0];
  const safeCount = Math.max(2, Math.floor(count));
  const step = limit / (safeCount - 1);
  const out: number[] = [];
  for (let i = 0; i < safeCount; i += 1) out.push(i * step);
  return out;
}

// One-line ARIA summary.
export function describeStackedAreaChart(
  series: readonly ChartStackedAreaSeries[],
  hidden: ReadonlySet<string>,
  mode: ChartStackedAreaMode,
  formatValue?: (v: number) => string,
): string {
  if (series.length === 0) return 'No data';
  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const visible = series.filter((s) => !hidden.has(s.id));
  const length = Math.max(
    0,
    ...visible.map((s) => s.data.length),
  );
  const parts = visible.map((s) => {
    let sum = 0;
    for (const v of s.data) {
      if (Number.isFinite(v) && (v as number) > 0) {
        sum += v as number;
      }
    }
    return `${s.label} sum ${fv(sum)}`;
  });
  return `Stacked area chart (${mode}) with ${visible.length} visible layers, ${length} samples. ${parts.join(', ')}.`;
}

// ---------------------------------------------------------------
// Component
// ---------------------------------------------------------------

export const ChartStackedArea = forwardRef(function ChartStackedArea(
  {
    series,
    xLabels,
    width = DEFAULT_CHART_STACKED_AREA_WIDTH,
    height = DEFAULT_CHART_STACKED_AREA_HEIGHT,
    padding = DEFAULT_CHART_STACKED_AREA_PADDING,
    mode,
    defaultMode = DEFAULT_CHART_STACKED_AREA_MODE,
    onModeChange,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showModeToggle = true,
    showLegend = true,
    showAxisTicks = true,
    showGrid = true,
    showTooltip = true,
    showAxisLabels = true,
    smooth = true,
    animate = true,
    className,
    ariaLabel = 'Stacked area chart',
    ariaDescription,
    formatValue,
    formatPercent,
    formatXLabel,
    tickCount = DEFAULT_CHART_STACKED_AREA_TICK_COUNT,
    legendPlacement = 'bottom',
    onSeriesClick,
  }: ChartStackedAreaProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const [internalMode, setInternalMode] =
    useState<ChartStackedAreaMode>(defaultMode);
  const activeMode = mode ?? internalMode;
  const [internalHidden, setInternalHidden] = useState<
    string[]
  >(() =>
    defaultHiddenSeries ? [...defaultHiddenSeries] : [],
  );
  const activeHidden = useMemo(
    () => new Set(hiddenSeries ?? internalHidden),
    [hiddenSeries, internalHidden],
  );

  const innerWidth = Math.max(0, width - padding * 2);
  const innerHeight = Math.max(
    0,
    height - padding - (showAxisLabels ? 18 : padding),
  );

  const layout = useMemo(
    () =>
      computeStackedAreaLayout(
        series,
        activeHidden,
        activeMode,
        innerWidth,
        innerHeight,
        padding,
        padding,
      ),
    [
      activeHidden,
      activeMode,
      innerHeight,
      innerWidth,
      padding,
      series,
    ],
  );

  const max = useMemo(
    () => getStackedAreaMaxTotal(series, activeHidden),
    [activeHidden, series],
  );

  const ticks = useMemo(
    () => getStackedAreaTicks(max, activeMode, tickCount),
    [activeMode, max, tickCount],
  );

  const yFor = useCallback(
    (v: number) => {
      const limit = activeMode === 'percentage' ? 1 : max;
      if (limit <= 0) return padding + innerHeight;
      const ratio = Math.max(0, Math.min(1, v / limit));
      return padding + innerHeight - innerHeight * ratio;
    },
    [activeMode, innerHeight, max, padding],
  );

  const fv = (v: number) =>
    formatValue ? formatValue(v) : `${v}`;
  const fp = (v: number) =>
    formatPercent
      ? formatPercent(v)
      : `${(v * 100).toFixed(1)}%`;
  const fxl = (label: string | number, idx: number) =>
    formatXLabel ? formatXLabel(label, idx) : `${label}`;

  const description = useMemo(
    () =>
      ariaDescription ??
      describeStackedAreaChart(
        series,
        activeHidden,
        activeMode,
        formatValue,
      ),
    [
      activeHidden,
      activeMode,
      ariaDescription,
      formatValue,
      series,
    ],
  );

  const [hovered, setHovered] = useState<{
    seriesIndex: number;
    xIndex: number;
  } | null>(null);

  const length = Math.max(
    0,
    ...series.map((s) => s.data.length),
  );

  const handleBandEnter = useCallback(
    (seriesIndex: number, xIndex: number) => {
      setHovered({ seriesIndex, xIndex });
    },
    [],
  );
  const handleLeave = useCallback(() => {
    setHovered(null);
  }, []);

  const handleModeToggle = useCallback(() => {
    const next: ChartStackedAreaMode =
      activeMode === 'absolute' ? 'percentage' : 'absolute';
    if (mode === undefined) setInternalMode(next);
    onModeChange?.(next);
  }, [activeMode, mode, onModeChange]);

  const commitHidden = useCallback(
    (next: string[]) => {
      if (hiddenSeries === undefined) setInternalHidden(next);
      onHiddenSeriesChange?.(next);
    },
    [hiddenSeries, onHiddenSeriesChange],
  );

  const handleLegendClick = useCallback(
    (s: ChartStackedAreaSeries, i: number) => {
      const wasHidden = activeHidden.has(s.id);
      const next = wasHidden
        ? Array.from(activeHidden).filter(
            (id) => id !== s.id,
          )
        : [...Array.from(activeHidden), s.id];
      commitHidden(next);
      onSeriesClick?.({
        series: s,
        index: i,
        hidden: !wasHidden,
      });
    },
    [activeHidden, commitHidden, onSeriesClick],
  );

  const hoveredSeries =
    hovered ? series[hovered.seriesIndex] : null;
  const hoveredPoint =
    hovered
      ? layout[hovered.seriesIndex]?.points[hovered.xIndex]
      : null;
  const hoveredX = hoveredPoint?.x;
  const hoveredY = hoveredPoint
    ? (hoveredPoint.upperY + hoveredPoint.lowerY) / 2
    : null;

  const visibleCount = series.filter(
    (s) => !activeHidden.has(s.id),
  ).length;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      data-section="chart-stacked-area"
      data-mode={activeMode}
      data-series-count={series.length}
      data-visible-count={visibleCount}
      data-sample-count={length}
      data-smooth={smooth ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={cn(
        'flex w-full items-start gap-4',
        legendPlacement === 'bottom' && 'flex-col items-stretch',
        className,
      )}
      style={{ width }}
    >
      <div
        data-section="chart-stacked-area-canvas"
        className="relative shrink-0"
        style={{ width, height }}
      >
        <span
          data-section="chart-stacked-area-aria-desc"
          className="sr-only"
        >
          {description}
        </span>
        {showModeToggle ? (
          <div
            data-section="chart-stacked-area-mode-toggle"
            className="absolute right-2 top-2 z-10"
          >
            <button
              type="button"
              data-section="chart-stacked-area-mode-button"
              data-mode={activeMode}
              aria-label={`Switch to ${activeMode === 'absolute' ? 'percentage' : 'absolute'} mode`}
              onClick={handleModeToggle}
              className="rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground hover:bg-accent"
            >
              {activeMode === 'absolute' ? '%' : '#'}
            </button>
          </div>
        ) : null}
        <svg
          role="img"
          aria-label={ariaLabel}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          data-section="chart-stacked-area-svg"
          className="h-auto w-full"
        >
          {/* Y axis */}
          <line
            aria-hidden="true"
            data-section="chart-stacked-area-axis-y"
            x1={padding}
            y1={padding}
            x2={padding}
            y2={padding + innerHeight}
            stroke="currentColor"
            strokeOpacity={0.3}
          />
          {/* Grid + tick labels */}
          {(showAxisTicks || showGrid) &&
            ticks.map((t, idx) => {
              const y = yFor(t);
              return (
                <g
                  key={`tick-${idx}`}
                  data-section="chart-stacked-area-tick"
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
                      data-section="chart-stacked-area-tick-label"
                      x={padding - 4}
                      y={y}
                      textAnchor="end"
                      alignmentBaseline="middle"
                      fontSize={10}
                      fill="currentColor"
                      fillOpacity={0.65}
                    >
                      {activeMode === 'percentage' ? fp(t) : fv(t)}
                    </text>
                  ) : null}
                </g>
              );
            })}
          {/* X axis labels */}
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
                    data-section="chart-stacked-area-xlabel"
                    data-x-index={i}
                    x={x}
                    y={height - 4}
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
          {/* Layers */}
          {layout.map(({ series: s, points, hidden: isHidden }, i) => {
            if (isHidden) return null;
            const color = s.color ?? getDefaultBarColor(i);
            const path = buildStackedAreaBandPath(points, smooth);
            const isHovered = hovered?.seriesIndex === i;
            const op = isHovered ? 1 : 0.85;
            return (
              <g
                key={s.id}
                data-section="chart-stacked-area-layer"
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
                  data-section="chart-stacked-area-band"
                  data-series-id={s.id}
                  d={path}
                  fill={color}
                  fillOpacity={op}
                  stroke={color}
                  strokeOpacity={isHovered ? 0.95 : 0.45}
                  strokeWidth={isHovered ? 1.25 : 0.75}
                  strokeLinejoin="round"
                  onMouseEnter={(event) => {
                    const rect = (
                      event.currentTarget as SVGPathElement
                    ).ownerSVGElement?.getBoundingClientRect();
                    if (!rect || !(rect.width > 0)) {
                      handleBandEnter(i, 0);
                      return;
                    }
                    const localX =
                      ((event.clientX - rect.left) /
                        rect.width) *
                      width;
                    const inW = Math.max(1, innerWidth);
                    const idx = Math.max(
                      0,
                      Math.min(
                        length - 1,
                        Math.round(
                          ((localX - padding) / inW) *
                            (length - 1),
                        ),
                      ),
                    );
                    handleBandEnter(i, Number.isFinite(idx) ? idx : 0);
                  }}
                  onMouseMove={(event) => {
                    const rect = (
                      event.currentTarget as SVGPathElement
                    ).ownerSVGElement?.getBoundingClientRect();
                    if (!rect || !(rect.width > 0)) return;
                    const localX =
                      ((event.clientX - rect.left) /
                        rect.width) *
                      width;
                    const inW = Math.max(1, innerWidth);
                    const idx = Math.max(
                      0,
                      Math.min(
                        length - 1,
                        Math.round(
                          ((localX - padding) / inW) *
                            (length - 1),
                        ),
                      ),
                    );
                    if (Number.isFinite(idx)) handleBandEnter(i, idx);
                  }}
                  onMouseLeave={handleLeave}
                  onFocus={() => handleBandEnter(i, 0)}
                  onBlur={handleLeave}
                />
              </g>
            );
          })}
        </svg>
        {showTooltip &&
        hoveredSeries &&
        hoveredPoint &&
        hoveredX !== undefined &&
        hoveredY !== null ? (
          <div
            role="tooltip"
            data-section="chart-stacked-area-tooltip"
            data-series-id={hoveredSeries.id}
            data-x-index={hovered?.xIndex ?? 0}
            style={{
              left: hoveredX + 10,
              top: hoveredY - 8,
            }}
            className="pointer-events-none absolute rounded border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow"
          >
            <div
              data-section="chart-stacked-area-tooltip-label"
              className="font-medium"
            >
              {hoveredSeries.label}
            </div>
            <div
              data-section="chart-stacked-area-tooltip-value"
              className="font-mono"
            >
              {fv(hoveredPoint.rawValue)}
            </div>
            {activeMode === 'percentage' &&
            hoveredPoint.total > 0 ? (
              <div
                data-section="chart-stacked-area-tooltip-percent"
                className="text-muted-foreground"
              >
                {fp(hoveredPoint.ratio)} of total
              </div>
            ) : null}
            {xLabels && hovered?.xIndex !== undefined && xLabels[hovered.xIndex] !== undefined ? (
              <div
                data-section="chart-stacked-area-tooltip-x"
                className="text-muted-foreground"
              >
                x: {fxl(xLabels[hovered.xIndex]!, hovered.xIndex)}
              </div>
            ) : null}
            <div
              data-section="chart-stacked-area-tooltip-total"
              className="text-muted-foreground"
            >
              total: {fv(hoveredPoint.total)}
            </div>
          </div>
        ) : null}
      </div>
      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-stacked-area-legend"
          data-placement={legendPlacement}
          className={cn(
            'flex flex-col gap-1 text-xs',
            legendPlacement === 'bottom' &&
              'flex-row flex-wrap gap-3',
          )}
        >
          {series.map((s, i) => {
            const color = s.color ?? getDefaultBarColor(i);
            const isHidden = activeHidden.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-stacked-area-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-stacked-area-legend-button"
                  data-series-id={s.id}
                  aria-pressed={!isHidden}
                  aria-label={`${isHidden ? 'Show' : 'Hide'} ${s.label}`}
                  onClick={() => handleLegendClick(s, i)}
                  className={cn(
                    'flex items-center gap-1.5 cursor-pointer',
                    isHidden && 'opacity-40',
                  )}
                >
                  <span
                    aria-hidden="true"
                    data-section="chart-stacked-area-legend-swatch"
                    className="inline-block h-3 w-3 rounded"
                    style={{
                      background: isHidden ? '#cbd5e1' : color,
                    }}
                  />
                  <span
                    data-section="chart-stacked-area-legend-label"
                    className="text-foreground"
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartStackedArea.displayName = 'ChartStackedArea';
