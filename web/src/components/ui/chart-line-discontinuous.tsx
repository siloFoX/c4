import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DISCONTINUOUS_WIDTH = 560;
export const DEFAULT_CHART_LINE_DISCONTINUOUS_HEIGHT = 320;
export const DEFAULT_CHART_LINE_DISCONTINUOUS_PADDING = 40;
export const DEFAULT_CHART_LINE_DISCONTINUOUS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DISCONTINUOUS_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_DISCONTINUOUS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DISCONTINUOUS_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_DISCONTINUOUS_GAP_MARKER_OPACITY = 0.45;
export const DEFAULT_CHART_LINE_DISCONTINUOUS_GAP_MARKER_DASH = '2 3';
export const DEFAULT_CHART_LINE_DISCONTINUOUS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DISCONTINUOUS_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_DISCONTINUOUS_PALETTE = [
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

export interface ChartLineDiscontinuousPoint {
  x: number;
  y: number | null | undefined;
}

export interface ChartLineDiscontinuousSeries {
  id: string;
  label: string;
  data: readonly ChartLineDiscontinuousPoint[];
  color?: string;
  connectGaps?: boolean;
}

export interface ChartLineDiscontinuousLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineDiscontinuousGap {
  index: number;
  startIndex: number;
  endIndex: number;
  startX: number;
  endX: number;
  width: number;
}

export interface ChartLineDiscontinuousRun {
  index: number;
  startIndex: number;
  endIndex: number;
  pointCount: number;
  path: string;
}

export interface ChartLineDiscontinuousLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  connectGaps: boolean;
  points: ChartLineDiscontinuousLayoutPoint[];
  runs: ChartLineDiscontinuousRun[];
  gaps: ChartLineDiscontinuousGap[];
  finiteCount: number;
  gapCount: number;
  totalCount: number;
}

export interface ComputeLineDiscontinuousLayoutResult {
  series: ChartLineDiscontinuousLayoutSeries[];
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

/**
 * Returns true when both `x` is finite AND `y` is a finite number.
 * Explicitly returns false for `y === null` / `y === undefined` so the
 * caller can split the series into runs at those positions.
 */
export function isFiniteDiscontinuousPoint(
  p: ChartLineDiscontinuousPoint | undefined,
): boolean {
  if (!p) return false;
  if (!isFiniteNumber(p.x)) return false;
  if (p.y === null || p.y === undefined) return false;
  return isFiniteNumber(p.y);
}

export function isLineDiscontinuousGap(
  p: ChartLineDiscontinuousPoint | undefined,
): boolean {
  if (!p) return false;
  return p.y === null || p.y === undefined;
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineDiscontinuousDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_DISCONTINUOUS_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_DISCONTINUOUS_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_DISCONTINUOUS_PALETTE.length
  ]!;
}

export function getLineDiscontinuousFinitePoints(
  points: readonly ChartLineDiscontinuousPoint[],
): { point: ChartLineDiscontinuousPoint; originalIndex: number }[] {
  if (!Array.isArray(points)) return [];
  const out: {
    point: ChartLineDiscontinuousPoint;
    originalIndex: number;
  }[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (isFiniteDiscontinuousPoint(p)) out.push({ point: p, originalIndex: i });
  }
  return out;
}

/**
 * Counts the number of explicit gap markers in `data`. A gap is any
 * point where `y` is `null` or `undefined`. Points with non-finite x
 * (e.g. `NaN`) are NOT counted as gaps -- they are dropped from the
 * series entirely.
 */
export function getLineDiscontinuousGapCount(
  points: readonly ChartLineDiscontinuousPoint[],
): number {
  if (!Array.isArray(points)) return 0;
  let count = 0;
  for (const p of points) if (isLineDiscontinuousGap(p)) count += 1;
  return count;
}

export function getLineDiscontinuousBounds(
  series: readonly ChartLineDiscontinuousSeries[],
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
    for (const p of s.data ?? []) {
      if (!isFiniteNumber(p.x)) continue;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (isFiniteNumber(p.y)) {
        if (p.y < yMin) yMin = p.y;
        if (p.y > yMax) yMax = p.y;
        any = true;
      }
    }
  }
  if (!any) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  if (xMin === Number.POSITIVE_INFINITY) {
    xMin = 0;
    xMax = 1;
  }
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

export function getLineDiscontinuousTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_DISCONTINUOUS_TICK_COUNT),
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
 * Splits a series' points into contiguous **runs** of finite points
 * separated by gap markers (`y === null | undefined`). Each run owns
 * `pointCount >= 1` points; a single finite point produces a
 * single-point run with an `M`-only path.
 *
 * Also computes the **gaps** between adjacent runs (one gap per
 * boundary), exposing the start/end indices in the original data
 * array and the pixel-space `startX` / `endX` of the bracketing
 * finite points so adopters can render a custom gap marker.
 *
 * `connectGaps = true` collapses runs into a single run (the gaps
 * are still recorded; the run just spans across them). This is the
 * canonical "ignore the null and draw through" behaviour.
 */
export function buildLineDiscontinuousRuns(
  layoutPoints: ReadonlyArray<ChartLineDiscontinuousLayoutPoint & {
    isGap?: boolean;
  }>,
  connectGaps: boolean,
): { runs: ChartLineDiscontinuousRun[]; gaps: ChartLineDiscontinuousGap[] } {
  if (!Array.isArray(layoutPoints) || layoutPoints.length === 0) {
    return { runs: [], gaps: [] };
  }
  const runs: ChartLineDiscontinuousRun[] = [];
  const gaps: ChartLineDiscontinuousGap[] = [];
  let curRun: ChartLineDiscontinuousLayoutPoint[] = [];
  let lastFinite: ChartLineDiscontinuousLayoutPoint | null = null;
  let pendingGapStart: ChartLineDiscontinuousLayoutPoint | null = null;
  function flushRun(): void {
    if (curRun.length === 0) return;
    const startPoint = curRun[0]!;
    const endPoint = curRun[curRun.length - 1]!;
    let path = `M ${fmt(startPoint.px)} ${fmt(startPoint.py)}`;
    for (let i = 1; i < curRun.length; i += 1) {
      path += ` L ${fmt(curRun[i]!.px)} ${fmt(curRun[i]!.py)}`;
    }
    runs.push({
      index: runs.length,
      startIndex: startPoint.index,
      endIndex: endPoint.index,
      pointCount: curRun.length,
      path,
    });
    curRun = [];
  }
  for (const p of layoutPoints) {
    if (p.isGap) {
      if (lastFinite) pendingGapStart = lastFinite;
      if (!connectGaps) {
        flushRun();
      }
      continue;
    }
    if (pendingGapStart) {
      gaps.push({
        index: gaps.length,
        startIndex: pendingGapStart.index,
        endIndex: p.index,
        startX: pendingGapStart.px,
        endX: p.px,
        width: Math.abs(p.px - pendingGapStart.px),
      });
      pendingGapStart = null;
    }
    curRun.push(p);
    lastFinite = p;
  }
  flushRun();
  return { runs, gaps };
}

export interface ComputeLineDiscontinuousLayoutInput {
  series: readonly ChartLineDiscontinuousSeries[];
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

export function computeLineDiscontinuousLayout(
  input: ComputeLineDiscontinuousLayoutInput,
): ComputeLineDiscontinuousLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineDiscontinuousLayoutResult = {
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

  const bounds = getLineDiscontinuousBounds(input.series, input.hidden);
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
  const seriesOut: ChartLineDiscontinuousLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineDiscontinuousDefaultColor(seriesIndex);
    const connectGaps = s.connectGaps === true;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineDiscontinuousLayoutPoint[] = [];
    const seq: (ChartLineDiscontinuousLayoutPoint & { isGap?: boolean })[] = [];
    let gapCount = 0;
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]!;
      if (!isFiniteNumber(p.x)) continue;
      if (isLineDiscontinuousGap(p)) {
        gapCount += 1;
        seq.push({
          index: i,
          x: p.x,
          y: 0, // placeholder; this entry is only used to flush the run
          px: xToPx(p.x),
          py: 0,
          isGap: true,
        });
        continue;
      }
      if (!isFiniteNumber(p.y)) continue;
      const layoutPoint: ChartLineDiscontinuousLayoutPoint = {
        index: i,
        x: p.x,
        y: p.y as number,
        px: xToPx(p.x),
        py: yToPx(p.y as number),
      };
      points.push(layoutPoint);
      seq.push(layoutPoint);
    }
    const { runs, gaps } = buildLineDiscontinuousRuns(seq, connectGaps);
    return {
      id: s.id,
      label: s.label,
      index: seriesIndex,
      color,
      connectGaps,
      points,
      runs,
      gaps,
      finiteCount: points.length,
      gapCount,
      totalCount: arr.length,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_DISCONTINUOUS_TICK_COUNT;
  const xTicks = getLineDiscontinuousTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineDiscontinuousTicks(yMin, yMax, tickCount).map((t) => ({
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

export function describeLineDiscontinuousChart(
  series: readonly ChartLineDiscontinuousSeries[],
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
  let gaps = 0;
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (const s of visible) {
    for (const p of s.data ?? []) {
      if (!isFiniteNumber(p.x)) continue;
      if (isLineDiscontinuousGap(p)) {
        gaps += 1;
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        continue;
      }
      if (!isFiniteNumber(p.y)) continue;
      total += 1;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  }
  if (total === 0) return 'No data';
  return `Discontinuous line chart with ${visible.length} series, ${total} points, and ${gaps} gap marker${gaps === 1 ? '' : 's'}. x range ${fmtV(xMin)} to ${fmtV(xMax)}, y range ${fmtV(yMin)} to ${fmtV(yMax)}.`;
}

export interface ChartLineDiscontinuousPointClick {
  series: ChartLineDiscontinuousLayoutSeries;
  point: ChartLineDiscontinuousLayoutPoint;
}

export interface ChartLineDiscontinuousSeriesToggle {
  series: ChartLineDiscontinuousSeries;
  hidden: boolean;
}

export interface ChartLineDiscontinuousProps {
  series: readonly ChartLineDiscontinuousSeries[];
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
  gapMarkerOpacity?: number;
  gapMarkerDash?: string;
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
  showGapMarkers?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineDiscontinuousPointClick) => void;
  onSeriesToggle?: (info: ChartLineDiscontinuousSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineDiscontinuous = forwardRef(function ChartLineDiscontinuous(
  {
    series = [],
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_DISCONTINUOUS_WIDTH,
    height = DEFAULT_CHART_LINE_DISCONTINUOUS_HEIGHT,
    padding = DEFAULT_CHART_LINE_DISCONTINUOUS_PADDING,
    tickCount = DEFAULT_CHART_LINE_DISCONTINUOUS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DISCONTINUOUS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DISCONTINUOUS_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_DISCONTINUOUS_LINE_OPACITY,
    gapMarkerOpacity = DEFAULT_CHART_LINE_DISCONTINUOUS_GAP_MARKER_OPACITY,
    gapMarkerDash = DEFAULT_CHART_LINE_DISCONTINUOUS_GAP_MARKER_DASH,
    gridColor = DEFAULT_CHART_LINE_DISCONTINUOUS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_DISCONTINUOUS_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showGapMarkers = true,
    animate = true,
    className,
    ariaLabel = 'Discontinuous line chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineDiscontinuousProps,
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
      computeLineDiscontinuousLayout({
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
    describeLineDiscontinuousChart(series, effectiveHidden, fmtValue);
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);
  const totalGaps = layout.series.reduce((a, s) => a + s.gapCount, 0);
  const totalRuns = layout.series.reduce((a, s) => a + s.runs.length, 0);

  const toggleSeries = useCallback(
    (s: ChartLineDiscontinuousSeries) => {
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
      data-section="chart-line-discontinuous"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-total-gaps={totalGaps}
      data-total-runs={totalRuns}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-discontinuous-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-discontinuous-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-discontinuous-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-discontinuous-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-discontinuous-grid-line"
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
                  data-section="chart-line-discontinuous-grid-line"
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
            <g data-section="chart-line-discontinuous-axes">
              <line
                data-section="chart-line-discontinuous-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-discontinuous-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-discontinuous-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-discontinuous-tick"
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
                        data-section="chart-line-discontinuous-tick-label"
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
                <g data-section="chart-line-discontinuous-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-discontinuous-tick"
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
                        data-section="chart-line-discontinuous-tick-label"
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
                  data-section="chart-line-discontinuous-x-label"
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
                  data-section="chart-line-discontinuous-y-label"
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

          <g data-section="chart-line-discontinuous-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-discontinuous-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-connect-gaps={s.connectGaps ? 'true' : 'false'}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-gap-count={s.gapCount}
                  data-series-run-count={s.runs.length}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {showGapMarkers && !s.connectGaps && s.gaps.length > 0 ? (
                    <g data-section="chart-line-discontinuous-gap-markers">
                      {s.gaps.map((g) => (
                        <line
                          key={`gap-${s.id}-${g.index}`}
                          data-section="chart-line-discontinuous-gap-marker"
                          data-series-id={s.id}
                          data-gap-index={g.index}
                          data-gap-start={g.startIndex}
                          data-gap-end={g.endIndex}
                          data-gap-width={g.width}
                          x1={g.startX}
                          y1={padding + layout.innerHeight}
                          x2={g.endX}
                          y2={padding + layout.innerHeight}
                          stroke={s.color}
                          strokeOpacity={gapMarkerOpacity}
                          strokeWidth={2}
                          strokeDasharray={gapMarkerDash}
                        />
                      ))}
                    </g>
                  ) : null}
                  {s.runs.map((r) => (
                    <path
                      key={`run-${s.id}-${r.index}`}
                      data-section="chart-line-discontinuous-path"
                      data-series-id={s.id}
                      data-run-index={r.index}
                      data-run-start={r.startIndex}
                      data-run-end={r.endIndex}
                      data-run-point-count={r.pointCount}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} run ${r.startIndex} to ${r.endIndex} (${r.pointCount} points)`}
                      d={r.path}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={seriesDim}
                      strokeWidth={strokeWidth}
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
                            data-section="chart-line-discontinuous-dot"
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 180);
          const ty = Math.min(Math.max(p.py - 36, 0), height - 48);
          return (
            <div
              data-section="chart-line-discontinuous-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-discontinuous-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-discontinuous-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-discontinuous-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-discontinuous-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineDiscontinuousDefaultColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-line-discontinuous-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-discontinuous-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-discontinuous-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: color }}
                  />
                  <span data-section="chart-line-discontinuous-legend-label">
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

ChartLineDiscontinuous.displayName = 'ChartLineDiscontinuous';
