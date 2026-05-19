import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_FORECAST_WIDTH = 560;
export const DEFAULT_CHART_LINE_FORECAST_HEIGHT = 320;
export const DEFAULT_CHART_LINE_FORECAST_PADDING = 40;
export const DEFAULT_CHART_LINE_FORECAST_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FORECAST_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_FORECAST_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FORECAST_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_FORECAST_FORECAST_OPACITY = 0.85;
export const DEFAULT_CHART_LINE_FORECAST_BAND_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_FORECAST_DASH = '6 4';
export const DEFAULT_CHART_LINE_FORECAST_CUTOFF_DASH = '4 4';
export const DEFAULT_CHART_LINE_FORECAST_CUTOFF_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_FORECAST_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_FORECAST_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_FORECAST_PALETTE = [
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

export interface ChartLineForecastPoint {
  x: number;
  y: number;
  yLower?: number;
  yUpper?: number;
}

export interface ChartLineForecastSeries {
  id: string;
  label: string;
  data: readonly ChartLineForecastPoint[];
  color?: string;
  forecastFrom?: number;
  forecastDashArray?: string;
}

export type ChartLineForecastPhase = 'historical' | 'forecast' | 'join';

export interface ChartLineForecastSplitPoint {
  x: number;
  y: number;
  yLower?: number;
  yUpper?: number;
  originalIndex: number | null;
  isJoin: boolean;
}

export interface SplitLineForecastPointsResult {
  historical: ChartLineForecastSplitPoint[];
  forecast: ChartLineForecastSplitPoint[];
  join: ChartLineForecastSplitPoint | null;
}

export interface ChartLineForecastLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  phase: ChartLineForecastPhase;
}

export interface ChartLineForecastLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  forecastDashArray: string;
  points: ChartLineForecastLayoutPoint[];
  historicalPath: string;
  forecastPath: string;
  bandPath: string;
  forecastFrom: number;
  forecastFromX: number;
  historicalCount: number;
  forecastCount: number;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineForecastLayoutResult {
  series: ChartLineForecastLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  defaultForecastFromX: number | null;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineForecastPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineForecastPoint).x) &&
    isFiniteNumber((p as ChartLineForecastPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineForecastDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_FORECAST_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_FORECAST_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_FORECAST_PALETTE.length
  ]!;
}

export function getLineForecastFinitePoints(
  points: readonly ChartLineForecastPoint[],
): ChartLineForecastPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Determines whether a finite point sits on the **forecast** side of
 * the cutoff. The cutoff is **exclusive on the left** -- points with
 * `x >= cutoff` are forecast, points with `x < cutoff` are
 * historical.
 */
export function isForecastPoint(
  point: ChartLineForecastPoint,
  cutoff: number,
): boolean {
  if (!isFiniteNumber(cutoff)) return false;
  if (!isFinitePoint(point)) return false;
  return point.x >= cutoff;
}

/**
 * Splits a finite sample series into historical and forecast halves
 * around a cutoff x value. When the cutoff lands inside a segment
 * (`p_i.x < cutoff < p_{i+1}.x`), a synthetic **join** point is
 * inserted at the interpolated `(cutoff, y)` position. The join point
 * is the LAST point of `historical` and the FIRST point of `forecast`
 * so the two paths render seamlessly.
 *
 * Non-finite cutoff -> everything is historical (no split).
 * Non-array points -> `{historical: [], forecast: [], join: null}`.
 * Cutoff exactly on a sample -> that sample begins the forecast half
 * (no synthetic join).
 *
 * Input is assumed to be sorted by x ascending; non-finite samples
 * are dropped silently before splitting.
 */
export function splitLineForecastPoints(
  points: readonly ChartLineForecastPoint[] | undefined | null,
  cutoff: number,
): SplitLineForecastPointsResult {
  if (!Array.isArray(points)) {
    return { historical: [], forecast: [], join: null };
  }
  const finite = points.filter(isFinitePoint);
  if (finite.length === 0) {
    return { historical: [], forecast: [], join: null };
  }
  if (!isFiniteNumber(cutoff)) {
    // Treat everything as historical when there is no cutoff.
    const historical = finite.map<ChartLineForecastSplitPoint>((p, i) => {
      const base: ChartLineForecastSplitPoint = {
        x: p.x,
        y: p.y,
        originalIndex: indexOfSampleInOriginal(points, p, i),
        isJoin: false,
      };
      if (isFiniteNumber(p.yLower)) base.yLower = p.yLower;
      if (isFiniteNumber(p.yUpper)) base.yUpper = p.yUpper;
      return base;
    });
    return { historical, forecast: [], join: null };
  }
  // Walk pairs to find the segment crossing the cutoff.
  const historical: ChartLineForecastSplitPoint[] = [];
  const forecast: ChartLineForecastSplitPoint[] = [];
  let join: ChartLineForecastSplitPoint | null = null;
  for (let i = 0; i < finite.length; i += 1) {
    const p = finite[i]!;
    const sp: ChartLineForecastSplitPoint = {
      x: p.x,
      y: p.y,
      originalIndex: indexOfSampleInOriginal(points, p, i),
      isJoin: false,
    };
    if (isFiniteNumber(p.yLower)) sp.yLower = p.yLower;
    if (isFiniteNumber(p.yUpper)) sp.yUpper = p.yUpper;
    if (p.x < cutoff) {
      historical.push(sp);
    } else {
      forecast.push(sp);
    }
  }
  // Insert a synthetic join point if the cutoff is strictly inside a
  // segment (last historical x < cutoff < first forecast x).
  if (historical.length > 0 && forecast.length > 0) {
    const a = historical[historical.length - 1]!;
    const b = forecast[0]!;
    if (a.x < cutoff && cutoff < b.x) {
      const t = (cutoff - a.x) / (b.x - a.x);
      const y = a.y + (b.y - a.y) * t;
      const joinPoint: ChartLineForecastSplitPoint = {
        x: cutoff,
        y,
        originalIndex: null,
        isJoin: true,
      };
      if (
        isFiniteNumber(a.yLower) &&
        isFiniteNumber(b.yLower)
      ) {
        joinPoint.yLower = a.yLower + (b.yLower - a.yLower) * t;
      }
      if (
        isFiniteNumber(a.yUpper) &&
        isFiniteNumber(b.yUpper)
      ) {
        joinPoint.yUpper = a.yUpper + (b.yUpper - a.yUpper) * t;
      }
      historical.push(joinPoint);
      forecast.unshift(joinPoint);
      join = joinPoint;
    }
  }
  return { historical, forecast, join };
}

function indexOfSampleInOriginal(
  points: readonly ChartLineForecastPoint[],
  finiteSample: ChartLineForecastPoint,
  finiteIndex: number,
): number {
  // Try positional match first (assumes input order preserved).
  let seen = 0;
  for (let i = 0; i < points.length; i += 1) {
    const cand = points[i]!;
    if (!isFinitePoint(cand)) continue;
    if (seen === finiteIndex) return i;
    seen += 1;
  }
  return -1;
}

/**
 * Builds an `M ... L ...` path from a list of split points. Returns
 * `''` when the input has zero or one usable point.
 */
export function buildLineForecastPath(
  points: readonly { px: number; py: number }[],
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  let path = '';
  let first = true;
  for (const p of points) {
    if (!isFiniteNumber(p.px) || !isFiniteNumber(p.py)) continue;
    if (first) {
      path = `M ${fmt(p.px)} ${fmt(p.py)}`;
      first = false;
    } else {
      path += ` L ${fmt(p.px)} ${fmt(p.py)}`;
    }
  }
  return path;
}

/**
 * Builds a closed polygon band from per-point upper / lower bounds.
 * Skips points where either bound is missing or non-finite; emits
 * `''` when fewer than 2 paired bounds exist.
 */
export function buildLineForecastBandPath(
  points: readonly {
    px: number;
    pyLower: number | null;
    pyUpper: number | null;
  }[],
): string {
  if (!Array.isArray(points)) return '';
  const paired = points.filter(
    (p) =>
      isFiniteNumber(p.px) &&
      isFiniteNumber(p.pyLower) &&
      isFiniteNumber(p.pyUpper),
  );
  if (paired.length < 2) return '';
  let path = `M ${fmt(paired[0]!.px)} ${fmt(paired[0]!.pyUpper as number)}`;
  for (let i = 1; i < paired.length; i += 1) {
    path += ` L ${fmt(paired[i]!.px)} ${fmt(paired[i]!.pyUpper as number)}`;
  }
  for (let i = paired.length - 1; i >= 0; i -= 1) {
    path += ` L ${fmt(paired[i]!.px)} ${fmt(paired[i]!.pyLower as number)}`;
  }
  path += ' Z';
  return path;
}

export interface ComputeLineForecastLayoutInput {
  series: readonly ChartLineForecastSeries[];
  forecastFrom?: number;
  hiddenSeries?: ReadonlySet<string> | null;
  showBand?: boolean;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineForecastLayout(
  input: ComputeLineForecastLayoutInput,
): ComputeLineForecastLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineForecastLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    defaultForecastFromX: null,
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

  // Bounds across all visible series including yLower/yUpper.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of visible) {
    for (const p of getLineForecastFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      if (isFiniteNumber(p.yLower) && p.yLower < yMin) yMin = p.yLower;
      if (isFiniteNumber(p.yUpper) && p.yUpper > yMax) yMax = p.yUpper;
      any = true;
    }
  }
  // Forecast cutoff should be reachable; include it in x range when
  // outside.
  const defaultForecastFrom = isFiniteNumber(input.forecastFrom)
    ? input.forecastFrom
    : null;
  if (defaultForecastFrom !== null) {
    if (defaultForecastFrom < xMin) xMin = defaultForecastFrom;
    if (defaultForecastFrom > xMax) xMax = defaultForecastFrom;
    any = true;
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

  const layoutSeries: ChartLineForecastLayoutSeries[] = [];
  let totalPoints = 0;
  const wantBand = input.showBand !== false;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const finite = arr.filter(isFinitePoint);
    const sorted = finite.slice().sort((a, b) => a.x - b.x);
    const seriesCutoff = isFiniteNumber(s.forecastFrom)
      ? s.forecastFrom
      : isFiniteNumber(defaultForecastFrom ?? Number.NaN)
        ? (defaultForecastFrom as number)
        : Number.POSITIVE_INFINITY;
    const split = splitLineForecastPoints(sorted, seriesCutoff);
    const historicalPx = split.historical.map((p) => ({
      px: xToPx(p.x),
      py: yToPx(p.y),
    }));
    const forecastPx = split.forecast.map((p) => ({
      px: xToPx(p.x),
      py: yToPx(p.y),
    }));
    const historicalPath = buildLineForecastPath(historicalPx);
    const forecastPath = buildLineForecastPath(forecastPx);
    let bandPath = '';
    if (wantBand) {
      const forecastWithBand = split.forecast.map((p) => ({
        px: xToPx(p.x),
        pyLower: isFiniteNumber(p.yLower) ? yToPx(p.yLower as number) : null,
        pyUpper: isFiniteNumber(p.yUpper) ? yToPx(p.yUpper as number) : null,
      }));
      bandPath = buildLineForecastBandPath(forecastWithBand);
    }
    // Layout points walk the original-array order to preserve adopter
    // ordering for click handlers, with phase derived from x vs cutoff.
    const points: ChartLineForecastLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      const phase: ChartLineForecastPhase =
        p.x >= seriesCutoff ? 'forecast' : 'historical';
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        phase,
      });
    }
    const historicalCount = split.historical.filter((p) => !p.isJoin)
      .length;
    const forecastCount = split.forecast.filter((p) => !p.isJoin).length;
    totalPoints += points.length;
    const forecastFromX = isFiniteNumber(seriesCutoff)
      ? xToPx(Math.min(Math.max(seriesCutoff, xMin), xMax))
      : Number.NaN;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: i,
      color: s.color ?? getLineForecastDefaultColor(i),
      forecastDashArray:
        s.forecastDashArray ?? DEFAULT_CHART_LINE_FORECAST_DASH,
      points,
      historicalPath,
      forecastPath,
      bandPath,
      forecastFrom: seriesCutoff,
      forecastFromX,
      historicalCount,
      forecastCount,
      finiteCount: points.length,
      totalCount: arr.length,
    });
  }

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_FORECAST_TICK_COUNT;
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
    defaultForecastFromX:
      defaultForecastFrom !== null && isFiniteNumber(defaultForecastFrom)
        ? padding + ((defaultForecastFrom - xMin) / xRange) * innerWidth
        : null,
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineForecastChart(
  series: readonly ChartLineForecastSeries[] | undefined | null,
  forecastFrom?: number,
  hidden?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  let any = false;
  let totalHistorical = 0;
  let totalForecast = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const cutoff = isFiniteNumber(s.forecastFrom)
      ? s.forecastFrom
      : isFiniteNumber(forecastFrom)
        ? forecastFrom
        : Number.POSITIVE_INFINITY;
    const arr = Array.isArray(s.data) ? s.data : [];
    const split = splitLineForecastPoints(
      arr.filter(isFinitePoint).slice().sort((a, b) => a.x - b.x),
      cutoff,
    );
    const hist = split.historical.filter((p) => !p.isJoin).length;
    const fcst = split.forecast.filter((p) => !p.isJoin).length;
    if (hist + fcst === 0) continue;
    any = true;
    totalHistorical += hist;
    totalForecast += fcst;
    parts.push(
      `${s.label}: ${hist} historical, ${fcst} forecast` +
        (isFiniteNumber(cutoff) ? ` (cutoff x=${fmtV(cutoff)})` : ''),
    );
  }
  if (!any) return 'No data';
  return `Line chart with forecast extension across ${visible.length} series (${totalHistorical} historical, ${totalForecast} forecast). ${parts.join('; ')}.`;
}

export interface ChartLineForecastPointClick {
  series: ChartLineForecastLayoutSeries;
  point: ChartLineForecastLayoutPoint;
}

export interface ChartLineForecastProps {
  series: readonly ChartLineForecastSeries[];
  forecastFrom?: number;
  forecastLabel?: string;
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
  lineOpacity?: number;
  forecastOpacity?: number;
  bandOpacity?: number;
  forecastDashArray?: string;
  cutoffDashArray?: string;
  cutoffColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showBand?: boolean;
  showCutoff?: boolean;
  showCutoffLabel?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineForecastPointClick) => void;
  style?: CSSProperties;
}

export const ChartLineForecast = forwardRef(function ChartLineForecast(
  {
    series,
    forecastFrom,
    forecastLabel = 'Forecast',
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_FORECAST_WIDTH,
    height = DEFAULT_CHART_LINE_FORECAST_HEIGHT,
    padding = DEFAULT_CHART_LINE_FORECAST_PADDING,
    tickCount = DEFAULT_CHART_LINE_FORECAST_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FORECAST_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FORECAST_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_FORECAST_LINE_OPACITY,
    forecastOpacity = DEFAULT_CHART_LINE_FORECAST_FORECAST_OPACITY,
    bandOpacity = DEFAULT_CHART_LINE_FORECAST_BAND_OPACITY,
    forecastDashArray = DEFAULT_CHART_LINE_FORECAST_DASH,
    cutoffDashArray = DEFAULT_CHART_LINE_FORECAST_CUTOFF_DASH,
    cutoffColor = DEFAULT_CHART_LINE_FORECAST_CUTOFF_COLOR,
    gridColor = DEFAULT_CHART_LINE_FORECAST_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_FORECAST_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showBand = true,
    showCutoff = true,
    showCutoffLabel = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with forecast extension',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    style,
  }: ChartLineForecastProps,
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
      computeLineForecastLayout({
        series,
        ...(forecastFrom !== undefined ? { forecastFrom } : {}),
        hiddenSeries: hidden,
        showBand,
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
      forecastFrom,
      hidden,
      showBand,
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
    describeLineForecastChart(series, forecastFrom, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineForecastSeries) => {
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

  const cutoffX = layout.defaultForecastFromX;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-forecast"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-forecast-from={
        isFiniteNumber(forecastFrom) ? String(forecastFrom) : ''
      }
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-forecast-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-forecast-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-forecast-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-forecast-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-forecast-grid-line"
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
                  data-section="chart-line-forecast-grid-line"
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

          {/* Forecast confidence band, painted beneath the line. */}
          {showBand ? (
            <g data-section="chart-line-forecast-bands">
              {layout.series.map((s) =>
                s.bandPath ? (
                  <path
                    key={`band-${s.id}`}
                    data-section="chart-line-forecast-band"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    aria-label={`${s.label}: forecast confidence band`}
                    d={s.bandPath}
                    fill={s.color}
                    fillOpacity={bandOpacity}
                    stroke="none"
                  />
                ) : null,
              )}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-forecast-axes">
              <line
                data-section="chart-line-forecast-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-forecast-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-forecast-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-forecast-tick"
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
                        data-section="chart-line-forecast-tick-label"
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
                <g data-section="chart-line-forecast-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-forecast-tick"
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
                        data-section="chart-line-forecast-tick-label"
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
                  data-section="chart-line-forecast-x-label"
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
                  data-section="chart-line-forecast-y-label"
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

          {/* Forecast cutoff vertical reference line + label. */}
          {showCutoff && cutoffX !== null ? (
            <g data-section="chart-line-forecast-cutoff">
              <line
                data-section="chart-line-forecast-cutoff-line"
                data-cutoff-x={
                  isFiniteNumber(forecastFrom) ? String(forecastFrom) : ''
                }
                role="graphics-symbol"
                aria-label={`${forecastLabel} cutoff${
                  isFiniteNumber(forecastFrom)
                    ? ` at x=${fmtX(forecastFrom)}`
                    : ''
                }`}
                x1={cutoffX}
                y1={padding}
                x2={cutoffX}
                y2={padding + layout.innerHeight}
                stroke={cutoffColor}
                strokeDasharray={cutoffDashArray}
                strokeWidth={1}
              />
              {showCutoffLabel ? (
                <text
                  data-section="chart-line-forecast-cutoff-label"
                  x={cutoffX + 4}
                  y={padding + 12}
                  fontSize={10}
                  fill={cutoffColor}
                  style={{ pointerEvents: 'none' }}
                >
                  {forecastLabel}
                  {isFiniteNumber(forecastFrom)
                    ? ` (x=${fmtX(forecastFrom)})`
                    : ''}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Series lines + dots */}
          <g data-section="chart-line-forecast-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dimSolid =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              const dimDash =
                isAnyHovered && !isSeriesHovered
                  ? 0.2
                  : forecastOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-forecast-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-historical-count={s.historicalCount}
                  data-series-forecast-count={s.forecastCount}
                  data-series-forecast-from={
                    isFiniteNumber(s.forecastFrom)
                      ? String(s.forecastFrom)
                      : ''
                  }
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {s.historicalPath ? (
                    <path
                      data-section="chart-line-forecast-historical"
                      data-series-id={s.id}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: historical line with ${s.historicalCount} points`}
                      d={s.historicalPath}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={dimSolid}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {s.forecastPath ? (
                    <path
                      data-section="chart-line-forecast-forecast"
                      data-series-id={s.id}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: forecast line with ${s.forecastCount} points`}
                      d={s.forecastPath}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={dimDash}
                      strokeWidth={strokeWidth}
                      strokeDasharray={s.forecastDashArray}
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
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}, ${p.phase}`;
                        const isForecast = p.phase === 'forecast';
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-forecast-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-phase={p.phase}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={isForecast ? 'white' : s.color}
                            fillOpacity={opacity}
                            stroke={s.color}
                            strokeWidth={isForecast ? 1.5 : 1}
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
          const ty = Math.min(Math.max(p.py - 56, 0), height - 78);
          return (
            <div
              data-section="chart-line-forecast-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              data-phase={p.phase}
              className="pointer-events-none absolute z-10 min-w-[180px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-forecast-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-forecast-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-forecast-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              <div
                data-section="chart-line-forecast-tooltip-phase"
                className="text-slate-500"
              >
                phase: {p.phase}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-forecast-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-forecast-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-forecast-legend-button"
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
                    data-section="chart-line-forecast-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineForecastDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-forecast-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-forecast-legend-stats"
                      className="text-slate-500"
                    >
                      ({visEntry.historicalCount} hist /{' '}
                      {visEntry.forecastCount} fcst)
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

ChartLineForecast.displayName = 'ChartLineForecast';
