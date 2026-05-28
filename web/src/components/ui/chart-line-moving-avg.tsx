import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MOVING_AVG_WIDTH = 560;
export const DEFAULT_CHART_LINE_MOVING_AVG_HEIGHT = 320;
export const DEFAULT_CHART_LINE_MOVING_AVG_PADDING = 40;
export const DEFAULT_CHART_LINE_MOVING_AVG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MOVING_AVG_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_MOVING_AVG_MA_WIDTH = 2;
export const DEFAULT_CHART_LINE_MOVING_AVG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MOVING_AVG_LINE_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_MOVING_AVG_MA_OPACITY = 1;
export const DEFAULT_CHART_LINE_MOVING_AVG_MA_DASH = '';
export const DEFAULT_CHART_LINE_MOVING_AVG_WINDOW = 5;
export const DEFAULT_CHART_LINE_MOVING_AVG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MOVING_AVG_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_MOVING_AVG_PALETTE = [
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

export type ChartLineMovingAvgMode = 'trailing' | 'centered' | 'edge';

export interface ChartLineMovingAvgPoint {
  x: number;
  y: number;
}

export interface ChartLineMovingAvgSeries {
  id: string;
  label: string;
  data: readonly ChartLineMovingAvgPoint[];
  color?: string;
  maColor?: string;
  maDashArray?: string;
  window?: number;
  mode?: ChartLineMovingAvgMode;
  hideMa?: boolean;
}

export interface ChartLineMovingAvgLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  ma: number | null;
  maPy: number | null;
}

export interface ChartLineMovingAvgLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  maColor: string;
  maDashArray: string;
  window: number;
  mode: ChartLineMovingAvgMode;
  hideMa: boolean;
  points: ChartLineMovingAvgLayoutPoint[];
  path: string;
  maPath: string;
  maValidCount: number;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineMovingAvgLayoutResult {
  series: ChartLineMovingAvgLayoutSeries[];
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

function isFinitePoint(p: unknown): p is ChartLineMovingAvgPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineMovingAvgPoint).x) &&
    isFiniteNumber((p as ChartLineMovingAvgPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineMovingAvgDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_MOVING_AVG_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_MOVING_AVG_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_MOVING_AVG_PALETTE.length
  ]!;
}

export function getLineMovingAvgFinitePoints(
  points: readonly ChartLineMovingAvgPoint[],
): ChartLineMovingAvgPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Validates and normalises a window argument. Returns a positive
 * integer >= 1. Non-finite, non-numeric, or <1 inputs return 1 (no
 * smoothing). Fractional inputs are floored.
 */
export function normaliseLineMovingAvgWindow(window: unknown): number {
  if (!isFiniteNumber(window)) return 1;
  const w = Math.floor(window);
  if (w < 1) return 1;
  return w;
}

/**
 * Computes the simple moving average of a numeric sequence.
 *
 * Returns a same-length array where each entry is either the moving
 * average centered or aligned to that index, or `null` when the
 * window cannot be filled.
 *
 * Modes:
 *
 * - `trailing` (default): `out[i] = mean(values[i - window + 1 .. i])`
 *   for `i >= window - 1`, `null` otherwise. The classic SMA.
 * - `centered`: `out[i] = mean(values[i - half .. i + (window - 1 -
 *   half)])` where `half = Math.floor((window - 1) / 2)`. Only valid
 *   when both ends of the centered window fit inside the array.
 * - `edge`: Same as `trailing` but the leading positions take a
 *   partial-window average using whatever samples are available.
 *   Useful for visualising smoothing at the edges.
 *
 * Non-finite inputs in `values` are dropped from the moving sum, but
 * an output index is `null` only when the window has zero finite
 * samples (or the window does not fit, per mode). Non-array input
 * returns `[]`. `window <= 0` is normalised to `1` (passthrough).
 */
export function computeSimpleMovingAverage(
  values: readonly number[],
  window: number,
  mode: ChartLineMovingAvgMode = 'trailing',
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const w = normaliseLineMovingAvgWindow(window);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n === 0) return out;
  const half = Math.floor((w - 1) / 2);
  for (let i = 0; i < n; i += 1) {
    let lo: number;
    let hi: number;
    if (mode === 'centered') {
      lo = i - half;
      hi = i + (w - 1 - half);
      if (lo < 0 || hi >= n) continue;
    } else if (mode === 'edge') {
      lo = Math.max(0, i - w + 1);
      hi = i;
    } else {
      lo = i - w + 1;
      hi = i;
      if (lo < 0) continue;
    }
    let sum = 0;
    let count = 0;
    for (let j = lo; j <= hi; j += 1) {
      const v = values[j]!;
      if (!isFiniteNumber(v)) continue;
      sum += v;
      count += 1;
    }
    if (count === 0) continue;
    out[i] = sum / count;
  }
  return out;
}

/**
 * Builds a path that emits a contiguous `M ... L ...` segment for
 * every run of consecutive non-null points, separated by spaces.
 * Single-point runs emit only the `M` so they still render as a dot
 * if `stroke-linecap='round'`.
 */
export function buildLineMovingAvgPath(
  points: readonly { px: number; py: number | null }[],
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  const parts: string[] = [];
  let inRun = false;
  for (const p of points) {
    if (p.py === null || !isFiniteNumber(p.py) || !isFiniteNumber(p.px)) {
      inRun = false;
      continue;
    }
    if (!inRun) {
      parts.push(`M ${fmt(p.px)} ${fmt(p.py)}`);
      inRun = true;
    } else {
      parts.push(`L ${fmt(p.px)} ${fmt(p.py)}`);
    }
  }
  return parts.join(' ');
}

export interface ComputeLineMovingAvgLayoutInput {
  series: readonly ChartLineMovingAvgSeries[];
  hiddenSeries?: ReadonlySet<string> | null;
  defaultWindow?: number;
  defaultMode?: ChartLineMovingAvgMode;
  defaultMaColor?: string;
  defaultMaDashArray?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineMovingAvgLayout(
  input: ComputeLineMovingAvgLayoutInput,
): ComputeLineMovingAvgLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineMovingAvgLayoutResult = {
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

  const defaultWindow =
    normaliseLineMovingAvgWindow(input.defaultWindow) || 1;
  const defaultMode: ChartLineMovingAvgMode = input.defaultMode ?? 'trailing';
  const defaultMaDash =
    input.defaultMaDashArray ?? DEFAULT_CHART_LINE_MOVING_AVG_MA_DASH;

  // Bounds across all visible series + the MA values they produce.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;

  const intermediates: {
    s: ChartLineMovingAvgSeries;
    originalIndex: number;
    finite: ChartLineMovingAvgPoint[];
    ma: (number | null)[];
    window: number;
    mode: ChartLineMovingAvgMode;
  }[] = [];

  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const finite = getLineMovingAvgFinitePoints(s.data ?? []);
    const window = normaliseLineMovingAvgWindow(s.window ?? defaultWindow);
    const mode = s.mode ?? defaultMode;
    const ma = computeSimpleMovingAverage(
      finite.map((p) => p.y),
      window,
      mode,
    );
    intermediates.push({ s, originalIndex: i, finite, ma, window, mode });
    for (let j = 0; j < finite.length; j += 1) {
      const p = finite[j]!;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
      const m = ma[j];
      if (m !== null && m !== undefined) {
        if (m < yMin) yMin = m;
        if (m > yMax) yMax = m;
      }
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

  const layoutSeries: ChartLineMovingAvgLayoutSeries[] = [];
  let totalPoints = 0;
  for (const it of intermediates) {
    const s = it.s;
    const finite = it.finite;
    const ma = it.ma;
    const points: ChartLineMovingAvgLayoutPoint[] = [];
    let maValid = 0;
    for (let j = 0; j < finite.length; j += 1) {
      const p = finite[j]!;
      const m = ma[j];
      const maY = m !== null && m !== undefined ? m : null;
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        ma: maY,
        maPy: maY !== null ? yToPx(maY) : null,
      });
      if (maY !== null) maValid += 1;
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    const maPath = buildLineMovingAvgPath(
      points.map((p) => ({ px: p.px, py: p.maPy })),
    );
    totalPoints += points.length;
    const color = s.color ?? getLineMovingAvgDefaultColor(it.originalIndex);
    const maColor = s.maColor ?? input.defaultMaColor ?? color;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: it.originalIndex,
      color,
      maColor,
      maDashArray: s.maDashArray ?? defaultMaDash,
      window: it.window,
      mode: it.mode,
      hideMa: s.hideMa === true,
      points,
      path,
      maPath,
      maValidCount: maValid,
      finiteCount: points.length,
      totalCount: Array.isArray(s.data) ? s.data.length : 0,
    });
  }

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_MOVING_AVG_TICK_COUNT;
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

export function describeLineMovingAvgChart(
  series: readonly ChartLineMovingAvgSeries[] | undefined | null,
  hidden?: ReadonlySet<string>,
  defaultWindow: number = DEFAULT_CHART_LINE_MOVING_AVG_WINDOW,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  let any = false;
  let totalPoints = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const finite = getLineMovingAvgFinitePoints(s.data ?? []);
    totalPoints += finite.length;
    if (finite.length === 0) continue;
    any = true;
    const w = normaliseLineMovingAvgWindow(s.window ?? defaultWindow);
    parts.push(`${s.label}: window ${w}`);
  }
  if (!any) return 'No data';
  return `Line chart with simple moving average across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineMovingAvgPointClick {
  series: ChartLineMovingAvgLayoutSeries;
  point: ChartLineMovingAvgLayoutPoint;
}

export interface ChartLineMovingAvgSeriesToggle {
  series: ChartLineMovingAvgSeries;
  hidden: boolean;
}

export interface ChartLineMovingAvgProps {
  series: readonly ChartLineMovingAvgSeries[];
  window?: number;
  mode?: ChartLineMovingAvgMode;
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
  maStrokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  maOpacity?: number;
  maDashArray?: string;
  defaultMaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showMa?: boolean;
  showMaInTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineMovingAvgPointClick) => void;
  onSeriesToggle?: (info: ChartLineMovingAvgSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineMovingAvg = forwardRef(function ChartLineMovingAvg(
  {
    series = [],
    window: chartWindow = DEFAULT_CHART_LINE_MOVING_AVG_WINDOW,
    mode = 'trailing',
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_MOVING_AVG_WIDTH,
    height = DEFAULT_CHART_LINE_MOVING_AVG_HEIGHT,
    padding = DEFAULT_CHART_LINE_MOVING_AVG_PADDING,
    tickCount = DEFAULT_CHART_LINE_MOVING_AVG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MOVING_AVG_STROKE_WIDTH,
    maStrokeWidth = DEFAULT_CHART_LINE_MOVING_AVG_MA_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MOVING_AVG_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_MOVING_AVG_LINE_OPACITY,
    maOpacity = DEFAULT_CHART_LINE_MOVING_AVG_MA_OPACITY,
    maDashArray = DEFAULT_CHART_LINE_MOVING_AVG_MA_DASH,
    defaultMaColor,
    gridColor = DEFAULT_CHART_LINE_MOVING_AVG_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MOVING_AVG_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showMa = true,
    showMaInTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with simple moving average',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineMovingAvgProps,
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
      computeLineMovingAvgLayout({
        series,
        hiddenSeries: hidden,
        defaultWindow: chartWindow,
        defaultMode: mode,
        ...(defaultMaColor !== undefined ? { defaultMaColor } : {}),
        defaultMaDashArray: maDashArray,
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
      chartWindow,
      mode,
      defaultMaColor,
      maDashArray,
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
    ariaDescription ?? describeLineMovingAvgChart(series, hidden, chartWindow);

  const toggleSeries = useCallback(
    (s: ChartLineMovingAvgSeries) => {
      const next = new Set(hidden);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (hiddenSeries === undefined) {
        setInternalHidden(next);
      }
      if (onHiddenSeriesChange) onHiddenSeriesChange(next);
      if (onSeriesToggle) onSeriesToggle({ series: s, hidden: willHide });
    },
    [hidden, hiddenSeries, onHiddenSeriesChange, onSeriesToggle],
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
      data-section="chart-line-moving-avg"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-window={chartWindow}
      data-mode={mode}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-moving-avg-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-moving-avg-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-moving-avg-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-moving-avg-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-moving-avg-grid-line"
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
                  data-section="chart-line-moving-avg-grid-line"
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
            <g data-section="chart-line-moving-avg-axes">
              <line
                data-section="chart-line-moving-avg-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-moving-avg-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-moving-avg-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-moving-avg-tick"
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
                        data-section="chart-line-moving-avg-tick-label"
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
                <g data-section="chart-line-moving-avg-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-moving-avg-tick"
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
                        data-section="chart-line-moving-avg-tick-label"
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
                  data-section="chart-line-moving-avg-x-label"
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
                  data-section="chart-line-moving-avg-y-label"
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

          <g data-section="chart-line-moving-avg-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dimLine =
                isAnyHovered && !isSeriesHovered ? 0.2 : lineOpacity;
              const dimMa =
                isAnyHovered && !isSeriesHovered ? 0.3 : maOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-moving-avg-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-ma-color={s.maColor}
                  data-series-window={s.window}
                  data-series-mode={s.mode}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-ma-valid-count={s.maValidCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-moving-avg-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: raw line with ${s.finiteCount} points`}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={dimLine}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showMa && !s.hideMa && s.maPath ? (
                    <path
                      data-section="chart-line-moving-avg-ma"
                      data-series-id={s.id}
                      data-series-window={s.window}
                      data-series-mode={s.mode}
                      data-series-ma-valid-count={s.maValidCount}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: simple moving average, window ${s.window}, ${s.maValidCount} valid samples`}
                      d={s.maPath}
                      fill="none"
                      stroke={s.maColor}
                      strokeOpacity={dimMa}
                      strokeWidth={maStrokeWidth}
                      strokeDasharray={s.maDashArray}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showDots
                    ? s.points.map((p) => {
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-moving-avg-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-ma={p.ma === null ? '' : String(p.ma)}
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 200);
          const ty = Math.min(Math.max(p.py - 56, 0), height - 72);
          return (
            <div
              data-section="chart-line-moving-avg-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[180px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-moving-avg-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-moving-avg-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-moving-avg-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              {showMaInTooltip ? (
                <div
                  data-section="chart-line-moving-avg-tooltip-ma"
                  className="text-slate-500"
                >
                  SMA({s.window}):{' '}
                  {p.ma !== null ? fmtValue(p.ma) : 'n/a'}
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-moving-avg-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-moving-avg-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-moving-avg-legend-button"
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
                    data-section="chart-line-moving-avg-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineMovingAvgDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-moving-avg-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-moving-avg-legend-stats"
                      className="text-slate-500"
                    >
                      (SMA {visEntry.window})
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

ChartLineMovingAvg.displayName = 'ChartLineMovingAvg';
