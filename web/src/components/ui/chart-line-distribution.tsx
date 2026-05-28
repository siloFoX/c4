import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DISTRIBUTION_WIDTH = 560;
export const DEFAULT_CHART_LINE_DISTRIBUTION_HEIGHT = 320;
export const DEFAULT_CHART_LINE_DISTRIBUTION_PADDING = 40;
export const DEFAULT_CHART_LINE_DISTRIBUTION_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DISTRIBUTION_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_DISTRIBUTION_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DISTRIBUTION_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_DISTRIBUTION_BIN_OPACITY = 0.85;
export const DEFAULT_CHART_LINE_DISTRIBUTION_BIN_COUNT = 12;
export const DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_RATIO = 0.2;
export const DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_GAP = 8;
export const DEFAULT_CHART_LINE_DISTRIBUTION_BIN_GAP = 1;
export const DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_BG = '#f8fafc';
export const DEFAULT_CHART_LINE_DISTRIBUTION_MEAN_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_DISTRIBUTION_MEDIAN_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_DISTRIBUTION_MEAN_DASH = '4 3';
export const DEFAULT_CHART_LINE_DISTRIBUTION_MEDIAN_DASH = '3 2';
export const DEFAULT_CHART_LINE_DISTRIBUTION_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DISTRIBUTION_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE = [
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

export interface ChartLineDistributionPoint {
  x: number;
  y: number;
}

export interface ChartLineDistributionSeries {
  id: string;
  label: string;
  data: readonly ChartLineDistributionPoint[];
  color?: string;
}

export interface ChartLineDistributionBin {
  index: number;
  binMin: number;
  binMax: number;
  binMid: number;
  total: number;
  perSeries: { id: string; count: number }[];
}

export interface ChartLineDistributionStats {
  finiteCount: number;
  mean: number;
  median: number;
  min: number;
  max: number;
}

export interface ChartLineDistributionLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineDistributionLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineDistributionLayoutPoint[];
  path: string;
  finiteCount: number;
  totalCount: number;
  stats: ChartLineDistributionStats;
}

export interface ChartLineDistributionLayoutBinSegment {
  id: string;
  color: string;
  x: number;
  width: number;
  count: number;
}

export interface ChartLineDistributionLayoutBin {
  index: number;
  binMin: number;
  binMax: number;
  total: number;
  y: number;
  height: number;
  segments: ChartLineDistributionLayoutBinSegment[];
}

export interface ComputeLineDistributionLayoutResult {
  series: ChartLineDistributionLayoutSeries[];
  bins: ChartLineDistributionLayoutBin[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  mainTrackLeft: number;
  mainTrackRight: number;
  histogramTrackLeft: number;
  histogramTrackRight: number;
  combinedMean: number;
  combinedMedian: number;
  combinedFiniteCount: number;
  totalPoints: number;
  visibleSeriesCount: number;
  binCount: number;
  maxBinTotal: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineDistributionPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineDistributionPoint).x) &&
    isFiniteNumber((p as ChartLineDistributionPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineDistributionDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_DISTRIBUTION_PALETTE.length
  ]!;
}

export function getLineDistributionFinitePoints(
  points: readonly ChartLineDistributionPoint[],
): ChartLineDistributionPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/** Validates bin count; non-finite / < 1 -> 1. Fractional floored. */
export function normaliseLineDistributionBinCount(value: unknown): number {
  if (!isFiniteNumber(value)) return 1;
  const v = Math.floor(value);
  if (v < 1) return 1;
  return v;
}

/**
 * Computes the mean of a numeric array. Non-finite entries are
 * dropped; empty / non-array -> `0`.
 */
export function computeLineDistributionMean(
  values: readonly number[] | undefined | null,
): number {
  if (!Array.isArray(values)) return 0;
  let sum = 0;
  let count = 0;
  for (const v of values) {
    if (!isFiniteNumber(v)) continue;
    sum += v;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/**
 * Computes the median of a numeric array. Non-finite entries are
 * dropped; empty / non-array -> `0`. Even-length input averages the
 * two middle samples.
 */
export function computeLineDistributionMedian(
  values: readonly number[] | undefined | null,
): number {
  if (!Array.isArray(values)) return 0;
  const finite = values.filter(isFiniteNumber).slice().sort((a, b) => a - b);
  const n = finite.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return finite[(n - 1) / 2]!;
  return (finite[n / 2 - 1]! + finite[n / 2]!) / 2;
}

/**
 * Bins a numeric series into `binCount` equal-width bins across
 * `[rangeMin, rangeMax]`. Non-finite values are skipped. Values that
 * fall exactly on `rangeMax` go into the LAST bin (inclusive upper
 * bound); values below `rangeMin` or above `rangeMax` are dropped.
 *
 * Returns one entry per bin with `total` (sum of counts) and
 * `perSeries` (count per series id, in the input order; only non-zero
 * counts are emitted to keep the array compact).
 *
 * Non-array `series` or `binCount <= 0` -> `[]`. `rangeMin >=
 * rangeMax` -> `[]`.
 */
export function computeLineDistributionBins(
  series: readonly ChartLineDistributionSeries[] | undefined | null,
  binCount: number,
  rangeMin: number,
  rangeMax: number,
): ChartLineDistributionBin[] {
  if (!Array.isArray(series)) return [];
  const n = normaliseLineDistributionBinCount(binCount);
  if (
    !isFiniteNumber(rangeMin) ||
    !isFiniteNumber(rangeMax) ||
    rangeMin >= rangeMax
  ) {
    return [];
  }
  const width = (rangeMax - rangeMin) / n;
  const bins: ChartLineDistributionBin[] = [];
  for (let i = 0; i < n; i += 1) {
    const binMin = rangeMin + i * width;
    const binMax = binMin + width;
    bins.push({
      index: i,
      binMin,
      binMax,
      binMid: (binMin + binMax) / 2,
      total: 0,
      perSeries: [],
    });
  }
  for (const s of series) {
    if (!s) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const perBin = new Array<number>(n).fill(0);
    for (const p of arr) {
      if (!isFinitePoint(p)) continue;
      if (p.y < rangeMin || p.y > rangeMax) continue;
      let idx: number;
      if (p.y === rangeMax) {
        idx = n - 1;
      } else {
        idx = Math.floor((p.y - rangeMin) / width);
        if (idx < 0) idx = 0;
        if (idx >= n) idx = n - 1;
      }
      perBin[idx]! += 1;
    }
    for (let i = 0; i < n; i += 1) {
      const c = perBin[i]!;
      if (c === 0) continue;
      bins[i]!.perSeries.push({ id: s.id, count: c });
      bins[i]!.total += c;
    }
  }
  return bins;
}

export interface ComputeLineDistributionLayoutInput {
  series: readonly ChartLineDistributionSeries[];
  hiddenSeries?: ReadonlySet<string> | null;
  binCount?: number;
  histogramRatio?: number;
  histogramGap?: number;
  binGap?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineDistributionLayout(
  input: ComputeLineDistributionLayoutInput,
): ComputeLineDistributionLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const binCount = normaliseLineDistributionBinCount(
    input.binCount ?? DEFAULT_CHART_LINE_DISTRIBUTION_BIN_COUNT,
  );
  const histogramRatio = isFiniteNumber(input.histogramRatio)
    ? Math.min(0.6, Math.max(0, input.histogramRatio))
    : DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_RATIO;
  const histogramGap = isFiniteNumber(input.histogramGap)
    ? Math.max(0, input.histogramGap)
    : DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_GAP;
  const binGap = isFiniteNumber(input.binGap)
    ? Math.max(0, input.binGap)
    : DEFAULT_CHART_LINE_DISTRIBUTION_BIN_GAP;
  const empty: ComputeLineDistributionLayoutResult = {
    series: [],
    bins: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    innerWidth,
    innerHeight,
    mainTrackLeft: padding,
    mainTrackRight: padding,
    histogramTrackLeft: padding,
    histogramTrackRight: padding,
    combinedMean: 0,
    combinedMedian: 0,
    combinedFiniteCount: 0,
    totalPoints: 0,
    visibleSeriesCount: 0,
    binCount,
    maxBinTotal: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  if (seriesArr.length === 0) return empty;
  const hidden = input.hiddenSeries ?? null;
  const visible = seriesArr.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return empty;

  // Split horizontal area: main track on the left, histogram track on
  // the right separated by histogramGap.
  const histogramWidth = Math.max(
    0,
    innerWidth * histogramRatio - histogramGap,
  );
  const mainWidth = Math.max(0, innerWidth - histogramWidth - histogramGap);
  const mainTrackLeft = padding;
  const mainTrackRight = mainTrackLeft + mainWidth;
  const histogramTrackLeft = mainTrackRight + histogramGap;
  const histogramTrackRight = histogramTrackLeft + histogramWidth;

  // Bounds across all visible series.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of visible) {
    for (const p of getLineDistributionFinitePoints(s.data ?? [])) {
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
    mainTrackLeft + ((x - xMin) / xRange) * mainWidth;
  const yToPx = (y: number): number =>
    padding + innerHeight - ((y - yMin) / yRange) * innerHeight;

  // Build per-series layout (only visible).
  const layoutSeries: ChartLineDistributionLayoutSeries[] = [];
  let totalPoints = 0;
  const combinedValues: number[] = [];
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineDistributionLayoutPoint[] = [];
    const seriesValues: number[] = [];
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
      seriesValues.push(p.y);
      combinedValues.push(p.y);
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    let minV = Number.POSITIVE_INFINITY;
    let maxV = Number.NEGATIVE_INFINITY;
    for (const v of seriesValues) {
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: i,
      color: s.color ?? getLineDistributionDefaultColor(i),
      points,
      path,
      finiteCount: points.length,
      totalCount: arr.length,
      stats: {
        finiteCount: seriesValues.length,
        mean: computeLineDistributionMean(seriesValues),
        median: computeLineDistributionMedian(seriesValues),
        min: minV === Number.POSITIVE_INFINITY ? 0 : minV,
        max: maxV === Number.NEGATIVE_INFINITY ? 0 : maxV,
      },
    });
  }
  // Build bins across all visible series (rangeMin..rangeMax = yMin..yMax).
  const visibleSeriesForBins = layoutSeries.map((ls) => {
    const orig = seriesArr.find((s) => s.id === ls.id);
    return { id: ls.id, label: ls.label, data: orig?.data ?? [] };
  });
  const rawBins = computeLineDistributionBins(
    visibleSeriesForBins,
    binCount,
    yMin,
    yMax,
  );
  let maxBinTotal = 0;
  for (const b of rawBins) {
    if (b.total > maxBinTotal) maxBinTotal = b.total;
  }
  const layoutBins: ChartLineDistributionLayoutBin[] = rawBins.map((b) => {
    const yTop = yToPx(b.binMax);
    const yBottom = yToPx(b.binMin);
    const yLo = Math.min(yTop, yBottom);
    const heightTotal = Math.abs(yBottom - yTop);
    const drawHeight = Math.max(0, heightTotal - binGap);
    const drawY = yLo + (heightTotal - drawHeight) / 2;
    let runningX = histogramTrackLeft;
    const segments: ChartLineDistributionLayoutBinSegment[] = [];
    for (const part of b.perSeries) {
      const series = layoutSeries.find((ls) => ls.id === part.id);
      if (!series) continue;
      const w =
        maxBinTotal === 0
          ? 0
          : (part.count / maxBinTotal) * histogramWidth;
      segments.push({
        id: part.id,
        color: series.color,
        x: runningX,
        width: w,
        count: part.count,
      });
      runningX += w;
    }
    return {
      index: b.index,
      binMin: b.binMin,
      binMax: b.binMax,
      total: b.total,
      y: drawY,
      height: drawHeight,
      segments,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_DISTRIBUTION_TICK_COUNT;
  const stepCount = Math.max(2, Math.floor(tickCount));
  const xTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = xMin + (xRange * i) / (stepCount - 1);
    xTicks.push({
      value,
      position: mainTrackLeft + ((value - xMin) / xRange) * mainWidth,
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
    bins: layoutBins,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    innerWidth,
    innerHeight,
    mainTrackLeft,
    mainTrackRight,
    histogramTrackLeft,
    histogramTrackRight,
    combinedMean: computeLineDistributionMean(combinedValues),
    combinedMedian: computeLineDistributionMedian(combinedValues),
    combinedFiniteCount: combinedValues.length,
    totalPoints,
    visibleSeriesCount: visible.length,
    binCount,
    maxBinTotal,
  };
}

export function describeLineDistributionChart(
  series: readonly ChartLineDistributionSeries[] | undefined | null,
  binCount: number = DEFAULT_CHART_LINE_DISTRIBUTION_BIN_COUNT,
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
  const combined: number[] = [];
  for (const s of visible) {
    const finite = getLineDistributionFinitePoints(s.data ?? []);
    if (finite.length === 0) continue;
    any = true;
    totalPoints += finite.length;
    const values = finite.map((p) => p.y);
    combined.push(...values);
    parts.push(
      `${s.label}: mean ${fmtV(computeLineDistributionMean(values))}, median ${fmtV(computeLineDistributionMedian(values))}`,
    );
  }
  if (!any) return 'No data';
  const combinedMean = computeLineDistributionMean(combined);
  const combinedMedian = computeLineDistributionMedian(combined);
  return `Line chart with inline distribution histogram (${normaliseLineDistributionBinCount(binCount)} bins) across ${visible.length} series (${totalPoints} points). Combined mean ${fmtV(combinedMean)}, median ${fmtV(combinedMedian)}. ${parts.join('; ')}.`;
}

export interface ChartLineDistributionPointClick {
  series: ChartLineDistributionLayoutSeries;
  point: ChartLineDistributionLayoutPoint;
}

export interface ChartLineDistributionBinClick {
  bin: ChartLineDistributionLayoutBin;
}

export interface ChartLineDistributionProps {
  series: readonly ChartLineDistributionSeries[];
  binCount?: number;
  histogramRatio?: number;
  histogramGap?: number;
  binGap?: number;
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
  binOpacity?: number;
  histogramBgColor?: string;
  meanColor?: string;
  medianColor?: string;
  meanDashArray?: string;
  medianDashArray?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showHistogram?: boolean;
  showHistogramBg?: boolean;
  showMeanLine?: boolean;
  showMedianLine?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineDistributionPointClick) => void;
  onBinClick?: (info: ChartLineDistributionBinClick) => void;
  style?: CSSProperties;
}

export const ChartLineDistribution = forwardRef(function ChartLineDistribution(
  {
    series = [],
    binCount = DEFAULT_CHART_LINE_DISTRIBUTION_BIN_COUNT,
    histogramRatio = DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_RATIO,
    histogramGap = DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_GAP,
    binGap = DEFAULT_CHART_LINE_DISTRIBUTION_BIN_GAP,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_DISTRIBUTION_WIDTH,
    height = DEFAULT_CHART_LINE_DISTRIBUTION_HEIGHT,
    padding = DEFAULT_CHART_LINE_DISTRIBUTION_PADDING,
    tickCount = DEFAULT_CHART_LINE_DISTRIBUTION_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DISTRIBUTION_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DISTRIBUTION_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_DISTRIBUTION_LINE_OPACITY,
    binOpacity = DEFAULT_CHART_LINE_DISTRIBUTION_BIN_OPACITY,
    histogramBgColor = DEFAULT_CHART_LINE_DISTRIBUTION_HISTOGRAM_BG,
    meanColor = DEFAULT_CHART_LINE_DISTRIBUTION_MEAN_COLOR,
    medianColor = DEFAULT_CHART_LINE_DISTRIBUTION_MEDIAN_COLOR,
    meanDashArray = DEFAULT_CHART_LINE_DISTRIBUTION_MEAN_DASH,
    medianDashArray = DEFAULT_CHART_LINE_DISTRIBUTION_MEDIAN_DASH,
    gridColor = DEFAULT_CHART_LINE_DISTRIBUTION_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_DISTRIBUTION_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showHistogram = true,
    showHistogramBg = true,
    showMeanLine = true,
    showMedianLine = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with inline distribution histogram',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onBinClick,
    style,
  }: ChartLineDistributionProps,
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
  const [hoveredBinIndex, setHoveredBinIndex] = useState<number | null>(null);

  const layout = useMemo(
    () =>
      computeLineDistributionLayout({
        series,
        hiddenSeries: hidden,
        binCount,
        histogramRatio: showHistogram ? histogramRatio : 0,
        histogramGap: showHistogram ? histogramGap : 0,
        binGap,
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
      binCount,
      histogramRatio,
      histogramGap,
      binGap,
      showHistogram,
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
    describeLineDistributionChart(series, binCount, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineDistributionSeries) => {
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

  const yToPx = (y: number): number => {
    if (layout.innerHeight === 0) return padding;
    const yRange = layout.yMax - layout.yMin;
    if (yRange === 0) return padding + layout.innerHeight / 2;
    return (
      padding +
      layout.innerHeight -
      ((y - layout.yMin) / yRange) * layout.innerHeight
    );
  };
  const meanY = yToPx(layout.combinedMean);
  const medianY = yToPx(layout.combinedMedian);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-distribution"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-bin-count={layout.binCount}
      data-combined-mean={layout.combinedMean}
      data-combined-median={layout.combinedMedian}
      data-combined-finite-count={layout.combinedFiniteCount}
      data-max-bin-total={layout.maxBinTotal}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-distribution-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-distribution-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-distribution-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showHistogram && showHistogramBg ? (
            <rect
              data-section="chart-line-distribution-histogram-bg"
              x={layout.histogramTrackLeft}
              y={padding}
              width={Math.max(
                0,
                layout.histogramTrackRight - layout.histogramTrackLeft,
              )}
              height={layout.innerHeight}
              fill={histogramBgColor}
              stroke="none"
            />
          ) : null}

          {showGrid ? (
            <g data-section="chart-line-distribution-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-distribution-grid-line"
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
                  data-section="chart-line-distribution-grid-line"
                  data-axis="y"
                  data-tick-value={t.value}
                  x1={layout.mainTrackLeft}
                  y1={t.position}
                  x2={layout.mainTrackRight}
                  y2={t.position}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-distribution-axes">
              <line
                data-section="chart-line-distribution-axis"
                data-axis="x"
                x1={layout.mainTrackLeft}
                y1={padding + layout.innerHeight}
                x2={layout.mainTrackRight}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-distribution-axis"
                data-axis="y"
                x1={layout.mainTrackLeft}
                y1={padding}
                x2={layout.mainTrackLeft}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-distribution-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-distribution-tick"
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
                        data-section="chart-line-distribution-tick-label"
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
                <g data-section="chart-line-distribution-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-distribution-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.mainTrackLeft}
                        y1={t.position}
                        x2={layout.mainTrackLeft - 4}
                        y2={t.position}
                        stroke={axisColor}
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-line-distribution-tick-label"
                        data-axis="y"
                        data-tick-value={t.value}
                        x={layout.mainTrackLeft - 6}
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
                  data-section="chart-line-distribution-x-label"
                  x={layout.mainTrackLeft + (layout.mainTrackRight - layout.mainTrackLeft) / 2}
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
                  data-section="chart-line-distribution-y-label"
                  x={layout.mainTrackLeft - 30}
                  y={padding + layout.innerHeight / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  transform={`rotate(-90 ${layout.mainTrackLeft - 30} ${padding + layout.innerHeight / 2})`}
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Mean / median horizontal references shared by both tracks */}
          {showMeanLine ? (
            <line
              data-section="chart-line-distribution-mean-line"
              data-mean-value={layout.combinedMean}
              role="graphics-symbol"
              aria-label={`Mean reference: ${fmtValue(layout.combinedMean)}`}
              x1={layout.mainTrackLeft}
              y1={meanY}
              x2={layout.histogramTrackRight}
              y2={meanY}
              stroke={meanColor}
              strokeDasharray={meanDashArray}
              strokeWidth={1}
            />
          ) : null}
          {showMedianLine ? (
            <line
              data-section="chart-line-distribution-median-line"
              data-median-value={layout.combinedMedian}
              role="graphics-symbol"
              aria-label={`Median reference: ${fmtValue(layout.combinedMedian)}`}
              x1={layout.mainTrackLeft}
              y1={medianY}
              x2={layout.histogramTrackRight}
              y2={medianY}
              stroke={medianColor}
              strokeDasharray={medianDashArray}
              strokeWidth={1}
            />
          ) : null}

          {/* Histogram bars */}
          {showHistogram && layout.histogramTrackRight > layout.histogramTrackLeft ? (
            <g data-section="chart-line-distribution-histogram">
              {layout.bins.map((b) => (
                <g
                  key={`bin-${b.index}`}
                  data-section="chart-line-distribution-bin-group"
                  data-bin-index={b.index}
                  data-bin-total={b.total}
                  data-bin-min={b.binMin}
                  data-bin-max={b.binMax}
                  data-hovered={
                    hoveredBinIndex === b.index ? 'true' : 'false'
                  }
                >
                  {b.segments.map((seg, segIdx) => (
                    <rect
                      key={`bin-${b.index}-${seg.id}`}
                      data-section="chart-line-distribution-bin"
                      data-bin-index={b.index}
                      data-series-id={seg.id}
                      data-segment-index={segIdx}
                      data-count={seg.count}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Bin ${fmtValue(b.binMin)} to ${fmtValue(b.binMax)}, ${seg.count} from this series`}
                      x={seg.x}
                      y={b.y}
                      width={seg.width}
                      height={b.height}
                      fill={seg.color}
                      fillOpacity={
                        hoveredBinIndex === b.index ? 1 : binOpacity
                      }
                      stroke="none"
                      onMouseEnter={() => setHoveredBinIndex(b.index)}
                      onMouseLeave={() => setHoveredBinIndex(null)}
                      onFocus={() => setHoveredBinIndex(b.index)}
                      onBlur={() => setHoveredBinIndex(null)}
                      onClick={() => {
                        if (onBinClick) onBinClick({ bin: b });
                      }}
                    />
                  ))}
                </g>
              ))}
            </g>
          ) : null}

          {/* Main series lines + dots */}
          <g data-section="chart-line-distribution-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-distribution-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-mean={s.stats.mean}
                  data-series-median={s.stats.median}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {s.path ? (
                    <path
                      data-section="chart-line-distribution-path"
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
                            data-section="chart-line-distribution-dot"
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

        {showTooltip && hoveredBinIndex !== null ? (() => {
          const b = layout.bins.find((bin) => bin.index === hoveredBinIndex);
          if (!b) return null;
          const tx = Math.min(
            Math.max(layout.histogramTrackLeft - 200, 0),
            width - 220,
          );
          const ty = Math.min(Math.max(b.y, padding), height - 80);
          return (
            <div
              data-section="chart-line-distribution-bin-tooltip"
              data-bin-index={b.index}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-distribution-bin-tooltip-range"
                className="font-medium"
              >
                {fmtValue(b.binMin)} to {fmtValue(b.binMax)}
              </div>
              <div
                data-section="chart-line-distribution-bin-tooltip-total"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                total: {b.total}
              </div>
              {b.segments.map((seg) => {
                const ls = layout.series.find((s) => s.id === seg.id);
                return (
                  <div
                    key={`bintip-${seg.id}`}
                    data-section="chart-line-distribution-bin-tooltip-series"
                    data-series-id={seg.id}
                    className="text-slate-500"
                    style={{ color: seg.color }}
                  >
                    {ls?.label ?? seg.id}: {seg.count}
                  </div>
                );
              })}
            </div>
          );
        })() : null}

        {showTooltip && hoveredKey && hoveredBinIndex === null ? (() => {
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
              data-section="chart-line-distribution-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div className="font-medium" style={{ color: s.color }}>
                {s.label}
              </div>
              <div className="text-slate-600">x: {fmtX(p.x)}</div>
              <div className="text-slate-700" style={{ fontWeight: 600 }}>
                y: {fmtValue(p.y)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-distribution-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-distribution-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-distribution-legend-button"
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
                    data-section="chart-line-distribution-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineDistributionDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-distribution-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-distribution-legend-stats"
                      className="text-slate-500"
                    >
                      (mean {(() => {
                        const m = visEntry.stats.mean;
                        return formatValue ? formatValue(m) : m.toFixed(1);
                      })()})
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

ChartLineDistribution.displayName = 'ChartLineDistribution';
