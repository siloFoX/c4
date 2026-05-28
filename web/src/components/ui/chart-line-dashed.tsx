import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DASHED_WIDTH = 560;
export const DEFAULT_CHART_LINE_DASHED_HEIGHT = 320;
export const DEFAULT_CHART_LINE_DASHED_PADDING = 40;
export const DEFAULT_CHART_LINE_DASHED_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DASHED_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_DASHED_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DASHED_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_DASHED_DASH_STYLE = 'dashed';
export const DEFAULT_CHART_LINE_DASHED_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DASHED_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_DASHED_PALETTE = [
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

export const LINE_DASHED_PATTERNS: Record<ChartLineDashedStyleName, string> = {
  solid: '',
  dashed: '8 4',
  dotted: '2 4',
  dashDot: '8 4 2 4',
  longDash: '14 6',
};

export type ChartLineDashedStyleName =
  | 'solid'
  | 'dashed'
  | 'dotted'
  | 'dashDot'
  | 'longDash';

export interface ChartLineDashedPoint {
  x: number;
  y: number;
  segmentStyle?: ChartLineDashedStyleName;
  segmentDashArray?: string;
}

export interface ChartLineDashedSeries {
  id: string;
  label: string;
  data: readonly ChartLineDashedPoint[];
  color?: string;
  dashStyle?: ChartLineDashedStyleName;
  dashArray?: string;
}

export interface ChartLineDashedLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  segmentDashArray?: string;
}

export interface ChartLineDashedLayoutSegment {
  index: number;
  startIndex: number;
  endIndex: number;
  dashArray: string;
  styleName: ChartLineDashedStyleName | 'custom';
  path: string;
}

export interface ChartLineDashedLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  dashStyle: ChartLineDashedStyleName;
  defaultDashArray: string;
  points: ChartLineDashedLayoutPoint[];
  segments: ChartLineDashedLayoutSegment[];
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineDashedLayoutResult {
  series: ChartLineDashedLayoutSeries[];
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

function isFinitePoint(p: unknown): p is ChartLineDashedPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineDashedPoint).x) &&
    isFiniteNumber((p as ChartLineDashedPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineDashedDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_DASHED_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_DASHED_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_DASHED_PALETTE.length
  ]!;
}

export function getLineDashedStrokeDashArray(
  name: ChartLineDashedStyleName | undefined,
): string {
  if (!name) return '';
  return LINE_DASHED_PATTERNS[name] ?? '';
}

export function getLineDashedFinitePoints(
  points: readonly ChartLineDashedPoint[],
): ChartLineDashedPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

export function getLineDashedBounds(
  series: readonly ChartLineDashedSeries[],
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
    for (const p of getLineDashedFinitePoints(s.data ?? [])) {
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

export function getLineDashedTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_DASHED_TICK_COUNT),
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
 * Resolves the effective stroke-dasharray for a segment that ENDS at
 * the given point. Resolution order (first match wins):
 *
 *   1. `point.segmentDashArray` (raw SVG dasharray string)
 *   2. `LINE_DASHED_PATTERNS[point.segmentStyle]` (named pattern)
 *   3. `seriesDashArray` (raw, series-level)
 *   4. `LINE_DASHED_PATTERNS[seriesDashStyle]` (named, series-level)
 *
 * Returns `''` (empty string) for the solid pattern. The returned value
 * goes directly into the SVG `stroke-dasharray` attribute.
 */
export function resolveSegmentDashArray(
  point: ChartLineDashedPoint | undefined,
  seriesDashStyle: ChartLineDashedStyleName,
  seriesDashArray?: string,
): { dashArray: string; styleName: ChartLineDashedStyleName | 'custom' } {
  if (point && typeof point.segmentDashArray === 'string') {
    return { dashArray: point.segmentDashArray, styleName: 'custom' };
  }
  if (point && point.segmentStyle) {
    return {
      dashArray: getLineDashedStrokeDashArray(point.segmentStyle),
      styleName: point.segmentStyle,
    };
  }
  if (typeof seriesDashArray === 'string') {
    return { dashArray: seriesDashArray, styleName: 'custom' };
  }
  return {
    dashArray: getLineDashedStrokeDashArray(seriesDashStyle),
    styleName: seriesDashStyle,
  };
}

/**
 * Splits a series' pixel-space points into consecutive segments grouped
 * by stroke-dasharray. Consecutive segments with the same effective
 * dasharray merge into a single SVG `<path>` (`M x y L x y L x y ...`)
 * so the DOM stays small. A segment's dasharray is resolved against the
 * point at the segment's *end* (i.e. `points[i+1]`).
 *
 * Returns an array of `{ index, startIndex, endIndex, dashArray, styleName,
 * path }` ordered by start point. Empty input or single point -> `[]`
 * (no segments to render). Two points -> exactly one segment.
 */
export function buildLineDashedSegments(
  points: ReadonlyArray<{ px: number; py: number; index: number; segmentDashArray?: string; segmentStyle?: ChartLineDashedStyleName }>,
  seriesDashStyle: ChartLineDashedStyleName,
  seriesDashArray?: string,
): ChartLineDashedLayoutSegment[] {
  if (!Array.isArray(points) || points.length < 2) return [];
  const segs: ChartLineDashedLayoutSegment[] = [];
  let curDash = '';
  let curStyle: ChartLineDashedStyleName | 'custom' = seriesDashStyle;
  let curStart = 0;
  let curPath = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
  let first = true;
  for (let i = 1; i < points.length; i += 1) {
    const resolved = resolveSegmentDashArray(
      points[i] as ChartLineDashedPoint,
      seriesDashStyle,
      seriesDashArray,
    );
    if (first) {
      curDash = resolved.dashArray;
      curStyle = resolved.styleName;
      curPath += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.py)}`;
      first = false;
      continue;
    }
    if (resolved.dashArray === curDash) {
      curPath += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.py)}`;
    } else {
      segs.push({
        index: segs.length,
        startIndex: points[curStart]!.index,
        endIndex: points[i - 1]!.index,
        dashArray: curDash,
        styleName: curStyle,
        path: curPath,
      });
      curDash = resolved.dashArray;
      curStyle = resolved.styleName;
      curStart = i - 1;
      curPath = `M ${fmt(points[i - 1]!.px)} ${fmt(points[i - 1]!.py)} L ${fmt(points[i]!.px)} ${fmt(points[i]!.py)}`;
    }
  }
  segs.push({
    index: segs.length,
    startIndex: points[curStart]!.index,
    endIndex: points[points.length - 1]!.index,
    dashArray: curDash,
    styleName: curStyle,
    path: curPath,
  });
  return segs;
}

export interface ComputeLineDashedLayoutInput {
  series: readonly ChartLineDashedSeries[];
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

export function computeLineDashedLayout(
  input: ComputeLineDashedLayoutInput,
): ComputeLineDashedLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineDashedLayoutResult = {
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

  const bounds = getLineDashedBounds(input.series, input.hidden);
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
  const seriesOut: ChartLineDashedLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineDashedDefaultColor(seriesIndex);
    const dashStyle = s.dashStyle ?? DEFAULT_CHART_LINE_DASHED_DASH_STYLE;
    const defaultDashArray =
      typeof s.dashArray === 'string'
        ? s.dashArray
        : getLineDashedStrokeDashArray(dashStyle);
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineDashedLayoutPoint[] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]!;
      if (!isFinitePoint(p)) continue;
      points.push({
        index: i,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        ...(typeof p.segmentDashArray === 'string'
          ? { segmentDashArray: p.segmentDashArray }
          : {}),
      });
    }
    const segPoints = points.map((p, i) => ({
      px: p.px,
      py: p.py,
      index: p.index,
      ...(typeof arr[p.index]?.segmentDashArray === 'string'
        ? { segmentDashArray: arr[p.index]!.segmentDashArray! }
        : {}),
      ...(arr[p.index]?.segmentStyle
        ? { segmentStyle: arr[p.index]!.segmentStyle! }
        : {}),
      _seqIndex: i,
    }));
    const segments = buildLineDashedSegments(
      segPoints,
      dashStyle,
      s.dashArray,
    );
    return {
      id: s.id,
      label: s.label,
      index: seriesIndex,
      color,
      dashStyle,
      defaultDashArray,
      points,
      segments,
      finiteCount: points.length,
      totalCount: arr.length,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_DASHED_TICK_COUNT;
  const xTicks = getLineDashedTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineDashedTicks(yMin, yMax, tickCount).map((t) => ({
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

export function describeLineDashedChart(
  series: readonly ChartLineDashedSeries[],
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
    for (const p of getLineDashedFinitePoints(s.data ?? [])) {
      total += 1;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  }
  if (total === 0) return 'No data';
  return `Dashed line chart with ${visible.length} series and ${total} points. x range ${fmtV(xMin)} to ${fmtV(xMax)}, y range ${fmtV(yMin)} to ${fmtV(yMax)}.`;
}

export interface ChartLineDashedPointClick {
  series: ChartLineDashedLayoutSeries;
  point: ChartLineDashedLayoutPoint;
}

export interface ChartLineDashedSeriesToggle {
  series: ChartLineDashedSeries;
  hidden: boolean;
}

export interface ChartLineDashedProps {
  series: readonly ChartLineDashedSeries[];
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
  onPointClick?: (info: ChartLineDashedPointClick) => void;
  onSeriesToggle?: (info: ChartLineDashedSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineDashed = forwardRef(function ChartLineDashed(
  {
    series = [],
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_DASHED_WIDTH,
    height = DEFAULT_CHART_LINE_DASHED_HEIGHT,
    padding = DEFAULT_CHART_LINE_DASHED_PADDING,
    tickCount = DEFAULT_CHART_LINE_DASHED_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DASHED_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DASHED_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_DASHED_LINE_OPACITY,
    gridColor = DEFAULT_CHART_LINE_DASHED_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_DASHED_AXIS_COLOR,
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
    ariaLabel = 'Dashed line chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineDashedProps,
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
      computeLineDashedLayout({
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
    describeLineDashedChart(series, effectiveHidden, fmtValue);
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);
  const totalSegments = layout.series.reduce(
    (a, s) => a + s.segments.length,
    0,
  );

  const toggleSeries = useCallback(
    (s: ChartLineDashedSeries) => {
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
      data-section="chart-line-dashed"
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
        data-section="chart-line-dashed-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-dashed-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-dashed-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-dashed-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-dashed-grid-line"
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
                  data-section="chart-line-dashed-grid-line"
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
            <g data-section="chart-line-dashed-axes">
              <line
                data-section="chart-line-dashed-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-dashed-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-dashed-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-dashed-tick"
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
                        data-section="chart-line-dashed-tick-label"
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
                <g data-section="chart-line-dashed-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-dashed-tick"
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
                        data-section="chart-line-dashed-tick-label"
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
                  data-section="chart-line-dashed-x-label"
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
                  data-section="chart-line-dashed-y-label"
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

          <g data-section="chart-line-dashed-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-dashed-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-dash-style={s.dashStyle}
                  data-series-default-dash-array={s.defaultDashArray}
                  data-series-segment-count={s.segments.length}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {s.segments.map((seg) => (
                    <path
                      key={`seg-${s.id}-${seg.index}`}
                      data-section="chart-line-dashed-path"
                      data-series-id={s.id}
                      data-segment-index={seg.index}
                      data-segment-start={seg.startIndex}
                      data-segment-end={seg.endIndex}
                      data-segment-style={seg.styleName}
                      data-segment-dash-array={seg.dashArray}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} ${seg.styleName} segment ${seg.startIndex} to ${seg.endIndex}`}
                      d={seg.path}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={seriesDim}
                      strokeWidth={strokeWidth}
                      strokeDasharray={seg.dashArray || undefined}
                      strokeLinecap="round"
                      strokeLinejoin="round"
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
                            data-section="chart-line-dashed-dot"
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
              data-section="chart-line-dashed-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-dashed-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-dashed-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-dashed-tooltip-y"
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
          data-section="chart-line-dashed-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineDashedDefaultColor(i);
            const swatchDash =
              typeof s.dashArray === 'string'
                ? s.dashArray
                : getLineDashedStrokeDashArray(
                    s.dashStyle ?? DEFAULT_CHART_LINE_DASHED_DASH_STYLE,
                  );
            return (
              <li
                key={s.id}
                data-section="chart-line-dashed-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-dashed-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <svg
                    data-section="chart-line-dashed-legend-swatch"
                    width="20"
                    height="6"
                  >
                    <line
                      x1={1}
                      y1={3}
                      x2={19}
                      y2={3}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray={swatchDash || undefined}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span data-section="chart-line-dashed-legend-label">
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

ChartLineDashed.displayName = 'ChartLineDashed';
