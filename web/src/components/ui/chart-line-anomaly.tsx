import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ANOMALY_WIDTH = 560;
export const DEFAULT_CHART_LINE_ANOMALY_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ANOMALY_PADDING = 40;
export const DEFAULT_CHART_LINE_ANOMALY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ANOMALY_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_ANOMALY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ANOMALY_ANOMALY_RADIUS = 6;
export const DEFAULT_CHART_LINE_ANOMALY_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_ANOMALY_BAND_OPACITY = 0.15;
export const DEFAULT_CHART_LINE_ANOMALY_MEAN_DASH = '4 3';
export const DEFAULT_CHART_LINE_ANOMALY_BOUND_DASH = '2 3';
export const DEFAULT_CHART_LINE_ANOMALY_MEAN_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ANOMALY_HIGH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ANOMALY_LOW_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ANOMALY_BAND_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ANOMALY_THRESHOLD = 2;
export const DEFAULT_CHART_LINE_ANOMALY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ANOMALY_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ANOMALY_PALETTE = [
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

export type ChartLineAnomalyDirection = 'high' | 'low' | 'normal';

export interface ChartLineAnomalyPoint {
  x: number;
  y: number;
}

export interface ChartLineAnomalySeries {
  id: string;
  label: string;
  data: readonly ChartLineAnomalyPoint[];
  color?: string;
  highAnomalyColor?: string;
  lowAnomalyColor?: string;
  threshold?: number;
}

export interface ChartLineAnomalyStats {
  finiteCount: number;
  mean: number;
  stddev: number;
  ok: boolean;
}

export interface ChartLineAnomalyLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  zScore: number;
  direction: ChartLineAnomalyDirection;
  isAnomaly: boolean;
}

export interface ChartLineAnomalyLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  highColor: string;
  lowColor: string;
  threshold: number;
  stats: ChartLineAnomalyStats;
  points: ChartLineAnomalyLayoutPoint[];
  path: string;
  meanY: number;
  upperY: number;
  lowerY: number;
  bandPath: string;
  bandValid: boolean;
  anomalyCount: number;
  highCount: number;
  lowCount: number;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineAnomalyLayoutResult {
  series: ChartLineAnomalyLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  totalAnomalies: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineAnomalyPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineAnomalyPoint).x) &&
    isFiniteNumber((p as ChartLineAnomalyPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineAnomalyDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_ANOMALY_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_ANOMALY_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_ANOMALY_PALETTE.length
  ]!;
}

export function getLineAnomalyFinitePoints(
  points: readonly ChartLineAnomalyPoint[],
): ChartLineAnomalyPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Computes the descriptive stats `{mean, stddev, finiteCount, ok}` of
 * a series's y values.
 *
 * - `mean = Σ y / n` over finite samples.
 * - `stddev` is the **sample standard deviation** (Bessel's
 *   correction): `sqrt(Σ (y - mean)^2 / (n - 1))`.
 * - `ok = true` when `finiteCount >= 2` AND `stddev > 0`. Constant /
 *   single-sample series get `ok = false` (no meaningful z-score is
 *   computable).
 *
 * Non-array input -> `{finiteCount: 0, mean: 0, stddev: 0, ok: false}`.
 */
export function computeLineAnomalyStats(
  points: readonly ChartLineAnomalyPoint[] | undefined | null,
): ChartLineAnomalyStats {
  const empty: ChartLineAnomalyStats = {
    finiteCount: 0,
    mean: 0,
    stddev: 0,
    ok: false,
  };
  if (!Array.isArray(points)) return empty;
  const finite = points.filter(isFinitePoint);
  const n = finite.length;
  if (n === 0) return empty;
  let sum = 0;
  for (const p of finite) sum += p.y;
  const mean = sum / n;
  if (n < 2) {
    return { finiteCount: n, mean, stddev: 0, ok: false };
  }
  let ss = 0;
  for (const p of finite) {
    const d = p.y - mean;
    ss += d * d;
  }
  const stddev = Math.sqrt(ss / (n - 1));
  return {
    finiteCount: n,
    mean,
    stddev,
    ok: stddev > 0,
  };
}

/**
 * z = (y - mean) / stddev. Non-finite y / mean, or stddev <= 0,
 * returns `0` (signalling "no anomaly").
 */
export function computeLineAnomalyZScore(
  y: number,
  mean: number,
  stddev: number,
): number {
  if (
    !isFiniteNumber(y) ||
    !isFiniteNumber(mean) ||
    !isFiniteNumber(stddev) ||
    stddev <= 0
  ) {
    return 0;
  }
  return (y - mean) / stddev;
}

/**
 * Returns the canonical anomaly direction for a z-score and threshold.
 * `threshold` is clamped to `>= 0`; non-finite falls back to the
 * default (`2`).
 */
export function classifyLineAnomalyDirection(
  zScore: number,
  threshold: number = DEFAULT_CHART_LINE_ANOMALY_THRESHOLD,
): ChartLineAnomalyDirection {
  if (!isFiniteNumber(zScore)) return 'normal';
  const t = isFiniteNumber(threshold) && threshold >= 0
    ? threshold
    : DEFAULT_CHART_LINE_ANOMALY_THRESHOLD;
  if (zScore >= t) return 'high';
  if (zScore <= -t) return 'low';
  return 'normal';
}

export interface ComputeLineAnomalyLayoutInput {
  series: readonly ChartLineAnomalySeries[];
  threshold?: number;
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

export function computeLineAnomalyLayout(
  input: ComputeLineAnomalyLayoutInput,
): ComputeLineAnomalyLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineAnomalyLayoutResult = {
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
    totalAnomalies: 0,
    visibleSeriesCount: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  if (seriesArr.length === 0) return empty;
  const hidden = input.hiddenSeries ?? null;
  const visible = seriesArr.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return empty;
  const defaultThreshold =
    isFiniteNumber(input.threshold) && input.threshold >= 0
      ? input.threshold
      : DEFAULT_CHART_LINE_ANOMALY_THRESHOLD;
  const showBand = input.showBand !== false;

  // Pre-compute stats so we can include the +/- threshold*stddev band
  // in the y range.
  const intermediates: {
    s: ChartLineAnomalySeries;
    originalIndex: number;
    threshold: number;
    stats: ChartLineAnomalyStats;
    upper: number;
    lower: number;
  }[] = [];

  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const t =
      isFiniteNumber(s.threshold) && s.threshold >= 0
        ? s.threshold
        : defaultThreshold;
    const stats = computeLineAnomalyStats(s.data ?? []);
    const upper = stats.mean + t * stats.stddev;
    const lower = stats.mean - t * stats.stddev;
    intermediates.push({
      s,
      originalIndex: i,
      threshold: t,
      stats,
      upper,
      lower,
    });
    for (const p of getLineAnomalyFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
    if (stats.ok && showBand) {
      if (upper > yMax) yMax = upper;
      if (lower < yMin) yMin = lower;
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

  const layoutSeries: ChartLineAnomalyLayoutSeries[] = [];
  let totalPoints = 0;
  let totalAnomalies = 0;
  for (const it of intermediates) {
    const s = it.s;
    const color = s.color ?? getLineAnomalyDefaultColor(it.originalIndex);
    const highColor =
      s.highAnomalyColor ?? DEFAULT_CHART_LINE_ANOMALY_HIGH_COLOR;
    const lowColor =
      s.lowAnomalyColor ?? DEFAULT_CHART_LINE_ANOMALY_LOW_COLOR;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineAnomalyLayoutPoint[] = [];
    let anomalyCount = 0;
    let highCount = 0;
    let lowCount = 0;
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      const z = computeLineAnomalyZScore(
        p.y,
        it.stats.mean,
        it.stats.stddev,
      );
      const direction = it.stats.ok
        ? classifyLineAnomalyDirection(z, it.threshold)
        : 'normal';
      const isAnomaly = direction === 'high' || direction === 'low';
      if (isAnomaly) {
        anomalyCount += 1;
        if (direction === 'high') highCount += 1;
        else if (direction === 'low') lowCount += 1;
      }
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        zScore: z,
        direction,
        isAnomaly,
      });
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    const meanY = yToPx(it.stats.mean);
    const upperY = yToPx(it.upper);
    const lowerY = yToPx(it.lower);
    const bandValid = it.stats.ok && showBand;
    let bandPath = '';
    if (bandValid) {
      const left = padding;
      const right = padding + innerWidth;
      bandPath =
        `M ${fmt(left)} ${fmt(upperY)} L ${fmt(right)} ${fmt(upperY)} ` +
        `L ${fmt(right)} ${fmt(lowerY)} L ${fmt(left)} ${fmt(lowerY)} Z`;
    }
    totalPoints += points.length;
    totalAnomalies += anomalyCount;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: it.originalIndex,
      color,
      highColor,
      lowColor,
      threshold: it.threshold,
      stats: it.stats,
      points,
      path,
      meanY,
      upperY,
      lowerY,
      bandPath,
      bandValid,
      anomalyCount,
      highCount,
      lowCount,
      finiteCount: points.length,
      totalCount: arr.length,
    });
  }

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_ANOMALY_TICK_COUNT;
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
    totalAnomalies,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineAnomalyChart(
  series: readonly ChartLineAnomalySeries[] | undefined | null,
  threshold: number = DEFAULT_CHART_LINE_ANOMALY_THRESHOLD,
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
  let totalAnomalies = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const finite = getLineAnomalyFinitePoints(s.data ?? []);
    if (finite.length === 0) continue;
    any = true;
    totalPoints += finite.length;
    const stats = computeLineAnomalyStats(s.data ?? []);
    const t =
      isFiniteNumber(s.threshold) && s.threshold >= 0
        ? s.threshold
        : threshold;
    let highCount = 0;
    let lowCount = 0;
    if (stats.ok) {
      for (const p of finite) {
        const z = computeLineAnomalyZScore(
          p.y,
          stats.mean,
          stats.stddev,
        );
        const dir = classifyLineAnomalyDirection(z, t);
        if (dir === 'high') highCount += 1;
        else if (dir === 'low') lowCount += 1;
      }
    }
    totalAnomalies += highCount + lowCount;
    parts.push(
      `${s.label}: mean ${fmtV(stats.mean)}, stddev ${fmtV(stats.stddev)}, ${highCount + lowCount} anomalies (${highCount} high, ${lowCount} low) at threshold ${fmtV(t)}`,
    );
  }
  if (!any) return 'No data';
  return `Anomaly-aware line chart across ${visible.length} series (${totalPoints} points, ${totalAnomalies} anomalies). ${parts.join('; ')}.`;
}

export interface ChartLineAnomalyPointClick {
  series: ChartLineAnomalyLayoutSeries;
  point: ChartLineAnomalyLayoutPoint;
}

export interface ChartLineAnomalyProps {
  series: readonly ChartLineAnomalySeries[];
  threshold?: number;
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
  anomalyRadius?: number;
  lineOpacity?: number;
  bandOpacity?: number;
  meanDashArray?: string;
  boundDashArray?: string;
  meanColor?: string;
  bandColor?: string;
  highAnomalyColor?: string;
  lowAnomalyColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showBand?: boolean;
  showMeanLine?: boolean;
  showBoundLines?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatZ?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineAnomalyPointClick) => void;
  style?: CSSProperties;
}

export const ChartLineAnomaly = forwardRef(function ChartLineAnomaly(
  {
    series = [],
    threshold = DEFAULT_CHART_LINE_ANOMALY_THRESHOLD,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_ANOMALY_WIDTH,
    height = DEFAULT_CHART_LINE_ANOMALY_HEIGHT,
    padding = DEFAULT_CHART_LINE_ANOMALY_PADDING,
    tickCount = DEFAULT_CHART_LINE_ANOMALY_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ANOMALY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ANOMALY_DOT_RADIUS,
    anomalyRadius = DEFAULT_CHART_LINE_ANOMALY_ANOMALY_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_ANOMALY_LINE_OPACITY,
    bandOpacity = DEFAULT_CHART_LINE_ANOMALY_BAND_OPACITY,
    meanDashArray = DEFAULT_CHART_LINE_ANOMALY_MEAN_DASH,
    boundDashArray = DEFAULT_CHART_LINE_ANOMALY_BOUND_DASH,
    meanColor = DEFAULT_CHART_LINE_ANOMALY_MEAN_COLOR,
    bandColor = DEFAULT_CHART_LINE_ANOMALY_BAND_COLOR,
    highAnomalyColor = DEFAULT_CHART_LINE_ANOMALY_HIGH_COLOR,
    lowAnomalyColor = DEFAULT_CHART_LINE_ANOMALY_LOW_COLOR,
    gridColor = DEFAULT_CHART_LINE_ANOMALY_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ANOMALY_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showBand = true,
    showMeanLine = true,
    showBoundLines = true,
    animate = true,
    className,
    ariaLabel = 'Anomaly-aware line chart',
    ariaDescription,
    formatValue,
    formatX,
    formatZ,
    xLabel,
    yLabel,
    onPointClick,
    style,
  }: ChartLineAnomalyProps,
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
  const fmtZ = useCallback(
    (n: number) =>
      formatZ
        ? formatZ(n)
        : `${n >= 0 ? '+' : ''}${n.toFixed(2)}`,
    [formatZ],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineAnomalyLayout({
        series,
        threshold,
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
      threshold,
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
    describeLineAnomalyChart(series, threshold, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineAnomalySeries) => {
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
      data-section="chart-line-anomaly"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-total-anomalies={layout.totalAnomalies}
      data-threshold={threshold}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-anomaly-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-anomaly-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-anomaly-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-anomaly-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-anomaly-grid-line"
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
                  data-section="chart-line-anomaly-grid-line"
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

          {/* Normal-range band beneath the lines. */}
          {showBand ? (
            <g data-section="chart-line-anomaly-bands">
              {layout.series.map((s) =>
                s.bandValid ? (
                  <path
                    key={`band-${s.id}`}
                    data-section="chart-line-anomaly-band"
                    data-series-id={s.id}
                    data-band-upper={s.stats.mean + s.threshold * s.stats.stddev}
                    data-band-lower={s.stats.mean - s.threshold * s.stats.stddev}
                    role="graphics-symbol"
                    aria-label={`${s.label}: normal range, mean ${s.stats.mean}, +/- ${s.threshold} stddev`}
                    d={s.bandPath}
                    fill={bandColor}
                    fillOpacity={bandOpacity}
                    stroke="none"
                  />
                ) : null,
              )}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-anomaly-axes">
              <line
                data-section="chart-line-anomaly-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-anomaly-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-anomaly-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-anomaly-tick"
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
                        data-section="chart-line-anomaly-tick-label"
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
                <g data-section="chart-line-anomaly-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-anomaly-tick"
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
                        data-section="chart-line-anomaly-tick-label"
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
                  data-section="chart-line-anomaly-x-label"
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
                  data-section="chart-line-anomaly-y-label"
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

          {/* Mean + upper/lower bound horizontal references */}
          <g data-section="chart-line-anomaly-references">
            {layout.series.map((s) => {
              if (!s.stats.ok) return null;
              return (
                <g
                  key={`ref-${s.id}`}
                  data-section="chart-line-anomaly-reference-group"
                  data-series-id={s.id}
                  data-series-mean={s.stats.mean}
                  data-series-stddev={s.stats.stddev}
                  data-series-threshold={s.threshold}
                >
                  {showMeanLine ? (
                    <line
                      data-section="chart-line-anomaly-mean-line"
                      data-series-id={s.id}
                      x1={padding}
                      y1={s.meanY}
                      x2={padding + layout.innerWidth}
                      y2={s.meanY}
                      stroke={meanColor}
                      strokeDasharray={meanDashArray}
                      strokeWidth={1}
                    />
                  ) : null}
                  {showBoundLines ? (
                    <>
                      <line
                        data-section="chart-line-anomaly-bound-line"
                        data-series-id={s.id}
                        data-bound="upper"
                        x1={padding}
                        y1={s.upperY}
                        x2={padding + layout.innerWidth}
                        y2={s.upperY}
                        stroke={s.highColor}
                        strokeDasharray={boundDashArray}
                        strokeWidth={1}
                        strokeOpacity={0.6}
                      />
                      <line
                        data-section="chart-line-anomaly-bound-line"
                        data-series-id={s.id}
                        data-bound="lower"
                        x1={padding}
                        y1={s.lowerY}
                        x2={padding + layout.innerWidth}
                        y2={s.lowerY}
                        stroke={s.lowColor}
                        strokeDasharray={boundDashArray}
                        strokeWidth={1}
                        strokeOpacity={0.6}
                      />
                    </>
                  ) : null}
                </g>
              );
            })}
          </g>

          {/* Series lines + dots */}
          <g data-section="chart-line-anomaly-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-anomaly-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-threshold={s.threshold}
                  data-series-mean={s.stats.mean}
                  data-series-stddev={s.stats.stddev}
                  data-series-stats-ok={s.stats.ok ? 'true' : 'false'}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-anomaly-count={s.anomalyCount}
                  data-series-high-count={s.highCount}
                  data-series-low-count={s.lowCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-anomaly-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points, ${s.anomalyCount} anomalies at z-threshold ${s.threshold}`}
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
                        const r = p.isAnomaly
                          ? isHovered
                            ? anomalyRadius + 1
                            : anomalyRadius
                          : isHovered
                            ? dotRadius + 1
                            : dotRadius;
                        const fill =
                          p.direction === 'high'
                            ? s.highColor
                            : p.direction === 'low'
                              ? s.lowColor
                              : s.color;
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}, z ${fmtZ(p.zScore)}${p.isAnomaly ? `, ${p.direction} anomaly` : ''}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-anomaly-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-z-score={p.zScore}
                            data-direction={p.direction}
                            data-is-anomaly={p.isAnomaly ? 'true' : 'false'}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={r}
                            fill={fill}
                            fillOpacity={opacity}
                            stroke={fill}
                            strokeWidth={p.isAnomaly ? 1.5 : 1}
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(p.py - 72, 0), height - 110);
          const zColor =
            p.direction === 'high'
              ? s.highColor
              : p.direction === 'low'
                ? s.lowColor
                : 'inherit';
          return (
            <div
              data-section="chart-line-anomaly-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              data-direction={p.direction}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-anomaly-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-anomaly-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-anomaly-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              <div
                data-section="chart-line-anomaly-tooltip-z"
                style={{ color: zColor }}
              >
                z: {fmtZ(p.zScore)}
                {p.isAnomaly ? ` (${p.direction} anomaly)` : ''}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-anomaly-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-anomaly-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-anomaly-legend-button"
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
                    data-section="chart-line-anomaly-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineAnomalyDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-anomaly-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-anomaly-legend-stats"
                      className="text-slate-500"
                    >
                      ({visEntry.anomalyCount} anomaly
                      {visEntry.anomalyCount === 1 ? '' : 's'})
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

ChartLineAnomaly.displayName = 'ChartLineAnomaly';
