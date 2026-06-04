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
 * ChartLineBbFisher -- pure-SVG dual-panel chart with the close on
 * top and a Bollinger Band Fisher Transform oscillator on the bottom.
 * Each bar normalizes its position within the Bollinger envelope to
 * `[-1, +1]` and runs `atanh` to compress the tails into a smooth
 * unbounded oscillator that highlights extremes:
 *
 *   mean[i]      = SMA(close, length)[i]
 *   stdDev[i]    = popStdDev(close, length)[i]
 *   upper[i]     = mean[i] + sigma * stdDev[i]
 *   lower[i]     = mean[i] - sigma * stdDev[i]
 *   percentB[i]  = (upper[i] - lower[i] != 0)
 *                    ? (close[i] - lower[i]) / (upper[i] - lower[i])
 *                    : null
 *   normalized[i] = clamp(2 * percentB[i] - 1, -clampLimit, +clampLimit)
 *   fisher[i]    = Math.atanh(normalized[i])
 *
 * `fisher[i]` is `null` during warmup (`i < length - 1`) and when
 * `upper[i] == lower[i]` (degenerate band collapses %B to 0/0).
 * The clamp is necessary because `atanh(+/-1) = +/-Infinity`.
 *
 * Bit-exact anchor: **close at mean** -- if `close[i] == mean[i]` and
 * the band has nonzero width, `percentB = 0.5` exactly, so
 * `normalized = 0` and `fisher = atanh(0) = 0` (bit-exact).
 *
 * Additional bit-exact anchor: **ALTERNATING [0, 1, 0, 1, ...]** with
 * `length = 4` and `sigma = 2`. At bar 3: `mean = 0.5`, `stdDev = 0.5`,
 * `upper = 1.5`, `lower = -0.5`. With `close[3] = 1`:
 * `percentB = 1.5 / 2 = 0.75` (dyadic-exact),
 * `normalized = 0.5` (dyadic-exact),
 * `fisher = Math.atanh(0.5)` (deterministic IEEE 754 value, library
 * call). The test asserts equality against the literal
 * `Math.atanh(0.5)` so the anchor stays bit-exact in any JS runtime.
 */

export interface ChartLineBbFisherPoint {
  x: number;
  close: number;
}

export type ChartLineBbFisherZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineBbFisherCross = 'up' | 'down' | null;

export type ChartLineBbFisherSeriesId = 'price' | 'fisher';

export interface ChartLineBbFisherSample {
  index: number;
  x: number;
  close: number;
  mean: number | null;
  stdDev: number | null;
  upper: number | null;
  lower: number | null;
  percentB: number | null;
  normalized: number | null;
  fisher: number | null;
  zone: ChartLineBbFisherZone;
  crossed: ChartLineBbFisherCross;
}

export interface ChartLineBbFisherRun {
  series: ChartLineBbFisherPoint[];
  length: number;
  sigma: number;
  clampLimit: number;
  overbought: number;
  oversold: number;
  meanValues: Array<number | null>;
  stdDevValues: Array<number | null>;
  upperValues: Array<number | null>;
  lowerValues: Array<number | null>;
  percentBValues: Array<number | null>;
  normalizedValues: Array<number | null>;
  fisherValues: Array<number | null>;
  samples: ChartLineBbFisherSample[];
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineBbFisherMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  fisher: number;
  crossed: 'up' | 'down';
}

export interface ChartLineBbFisherDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineBbFisherLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  fisherTop: number;
  fisherBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineBbFisherDot[];
  fisherPath: string;
  zeroLineY: number;
  overboughtY: number;
  oversoldY: number;
  markers: ChartLineBbFisherMarker[];
  priceMin: number;
  priceMax: number;
  fisherMin: number;
  fisherMax: number;
  run: ChartLineBbFisherRun;
}

export interface ChartLineBbFisherProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineBbFisherPoint[];
  length?: number;
  sigma?: number;
  clampLimit?: number;
  overbought?: number;
  oversold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  fisherColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroLineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFisher?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineBbFisherSeriesId[];
  defaultHiddenSeries?: ChartLineBbFisherSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineBbFisherSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineBbFisherSample }) => void;
  formatPrice?: (value: number) => string;
  formatFisher?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_BB_FISHER_WIDTH = 720;
export const DEFAULT_CHART_LINE_BB_FISHER_HEIGHT = 460;
export const DEFAULT_CHART_LINE_BB_FISHER_PADDING = 44;
export const DEFAULT_CHART_LINE_BB_FISHER_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_BB_FISHER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BB_FISHER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_BB_FISHER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BB_FISHER_LENGTH = 20;
export const DEFAULT_CHART_LINE_BB_FISHER_SIGMA = 2;
export const DEFAULT_CHART_LINE_BB_FISHER_CLAMP_LIMIT = 0.999;
export const DEFAULT_CHART_LINE_BB_FISHER_OVERBOUGHT = 1.5;
export const DEFAULT_CHART_LINE_BB_FISHER_OVERSOLD = -1.5;
export const DEFAULT_CHART_LINE_BB_FISHER_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_BB_FISHER_FISHER_COLOR = '#8b5cf6';
export const DEFAULT_CHART_LINE_BB_FISHER_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BB_FISHER_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BB_FISHER_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_BB_FISHER_ZERO_LINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_BB_FISHER_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BB_FISHER_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineBbFisherFinitePoints(
  data: readonly ChartLineBbFisherPoint[] | null | undefined,
): ChartLineBbFisherPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineBbFisherPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineBbFisherLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite sigma. */
export function normalizeLineBbFisherSigma(
  sigma: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(sigma) && sigma >= 0) return sigma;
  return fallback;
}

/** Coerce a clamp limit in (0, 1). */
export function normalizeLineBbFisherClampLimit(
  limit: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(limit) && limit > 0 && limit < 1) return limit;
  return fallback;
}

/** Coerce a finite threshold value. */
export function normalizeLineBbFisherThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold)) return threshold;
  return fallback;
}

/** Rolling SMA helper. */
export function applyLineBbFisherSma(
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

/** Rolling population standard deviation. */
export function applyLineBbFisherPopStdDev(
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

export interface ChartLineBbFisherOptions {
  length?: number;
  sigma?: number;
  clampLimit?: number;
  overbought?: number;
  oversold?: number;
}

export interface ChartLineBbFisherChannels {
  mean: Array<number | null>;
  stdDev: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  percentB: Array<number | null>;
  normalized: Array<number | null>;
  fisher: Array<number | null>;
}

/** Compute the BB Fisher pipeline. */
export function computeLineBbFisher(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineBbFisherOptions = {},
): ChartLineBbFisherChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return {
      mean: [],
      stdDev: [],
      upper: [],
      lower: [],
      percentB: [],
      normalized: [],
      fisher: [],
    };
  }
  const length = normalizeLineBbFisherLength(
    options.length,
    DEFAULT_CHART_LINE_BB_FISHER_LENGTH,
  );
  const sigma = normalizeLineBbFisherSigma(
    options.sigma,
    DEFAULT_CHART_LINE_BB_FISHER_SIGMA,
  );
  const clampLimit = normalizeLineBbFisherClampLimit(
    options.clampLimit,
    DEFAULT_CHART_LINE_BB_FISHER_CLAMP_LIMIT,
  );
  const mean = applyLineBbFisherSma(closes, length);
  const stdDev = applyLineBbFisherPopStdDev(closes, mean, length);
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  const percentB: Array<number | null> = [];
  const normalized: Array<number | null> = [];
  const fisher: Array<number | null> = [];
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
      upper.push(null);
      lower.push(null);
      percentB.push(null);
      normalized.push(null);
      fisher.push(null);
      continue;
    }
    const u = m + sigma * s;
    const l = m - sigma * s;
    upper.push(u);
    lower.push(l);
    const width = u - l;
    if (width <= 0) {
      percentB.push(null);
      normalized.push(null);
      fisher.push(null);
      continue;
    }
    const pb = (c - l) / width;
    percentB.push(pb);
    let n = 2 * pb - 1;
    if (n > clampLimit) n = clampLimit;
    if (n < -clampLimit) n = -clampLimit;
    normalized.push(n);
    fisher.push(Math.atanh(n));
  }
  return { mean, stdDev, upper, lower, percentB, normalized, fisher };
}

/** Classify a fisher reading. */
export function classifyLineBbFisherZone(
  value: number | null,
  overbought: number,
  oversold: number,
): ChartLineBbFisherZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= overbought) return 'overbought';
  if (value <= oversold) return 'oversold';
  return 'neutral';
}

/**
 * Detect overbought/oversold crosses. A bar transitions `'up'` when
 * the previous defined value was `< overbought` and the current is
 * `>= overbought`; mirror for `'down'` at the oversold threshold.
 */
export function detectLineBbFisherCrosses(
  values: readonly (number | null)[],
  overbought: number,
  oversold: number,
): Array<ChartLineBbFisherCross> {
  const out: Array<ChartLineBbFisherCross> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev < overbought && v >= overbought) {
      out.push('up');
    } else if (prev > oversold && v <= oversold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineBbFisher(
  data: readonly ChartLineBbFisherPoint[] | null | undefined,
  options: ChartLineBbFisherOptions = {},
): ChartLineBbFisherRun {
  const series = getLineBbFisherFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineBbFisherLength(
    options.length,
    DEFAULT_CHART_LINE_BB_FISHER_LENGTH,
  );
  const sigma = normalizeLineBbFisherSigma(
    options.sigma,
    DEFAULT_CHART_LINE_BB_FISHER_SIGMA,
  );
  const clampLimit = normalizeLineBbFisherClampLimit(
    options.clampLimit,
    DEFAULT_CHART_LINE_BB_FISHER_CLAMP_LIMIT,
  );
  const overbought = normalizeLineBbFisherThreshold(
    options.overbought,
    DEFAULT_CHART_LINE_BB_FISHER_OVERBOUGHT,
  );
  const oversold = normalizeLineBbFisherThreshold(
    options.oversold,
    DEFAULT_CHART_LINE_BB_FISHER_OVERSOLD,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineBbFisher(closes, {
    length,
    sigma,
    clampLimit,
  });
  const crosses = detectLineBbFisherCrosses(
    channels.fisher,
    overbought,
    oversold,
  );
  const samples: ChartLineBbFisherSample[] = series.map((point, index) => {
    const value = channels.fisher[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      mean: channels.mean[index] ?? null,
      stdDev: channels.stdDev[index] ?? null,
      upper: channels.upper[index] ?? null,
      lower: channels.lower[index] ?? null,
      percentB: channels.percentB[index] ?? null,
      normalized: channels.normalized[index] ?? null,
      fisher: value,
      zone: classifyLineBbFisherZone(value, overbought, oversold),
      crossed: crosses[index] ?? null,
    };
  });
  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series,
    length,
    sigma,
    clampLimit,
    overbought,
    oversold,
    meanValues: channels.mean,
    stdDevValues: channels.stdDev,
    upperValues: channels.upper,
    lowerValues: channels.lower,
    percentBValues: channels.percentB,
    normalizedValues: channels.normalized,
    fisherValues: channels.fisher,
    samples,
    overboughtCount,
    oversoldCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length,
  };
}

export interface ChartLineBbFisherLayoutOptions
  extends ChartLineBbFisherOptions {
  data: readonly ChartLineBbFisherPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
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

/** Project the run into a dual-panel SVG layout. */
export function computeLineBbFisherLayout(
  options: ChartLineBbFisherLayoutOptions,
): ChartLineBbFisherLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_BB_FISHER_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_BB_FISHER_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_BB_FISHER_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_BB_FISHER_PANEL_GAP;

  const run = runLineBbFisher(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.sigma !== undefined ? { sigma: options.sigma } : {}),
    ...(options.clampLimit !== undefined
      ? { clampLimit: options.clampLimit }
      : {}),
    ...(options.overbought !== undefined
      ? { overbought: options.overbought }
      : {}),
    ...(options.oversold !== undefined
      ? { oversold: options.oversold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const fisherHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const fisherTop = priceBottom + panelGap;
  const fisherBottom = fisherTop + fisherHeight;

  const okGeom = innerWidth > 0 && innerHeight > panelGap;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < priceMin) priceMin = sample.close;
    if (sample.close > priceMax) priceMax = sample.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }
  const priceY = (value: number): number =>
    priceBottom - ((value - priceMin) / (priceMax - priceMin)) * priceHeight;

  // Fisher panel: auto-scale but always include zero and the
  // overbought/oversold thresholds.
  let fisherMin = Math.min(run.oversold * 1.25, -1);
  let fisherMax = Math.max(run.overbought * 1.25, 1);
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.fisher)) {
      if (sample.fisher < fisherMin) fisherMin = sample.fisher;
      if (sample.fisher > fisherMax) fisherMax = sample.fisher;
    }
  }
  if (fisherMin === fisherMax) {
    fisherMin -= 1;
    fisherMax += 1;
  }
  const fisherY = (value: number): number =>
    fisherBottom -
    ((value - fisherMin) / (fisherMax - fisherMin)) * fisherHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineBbFisherDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const fisherLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineBbFisherMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.fisher)) return;
    const cx = xAt(index);
    const yc = fisherY(sample.fisher);
    fisherLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        fisher: sample.fisher,
        crossed: sample.crossed,
      });
    }
  });

  const zeroLineY = fisherY(0);
  const overboughtY = fisherY(run.overbought);
  const oversoldY = fisherY(run.oversold);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    fisherTop,
    fisherBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    fisherPath: buildLinePath(fisherLinePoints),
    zeroLineY,
    overboughtY,
    oversoldY,
    markers,
    priceMin,
    priceMax,
    fisherMin,
    fisherMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineBbFisherChart(
  data: readonly ChartLineBbFisherPoint[] | null | undefined,
  options: ChartLineBbFisherOptions = {},
): string {
  const run = runLineBbFisher(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Bollinger Band Fisher Transform ` +
    `oscillator beneath the close (length ${run.length}, sigma ` +
    `${run.sigma}, clampLimit ${run.clampLimit}, overbought ` +
    `${run.overbought}, oversold ${run.oversold}). Each bar ` +
    `normalizes percentB to [-1, 1] and applies atanh; the result is ` +
    `an unbounded oscillator that highlights extremes. Across ${total} ` +
    `bars the fisher was overbought on ${run.overboughtCount}, ` +
    `oversold on ${run.oversoldCount}, neutral on ${run.neutralCount}, ` +
    `and undefined on ${run.noneCount}, with ${run.bullishCrossCount} ` +
    `overbought entries and ${run.bearishCrossCount} oversold entries.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatFisher(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function markerColorOf(
  crossed: 'up' | 'down',
  bullishColor: string,
  bearishColor: string,
): string {
  if (crossed === 'up') return bullishColor;
  return bearishColor;
}

function zoneLabelOf(zone: ChartLineBbFisherZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineBbFisherCross): string {
  if (crossed === 'up') return 'Entered overbought';
  if (crossed === 'down') return 'Entered oversold';
  return '-';
}

/** ChartLineBbFisher -- dual-panel pure-SVG chart. */
export const ChartLineBbFisher = forwardRef<
  HTMLDivElement,
  ChartLineBbFisherProps
>(function ChartLineBbFisher(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_BB_FISHER_LENGTH,
    sigma = DEFAULT_CHART_LINE_BB_FISHER_SIGMA,
    clampLimit = DEFAULT_CHART_LINE_BB_FISHER_CLAMP_LIMIT,
    overbought = DEFAULT_CHART_LINE_BB_FISHER_OVERBOUGHT,
    oversold = DEFAULT_CHART_LINE_BB_FISHER_OVERSOLD,
    width = DEFAULT_CHART_LINE_BB_FISHER_WIDTH,
    height = DEFAULT_CHART_LINE_BB_FISHER_HEIGHT,
    padding = DEFAULT_CHART_LINE_BB_FISHER_PADDING,
    panelGap = DEFAULT_CHART_LINE_BB_FISHER_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_BB_FISHER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_BB_FISHER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BB_FISHER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_BB_FISHER_PRICE_COLOR,
    fisherColor = DEFAULT_CHART_LINE_BB_FISHER_FISHER_COLOR,
    bullishColor = DEFAULT_CHART_LINE_BB_FISHER_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_BB_FISHER_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_BB_FISHER_THRESHOLD_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_BB_FISHER_ZERO_LINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_BB_FISHER_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_BB_FISHER_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFisher = true,
    showMarkers = true,
    showThresholds = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatFisher = defaultFormatFisher,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-bb-fisher-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineBbFisherSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineBbFisherSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineBbFisherLayout({
        data,
        length,
        sigma,
        clampLimit,
        overbought,
        oversold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      length,
      sigma,
      clampLimit,
      overbought,
      oversold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineBbFisherChart(data, {
      length,
      sigma,
      clampLimit,
      overbought,
      oversold,
    });
  const resolvedLabel =
    ariaLabel ??
    `BB Fisher Transform chart, length ${run.length}, sigma ${run.sigma}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineBbFisherSeriesId): void => {
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
    const tooltipW = 270;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-bb-fisher-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={182}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-bb-fisher-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-bb-fisher-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-bb-fisher-tooltip-mean"
          x={tx + 10}
          y={ty + 51}
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
          data-section="chart-line-bb-fisher-tooltip-upper"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Upper: ${
            hoverSample.upper === null
              ? 'n/a'
              : formatPrice(hoverSample.upper)
          }`}
        </text>
        <text
          data-section="chart-line-bb-fisher-tooltip-lower"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Lower: ${
            hoverSample.lower === null
              ? 'n/a'
              : formatPrice(hoverSample.lower)
          }`}
        </text>
        <text
          data-section="chart-line-bb-fisher-tooltip-pctb"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`%B: ${
            hoverSample.percentB === null
              ? 'n/a'
              : formatFisher(hoverSample.percentB)
          }`}
        </text>
        <text
          data-section="chart-line-bb-fisher-tooltip-norm"
          x={tx + 10}
          y={ty + 115}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Normalized: ${
            hoverSample.normalized === null
              ? 'n/a'
              : formatFisher(hoverSample.normalized)
          }`}
        </text>
        <text
          data-section="chart-line-bb-fisher-tooltip-fisher"
          x={tx + 10}
          y={ty + 135}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Fisher: ${
            hoverSample.fisher === null
              ? 'n/a'
              : formatFisher(hoverSample.fisher)
          }`}
        </text>
        <text
          data-section="chart-line-bb-fisher-tooltip-zone"
          x={tx + 10}
          y={ty + 153}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-bb-fisher-tooltip-cross"
          x={tx + 10}
          y={ty + 169}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const fisherHidden = isHidden('fisher') || !showFisher;

  const legendItems: Array<{
    id: ChartLineBbFisherSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'fisher', label: 'BB Fisher', color: fisherColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-bb-fisher"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-sigma={run.sigma}
      data-clamp-limit={run.clampLimit}
      data-overbought={run.overbought}
      data-oversold={run.oversold}
      data-overbought-count={run.overboughtCount}
      data-oversold-count={run.oversoldCount}
      data-neutral-count={run.neutralCount}
      data-none-count={run.noneCount}
      data-bullish-cross-count={run.bullishCrossCount}
      data-bearish-cross-count={run.bearishCrossCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-bb-fisher-aria-desc"
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
          data-section="chart-line-bb-fisher-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-bb-fisher-empty"
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
          data-section="chart-line-bb-fisher-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-bb-fisher-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.fisherBottom -
                  t * (layout.fisherBottom - layout.fisherTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-bb-fisher-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-bb-fisher-grid-line"
                      data-panel="fisher"
                      x1={layout.innerLeft}
                      y1={yk}
                      x2={layout.innerRight}
                      y2={yk}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-bb-fisher-axes">
              <line
                data-section="chart-line-bb-fisher-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-bb-fisher-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-bb-fisher-axis"
                data-panel="fisher"
                x1={layout.innerLeft}
                y1={layout.fisherTop}
                x2={layout.innerLeft}
                y2={layout.fisherBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-bb-fisher-axis"
                data-panel="fisher"
                x1={layout.innerLeft}
                y1={layout.fisherBottom}
                x2={layout.innerRight}
                y2={layout.fisherBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-bb-fisher-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-bb-fisher-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-bb-fisher-tick-label"
                data-panel="fisher"
                x={layout.innerLeft - 6}
                y={layout.fisherTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatFisher(layout.fisherMax)}
              </text>
              <text
                data-section="chart-line-bb-fisher-tick-label"
                data-panel="fisher"
                x={layout.innerLeft - 6}
                y={layout.fisherBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatFisher(layout.fisherMin)}
              </text>
            </g>
          ) : null}

          {showThresholds ? (
            <g data-section="chart-line-bb-fisher-thresholds">
              <line
                data-section="chart-line-bb-fisher-overbought-line"
                x1={layout.innerLeft}
                y1={layout.overboughtY}
                x2={layout.innerRight}
                y2={layout.overboughtY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-bb-fisher-oversold-line"
                x1={layout.innerLeft}
                y1={layout.oversoldY}
                x2={layout.innerRight}
                y2={layout.oversoldY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-bb-fisher-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-bb-fisher-price-path"
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
            <g data-section="chart-line-bb-fisher-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-bb-fisher-dot"
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

          {!fisherHidden ? (
            <path
              data-section="chart-line-bb-fisher-line"
              d={layout.fisherPath}
              fill="none"
              stroke={fisherColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`BB Fisher Transform line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-bb-fisher-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-bb-fisher-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-fisher={marker.fisher}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={markerColorOf(
                    marker.crossed,
                    bullishColor,
                    bearishColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, fisher ${formatFisher(marker.fisher)}, ${crossLabelOf(
                    marker.crossed,
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
            <g data-section="chart-line-bb-fisher-badge">
              <rect
                data-section="chart-line-bb-fisher-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={240}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-bb-fisher-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`BB Fisher ${run.length}/${run.sigma}sd / OB ${run.overbought}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-bb-fisher-legend"
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
                data-section="chart-line-bb-fisher-legend-item"
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
                  data-section="chart-line-bb-fisher-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-bb-fisher-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-bb-fisher-legend-stats"
            style={{ color: axisColor }}
          >
            {`OB ${run.overboughtCount} / OS ${run.oversoldCount} / neutral ${run.neutralCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineBbFisher.displayName = 'ChartLineBbFisher';
