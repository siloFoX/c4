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
 * ChartLineFractalBb -- pure-SVG single-panel chart that overlays the
 * close with a Bollinger Band envelope **anchored to fractal pivots**
 * rather than to mean +/- sigma * stdDev. A fractal high at bar `k`
 * is a strict local max in the `high` series across a radius of
 * `pivotRadius` bars on each side; the mirror condition on `low`
 * defines a fractal low. At each bar `i` the band reseeds from the
 * highest fractal-high pivot and the lowest fractal-low pivot
 * **confirmed** within the lookback window:
 *
 *   fractalHigh[k] = high[k] iff for r in [1, pivotRadius]:
 *                      high[k] > high[k - r] && high[k] > high[k + r]
 *                    else null
 *   fractalLow[k]  = low[k]  iff for r in [1, pivotRadius]:
 *                      low[k] < low[k - r] && low[k] < low[k + r]
 *                    else null
 *   window[i]      = [max(0, i - length + 1), i - pivotRadius]
 *   upper[i]       = max(fractalHigh[k] for k in window)
 *   lower[i]       = min(fractalLow[k] for k in window)
 *   mean[i]        = (upper[i] + lower[i]) / 2
 *
 * Bars before `i = length + pivotRadius - 1` (or with no confirmed
 * pivots in the window) yield `null` for the band.
 *
 * Bit-exact anchor: **CONST high=low=close=K**: no strict-inequality
 * pivots can form -> `upper = lower = mean = null` everywhere. The
 * band is silent on featureless data.
 *
 * Additional bit-exact anchor: **constructed peaks**
 * `highs = [10, 11, 12, 11, 10, 8, 9, 13, 12, 11, 10]` with
 * `pivotRadius = 1`:
 * - bar 2: high = 12 > 11 and > 11 -> fractal high (value 12).
 * - bar 7: high = 13 > 9 and > 12 -> fractal high (value 13).
 * For `lows = [9, 10, 11, 10, 9, 7, 8, 12, 11, 10, 9]`:
 * - bar 5: low = 7 < 9 and < 8 -> fractal low (value 7).
 * With `length = 5`: at bar 8 (`window = [4, 7]`), `upper = 13`,
 * `lower = 7`, `mean = 10`. All integer-exact dyadics.
 */

export interface ChartLineFractalBbPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineFractalBbZone =
  | 'above-upper'
  | 'below-lower'
  | 'in-band'
  | 'at-mid'
  | 'none';

export type ChartLineFractalBbSeriesId = 'price' | 'bb';

export interface ChartLineFractalBbSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  fractalHigh: number | null;
  fractalLow: number | null;
  upper: number | null;
  lower: number | null;
  mean: number | null;
  zone: ChartLineFractalBbZone;
}

export interface ChartLineFractalBbRun {
  series: ChartLineFractalBbPoint[];
  length: number;
  pivotRadius: number;
  fractalHighValues: Array<number | null>;
  fractalLowValues: Array<number | null>;
  upperValues: Array<number | null>;
  lowerValues: Array<number | null>;
  meanValues: Array<number | null>;
  samples: ChartLineFractalBbSample[];
  aboveUpperCount: number;
  belowLowerCount: number;
  inBandCount: number;
  atMidCount: number;
  noneCount: number;
  fractalHighCount: number;
  fractalLowCount: number;
  ok: boolean;
}

export interface ChartLineFractalBbMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
  kind: 'high' | 'low';
}

export interface ChartLineFractalBbDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineFractalBbLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineFractalBbDot[];
  meanPath: string;
  upperPath: string;
  lowerPath: string;
  fractalMarkers: ChartLineFractalBbMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineFractalBbRun;
}

export interface ChartLineFractalBbProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFractalBbPoint[];
  length?: number;
  pivotRadius?: number;
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
  fractalHighColor?: string;
  fractalLowColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBb?: boolean;
  showMean?: boolean;
  showFractalMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFractalBbSeriesId[];
  defaultHiddenSeries?: ChartLineFractalBbSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineFractalBbSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineFractalBbSample }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_FRACTAL_BB_WIDTH = 720;
export const DEFAULT_CHART_LINE_FRACTAL_BB_HEIGHT = 400;
export const DEFAULT_CHART_LINE_FRACTAL_BB_PADDING = 44;
export const DEFAULT_CHART_LINE_FRACTAL_BB_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FRACTAL_BB_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FRACTAL_BB_BB_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_FRACTAL_BB_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FRACTAL_BB_LENGTH = 20;
export const DEFAULT_CHART_LINE_FRACTAL_BB_PIVOT_RADIUS = 1;
export const DEFAULT_CHART_LINE_FRACTAL_BB_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_FRACTAL_BB_MEAN_COLOR = '#475569';
export const DEFAULT_CHART_LINE_FRACTAL_BB_BAND_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_FRACTAL_BB_FRACTAL_HIGH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FRACTAL_BB_FRACTAL_LOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_FRACTAL_BB_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FRACTAL_BB_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC fields. */
export function getLineFractalBbFinitePoints(
  data: readonly ChartLineFractalBbPoint[] | null | undefined,
): ChartLineFractalBbPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFractalBbPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 3). */
export function normalizeLineFractalBbLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 3) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer pivot radius (>= 1). */
export function normalizeLineFractalBbPivotRadius(
  radius: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(radius) && radius >= 1) return Math.floor(radius);
  return fallback;
}

/**
 * Detect strict-local-max fractal high pivots in the `highs` series.
 * A bar `k` is a fractal high iff for every `r in [1, pivotRadius]`:
 *   highs[k] > highs[k - r] && highs[k] > highs[k + r]
 * Returns an array of the same length where entry `k` is the pivot
 * value if it's a fractal, `null` otherwise.
 */
export function detectLineFractalBbHighs(
  highs: readonly (number | null)[],
  pivotRadius: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(highs.length).fill(null);
  for (let i = pivotRadius; i < highs.length - pivotRadius; i += 1) {
    const cur = highs[i];
    if (cur == null || !isFiniteNumber(cur)) continue;
    let isFractal = true;
    for (let r = 1; r <= pivotRadius; r += 1) {
      const left = highs[i - r];
      const right = highs[i + r];
      if (
        left == null ||
        right == null ||
        !isFiniteNumber(left) ||
        !isFiniteNumber(right) ||
        cur <= left ||
        cur <= right
      ) {
        isFractal = false;
        break;
      }
    }
    if (isFractal) out[i] = cur;
  }
  return out;
}

/** Mirror of `detectLineFractalBbHighs` for strict-local-min lows. */
export function detectLineFractalBbLows(
  lows: readonly (number | null)[],
  pivotRadius: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(lows.length).fill(null);
  for (let i = pivotRadius; i < lows.length - pivotRadius; i += 1) {
    const cur = lows[i];
    if (cur == null || !isFiniteNumber(cur)) continue;
    let isFractal = true;
    for (let r = 1; r <= pivotRadius; r += 1) {
      const left = lows[i - r];
      const right = lows[i + r];
      if (
        left == null ||
        right == null ||
        !isFiniteNumber(left) ||
        !isFiniteNumber(right) ||
        cur >= left ||
        cur >= right
      ) {
        isFractal = false;
        break;
      }
    }
    if (isFractal) out[i] = cur;
  }
  return out;
}

export interface ChartLineFractalBbOptions {
  length?: number;
  pivotRadius?: number;
}

export interface ChartLineFractalBbChannels {
  fractalHighs: Array<number | null>;
  fractalLows: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  mean: Array<number | null>;
}

/** Compute the fractal-anchored Bollinger Band pipeline. */
export function computeLineFractalBb(
  series: readonly ChartLineFractalBbPoint[] | null | undefined,
  options: ChartLineFractalBbOptions = {},
): ChartLineFractalBbChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return {
      fractalHighs: [],
      fractalLows: [],
      upper: [],
      lower: [],
      mean: [],
    };
  }
  const length = normalizeLineFractalBbLength(
    options.length,
    DEFAULT_CHART_LINE_FRACTAL_BB_LENGTH,
  );
  const pivotRadius = normalizeLineFractalBbPivotRadius(
    options.pivotRadius,
    DEFAULT_CHART_LINE_FRACTAL_BB_PIVOT_RADIUS,
  );
  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const fractalHighs = detectLineFractalBbHighs(highs, pivotRadius);
  const fractalLows = detectLineFractalBbLows(lows, pivotRadius);
  const upper: Array<number | null> = new Array(series.length).fill(null);
  const lower: Array<number | null> = new Array(series.length).fill(null);
  const mean: Array<number | null> = new Array(series.length).fill(null);
  for (let i = 0; i < series.length; i += 1) {
    // Confirmed-pivot window for bar i ends at i - pivotRadius
    // (we don't know about pivots in the most recent pivotRadius bars).
    const windowEnd = i - pivotRadius;
    const windowStart = Math.max(0, i - length + 1);
    if (windowEnd < windowStart) continue;
    let maxHigh: number | null = null;
    let minLow: number | null = null;
    for (let k = windowStart; k <= windowEnd; k += 1) {
      const fh = fractalHighs[k];
      if (fh != null && isFiniteNumber(fh)) {
        if (maxHigh === null || fh > maxHigh) maxHigh = fh;
      }
      const fl = fractalLows[k];
      if (fl != null && isFiniteNumber(fl)) {
        if (minLow === null || fl < minLow) minLow = fl;
      }
    }
    if (maxHigh === null || minLow === null) continue;
    upper[i] = maxHigh;
    lower[i] = minLow;
    mean[i] = (maxHigh + minLow) / 2;
  }
  return { fractalHighs, fractalLows, upper, lower, mean };
}

/** Classify a (close, upper, lower, mean) sample. */
export function classifyLineFractalBbZone(
  close: number,
  upper: number | null,
  lower: number | null,
  mean: number | null,
): ChartLineFractalBbZone {
  if (
    upper == null ||
    lower == null ||
    mean == null ||
    !isFiniteNumber(upper) ||
    !isFiniteNumber(lower) ||
    !isFiniteNumber(mean) ||
    !isFiniteNumber(close)
  ) {
    return 'none';
  }
  if (close > upper) return 'above-upper';
  if (close < lower) return 'below-lower';
  if (close === mean) return 'at-mid';
  return 'in-band';
}

/** Run the full pipeline plus sample classification. */
export function runLineFractalBb(
  data: readonly ChartLineFractalBbPoint[] | null | undefined,
  options: ChartLineFractalBbOptions = {},
): ChartLineFractalBbRun {
  const series = getLineFractalBbFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineFractalBbLength(
    options.length,
    DEFAULT_CHART_LINE_FRACTAL_BB_LENGTH,
  );
  const pivotRadius = normalizeLineFractalBbPivotRadius(
    options.pivotRadius,
    DEFAULT_CHART_LINE_FRACTAL_BB_PIVOT_RADIUS,
  );
  const channels = computeLineFractalBb(series, { length, pivotRadius });
  const samples: ChartLineFractalBbSample[] = series.map((point, index) => {
    const upper = channels.upper[index] ?? null;
    const lower = channels.lower[index] ?? null;
    const mean = channels.mean[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      fractalHigh: channels.fractalHighs[index] ?? null,
      fractalLow: channels.fractalLows[index] ?? null,
      upper,
      lower,
      mean,
      zone: classifyLineFractalBbZone(point.close, upper, lower, mean),
    };
  });
  let aboveUpperCount = 0;
  let belowLowerCount = 0;
  let inBandCount = 0;
  let atMidCount = 0;
  let noneCount = 0;
  let fractalHighCount = 0;
  let fractalLowCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'above-upper') aboveUpperCount += 1;
    else if (sample.zone === 'below-lower') belowLowerCount += 1;
    else if (sample.zone === 'in-band') inBandCount += 1;
    else if (sample.zone === 'at-mid') atMidCount += 1;
    else noneCount += 1;
    if (sample.fractalHigh !== null) fractalHighCount += 1;
    if (sample.fractalLow !== null) fractalLowCount += 1;
  }
  return {
    series,
    length,
    pivotRadius,
    fractalHighValues: channels.fractalHighs,
    fractalLowValues: channels.fractalLows,
    upperValues: channels.upper,
    lowerValues: channels.lower,
    meanValues: channels.mean,
    samples,
    aboveUpperCount,
    belowLowerCount,
    inBandCount,
    atMidCount,
    noneCount,
    fractalHighCount,
    fractalLowCount,
    ok: series.length >= length + pivotRadius,
  };
}

export interface ChartLineFractalBbLayoutOptions
  extends ChartLineFractalBbOptions {
  data: readonly ChartLineFractalBbPoint[] | null | undefined;
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
export function computeLineFractalBbLayout(
  options: ChartLineFractalBbLayoutOptions,
): ChartLineFractalBbLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_FRACTAL_BB_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_FRACTAL_BB_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_FRACTAL_BB_PADDING;

  const run = runLineFractalBb(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.pivotRadius !== undefined
      ? { pivotRadius: options.pivotRadius }
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
  const priceDots: ChartLineFractalBbDot[] = [];
  const meanLinePoints: Array<{ x: number; y: number }> = [];
  const upperLinePoints: Array<{ x: number; y: number }> = [];
  const lowerLinePoints: Array<{ x: number; y: number }> = [];
  const fractalMarkers: ChartLineFractalBbMarker[] = [];
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
    if (sample.fractalHigh !== null && isFiniteNumber(sample.fractalHigh)) {
      fractalMarkers.push({
        index,
        x: sample.x,
        cx,
        cy: yAt(sample.fractalHigh),
        value: sample.fractalHigh,
        kind: 'high',
      });
    }
    if (sample.fractalLow !== null && isFiniteNumber(sample.fractalLow)) {
      fractalMarkers.push({
        index,
        x: sample.x,
        cx,
        cy: yAt(sample.fractalLow),
        value: sample.fractalLow,
        kind: 'low',
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
    fractalMarkers,
    yMin,
    yMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineFractalBbChart(
  data: readonly ChartLineFractalBbPoint[] | null | undefined,
  options: ChartLineFractalBbOptions = {},
): string {
  const run = runLineFractalBb(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Single-panel chart with a fractal-anchored Bollinger Band envelope ` +
    `on the close (length ${run.length}, pivotRadius ${run.pivotRadius}). ` +
    `Each bar reseeds upper/lower from the highest/lowest fractal pivot ` +
    `confirmed within the lookback window; the mean is the midpoint ` +
    `of those pivots. Across ${total} bars the close was above the ` +
    `upper on ${run.aboveUpperCount}, below the lower on ` +
    `${run.belowLowerCount}, inside the band on ${run.inBandCount}, ` +
    `at the mean on ${run.atMidCount}, and undefined on ` +
    `${run.noneCount}, with ${run.fractalHighCount} fractal-high and ` +
    `${run.fractalLowCount} fractal-low pivots detected.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneLabelOf(zone: ChartLineFractalBbZone): string {
  if (zone === 'above-upper') return 'Above upper';
  if (zone === 'below-lower') return 'Below lower';
  if (zone === 'in-band') return 'In band';
  if (zone === 'at-mid') return 'At mean';
  return 'n/a';
}

function markerColorOf(
  kind: 'high' | 'low',
  highColor: string,
  lowColor: string,
): string {
  return kind === 'high' ? highColor : lowColor;
}

/** ChartLineFractalBb -- single-panel pure-SVG chart. */
export const ChartLineFractalBb = forwardRef<
  HTMLDivElement,
  ChartLineFractalBbProps
>(function ChartLineFractalBb(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_FRACTAL_BB_LENGTH,
    pivotRadius = DEFAULT_CHART_LINE_FRACTAL_BB_PIVOT_RADIUS,
    width = DEFAULT_CHART_LINE_FRACTAL_BB_WIDTH,
    height = DEFAULT_CHART_LINE_FRACTAL_BB_HEIGHT,
    padding = DEFAULT_CHART_LINE_FRACTAL_BB_PADDING,
    tickCount = DEFAULT_CHART_LINE_FRACTAL_BB_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FRACTAL_BB_STROKE_WIDTH,
    bbStrokeWidth = DEFAULT_CHART_LINE_FRACTAL_BB_BB_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FRACTAL_BB_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FRACTAL_BB_PRICE_COLOR,
    meanColor = DEFAULT_CHART_LINE_FRACTAL_BB_MEAN_COLOR,
    bandColor = DEFAULT_CHART_LINE_FRACTAL_BB_BAND_COLOR,
    fractalHighColor = DEFAULT_CHART_LINE_FRACTAL_BB_FRACTAL_HIGH_COLOR,
    fractalLowColor = DEFAULT_CHART_LINE_FRACTAL_BB_FRACTAL_LOW_COLOR,
    axisColor = DEFAULT_CHART_LINE_FRACTAL_BB_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_FRACTAL_BB_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBb = true,
    showMean = true,
    showFractalMarkers = true,
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
  const baseId = `chart-line-fractal-bb-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineFractalBbSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineFractalBbSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineFractalBbLayout({
        data,
        length,
        pivotRadius,
        width,
        height,
        padding,
      }),
    [data, length, pivotRadius, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineFractalBbChart(data, { length, pivotRadius });
  const resolvedLabel =
    ariaLabel ??
    `Fractal Bollinger Band chart, length ${run.length}, pivotRadius ${run.pivotRadius}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineFractalBbSeriesId): void => {
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
        data-section="chart-line-fractal-bb-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={166}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-fractal-bb-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-fractal-bb-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-fractal-bb-tooltip-high"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatPrice(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-fractal-bb-tooltip-low"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-fractal-bb-tooltip-upper"
          x={tx + 10}
          y={ty + 83}
          fill="#67e8f9"
          fontSize={11}
        >
          {`Upper: ${
            hoverSample.upper === null
              ? 'n/a'
              : formatPrice(hoverSample.upper)
          }`}
        </text>
        <text
          data-section="chart-line-fractal-bb-tooltip-mean"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Mean: ${
            hoverSample.mean === null
              ? 'n/a'
              : formatPrice(hoverSample.mean)
          }`}
        </text>
        <text
          data-section="chart-line-fractal-bb-tooltip-lower"
          x={tx + 10}
          y={ty + 115}
          fill="#67e8f9"
          fontSize={11}
        >
          {`Lower: ${
            hoverSample.lower === null
              ? 'n/a'
              : formatPrice(hoverSample.lower)
          }`}
        </text>
        <text
          data-section="chart-line-fractal-bb-tooltip-pivot"
          x={tx + 10}
          y={ty + 133}
          fill={
            hoverSample.fractalHigh !== null
              ? fractalHighColor
              : hoverSample.fractalLow !== null
                ? fractalLowColor
                : '#94a3b8'
          }
          fontSize={11}
          fontWeight={
            hoverSample.fractalHigh !== null || hoverSample.fractalLow !== null
              ? 600
              : 400
          }
        >
          {hoverSample.fractalHigh !== null
            ? `Pivot: fractal high ${formatPrice(hoverSample.fractalHigh)}`
            : hoverSample.fractalLow !== null
              ? `Pivot: fractal low ${formatPrice(hoverSample.fractalLow)}`
              : 'Pivot: -'}
        </text>
        <text
          data-section="chart-line-fractal-bb-tooltip-zone"
          x={tx + 10}
          y={ty + 151}
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
    id: ChartLineFractalBbSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'bb', label: 'Fractal BB', color: bandColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-fractal-bb"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-pivot-radius={run.pivotRadius}
      data-above-upper-count={run.aboveUpperCount}
      data-below-lower-count={run.belowLowerCount}
      data-in-band-count={run.inBandCount}
      data-at-mid-count={run.atMidCount}
      data-none-count={run.noneCount}
      data-fractal-high-count={run.fractalHighCount}
      data-fractal-low-count={run.fractalLowCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-fractal-bb-aria-desc"
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
          data-section="chart-line-fractal-bb-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-fractal-bb-empty"
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
          data-section="chart-line-fractal-bb-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-fractal-bb-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-fractal-bb-grid-line"
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
            <g data-section="chart-line-fractal-bb-axes">
              <line
                data-section="chart-line-fractal-bb-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-fractal-bb-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-fractal-bb-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMax)}
              </text>
              <text
                data-section="chart-line-fractal-bb-tick-label"
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
            <g data-section="chart-line-fractal-bb-bands">
              <path
                data-section="chart-line-fractal-bb-upper-path"
                d={layout.upperPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={bbStrokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Fractal upper band`}
              />
              <path
                data-section="chart-line-fractal-bb-lower-path"
                d={layout.lowerPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={bbStrokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Fractal lower band`}
              />
              {showMean ? (
                <path
                  data-section="chart-line-fractal-bb-mean-path"
                  d={layout.meanPath}
                  fill="none"
                  stroke={meanColor}
                  strokeWidth={bbStrokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="3 3"
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Fractal midpoint mean line`}
                />
              ) : null}
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-fractal-bb-price-path"
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
            <g data-section="chart-line-fractal-bb-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-fractal-bb-dot"
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

          {showFractalMarkers ? (
            <g data-section="chart-line-fractal-bb-fractal-markers">
              {layout.fractalMarkers.map((marker) => (
                <circle
                  key={`fractal-${marker.kind}-${marker.index}`}
                  data-section="chart-line-fractal-bb-fractal-marker"
                  data-kind={marker.kind}
                  data-value={marker.value}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={markerColorOf(
                    marker.kind,
                    fractalHighColor,
                    fractalLowColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Fractal ${marker.kind} at bar ${formatX(
                    marker.x,
                  )}, value ${formatPrice(marker.value)}`}
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
            <g data-section="chart-line-fractal-bb-badge">
              <rect
                data-section="chart-line-fractal-bb-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={220}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-fractal-bb-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Fractal BB ${run.length} / r${run.pivotRadius}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-fractal-bb-legend"
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
                data-section="chart-line-fractal-bb-legend-item"
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
                  data-section="chart-line-fractal-bb-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-fractal-bb-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-fractal-bb-legend-stats"
            style={{ color: axisColor }}
          >
            {`pivots H${run.fractalHighCount} / L${run.fractalLowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineFractalBb.displayName = 'ChartLineFractalBb';
