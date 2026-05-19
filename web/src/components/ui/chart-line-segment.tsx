import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SEGMENT_WIDTH = 560;
export const DEFAULT_CHART_LINE_SEGMENT_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SEGMENT_PADDING = 40;
export const DEFAULT_CHART_LINE_SEGMENT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SEGMENT_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_SEGMENT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SEGMENT_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_SEGMENT_CLASSIFY_BY = 'max';
export const DEFAULT_CHART_LINE_SEGMENT_FALLBACK_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SEGMENT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SEGMENT_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_SEGMENT_PALETTE = [
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

export type ChartLineSegmentClassifyBy =
  | 'max'
  | 'min'
  | 'avg'
  | 'start'
  | 'end';

export interface ChartLineSegmentThreshold {
  value: number;
  color: string;
  label?: string;
}

export interface ChartLineSegmentPoint {
  x: number;
  y: number;
}

export interface ChartLineSegmentSeries {
  id: string;
  label: string;
  data: readonly ChartLineSegmentPoint[];
  color?: string;
  thresholds?: readonly ChartLineSegmentThreshold[];
  classifyBy?: ChartLineSegmentClassifyBy;
}

export interface ChartLineSegmentLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineSegmentLayoutSegment {
  index: number;
  startIndex: number;
  endIndex: number;
  color: string;
  thresholdLabel: string | null;
  thresholdValue: number | null;
  value: number;
  path: string;
}

export interface ChartLineSegmentLayoutSeries {
  id: string;
  label: string;
  index: number;
  fallbackColor: string;
  classifyBy: ChartLineSegmentClassifyBy;
  thresholds: ChartLineSegmentThreshold[];
  points: ChartLineSegmentLayoutPoint[];
  segments: ChartLineSegmentLayoutSegment[];
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineSegmentLayoutResult {
  series: ChartLineSegmentLayoutSeries[];
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

function isFinitePoint(p: unknown): p is ChartLineSegmentPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineSegmentPoint).x) &&
    isFiniteNumber((p as ChartLineSegmentPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineSegmentDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_SEGMENT_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_SEGMENT_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_SEGMENT_PALETTE.length
  ]!;
}

export function getLineSegmentFinitePoints(
  points: readonly ChartLineSegmentPoint[],
): ChartLineSegmentPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

export function getLineSegmentBounds(
  series: readonly ChartLineSegmentSeries[],
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
    for (const p of getLineSegmentFinitePoints(s.data ?? [])) {
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

export function getLineSegmentTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_SEGMENT_TICK_COUNT),
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

/**
 * Reduces a segment's two endpoint y values to a single representative
 * value used for threshold classification:
 *
 *  - `'max'` (default) -- the larger of the two y values.
 *  - `'min'` -- the smaller of the two.
 *  - `'avg'` -- the arithmetic mean.
 *  - `'start'` -- the y of the segment's left endpoint.
 *  - `'end'` -- the y of the segment's right endpoint.
 *
 * Non-finite inputs collapse to 0.
 */
export function classifyLineSegmentValue(
  startY: number,
  endY: number,
  by: ChartLineSegmentClassifyBy = DEFAULT_CHART_LINE_SEGMENT_CLASSIFY_BY,
): number {
  const a = isFiniteNumber(startY) ? startY : 0;
  const b = isFiniteNumber(endY) ? endY : 0;
  switch (by) {
    case 'min':
      return Math.min(a, b);
    case 'avg':
      return (a + b) / 2;
    case 'start':
      return a;
    case 'end':
      return b;
    case 'max':
    default:
      return Math.max(a, b);
  }
}

export interface PickedLineSegmentColor {
  color: string;
  thresholdLabel: string | null;
  thresholdValue: number | null;
}

/**
 * Picks the colour for a segment from the threshold list. Thresholds
 * are walked in descending order by `value`; the first threshold whose
 * value is `<= effectiveValue` wins. When no threshold matches, the
 * `fallback` colour is returned.
 *
 * Empty / non-array threshold list -> always returns the fallback.
 * Non-finite threshold values are dropped before sorting.
 */
export function pickLineSegmentColor(
  value: number,
  thresholds: readonly ChartLineSegmentThreshold[] | undefined,
  fallback: string,
): PickedLineSegmentColor {
  if (!Array.isArray(thresholds) || thresholds.length === 0) {
    return { color: fallback, thresholdLabel: null, thresholdValue: null };
  }
  const valid = thresholds.filter(
    (t) => t && isFiniteNumber(t.value) && typeof t.color === 'string',
  );
  if (valid.length === 0) {
    return { color: fallback, thresholdLabel: null, thresholdValue: null };
  }
  const sorted = [...valid].sort((a, b) => b.value - a.value);
  const v = isFiniteNumber(value) ? value : Number.NEGATIVE_INFINITY;
  for (const t of sorted) {
    if (v >= t.value) {
      return {
        color: t.color,
        thresholdLabel: t.label ?? null,
        thresholdValue: t.value,
      };
    }
  }
  return { color: fallback, thresholdLabel: null, thresholdValue: null };
}

/**
 * Walks pairs of consecutive pixel-space points, classifies each
 * segment via `pickLineSegmentColor`, and merges consecutive segments
 * sharing the same colour into a single SVG sub-path. Empty / single
 * point -> `[]`. Two points -> exactly one segment.
 */
export function buildLineSegmentPath(
  points: ReadonlyArray<ChartLineSegmentLayoutPoint>,
  thresholds: readonly ChartLineSegmentThreshold[] | undefined,
  classifyBy: ChartLineSegmentClassifyBy,
  fallback: string,
): ChartLineSegmentLayoutSegment[] {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segs: ChartLineSegmentLayoutSegment[] = [];
  let curColor = '';
  let curLabel: string | null = null;
  let curValue: number | null = null;
  let curStart = 0;
  let curPath = '';
  let curValueRep = 0;
  let first = true;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const curr = points[i]!;
    const classifyValue = classifyLineSegmentValue(
      prev.y,
      curr.y,
      classifyBy,
    );
    const picked = pickLineSegmentColor(classifyValue, thresholds, fallback);
    if (first) {
      curColor = picked.color;
      curLabel = picked.thresholdLabel;
      curValue = picked.thresholdValue;
      curValueRep = classifyValue;
      curStart = i - 1;
      curPath = `M ${fmt(prev.px)} ${fmt(prev.py)} L ${fmt(curr.px)} ${fmt(curr.py)}`;
      first = false;
      continue;
    }
    if (picked.color === curColor) {
      curPath += ` L ${fmt(curr.px)} ${fmt(curr.py)}`;
    } else {
      segs.push({
        index: segs.length,
        startIndex: points[curStart]!.index,
        endIndex: points[i - 1]!.index,
        color: curColor,
        thresholdLabel: curLabel,
        thresholdValue: curValue,
        value: curValueRep,
        path: curPath,
      });
      curColor = picked.color;
      curLabel = picked.thresholdLabel;
      curValue = picked.thresholdValue;
      curValueRep = classifyValue;
      curStart = i - 1;
      curPath = `M ${fmt(prev.px)} ${fmt(prev.py)} L ${fmt(curr.px)} ${fmt(curr.py)}`;
    }
  }
  segs.push({
    index: segs.length,
    startIndex: points[curStart]!.index,
    endIndex: points[points.length - 1]!.index,
    color: curColor,
    thresholdLabel: curLabel,
    thresholdValue: curValue,
    value: curValueRep,
    path: curPath,
  });
  return segs;
}

export interface ComputeLineSegmentLayoutInput {
  series: readonly ChartLineSegmentSeries[];
  hidden?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineSegmentLayout(
  input: ComputeLineSegmentLayoutInput,
): ComputeLineSegmentLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineSegmentLayoutResult = {
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

  const bounds = getLineSegmentBounds(input.series, input.hidden);
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
  const seriesOut: ChartLineSegmentLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const fallback =
      s.color ?? getLineSegmentDefaultColor(seriesIndex);
    const classifyBy: ChartLineSegmentClassifyBy =
      s.classifyBy ?? DEFAULT_CHART_LINE_SEGMENT_CLASSIFY_BY;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineSegmentLayoutPoint[] = [];
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
    const segments = buildLineSegmentPath(
      points,
      s.thresholds,
      classifyBy,
      fallback,
    );
    return {
      id: s.id,
      label: s.label,
      index: seriesIndex,
      fallbackColor: fallback,
      classifyBy,
      thresholds: Array.isArray(s.thresholds) ? Array.from(s.thresholds) : [],
      points,
      segments,
      finiteCount: points.length,
      totalCount: arr.length,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_SEGMENT_TICK_COUNT;
  const xTicks = getLineSegmentTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineSegmentTicks(yMin, yMax, tickCount).map((t) => ({
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

export function describeLineSegmentChart(
  series: readonly ChartLineSegmentSeries[],
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
  let thresholdCount = 0;
  for (const s of visible) {
    for (const p of getLineSegmentFinitePoints(s.data ?? [])) {
      total += 1;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
    thresholdCount += (s.thresholds ?? []).length;
  }
  if (total === 0) return 'No data';
  return `Threshold-coloured line chart: ${visible.length} series, ${total} points, ${thresholdCount} threshold band${thresholdCount === 1 ? '' : 's'}. x range ${fmtV(xMin)} to ${fmtV(xMax)}, y range ${fmtV(yMin)} to ${fmtV(yMax)}.`;
}

export interface ChartLineSegmentPointClick {
  series: ChartLineSegmentLayoutSeries;
  point: ChartLineSegmentLayoutPoint;
}

export interface ChartLineSegmentSegmentClick {
  series: ChartLineSegmentLayoutSeries;
  segment: ChartLineSegmentLayoutSegment;
}

export interface ChartLineSegmentSeriesToggle {
  series: ChartLineSegmentSeries;
  hidden: boolean;
}

export interface ChartLineSegmentProps {
  series: readonly ChartLineSegmentSeries[];
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
  onPointClick?: (info: ChartLineSegmentPointClick) => void;
  onSegmentClick?: (info: ChartLineSegmentSegmentClick) => void;
  onSeriesToggle?: (info: ChartLineSegmentSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineSegment = forwardRef(function ChartLineSegment(
  {
    series,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_SEGMENT_WIDTH,
    height = DEFAULT_CHART_LINE_SEGMENT_HEIGHT,
    padding = DEFAULT_CHART_LINE_SEGMENT_PADDING,
    tickCount = DEFAULT_CHART_LINE_SEGMENT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SEGMENT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SEGMENT_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_SEGMENT_LINE_OPACITY,
    gridColor = DEFAULT_CHART_LINE_SEGMENT_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SEGMENT_AXIS_COLOR,
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
    ariaLabel = 'Threshold-coloured line chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onSegmentClick,
    onSeriesToggle,
    style,
  }: ChartLineSegmentProps,
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
      computeLineSegmentLayout({
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
    ],
  );

  const description =
    ariaDescription ??
    describeLineSegmentChart(series, effectiveHidden, fmtValue);
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);
  const totalSegments = layout.series.reduce(
    (a, s) => a + s.segments.length,
    0,
  );

  const toggleSeries = useCallback(
    (s: ChartLineSegmentSeries) => {
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
      data-section="chart-line-segment"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-total-segments={totalSegments}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-segment-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-segment-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-segment-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-segment-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-segment-grid-line"
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
                  data-section="chart-line-segment-grid-line"
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
            <g data-section="chart-line-segment-axes">
              <line
                data-section="chart-line-segment-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-segment-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-segment-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-segment-tick"
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
                        data-section="chart-line-segment-tick-label"
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
                <g data-section="chart-line-segment-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-segment-tick"
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
                        data-section="chart-line-segment-tick-label"
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
                  data-section="chart-line-segment-x-label"
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
                  data-section="chart-line-segment-y-label"
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

          <g data-section="chart-line-segment-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-segment-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-fallback-color={s.fallbackColor}
                  data-series-classify-by={s.classifyBy}
                  data-series-segment-count={s.segments.length}
                  data-series-threshold-count={s.thresholds.length}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                >
                  {s.segments.map((seg) => (
                    <path
                      key={`seg-${s.id}-${seg.index}`}
                      data-section="chart-line-segment-path"
                      data-series-id={s.id}
                      data-segment-index={seg.index}
                      data-segment-start={seg.startIndex}
                      data-segment-end={seg.endIndex}
                      data-segment-color={seg.color}
                      data-segment-value={seg.value}
                      data-segment-threshold-label={seg.thresholdLabel ?? ''}
                      data-segment-threshold-value={
                        seg.thresholdValue ?? ''
                      }
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} segment ${seg.startIndex} to ${seg.endIndex}${seg.thresholdLabel ? ` (${seg.thresholdLabel})` : ''}`}
                      d={seg.path}
                      fill="none"
                      stroke={seg.color}
                      strokeOpacity={seriesDim}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      onClick={() => {
                        if (onSegmentClick) {
                          onSegmentClick({ series: s, segment: seg });
                        }
                      }}
                    />
                  ))}
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
                            data-section="chart-line-segment-dot"
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
                            fill={s.fallbackColor}
                            fillOpacity={dotOpacity}
                            stroke={s.fallbackColor}
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
          // Find the segment that ends at this point (or starts here for index 0)
          const seg = s.segments.find(
            (sg) => p.index >= sg.startIndex && p.index <= sg.endIndex,
          );
          const tx = Math.min(Math.max(p.px + 8, 0), width - 200);
          const ty = Math.min(Math.max(p.py - 48, 0), height - 64);
          return (
            <div
              data-section="chart-line-segment-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[180px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-segment-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-segment-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-segment-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              {seg && seg.thresholdLabel ? (
                <div
                  data-section="chart-line-segment-tooltip-threshold"
                  style={{ color: seg.color }}
                >
                  threshold: {seg.thresholdLabel}
                  {seg.thresholdValue !== null
                    ? ` (>= ${fmtValue(seg.thresholdValue)})`
                    : ''}
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-segment-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const fallback = s.color ?? getLineSegmentDefaultColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-line-segment-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-segment-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-segment-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: fallback }}
                  />
                  <span data-section="chart-line-segment-legend-label">
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
          {series.flatMap((s) =>
            (s.thresholds ?? []).map((t, ti) => (
              <li
                key={`thr-${s.id}-${ti}`}
                data-section="chart-line-segment-legend-threshold"
                data-series-id={s.id}
                data-threshold-value={t.value}
              >
                <span className="flex items-center gap-1">
                  <span
                    data-section="chart-line-segment-legend-threshold-swatch"
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: t.color }}
                  />
                  <span data-section="chart-line-segment-legend-threshold-label">
                    {t.label ?? `>= ${t.value}`}
                  </span>
                </span>
              </li>
            )),
          )}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineSegment.displayName = 'ChartLineSegment';
