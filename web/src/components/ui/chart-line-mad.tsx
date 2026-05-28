import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MAD_WIDTH = 560;
export const DEFAULT_CHART_LINE_MAD_HEIGHT = 320;
export const DEFAULT_CHART_LINE_MAD_PADDING = 40;
export const DEFAULT_CHART_LINE_MAD_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MAD_RAW_STROKE_WIDTH = 1;
export const DEFAULT_CHART_LINE_MAD_MEDIAN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MAD_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MAD_WINDOW = 20;
export const DEFAULT_CHART_LINE_MAD_MULTIPLIER = 3;
export const DEFAULT_CHART_LINE_MAD_SCALE = 1.4826;
export const DEFAULT_CHART_LINE_MAD_RAW_OPACITY = 0.4;
export const DEFAULT_CHART_LINE_MAD_BAND_OPACITY = 0.15;
export const DEFAULT_CHART_LINE_MAD_PALETTE = [
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
export const DEFAULT_CHART_LINE_MAD_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MAD_OUTLIER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MAD_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MAD_AXIS_COLOR = '#cbd5e1';

export type ChartLineMadOutlier = 'above' | 'below' | 'within';

export interface ChartLineMadPoint {
  x: number;
  y: number;
}

export interface ChartLineMadSeries {
  id: string;
  label: string;
  data: readonly ChartLineMadPoint[];
  color?: string;
  window?: number;
  multiplier?: number;
}

export interface ChartLineMadRollingStat {
  median: number;
  mad: number;
  windowSize: number;
}

export interface ChartLineMadSample {
  index: number;
  x: number;
  raw: number;
  median: number;
  mad: number;
  scaledMad: number;
  upper: number;
  lower: number;
  outlier: ChartLineMadOutlier;
  windowSize: number;
}

export interface ChartLineMadLayoutPoint extends ChartLineMadSample {
  px: number;
  rawPy: number;
  medianPy: number;
  upperPy: number;
  lowerPy: number;
}

export interface ChartLineMadLayoutSeries {
  id: string;
  label: string;
  color: string;
  window: number;
  multiplier: number;
  madScale: number;
  points: ChartLineMadLayoutPoint[];
  rawPath: string;
  medianPath: string;
  bandFillPath: string;
  upperPath: string;
  lowerPath: string;
  outliers: ChartLineMadLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  outlierCount: number;
  aboveCount: number;
  belowCount: number;
  finalMedian: number;
  finalScaledMad: number;
  maxScaledMad: number;
}

export interface ChartLineMadLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  series: ChartLineMadLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineMadLayoutOptions {
  series: readonly ChartLineMadSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  window?: number;
  multiplier?: number;
  madScale?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineMadProps {
  series: readonly ChartLineMadSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  window?: number;
  multiplier?: number;
  madScale?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  rawStrokeWidth?: number;
  medianStrokeWidth?: number;
  dotRadius?: number;
  rawOpacity?: number;
  bandOpacity?: number;
  rawColor?: string;
  outlierColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showRaw?: boolean;
  showMedian?: boolean;
  showBand?: boolean;
  showOutliers?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatCoefficient?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineMadLayoutSeries;
    point: ChartLineMadLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineMadSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineMadDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_MAD_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineMadFinitePoints(
  points: readonly ChartLineMadPoint[] | null | undefined,
): ChartLineMadPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineMadPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Clamp the rolling window length to an integer >= 2. Non-finite ->
 * default 20.
 */
export function normaliseLineMadWindow(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_MAD_WINDOW;
  const v = Math.floor(value);
  if (v < 2) return 2;
  return v;
}

/**
 * Clamp the band-width multiplier `k` to >= 0. Non-finite -> default 3
 * (the canonical Hampel-style robust threshold).
 */
export function normaliseLineMadMultiplier(value: unknown): number {
  if (!isFiniteNumber(value)) return DEFAULT_CHART_LINE_MAD_MULTIPLIER;
  if (value < 0) return 0;
  return value;
}

/**
 * Clamp the MAD-to-sigma scale factor to > 0. Non-finite or
 * non-positive -> default 1.4826 (the Gaussian-consistency constant
 * that makes `scale * MAD` an unbiased sigma estimator for normal
 * data).
 */
export function normaliseLineMadScale(value: unknown): number {
  if (!isFiniteNumber(value) || value <= 0) {
    return DEFAULT_CHART_LINE_MAD_SCALE;
  }
  return value;
}

/**
 * Median of a set of values. Non-finite values are dropped. Returns
 * NaN for an empty (or all-non-finite) input.
 */
export function computeLineMadMedian(
  values: readonly number[] | null | undefined,
): number {
  if (!Array.isArray(values)) return NaN;
  const finite = values.filter((v): v is number => isFiniteNumber(v));
  if (finite.length === 0) return NaN;
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Median Absolute Deviation: `median(|v - median(values)|)`.
 *
 * MAD is a **robust** measure of spread with a 50% breakdown point --
 * up to half the data can be arbitrarily corrupted without changing
 * it. A lone outlier inside the window does not inflate the MAD,
 * unlike the standard deviation. An optional pre-computed
 * `centerMedian` may be supplied. Returns NaN for an empty input.
 */
export function computeLineMadDeviation(
  values: readonly number[] | null | undefined,
  centerMedian?: number,
): number {
  if (!Array.isArray(values)) return NaN;
  const finite = values.filter((v): v is number => isFiniteNumber(v));
  if (finite.length === 0) return NaN;
  const med = isFiniteNumber(centerMedian)
    ? centerMedian
    : computeLineMadMedian(finite);
  if (!isFiniteNumber(med)) return NaN;
  const absDevs = finite.map((v) => Math.abs(v - med));
  return computeLineMadMedian(absDevs);
}

export function classifyLineMadOutlier(
  value: number,
  lower: number,
  upper: number,
): ChartLineMadOutlier {
  if (
    !isFiniteNumber(value) ||
    !isFiniteNumber(lower) ||
    !isFiniteNumber(upper)
  ) {
    return 'within';
  }
  if (value > upper) return 'above';
  if (value < lower) return 'below';
  return 'within';
}

/**
 * Rolling median and MAD over a trailing window.
 *
 * For index `t` the window is the trailing slice
 * `values[max(0, t - W + 1) .. t]` -- it expands from a single point
 * until it reaches the full window length `W`. Each entry carries the
 * window median, the window MAD, and the actual window size.
 *
 * Non-finite values are dropped; the output array matches the
 * finite-only length.
 */
export function computeRollingMad(
  values: readonly number[] | null | undefined,
  window: number,
): ChartLineMadRollingStat[] {
  if (!Array.isArray(values)) return [];
  const finite = values.filter((v): v is number => isFiniteNumber(v));
  const N = finite.length;
  if (N === 0) return [];
  const W = normaliseLineMadWindow(window);
  const out: ChartLineMadRollingStat[] = [];
  for (let t = 0; t < N; t += 1) {
    const start = Math.max(0, t - W + 1);
    const windowVals = finite.slice(start, t + 1);
    const median = computeLineMadMedian(windowVals);
    const mad = computeLineMadDeviation(windowVals, median);
    out.push({
      median: isFiniteNumber(median) ? median : finite[t]!,
      mad: isFiniteNumber(mad) ? mad : 0,
      windowSize: windowVals.length,
    });
  }
  return out;
}

export interface RunLineMadOptions {
  window?: number;
  multiplier?: number;
  madScale?: number;
}

export function runLineMad(
  points: readonly ChartLineMadPoint[] | null | undefined,
  options?: RunLineMadOptions,
): {
  samples: ChartLineMadSample[];
  window: number;
  multiplier: number;
  madScale: number;
  outlierCount: number;
  aboveCount: number;
  belowCount: number;
  finalMedian: number;
  finalScaledMad: number;
  maxScaledMad: number;
  totalSamples: number;
} {
  const window = normaliseLineMadWindow(options?.window);
  const multiplier = normaliseLineMadMultiplier(options?.multiplier);
  const madScale = normaliseLineMadScale(options?.madScale);
  const finite = getLineMadFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const ys = sorted.map((p) => p.y);
  const roll = computeRollingMad(ys, window);

  let outlierCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let maxScaledMad = 0;

  const samples: ChartLineMadSample[] = sorted.map((p, i) => {
    const stat = roll[i] ?? { median: p.y, mad: 0, windowSize: 1 };
    const scaledMad = stat.mad * madScale;
    const upper = stat.median + multiplier * scaledMad;
    const lower = stat.median - multiplier * scaledMad;
    const outlier = classifyLineMadOutlier(p.y, lower, upper);
    if (scaledMad > maxScaledMad) maxScaledMad = scaledMad;
    if (outlier === 'above') {
      outlierCount += 1;
      aboveCount += 1;
    } else if (outlier === 'below') {
      outlierCount += 1;
      belowCount += 1;
    }
    return {
      index: i,
      x: p.x,
      raw: p.y,
      median: stat.median,
      mad: stat.mad,
      scaledMad,
      upper,
      lower,
      outlier,
      windowSize: stat.windowSize,
    };
  });

  const last = samples[samples.length - 1];

  return {
    samples,
    window,
    multiplier,
    madScale,
    outlierCount,
    aboveCount,
    belowCount,
    finalMedian: last ? last.median : 0,
    finalScaledMad: last ? last.scaledMad : 0,
    maxScaledMad,
    totalSamples: sorted.length,
  };
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const cmd = i === 0 ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function buildBandFillPath(
  points: readonly { px: number; upperPy: number; lowerPy: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const cmd = i === 0 ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.upperPy.toFixed(3)}`);
  }
  for (let i = points.length - 1; i >= 0; i -= 1) {
    const p = points[i]!;
    parts.push(`L ${p.px.toFixed(3)} ${p.lowerPy.toFixed(3)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineMadLayout(
  options: ComputeLineMadLayoutOptions,
): ChartLineMadLayout {
  const {
    series = [],
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_MAD_TICK_COUNT,
    window,
    multiplier,
    madScale,
    defaultColors = DEFAULT_CHART_LINE_MAD_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineMadLayout = {
    ok: false,
    width,
    height,
    panel: { x: padding, y: padding, width: innerWidth, height: innerHeight },
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    series: [],
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const runBySeries = new Map<string, ReturnType<typeof runLineMad>>();

  for (const s of visible) {
    const run = runLineMad(s.data, {
      window: s.window ?? window,
      multiplier: s.multiplier ?? multiplier,
      ...(isFiniteNumber(madScale) ? { madScale } : {}),
    });
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    for (const sample of run.samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      if (sample.raw < yLo) yLo = sample.raw;
      if (sample.raw > yHi) yHi = sample.raw;
      if (sample.upper > yHi) yHi = sample.upper;
      if (sample.lower < yLo) yLo = sample.lower;
      if (sample.median < yLo) yLo = sample.median;
      if (sample.median > yHi) yHi = sample.median;
    }
  }

  if (totalPoints === 0) return empty;

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (isFiniteNumber(yMinOverride)) yLo = yMinOverride;
  if (isFiniteNumber(yMaxOverride)) yHi = yMaxOverride;

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (y: number): number =>
    panel.y + panel.height - ((y - yLo) / yRange) * panel.height;

  const layoutSeries: ChartLineMadLayoutSeries[] = visible.map((s, idx) => {
    const run = runBySeries.get(s.id)!;
    const color =
      s.color ??
      defaultColors[idx % defaultColors.length] ??
      DEFAULT_CHART_LINE_MAD_PALETTE[0]!;

    const points: ChartLineMadLayoutPoint[] = run.samples.map((sample) => ({
      ...sample,
      px: projectX(sample.x),
      rawPy: projectY(sample.raw),
      medianPy: projectY(sample.median),
      upperPy: projectY(sample.upper),
      lowerPy: projectY(sample.lower),
    }));

    const rawPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.rawPy })),
    );
    const medianPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.medianPy })),
    );
    const upperPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.upperPy })),
    );
    const lowerPath = buildPath(
      points.map((p) => ({ px: p.px, py: p.lowerPy })),
    );
    const bandFillPath = buildBandFillPath(
      points.map((p) => ({
        px: p.px,
        upperPy: p.upperPy,
        lowerPy: p.lowerPy,
      })),
    );
    const outliers = points.filter((p) => p.outlier !== 'within');

    return {
      id: s.id,
      label: s.label,
      color,
      window: run.window,
      multiplier: run.multiplier,
      madScale: run.madScale,
      points,
      rawPath,
      medianPath,
      bandFillPath,
      upperPath,
      lowerPath,
      outliers,
      finiteCount: run.samples.length,
      totalCount: s.data?.length ?? 0,
      outlierCount: run.outlierCount,
      aboveCount: run.aboveCount,
      belowCount: run.belowCount,
      finalMedian: run.finalMedian,
      finalScaledMad: run.finalScaledMad,
      maxScaledMad: run.maxScaledMad,
    };
  });

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    series: layoutSeries,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

function defaultFormatCoefficient(n: number): string {
  if (!isFiniteNumber(n)) return '';
  return n.toFixed(2);
}

export function describeLineMadChart(
  series: readonly ChartLineMadSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    window?: number;
    multiplier?: number;
    madScale?: number;
    formatCoefficient?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmt = options?.formatCoefficient ?? defaultFormatCoefficient;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const run = runLineMad(s.data, {
      window: s.window ?? options?.window,
      multiplier: s.multiplier ?? options?.multiplier,
      ...(isFiniteNumber(options?.madScale)
        ? { madScale: options!.madScale }
        : {}),
    });
    totalPoints += run.samples.length;
    summaries.push(
      `${s.label}: window ${run.window}, ${fmt(run.multiplier)} scaled-MAD band, ${run.outlierCount} robust outliers`,
    );
  }
  return `Line chart with a rolling Median Absolute Deviation band across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineMad = forwardRef<HTMLDivElement, ChartLineMadProps>(
  function ChartLineMad(
    props: ChartLineMadProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      series,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      window = DEFAULT_CHART_LINE_MAD_WINDOW,
      multiplier = DEFAULT_CHART_LINE_MAD_MULTIPLIER,
      madScale = DEFAULT_CHART_LINE_MAD_SCALE,
      width = DEFAULT_CHART_LINE_MAD_WIDTH,
      height = DEFAULT_CHART_LINE_MAD_HEIGHT,
      padding = DEFAULT_CHART_LINE_MAD_PADDING,
      tickCount = DEFAULT_CHART_LINE_MAD_TICK_COUNT,
      rawStrokeWidth = DEFAULT_CHART_LINE_MAD_RAW_STROKE_WIDTH,
      medianStrokeWidth = DEFAULT_CHART_LINE_MAD_MEDIAN_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_MAD_DOT_RADIUS,
      rawOpacity = DEFAULT_CHART_LINE_MAD_RAW_OPACITY,
      bandOpacity = DEFAULT_CHART_LINE_MAD_BAND_OPACITY,
      rawColor = DEFAULT_CHART_LINE_MAD_RAW_COLOR,
      outlierColor = DEFAULT_CHART_LINE_MAD_OUTLIER_COLOR,
      gridColor = DEFAULT_CHART_LINE_MAD_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_MAD_AXIS_COLOR,
      xMin,
      xMax,
      yMin,
      yMax,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showLegend = true,
      showTooltip = true,
      showConfigBadge = true,
      showRaw = true,
      showMedian = true,
      showBand = true,
      showOutliers = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a rolling Median Absolute Deviation band',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      formatCoefficient = defaultFormatCoefficient,
      xLabel,
      yLabel,
      onPointClick,
      onSeriesToggle,
      style,
    } = props;

    const reactId = useId();
    const descId = `${reactId}-desc`;

    const isControlled = controlledHidden !== undefined;
    const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
      normaliseHidden(defaultHiddenSeries),
    );
    const hiddenSet = isControlled
      ? normaliseHidden(controlledHidden)
      : uncontrolled;

    const layout = useMemo(
      () =>
        computeLineMadLayout({
          series,
          hiddenSeries: hiddenSet,
          width,
          height,
          padding,
          tickCount,
          window,
          multiplier,
          madScale,
          ...(isFiniteNumber(xMin) ? { xMin } : {}),
          ...(isFiniteNumber(xMax) ? { xMax } : {}),
          ...(isFiniteNumber(yMin) ? { yMin } : {}),
          ...(isFiniteNumber(yMax) ? { yMax } : {}),
        }),
      [
        series,
        hiddenSet,
        width,
        height,
        padding,
        tickCount,
        window,
        multiplier,
        madScale,
        xMin,
        xMax,
        yMin,
        yMax,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineMadChart(series, {
          hidden: hiddenSet,
          window,
          multiplier,
          madScale,
          formatCoefficient,
        }),
      [
        ariaDescription,
        series,
        hiddenSet,
        window,
        multiplier,
        madScale,
        formatCoefficient,
      ],
    );

    const [hoverPayload, setHoverPayload] = useState<{
      seriesId: string;
      pointIndex: number;
    } | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{
      px: number;
      py: number;
    } | null>(null);

    const clearHover = useCallback(() => {
      setHoverPayload(null);
      setTooltipPos(null);
    }, []);

    const handleToggle = useCallback(
      (s: ChartLineMadSeries) => {
        const next = new Set(hiddenSet);
        const willHide = !next.has(s.id);
        if (willHide) next.add(s.id);
        else next.delete(s.id);
        if (!isControlled) setUncontrolled(next);
        onHiddenSeriesChange?.(next);
        onSeriesToggle?.({ series: s, hidden: willHide });
      },
      [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
    );

    const allTotalPoints = useMemo(
      () =>
        series.reduce(
          (acc, s) => acc + getLineMadFinitePoints(s.data).length,
          0,
        ),
      [series],
    );

    const totalOutliers = useMemo(
      () => layout.series.reduce((acc, s) => acc + s.outlierCount, 0),
      [layout.series],
    );

    const dominantConfig = useMemo<{
      window: number;
      multiplier: number;
      madScale: number;
      seriesId: string;
    }>(() => {
      if (layout.series.length === 0) {
        return {
          window: normaliseLineMadWindow(window),
          multiplier: normaliseLineMadMultiplier(multiplier),
          madScale: normaliseLineMadScale(madScale),
          seriesId: '',
        };
      }
      const s = layout.series[0]!;
      return {
        window: s.window,
        multiplier: s.multiplier,
        madScale: s.madScale,
        seriesId: s.id,
      };
    }, [layout.series, window, multiplier, madScale]);

    const containerStyle: CSSProperties = {
      width,
      height,
      position: 'relative',
      ...(style ?? {}),
    };

    if (!layout.ok) {
      return (
        <div
          ref={ref}
          role="region"
          aria-label={ariaLabel}
          aria-describedby={descId}
          className={className}
          style={containerStyle}
          data-section="chart-line-mad"
          data-empty="true"
          data-series-count={series.length}
          data-visible-series-count={0}
          data-total-points={0}
          data-total-outliers={0}
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-mad-aria-desc"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              overflow: 'hidden',
              clip: 'rect(0 0 0 0)',
              clipPath: 'inset(50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={[className, animateClass].filter(Boolean).join(' ') || undefined}
        style={containerStyle}
        data-section="chart-line-mad"
        data-empty="false"
        data-series-count={series.length}
        data-visible-series-count={layout.visibleSeriesCount}
        data-total-points={layout.totalPoints}
        data-total-outliers={totalOutliers}
        data-window={dominantConfig.window}
        data-multiplier={dominantConfig.multiplier}
        data-mad-scale={dominantConfig.madScale}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-mad-aria-desc"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-mad-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-mad-badge"
              data-window={dominantConfig.window}
              data-multiplier={dominantConfig.multiplier}
              data-mad-scale={dominantConfig.madScale}
              data-outlier-count={totalOutliers}
              data-series-id={dominantConfig.seriesId}
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#ffffffd9',
                color: layout.series[0]?.color ?? '#0f172a',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                data-section="chart-line-mad-badge-icon"
                aria-hidden="true"
              >
                MAD
              </span>
              <span data-section="chart-line-mad-badge-window">
                W={dominantConfig.window}
              </span>
              <span data-section="chart-line-mad-badge-multiplier">
                k={formatCoefficient(dominantConfig.multiplier)}
              </span>
              <span data-section="chart-line-mad-badge-scale">
                c={formatCoefficient(dominantConfig.madScale)}
              </span>
              <span data-section="chart-line-mad-badge-outliers">
                out={totalOutliers}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-mad-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-mad-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <line
                      key={`gy-${i}`}
                      data-section="chart-line-mad-grid-line"
                      data-axis="y"
                      x1={layout.panel.x}
                      x2={layout.panel.x + layout.panel.width}
                      y1={py}
                      y2={py}
                    />
                  );
                })}
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <line
                      key={`gx-${i}`}
                      data-section="chart-line-mad-grid-line"
                      data-axis="x"
                      x1={px}
                      x2={px}
                      y1={layout.panel.y}
                      y2={layout.panel.y + layout.panel.height}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-mad-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                <line
                  data-section="chart-line-mad-axis"
                  data-axis="x"
                  x1={layout.panel.x}
                  y1={layout.panel.y + layout.panel.height}
                  x2={layout.panel.x + layout.panel.width}
                  y2={layout.panel.y + layout.panel.height}
                />
                <line
                  data-section="chart-line-mad-axis"
                  data-axis="y"
                  x1={layout.panel.x}
                  y1={layout.panel.y}
                  x2={layout.panel.x}
                  y2={layout.panel.y + layout.panel.height}
                />
                <g data-section="chart-line-mad-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => {
                    const px =
                      layout.panel.x +
                      ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                        layout.panel.width;
                    return (
                      <g
                        key={`tx-${i}`}
                        data-section="chart-line-mad-tick"
                        data-axis="x"
                      >
                        <line
                          x1={px}
                          x2={px}
                          y1={layout.panel.y + layout.panel.height}
                          y2={layout.panel.y + layout.panel.height + 4}
                        />
                        <text
                          data-section="chart-line-mad-tick-label"
                          data-axis="x"
                          x={px}
                          y={layout.panel.y + layout.panel.height + 14}
                          textAnchor="middle"
                          fontSize={10}
                          fill={axisColor}
                          stroke="none"
                        >
                          {formatX(t)}
                        </text>
                      </g>
                    );
                  })}
                </g>
                <g data-section="chart-line-mad-ticks" data-axis="y">
                  {layout.yTicks.map((t, i) => {
                    const py =
                      layout.panel.y +
                      layout.panel.height -
                      ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                        layout.panel.height;
                    return (
                      <g
                        key={`ty-${i}`}
                        data-section="chart-line-mad-tick"
                        data-axis="y"
                      >
                        <line
                          x1={layout.panel.x - 4}
                          x2={layout.panel.x}
                          y1={py}
                          y2={py}
                        />
                        <text
                          data-section="chart-line-mad-tick-label"
                          data-axis="y"
                          x={layout.panel.x - 6}
                          y={py + 3}
                          textAnchor="end"
                          fontSize={10}
                          fill={axisColor}
                          stroke="none"
                        >
                          {formatValue(t)}
                        </text>
                      </g>
                    );
                  })}
                </g>
                {xLabel ? (
                  <text
                    data-section="chart-line-mad-x-label"
                    x={layout.panel.x + layout.panel.width / 2}
                    y={height - 4}
                    textAnchor="middle"
                    fontSize={11}
                    fill={axisColor}
                    stroke="none"
                  >
                    {xLabel}
                  </text>
                ) : null}
                {yLabel ? (
                  <text
                    data-section="chart-line-mad-y-label"
                    transform={`rotate(-90 12 ${layout.panel.y + layout.panel.height / 2})`}
                    x={12}
                    y={layout.panel.y + layout.panel.height / 2}
                    textAnchor="middle"
                    fontSize={11}
                    fill={axisColor}
                    stroke="none"
                  >
                    {yLabel}
                  </text>
                ) : null}
              </g>
            ) : null}

            <g data-section="chart-line-mad-series">
              {layout.series.map((s) => (
                <g
                  key={s.id}
                  data-section="chart-line-mad-series-group"
                  data-series-id={s.id}
                  data-series-color={s.color}
                  data-series-window={s.window}
                  data-series-multiplier={s.multiplier}
                  data-series-mad-scale={s.madScale}
                  data-series-final-median={s.finalMedian}
                  data-series-final-scaled-mad={s.finalScaledMad}
                  data-series-max-scaled-mad={s.maxScaledMad}
                  data-series-outlier-count={s.outlierCount}
                  data-series-above-count={s.aboveCount}
                  data-series-below-count={s.belowCount}
                  data-series-finite-count={s.finiteCount}
                >
                  {showBand && s.bandFillPath ? (
                    <g
                      data-section="chart-line-mad-band"
                      data-series-id={s.id}
                    >
                      <path
                        data-section="chart-line-mad-band-fill"
                        data-series-id={s.id}
                        d={s.bandFillPath}
                        fill={s.color}
                        fillOpacity={bandOpacity}
                        stroke="none"
                        pointerEvents="none"
                      />
                      <path
                        data-section="chart-line-mad-band-upper-path"
                        data-series-id={s.id}
                        data-kind="upper"
                        d={s.upperPath}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={1}
                        strokeOpacity={0.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                      <path
                        data-section="chart-line-mad-band-lower-path"
                        data-series-id={s.id}
                        data-kind="lower"
                        d={s.lowerPath}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={1}
                        strokeOpacity={0.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        pointerEvents="none"
                      />
                    </g>
                  ) : null}
                  {showRaw && s.rawPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} raw observations`}
                      data-section="chart-line-mad-raw-path"
                      data-series-id={s.id}
                      data-kind="raw"
                      d={s.rawPath}
                      fill="none"
                      stroke={rawColor}
                      strokeWidth={rawStrokeWidth}
                      strokeOpacity={rawOpacity}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showMedian && s.medianPath ? (
                    <path
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label} rolling median (window ${s.window})`}
                      data-section="chart-line-mad-median-path"
                      data-series-id={s.id}
                      data-kind="median"
                      d={s.medianPath}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={medianStrokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showOutliers
                    ? s.outliers.map((p) => (
                        <path
                          key={`o-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} robust outlier at x ${formatX(p.x)} (${p.outlier})`}
                          data-section="chart-line-mad-outlier-marker"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-outlier={p.outlier}
                          d={`M ${p.px} ${p.rawPy - dotRadius - 2} L ${p.px + dotRadius + 2} ${p.rawPy} L ${p.px} ${p.rawPy + dotRadius + 2} L ${p.px - dotRadius - 2} ${p.rawPy} Z`}
                          fill={outlierColor}
                          stroke="#ffffff"
                          strokeWidth={1}
                        />
                      ))
                    : null}
                  {showDots
                    ? s.points.map((p) => {
                        const isHover =
                          hoverPayload?.seriesId === s.id &&
                          hoverPayload?.pointIndex === p.index;
                        return (
                          <circle
                            key={`d-${p.index}`}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}; raw ${formatValue(p.raw)}; rolling median ${formatValue(p.median)}; scaled MAD ${formatValue(p.scaledMad)}`}
                            data-section="chart-line-mad-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-raw={p.raw}
                            data-median={p.median}
                            data-mad={p.mad}
                            data-scaled-mad={p.scaledMad}
                            data-upper={p.upper}
                            data-lower={p.lower}
                            data-outlier={p.outlier}
                            data-hovered={isHover ? 'true' : 'false'}
                            cx={p.px}
                            cy={p.rawPy}
                            r={isHover ? dotRadius + 1 : dotRadius}
                            fill={s.color}
                            stroke="#ffffff"
                            strokeWidth={1}
                            onMouseEnter={() => {
                              setHoverPayload({
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.rawPy });
                            }}
                            onMouseLeave={clearHover}
                            onFocus={() => {
                              setHoverPayload({
                                seriesId: s.id,
                                pointIndex: p.index,
                              });
                              setTooltipPos({ px: p.px, py: p.rawPy });
                            }}
                            onBlur={clearHover}
                            onClick={() =>
                              onPointClick?.({ series: s, point: p })
                            }
                          />
                        );
                      })
                    : null}
                </g>
              ))}
            </g>
          </svg>

          {showTooltip && hoverPayload && tooltipPos
            ? (() => {
                const s = layout.series.find(
                  (x) => x.id === hoverPayload.seriesId,
                );
                if (!s) return null;
                const p = s.points.find(
                  (x) => x.index === hoverPayload.pointIndex,
                );
                if (!p) return null;
                return (
                  <div
                    data-section="chart-line-mad-tooltip"
                    data-series-id={s.id}
                    data-point-index={p.index}
                    style={{
                      position: 'absolute',
                      left: tooltipPos.px + 8,
                      top: tooltipPos.py + 8,
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '6px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      pointerEvents: 'none',
                      minWidth: 190,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div
                      data-section="chart-line-mad-tooltip-label"
                      style={{ color: s.color, fontWeight: 600 }}
                    >
                      {s.label}
                    </div>
                    <div data-section="chart-line-mad-tooltip-x">
                      x: {formatX(p.x)}
                    </div>
                    <div data-section="chart-line-mad-tooltip-raw">
                      raw: {formatValue(p.raw)}
                    </div>
                    <div
                      data-section="chart-line-mad-tooltip-median"
                      style={{ fontWeight: 600 }}
                    >
                      rolling median: {formatValue(p.median)}
                    </div>
                    <div data-section="chart-line-mad-tooltip-mad">
                      scaled MAD: {formatValue(p.scaledMad)}
                    </div>
                    <div data-section="chart-line-mad-tooltip-band">
                      band: [{formatValue(p.lower)}, {formatValue(p.upper)}]
                    </div>
                    {p.outlier !== 'within' ? (
                      <div
                        data-section="chart-line-mad-tooltip-outlier"
                        style={{ color: outlierColor, fontWeight: 600 }}
                      >
                        robust outlier ({p.outlier})
                      </div>
                    ) : null}
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-mad-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            {series.map((s) => {
              const isHidden = hiddenSet.has(s.id);
              const layoutMatch = layout.series.find((x) => x.id === s.id);
              const swatchColor =
                s.color ??
                layoutMatch?.color ??
                DEFAULT_CHART_LINE_MAD_PALETTE[0]!;
              return (
                <button
                  key={s.id}
                  type="button"
                  data-section="chart-line-mad-legend-item"
                  data-series-id={s.id}
                  data-hidden={isHidden ? 'true' : 'false'}
                  onClick={() => handleToggle(s)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    opacity: isHidden ? 0.5 : 1,
                  }}
                >
                  <span
                    data-section="chart-line-mad-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: swatchColor,
                    }}
                  />
                  <span data-section="chart-line-mad-legend-label">
                    {s.label}
                  </span>
                  {layoutMatch ? (
                    <span
                      data-section="chart-line-mad-legend-stats"
                      style={{ fontSize: 10, color: '#64748b' }}
                    >
                      (W={layoutMatch.window};{' '}
                      out {layoutMatch.outlierCount})
                    </span>
                  ) : null}
                </button>
              );
            })}
            <span
              data-section="chart-line-mad-legend-total-points"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {allTotalPoints} total points
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineMad.displayName = 'ChartLineMad';
