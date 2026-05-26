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
 * ChartLineAlligator -- pure-SVG single-panel React primitive
 * that overlays Bill Williams' Alligator on the close. The
 * Alligator is three smoothed moving averages (SMMA) of the
 * median price, each shifted forward by a separate offset:
 *
 *   median[i]   = (high[i] + low[i]) / 2
 *   jaw[i]      = SMMA(median, jawPeriod)[i - jawShift]
 *   teeth[i]    = SMMA(median, teethPeriod)[i - teethShift]
 *   lips[i]     = SMMA(median, lipsPeriod)[i - lipsShift]
 *
 * where `SMMA(price, length)[i] = (SMMA[i - 1] * (length - 1)
 * + price[i]) / length`, seeded with the SMA of the first
 * `length` finite prices.
 *
 * Defaults: `jawPeriod = 13`, `jawShift = 8`,
 * `teethPeriod = 8`, `teethShift = 5`, `lipsPeriod = 5`,
 * `lipsShift = 3`. The first valid bar for jaw is
 * `i = jawPeriod + jawShift - 1 = 20`.
 *
 * Bit-exact anchor: **CONST_FLAT** (`high = low = K`): the
 * median equals `K`, the SMA seed equals `K`, and the SMMA
 * recurrence collapses to:
 *
 *     SMMA[i] = (SMMA[i - 1] * (L - 1) + K) / L
 *             = (K * (L - 1) + K) / L
 *             = K
 *
 * bit-exact for any IEEE 754 representable `K`. After shifting,
 * `jaw = teeth = lips = K` past the warmup. The integration
 * sweep verifies this across many `K` (including 0 and
 * negatives).
 */

export interface ChartLineAlligatorPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAlligatorZone =
  | 'eating'
  | 'awake'
  | 'sleeping'
  | 'none';

export type ChartLineAlligatorSeriesId =
  | 'price'
  | 'jaw'
  | 'teeth'
  | 'lips';

export interface ChartLineAlligatorSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  median: number;
  jaw: number | null;
  teeth: number | null;
  lips: number | null;
  zone: ChartLineAlligatorZone;
}

export interface ChartLineAlligatorRun {
  series: ChartLineAlligatorPoint[];
  jawPeriod: number;
  jawShift: number;
  teethPeriod: number;
  teethShift: number;
  lipsPeriod: number;
  lipsShift: number;
  median: number[];
  jaw: Array<number | null>;
  teeth: Array<number | null>;
  lips: Array<number | null>;
  samples: ChartLineAlligatorSample[];
  jawFinal: number | null;
  teethFinal: number | null;
  lipsFinal: number | null;
  eatingCount: number;
  awakeCount: number;
  sleepingCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineAlligatorMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  jaw: number;
  teeth: number;
  lips: number;
  zone: ChartLineAlligatorZone;
}

export interface ChartLineAlligatorDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAlligatorLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineAlligatorDot[];
  jawPath: string;
  teethPath: string;
  lipsPath: string;
  markers: ChartLineAlligatorMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineAlligatorRun;
}

export interface ChartLineAlligatorProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAlligatorPoint[];
  jawPeriod?: number;
  jawShift?: number;
  teethPeriod?: number;
  teethShift?: number;
  lipsPeriod?: number;
  lipsShift?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  jawColor?: string;
  teethColor?: string;
  lipsColor?: string;
  eatingColor?: string;
  awakeColor?: string;
  sleepingColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showJaw?: boolean;
  showTeeth?: boolean;
  showLips?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAlligatorSeriesId[];
  defaultHiddenSeries?: ChartLineAlligatorSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAlligatorSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAlligatorSample }) => void;
  formatPrice?: (value: number) => string;
  formatAlligator?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ALLIGATOR_WIDTH = 720;
export const DEFAULT_CHART_LINE_ALLIGATOR_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ALLIGATOR_PADDING = 44;
export const DEFAULT_CHART_LINE_ALLIGATOR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ALLIGATOR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ALLIGATOR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ALLIGATOR_JAW_PERIOD = 13;
export const DEFAULT_CHART_LINE_ALLIGATOR_JAW_SHIFT = 8;
export const DEFAULT_CHART_LINE_ALLIGATOR_TEETH_PERIOD = 8;
export const DEFAULT_CHART_LINE_ALLIGATOR_TEETH_SHIFT = 5;
export const DEFAULT_CHART_LINE_ALLIGATOR_LIPS_PERIOD = 5;
export const DEFAULT_CHART_LINE_ALLIGATOR_LIPS_SHIFT = 3;
export const DEFAULT_CHART_LINE_ALLIGATOR_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ALLIGATOR_JAW_COLOR = '#1e40af';
export const DEFAULT_CHART_LINE_ALLIGATOR_TEETH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ALLIGATOR_LIPS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ALLIGATOR_EATING_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ALLIGATOR_AWAKE_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ALLIGATOR_SLEEPING_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_ALLIGATOR_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ALLIGATOR_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ALLIGATOR_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineAlligatorFinitePoints(
  data: readonly ChartLineAlligatorPoint[] | null | undefined,
): ChartLineAlligatorPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAlligatorPoint[] = [];
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

/** Coerce a positive integer period (>= 2). */
export function normalizeLineAlligatorPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce a non-negative integer shift. */
export function normalizeLineAlligatorShift(
  shift: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(shift) && shift >= 0) return Math.floor(shift);
  return fallback;
}

/**
 * Smoothed Moving Average (Wilder's smoothing) seeded with the
 * SMA of the first `length` finite values. Returns `null` until
 * the seed window is complete.
 */
export function applyLineAlligatorSmma(
  values: readonly number[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  let smma: number | null = null;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (smma === null) {
      seedSum += v;
      seedCount += 1;
      if (seedCount === length) {
        smma = seedSum / length;
        out.push(smma);
      } else {
        out.push(null);
      }
      continue;
    }
    smma = (smma * (length - 1) + v) / length;
    out.push(smma);
  }
  return out;
}

export interface ChartLineAlligatorOptions {
  jawPeriod?: number;
  jawShift?: number;
  teethPeriod?: number;
  teethShift?: number;
  lipsPeriod?: number;
  lipsShift?: number;
}

export interface ChartLineAlligatorChannels {
  median: number[];
  jaw: Array<number | null>;
  teeth: Array<number | null>;
  lips: Array<number | null>;
}

/**
 * Compute the Alligator pipeline per bar. Bars before the
 * respective `period + shift - 1` are `null` for each line.
 */
export function computeLineAlligator(
  bars: ReadonlyArray<{ high: number; low: number }> | null | undefined,
  options: ChartLineAlligatorOptions = {},
): ChartLineAlligatorChannels {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { median: [], jaw: [], teeth: [], lips: [] };
  }
  const jawPeriod = normalizeLineAlligatorPeriod(
    options.jawPeriod,
    DEFAULT_CHART_LINE_ALLIGATOR_JAW_PERIOD,
  );
  const jawShift = normalizeLineAlligatorShift(
    options.jawShift,
    DEFAULT_CHART_LINE_ALLIGATOR_JAW_SHIFT,
  );
  const teethPeriod = normalizeLineAlligatorPeriod(
    options.teethPeriod,
    DEFAULT_CHART_LINE_ALLIGATOR_TEETH_PERIOD,
  );
  const teethShift = normalizeLineAlligatorShift(
    options.teethShift,
    DEFAULT_CHART_LINE_ALLIGATOR_TEETH_SHIFT,
  );
  const lipsPeriod = normalizeLineAlligatorPeriod(
    options.lipsPeriod,
    DEFAULT_CHART_LINE_ALLIGATOR_LIPS_PERIOD,
  );
  const lipsShift = normalizeLineAlligatorShift(
    options.lipsShift,
    DEFAULT_CHART_LINE_ALLIGATOR_LIPS_SHIFT,
  );
  const median: number[] = bars.map((bar) =>
    isFiniteNumber(bar?.high) && isFiniteNumber(bar?.low)
      ? (bar.high + bar.low) / 2
      : Number.NaN,
  );
  const jawSmma = applyLineAlligatorSmma(median, jawPeriod);
  const teethSmma = applyLineAlligatorSmma(median, teethPeriod);
  const lipsSmma = applyLineAlligatorSmma(median, lipsPeriod);
  const jaw: Array<number | null> = [];
  const teeth: Array<number | null> = [];
  const lips: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const jawSrc = i - jawShift >= 0 ? jawSmma[i - jawShift] : null;
    const teethSrc = i - teethShift >= 0 ? teethSmma[i - teethShift] : null;
    const lipsSrc = i - lipsShift >= 0 ? lipsSmma[i - lipsShift] : null;
    jaw.push(
      jawSrc == null || !isFiniteNumber(jawSrc) ? null : jawSrc,
    );
    teeth.push(
      teethSrc == null || !isFiniteNumber(teethSrc) ? null : teethSrc,
    );
    lips.push(
      lipsSrc == null || !isFiniteNumber(lipsSrc) ? null : lipsSrc,
    );
  }
  return { median, jaw, teeth, lips };
}

/**
 * Classify the alligator state at a bar:
 *   * `eating` -- lips > teeth > jaw (strong uptrend) or
 *                 lips < teeth < jaw (strong downtrend)
 *   * `awake`  -- lines are stacked but with some inversion
 *                 (transitional)
 *   * `sleeping` -- lines are interleaved or coincident (no
 *                   directional trend)
 *   * `none`  -- any of the three lines is null (warmup)
 */
export function classifyLineAlligatorZone(
  jaw: number | null,
  teeth: number | null,
  lips: number | null,
): ChartLineAlligatorZone {
  if (
    jaw == null ||
    teeth == null ||
    lips == null ||
    !isFiniteNumber(jaw) ||
    !isFiniteNumber(teeth) ||
    !isFiniteNumber(lips)
  ) {
    return 'none';
  }
  if ((lips > teeth && teeth > jaw) || (lips < teeth && teeth < jaw)) {
    return 'eating';
  }
  // If any two of the three coincide, classify as sleeping.
  if (lips === teeth || teeth === jaw || lips === jaw) {
    return 'sleeping';
  }
  return 'awake';
}

/** Run the full pipeline plus sample classification. */
export function runLineAlligator(
  data: readonly ChartLineAlligatorPoint[] | null | undefined,
  options: ChartLineAlligatorOptions = {},
): ChartLineAlligatorRun {
  const series = getLineAlligatorFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const jawPeriod = normalizeLineAlligatorPeriod(
    options.jawPeriod,
    DEFAULT_CHART_LINE_ALLIGATOR_JAW_PERIOD,
  );
  const jawShift = normalizeLineAlligatorShift(
    options.jawShift,
    DEFAULT_CHART_LINE_ALLIGATOR_JAW_SHIFT,
  );
  const teethPeriod = normalizeLineAlligatorPeriod(
    options.teethPeriod,
    DEFAULT_CHART_LINE_ALLIGATOR_TEETH_PERIOD,
  );
  const teethShift = normalizeLineAlligatorShift(
    options.teethShift,
    DEFAULT_CHART_LINE_ALLIGATOR_TEETH_SHIFT,
  );
  const lipsPeriod = normalizeLineAlligatorPeriod(
    options.lipsPeriod,
    DEFAULT_CHART_LINE_ALLIGATOR_LIPS_PERIOD,
  );
  const lipsShift = normalizeLineAlligatorShift(
    options.lipsShift,
    DEFAULT_CHART_LINE_ALLIGATOR_LIPS_SHIFT,
  );
  const channels = computeLineAlligator(series, {
    jawPeriod,
    jawShift,
    teethPeriod,
    teethShift,
    lipsPeriod,
    lipsShift,
  });
  const samples: ChartLineAlligatorSample[] = series.map((point, index) => {
    const jaw = channels.jaw[index] ?? null;
    const teeth = channels.teeth[index] ?? null;
    const lips = channels.lips[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      median: channels.median[index] ?? Number.NaN,
      jaw,
      teeth,
      lips,
      zone: classifyLineAlligatorZone(jaw, teeth, lips),
    };
  });
  let eatingCount = 0;
  let awakeCount = 0;
  let sleepingCount = 0;
  let noneCount = 0;
  let jawFinal: number | null = null;
  let teethFinal: number | null = null;
  let lipsFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'eating') eatingCount += 1;
    else if (sample.zone === 'awake') awakeCount += 1;
    else if (sample.zone === 'sleeping') sleepingCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.jaw)) jawFinal = sample.jaw;
    if (isFiniteNumber(sample.teeth)) teethFinal = sample.teeth;
    if (isFiniteNumber(sample.lips)) lipsFinal = sample.lips;
  }
  return {
    series,
    jawPeriod,
    jawShift,
    teethPeriod,
    teethShift,
    lipsPeriod,
    lipsShift,
    median: channels.median,
    jaw: channels.jaw,
    teeth: channels.teeth,
    lips: channels.lips,
    samples,
    jawFinal,
    teethFinal,
    lipsFinal,
    eatingCount,
    awakeCount,
    sleepingCount,
    noneCount,
    ok: series.length >= jawPeriod + jawShift,
  };
}

export interface ChartLineAlligatorLayoutOptions
  extends ChartLineAlligatorOptions {
  data: readonly ChartLineAlligatorPoint[] | null | undefined;
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
export function computeLineAlligatorLayout(
  options: ChartLineAlligatorLayoutOptions,
): ChartLineAlligatorLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ALLIGATOR_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ALLIGATOR_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ALLIGATOR_PADDING;

  const run = runLineAlligator(options.data, {
    ...(options.jawPeriod !== undefined
      ? { jawPeriod: options.jawPeriod }
      : {}),
    ...(options.jawShift !== undefined
      ? { jawShift: options.jawShift }
      : {}),
    ...(options.teethPeriod !== undefined
      ? { teethPeriod: options.teethPeriod }
      : {}),
    ...(options.teethShift !== undefined
      ? { teethShift: options.teethShift }
      : {}),
    ...(options.lipsPeriod !== undefined
      ? { lipsPeriod: options.lipsPeriod }
      : {}),
    ...(options.lipsShift !== undefined
      ? { lipsShift: options.lipsShift }
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

  // y-range covers close and all three alligator lines.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < yMin) yMin = sample.close;
    if (sample.close > yMax) yMax = sample.close;
    const values = [sample.jaw, sample.teeth, sample.lips];
    for (const v of values) {
      if (v != null && isFiniteNumber(v)) {
        if (v < yMin) yMin = v;
        if (v > yMax) yMax = v;
      }
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
  const priceDots: ChartLineAlligatorDot[] = [];
  const jawPoints: Array<{ x: number; y: number }> = [];
  const teethPoints: Array<{ x: number; y: number }> = [];
  const lipsPoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAlligatorMarker[] = [];

  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cyClose = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cyClose });
    priceDots.push({ index, x: sample.x, cx, cy: cyClose, close: sample.close });
    if (isFiniteNumber(sample.jaw)) {
      jawPoints.push({ x: cx, y: yAt(sample.jaw) });
    }
    if (isFiniteNumber(sample.teeth)) {
      teethPoints.push({ x: cx, y: yAt(sample.teeth) });
    }
    if (isFiniteNumber(sample.lips)) {
      lipsPoints.push({ x: cx, y: yAt(sample.lips) });
    }
    if (
      isFiniteNumber(sample.jaw) &&
      isFiniteNumber(sample.teeth) &&
      isFiniteNumber(sample.lips)
    ) {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yAt(sample.teeth),
        close: sample.close,
        jaw: sample.jaw,
        teeth: sample.teeth,
        lips: sample.lips,
        zone: sample.zone,
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
    jawPath: buildLinePath(jawPoints),
    teethPath: buildLinePath(teethPoints),
    lipsPath: buildLinePath(lipsPoints),
    markers,
    yMin,
    yMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAlligatorChart(
  data: readonly ChartLineAlligatorPoint[] | null | undefined,
  options: ChartLineAlligatorOptions = {},
): string {
  const run = runLineAlligator(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalJaw =
    run.jawFinal === null ? 'n/a' : run.jawFinal.toFixed(4);
  return (
    `Single-panel chart with a Bill Williams Alligator overlay on ` +
    `the close. The Alligator is three smoothed moving averages ` +
    `(SMMA) of the median price (high + low) / 2 shifted forward: ` +
    `jaw is SMMA(${run.jawPeriod}) shifted ${run.jawShift} bars, ` +
    `teeth is SMMA(${run.teethPeriod}) shifted ${run.teethShift} ` +
    `bars, lips is SMMA(${run.lipsPeriod}) shifted ` +
    `${run.lipsShift} bars. Across ${total} bars the alligator ` +
    `state reads eating on ${run.eatingCount}, awake on ` +
    `${run.awakeCount}, sleeping on ${run.sleepingCount}, and ` +
    `undefined on ${run.noneCount}. The final jaw value is ` +
    `${finalJaw}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatAlligator(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineAlligatorZone,
  eatingColor: string,
  awakeColor: string,
  sleepingColor: string,
  noneColor: string,
): string {
  if (zone === 'eating') return eatingColor;
  if (zone === 'awake') return awakeColor;
  if (zone === 'sleeping') return sleepingColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineAlligatorZone): string {
  if (zone === 'eating') return 'Eating (Trending)';
  if (zone === 'awake') return 'Awake (Transitional)';
  if (zone === 'sleeping') return 'Sleeping (Range)';
  return 'n/a';
}

/** ChartLineAlligator -- single-panel pure-SVG chart. */
export const ChartLineAlligator = forwardRef<
  HTMLDivElement,
  ChartLineAlligatorProps
>(function ChartLineAlligator(props, ref) {
  const {
    data,
    jawPeriod = DEFAULT_CHART_LINE_ALLIGATOR_JAW_PERIOD,
    jawShift = DEFAULT_CHART_LINE_ALLIGATOR_JAW_SHIFT,
    teethPeriod = DEFAULT_CHART_LINE_ALLIGATOR_TEETH_PERIOD,
    teethShift = DEFAULT_CHART_LINE_ALLIGATOR_TEETH_SHIFT,
    lipsPeriod = DEFAULT_CHART_LINE_ALLIGATOR_LIPS_PERIOD,
    lipsShift = DEFAULT_CHART_LINE_ALLIGATOR_LIPS_SHIFT,
    width = DEFAULT_CHART_LINE_ALLIGATOR_WIDTH,
    height = DEFAULT_CHART_LINE_ALLIGATOR_HEIGHT,
    padding = DEFAULT_CHART_LINE_ALLIGATOR_PADDING,
    tickCount = DEFAULT_CHART_LINE_ALLIGATOR_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ALLIGATOR_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ALLIGATOR_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ALLIGATOR_PRICE_COLOR,
    jawColor = DEFAULT_CHART_LINE_ALLIGATOR_JAW_COLOR,
    teethColor = DEFAULT_CHART_LINE_ALLIGATOR_TEETH_COLOR,
    lipsColor = DEFAULT_CHART_LINE_ALLIGATOR_LIPS_COLOR,
    eatingColor = DEFAULT_CHART_LINE_ALLIGATOR_EATING_COLOR,
    awakeColor = DEFAULT_CHART_LINE_ALLIGATOR_AWAKE_COLOR,
    sleepingColor = DEFAULT_CHART_LINE_ALLIGATOR_SLEEPING_COLOR,
    noneColor = DEFAULT_CHART_LINE_ALLIGATOR_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_ALLIGATOR_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ALLIGATOR_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showJaw = true,
    showTeeth = true,
    showLips = true,
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
    formatAlligator = defaultFormatAlligator,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-alligator-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAlligatorSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAlligatorSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAlligatorLayout({
        data,
        jawPeriod,
        jawShift,
        teethPeriod,
        teethShift,
        lipsPeriod,
        lipsShift,
        width,
        height,
        padding,
      }),
    [
      data,
      jawPeriod,
      jawShift,
      teethPeriod,
      teethShift,
      lipsPeriod,
      lipsShift,
      width,
      height,
      padding,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineAlligatorChart(data, {
      jawPeriod,
      jawShift,
      teethPeriod,
      teethShift,
      lipsPeriod,
      lipsShift,
    });
  const resolvedLabel = ariaLabel ?? 'Bill Williams Alligator chart';

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAlligatorSeriesId): void => {
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
        data-section="chart-line-alligator-tooltip"
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
          data-section="chart-line-alligator-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-alligator-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-alligator-tooltip-median"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Median: ${formatPrice(hoverSample.median)}`}
        </text>
        <text
          data-section="chart-line-alligator-tooltip-jaw"
          x={tx + 10}
          y={ty + 67}
          fill="#60a5fa"
          fontSize={11}
        >
          {`Jaw: ${
            hoverSample.jaw === null
              ? 'n/a'
              : formatAlligator(hoverSample.jaw)
          }`}
        </text>
        <text
          data-section="chart-line-alligator-tooltip-teeth"
          x={tx + 10}
          y={ty + 83}
          fill="#fca5a5"
          fontSize={11}
        >
          {`Teeth: ${
            hoverSample.teeth === null
              ? 'n/a'
              : formatAlligator(hoverSample.teeth)
          }`}
        </text>
        <text
          data-section="chart-line-alligator-tooltip-lips"
          x={tx + 10}
          y={ty + 99}
          fill="#86efac"
          fontSize={11}
        >
          {`Lips: ${
            hoverSample.lips === null
              ? 'n/a'
              : formatAlligator(hoverSample.lips)
          }`}
        </text>
        <text
          data-section="chart-line-alligator-tooltip-zone"
          x={tx + 10}
          y={ty + 115}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const jawHidden = isHidden('jaw') || !showJaw;
  const teethHidden = isHidden('teeth') || !showTeeth;
  const lipsHidden = isHidden('lips') || !showLips;

  const legendItems: Array<{
    id: ChartLineAlligatorSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    {
      id: 'jaw',
      label: `Jaw (${run.jawPeriod}/${run.jawShift})`,
      color: jawColor,
    },
    {
      id: 'teeth',
      label: `Teeth (${run.teethPeriod}/${run.teethShift})`,
      color: teethColor,
    },
    {
      id: 'lips',
      label: `Lips (${run.lipsPeriod}/${run.lipsShift})`,
      color: lipsColor,
    },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-alligator"
      data-empty={isEmpty ? 'true' : 'false'}
      data-jaw-period={run.jawPeriod}
      data-jaw-shift={run.jawShift}
      data-teeth-period={run.teethPeriod}
      data-teeth-shift={run.teethShift}
      data-lips-period={run.lipsPeriod}
      data-lips-shift={run.lipsShift}
      data-jaw-final={run.jawFinal === null ? '' : run.jawFinal}
      data-teeth-final={run.teethFinal === null ? '' : run.teethFinal}
      data-lips-final={run.lipsFinal === null ? '' : run.lipsFinal}
      data-eating-count={run.eatingCount}
      data-awake-count={run.awakeCount}
      data-sleeping-count={run.sleepingCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-alligator-aria-desc"
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
          data-section="chart-line-alligator-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-alligator-empty"
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
          data-section="chart-line-alligator-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-alligator-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-alligator-grid-line"
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
            <g data-section="chart-line-alligator-axes">
              <line
                data-section="chart-line-alligator-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-alligator-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-alligator-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMax)}
              </text>
              <text
                data-section="chart-line-alligator-tick-label"
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

          {!jawHidden ? (
            <path
              data-section="chart-line-alligator-jaw-path"
              d={layout.jawPath}
              fill="none"
              stroke={jawColor}
              strokeWidth={1.5}
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Alligator Jaw"
            />
          ) : null}
          {!teethHidden ? (
            <path
              data-section="chart-line-alligator-teeth-path"
              d={layout.teethPath}
              fill="none"
              stroke={teethColor}
              strokeWidth={1.5}
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Alligator Teeth"
            />
          ) : null}
          {!lipsHidden ? (
            <path
              data-section="chart-line-alligator-lips-path"
              d={layout.lipsPath}
              fill="none"
              stroke={lipsColor}
              strokeWidth={1.5}
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Alligator Lips"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-alligator-price-path"
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
            <g data-section="chart-line-alligator-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-alligator-dot"
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
            <g data-section="chart-line-alligator-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-alligator-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-jaw={marker.jaw}
                  data-teeth={marker.teeth}
                  data-lips={marker.lips}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    eatingColor,
                    awakeColor,
                    sleepingColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, ${zoneLabelOf(marker.zone)}`}
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
            <g data-section="chart-line-alligator-badge">
              <rect
                data-section="chart-line-alligator-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={180}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-alligator-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Alligator ${run.jawPeriod}/${run.teethPeriod}/${run.lipsPeriod}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-alligator-legend"
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
                data-section="chart-line-alligator-legend-item"
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
                  data-section="chart-line-alligator-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-alligator-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-alligator-legend-stats"
            style={{ color: axisColor }}
          >
            {`eating ${run.eatingCount} / awake ${run.awakeCount} / sleeping ${run.sleepingCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAlligator.displayName = 'ChartLineAlligator';
