import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MARKER_WIDTH = 560;
export const DEFAULT_CHART_LINE_MARKER_HEIGHT = 320;
export const DEFAULT_CHART_LINE_MARKER_PADDING = 40;
export const DEFAULT_CHART_LINE_MARKER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MARKER_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_MARKER_MARKER_SIZE = 5;
export const DEFAULT_CHART_LINE_MARKER_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_MARKER_MARKER_OPACITY = 1;
export const DEFAULT_CHART_LINE_MARKER_MARKER_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_MARKER_DEFAULT_SHAPE = 'circle';
export const DEFAULT_CHART_LINE_MARKER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MARKER_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_MARKER_PALETTE = [
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

export const LINE_MARKER_SHAPES: ChartLineMarkerShape[] = [
  'circle',
  'square',
  'triangle',
  'diamond',
  'none',
];

export type ChartLineMarkerShape =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'diamond'
  | 'none';

export interface ChartLineMarkerPoint {
  x: number;
  y: number;
  marker?: ChartLineMarkerShape;
}

export interface ChartLineMarkerSeries {
  id: string;
  label: string;
  data: readonly ChartLineMarkerPoint[];
  color?: string;
  marker?: ChartLineMarkerShape;
  markerFill?: string;
}

export interface ChartLineMarkerLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  shape: ChartLineMarkerShape;
  markerPath: string;
}

export interface ChartLineMarkerLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  markerFill: string;
  defaultShape: ChartLineMarkerShape;
  points: ChartLineMarkerLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  linePath: string;
}

export interface ComputeLineMarkerLayoutResult {
  series: ChartLineMarkerLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineMarkerPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineMarkerPoint).x) &&
    isFiniteNumber((p as ChartLineMarkerPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineMarkerDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_MARKER_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_MARKER_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_MARKER_PALETTE.length
  ]!;
}

export function getLineMarkerFinitePoints(
  points: readonly ChartLineMarkerPoint[],
): ChartLineMarkerPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

export function getLineMarkerBounds(
  series: readonly ChartLineMarkerSeries[],
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
    for (const p of getLineMarkerFinitePoints(s.data ?? [])) {
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

export function getLineMarkerTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_MARKER_TICK_COUNT),
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

export function buildLineMarkerLinePath(
  points: ReadonlyArray<{ px: number; py: number }>,
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  let path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
  for (let i = 1; i < points.length; i += 1) {
    path += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.py)}`;
  }
  return path;
}

/**
 * Resolves the effective marker shape for a point.
 *
 *  1. point.marker if defined (per-point override).
 *  2. series default marker.
 *  3. `'circle'` as final fallback.
 *
 * Returns `'none'` verbatim when an adopter wants the marker omitted
 * at a specific point.
 */
export function resolveLineMarkerShape(
  point: ChartLineMarkerPoint | undefined,
  seriesDefault: ChartLineMarkerShape | undefined,
): ChartLineMarkerShape {
  if (point && point.marker) return point.marker;
  if (seriesDefault) return seriesDefault;
  return DEFAULT_CHART_LINE_MARKER_DEFAULT_SHAPE;
}

/**
 * Returns an SVG path string for a marker centered at `(cx, cy)` with
 * half-extent `size` (so the full marker spans `2 * size`). All shapes
 * are emitted as closed `M ... Z` paths so they can be filled.
 *
 *  - `'circle'`: two semicircular arcs joined into a closed circle.
 *  - `'square'`: 4-vertex axis-aligned square.
 *  - `'triangle'`: equilateral triangle pointing up; vertices `(cx, cy-size)`,
 *    `(cx +/- size * sqrt(3)/2, cy + size / 2)`.
 *  - `'diamond'`: 4-vertex rhombus (rotated square) at the cardinal
 *    points.
 *  - `'none'`: empty string.
 *
 * Non-positive `size` -> empty string.
 */
export function buildLineMarkerShapePath(
  shape: ChartLineMarkerShape,
  cx: number,
  cy: number,
  size: number,
): string {
  if (shape === 'none') return '';
  if (!isFiniteNumber(size) || size <= 0) return '';
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) return '';
  switch (shape) {
    case 'circle':
      return `M ${fmt(cx - size)} ${fmt(cy)} A ${fmt(size)} ${fmt(size)} 0 1 0 ${fmt(cx + size)} ${fmt(cy)} A ${fmt(size)} ${fmt(size)} 0 1 0 ${fmt(cx - size)} ${fmt(cy)} Z`;
    case 'square':
      return `M ${fmt(cx - size)} ${fmt(cy - size)} L ${fmt(cx + size)} ${fmt(cy - size)} L ${fmt(cx + size)} ${fmt(cy + size)} L ${fmt(cx - size)} ${fmt(cy + size)} Z`;
    case 'triangle': {
      const half = (size * Math.sqrt(3)) / 2;
      return `M ${fmt(cx)} ${fmt(cy - size)} L ${fmt(cx + half)} ${fmt(cy + size / 2)} L ${fmt(cx - half)} ${fmt(cy + size / 2)} Z`;
    }
    case 'diamond':
      return `M ${fmt(cx)} ${fmt(cy - size)} L ${fmt(cx + size)} ${fmt(cy)} L ${fmt(cx)} ${fmt(cy + size)} L ${fmt(cx - size)} ${fmt(cy)} Z`;
    default:
      return '';
  }
}

export interface ComputeLineMarkerLayoutInput {
  series: readonly ChartLineMarkerSeries[];
  hidden?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  markerSize?: number;
}

export function computeLineMarkerLayout(
  input: ComputeLineMarkerLayoutInput,
): ComputeLineMarkerLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const markerSize = isFiniteNumber(input.markerSize)
    ? Math.max(0, input.markerSize)
    : DEFAULT_CHART_LINE_MARKER_MARKER_SIZE;

  const empty: ComputeLineMarkerLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
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

  const bounds = getLineMarkerBounds(input.series, input.hidden);
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
  const seriesOut: ChartLineMarkerLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineMarkerDefaultColor(seriesIndex);
    const markerFill = s.markerFill ?? color;
    const defaultShape: ChartLineMarkerShape =
      s.marker ?? DEFAULT_CHART_LINE_MARKER_DEFAULT_SHAPE;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineMarkerLayoutPoint[] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]!;
      if (!isFinitePoint(p)) continue;
      const px = xToPx(p.x);
      const py = yToPx(p.y);
      const shape = resolveLineMarkerShape(p, defaultShape);
      const markerPath = buildLineMarkerShapePath(shape, px, py, markerSize);
      points.push({
        index: i,
        x: p.x,
        y: p.y,
        px,
        py,
        shape,
        markerPath,
      });
    }
    const linePath = buildLineMarkerLinePath(points);
    return {
      id: s.id,
      label: s.label,
      index: seriesIndex,
      color,
      markerFill,
      defaultShape,
      points,
      finiteCount: points.length,
      totalCount: arr.length,
      linePath,
    };
  });

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_MARKER_TICK_COUNT;
  const xTicks = getLineMarkerTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineMarkerTicks(yMin, yMax, tickCount).map((t) => ({
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
    innerWidth,
    innerHeight,
  };
}

export function describeLineMarkerChart(
  series: readonly ChartLineMarkerSeries[],
  hidden?: readonly string[],
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
    for (const p of getLineMarkerFinitePoints(s.data ?? [])) {
      total += 1;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  }
  if (total === 0) return 'No data';
  const shapes = visible
    .map(
      (s) =>
        `${s.label} (${s.marker ?? DEFAULT_CHART_LINE_MARKER_DEFAULT_SHAPE})`,
    )
    .join(', ');
  return `Line chart with shape markers: ${visible.length} series and ${total} points (${shapes}). x range ${fmtV(xMin)} to ${fmtV(xMax)}, y range ${fmtV(yMin)} to ${fmtV(yMax)}.`;
}

export interface ChartLineMarkerPointClick {
  series: ChartLineMarkerLayoutSeries;
  point: ChartLineMarkerLayoutPoint;
}

export interface ChartLineMarkerSeriesToggle {
  series: ChartLineMarkerSeries;
  hidden: boolean;
}

export interface ChartLineMarkerProps {
  series: readonly ChartLineMarkerSeries[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  markerSize?: number;
  lineOpacity?: number;
  markerOpacity?: number;
  markerStrokeWidth?: number;
  gridColor?: string;
  axisColor?: string;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showAxis?: boolean;
  showGrid?: boolean;
  showMarkers?: boolean;
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
  onPointClick?: (info: ChartLineMarkerPointClick) => void;
  onSeriesToggle?: (info: ChartLineMarkerSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineMarker = forwardRef(function ChartLineMarker(
  {
    series = [],
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_MARKER_WIDTH,
    height = DEFAULT_CHART_LINE_MARKER_HEIGHT,
    padding = DEFAULT_CHART_LINE_MARKER_PADDING,
    tickCount = DEFAULT_CHART_LINE_MARKER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MARKER_STROKE_WIDTH,
    markerSize = DEFAULT_CHART_LINE_MARKER_MARKER_SIZE,
    lineOpacity = DEFAULT_CHART_LINE_MARKER_LINE_OPACITY,
    markerOpacity = DEFAULT_CHART_LINE_MARKER_MARKER_OPACITY,
    markerStrokeWidth = DEFAULT_CHART_LINE_MARKER_MARKER_STROKE_WIDTH,
    gridColor = DEFAULT_CHART_LINE_MARKER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MARKER_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showMarkers = true,
    showLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with markers',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineMarkerProps,
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
      computeLineMarkerLayout({
        series,
        hidden: effectiveHidden,
        ...(xMin !== undefined ? { xMin } : {}),
        ...(xMax !== undefined ? { xMax } : {}),
        ...(yMin !== undefined ? { yMin } : {}),
        ...(yMax !== undefined ? { yMax } : {}),
        width,
        height,
        padding,
        tickCount,
        markerSize,
      }),
    [
      series,
      effectiveHidden,
      xMin,
      xMax,
      yMin,
      yMax,
      width,
      height,
      padding,
      tickCount,
      markerSize,
    ],
  );

  const description =
    ariaDescription ??
    describeLineMarkerChart(series, effectiveHidden, fmtValue);
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);

  const toggleSeries = useCallback(
    (s: ChartLineMarkerSeries) => {
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
      data-section="chart-line-marker"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-marker-size={markerSize}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-marker-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-marker-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-marker-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-marker-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-marker-grid-line"
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
                  data-section="chart-line-marker-grid-line"
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
            <g data-section="chart-line-marker-axes">
              <line
                data-section="chart-line-marker-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-marker-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-marker-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-marker-tick"
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
                        data-section="chart-line-marker-tick-label"
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
                <g data-section="chart-line-marker-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-marker-tick"
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
                        data-section="chart-line-marker-tick-label"
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
                  data-section="chart-line-marker-x-label"
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
                  data-section="chart-line-marker-y-label"
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

          <g data-section="chart-line-marker-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-marker-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-marker={s.defaultShape}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-marker-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points`}
                    d={s.linePath}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={seriesDim}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showMarkers
                    ? s.points.map((p) => {
                        if (p.shape === 'none' || !p.markerPath) return null;
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const markerDim =
                          isAnyHovered && !isHovered ? 0.3 : markerOpacity;
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)} (${p.shape})`;
                        return (
                          <path
                            key={key}
                            data-section="chart-line-marker-marker"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-marker-shape={p.shape}
                            data-x={p.x}
                            data-y={p.y}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            d={p.markerPath}
                            fill={s.markerFill}
                            fillOpacity={markerDim}
                            stroke={s.color}
                            strokeWidth={markerStrokeWidth}
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 180);
          const ty = Math.min(Math.max(p.py - 48, 0), height - 64);
          return (
            <div
              data-section="chart-line-marker-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              data-marker-shape={p.shape}
              className="pointer-events-none absolute z-10 min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-marker-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-marker-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-marker-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              <div
                data-section="chart-line-marker-tooltip-shape"
                className="text-slate-500"
              >
                marker: {p.shape}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-marker-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineMarkerDefaultColor(i);
            const swatchShape: ChartLineMarkerShape =
              s.marker ?? DEFAULT_CHART_LINE_MARKER_DEFAULT_SHAPE;
            const swatchPath = buildLineMarkerShapePath(
              swatchShape,
              7,
              5,
              4,
            );
            return (
              <li
                key={s.id}
                data-section="chart-line-marker-legend-item"
                data-series-id={s.id}
                data-series-marker={swatchShape}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-marker-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <svg
                    data-section="chart-line-marker-legend-swatch"
                    width="14"
                    height="10"
                  >
                    <line
                      x1={1}
                      y1={5}
                      x2={13}
                      y2={5}
                      stroke={color}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                    {swatchPath ? (
                      <path
                        d={swatchPath}
                        fill={s.markerFill ?? color}
                        stroke={color}
                        strokeWidth={1}
                      />
                    ) : null}
                  </svg>
                  <span data-section="chart-line-marker-legend-label">
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

ChartLineMarker.displayName = 'ChartLineMarker';
