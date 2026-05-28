import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type SVGProps,
} from 'react';

/**
 * ChartLineRecombiningBb -- pure-SVG single-panel chart with the close
 * overlaid by a "recombining" Bollinger Band envelope. Each bar
 * computes a standard band of `mean +/- sigmaScale * stdDev`, but the
 * upper/lower lines **collapse to the mean** on bars where the close
 * touches or breaches the band, signalling a recombine trigger:
 *
 *   mean[i]      = SMA(close, length)[i]
 *   stdDev[i]    = sqrt(sum((close - mean)^2) / length)   (population)
 *   fullUpper[i] = mean[i] + sigmaScale * stdDev[i]
 *   fullLower[i] = mean[i] - sigmaScale * stdDev[i]
 *   recombine[i] = close[i] >= fullUpper[i] || close[i] <= fullLower[i]
 *   upper[i]     = recombine[i] ? mean[i] : fullUpper[i]
 *   lower[i]     = recombine[i] ? mean[i] : fullLower[i]
 *
 * Defaults: `length = 20`, `sigmaScale = 2`. Bars before
 * `i = length - 1` are warmup nulls. The recombine markers anchor on
 * the mean (where the bands collapse).
 *
 * Bit-exact anchor: **CONST close** (`close = K`): `mean = K`,
 * `stdDev = 0`, both `fullUpper` and `fullLower` collapse to `K`, and
 * `close == fullUpper` -> recombine fires every valid bar. All four
 * series (mean, upper, lower) read exactly `K`. Verified across
 * `K in {0, 1, 5, 100, -3}` and `length in {3, 5, 7, 10}` in the
 * integration sweep.
 *
 * Additional structural anchor: **ALTERNATING close [0, 1, 0, 1, ...]**
 * with `length = 4` and `sigmaScale = 2`: at bar `i = 3` the SMA is
 * `0.5`, the population stdDev is `0.5`, and the dyadic arithmetic is
 * exact in IEEE 754 -- `fullUpper = 1.5`, `fullLower = -0.5`. Neither
 * `0` nor `1` touches the band so `recombine = false` and the
 * displayed envelope is the full band (bit-exact dyadics).
 */

export interface ChartLineRecombiningBbPoint {
  x: number;
  close: number;
}

export type ChartLineRecombiningBbZone =
  | 'recombine'
  | 'above-mid'
  | 'below-mid'
  | 'at-mid'
  | 'none';

export type ChartLineRecombiningBbSeriesId = 'price' | 'bb';

export interface ChartLineRecombiningBbSample {
  index: number;
  x: number;
  close: number;
  mean: number | null;
  stdDev: number | null;
  fullUpper: number | null;
  fullLower: number | null;
  upper: number | null;
  lower: number | null;
  recombine: boolean;
  zone: ChartLineRecombiningBbZone;
}

export interface ChartLineRecombiningBbRun {
  series: ChartLineRecombiningBbPoint[];
  length: number;
  sigmaScale: number;
  meanValues: Array<number | null>;
  stdDevValues: Array<number | null>;
  fullUpperValues: Array<number | null>;
  fullLowerValues: Array<number | null>;
  upperValues: Array<number | null>;
  lowerValues: Array<number | null>;
  recombineFlags: boolean[];
  samples: ChartLineRecombiningBbSample[];
  recombineCount: number;
  aboveMidCount: number;
  belowMidCount: number;
  atMidCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineRecombiningBbMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  mean: number;
}

export interface ChartLineRecombiningBbDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRecombiningBbLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineRecombiningBbDot[];
  meanPath: string;
  upperPath: string;
  lowerPath: string;
  markers: ChartLineRecombiningBbMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineRecombiningBbRun;
}

export interface ChartLineRecombiningBbProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRecombiningBbPoint[];
  length?: number;
  sigmaScale?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  bbStrokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  meanColor?: string;
  bandColor?: string;
  recombineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBb?: boolean;
  showMean?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRecombiningBbSeriesId[];
  defaultHiddenSeries?: ChartLineRecombiningBbSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRecombiningBbSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineRecombiningBbSample }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RECOMBINING_BB_WIDTH = 720;
export const DEFAULT_CHART_LINE_RECOMBINING_BB_HEIGHT = 400;
export const DEFAULT_CHART_LINE_RECOMBINING_BB_PADDING = 44;
export const DEFAULT_CHART_LINE_RECOMBINING_BB_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RECOMBINING_BB_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RECOMBINING_BB_BB_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_RECOMBINING_BB_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RECOMBINING_BB_LENGTH = 20;
export const DEFAULT_CHART_LINE_RECOMBINING_BB_SIGMA_SCALE = 2;
export const DEFAULT_CHART_LINE_RECOMBINING_BB_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RECOMBINING_BB_MEAN_COLOR = '#475569';
export const DEFAULT_CHART_LINE_RECOMBINING_BB_BAND_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_RECOMBINING_BB_RECOMBINE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RECOMBINING_BB_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RECOMBINING_BB_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineRecombiningBbFinitePoints(
  data: readonly ChartLineRecombiningBbPoint[] | null | undefined,
): ChartLineRecombiningBbPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRecombiningBbPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineRecombiningBbLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite sigma scale. */
export function normalizeLineRecombiningBbSigma(
  sigma: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(sigma) && sigma >= 0) return sigma;
  return fallback;
}

/** Rolling SMA helper. */
export function applyLineRecombiningBbSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / length : null);
  }
  return out;
}

/** Population standard deviation over a rolling window. */
export function applyLineRecombiningBbStdDev(
  values: readonly (number | null)[],
  means: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    const m = means[i];
    if (i < length - 1 || m == null || !isFiniteNumber(m)) {
      out.push(null);
      continue;
    }
    let sumSq = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      const d = v - m;
      sumSq += d * d;
    }
    out.push(ok ? Math.sqrt(sumSq / length) : null);
  }
  return out;
}

export interface ChartLineRecombiningBbOptions {
  length?: number;
  sigmaScale?: number;
}

export interface ChartLineRecombiningBbChannels {
  mean: Array<number | null>;
  stdDev: Array<number | null>;
  fullUpper: Array<number | null>;
  fullLower: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  recombine: boolean[];
}

/** Compute the recombining Bollinger Band pipeline. */
export function computeLineRecombiningBb(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineRecombiningBbOptions = {},
): ChartLineRecombiningBbChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return {
      mean: [],
      stdDev: [],
      fullUpper: [],
      fullLower: [],
      upper: [],
      lower: [],
      recombine: [],
    };
  }
  const length = normalizeLineRecombiningBbLength(
    options.length,
    DEFAULT_CHART_LINE_RECOMBINING_BB_LENGTH,
  );
  const sigmaScale = normalizeLineRecombiningBbSigma(
    options.sigmaScale,
    DEFAULT_CHART_LINE_RECOMBINING_BB_SIGMA_SCALE,
  );
  const mean = applyLineRecombiningBbSma(closes, length);
  const stdDev = applyLineRecombiningBbStdDev(closes, mean, length);
  const fullUpper: Array<number | null> = [];
  const fullLower: Array<number | null> = [];
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  const recombine: boolean[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    const m = mean[i];
    const s = stdDev[i];
    const c = closes[i];
    if (
      m == null ||
      s == null ||
      c == null ||
      !isFiniteNumber(m) ||
      !isFiniteNumber(s) ||
      !isFiniteNumber(c)
    ) {
      fullUpper.push(null);
      fullLower.push(null);
      upper.push(null);
      lower.push(null);
      recombine.push(false);
      continue;
    }
    const fu = m + sigmaScale * s;
    const fl = m - sigmaScale * s;
    const fired = c >= fu || c <= fl;
    fullUpper.push(fu);
    fullLower.push(fl);
    upper.push(fired ? m : fu);
    lower.push(fired ? m : fl);
    recombine.push(fired);
  }
  return { mean, stdDev, fullUpper, fullLower, upper, lower, recombine };
}

/** Classify a sample. */
export function classifyLineRecombiningBbZone(
  close: number,
  mean: number | null,
  recombine: boolean,
): ChartLineRecombiningBbZone {
  if (mean == null || !isFiniteNumber(mean)) return 'none';
  if (recombine) return 'recombine';
  if (close > mean) return 'above-mid';
  if (close < mean) return 'below-mid';
  return 'at-mid';
}

/** Run the full pipeline plus sample classification. */
export function runLineRecombiningBb(
  data: readonly ChartLineRecombiningBbPoint[] | null | undefined,
  options: ChartLineRecombiningBbOptions = {},
): ChartLineRecombiningBbRun {
  const series = getLineRecombiningBbFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineRecombiningBbLength(
    options.length,
    DEFAULT_CHART_LINE_RECOMBINING_BB_LENGTH,
  );
  const sigmaScale = normalizeLineRecombiningBbSigma(
    options.sigmaScale,
    DEFAULT_CHART_LINE_RECOMBINING_BB_SIGMA_SCALE,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineRecombiningBb(closes, { length, sigmaScale });
  const samples: ChartLineRecombiningBbSample[] = series.map(
    (point, index) => {
      const meanValue = channels.mean[index] ?? null;
      const recombineValue = channels.recombine[index] ?? false;
      return {
        index,
        x: point.x,
        close: point.close,
        mean: meanValue,
        stdDev: channels.stdDev[index] ?? null,
        fullUpper: channels.fullUpper[index] ?? null,
        fullLower: channels.fullLower[index] ?? null,
        upper: channels.upper[index] ?? null,
        lower: channels.lower[index] ?? null,
        recombine: recombineValue,
        zone: classifyLineRecombiningBbZone(
          point.close,
          meanValue,
          recombineValue,
        ),
      };
    },
  );
  let recombineCount = 0;
  let aboveMidCount = 0;
  let belowMidCount = 0;
  let atMidCount = 0;
  let noneCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'recombine') recombineCount += 1;
    else if (sample.zone === 'above-mid') aboveMidCount += 1;
    else if (sample.zone === 'below-mid') belowMidCount += 1;
    else if (sample.zone === 'at-mid') atMidCount += 1;
    else noneCount += 1;
  }
  return {
    series = [],
    length,
    sigmaScale,
    meanValues: channels.mean,
    stdDevValues: channels.stdDev,
    fullUpperValues: channels.fullUpper,
    fullLowerValues: channels.fullLower,
    upperValues: channels.upper,
    lowerValues: channels.lower,
    recombineFlags: channels.recombine,
    samples,
    recombineCount,
    aboveMidCount,
    belowMidCount,
    atMidCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineRecombiningBbLayoutOptions
  extends ChartLineRecombiningBbOptions {
  data: readonly ChartLineRecombiningBbPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
}

function buildLinePath(
  points: ReadonlyArray<{ x: number; y: number }>,
): string {
  if (points.length === 0) return '';
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (i < points.length - 1) d += ' ';
  }
  return d;
}

/** Project the run into a single-panel SVG layout. */
export function computeLineRecombiningBbLayout(
  options: ChartLineRecombiningBbLayoutOptions,
): ChartLineRecombiningBbLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_RECOMBINING_BB_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_RECOMBINING_BB_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_RECOMBINING_BB_PADDING;

  const run = runLineRecombiningBb(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.sigmaScale !== undefined
      ? { sigmaScale: options.sigmaScale }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const okGeom = innerWidth > 0 && innerHeight > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < yMin) yMin = sample.close;
    if (sample.close > yMax) yMax = sample.close;
    if (isFiniteNumber(sample.upper)) {
      if (sample.upper < yMin) yMin = sample.upper;
      if (sample.upper > yMax) yMax = sample.upper;
    }
    if (isFiniteNumber(sample.lower)) {
      if (sample.lower < yMin) yMin = sample.lower;
      if (sample.lower > yMax) yMax = sample.lower;
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - yMin) / (yMax - yMin)) * innerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineRecombiningBbDot[] = [];
  const meanLinePoints: Array<{ x: number; y: number }> = [];
  const upperLinePoints: Array<{ x: number; y: number }> = [];
  const lowerLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineRecombiningBbMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
    if (isFiniteNumber(sample.mean)) {
      meanLinePoints.push({ x: cx, y: yAt(sample.mean) });
    }
    if (isFiniteNumber(sample.upper)) {
      upperLinePoints.push({ x: cx, y: yAt(sample.upper) });
    }
    if (isFiniteNumber(sample.lower)) {
      lowerLinePoints.push({ x: cx, y: yAt(sample.lower) });
    }
    if (sample.recombine && isFiniteNumber(sample.mean)) {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yAt(sample.mean),
        close: sample.close,
        mean: sample.mean,
      });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    meanPath: buildLinePath(meanLinePoints),
    upperPath: buildLinePath(upperLinePoints),
    lowerPath: buildLinePath(lowerLinePoints),
    markers,
    yMin,
    yMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineRecombiningBbChart(
  data: readonly ChartLineRecombiningBbPoint[] | null | undefined,
  options: ChartLineRecombiningBbOptions = {},
): string {
  const run = runLineRecombiningBb(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Single-panel chart with a recombining Bollinger Band envelope on ` +
    `the close (length ${run.length}, sigmaScale ${run.sigmaScale}). ` +
    `The standard band is mean +/- sigmaScale * stdDev across the ` +
    `lookback; on bars where the close touches or breaches the band ` +
    `the upper and lower lines collapse to the mean (recombine). ` +
    `Across ${total} bars the band recombined on ${run.recombineCount} ` +
    `bars; ${run.aboveMidCount} closes were above the mean, ` +
    `${run.belowMidCount} below, ${run.atMidCount} at the mean, and ` +
    `${run.noneCount} undefined.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneLabelOf(zone: ChartLineRecombiningBbZone): string {
  if (zone === 'recombine') return 'Recombine';
  if (zone === 'above-mid') return 'Above mean';
  if (zone === 'below-mid') return 'Below mean';
  if (zone === 'at-mid') return 'At mean';
  return 'n/a';
}

/** ChartLineRecombiningBb -- single-panel pure-SVG chart. */
export const ChartLineRecombiningBb = forwardRef<
  HTMLDivElement,
  ChartLineRecombiningBbProps
>(function ChartLineRecombiningBb(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_RECOMBINING_BB_LENGTH,
    sigmaScale = DEFAULT_CHART_LINE_RECOMBINING_BB_SIGMA_SCALE,
    width = DEFAULT_CHART_LINE_RECOMBINING_BB_WIDTH,
    height = DEFAULT_CHART_LINE_RECOMBINING_BB_HEIGHT,
    padding = DEFAULT_CHART_LINE_RECOMBINING_BB_PADDING,
    tickCount = DEFAULT_CHART_LINE_RECOMBINING_BB_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RECOMBINING_BB_STROKE_WIDTH,
    bbStrokeWidth = DEFAULT_CHART_LINE_RECOMBINING_BB_BB_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RECOMBINING_BB_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RECOMBINING_BB_PRICE_COLOR,
    meanColor = DEFAULT_CHART_LINE_RECOMBINING_BB_MEAN_COLOR,
    bandColor = DEFAULT_CHART_LINE_RECOMBINING_BB_BAND_COLOR,
    recombineColor = DEFAULT_CHART_LINE_RECOMBINING_BB_RECOMBINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_RECOMBINING_BB_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RECOMBINING_BB_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBb = true,
    showMean = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-recombining-bb-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineRecombiningBbSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineRecombiningBbSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineRecombiningBbLayout({
        data,
        length,
        sigmaScale,
        width,
        height,
        padding,
      }),
    [data, length, sigmaScale, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineRecombiningBbChart(data, { length, sigmaScale });
  const resolvedLabel =
    ariaLabel ??
    `Recombining Bollinger Band chart, length ${run.length}, sigmaScale ${run.sigmaScale}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineRecombiningBbSeriesId): void => {
    const next = isHidden(id);
    if (hiddenSeries === undefined) {
      setInternalHidden((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
    }
    onSeriesToggle?.({ seriesId: id, hidden: !next });
  };

  const handleActivate = (sampleIndex: number): void => {
    const sample = run.samples[sampleIndex];
    if (sample) onPointClick?.({ point: sample });
  };

  const handleKey = (
    event: KeyboardEvent<SVGElement>,
    sampleIndex: number,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate(sampleIndex);
    }
  };

  const tickValues: number[] = [];
  if (tickCount > 1) {
    for (let i = 0; i < tickCount; i += 1) {
      tickValues.push(i / (tickCount - 1));
    }
  }

  const containerStyle: CSSProperties = {
    display: 'inline-block',
    fontFamily:
      'var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif)',
    ...style,
  };

  const hoverSample =
    hover !== null && run.samples[hover] ? run.samples[hover]! : null;

  let tooltip: ReactNode = null;
  if (showTooltip && hoverSample && !isEmpty) {
    const dot = layout.priceDots[hoverSample.index];
    const anchorX = dot ? dot.cx : (layout.innerLeft + layout.innerRight) / 2;
    const tooltipW = 260;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g
        data-section="chart-line-recombining-bb-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={150}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-recombining-bb-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-recombining-bb-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-recombining-bb-tooltip-mean"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`SMA: ${
            hoverSample.mean === null
              ? 'n/a'
              : formatPrice(hoverSample.mean)
          }`}
        </text>
        <text
          data-section="chart-line-recombining-bb-tooltip-stddev"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`StdDev: ${
            hoverSample.stdDev === null
              ? 'n/a'
              : formatPrice(hoverSample.stdDev)
          }`}
        </text>
        <text
          data-section="chart-line-recombining-bb-tooltip-upper"
          x={tx + 10}
          y={ty + 83}
          fill="#fde68a"
          fontSize={11}
        >
          {`Upper: ${
            hoverSample.upper === null
              ? 'n/a'
              : formatPrice(hoverSample.upper)
          }`}
        </text>
        <text
          data-section="chart-line-recombining-bb-tooltip-lower"
          x={tx + 10}
          y={ty + 99}
          fill="#fde68a"
          fontSize={11}
        >
          {`Lower: ${
            hoverSample.lower === null
              ? 'n/a'
              : formatPrice(hoverSample.lower)
          }`}
        </text>
        <text
          data-section="chart-line-recombining-bb-tooltip-recombine"
          x={tx + 10}
          y={ty + 117}
          fill={hoverSample.recombine ? recombineColor : '#cbd5e1'}
          fontSize={11}
          fontWeight={hoverSample.recombine ? 600 : 400}
        >
          {`Recombine: ${hoverSample.recombine ? 'yes' : 'no'}`}
        </text>
        <text
          data-section="chart-line-recombining-bb-tooltip-zone"
          x={tx + 10}
          y={ty + 135}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const bbHidden = isHidden('bb') || !showBb;

  const legendItems: Array<{
    id: ChartLineRecombiningBbSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'bb', label: 'Recombining BB', color: bandColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-recombining-bb"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-sigma-scale={run.sigmaScale}
      data-recombine-count={run.recombineCount}
      data-above-mid-count={run.aboveMidCount}
      data-below-mid-count={run.belowMidCount}
      data-at-mid-count={run.atMidCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-recombining-bb-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {description}
      </span>

      {isEmpty ? (
        <svg
          data-section="chart-line-recombining-bb-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-recombining-bb-empty"
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill={axisColor}
            fontSize={13}
          >
            No data
          </text>
        </svg>
      ) : (
        <svg
          data-section="chart-line-recombining-bb-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-recombining-bb-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-recombining-bb-grid-line"
                    x1={layout.innerLeft}
                    y1={y}
                    x2={layout.innerRight}
                    y2={y}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-recombining-bb-axes">
              <line
                data-section="chart-line-recombining-bb-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-recombining-bb-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-recombining-bb-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMax)}
              </text>
              <text
                data-section="chart-line-recombining-bb-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMin)}
              </text>
            </g>
          ) : null}

          {!bbHidden ? (
            <g data-section="chart-line-recombining-bb-bands">
              <path
                data-section="chart-line-recombining-bb-upper-path"
                d={layout.upperPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={bbStrokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Recombining Bollinger upper band`}
              />
              <path
                data-section="chart-line-recombining-bb-lower-path"
                d={layout.lowerPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={bbStrokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Recombining Bollinger lower band`}
              />
              {showMean ? (
                <path
                  data-section="chart-line-recombining-bb-mean-path"
                  d={layout.meanPath}
                  fill="none"
                  stroke={meanColor}
                  strokeWidth={bbStrokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="3 3"
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`SMA mean line`}
                />
              ) : null}
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-recombining-bb-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Close line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-recombining-bb-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-recombining-bb-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatPrice(
                    dot.close,
                  )}`}
                  onMouseEnter={() => setHover(dot.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(dot.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(dot.index)}
                  onKeyDown={(e) => handleKey(e, dot.index)}
                />
              ))}
            </g>
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-recombining-bb-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-recombining-bb-marker"
                  data-close={marker.close}
                  data-mean={marker.mean}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={recombineColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, recombine at ${formatPrice(
                    marker.mean,
                  )}`}
                  onMouseEnter={() => setHover(marker.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(marker.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(marker.index)}
                  onKeyDown={(e) => handleKey(e, marker.index)}
                />
              ))}
            </g>
          ) : null}

          {showConfigBadge ? (
            <g data-section="chart-line-recombining-bb-badge">
              <rect
                data-section="chart-line-recombining-bb-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={220}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-recombining-bb-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Recombining BB ${run.length}/${run.sigmaScale}sd`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-recombining-bb-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 12,
          }}
        >
          {legendItems.map((item) => {
            const hidden = isHidden(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-recombining-bb-legend-item"
                data-series-id={item.id}
                data-hidden={hidden ? 'true' : 'false'}
                onClick={() => toggleSeries(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  opacity: hidden ? 0.4 : 1,
                  color: 'inherit',
                  font: 'inherit',
                }}
                aria-pressed={!hidden}
              >
                <span
                  data-section="chart-line-recombining-bb-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-recombining-bb-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-recombining-bb-legend-stats"
            style={{ color: axisColor }}
          >
            {`recombines ${run.recombineCount} / above ${run.aboveMidCount} / below ${run.belowMidCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineRecombiningBb.displayName = 'ChartLineRecombiningBb';
