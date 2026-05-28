import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TREND_WIDTH = 560;
export const DEFAULT_CHART_LINE_TREND_HEIGHT = 320;
export const DEFAULT_CHART_LINE_TREND_PADDING = 40;
export const DEFAULT_CHART_LINE_TREND_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TREND_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_TREND_TREND_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_TREND_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TREND_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_TREND_TREND_OPACITY = 0.85;
export const DEFAULT_CHART_LINE_TREND_TREND_DASH = '6 4';
export const DEFAULT_CHART_LINE_TREND_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TREND_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TREND_PALETTE = [
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

export interface ChartLineTrendPoint {
  x: number;
  y: number;
}

export interface ChartLineTrendSeries {
  id: string;
  label: string;
  data: readonly ChartLineTrendPoint[];
  color?: string;
  trendColor?: string;
  trendDashArray?: string;
  hideTrend?: boolean;
}

export interface ChartLineTrendRegression {
  slope: number;
  intercept: number;
  r2: number;
  sampleCount: number;
  ok: boolean;
  meanX: number;
  meanY: number;
}

export interface ChartLineTrendLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineTrendLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  trendColor: string;
  trendDashArray: string;
  hideTrend: boolean;
  points: ChartLineTrendLayoutPoint[];
  path: string;
  trendPath: string;
  trendStartX: number;
  trendStartY: number;
  trendEndX: number;
  trendEndY: number;
  regression: ChartLineTrendRegression;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineTrendLayoutResult {
  series: ChartLineTrendLayoutSeries[];
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

function isFinitePoint(p: unknown): p is ChartLineTrendPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineTrendPoint).x) &&
    isFiniteNumber((p as ChartLineTrendPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineTrendDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_TREND_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_TREND_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_TREND_PALETTE.length
  ]!;
}

export function getLineTrendFinitePoints(
  points: readonly ChartLineTrendPoint[],
): ChartLineTrendPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Ordinary least-squares regression. Returns `{slope, intercept, r2,
 * sampleCount, ok, meanX, meanY}`.
 *
 * - `slope = (n * Sxy - Sx*Sy) / (n * Sxx - Sx*Sx)`
 * - `intercept = (Sy - slope*Sx) / n`
 * - `r2 = 1 - SS_res/SS_tot`, where
 *   `SS_tot = Sigma (y - meanY)^2`,
 *   `SS_res = Sigma (y - (slope*x + intercept))^2`.
 *
 * Edge cases:
 *
 * - Fewer than 2 finite samples -> `ok=false`, slope=0, intercept=meanY
 *   (or 0 when no samples), r2=0.
 * - Vertical / collinear (`n * Sxx == Sx * Sx`, all x equal) ->
 *   `ok=false`, slope=0, intercept=meanY, r2=0.
 * - All y values equal -> `ok=true`, slope=0, intercept=meanY, r2=1.
 */
export function computeLineTrendRegression(
  points: readonly ChartLineTrendPoint[],
): ChartLineTrendRegression {
  const finite = getLineTrendFinitePoints(points);
  const n = finite.length;
  if (n === 0) {
    return {
      slope: 0,
      intercept: 0,
      r2: 0,
      sampleCount: 0,
      ok: false,
      meanX: 0,
      meanY: 0,
    };
  }
  let sx = 0;
  let sy = 0;
  for (const p of finite) {
    sx += p.x;
    sy += p.y;
  }
  const meanX = sx / n;
  const meanY = sy / n;
  if (n < 2) {
    return {
      slope: 0,
      intercept: meanY,
      r2: 0,
      sampleCount: n,
      ok: false,
      meanX,
      meanY,
    };
  }
  let sxx = 0;
  let sxy = 0;
  for (const p of finite) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
  }
  if (sxx === 0) {
    return {
      slope: 0,
      intercept: meanY,
      r2: 0,
      sampleCount: n,
      ok: false,
      meanX,
      meanY,
    };
  }
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of finite) {
    const ydiff = p.y - meanY;
    const residual = p.y - (slope * p.x + intercept);
    ssTot += ydiff * ydiff;
    ssRes += residual * residual;
  }
  let r2: number;
  if (ssTot === 0) {
    r2 = ssRes === 0 ? 1 : 0;
  } else {
    r2 = 1 - ssRes / ssTot;
    if (r2 < 0) r2 = 0;
    if (r2 > 1) r2 = 1;
  }
  return {
    slope,
    intercept,
    r2,
    sampleCount: n,
    ok: true,
    meanX,
    meanY,
  };
}

/** Evaluates the regression at the given x. Non-finite -> `intercept`. */
export function predictLineTrendY(
  x: number,
  regression: ChartLineTrendRegression,
): number {
  if (!isFiniteNumber(x)) return regression.intercept;
  return regression.slope * x + regression.intercept;
}

/** Returns the x range across all finite points; empty -> `null`. */
export function getLineTrendXRange(
  points: readonly ChartLineTrendPoint[],
): { min: number; max: number } | null {
  const finite = getLineTrendFinitePoints(points);
  if (finite.length === 0) return null;
  let min = finite[0]!.x;
  let max = finite[0]!.x;
  for (let i = 1; i < finite.length; i += 1) {
    const x = finite[i]!.x;
    if (x < min) min = x;
    if (x > max) max = x;
  }
  return { min, max };
}

export interface ComputeLineTrendLayoutInput {
  series: readonly ChartLineTrendSeries[];
  hiddenSeries?: ReadonlySet<string> | null;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  defaultTrendDashArray?: string;
}

export function computeLineTrendLayout(
  input: ComputeLineTrendLayoutInput,
): ComputeLineTrendLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineTrendLayoutResult = {
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
    for (const p of getLineTrendFinitePoints(s.data ?? [])) {
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

  const defaultDash =
    input.defaultTrendDashArray ?? DEFAULT_CHART_LINE_TREND_TREND_DASH;

  let totalPoints = 0;
  const layoutSeries: ChartLineTrendLayoutSeries[] = [];
  // Use the original series order (so index is stable across hide/show).
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineTrendLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
      });
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    const reg = computeLineTrendRegression(arr);
    const xRangePts = getLineTrendXRange(arr);
    let trendStartX = 0;
    let trendStartY = 0;
    let trendEndX = 0;
    let trendEndY = 0;
    let trendPath = '';
    if (reg.ok && xRangePts) {
      trendStartX = xRangePts.min;
      trendEndX = xRangePts.max;
      trendStartY = reg.slope * trendStartX + reg.intercept;
      trendEndY = reg.slope * trendEndX + reg.intercept;
      const a = `${fmt(xToPx(trendStartX))} ${fmt(yToPx(trendStartY))}`;
      const b = `${fmt(xToPx(trendEndX))} ${fmt(yToPx(trendEndY))}`;
      trendPath = `M ${a} L ${b}`;
    }
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: i,
      color: s.color ?? getLineTrendDefaultColor(i),
      trendColor: s.trendColor ?? s.color ?? getLineTrendDefaultColor(i),
      trendDashArray: s.trendDashArray ?? defaultDash,
      hideTrend: s.hideTrend === true,
      points,
      path,
      trendPath,
      trendStartX,
      trendStartY,
      trendEndX,
      trendEndY,
      regression: reg,
      finiteCount: points.length,
      totalCount: arr.length,
    });
  }

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_TREND_TICK_COUNT;
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

export function describeLineTrendChart(
  series: readonly ChartLineTrendSeries[] | undefined | null,
  hidden?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  let totalPoints = 0;
  const parts: string[] = [];
  let any = false;
  for (const s of visible) {
    const reg = computeLineTrendRegression(s.data ?? []);
    totalPoints += reg.sampleCount;
    if (reg.ok) {
      any = true;
      parts.push(
        `${s.label}: slope ${fmtV(reg.slope)}, R2 ${reg.r2.toFixed(2)}`,
      );
    }
  }
  if (!any) return 'No data';
  return `Line chart with linear trend across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineTrendPointClick {
  series: ChartLineTrendLayoutSeries;
  point: ChartLineTrendLayoutPoint;
}

export interface ChartLineTrendSeriesToggle {
  series: ChartLineTrendSeries;
  hidden: boolean;
}

export interface ChartLineTrendProps {
  series: readonly ChartLineTrendSeries[];
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
  trendStrokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  trendOpacity?: number;
  trendDashArray?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showTrend?: boolean;
  showTrendStats?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatSlope?: (slope: number) => string;
  formatR2?: (r2: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineTrendPointClick) => void;
  onSeriesToggle?: (info: ChartLineTrendSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineTrend = forwardRef(function ChartLineTrend(
  {
    series = [],
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_TREND_WIDTH,
    height = DEFAULT_CHART_LINE_TREND_HEIGHT,
    padding = DEFAULT_CHART_LINE_TREND_PADDING,
    tickCount = DEFAULT_CHART_LINE_TREND_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TREND_STROKE_WIDTH,
    trendStrokeWidth = DEFAULT_CHART_LINE_TREND_TREND_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TREND_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_TREND_LINE_OPACITY,
    trendOpacity = DEFAULT_CHART_LINE_TREND_TREND_OPACITY,
    trendDashArray = DEFAULT_CHART_LINE_TREND_TREND_DASH,
    gridColor = DEFAULT_CHART_LINE_TREND_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_TREND_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showTrend = true,
    showTrendStats = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with linear trend',
    ariaDescription,
    formatValue,
    formatX,
    formatSlope,
    formatR2,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineTrendProps,
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
  const fmtSlope = useCallback(
    (n: number) =>
      formatSlope
        ? formatSlope(n)
        : `${n >= 0 ? '+' : ''}${n.toFixed(3)}`,
    [formatSlope],
  );
  const fmtR2 = useCallback(
    (n: number) => (formatR2 ? formatR2(n) : n.toFixed(2)),
    [formatR2],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineTrendLayout({
        series,
        hiddenSeries: hidden,
        ...(xMin !== undefined ? { xMin } : {}),
        ...(xMax !== undefined ? { xMax } : {}),
        ...(yMin !== undefined ? { yMin } : {}),
        ...(yMax !== undefined ? { yMax } : {}),
        width,
        height,
        padding,
        tickCount,
        defaultTrendDashArray: trendDashArray,
      }),
    [
      series,
      hidden,
      xMin,
      xMax,
      yMin,
      yMax,
      width,
      height,
      padding,
      tickCount,
      trendDashArray,
    ],
  );

  const description =
    ariaDescription ?? describeLineTrendChart(series, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineTrendSeries) => {
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
      data-section="chart-line-trend"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-trend-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-trend-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-trend-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-trend-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-trend-grid-line"
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
                  data-section="chart-line-trend-grid-line"
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
            <g data-section="chart-line-trend-axes">
              <line
                data-section="chart-line-trend-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-trend-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-trend-tick"
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
                        data-section="chart-line-trend-tick-label"
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
                <g data-section="chart-line-trend-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-trend-tick"
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
                        data-section="chart-line-trend-tick-label"
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
                  data-section="chart-line-trend-x-label"
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
                  data-section="chart-line-trend-y-label"
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

          <g data-section="chart-line-trend-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dimLine =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              const dimTrend =
                isAnyHovered && !isSeriesHovered ? 0.3 : trendOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-trend-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-slope={s.regression.slope}
                  data-series-intercept={s.regression.intercept}
                  data-series-r2={s.regression.r2}
                  data-series-regression-ok={s.regression.ok ? 'true' : 'false'}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-trend-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points`}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={dimLine}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showTrend && !s.hideTrend && s.trendPath ? (
                    <path
                      data-section="chart-line-trend-trend"
                      data-series-id={s.id}
                      data-series-slope={s.regression.slope}
                      data-series-intercept={s.regression.intercept}
                      data-series-r2={s.regression.r2}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: linear trend, slope ${fmtSlope(s.regression.slope)}, R-squared ${fmtR2(s.regression.r2)}`}
                      d={s.trendPath}
                      fill="none"
                      stroke={s.trendColor}
                      strokeOpacity={dimTrend}
                      strokeWidth={trendStrokeWidth}
                      strokeDasharray={s.trendDashArray}
                      strokeLinecap="round"
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
                            data-section="chart-line-trend-dot"
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
          const predicted = predictLineTrendY(p.x, s.regression);
          const residual = p.y - predicted;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 200);
          const ty = Math.min(Math.max(p.py - 56, 0), height - 72);
          return (
            <div
              data-section="chart-line-trend-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[180px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-trend-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-trend-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-trend-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              {s.regression.ok ? (
                <div
                  data-section="chart-line-trend-tooltip-trend"
                  className="text-slate-500"
                >
                  trend: {fmtValue(predicted)} ({residual >= 0 ? '+' : ''}
                  {fmtValue(residual)} resid)
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-trend-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-trend-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-trend-legend-button"
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
                    data-section="chart-line-trend-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineTrendDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-trend-legend-label">
                    {s.label}
                  </span>
                  {showTrendStats && visEntry && visEntry.regression.ok ? (
                    <span
                      data-section="chart-line-trend-legend-stats"
                      className="text-slate-500"
                    >
                      ({fmtSlope(visEntry.regression.slope)} / R2{' '}
                      {fmtR2(visEntry.regression.r2)})
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

ChartLineTrend.displayName = 'ChartLineTrend';
