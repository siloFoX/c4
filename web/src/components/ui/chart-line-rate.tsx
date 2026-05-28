import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_RATE_WIDTH = 560;
export const DEFAULT_CHART_LINE_RATE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_RATE_PADDING = 40;
export const DEFAULT_CHART_LINE_RATE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RATE_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_RATE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RATE_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_RATE_FILL_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_RATE_ZERO_DASH = '4 3';
export const DEFAULT_CHART_LINE_RATE_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RATE_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RATE_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RATE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RATE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_RATE_PALETTE = [
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

export type ChartLineRateMode = 'midpoint' | 'left' | 'right';
export const DEFAULT_CHART_LINE_RATE_MODE: ChartLineRateMode = 'right';
export const ALL_CHART_LINE_RATE_MODES: readonly ChartLineRateMode[] = [
  'midpoint',
  'left',
  'right',
];

export interface ChartLineRatePoint {
  x: number;
  y: number;
}

export interface ChartLineRateSeries {
  id: string;
  label: string;
  data: readonly ChartLineRatePoint[];
  color?: string;
  mode?: ChartLineRateMode;
}

export interface ChartLineRateSample {
  index: number;
  x: number;
  rate: number;
  fromIndex: number;
  fromX: number;
  fromY: number;
  toIndex: number;
  toX: number;
  toY: number;
  dx: number;
  dy: number;
}

export interface ChartLineRateStats {
  finiteCount: number;
  maxRate: number;
  minRate: number;
  averageRate: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  totalAbsoluteArea: number;
}

export interface ChartLineRateLayoutSample {
  index: number;
  x: number;
  rate: number;
  px: number;
  py: number;
  isPositive: boolean;
  isNegative: boolean;
  fromIndex: number;
  toIndex: number;
}

export interface ChartLineRateLayoutRegion {
  index: number;
  startX: number;
  endX: number;
  startRate: number;
  endRate: number;
  isPositive: boolean;
  path: string;
  fillColor: string;
  area: number;
}

export interface ChartLineRateLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  mode: ChartLineRateMode;
  samples: ChartLineRateLayoutSample[];
  regions: ChartLineRateLayoutRegion[];
  path: string;
  stats: ChartLineRateStats;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineRateLayoutResult {
  series: ChartLineRateLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zeroY: number;
  innerWidth: number;
  innerHeight: number;
  totalSamples: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineRatePoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineRatePoint).x) &&
    isFiniteNumber((p as ChartLineRatePoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineRateDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_RATE_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_RATE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_RATE_PALETTE.length
  ]!;
}

export function getLineRateFinitePoints(
  points: readonly ChartLineRatePoint[],
): ChartLineRatePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Computes the per-interval rate of change between consecutive finite
 * samples sorted by `x` ascending. Returns one sample per segment
 * (so the output has `n - 1` entries for `n` finite inputs).
 *
 * Each output sample's `x` is anchored according to `mode`:
 *
 * - `'right'` (default): `x = to.x` -- "current rate as of this x".
 * - `'left'`: `x = from.x` -- "rate looking forward".
 * - `'midpoint'`: `x = (from.x + to.x) / 2` -- centered.
 *
 * Segments where `dx === 0` (consecutive equal x) are dropped.
 * Non-finite samples are dropped before the segment walk. Non-array
 * input returns `[]`.
 *
 * The output's `index` field is the position in the **output array**
 * (0..n-2). `fromIndex` and `toIndex` are positions in the ORIGINAL
 * input array so callers can map back to their own data.
 */
export function computeRateOfChange(
  points: readonly ChartLineRatePoint[] | undefined | null,
  mode: ChartLineRateMode = DEFAULT_CHART_LINE_RATE_MODE,
): ChartLineRateSample[] {
  if (!Array.isArray(points)) return [];
  const indexed: { p: ChartLineRatePoint; original: number }[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (!isFinitePoint(p)) continue;
    indexed.push({ p, original: i });
  }
  indexed.sort((a, b) => a.p.x - b.p.x);
  if (indexed.length < 2) return [];
  const out: ChartLineRateSample[] = [];
  for (let i = 1; i < indexed.length; i += 1) {
    const a = indexed[i - 1]!;
    const b = indexed[i]!;
    const dx = b.p.x - a.p.x;
    if (dx === 0) continue;
    const dy = b.p.y - a.p.y;
    const rate = dy / dx;
    let anchorX: number;
    if (mode === 'left') anchorX = a.p.x;
    else if (mode === 'midpoint') anchorX = (a.p.x + b.p.x) / 2;
    else anchorX = b.p.x;
    out.push({
      index: out.length,
      x: anchorX,
      rate,
      fromIndex: a.original,
      fromX: a.p.x,
      fromY: a.p.y,
      toIndex: b.original,
      toX: b.p.x,
      toY: b.p.y,
      dx,
      dy,
    });
  }
  return out;
}

/**
 * Returns the x value at which a line segment between two rate samples
 * crosses the y=0 baseline via the absolute-value proportion:
 *
 *     x* = x1 + (x2 - x1) * |rate1| / (|rate1| + |rate2|)
 *
 * Returns `null` when the segment is degenerate, both endpoints are on
 * the same side of 0, either endpoint sits exactly on 0, or inputs are
 * non-finite.
 */
export function findLineRateZeroCrossing(
  x1: number,
  rate1: number,
  x2: number,
  rate2: number,
): number | null {
  if (
    !isFiniteNumber(x1) ||
    !isFiniteNumber(rate1) ||
    !isFiniteNumber(x2) ||
    !isFiniteNumber(rate2)
  ) {
    return null;
  }
  if (x1 === x2) return null;
  if (rate1 === 0 || rate2 === 0) return null;
  if (Math.sign(rate1) === Math.sign(rate2)) return null;
  const a = Math.abs(rate1);
  const b = Math.abs(rate2);
  if (a + b === 0) return null;
  return x1 + (x2 - x1) * (a / (a + b));
}

export function computeLineRateStats(
  samples: readonly ChartLineRateSample[],
): ChartLineRateStats {
  if (!Array.isArray(samples) || samples.length === 0) {
    return {
      finiteCount: 0,
      maxRate: 0,
      minRate: 0,
      averageRate: 0,
      positiveCount: 0,
      negativeCount: 0,
      zeroCount: 0,
      totalAbsoluteArea: 0,
    };
  }
  let maxRate = Number.NEGATIVE_INFINITY;
  let minRate = Number.POSITIVE_INFINITY;
  let sum = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let totalAbsoluteArea = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i]!;
    if (s.rate > maxRate) maxRate = s.rate;
    if (s.rate < minRate) minRate = s.rate;
    sum += s.rate;
    if (s.rate > 0) positiveCount += 1;
    else if (s.rate < 0) negativeCount += 1;
    else zeroCount += 1;
    if (i > 0) {
      const prev = samples[i - 1]!;
      const a = Math.abs(prev.rate);
      const b = Math.abs(s.rate);
      const dx = Math.abs(s.x - prev.x);
      totalAbsoluteArea += ((a + b) / 2) * dx;
    }
  }
  return {
    finiteCount: samples.length,
    maxRate: maxRate === Number.NEGATIVE_INFINITY ? 0 : maxRate,
    minRate: minRate === Number.POSITIVE_INFINITY ? 0 : minRate,
    averageRate: sum / samples.length,
    positiveCount,
    negativeCount,
    zeroCount,
    totalAbsoluteArea,
  };
}

export interface ComputeLineRateLayoutInput {
  series: readonly ChartLineRateSeries[];
  mode?: ChartLineRateMode;
  hiddenSeries?: ReadonlySet<string> | null;
  showSignFill?: boolean;
  positiveColor?: string;
  negativeColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineRateLayout(
  input: ComputeLineRateLayoutInput,
): ComputeLineRateLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineRateLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    zeroY: 0,
    innerWidth,
    innerHeight,
    totalSamples: 0,
    visibleSeriesCount: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  if (seriesArr.length === 0) return empty;
  const hidden = input.hiddenSeries ?? null;
  const visible = seriesArr.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return empty;

  const defaultMode = input.mode ?? DEFAULT_CHART_LINE_RATE_MODE;
  const positiveColor =
    input.positiveColor ?? DEFAULT_CHART_LINE_RATE_POSITIVE_COLOR;
  const negativeColor =
    input.negativeColor ?? DEFAULT_CHART_LINE_RATE_NEGATIVE_COLOR;

  const intermediates: {
    s: ChartLineRateSeries;
    originalIndex: number;
    mode: ChartLineRateMode;
    samples: ChartLineRateSample[];
  }[] = [];
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const mode = s.mode ?? defaultMode;
    const samples = computeRateOfChange(s.data ?? [], mode);
    intermediates.push({ s, originalIndex: i, mode, samples });
    for (const sample of samples) {
      if (sample.x < xMin) xMin = sample.x;
      if (sample.x > xMax) xMax = sample.x;
      if (sample.rate < yMin) yMin = sample.rate;
      if (sample.rate > yMax) yMax = sample.rate;
      any = true;
    }
  }
  // Always include the y=0 baseline so the sign reference is visible.
  if (0 < yMin) yMin = 0;
  if (0 > yMax) yMax = 0;
  if (!any) {
    xMin = 0;
    xMax = 1;
    yMin = -0.5;
    yMax = 0.5;
  }
  if (xMin === Number.POSITIVE_INFINITY) {
    xMin = 0;
    xMax = 1;
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
  const zeroY = yToPx(0);
  const wantFill = input.showSignFill !== false;

  const layoutSeries: ChartLineRateLayoutSeries[] = [];
  let totalSamples = 0;
  for (const it of intermediates) {
    const samples: ChartLineRateLayoutSample[] = it.samples.map((s) => ({
      index: s.index,
      x: s.x,
      rate: s.rate,
      px: xToPx(s.x),
      py: yToPx(s.rate),
      isPositive: s.rate > 0,
      isNegative: s.rate < 0,
      fromIndex: s.fromIndex,
      toIndex: s.toIndex,
    }));
    let path = '';
    if (samples.length > 0) {
      path = `M ${fmt(samples[0]!.px)} ${fmt(samples[0]!.py)}`;
      for (let j = 1; j < samples.length; j += 1) {
        path += ` L ${fmt(samples[j]!.px)} ${fmt(samples[j]!.py)}`;
      }
    }
    const regions: ChartLineRateLayoutRegion[] = [];
    if (wantFill) {
      for (let j = 0; j < it.samples.length - 1; j += 1) {
        const a = it.samples[j]!;
        const b = it.samples[j + 1]!;
        const crossing = findLineRateZeroCrossing(
          a.x,
          a.rate,
          b.x,
          b.rate,
        );
        const emit = (
          startX: number,
          startRate: number,
          endX: number,
          endRate: number,
          isPositive: boolean,
        ): void => {
          if (startX === endX) return;
          const px1 = xToPx(startX);
          const px2 = xToPx(endX);
          const py1 = yToPx(startRate);
          const py2 = yToPx(endRate);
          const fillColor = isPositive ? positiveColor : negativeColor;
          const regionPath =
            `M ${fmt(px1)} ${fmt(py1)} L ${fmt(px2)} ${fmt(py2)} ` +
            `L ${fmt(px2)} ${fmt(zeroY)} L ${fmt(px1)} ${fmt(zeroY)} Z`;
          const dxAbs = Math.abs(endX - startX);
          const area =
            (Math.abs(startRate) + Math.abs(endRate)) / 2 * dxAbs;
          regions.push({
            index: regions.length,
            startX,
            endX,
            startRate,
            endRate,
            isPositive,
            path: regionPath,
            fillColor,
            area,
          });
        };
        if (crossing === null) {
          if (a.rate === 0 && b.rate === 0) continue;
          const isPositive = a.rate > 0 || b.rate > 0;
          emit(a.x, a.rate, b.x, b.rate, isPositive);
        } else {
          const firstPositive = a.rate > 0;
          emit(a.x, a.rate, crossing, 0, firstPositive);
          emit(crossing, 0, b.x, b.rate, !firstPositive);
        }
      }
    }
    const stats = computeLineRateStats(it.samples);
    totalSamples += samples.length;
    layoutSeries.push({
      id: it.s.id,
      label: it.s.label,
      index: it.originalIndex,
      color: it.s.color ?? getLineRateDefaultColor(it.originalIndex),
      mode: it.mode,
      samples,
      regions,
      path,
      stats,
      finiteCount: samples.length,
      totalCount: Array.isArray(it.s.data) ? it.s.data.length : 0,
    });
  }

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_RATE_TICK_COUNT;
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
    zeroY,
    innerWidth,
    innerHeight,
    totalSamples,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineRateChart(
  series: readonly ChartLineRateSeries[] | undefined | null,
  mode?: ChartLineRateMode,
  hidden?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  const defaultMode = mode ?? DEFAULT_CHART_LINE_RATE_MODE;
  let any = false;
  let totalSamples = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const samples = computeRateOfChange(s.data ?? [], s.mode ?? defaultMode);
    if (samples.length === 0) continue;
    any = true;
    totalSamples += samples.length;
    const stats = computeLineRateStats(samples);
    parts.push(
      `${s.label}: avg rate ${fmtV(stats.averageRate)}, max ${fmtV(stats.maxRate)}, min ${fmtV(stats.minRate)} (${stats.positiveCount} positive, ${stats.negativeCount} negative)`,
    );
  }
  if (!any) return 'No data';
  return `Rate-of-change line chart across ${visible.length} series (${totalSamples} segments). ${parts.join('; ')}.`;
}

export interface ChartLineRateSampleClick {
  series: ChartLineRateLayoutSeries;
  sample: ChartLineRateLayoutSample;
}

export interface ChartLineRateRegionClick {
  series: ChartLineRateLayoutSeries;
  region: ChartLineRateLayoutRegion;
}

export interface ChartLineRateProps {
  series: readonly ChartLineRateSeries[];
  mode?: ChartLineRateMode;
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
  fillOpacity?: number;
  zeroDashArray?: string;
  zeroColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showSignFill?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatRate?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onSampleClick?: (info: ChartLineRateSampleClick) => void;
  onRegionClick?: (info: ChartLineRateRegionClick) => void;
  style?: CSSProperties;
}

export const ChartLineRate = forwardRef(function ChartLineRate(
  {
    series = [],
    mode = DEFAULT_CHART_LINE_RATE_MODE,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_RATE_WIDTH,
    height = DEFAULT_CHART_LINE_RATE_HEIGHT,
    padding = DEFAULT_CHART_LINE_RATE_PADDING,
    tickCount = DEFAULT_CHART_LINE_RATE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RATE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RATE_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_RATE_LINE_OPACITY,
    fillOpacity = DEFAULT_CHART_LINE_RATE_FILL_OPACITY,
    zeroDashArray = DEFAULT_CHART_LINE_RATE_ZERO_DASH,
    zeroColor = DEFAULT_CHART_LINE_RATE_ZERO_COLOR,
    positiveColor = DEFAULT_CHART_LINE_RATE_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_RATE_NEGATIVE_COLOR,
    gridColor = DEFAULT_CHART_LINE_RATE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_RATE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showSignFill = true,
    showZeroLine = true,
    animate = true,
    className,
    ariaLabel = 'Rate-of-change line chart',
    ariaDescription,
    formatValue,
    formatX,
    formatRate,
    xLabel,
    yLabel,
    onSampleClick,
    onRegionClick,
    style,
  }: ChartLineRateProps,
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
  const fmtRate = useCallback(
    (n: number) =>
      formatRate
        ? formatRate(n)
        : `${n >= 0 ? '+' : ''}${formatValue ? formatValue(n) : n.toFixed(3)}`,
    [formatRate, formatValue],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineRateLayout({
        series,
        mode,
        hiddenSeries: hidden,
        showSignFill,
        positiveColor,
        negativeColor,
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
      mode,
      hidden,
      showSignFill,
      positiveColor,
      negativeColor,
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
    describeLineRateChart(series, mode, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineRateSeries) => {
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
      data-section="chart-line-rate"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-samples={layout.totalSamples}
      data-mode={mode}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-rate-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-rate-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-rate-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-rate-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-rate-grid-line"
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
                  data-section="chart-line-rate-grid-line"
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

          {/* Sign-shaded regions beneath the lines. */}
          {showSignFill ? (
            <g data-section="chart-line-rate-regions">
              {layout.series.flatMap((s) =>
                s.regions.map((r) => (
                  <path
                    key={`region-${s.id}-${r.index}`}
                    data-section="chart-line-rate-region"
                    data-series-id={s.id}
                    data-region-index={r.index}
                    data-region-is-positive={r.isPositive ? 'true' : 'false'}
                    data-region-start-x={r.startX}
                    data-region-end-x={r.endX}
                    data-region-fill-color={r.fillColor}
                    data-region-area={r.area}
                    d={r.path}
                    fill={r.fillColor}
                    fillOpacity={fillOpacity}
                    stroke="none"
                    onClick={() => {
                      if (onRegionClick)
                        onRegionClick({ series: s, region: r });
                    }}
                  />
                )),
              )}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-rate-axes">
              <line
                data-section="chart-line-rate-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-rate-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-rate-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-rate-tick"
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
                        data-section="chart-line-rate-tick-label"
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
                <g data-section="chart-line-rate-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-rate-tick"
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
                        data-section="chart-line-rate-tick-label"
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
                  data-section="chart-line-rate-x-label"
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
                  data-section="chart-line-rate-y-label"
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

          {/* Zero-rate baseline */}
          {showZeroLine ? (
            <line
              data-section="chart-line-rate-zero-line"
              data-zero-y={layout.zeroY}
              role="graphics-symbol"
              aria-label="Zero-rate reference line"
              x1={padding}
              y1={layout.zeroY}
              x2={padding + layout.innerWidth}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray={zeroDashArray}
              strokeWidth={1}
            />
          ) : null}

          {/* Series rate lines + dots */}
          <g data-section="chart-line-rate-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-rate-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-mode={s.mode}
                  data-series-sample-count={s.samples.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-max-rate={s.stats.maxRate}
                  data-series-min-rate={s.stats.minRate}
                  data-series-average-rate={s.stats.averageRate}
                  data-series-positive-count={s.stats.positiveCount}
                  data-series-negative-count={s.stats.negativeCount}
                  data-series-zero-count={s.stats.zeroCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-rate-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: rate-of-change line with ${s.finiteCount} segments`}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={dim}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots
                    ? s.samples.map((sample) => {
                        const key = `${s.id}::${sample.index}`;
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const fillForDot = sample.isPositive
                          ? positiveColor
                          : sample.isNegative
                            ? negativeColor
                            : s.color;
                        const aria = `${s.label}: x=${fmtX(sample.x)}, rate=${fmtRate(sample.rate)}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-rate-dot"
                            data-series-id={s.id}
                            data-sample-index={sample.index}
                            data-x={sample.x}
                            data-rate={sample.rate}
                            data-from-index={sample.fromIndex}
                            data-to-index={sample.toIndex}
                            data-rate-sign={
                              sample.isPositive
                                ? 'positive'
                                : sample.isNegative
                                  ? 'negative'
                                  : 'zero'
                            }
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={sample.px}
                            cy={sample.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={fillForDot}
                            fillOpacity={opacity}
                            stroke={s.color}
                            strokeWidth={1}
                            onMouseEnter={() => setHoveredKey(key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            onFocus={() => setHoveredKey(key)}
                            onBlur={() => setHoveredKey(null)}
                            onClick={() => {
                              if (onSampleClick) {
                                onSampleClick({ series: s, sample });
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
          const sample = s.samples.find((x) => x.index === idx);
          if (!sample) return null;
          const tx = Math.min(Math.max(sample.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(sample.py - 56, 0), height - 88);
          const signColor = sample.isPositive
            ? positiveColor
            : sample.isNegative
              ? negativeColor
              : 'inherit';
          return (
            <div
              data-section="chart-line-rate-tooltip"
              data-series-id={s.id}
              data-sample-index={sample.index}
              data-rate-sign={
                sample.isPositive
                  ? 'positive'
                  : sample.isNegative
                    ? 'negative'
                    : 'zero'
              }
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-rate-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-rate-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(sample.x)}
              </div>
              <div
                data-section="chart-line-rate-tooltip-rate"
                style={{ color: signColor, fontWeight: 600 }}
              >
                rate: {fmtRate(sample.rate)}
              </div>
              <div
                data-section="chart-line-rate-tooltip-mode"
                className="text-slate-500"
              >
                mode: {s.mode} (from #{sample.fromIndex} to #{sample.toIndex})
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-rate-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-rate-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-rate-legend-button"
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
                    data-section="chart-line-rate-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineRateDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-rate-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-rate-legend-stats"
                      className="text-slate-500"
                    >
                      (avg {fmtRate(visEntry.stats.averageRate)};{' '}
                      {visEntry.stats.positiveCount}+/
                      {visEntry.stats.negativeCount}-)
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

ChartLineRate.displayName = 'ChartLineRate';
