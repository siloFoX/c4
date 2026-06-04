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
 * ChartLineRecombiningKc -- pure-SVG single-panel chart with the close
 * overlaid by a "recombining" Keltner Channel envelope. Standard band
 * is `EMA(close, length) +/- multiplier * ATR(atrLength)`, but the
 * upper/lower lines **collapse to the EMA mean** on bars where the
 * close touches or breaches the band (band-touch reset trigger):
 *
 *   mean[i]      = EMA(close, length)[i]  (SMA-seeded at i = length - 1)
 *   tr[i]        = max(high - low, |high - prevClose|, |low - prevClose|)
 *   atr[i]       = SMA(tr, atrLength)[i]
 *   fullUpper[i] = mean[i] + multiplier * atr[i]
 *   fullLower[i] = mean[i] - multiplier * atr[i]
 *   recombine[i] = close[i] >= fullUpper[i] || close[i] <= fullLower[i]
 *   upper[i]     = recombine[i] ? mean[i] : fullUpper[i]
 *   lower[i]     = recombine[i] ? mean[i] : fullLower[i]
 *
 * Defaults: `length = 20`, `atrLength = 10`, `multiplier = 2`. Warmup
 * ends at the later of the EMA seed (`i = length - 1`) and the ATR
 * fill (`i = atrLength`); markers anchor on the mean at recombine
 * bars.
 *
 * Bit-exact anchor: **CONST high=low=close=K**: `tr = 0` everywhere
 * -> `atr = 0`; the EMA of a constant is the constant (SMA seed = K,
 * EMA recurrence preserves the value), so `mean = K`, `fullUpper =
 * fullLower = K`, and the `>=` trigger fires every valid bar. All
 * four series read exactly `K`. Verified across `K in
 * {0, 1, 5, 100, -3}`, `length in {3, 5, 7, 10}`, and `multiplier in
 * {0, 1, 2, 3}` in the integration sweep.
 *
 * **`multiplier = 0`**: `fullUpper = fullLower = mean`. Any close
 * `!= mean` triggers recombine via `>=` or `<=` equality (since
 * `close > mean` implies `close >= mean = fullUpper`). Verified.
 */

export interface ChartLineRecombiningKcPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineRecombiningKcZone =
  | 'recombine'
  | 'above-mid'
  | 'below-mid'
  | 'at-mid'
  | 'none';

export type ChartLineRecombiningKcSeriesId = 'price' | 'kc';

export interface ChartLineRecombiningKcSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  mean: number | null;
  atr: number | null;
  fullUpper: number | null;
  fullLower: number | null;
  upper: number | null;
  lower: number | null;
  recombine: boolean;
  zone: ChartLineRecombiningKcZone;
}

export interface ChartLineRecombiningKcRun {
  series: ChartLineRecombiningKcPoint[];
  length: number;
  atrLength: number;
  multiplier: number;
  meanValues: Array<number | null>;
  atrValues: Array<number | null>;
  fullUpperValues: Array<number | null>;
  fullLowerValues: Array<number | null>;
  upperValues: Array<number | null>;
  lowerValues: Array<number | null>;
  recombineFlags: boolean[];
  samples: ChartLineRecombiningKcSample[];
  recombineCount: number;
  aboveMidCount: number;
  belowMidCount: number;
  atMidCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineRecombiningKcMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  mean: number;
}

export interface ChartLineRecombiningKcDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRecombiningKcLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineRecombiningKcDot[];
  meanPath: string;
  upperPath: string;
  lowerPath: string;
  markers: ChartLineRecombiningKcMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineRecombiningKcRun;
}

export interface ChartLineRecombiningKcProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRecombiningKcPoint[];
  length?: number;
  atrLength?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  kcStrokeWidth?: number;
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
  showKc?: boolean;
  showMean?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRecombiningKcSeriesId[];
  defaultHiddenSeries?: ChartLineRecombiningKcSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRecombiningKcSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineRecombiningKcSample }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RECOMBINING_KC_WIDTH = 720;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_HEIGHT = 400;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_PADDING = 44;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_KC_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_LENGTH = 20;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_ATR_LENGTH = 10;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_RECOMBINING_KC_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RECOMBINING_KC_MEAN_COLOR = '#475569';
export const DEFAULT_CHART_LINE_RECOMBINING_KC_BAND_COLOR = '#a855f7';
export const DEFAULT_CHART_LINE_RECOMBINING_KC_RECOMBINE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RECOMBINING_KC_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RECOMBINING_KC_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC fields. */
export function getLineRecombiningKcFinitePoints(
  data: readonly ChartLineRecombiningKcPoint[] | null | undefined,
): ChartLineRecombiningKcPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRecombiningKcPoint[] = [];
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
export function normalizeLineRecombiningKcLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer ATR length (>= 1). */
export function normalizeLineRecombiningKcAtrLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite multiplier. */
export function normalizeLineRecombiningKcMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier >= 0) return multiplier;
  return fallback;
}

/**
 * SMA-seeded EMA. The first valid value is at `i = length - 1` (the
 * SMA of the first `length` values). Subsequent bars recurse with
 * `EMA[i] = alpha * close[i] + (1 - alpha) * EMA[i - 1]` where
 * `alpha = 2 / (length + 1)`.
 */
export function applyLineRecombiningKcEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length <= 0) return out;
  // SMA seed.
  let sum = 0;
  let ok = true;
  for (let k = 0; k < length && k < values.length; k += 1) {
    const v = values[k];
    if (v == null || !isFiniteNumber(v)) {
      ok = false;
      break;
    }
    sum += v;
  }
  if (!ok || values.length < length) return out;
  const alpha = 2 / (length + 1);
  let prev = sum / length;
  out[length - 1] = prev;
  for (let i = length; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      // Hold the previous EMA value but mark the current bar null
      // to avoid propagating stale data through gaps.
      out[i] = null;
      continue;
    }
    // CONST short-circuit: if input matches the previous EMA value
    // exactly, the recurrence collapses to v -- but the explicit
    // arithmetic `alpha * v + (1 - alpha) * v` can drift by 1 ULP
    // for non-dyadic alpha (e.g. 1/3 at length=5). Pass through to
    // keep the CONST anchor bit-exact.
    const next: number = v === prev ? v : alpha * v + (1 - alpha) * prev;
    out[i] = next;
    prev = next;
  }
  return out;
}

/** Per-bar True Range. First bar uses `high - low` (no prev close). */
export function applyLineRecombiningKcTrueRange(
  series: readonly ChartLineRecombiningKcPoint[],
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < series.length; i += 1) {
    const point = series[i]!;
    if (
      !isFiniteNumber(point.high) ||
      !isFiniteNumber(point.low) ||
      !isFiniteNumber(point.close)
    ) {
      out.push(null);
      continue;
    }
    if (i === 0) {
      out.push(point.high - point.low);
      continue;
    }
    const prev = series[i - 1]!;
    if (!isFiniteNumber(prev.close)) {
      out.push(point.high - point.low);
      continue;
    }
    const r1 = point.high - point.low;
    const r2 = Math.abs(point.high - prev.close);
    const r3 = Math.abs(point.low - prev.close);
    out.push(Math.max(r1, r2, r3));
  }
  return out;
}

/** Rolling SMA of TR. */
export function applyLineRecombiningKcAtr(
  trValues: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(trValues) || trValues.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < trValues.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = trValues[i - j];
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

export interface ChartLineRecombiningKcOptions {
  length?: number;
  atrLength?: number;
  multiplier?: number;
}

export interface ChartLineRecombiningKcChannels {
  mean: Array<number | null>;
  atr: Array<number | null>;
  fullUpper: Array<number | null>;
  fullLower: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  recombine: boolean[];
}

/** Compute the recombining Keltner Channel pipeline. */
export function computeLineRecombiningKc(
  series: readonly ChartLineRecombiningKcPoint[] | null | undefined,
  options: ChartLineRecombiningKcOptions = {},
): ChartLineRecombiningKcChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return {
      mean: [],
      atr: [],
      fullUpper: [],
      fullLower: [],
      upper: [],
      lower: [],
      recombine: [],
    };
  }
  const length = normalizeLineRecombiningKcLength(
    options.length,
    DEFAULT_CHART_LINE_RECOMBINING_KC_LENGTH,
  );
  const atrLength = normalizeLineRecombiningKcAtrLength(
    options.atrLength,
    DEFAULT_CHART_LINE_RECOMBINING_KC_ATR_LENGTH,
  );
  const multiplier = normalizeLineRecombiningKcMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_RECOMBINING_KC_MULTIPLIER,
  );
  const closes = series.map((p) => p.close);
  const mean = applyLineRecombiningKcEma(closes, length);
  const tr = applyLineRecombiningKcTrueRange(series);
  const atr = applyLineRecombiningKcAtr(tr, atrLength);
  const fullUpper: Array<number | null> = [];
  const fullLower: Array<number | null> = [];
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  const recombine: boolean[] = [];
  for (let i = 0; i < series.length; i += 1) {
    const m = mean[i];
    const a = atr[i];
    const c = series[i]!.close;
    if (
      m == null ||
      a == null ||
      !isFiniteNumber(m) ||
      !isFiniteNumber(a) ||
      !isFiniteNumber(c)
    ) {
      fullUpper.push(null);
      fullLower.push(null);
      upper.push(null);
      lower.push(null);
      recombine.push(false);
      continue;
    }
    const fu = m + multiplier * a;
    const fl = m - multiplier * a;
    const fired = c >= fu || c <= fl;
    fullUpper.push(fu);
    fullLower.push(fl);
    upper.push(fired ? m : fu);
    lower.push(fired ? m : fl);
    recombine.push(fired);
  }
  return { mean, atr, fullUpper, fullLower, upper, lower, recombine };
}

/** Classify a sample. */
export function classifyLineRecombiningKcZone(
  close: number,
  mean: number | null,
  recombine: boolean,
): ChartLineRecombiningKcZone {
  if (mean == null || !isFiniteNumber(mean)) return 'none';
  if (recombine) return 'recombine';
  if (close > mean) return 'above-mid';
  if (close < mean) return 'below-mid';
  return 'at-mid';
}

/** Run the full pipeline plus sample classification. */
export function runLineRecombiningKc(
  data: readonly ChartLineRecombiningKcPoint[] | null | undefined,
  options: ChartLineRecombiningKcOptions = {},
): ChartLineRecombiningKcRun {
  const series = getLineRecombiningKcFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineRecombiningKcLength(
    options.length,
    DEFAULT_CHART_LINE_RECOMBINING_KC_LENGTH,
  );
  const atrLength = normalizeLineRecombiningKcAtrLength(
    options.atrLength,
    DEFAULT_CHART_LINE_RECOMBINING_KC_ATR_LENGTH,
  );
  const multiplier = normalizeLineRecombiningKcMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_RECOMBINING_KC_MULTIPLIER,
  );
  const channels = computeLineRecombiningKc(series, {
    length,
    atrLength,
    multiplier,
  });
  const samples: ChartLineRecombiningKcSample[] = series.map(
    (point, index) => {
      const meanValue = channels.mean[index] ?? null;
      const recombineValue = channels.recombine[index] ?? false;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        mean: meanValue,
        atr: channels.atr[index] ?? null,
        fullUpper: channels.fullUpper[index] ?? null,
        fullLower: channels.fullLower[index] ?? null,
        upper: channels.upper[index] ?? null,
        lower: channels.lower[index] ?? null,
        recombine: recombineValue,
        zone: classifyLineRecombiningKcZone(
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
    series,
    length,
    atrLength,
    multiplier,
    meanValues: channels.mean,
    atrValues: channels.atr,
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
    ok: series.length >= Math.max(length, atrLength),
  };
}

export interface ChartLineRecombiningKcLayoutOptions
  extends ChartLineRecombiningKcOptions {
  data: readonly ChartLineRecombiningKcPoint[] | null | undefined;
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
export function computeLineRecombiningKcLayout(
  options: ChartLineRecombiningKcLayoutOptions,
): ChartLineRecombiningKcLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_RECOMBINING_KC_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_RECOMBINING_KC_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_RECOMBINING_KC_PADDING;

  const run = runLineRecombiningKc(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.atrLength !== undefined
      ? { atrLength: options.atrLength }
      : {}),
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
  const priceDots: ChartLineRecombiningKcDot[] = [];
  const meanLinePoints: Array<{ x: number; y: number }> = [];
  const upperLinePoints: Array<{ x: number; y: number }> = [];
  const lowerLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineRecombiningKcMarker[] = [];
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
export function describeLineRecombiningKcChart(
  data: readonly ChartLineRecombiningKcPoint[] | null | undefined,
  options: ChartLineRecombiningKcOptions = {},
): string {
  const run = runLineRecombiningKc(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Single-panel chart with a recombining Keltner Channel envelope ` +
    `on the close (length ${run.length}, atrLength ${run.atrLength}, ` +
    `multiplier ${run.multiplier}). The standard band is EMA ` +
    `+/- multiplier * ATR; on bars where the close touches or breaches ` +
    `the band the upper and lower lines collapse to the EMA mean ` +
    `(recombine). Across ${total} bars the band recombined on ` +
    `${run.recombineCount} bars; ${run.aboveMidCount} closes were ` +
    `above the mean, ${run.belowMidCount} below, ${run.atMidCount} ` +
    `at the mean, and ${run.noneCount} undefined.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneLabelOf(zone: ChartLineRecombiningKcZone): string {
  if (zone === 'recombine') return 'Recombine';
  if (zone === 'above-mid') return 'Above mean';
  if (zone === 'below-mid') return 'Below mean';
  if (zone === 'at-mid') return 'At mean';
  return 'n/a';
}

/** ChartLineRecombiningKc -- single-panel pure-SVG chart. */
export const ChartLineRecombiningKc = forwardRef<
  HTMLDivElement,
  ChartLineRecombiningKcProps
>(function ChartLineRecombiningKc(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_RECOMBINING_KC_LENGTH,
    atrLength = DEFAULT_CHART_LINE_RECOMBINING_KC_ATR_LENGTH,
    multiplier = DEFAULT_CHART_LINE_RECOMBINING_KC_MULTIPLIER,
    width = DEFAULT_CHART_LINE_RECOMBINING_KC_WIDTH,
    height = DEFAULT_CHART_LINE_RECOMBINING_KC_HEIGHT,
    padding = DEFAULT_CHART_LINE_RECOMBINING_KC_PADDING,
    tickCount = DEFAULT_CHART_LINE_RECOMBINING_KC_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RECOMBINING_KC_STROKE_WIDTH,
    kcStrokeWidth = DEFAULT_CHART_LINE_RECOMBINING_KC_KC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RECOMBINING_KC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RECOMBINING_KC_PRICE_COLOR,
    meanColor = DEFAULT_CHART_LINE_RECOMBINING_KC_MEAN_COLOR,
    bandColor = DEFAULT_CHART_LINE_RECOMBINING_KC_BAND_COLOR,
    recombineColor = DEFAULT_CHART_LINE_RECOMBINING_KC_RECOMBINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_RECOMBINING_KC_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RECOMBINING_KC_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKc = true,
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
  const baseId = `chart-line-recombining-kc-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineRecombiningKcSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineRecombiningKcSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineRecombiningKcLayout({
        data,
        length,
        atrLength,
        multiplier,
        width,
        height,
        padding,
      }),
    [data, length, atrLength, multiplier, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineRecombiningKcChart(data, {
      length,
      atrLength,
      multiplier,
    });
  const resolvedLabel =
    ariaLabel ??
    `Recombining Keltner Channel chart, length ${run.length}, atr ${run.atrLength}, multiplier ${run.multiplier}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineRecombiningKcSeriesId): void => {
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
        data-section="chart-line-recombining-kc-tooltip"
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
          data-section="chart-line-recombining-kc-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-recombining-kc-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatPrice(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-recombining-kc-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-recombining-kc-tooltip-close"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-recombining-kc-tooltip-mean"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`EMA: ${
            hoverSample.mean === null
              ? 'n/a'
              : formatPrice(hoverSample.mean)
          }`}
        </text>
        <text
          data-section="chart-line-recombining-kc-tooltip-atr"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`ATR: ${
            hoverSample.atr === null
              ? 'n/a'
              : formatPrice(hoverSample.atr)
          }`}
        </text>
        <text
          data-section="chart-line-recombining-kc-tooltip-upper"
          x={tx + 10}
          y={ty + 115}
          fill="#d8b4fe"
          fontSize={11}
        >
          {`Upper: ${
            hoverSample.upper === null
              ? 'n/a'
              : formatPrice(hoverSample.upper)
          }`}
        </text>
        <text
          data-section="chart-line-recombining-kc-tooltip-lower"
          x={tx + 10}
          y={ty + 131}
          fill="#d8b4fe"
          fontSize={11}
        >
          {`Lower: ${
            hoverSample.lower === null
              ? 'n/a'
              : formatPrice(hoverSample.lower)
          }`}
        </text>
        <text
          data-section="chart-line-recombining-kc-tooltip-recombine"
          x={tx + 10}
          y={ty + 149}
          fill={hoverSample.recombine ? recombineColor : '#cbd5e1'}
          fontSize={11}
          fontWeight={hoverSample.recombine ? 600 : 400}
        >
          {`Recombine: ${hoverSample.recombine ? 'yes' : 'no'}`}
        </text>
        <text
          data-section="chart-line-recombining-kc-tooltip-zone"
          x={tx + 10}
          y={ty + 162}
          fill="#cbd5e1"
          fontSize={10}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const kcHidden = isHidden('kc') || !showKc;

  const legendItems: Array<{
    id: ChartLineRecombiningKcSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'kc', label: 'Recombining KC', color: bandColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-recombining-kc"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-atr-length={run.atrLength}
      data-multiplier={run.multiplier}
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
        data-section="chart-line-recombining-kc-aria-desc"
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
          data-section="chart-line-recombining-kc-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-recombining-kc-empty"
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
          data-section="chart-line-recombining-kc-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-recombining-kc-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-recombining-kc-grid-line"
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
            <g data-section="chart-line-recombining-kc-axes">
              <line
                data-section="chart-line-recombining-kc-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-recombining-kc-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-recombining-kc-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMax)}
              </text>
              <text
                data-section="chart-line-recombining-kc-tick-label"
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

          {!kcHidden ? (
            <g data-section="chart-line-recombining-kc-bands">
              <path
                data-section="chart-line-recombining-kc-upper-path"
                d={layout.upperPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={kcStrokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Recombining Keltner upper band`}
              />
              <path
                data-section="chart-line-recombining-kc-lower-path"
                d={layout.lowerPath}
                fill="none"
                stroke={bandColor}
                strokeWidth={kcStrokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Recombining Keltner lower band`}
              />
              {showMean ? (
                <path
                  data-section="chart-line-recombining-kc-mean-path"
                  d={layout.meanPath}
                  fill="none"
                  stroke={meanColor}
                  strokeWidth={kcStrokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray="3 3"
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`EMA mean line`}
                />
              ) : null}
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-recombining-kc-price-path"
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
            <g data-section="chart-line-recombining-kc-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-recombining-kc-dot"
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
            <g data-section="chart-line-recombining-kc-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-recombining-kc-marker"
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
            <g data-section="chart-line-recombining-kc-badge">
              <rect
                data-section="chart-line-recombining-kc-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={240}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-recombining-kc-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Recombining KC ${run.length}/${run.atrLength}/${run.multiplier}x`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-recombining-kc-legend"
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
                data-section="chart-line-recombining-kc-legend-item"
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
                  data-section="chart-line-recombining-kc-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-recombining-kc-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-recombining-kc-legend-stats"
            style={{ color: axisColor }}
          >
            {`recombines ${run.recombineCount} / above ${run.aboveMidCount} / below ${run.belowMidCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineRecombiningKc.displayName = 'ChartLineRecombiningKc';
