import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MIN_MAX_WIDTH = 560;
export const DEFAULT_CHART_LINE_MIN_MAX_HEIGHT = 320;
export const DEFAULT_CHART_LINE_MIN_MAX_PADDING = 40;
export const DEFAULT_CHART_LINE_MIN_MAX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MIN_MAX_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_MIN_MAX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MIN_MAX_MARKER_RADIUS = 6;
export const DEFAULT_CHART_LINE_MIN_MAX_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_MIN_MAX_REF_OPACITY = 0.45;
export const DEFAULT_CHART_LINE_MIN_MAX_REF_DASH = '4 3';
export const DEFAULT_CHART_LINE_MIN_MAX_DROP_OPACITY = 0.35;
export const DEFAULT_CHART_LINE_MIN_MAX_DROP_DASH = '2 3';
export const DEFAULT_CHART_LINE_MIN_MAX_MAX_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MIN_MAX_MIN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MIN_MAX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MIN_MAX_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_MIN_MAX_PALETTE = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#f59e0b',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];

export type ChartLineMinMaxKind = 'min' | 'max';

export interface ChartLineMinMaxPoint {
  x: number;
  y: number;
}

export interface ChartLineMinMaxSeries {
  id: string;
  label: string;
  data: readonly ChartLineMinMaxPoint[];
  color?: string;
  minColor?: string;
  maxColor?: string;
}

export interface ChartLineMinMaxExtremum {
  index: number;
  x: number;
  y: number;
}

export interface ChartLineMinMaxExtrema {
  min: ChartLineMinMaxExtremum;
  max: ChartLineMinMaxExtremum;
}

export interface ChartLineMinMaxLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  isMin: boolean;
  isMax: boolean;
}

export interface ChartLineMinMaxLayoutMarker {
  kind: ChartLineMinMaxKind;
  seriesId: string;
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  color: string;
  iconPath: string;
  refY1: number;
  refY2: number;
  dropX1: number;
  dropY1: number;
  dropX2: number;
  dropY2: number;
  labelX: number;
  labelY: number;
}

export interface ChartLineMinMaxLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  minColor: string;
  maxColor: string;
  points: ChartLineMinMaxLayoutPoint[];
  path: string;
  finiteCount: number;
  totalCount: number;
  minMarker: ChartLineMinMaxLayoutMarker | null;
  maxMarker: ChartLineMinMaxLayoutMarker | null;
}

export interface ComputeLineMinMaxLayoutResult {
  series: ChartLineMinMaxLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineMinMaxPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineMinMaxPoint).x) &&
    isFiniteNumber((p as ChartLineMinMaxPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineMinMaxDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_MIN_MAX_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_MIN_MAX_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_MIN_MAX_PALETTE.length
  ]!;
}

export function getLineMinMaxFinitePoints(
  points: readonly ChartLineMinMaxPoint[],
): ChartLineMinMaxPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Finds the min and max points of a sample series. On ties, the
 * **first occurrence wins** (preserves the input index, useful for
 * stable visual placement when multiple samples share the extreme y).
 *
 * Returns `null` when there are no finite samples.
 *
 * The returned indices are positions in the ORIGINAL `points` array
 * (so callers can map back to their own data structures), not in the
 * filtered finite subset.
 */
export function findLineMinMaxExtrema(
  points: readonly ChartLineMinMaxPoint[] | undefined | null,
): ChartLineMinMaxExtrema | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  let min: ChartLineMinMaxExtremum | null = null;
  let max: ChartLineMinMaxExtremum | null = null;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (!isFinitePoint(p)) continue;
    if (min === null || p.y < min.y) {
      min = { index: i, x: p.x, y: p.y };
    }
    if (max === null || p.y > max.y) {
      max = { index: i, x: p.x, y: p.y };
    }
  }
  if (min === null || max === null) return null;
  return { min, max };
}

/**
 * Builds an SVG `d` string for the min/max marker shape. `max` uses an
 * upward-pointing triangle and `min` uses a downward-pointing
 * triangle, anchored at `(cx, cy)` with outer radius `r`. Non-finite
 * inputs or `r <= 0` return `''`.
 */
export function buildLineMinMaxMarkerPath(
  kind: ChartLineMinMaxKind,
  cx: number,
  cy: number,
  r: number,
): string {
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy) || !isFiniteNumber(r))
    return '';
  if (r <= 0) return '';
  // For visual emphasis, use a slightly elongated triangle.
  const h = r * 1.2;
  const w = r;
  if (kind === 'max') {
    // Upward-pointing triangle: apex at the top.
    return `M ${fmt(cx)} ${fmt(cy - h)} L ${fmt(cx + w)} ${fmt(cy + h * 0.5)} L ${fmt(cx - w)} ${fmt(cy + h * 0.5)} Z`;
  }
  // Downward-pointing triangle: apex at the bottom.
  return `M ${fmt(cx)} ${fmt(cy + h)} L ${fmt(cx + w)} ${fmt(cy - h * 0.5)} L ${fmt(cx - w)} ${fmt(cy - h * 0.5)} Z`;
}

export interface ComputeLineMinMaxLayoutInput {
  series: readonly ChartLineMinMaxSeries[];
  hiddenSeries?: ReadonlySet<string> | null;
  showMin?: boolean;
  showMax?: boolean;
  markerRadius?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineMinMaxLayout(
  input: ComputeLineMinMaxLayoutInput,
): ComputeLineMinMaxLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineMinMaxLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    innerWidth,
    innerHeight,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  if (seriesArr.length === 0) return empty;
  const hidden = input.hiddenSeries ?? null;
  const visible = seriesArr.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return empty;

  // Bounds across all visible series.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of visible) {
    for (const p of getLineMinMaxFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  }
  if (!any) {
    xMin = 0;
    xMax = 1;
    yMin = 0;
    yMax = 1;
  }
  if (isFiniteNumber(input.xMin)) xMin = input.xMin;
  if (isFiniteNumber(input.xMax)) xMax = input.xMax;
  if (isFiniteNumber(input.yMin)) yMin = input.yMin;
  if (isFiniteNumber(input.yMax)) yMax = input.yMax;
  if (xMax < xMin) [xMin, xMax] = [xMax, xMin];
  if (yMax < yMin) [yMin, yMax] = [yMax, yMin];
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  const xToPx = (x: number): number =>
    padding + ((x - xMin) / xRange) * innerWidth;
  const yToPx = (y: number): number =>
    padding + innerHeight - ((y - yMin) / yRange) * innerHeight;
  const axisY = padding + innerHeight;
  const markerRadius =
    input.markerRadius ?? DEFAULT_CHART_LINE_MIN_MAX_MARKER_RADIUS;
  const showMin = input.showMin !== false;
  const showMax = input.showMax !== false;

  const layoutSeries: ChartLineMinMaxLayoutSeries[] = [];
  let totalPoints = 0;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const color = s.color ?? getLineMinMaxDefaultColor(i);
    const minColor = s.minColor ?? DEFAULT_CHART_LINE_MIN_MAX_MIN_COLOR;
    const maxColor = s.maxColor ?? DEFAULT_CHART_LINE_MIN_MAX_MAX_COLOR;
    const extrema = findLineMinMaxExtrema(arr);
    const points: ChartLineMinMaxLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        isMin: extrema !== null && extrema.min.index === j,
        isMax: extrema !== null && extrema.max.index === j,
      });
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    let minMarker: ChartLineMinMaxLayoutMarker | null = null;
    let maxMarker: ChartLineMinMaxLayoutMarker | null = null;
    if (extrema && showMin) {
      const ex = extrema.min;
      const mx = xToPx(ex.x);
      const my = yToPx(ex.y);
      minMarker = {
        kind: 'min',
        seriesId: s.id,
        index: ex.index,
        x: ex.x,
        y: ex.y,
        px: mx,
        py: my,
        color: minColor,
        iconPath: buildLineMinMaxMarkerPath('min', mx, my, markerRadius),
        refY1: my,
        refY2: my,
        dropX1: mx,
        dropY1: my,
        dropX2: mx,
        dropY2: axisY,
        labelX: mx + markerRadius + 4,
        labelY: my + 4,
      };
    }
    if (extrema && showMax) {
      const ex = extrema.max;
      const mx = xToPx(ex.x);
      const my = yToPx(ex.y);
      maxMarker = {
        kind: 'max',
        seriesId: s.id,
        index: ex.index,
        x: ex.x,
        y: ex.y,
        px: mx,
        py: my,
        color: maxColor,
        iconPath: buildLineMinMaxMarkerPath('max', mx, my, markerRadius),
        refY1: my,
        refY2: my,
        dropX1: mx,
        dropY1: my,
        dropX2: mx,
        dropY2: axisY,
        labelX: mx + markerRadius + 4,
        labelY: my - 4,
      };
    }
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: i,
      color,
      minColor,
      maxColor,
      points,
      path,
      finiteCount: points.length,
      totalCount: arr.length,
      minMarker,
      maxMarker,
    });
  }

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_MIN_MAX_TICK_COUNT;
  const stepCount = Math.max(2, Math.floor(tickCount));
  const xTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = xMin + (xRange * i) / (stepCount - 1);
    xTicks.push({
      value,
      position: padding + ((value - xMin) / xRange) * innerWidth,
    });
  }
  const yTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = yMin + (yRange * i) / (stepCount - 1);
    yTicks.push({
      value,
      position:
        padding + innerHeight - ((value - yMin) / yRange) * innerHeight,
    });
  }

  return {
    series: layoutSeries,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineMinMaxChart(
  series: readonly ChartLineMinMaxSeries[] | undefined | null,
  hidden?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  let any = false;
  let totalPoints = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const arr = Array.isArray(s.data) ? s.data : [];
    const ex = findLineMinMaxExtrema(arr);
    totalPoints += getLineMinMaxFinitePoints(arr).length;
    if (!ex) continue;
    any = true;
    parts.push(
      `${s.label}: min ${fmtV(ex.min.y)} at x=${fmtV(ex.min.x)}, max ${fmtV(ex.max.y)} at x=${fmtV(ex.max.x)}`,
    );
  }
  if (!any) return 'No data';
  return `Line chart with min and max markers across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineMinMaxPointClick {
  series: ChartLineMinMaxLayoutSeries;
  point: ChartLineMinMaxLayoutPoint;
}

export interface ChartLineMinMaxMarkerClick {
  series: ChartLineMinMaxLayoutSeries;
  marker: ChartLineMinMaxLayoutMarker;
}

export interface ChartLineMinMaxProps {
  series: readonly ChartLineMinMaxSeries[];
  hiddenSeries?: ReadonlySet<string>;
  defaultHiddenSeries?: ReadonlySet<string>;
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  lineOpacity?: number;
  refLineOpacity?: number;
  refLineDashArray?: string;
  dropLineOpacity?: number;
  dropLineDashArray?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showMin?: boolean;
  showMax?: boolean;
  showRefLines?: boolean;
  showDropLines?: boolean;
  showMarkerLabels?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineMinMaxPointClick) => void;
  onMarkerClick?: (info: ChartLineMinMaxMarkerClick) => void;
  style?: CSSProperties;
}

export const ChartLineMinMax = forwardRef(function ChartLineMinMax(
  {
    series,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_MIN_MAX_WIDTH,
    height = DEFAULT_CHART_LINE_MIN_MAX_HEIGHT,
    padding = DEFAULT_CHART_LINE_MIN_MAX_PADDING,
    tickCount = DEFAULT_CHART_LINE_MIN_MAX_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MIN_MAX_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MIN_MAX_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_MIN_MAX_MARKER_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_MIN_MAX_LINE_OPACITY,
    refLineOpacity = DEFAULT_CHART_LINE_MIN_MAX_REF_OPACITY,
    refLineDashArray = DEFAULT_CHART_LINE_MIN_MAX_REF_DASH,
    dropLineOpacity = DEFAULT_CHART_LINE_MIN_MAX_DROP_OPACITY,
    dropLineDashArray = DEFAULT_CHART_LINE_MIN_MAX_DROP_DASH,
    gridColor = DEFAULT_CHART_LINE_MIN_MAX_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MIN_MAX_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showMin = true,
    showMax = true,
    showRefLines = true,
    showDropLines = false,
    showMarkerLabels = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with min/max markers',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onMarkerClick,
    style,
  }: ChartLineMinMaxProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const fmtValue = useCallback(
    (n: number) => (formatValue ? formatValue(n) : String(n)),
    [formatValue],
  );
  const fmtX = useCallback(
    (n: number) => (formatX ? formatX(n) : String(n)),
    [formatX],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineMinMaxLayout({
        series,
        hiddenSeries: hidden,
        showMin,
        showMax,
        markerRadius,
        ...(xMin !== undefined ? { xMin } : {}),
        ...(xMax !== undefined ? { xMax } : {}),
        ...(yMin !== undefined ? { yMin } : {}),
        ...(yMax !== undefined ? { yMax } : {}),
        width,
        height,
        padding,
        tickCount,
      }),
    [
      series,
      hidden,
      showMin,
      showMax,
      markerRadius,
      xMin,
      xMax,
      yMin,
      yMax,
      width,
      height,
      padding,
      tickCount,
    ],
  );

  const description =
    ariaDescription ?? describeLineMinMaxChart(series, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineMinMaxSeries) => {
      const next = new Set(hidden);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      if (hiddenSeries === undefined) setInternalHidden(next);
      if (onHiddenSeriesChange) onHiddenSeriesChange(next);
    },
    [hidden, hiddenSeries, onHiddenSeriesChange],
  );

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-min-max"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-show-min={showMin ? 'true' : 'false'}
      data-show-max={showMax ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-min-max-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-min-max-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-min-max-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-min-max-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-min-max-grid-line"
                  data-axis="x"
                  data-tick-value={t.value}
                  x1={t.position}
                  y1={padding}
                  x2={t.position}
                  y2={padding + layout.innerHeight}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
              {layout.yTicks.map((t) => (
                <line
                  key={`grid-y-${t.value}`}
                  data-section="chart-line-min-max-grid-line"
                  data-axis="y"
                  data-tick-value={t.value}
                  x1={padding}
                  y1={t.position}
                  x2={padding + layout.innerWidth}
                  y2={t.position}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-min-max-axes">
              <line
                data-section="chart-line-min-max-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-min-max-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-min-max-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-min-max-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.position}
                        y1={padding + layout.innerHeight}
                        x2={t.position}
                        y2={padding + layout.innerHeight + 4}
                        stroke={axisColor}
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-line-min-max-tick-label"
                        data-axis="x"
                        data-tick-value={t.value}
                        x={t.position}
                        y={padding + layout.innerHeight + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill="currentColor"
                      >
                        {fmtX(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ) : null}
              {layout.yTicks.length > 0 ? (
                <g data-section="chart-line-min-max-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-min-max-tick"
                      data-axis="y"
                    >
                      <line
                        x1={padding}
                        y1={t.position}
                        x2={padding - 4}
                        y2={t.position}
                        stroke={axisColor}
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-line-min-max-tick-label"
                        data-axis="y"
                        data-tick-value={t.value}
                        x={padding - 6}
                        y={t.position + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill="currentColor"
                      >
                        {fmtValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ) : null}
              {xLabel ? (
                <text
                  data-section="chart-line-min-max-x-label"
                  x={padding + layout.innerWidth / 2}
                  y={padding + layout.innerHeight + 30}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-min-max-y-label"
                  x={padding - 30}
                  y={padding + layout.innerHeight / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  transform={`rotate(-90 ${padding - 30} ${padding + layout.innerHeight / 2})`}
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Horizontal reference lines at min/max y values */}
          {showRefLines ? (
            <g data-section="chart-line-min-max-ref-lines">
              {layout.series.flatMap((s) => {
                const lines: JSX.Element[] = [];
                if (showMin && s.minMarker) {
                  lines.push(
                    <line
                      key={`ref-min-${s.id}`}
                      data-section="chart-line-min-max-ref-line"
                      data-series-id={s.id}
                      data-extremum-kind="min"
                      data-y-value={s.minMarker.y}
                      x1={padding}
                      y1={s.minMarker.refY1}
                      x2={padding + layout.innerWidth}
                      y2={s.minMarker.refY1}
                      stroke={s.minMarker.color}
                      strokeOpacity={refLineOpacity}
                      strokeDasharray={refLineDashArray}
                      strokeWidth={1}
                    />,
                  );
                }
                if (showMax && s.maxMarker) {
                  lines.push(
                    <line
                      key={`ref-max-${s.id}`}
                      data-section="chart-line-min-max-ref-line"
                      data-series-id={s.id}
                      data-extremum-kind="max"
                      data-y-value={s.maxMarker.y}
                      x1={padding}
                      y1={s.maxMarker.refY1}
                      x2={padding + layout.innerWidth}
                      y2={s.maxMarker.refY1}
                      stroke={s.maxMarker.color}
                      strokeOpacity={refLineOpacity}
                      strokeDasharray={refLineDashArray}
                      strokeWidth={1}
                    />,
                  );
                }
                return lines;
              })}
            </g>
          ) : null}

          {/* Drop lines from min/max marker to the x-axis */}
          {showDropLines ? (
            <g data-section="chart-line-min-max-drop-lines">
              {layout.series.flatMap((s) => {
                const lines: JSX.Element[] = [];
                if (showMin && s.minMarker) {
                  lines.push(
                    <line
                      key={`drop-min-${s.id}`}
                      data-section="chart-line-min-max-drop-line"
                      data-series-id={s.id}
                      data-extremum-kind="min"
                      x1={s.minMarker.dropX1}
                      y1={s.minMarker.dropY1}
                      x2={s.minMarker.dropX2}
                      y2={s.minMarker.dropY2}
                      stroke={s.minMarker.color}
                      strokeOpacity={dropLineOpacity}
                      strokeDasharray={dropLineDashArray}
                      strokeWidth={1}
                    />,
                  );
                }
                if (showMax && s.maxMarker) {
                  lines.push(
                    <line
                      key={`drop-max-${s.id}`}
                      data-section="chart-line-min-max-drop-line"
                      data-series-id={s.id}
                      data-extremum-kind="max"
                      x1={s.maxMarker.dropX1}
                      y1={s.maxMarker.dropY1}
                      x2={s.maxMarker.dropX2}
                      y2={s.maxMarker.dropY2}
                      stroke={s.maxMarker.color}
                      strokeOpacity={dropLineOpacity}
                      strokeDasharray={dropLineDashArray}
                      strokeWidth={1}
                    />,
                  );
                }
                return lines;
              })}
            </g>
          ) : null}

          {/* Series lines + dots */}
          <g data-section="chart-line-min-max-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-min-max-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-min-y={s.minMarker ? s.minMarker.y : ''}
                  data-series-max-y={s.maxMarker ? s.maxMarker.y : ''}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-min-max-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points`}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={dim}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots
                    ? s.points.map((p) => {
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}${p.isMin ? ', min' : ''}${p.isMax ? ', max' : ''}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-min-max-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-is-min={p.isMin ? 'true' : 'false'}
                            data-is-max={p.isMax ? 'true' : 'false'}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={s.color}
                            fillOpacity={opacity}
                            stroke={s.color}
                            strokeWidth={1}
                            onMouseEnter={() => setHoveredKey(key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            onFocus={() => setHoveredKey(key)}
                            onBlur={() => setHoveredKey(null)}
                            onClick={() => {
                              if (onPointClick) {
                                onPointClick({ series: s, point: p });
                              }
                            }}
                          />
                        );
                      })
                    : null}
                </g>
              );
            })}
          </g>

          {/* Min/max markers on top of the series */}
          <g data-section="chart-line-min-max-markers">
            {layout.series.flatMap((s) => {
              const out: JSX.Element[] = [];
              if (showMin && s.minMarker) {
                const m = s.minMarker;
                const key = `marker::${s.id}::min`;
                const isHovered = hoveredKey === key;
                out.push(
                  <path
                    key={key}
                    data-section="chart-line-min-max-marker"
                    data-series-id={s.id}
                    data-extremum-kind="min"
                    data-extremum-index={m.index}
                    data-extremum-x={m.x}
                    data-extremum-y={m.y}
                    data-marker-color={m.color}
                    data-hovered={isHovered ? 'true' : 'false'}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: min ${fmtValue(m.y)} at x=${fmtX(m.x)}`}
                    d={m.iconPath}
                    fill={m.color}
                    fillOpacity={isHovered ? 1 : 0.9}
                    stroke={m.color}
                    strokeWidth={1.5}
                    onMouseEnter={() => setHoveredKey(key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onFocus={() => setHoveredKey(key)}
                    onBlur={() => setHoveredKey(null)}
                    onClick={() => {
                      if (onMarkerClick)
                        onMarkerClick({ series: s, marker: m });
                    }}
                  />,
                );
                if (showMarkerLabels) {
                  out.push(
                    <text
                      key={`${key}-label`}
                      data-section="chart-line-min-max-marker-label"
                      data-series-id={s.id}
                      data-extremum-kind="min"
                      x={m.labelX}
                      y={m.labelY + markerRadius + 8}
                      fontSize={10}
                      fill={m.color}
                      style={{ pointerEvents: 'none' }}
                    >
                      min {fmtValue(m.y)}
                    </text>,
                  );
                }
              }
              if (showMax && s.maxMarker) {
                const m = s.maxMarker;
                const key = `marker::${s.id}::max`;
                const isHovered = hoveredKey === key;
                out.push(
                  <path
                    key={key}
                    data-section="chart-line-min-max-marker"
                    data-series-id={s.id}
                    data-extremum-kind="max"
                    data-extremum-index={m.index}
                    data-extremum-x={m.x}
                    data-extremum-y={m.y}
                    data-marker-color={m.color}
                    data-hovered={isHovered ? 'true' : 'false'}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: max ${fmtValue(m.y)} at x=${fmtX(m.x)}`}
                    d={m.iconPath}
                    fill={m.color}
                    fillOpacity={isHovered ? 1 : 0.9}
                    stroke={m.color}
                    strokeWidth={1.5}
                    onMouseEnter={() => setHoveredKey(key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onFocus={() => setHoveredKey(key)}
                    onBlur={() => setHoveredKey(null)}
                    onClick={() => {
                      if (onMarkerClick)
                        onMarkerClick({ series: s, marker: m });
                    }}
                  />,
                );
                if (showMarkerLabels) {
                  out.push(
                    <text
                      key={`${key}-label`}
                      data-section="chart-line-min-max-marker-label"
                      data-series-id={s.id}
                      data-extremum-kind="max"
                      x={m.labelX}
                      y={m.labelY - markerRadius - 4}
                      fontSize={10}
                      fill={m.color}
                      style={{ pointerEvents: 'none' }}
                    >
                      max {fmtValue(m.y)}
                    </text>,
                  );
                }
              }
              return out;
            })}
          </g>
        </svg>

        {showTooltip && hoveredKey ? (() => {
          if (hoveredKey.startsWith('marker::')) {
            const rest = hoveredKey.slice('marker::'.length);
            const sep = rest.lastIndexOf('::');
            if (sep < 0) return null;
            const sid = rest.slice(0, sep);
            const kind = rest.slice(sep + 2) as ChartLineMinMaxKind;
            const s = layout.series.find((x) => x.id === sid);
            if (!s) return null;
            const marker = kind === 'min' ? s.minMarker : s.maxMarker;
            if (!marker) return null;
            const tx = Math.min(Math.max(marker.px + 8, 0), width - 200);
            const ty = Math.min(Math.max(marker.py - 56, 0), height - 78);
            return (
              <div
                data-section="chart-line-min-max-tooltip"
                data-series-id={s.id}
                data-extremum-kind={kind}
                className="pointer-events-none absolute z-10 min-w-[180px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
                style={{ left: tx, top: ty }}
              >
                <div
                  data-section="chart-line-min-max-tooltip-label"
                  className="font-medium"
                >
                  {s.label}
                </div>
                <div
                  data-section="chart-line-min-max-tooltip-kind"
                  className="text-slate-600"
                  style={{ color: marker.color }}
                >
                  {kind === 'min' ? 'Min' : 'Max'}: {fmtValue(marker.y)}
                </div>
                <div
                  data-section="chart-line-min-max-tooltip-x"
                  className="text-slate-500"
                >
                  at x = {fmtX(marker.x)}
                </div>
              </div>
            );
          }
          // Standard dot tooltip
          const sep = hoveredKey.indexOf('::');
          if (sep < 0) return null;
          const sid = hoveredKey.slice(0, sep);
          const idx = Number(hoveredKey.slice(sep + 2));
          const s = layout.series.find((x) => x.id === sid);
          if (!s) return null;
          const p = s.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 180);
          const ty = Math.min(Math.max(p.py - 56, 0), height - 72);
          return (
            <div
              data-section="chart-line-min-max-point-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div className="font-medium">{s.label}</div>
              <div className="text-slate-600">x: {fmtX(p.x)}</div>
              <div className="text-slate-700" style={{ fontWeight: 600 }}>
                y: {fmtValue(p.y)}
              </div>
              {p.isMin || p.isMax ? (
                <div
                  data-section="chart-line-min-max-point-tooltip-tag"
                  className="text-slate-500"
                >
                  {p.isMin ? 'min' : ''}
                  {p.isMin && p.isMax ? ' & ' : ''}
                  {p.isMax ? 'max' : ''}
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-min-max-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-min-max-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-min-max-legend-button"
                  data-series-id={s.id}
                  aria-pressed={!isHidden}
                  onClick={() => toggleSeries(s)}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5',
                    isHidden ? 'opacity-50' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span
                    data-section="chart-line-min-max-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineMinMaxDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-min-max-legend-label">
                    {s.label}
                  </span>
                  {visEntry && visEntry.minMarker && visEntry.maxMarker ? (
                    <span
                      data-section="chart-line-min-max-legend-stats"
                      className="text-slate-500"
                    >
                      ({fmtValue(visEntry.minMarker.y)} ..{' '}
                      {fmtValue(visEntry.maxMarker.y)})
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineMinMax.displayName = 'ChartLineMinMax';
