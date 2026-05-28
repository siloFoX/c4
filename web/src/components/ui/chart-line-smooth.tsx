import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SMOOTH_WIDTH = 560;
export const DEFAULT_CHART_LINE_SMOOTH_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SMOOTH_PADDING = 40;
export const DEFAULT_CHART_LINE_SMOOTH_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SMOOTH_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_SMOOTH_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SMOOTH_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_SMOOTH_TENSION = 0.5;
export const DEFAULT_CHART_LINE_SMOOTH_CURVE = 'catmullRom';
export const DEFAULT_CHART_LINE_SMOOTH_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SMOOTH_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_SMOOTH_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];

export type ChartLineSmoothCurve = 'catmullRom' | 'monotone';

export interface ChartLineSmoothPoint {
  x: number;
  y: number;
}

export interface ChartLineSmoothSeries {
  id: string;
  label: string;
  data: readonly ChartLineSmoothPoint[];
  color?: string;
}

export interface ChartLineSmoothLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineSmoothLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineSmoothLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  path: string;
}

export interface ComputeLineSmoothLayoutResult {
  series: ChartLineSmoothLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  curve: ChartLineSmoothCurve;
  tension: number;
  innerWidth: number;
  innerHeight: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineSmoothPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineSmoothPoint).x) &&
    isFiniteNumber((p as ChartLineSmoothPoint).y)
  );
}

export function getLineSmoothDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_SMOOTH_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_SMOOTH_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_SMOOTH_PALETTE.length
  ]!;
}

export function getLineSmoothFinitePoints(
  points: readonly ChartLineSmoothPoint[],
): ChartLineSmoothPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

export function getLineSmoothBounds(
  series: readonly ChartLineSmoothSeries[],
  hidden?: readonly string[],
): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const hiddenSet = new Set(hidden ?? []);
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of series) {
    if (!s || typeof s.id !== 'string') continue;
    if (hiddenSet.has(s.id)) continue;
    for (const p of getLineSmoothFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  }
  if (!any) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  return { xMin, xMax, yMin, yMax };
}

export function getLineSmoothTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_SMOOTH_TICK_COUNT),
  );
  if (min === max) return [{ value: min, position: 0 }];
  const step = (max - min) / (n - 1);
  const out: { value: number; position: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const value = min + step * i;
    const position = (value - min) / (max - min);
    out.push({ value, position });
  }
  return out;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

/**
 * Canonical Catmull-Rom-to-Bezier path builder.
 *
 * For each segment from `P[i]` to `P[i+1]`, computes two control points
 * `CP1, CP2` using the four-point window `P[i-1], P[i], P[i+1], P[i+2]`
 * (endpoints are duplicated):
 *
 *     CP1 = P[i]   + tension/3 * (P[i+1] - P[i-1])
 *     CP2 = P[i+1] - tension/3 * (P[i+2] - P[i])
 *
 * `tension = 0` collapses to a straight line between every pair of
 * points; `tension = 1` gives full Catmull-Rom smoothing. The default
 * (`0.5`) is the standard Catmull-Rom-to-Bezier weight.
 */
export function buildCatmullRomPath(
  points: ReadonlyArray<{ x: number; y: number }>,
  tension: number = DEFAULT_CHART_LINE_SMOOTH_TENSION,
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  const t = Math.max(0, Math.min(1, tension));
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${fmt(p.x)} ${fmt(p.y)}`;
  }
  const first = points[0]!;
  let path = `M ${fmt(first.x)} ${fmt(first.y)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + ((p2.x - p0.x) * t) / 3;
    const cp1y = p1.y + ((p2.y - p0.y) * t) / 3;
    const cp2x = p2.x - ((p3.x - p1.x) * t) / 3;
    const cp2y = p2.y - ((p3.y - p1.y) * t) / 3;
    path += ` C ${fmt(cp1x)} ${fmt(cp1y)} ${fmt(cp2x)} ${fmt(cp2y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return path;
}

/**
 * Canonical monotone-cubic (Fritsch-Carlson) path builder.
 *
 * Each segment is a cubic Hermite spline where the tangent at every
 * point is adjusted so the curve never overshoots adjacent y values.
 *
 * Algorithm (Fritsch & Carlson 1980):
 *  1. Secant slopes `d[i] = (y[i+1] - y[i]) / (x[i+1] - x[i])`.
 *  2. Initial tangents `m[i] = (d[i-1] + d[i]) / 2` for interior; for
 *     the endpoints `m[0] = d[0]`, `m[N-1] = d[N-1]`.
 *  3. Adjustment: if `d[i] == 0`, force `m[i] = m[i+1] = 0`; else with
 *     `a = m[i]/d[i]`, `b = m[i+1]/d[i]`, if `a^2 + b^2 > 9` scale
 *     `(m[i], m[i+1])` by `tau = 3 / sqrt(a^2 + b^2)`.
 *  4. Convert each Hermite segment to a cubic Bezier using
 *     `CP1 = (x[i] + dx/3, y[i] + m[i] * dx / 3)`,
 *     `CP2 = (x[i+1] - dx/3, y[i+1] - m[i+1] * dx / 3)`.
 *
 * Returns an empty string for empty input; a lone `M` for a single
 * point; a straight `L` segment for two points (the monotone formula
 * collapses to the secant slope).
 */
export function buildMonotonePath(
  points: ReadonlyArray<{ x: number; y: number }>,
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${fmt(p.x)} ${fmt(p.y)}`;
  }
  const n = points.length;
  // Secant slopes
  const d: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const x0 = points[i]!.x;
    const x1 = points[i + 1]!.x;
    const y0 = points[i]!.y;
    const y1 = points[i + 1]!.y;
    const dx = x1 - x0;
    d.push(dx !== 0 ? (y1 - y0) / dx : 0);
  }
  // Initial tangents
  const m: number[] = new Array(n).fill(0);
  m[0] = d[0]!;
  m[n - 1] = d[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    m[i] = (d[i - 1]! + d[i]!) / 2;
  }
  // Monotonicity adjustment
  for (let i = 0; i < n - 1; i += 1) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const h2 = a * a + b * b;
    if (h2 > 9) {
      const tau = 3 / Math.sqrt(h2);
      m[i] = tau * a * d[i]!;
      m[i + 1] = tau * b * d[i]!;
    }
  }
  const first = points[0]!;
  let path = `M ${fmt(first.x)} ${fmt(first.y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = points[i]!;
    const p1 = points[i + 1]!;
    const dx = p1.x - p0.x;
    const cp1x = p0.x + dx / 3;
    const cp1y = p0.y + (m[i]! * dx) / 3;
    const cp2x = p1.x - dx / 3;
    const cp2y = p1.y - (m[i + 1]! * dx) / 3;
    path += ` C ${fmt(cp1x)} ${fmt(cp1y)} ${fmt(cp2x)} ${fmt(cp2y)} ${fmt(p1.x)} ${fmt(p1.y)}`;
  }
  return path;
}

/**
 * Smooth-line dispatcher.
 *
 * - `'catmullRom'` -> `buildCatmullRomPath(points, tension)`.
 * - `'monotone'` -> `buildMonotonePath(points)`.
 */
export function buildSmoothLinePath(
  points: ReadonlyArray<{ x: number; y: number }>,
  curve: ChartLineSmoothCurve,
  tension: number = DEFAULT_CHART_LINE_SMOOTH_TENSION,
): string {
  if (curve === 'monotone') return buildMonotonePath(points);
  return buildCatmullRomPath(points, tension);
}

export interface ComputeLineSmoothLayoutInput {
  series: readonly ChartLineSmoothSeries[];
  hidden?: readonly string[];
  curve?: ChartLineSmoothCurve;
  tension?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineSmoothLayout(
  input: ComputeLineSmoothLayoutInput,
): ComputeLineSmoothLayoutResult {
  const curve: ChartLineSmoothCurve =
    input.curve ?? DEFAULT_CHART_LINE_SMOOTH_CURVE;
  const tension = isFiniteNumber(input.tension)
    ? Math.max(0, Math.min(1, input.tension))
    : DEFAULT_CHART_LINE_SMOOTH_TENSION;
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineSmoothLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    curve,
    tension,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.series || input.series.length === 0) return empty;

  const hiddenSet = new Set(input.hidden ?? []);
  const visible = input.series.filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0) return empty;

  const bounds = getLineSmoothBounds(input.series, input.hidden);
  let xMin = isFiniteNumber(input.xMin) ? input.xMin : bounds.xMin;
  let xMax = isFiniteNumber(input.xMax) ? input.xMax : bounds.xMax;
  let yMin = isFiniteNumber(input.yMin) ? input.yMin : bounds.yMin;
  let yMax = isFiniteNumber(input.yMax) ? input.yMax : bounds.yMax;
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

  const indexById = new Map(input.series.map((s, i) => [s.id, i]));
  const seriesOut: ChartLineSmoothLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineSmoothDefaultColor(seriesIndex);
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineSmoothLayoutPoint[] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]!;
      if (!isFinitePoint(p)) continue;
      points.push({
        index: i,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
      });
    }
    // For monotone we MUST have strictly increasing x. Sort points by px.
    const pointsForPath =
      curve === 'monotone'
        ? [...points].sort((a, b) => a.px - b.px || a.index - b.index)
        : points;
    const path = buildSmoothLinePath(
      pointsForPath.map((p) => ({ x: p.px, y: p.py })),
      curve,
      tension,
    );
    return {
      id: s.id,
      label: s.label,
      index: seriesIndex,
      color,
      points,
      finiteCount: points.length,
      totalCount: arr.length,
      path,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_SMOOTH_TICK_COUNT;
  const xTicks = getLineSmoothTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineSmoothTicks(yMin, yMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + innerHeight - t.position * innerHeight,
  }));

  return {
    series: seriesOut,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    curve,
    tension,
    innerWidth,
    innerHeight,
  };
}

export function describeLineSmoothChart(
  series: readonly ChartLineSmoothSeries[],
  hidden?: readonly string[],
  curve: ChartLineSmoothCurve = DEFAULT_CHART_LINE_SMOOTH_CURVE,
  formatValue?: (n: number) => string,
): string {
  const hiddenSet = new Set(hidden ?? []);
  const visible = (series ?? []).filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  let total = 0;
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (const s of visible) {
    for (const p of getLineSmoothFinitePoints(s.data ?? [])) {
      total += 1;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  }
  if (total === 0) return 'No data';
  return `Smooth line chart (${curve}) with ${visible.length} series and ${total} points. x range ${fmtV(xMin)} to ${fmtV(xMax)}, y range ${fmtV(yMin)} to ${fmtV(yMax)}.`;
}

export interface ChartLineSmoothPointClick {
  series: ChartLineSmoothLayoutSeries;
  point: ChartLineSmoothLayoutPoint;
}

export interface ChartLineSmoothSeriesToggle {
  series: ChartLineSmoothSeries;
  hidden: boolean;
}

export interface ChartLineSmoothProps {
  series: readonly ChartLineSmoothSeries[];
  curve?: ChartLineSmoothCurve;
  tension?: number;
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
  lineOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineSmoothPointClick) => void;
  onSeriesToggle?: (info: ChartLineSmoothSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineSmooth = forwardRef(function ChartLineSmooth(
  {
    series = [],
    curve = DEFAULT_CHART_LINE_SMOOTH_CURVE,
    tension = DEFAULT_CHART_LINE_SMOOTH_TENSION,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_SMOOTH_WIDTH,
    height = DEFAULT_CHART_LINE_SMOOTH_HEIGHT,
    padding = DEFAULT_CHART_LINE_SMOOTH_PADDING,
    tickCount = DEFAULT_CHART_LINE_SMOOTH_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SMOOTH_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SMOOTH_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_SMOOTH_LINE_OPACITY,
    gridColor = DEFAULT_CHART_LINE_SMOOTH_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SMOOTH_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Smooth line chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineSmoothProps,
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

  const [internalHidden, setInternalHidden] = useState<string[]>(
    Array.from(defaultHiddenSeries ?? []),
  );
  const controlledHidden = hiddenSeries !== undefined;
  const effectiveHidden = controlledHidden
    ? Array.from(hiddenSeries ?? [])
    : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineSmoothLayout({
        series,
        hidden: effectiveHidden,
        curve,
        tension,
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
      effectiveHidden,
      curve,
      tension,
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
    ariaDescription ??
    describeLineSmoothChart(series, effectiveHidden, curve, fmtValue);

  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);

  const toggleSeries = useCallback(
    (s: ChartLineSmoothSeries) => {
      const isHidden = effectiveHidden.includes(s.id);
      const next = isHidden
        ? effectiveHidden.filter((id) => id !== s.id)
        : [...effectiveHidden, s.id];
      if (!controlledHidden) setInternalHidden(next);
      if (onHiddenSeriesChange) onHiddenSeriesChange(next);
      if (onSeriesToggle) onSeriesToggle({ series: s, hidden: !isHidden });
    },
    [effectiveHidden, controlledHidden, onHiddenSeriesChange, onSeriesToggle],
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
      data-section="chart-line-smooth"
      data-curve={curve}
      data-tension={tension}
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-smooth-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-smooth-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-smooth-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-smooth-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-smooth-grid-line"
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
                  data-section="chart-line-smooth-grid-line"
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
            <g data-section="chart-line-smooth-axes">
              <line
                data-section="chart-line-smooth-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-smooth-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-smooth-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-smooth-tick"
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
                        data-section="chart-line-smooth-tick-label"
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
                <g data-section="chart-line-smooth-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-smooth-tick"
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
                        data-section="chart-line-smooth-tick-label"
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
                  data-section="chart-line-smooth-x-label"
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
                  data-section="chart-line-smooth-y-label"
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

          <g data-section="chart-line-smooth-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-smooth-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-smooth-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: ${curve} smoothed line with ${s.finiteCount} points`}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={seriesDim}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots
                    ? s.points.map((p) => {
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const dotOpacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-smooth-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={s.color}
                            fillOpacity={dotOpacity}
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
        </svg>

        {showTooltip && hoveredKey ? (() => {
          const sep = hoveredKey.indexOf('::');
          if (sep < 0) return null;
          const sid = hoveredKey.slice(0, sep);
          const idx = Number(hoveredKey.slice(sep + 2));
          const s = layout.series.find((x) => x.id === sid);
          if (!s) return null;
          const p = s.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 160);
          const ty = Math.min(Math.max(p.py - 36, 0), height - 48);
          return (
            <div
              data-section="chart-line-smooth-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-smooth-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-smooth-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-smooth-tooltip-y"
                className="text-slate-600"
              >
                y: {fmtValue(p.y)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-smooth-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineSmoothDefaultColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-line-smooth-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-smooth-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-smooth-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: color }}
                  />
                  <span data-section="chart-line-smooth-legend-label">
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

ChartLineSmooth.displayName = 'ChartLineSmooth';
