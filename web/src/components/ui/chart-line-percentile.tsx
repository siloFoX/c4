import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_PERCENTILE_WIDTH = 560;
export const DEFAULT_CHART_LINE_PERCENTILE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_PERCENTILE_PADDING = 40;
export const DEFAULT_CHART_LINE_PERCENTILE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PERCENTILE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PERCENTILE_WHISKER_WIDTH = 1;
export const DEFAULT_CHART_LINE_PERCENTILE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PERCENTILE_BAND_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_PERCENTILE_WHISKER_OPACITY = 0.6;
export const DEFAULT_CHART_LINE_PERCENTILE_WHISKER_DASH = '4 3';
export const DEFAULT_CHART_LINE_PERCENTILE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_PERCENTILE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_PERCENTILE_PERCENTILES: readonly [
  number,
  number,
  number,
] = [25, 50, 75];
export const DEFAULT_CHART_LINE_PERCENTILE_PALETTE = [
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

export interface ChartLinePercentileSample {
  x: number;
  values: readonly number[];
}

export interface ChartLinePercentileSeries {
  id: string;
  label: string;
  data: readonly ChartLinePercentileSample[];
  color?: string;
  bandColor?: string;
}

export interface ChartLinePercentileBucket {
  index: number;
  x: number;
  count: number;
  min: number;
  max: number;
  lower: number;
  mid: number;
  upper: number;
}

export interface ChartLinePercentileLayoutBucket extends ChartLinePercentileBucket {
  px: number;
  pyMin: number;
  pyMax: number;
  pyLower: number;
  pyMid: number;
  pyUpper: number;
}

export interface ChartLinePercentileLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  bandColor: string;
  buckets: ChartLinePercentileLayoutBucket[];
  midPath: string;
  bandPath: string;
  minPath: string;
  maxPath: string;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLinePercentileLayoutResult {
  series: ChartLinePercentileLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  totalBuckets: number;
  visibleSeriesCount: number;
  percentiles: readonly [number, number, number];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLinePercentileDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_PERCENTILE_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_PERCENTILE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_PERCENTILE_PALETTE.length
  ]!;
}

/**
 * Returns the sorted (ascending) finite values from the input. Drops
 * non-finite entries and non-array inputs.
 */
export function sortFiniteLinePercentileValues(
  values: readonly number[] | undefined | null,
): number[] {
  if (!Array.isArray(values)) return [];
  const out: number[] = [];
  for (const v of values) if (isFiniteNumber(v)) out.push(v);
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Linearly-interpolated percentile of a sorted ascending array
 * (R type 7).
 *
 *     rank = (percentile / 100) * (n - 1)
 *     lo   = floor(rank); hi = ceil(rank)
 *     out  = sorted[lo] + (rank - lo) * (sorted[hi] - sorted[lo])
 *
 * - Empty input -> `NaN`.
 * - Single sample -> the sample itself.
 * - Percentile clamped to [0, 100].
 */
export function computePercentileFromSorted(
  sorted: readonly number[],
  percentile: number,
): number {
  if (!Array.isArray(sorted) || sorted.length === 0) return Number.NaN;
  const n = sorted.length;
  if (n === 1) return sorted[0]!;
  const p = Math.min(100, Math.max(0, percentile));
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (rank - lo) * (sorted[hi]! - sorted[lo]!);
}

/** Percentile from an unsorted input. Sorts before computing. */
export function computeLinePercentile(
  values: readonly number[] | undefined | null,
  percentile: number,
): number {
  return computePercentileFromSorted(
    sortFiniteLinePercentileValues(values),
    percentile,
  );
}

/**
 * Builds a per-x bucket from a sample group. Drops the bucket entirely
 * (returns `null`) when the x is non-finite or every value is
 * non-finite.
 */
export function buildLinePercentileBucket(
  sample: ChartLinePercentileSample | undefined | null,
  percentiles: readonly [number, number, number],
  index: number,
): ChartLinePercentileBucket | null {
  if (!sample) return null;
  if (!isFiniteNumber(sample.x)) return null;
  const sorted = sortFiniteLinePercentileValues(sample.values);
  if (sorted.length === 0) return null;
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const [pLower, pMid, pUpper] = percentiles;
  return {
    index,
    x: sample.x,
    count: sorted.length,
    min,
    max,
    lower: computePercentileFromSorted(sorted, pLower),
    mid: computePercentileFromSorted(sorted, pMid),
    upper: computePercentileFromSorted(sorted, pUpper),
  };
}

/**
 * Normalises a `[lower, mid, upper]` triple. Defaults applied for each
 * non-finite slot. Inputs outside `[0, 100]` are clamped. The triple is
 * sorted ascending if it arrives out of order.
 */
export function normaliseLinePercentiles(
  percentiles:
    | readonly [number, number, number]
    | undefined
    | null,
): readonly [number, number, number] {
  const [defL, defM, defU] = DEFAULT_CHART_LINE_PERCENTILE_PERCENTILES;
  const arr =
    Array.isArray(percentiles) && percentiles.length === 3
      ? percentiles
      : [defL, defM, defU];
  const clamp = (v: unknown, fallback: number) =>
    isFiniteNumber(v) ? Math.min(100, Math.max(0, v)) : fallback;
  const out: [number, number, number] = [
    clamp(arr[0], defL),
    clamp(arr[1], defM),
    clamp(arr[2], defU),
  ];
  out.sort((a, b) => a - b);
  return out as readonly [number, number, number];
}

export interface ComputeLinePercentileLayoutInput {
  series: readonly ChartLinePercentileSeries[];
  percentiles?: readonly [number, number, number];
  hiddenSeries?: ReadonlySet<string> | null;
  showWhiskers?: boolean;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLinePercentileLayout(
  input: ComputeLinePercentileLayoutInput,
): ComputeLinePercentileLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const pcs = normaliseLinePercentiles(input.percentiles);
  const empty: ComputeLinePercentileLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    innerWidth,
    innerHeight,
    totalBuckets: 0,
    visibleSeriesCount: 0,
    percentiles: pcs,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  if (seriesArr.length === 0) return empty;
  const hidden = input.hiddenSeries ?? null;
  const visible = seriesArr.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return empty;

  const intermediates: {
    s: ChartLinePercentileSeries;
    originalIndex: number;
    buckets: ChartLinePercentileBucket[];
    totalCount: number;
  }[] = [];

  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  const useWhiskers = input.showWhiskers === true;

  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const buckets: ChartLinePercentileBucket[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const b = buildLinePercentileBucket(arr[j]!, pcs, j);
      if (b) buckets.push(b);
    }
    buckets.sort((a, b) => a.x - b.x);
    for (const b of buckets) {
      if (b.x < xMin) xMin = b.x;
      if (b.x > xMax) xMax = b.x;
      const yLo = useWhiskers ? b.min : b.lower;
      const yHi = useWhiskers ? b.max : b.upper;
      if (yLo < yMin) yMin = yLo;
      if (yHi > yMax) yMax = yHi;
      any = true;
    }
    intermediates.push({
      s,
      originalIndex: i,
      buckets,
      totalCount: arr.length,
    });
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

  const layoutSeries: ChartLinePercentileLayoutSeries[] = [];
  let totalBuckets = 0;
  for (const it of intermediates) {
    const color =
      it.s.color ?? getLinePercentileDefaultColor(it.originalIndex);
    const bandColor = it.s.bandColor ?? color;
    const buckets: ChartLinePercentileLayoutBucket[] = it.buckets.map(
      (b) => ({
        ...b,
        px: xToPx(b.x),
        pyMin: yToPx(b.min),
        pyMax: yToPx(b.max),
        pyLower: yToPx(b.lower),
        pyMid: yToPx(b.mid),
        pyUpper: yToPx(b.upper),
      }),
    );
    let midPath = '';
    let minPath = '';
    let maxPath = '';
    if (buckets.length > 0) {
      midPath = `M ${fmt(buckets[0]!.px)} ${fmt(buckets[0]!.pyMid)}`;
      minPath = `M ${fmt(buckets[0]!.px)} ${fmt(buckets[0]!.pyMin)}`;
      maxPath = `M ${fmt(buckets[0]!.px)} ${fmt(buckets[0]!.pyMax)}`;
      for (let i = 1; i < buckets.length; i += 1) {
        const b = buckets[i]!;
        midPath += ` L ${fmt(b.px)} ${fmt(b.pyMid)}`;
        minPath += ` L ${fmt(b.px)} ${fmt(b.pyMin)}`;
        maxPath += ` L ${fmt(b.px)} ${fmt(b.pyMax)}`;
      }
    }
    let bandPath = '';
    if (buckets.length > 0) {
      bandPath = `M ${fmt(buckets[0]!.px)} ${fmt(buckets[0]!.pyUpper)}`;
      for (let i = 1; i < buckets.length; i += 1) {
        bandPath += ` L ${fmt(buckets[i]!.px)} ${fmt(buckets[i]!.pyUpper)}`;
      }
      for (let i = buckets.length - 1; i >= 0; i -= 1) {
        bandPath += ` L ${fmt(buckets[i]!.px)} ${fmt(buckets[i]!.pyLower)}`;
      }
      bandPath += ' Z';
    }
    totalBuckets += buckets.length;
    layoutSeries.push({
      id: it.s.id,
      label: it.s.label,
      index: it.originalIndex,
      color,
      bandColor,
      buckets,
      midPath,
      bandPath,
      minPath,
      maxPath,
      finiteCount: buckets.length,
      totalCount: it.totalCount,
    });
  }

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_PERCENTILE_TICK_COUNT;
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
    totalBuckets,
    visibleSeriesCount: visible.length,
    percentiles: pcs,
  };
}

export function describeLinePercentileChart(
  series: readonly ChartLinePercentileSeries[] | undefined | null,
  percentiles?: readonly [number, number, number],
  hidden?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const pcs = normaliseLinePercentiles(percentiles);
  const fmtV = formatValue ?? ((n: number) => String(n));
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  let any = false;
  let totalBuckets = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const arr = Array.isArray(s.data) ? s.data : [];
    const buckets: ChartLinePercentileBucket[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const b = buildLinePercentileBucket(arr[j]!, pcs, j);
      if (b) buckets.push(b);
    }
    if (buckets.length === 0) continue;
    any = true;
    totalBuckets += buckets.length;
    const midMin = Math.min(...buckets.map((b) => b.mid));
    const midMax = Math.max(...buckets.map((b) => b.mid));
    parts.push(
      `${s.label}: p${pcs[1]} ranges ${fmtV(midMin)} to ${fmtV(midMax)} across ${buckets.length} buckets`,
    );
  }
  if (!any) return 'No data';
  return `Line chart with percentile band p${pcs[0]}-p${pcs[2]} (median p${pcs[1]}) across ${visible.length} series (${totalBuckets} buckets). ${parts.join('; ')}.`;
}

export interface ChartLinePercentileBucketClick {
  series: ChartLinePercentileLayoutSeries;
  bucket: ChartLinePercentileLayoutBucket;
}

export interface ChartLinePercentileSeriesToggle {
  series: ChartLinePercentileSeries;
  hidden: boolean;
}

export interface ChartLinePercentileProps {
  series: readonly ChartLinePercentileSeries[];
  percentiles?: readonly [number, number, number];
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
  whiskerStrokeWidth?: number;
  dotRadius?: number;
  bandOpacity?: number;
  whiskerOpacity?: number;
  whiskerDashArray?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBand?: boolean;
  showWhiskers?: boolean;
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
  onBucketClick?: (info: ChartLinePercentileBucketClick) => void;
  onSeriesToggle?: (info: ChartLinePercentileSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLinePercentile = forwardRef(function ChartLinePercentile(
  {
    series,
    percentiles,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_PERCENTILE_WIDTH,
    height = DEFAULT_CHART_LINE_PERCENTILE_HEIGHT,
    padding = DEFAULT_CHART_LINE_PERCENTILE_PADDING,
    tickCount = DEFAULT_CHART_LINE_PERCENTILE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PERCENTILE_STROKE_WIDTH,
    whiskerStrokeWidth = DEFAULT_CHART_LINE_PERCENTILE_WHISKER_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PERCENTILE_DOT_RADIUS,
    bandOpacity = DEFAULT_CHART_LINE_PERCENTILE_BAND_OPACITY,
    whiskerOpacity = DEFAULT_CHART_LINE_PERCENTILE_WHISKER_OPACITY,
    whiskerDashArray = DEFAULT_CHART_LINE_PERCENTILE_WHISKER_DASH,
    gridColor = DEFAULT_CHART_LINE_PERCENTILE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_PERCENTILE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showBand = true,
    showWhiskers = false,
    showLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with percentile band',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onBucketClick,
    onSeriesToggle,
    style,
  }: ChartLinePercentileProps,
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
      computeLinePercentileLayout({
        series,
        ...(percentiles !== undefined ? { percentiles } : {}),
        hiddenSeries: hidden,
        showWhiskers,
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
      percentiles,
      hidden,
      showWhiskers,
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
    describeLinePercentileChart(series, percentiles, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLinePercentileSeries) => {
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

  const [pLower, pMid, pUpper] = layout.percentiles;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-percentile"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-buckets={layout.totalBuckets}
      data-percentile-lower={pLower}
      data-percentile-mid={pMid}
      data-percentile-upper={pUpper}
      data-show-whiskers={showWhiskers ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-percentile-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-percentile-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-percentile-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-percentile-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-percentile-grid-line"
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
                  data-section="chart-line-percentile-grid-line"
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
            <g data-section="chart-line-percentile-axes">
              <line
                data-section="chart-line-percentile-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-percentile-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-percentile-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-percentile-tick"
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
                        data-section="chart-line-percentile-tick-label"
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
                <g data-section="chart-line-percentile-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-percentile-tick"
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
                        data-section="chart-line-percentile-tick-label"
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
                  data-section="chart-line-percentile-x-label"
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
                  data-section="chart-line-percentile-y-label"
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

          <g data-section="chart-line-percentile-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : 1;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-percentile-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-band-color={s.bandColor}
                  data-series-bucket-count={s.buckets.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {showBand && s.bandPath ? (
                    <path
                      data-section="chart-line-percentile-band"
                      data-series-id={s.id}
                      data-percentile-lower={pLower}
                      data-percentile-upper={pUpper}
                      role="graphics-symbol"
                      aria-label={`${s.label}: p${pLower}-p${pUpper} band over ${s.buckets.length} buckets`}
                      d={s.bandPath}
                      fill={s.bandColor}
                      fillOpacity={bandOpacity * dim}
                      stroke="none"
                    />
                  ) : null}
                  {showWhiskers && s.maxPath ? (
                    <path
                      data-section="chart-line-percentile-whisker"
                      data-series-id={s.id}
                      data-whisker="max"
                      role="graphics-symbol"
                      aria-label={`${s.label}: max whisker`}
                      d={s.maxPath}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={whiskerOpacity * dim}
                      strokeWidth={whiskerStrokeWidth}
                      strokeDasharray={whiskerDashArray}
                    />
                  ) : null}
                  {showWhiskers && s.minPath ? (
                    <path
                      data-section="chart-line-percentile-whisker"
                      data-series-id={s.id}
                      data-whisker="min"
                      role="graphics-symbol"
                      aria-label={`${s.label}: min whisker`}
                      d={s.minPath}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={whiskerOpacity * dim}
                      strokeWidth={whiskerStrokeWidth}
                      strokeDasharray={whiskerDashArray}
                    />
                  ) : null}
                  <path
                    data-section="chart-line-percentile-mid"
                    data-series-id={s.id}
                    data-percentile-mid={pMid}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: p${pMid} median line over ${s.buckets.length} buckets`}
                    d={s.midPath}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={dim}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots
                    ? s.buckets.map((b) => {
                        const key = `${s.id}::${b.index}`;
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const aria = `${s.label}: x=${fmtX(b.x)}, p${pMid}=${fmtValue(b.mid)}, p${pLower}=${fmtValue(b.lower)}, p${pUpper}=${fmtValue(b.upper)}, n=${b.count}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-percentile-dot"
                            data-series-id={s.id}
                            data-bucket-index={b.index}
                            data-x={b.x}
                            data-mid={b.mid}
                            data-lower={b.lower}
                            data-upper={b.upper}
                            data-min={b.min}
                            data-max={b.max}
                            data-count={b.count}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={b.px}
                            cy={b.pyMid}
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
                              if (onBucketClick) {
                                onBucketClick({
                                  series: s,
                                  bucket: b,
                                });
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
          const b = s.buckets.find((x) => x.index === idx);
          if (!b) return null;
          const tx = Math.min(Math.max(b.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(b.pyMid - 76, 0), height - 110);
          return (
            <div
              data-section="chart-line-percentile-tooltip"
              data-series-id={s.id}
              data-bucket-index={b.index}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-percentile-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-percentile-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(b.x)} (n={b.count})
              </div>
              <div
                data-section="chart-line-percentile-tooltip-mid"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                p{pMid}: {fmtValue(b.mid)}
              </div>
              <div
                data-section="chart-line-percentile-tooltip-lower"
                className="text-slate-500"
              >
                p{pLower}: {fmtValue(b.lower)}
              </div>
              <div
                data-section="chart-line-percentile-tooltip-upper"
                className="text-slate-500"
              >
                p{pUpper}: {fmtValue(b.upper)}
              </div>
              {showWhiskers ? (
                <div
                  data-section="chart-line-percentile-tooltip-range"
                  className="text-slate-400"
                >
                  min/max: {fmtValue(b.min)} / {fmtValue(b.max)}
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-percentile-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-percentile-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-percentile-legend-button"
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
                    data-section="chart-line-percentile-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLinePercentileDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-percentile-legend-label">
                    {s.label}
                  </span>
                  <span
                    data-section="chart-line-percentile-legend-stats"
                    className="text-slate-500"
                  >
                    (p{pLower}-p{pMid}-p{pUpper})
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

ChartLinePercentile.displayName = 'ChartLinePercentile';
