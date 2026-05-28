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
 * ChartLineAtrBand -- pure-SVG single-panel line chart that
 * overlays an ATR-based band envelope on the close. The middle
 * is an SMA of the close, and the bands are offset by
 * `multiplier * ATR` over the same lookback:
 *
 *   middle[i] = SMA(close, length)[i]
 *   TR[i]     = max(high - low,
 *                   |high - prevClose|,
 *                   |low - prevClose|)        // TR[0] = high - low
 *   ATR[i]    = SMA(TR, length)[i]
 *   upper[i]  = middle[i] + multiplier * ATR[i]
 *   lower[i]  = middle[i] - multiplier * ATR[i]
 *
 * Defaults: `length = 20`, `multiplier = 2`. Bars before
 * `i = length - 1` are warmup (`middle`, `upper`, `lower = null`).
 *
 * Bit-exact anchors:
 *
 *   * **CONST_FLAT** (`high = low = close = K`): every TR is
 *     zero, ATR is zero, both SMAs collapse to `K`, and
 *     `upper = lower = middle = K` past warmup.
 *   * **CONST_BAR** (constant `high = K + r`, `low = K - r`,
 *     `close = K`): every TR is `2r`, every SMA window holds
 *     constants so `middle = K`, `ATR = 2r`. Then
 *     `upper = K + 2*multiplier*r` and
 *     `lower = K - 2*multiplier*r` -- an integer-friendly
 *     anchor past warmup.
 */

export interface ChartLineAtrBandPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAtrBandZone =
  | 'breakout-up'
  | 'above'
  | 'below'
  | 'breakout-down'
  | 'at'
  | 'none';

export type ChartLineAtrBandSeriesId =
  | 'price'
  | 'middle'
  | 'upper'
  | 'lower';

export interface ChartLineAtrBandSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  middle: number | null;
  upper: number | null;
  lower: number | null;
  zone: ChartLineAtrBandZone;
}

export interface ChartLineAtrBandRun {
  series: ChartLineAtrBandPoint[];
  length: number;
  multiplier: number;
  middle: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  samples: ChartLineAtrBandSample[];
  middleFinal: number | null;
  breakoutUpCount: number;
  aboveCount: number;
  belowCount: number;
  breakoutDownCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineAtrBandMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  middle: number;
  zone: ChartLineAtrBandZone;
}

export interface ChartLineAtrBandDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAtrBandLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineAtrBandDot[];
  middlePath: string;
  markers: ChartLineAtrBandMarker[];
  upperPath: string;
  lowerPath: string;
  yMin: number;
  yMax: number;
  run: ChartLineAtrBandRun;
}

export interface ChartLineAtrBandProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAtrBandPoint[];
  length?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  middleColor?: string;
  upperColor?: string;
  lowerColor?: string;
  breakoutUpColor?: string;
  aboveColor?: string;
  belowColor?: string;
  breakoutDownColor?: string;
  atColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  channelFill?: string;
  channelFillOpacity?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMiddle?: boolean;
  showUpper?: boolean;
  showLower?: boolean;
  showChannelFill?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAtrBandSeriesId[];
  defaultHiddenSeries?: ChartLineAtrBandSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAtrBandSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAtrBandSample }) => void;
  formatPrice?: (value: number) => string;
  formatMiddle?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ATR_BAND_WIDTH = 720;
export const DEFAULT_CHART_LINE_ATR_BAND_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ATR_BAND_PADDING = 44;
export const DEFAULT_CHART_LINE_ATR_BAND_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ATR_BAND_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ATR_BAND_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ATR_BAND_LENGTH = 20;
export const DEFAULT_CHART_LINE_ATR_BAND_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_ATR_BAND_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ATR_BAND_MIDDLE_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_ATR_BAND_UPPER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ATR_BAND_LOWER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ATR_BAND_BREAKOUT_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ATR_BAND_ABOVE_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_ATR_BAND_BELOW_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ATR_BAND_BREAKOUT_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ATR_BAND_AT_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_ATR_BAND_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ATR_BAND_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_BAND_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ATR_BAND_CHANNEL_FILL = '#0ea5e9';
export const DEFAULT_CHART_LINE_ATR_BAND_CHANNEL_FILL_OPACITY = 0.08;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineAtrBandFinitePoints(
  data: readonly ChartLineAtrBandPoint[] | null | undefined,
): ChartLineAtrBandPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAtrBandPoint[] = [];
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

/** Coerce a positive integer length (>= 2). */
export function normalizeLineAtrBandLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite multiplier. */
export function normalizeLineAtrBandMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

/** SMA; nulls in the window null the bar. */
export function applyLineAtrBandSma(
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
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / length : null);
  }
  return out;
}

/** True range per bar; bar 0 falls back to `high - low`. */
export function computeLineAtrBandTrueRange(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (
      !bar ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low) ||
      !isFiniteNumber(bar.close)
    ) {
      out.push(null);
      continue;
    }
    if (i === 0) {
      out.push(bar.high - bar.low);
      continue;
    }
    const prev = bars[i - 1];
    if (!prev || !isFiniteNumber(prev.close)) {
      out.push(bar.high - bar.low);
      continue;
    }
    const a = bar.high - bar.low;
    const b = Math.abs(bar.high - prev.close);
    const c = Math.abs(bar.low - prev.close);
    out.push(Math.max(a, b, c));
  }
  return out;
}

export interface ChartLineAtrBandOptions {
  length?: number;
  multiplier?: number;
}

export interface ChartLineAtrBandChannels {
  middle: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
}

/**
 * Compute the full ATR band pipeline per bar. Bars before
 * `i = length - 1` are `null`.
 */
export function computeLineAtrBand(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineAtrBandOptions = {},
): ChartLineAtrBandChannels {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { middle: [], upper: [], lower: [] };
  }
  const length = normalizeLineAtrBandLength(
    options.length,
    DEFAULT_CHART_LINE_ATR_BAND_LENGTH,
  );
  const multiplier = normalizeLineAtrBandMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_ATR_BAND_MULTIPLIER,
  );
  const closes: Array<number | null> = bars.map((bar) =>
    !bar || !isFiniteNumber(bar.close) ? null : bar.close,
  );
  const middle = applyLineAtrBandSma(closes, length);
  const tr = computeLineAtrBandTrueRange(bars);
  const atr = applyLineAtrBandSma(tr, length);
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const m = middle[i];
    const a = atr[i];
    if (
      m == null ||
      a == null ||
      !isFiniteNumber(m) ||
      !isFiniteNumber(a)
    ) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    upper.push(m + multiplier * a);
    lower.push(m - multiplier * a);
  }
  return { middle, upper, lower };
}

/** Classify the close relative to the band envelope. */
export function classifyLineAtrBandZone(
  close: number,
  middle: number | null,
  upper: number | null,
  lower: number | null,
): ChartLineAtrBandZone {
  if (
    middle == null ||
    upper == null ||
    lower == null ||
    !isFiniteNumber(middle) ||
    !isFiniteNumber(upper) ||
    !isFiniteNumber(lower) ||
    !isFiniteNumber(close)
  ) {
    return 'none';
  }
  // Zero-width band (singular: collapsed to a point) -- classify
  // by close vs middle only so the breakout buckets do not eat the
  // `at` case.
  if (upper === lower) {
    if (close > middle) return 'above';
    if (close < middle) return 'below';
    return 'at';
  }
  if (close >= upper) return 'breakout-up';
  if (close <= lower) return 'breakout-down';
  if (close > middle) return 'above';
  if (close < middle) return 'below';
  return 'at';
}

/** Run the full ATR band pipeline plus sample classification. */
export function runLineAtrBand(
  data: readonly ChartLineAtrBandPoint[] | null | undefined,
  options: ChartLineAtrBandOptions = {},
): ChartLineAtrBandRun {
  const series = getLineAtrBandFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineAtrBandLength(
    options.length,
    DEFAULT_CHART_LINE_ATR_BAND_LENGTH,
  );
  const multiplier = normalizeLineAtrBandMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_ATR_BAND_MULTIPLIER,
  );
  const channels = computeLineAtrBand(series, { length, multiplier });
  const samples: ChartLineAtrBandSample[] = series.map((point, index) => {
    const m = channels.middle[index] ?? null;
    const u = channels.upper[index] ?? null;
    const l = channels.lower[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      middle: m,
      upper: u,
      lower: l,
      zone: classifyLineAtrBandZone(point.close, m, u, l),
    };
  });
  let breakoutUpCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let breakoutDownCount = 0;
  let atCount = 0;
  let noneCount = 0;
  let middleFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'breakout-up') breakoutUpCount += 1;
    else if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'breakout-down') breakoutDownCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.middle)) middleFinal = sample.middle;
  }
  return {
    series = [],
    length,
    multiplier,
    middle: channels.middle,
    upper: channels.upper,
    lower: channels.lower,
    samples,
    middleFinal,
    breakoutUpCount,
    aboveCount,
    belowCount,
    breakoutDownCount,
    atCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineAtrBandLayoutOptions
  extends ChartLineAtrBandOptions {
  data: readonly ChartLineAtrBandPoint[] | null | undefined;
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
export function computeLineAtrBandLayout(
  options: ChartLineAtrBandLayoutOptions,
): ChartLineAtrBandLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ATR_BAND_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ATR_BAND_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ATR_BAND_PADDING;

  const run = runLineAtrBand(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.multiplier !== undefined
      ? { multiplier: options.multiplier }
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

  // y-range spans the close, upper, and lower combined.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < yMin) yMin = sample.close;
    if (sample.close > yMax) yMax = sample.close;
    if (sample.upper != null && isFiniteNumber(sample.upper)) {
      if (sample.upper > yMax) yMax = sample.upper;
    }
    if (sample.lower != null && isFiniteNumber(sample.lower)) {
      if (sample.lower < yMin) yMin = sample.lower;
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
  const priceDots: ChartLineAtrBandDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const middleLinePoints: Array<{ x: number; y: number }> = [];
  const upperLinePoints: Array<{ x: number; y: number }> = [];
  const lowerLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAtrBandMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (isFiniteNumber(sample.middle)) {
      const yc = yAt(sample.middle);
      middleLinePoints.push({ x: cx, y: yc });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        middle: sample.middle,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.upper)) {
      upperLinePoints.push({ x: cx, y: yAt(sample.upper) });
    }
    if (isFiniteNumber(sample.lower)) {
      lowerLinePoints.push({ x: cx, y: yAt(sample.lower) });
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
    middlePath: buildLinePath(middleLinePoints),
    markers,
    upperPath: buildLinePath(upperLinePoints),
    lowerPath: buildLinePath(lowerLinePoints),
    yMin,
    yMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAtrBandChart(
  data: readonly ChartLineAtrBandPoint[] | null | undefined,
  options: ChartLineAtrBandOptions = {},
): string {
  const run = runLineAtrBand(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.middleFinal === null ? 'n/a' : run.middleFinal.toFixed(4);
  return (
    `Single-panel chart with an ATR-based band envelope overlay on ` +
    `the close (length ${run.length}, multiplier ${run.multiplier}). ` +
    `The middle line is an SMA of the close; the upper and lower ` +
    `bands are offset by multiplier * ATR over the same lookback. ` +
    `Across ${total} bars the close breaks out above the upper ` +
    `band on ${run.breakoutUpCount}, sits above the midline on ` +
    `${run.aboveCount}, sits below the midline on ${run.belowCount}, ` +
    `breaks out below the lower band on ${run.breakoutDownCount}, ` +
    `is at the midline on ${run.atCount}, and is undefined on ` +
    `${run.noneCount}. The final midline value is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatMiddle(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineAtrBandZone,
  breakoutUpColor: string,
  aboveColor: string,
  belowColor: string,
  breakoutDownColor: string,
  atColor: string,
  noneColor: string,
): string {
  if (zone === 'breakout-up') return breakoutUpColor;
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  if (zone === 'breakout-down') return breakoutDownColor;
  if (zone === 'at') return atColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineAtrBandZone): string {
  if (zone === 'breakout-up') return 'Breakout Up';
  if (zone === 'above') return 'Above Mid';
  if (zone === 'below') return 'Below Mid';
  if (zone === 'breakout-down') return 'Breakout Down';
  if (zone === 'at') return 'At Mid';
  return 'n/a';
}

/** ChartLineAtrBand -- single-panel pure-SVG chart. */
export const ChartLineAtrBand = forwardRef<
  HTMLDivElement,
  ChartLineAtrBandProps
>(function ChartLineAtrBand(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_ATR_BAND_LENGTH,
    multiplier = DEFAULT_CHART_LINE_ATR_BAND_MULTIPLIER,
    width = DEFAULT_CHART_LINE_ATR_BAND_WIDTH,
    height = DEFAULT_CHART_LINE_ATR_BAND_HEIGHT,
    padding = DEFAULT_CHART_LINE_ATR_BAND_PADDING,
    tickCount = DEFAULT_CHART_LINE_ATR_BAND_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ATR_BAND_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ATR_BAND_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ATR_BAND_PRICE_COLOR,
    middleColor = DEFAULT_CHART_LINE_ATR_BAND_MIDDLE_COLOR,
    upperColor = DEFAULT_CHART_LINE_ATR_BAND_UPPER_COLOR,
    lowerColor = DEFAULT_CHART_LINE_ATR_BAND_LOWER_COLOR,
    breakoutUpColor = DEFAULT_CHART_LINE_ATR_BAND_BREAKOUT_UP_COLOR,
    aboveColor = DEFAULT_CHART_LINE_ATR_BAND_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_ATR_BAND_BELOW_COLOR,
    breakoutDownColor = DEFAULT_CHART_LINE_ATR_BAND_BREAKOUT_DOWN_COLOR,
    atColor = DEFAULT_CHART_LINE_ATR_BAND_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_ATR_BAND_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_ATR_BAND_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ATR_BAND_GRID_COLOR,
    channelFill = DEFAULT_CHART_LINE_ATR_BAND_CHANNEL_FILL,
    channelFillOpacity = DEFAULT_CHART_LINE_ATR_BAND_CHANNEL_FILL_OPACITY,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMiddle = true,
    showUpper = true,
    showLower = true,
    showChannelFill = true,
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
    formatMiddle = defaultFormatMiddle,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-atr-band-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAtrBandSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAtrBandSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAtrBandLayout({
        data,
        length,
        multiplier,
        width,
        height,
        padding,
      }),
    [data, length, multiplier, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineAtrBandChart(data, { length, multiplier });
  const resolvedLabel =
    ariaLabel ??
    `ATR band chart, length ${run.length}, multiplier ${run.multiplier}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAtrBandSeriesId): void => {
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
    const tooltipW = 240;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g
        data-section="chart-line-atr-band-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={134}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-atr-band-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-atr-band-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-atr-band-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-atr-band-tooltip-middle"
          x={tx + 10}
          y={ty + 67}
          fill="#7dd3fc"
          fontSize={11}
          fontWeight={600}
        >
          {`Mid: ${
            hoverSample.middle === null
              ? 'n/a'
              : formatMiddle(hoverSample.middle)
          }`}
        </text>
        <text
          data-section="chart-line-atr-band-tooltip-upper"
          x={tx + 10}
          y={ty + 83}
          fill="#86efac"
          fontSize={11}
        >
          {`Upper: ${
            hoverSample.upper === null
              ? 'n/a'
              : formatPrice(hoverSample.upper)
          }`}
        </text>
        <text
          data-section="chart-line-atr-band-tooltip-lower"
          x={tx + 10}
          y={ty + 99}
          fill="#fca5a5"
          fontSize={11}
        >
          {`Lower: ${
            hoverSample.lower === null
              ? 'n/a'
              : formatPrice(hoverSample.lower)
          }`}
        </text>
        <text
          data-section="chart-line-atr-band-tooltip-zone"
          x={tx + 10}
          y={ty + 115}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const middleHidden = isHidden('middle') || !showMiddle;
  const upperHidden = isHidden('upper') || !showUpper;
  const lowerHidden = isHidden('lower') || !showLower;

  const legendItems: Array<{
    id: ChartLineAtrBandSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'middle', label: 'SMA Middle', color: middleColor },
    { id: 'upper', label: 'Upper Band', color: upperColor },
    { id: 'lower', label: 'Lower Band', color: lowerColor },
  ];

  // Build channel polygon between upper and lower for the fill.
  let channelPath = '';
  if (showChannelFill && !isEmpty) {
    const upperPts: Array<{ x: number; y: number }> = [];
    const lowerPts: Array<{ x: number; y: number }> = [];
    run.samples.forEach((sample, index) => {
      if (
        isFiniteNumber(sample.upper) &&
        isFiniteNumber(sample.lower)
      ) {
        const cx =
          run.series.length > 1
            ? layout.innerLeft +
              ((layout.innerRight - layout.innerLeft) /
                (run.series.length - 1)) *
                index
            : (layout.innerLeft + layout.innerRight) / 2;
        const yUp = layout.innerBottom -
          ((sample.upper - layout.yMin) /
            (layout.yMax - layout.yMin)) *
            (layout.innerBottom - layout.innerTop);
        const yLo = layout.innerBottom -
          ((sample.lower - layout.yMin) /
            (layout.yMax - layout.yMin)) *
            (layout.innerBottom - layout.innerTop);
        upperPts.push({ x: cx, y: yUp });
        lowerPts.push({ x: cx, y: yLo });
      }
    });
    if (upperPts.length > 0 && lowerPts.length > 0) {
      let d = '';
      for (let i = 0; i < upperPts.length; i += 1) {
        const p = upperPts[i]!;
        d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
      }
      for (let i = lowerPts.length - 1; i >= 0; i -= 1) {
        const p = lowerPts[i]!;
        d += `L${p.x.toFixed(2)},${p.y.toFixed(2)} `;
      }
      d += 'Z';
      channelPath = d;
    }
  }

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-atr-band"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-multiplier={run.multiplier}
      data-middle-final={
        run.middleFinal === null ? '' : run.middleFinal
      }
      data-breakout-up-count={run.breakoutUpCount}
      data-above-count={run.aboveCount}
      data-below-count={run.belowCount}
      data-breakout-down-count={run.breakoutDownCount}
      data-at-count={run.atCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-atr-band-aria-desc"
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
          data-section="chart-line-atr-band-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-atr-band-empty"
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
          data-section="chart-line-atr-band-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-atr-band-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-atr-band-grid-line"
                    x1={layout.innerLeft}
                    y1={yp}
                    x2={layout.innerRight}
                    y2={yp}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-atr-band-axes">
              <line
                data-section="chart-line-atr-band-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-atr-band-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-atr-band-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMax)}
              </text>
              <text
                data-section="chart-line-atr-band-tick-label"
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

          {showChannelFill && channelPath ? (
            <path
              data-section="chart-line-atr-band-channel-fill"
              d={channelPath}
              fill={channelFill}
              fillOpacity={channelFillOpacity}
              stroke="none"
            />
          ) : null}

          {!upperHidden ? (
            <path
              data-section="chart-line-atr-band-upper-path"
              d={layout.upperPath}
              fill="none"
              stroke={upperColor}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="ATR upper band"
            />
          ) : null}

          {!lowerHidden ? (
            <path
              data-section="chart-line-atr-band-lower-path"
              d={layout.lowerPath}
              fill="none"
              stroke={lowerColor}
              strokeWidth={1.5}
              strokeDasharray="3 3"
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="ATR lower band"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-atr-band-price-path"
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
            <g data-section="chart-line-atr-band-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-atr-band-dot"
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

          {!middleHidden ? (
            <path
              data-section="chart-line-atr-band-middle-path"
              d={layout.middlePath}
              fill="none"
              stroke={middleColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`SMA midline, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-atr-band-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-atr-band-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-middle={marker.middle}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    breakoutUpColor,
                    aboveColor,
                    belowColor,
                    breakoutDownColor,
                    atColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, midline ${formatMiddle(marker.middle)}, ${zoneLabelOf(
                    marker.zone,
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
            <g data-section="chart-line-atr-band-badge">
              <rect
                data-section="chart-line-atr-band-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-atr-band-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ATR Band ${run.length}/${run.multiplier}x`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-atr-band-legend"
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
                data-section="chart-line-atr-band-legend-item"
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
                  data-section="chart-line-atr-band-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-atr-band-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-atr-band-legend-stats"
            style={{ color: axisColor }}
          >
            {`bo-up ${run.breakoutUpCount} / above ${run.aboveCount} / below ${run.belowCount} / bo-down ${run.breakoutDownCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAtrBand.displayName = 'ChartLineAtrBand';
