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
 * ChartLineDynamicRsi -- pure-SVG dual-panel chart with the close on
 * the top panel and a Dynamic RSI oscillator on the bottom panel. The
 * RSI lookback is *adaptive*: it shrinks when recent short-window
 * volatility outpaces the long-window baseline and grows when
 * volatility cools off. The RSI is recomputed fresh at each bar over
 * the adaptive window using Wilder-style SMA smoothing of the up and
 * down move arrays:
 *
 *   shortStd[i]   = stdev(close, shortVolLength)[i]  (population)
 *   longStd[i]    = SMA(shortStd, longVolLength)[i]
 *   ratio[i]      = longStd[i] > 0 ? shortStd[i] / longStd[i] : 1
 *   dynLength[i]  = clamp(round(baseLength / ratio[i]),
 *                         minLength, maxLength)
 *   up[k]         = max(0, close[k] - close[k - 1])
 *   down[k]       = max(0, close[k - 1] - close[k])
 *   avgUp[i]      = mean(up[i - dynLength + 1 .. i])
 *   avgDown[i]    = mean(down[i - dynLength + 1 .. i])
 *   rsi[i]        = (avgUp + avgDown > 0)
 *                    ? 100 * avgUp / (avgUp + avgDown)
 *                    : 50    (neutral fallback when both are zero)
 *
 * `rsi[i]` is `null` during warmup (when dynLength is not yet defined
 * or when `i - dynLength < 0`).
 *
 * Bit-exact anchor: **CONST close** (`close = K`): every up and down
 * is `0`, so `avgUp = avgDown = 0` and the neutral fallback yields
 * `rsi = 50` (bit-exact).
 *
 * Additional bit-exact anchors:
 * - **MONOTONIC UP** (`close[k] = k + 1`): every up move is `1`,
 *   every down is `0`, so `avgUp = 1`, `avgDown = 0` ->
 *   `rsi = 100 * 1 / 1 = 100`.
 * - **MONOTONIC DOWN** (`close[k] = N - k`): mirror -> `rsi = 0`.
 * - **ALTERNATING [10, 5, 10, 5, ...]** with even dynLength: ups and
 *   downs balance exactly, `rsi = 50`.
 */

export interface ChartLineDynamicRsiPoint {
  x: number;
  close: number;
}

export type ChartLineDynamicRsiZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineDynamicRsiCross = 'up' | 'down' | null;

export type ChartLineDynamicRsiSeriesId = 'price' | 'rsi';

export interface ChartLineDynamicRsiSample {
  index: number;
  x: number;
  close: number;
  shortStd: number | null;
  longStd: number | null;
  ratio: number | null;
  dynLength: number | null;
  avgUp: number | null;
  avgDown: number | null;
  rsi: number | null;
  zone: ChartLineDynamicRsiZone;
  crossed: ChartLineDynamicRsiCross;
}

export interface ChartLineDynamicRsiRun {
  series: ChartLineDynamicRsiPoint[];
  baseLength: number;
  shortVolLength: number;
  longVolLength: number;
  minLength: number;
  maxLength: number;
  overbought: number;
  oversold: number;
  shortStdValues: Array<number | null>;
  longStdValues: Array<number | null>;
  ratioValues: Array<number | null>;
  dynLengthValues: Array<number | null>;
  rsiValues: Array<number | null>;
  samples: ChartLineDynamicRsiSample[];
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineDynamicRsiMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  rsi: number;
  crossed: 'up' | 'down';
}

export interface ChartLineDynamicRsiDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDynamicRsiLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  rsiTop: number;
  rsiBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineDynamicRsiDot[];
  rsiPath: string;
  overboughtY: number;
  oversoldY: number;
  midlineY: number;
  markers: ChartLineDynamicRsiMarker[];
  priceMin: number;
  priceMax: number;
  rsiMin: number;
  rsiMax: number;
  run: ChartLineDynamicRsiRun;
}

export interface ChartLineDynamicRsiProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDynamicRsiPoint[];
  baseLength?: number;
  shortVolLength?: number;
  longVolLength?: number;
  minLength?: number;
  maxLength?: number;
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
  rsiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  midlineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRsi?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDynamicRsiSeriesId[];
  defaultHiddenSeries?: ChartLineDynamicRsiSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDynamicRsiSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineDynamicRsiSample }) => void;
  formatPrice?: (value: number) => string;
  formatRsi?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_DYNAMIC_RSI_WIDTH = 720;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_PADDING = 44;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_BASE_LENGTH = 14;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_SHORT_VOL_LENGTH = 5;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_LONG_VOL_LENGTH = 10;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_MIN_LENGTH = 5;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_MAX_LENGTH = 30;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_OVERBOUGHT = 70;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_OVERSOLD = 30;
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_RSI_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DYNAMIC_RSI_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineDynamicRsiFinitePoints(
  data: readonly ChartLineDynamicRsiPoint[] | null | undefined,
): ChartLineDynamicRsiPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDynamicRsiPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer period (>= 1). */
export function normalizeLineDynamicRsiPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Coerce a non-negative finite threshold. */
export function normalizeLineDynamicRsiThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** Rolling SMA helper. */
export function applyLineDynamicRsiSma(
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
export function applyLineDynamicRsiPopStdDev(
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
    if (!ok) {
      out.push(null);
      continue;
    }
    const mean = sum / length;
    let sumSq = 0;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null) continue;
      const d = v - mean;
      sumSq += d * d;
    }
    out.push(Math.sqrt(sumSq / length));
  }
  return out;
}

/** Per-bar up and down moves from a close array. */
export function computeLineDynamicRsiMoves(
  closes: readonly (number | null)[],
): { up: Array<number | null>; down: Array<number | null> } {
  const up: Array<number | null> = [];
  const down: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      up.push(null);
      down.push(null);
      continue;
    }
    const c = closes[i];
    const prev = closes[i - 1];
    if (c == null || prev == null || !isFiniteNumber(c) || !isFiniteNumber(prev)) {
      up.push(null);
      down.push(null);
      continue;
    }
    const diff = c - prev;
    if (diff > 0) {
      up.push(diff);
      down.push(0);
    } else if (diff < 0) {
      up.push(0);
      down.push(-diff);
    } else {
      up.push(0);
      down.push(0);
    }
  }
  return { up, down };
}

export interface ChartLineDynamicRsiOptions {
  baseLength?: number;
  shortVolLength?: number;
  longVolLength?: number;
  minLength?: number;
  maxLength?: number;
  overbought?: number;
  oversold?: number;
}

export interface ChartLineDynamicRsiChannels {
  shortStd: Array<number | null>;
  longStd: Array<number | null>;
  ratio: Array<number | null>;
  dynLength: Array<number | null>;
  avgUp: Array<number | null>;
  avgDown: Array<number | null>;
  rsi: Array<number | null>;
}

/** Compute the Dynamic RSI pipeline. */
export function computeLineDynamicRsi(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineDynamicRsiOptions = {},
): ChartLineDynamicRsiChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return {
      shortStd: [],
      longStd: [],
      ratio: [],
      dynLength: [],
      avgUp: [],
      avgDown: [],
      rsi: [],
    };
  }
  const baseLength = normalizeLineDynamicRsiPeriod(
    options.baseLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_BASE_LENGTH,
  );
  const shortVolLength = normalizeLineDynamicRsiPeriod(
    options.shortVolLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_SHORT_VOL_LENGTH,
  );
  const longVolLength = normalizeLineDynamicRsiPeriod(
    options.longVolLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_LONG_VOL_LENGTH,
  );
  const minLength = normalizeLineDynamicRsiPeriod(
    options.minLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_MIN_LENGTH,
  );
  const maxLength = normalizeLineDynamicRsiPeriod(
    options.maxLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_MAX_LENGTH,
  );
  const shortStd = applyLineDynamicRsiPopStdDev(closes, shortVolLength);
  const longStd = applyLineDynamicRsiSma(shortStd, longVolLength);
  const { up, down } = computeLineDynamicRsiMoves(closes);
  const ratio: Array<number | null> = [];
  const dynLength: Array<number | null> = [];
  const avgUp: Array<number | null> = [];
  const avgDown: Array<number | null> = [];
  const rsi: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const ss = shortStd[i];
    const ls = longStd[i];
    let r: number | null;
    if (ss == null || ls == null || !isFiniteNumber(ss) || !isFiniteNumber(ls)) {
      r = null;
    } else if (ls === 0) {
      r = 1;
    } else {
      r = ss / ls;
    }
    ratio.push(r);
    if (r == null || !isFiniteNumber(r) || r <= 0) {
      dynLength.push(null);
      avgUp.push(null);
      avgDown.push(null);
      rsi.push(null);
      continue;
    }
    let dyn = Math.round(baseLength / r);
    if (dyn < minLength) dyn = minLength;
    if (dyn > maxLength) dyn = maxLength;
    dynLength.push(dyn);
    if (i < dyn) {
      avgUp.push(null);
      avgDown.push(null);
      rsi.push(null);
      continue;
    }
    let sumUp = 0;
    let sumDown = 0;
    let ok = true;
    for (let k = 0; k < dyn; k += 1) {
      const u = up[i - k];
      const d = down[i - k];
      if (u == null || d == null || !isFiniteNumber(u) || !isFiniteNumber(d)) {
        ok = false;
        break;
      }
      sumUp += u;
      sumDown += d;
    }
    if (!ok) {
      avgUp.push(null);
      avgDown.push(null);
      rsi.push(null);
      continue;
    }
    const aUp = sumUp / dyn;
    const aDown = sumDown / dyn;
    avgUp.push(aUp);
    avgDown.push(aDown);
    const denom = aUp + aDown;
    if (denom <= 0) {
      // Both averages are zero -> no movement, neutral fallback.
      rsi.push(50);
    } else {
      const raw = (100 * aUp) / denom;
      rsi.push(raw === 0 ? 0 : raw);
    }
  }
  return { shortStd, longStd, ratio, dynLength, avgUp, avgDown, rsi };
}

/** Classify an RSI reading. */
export function classifyLineDynamicRsiZone(
  value: number | null,
  overbought: number,
  oversold: number,
): ChartLineDynamicRsiZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= overbought) return 'overbought';
  if (value <= oversold) return 'oversold';
  return 'neutral';
}

/**
 * Detect overbought/oversold crosses. A bar transitions `'up'` when
 * the previous defined value was `< overbought` and the current is
 * `>= overbought`; mirror for `'down'` at the `oversold` threshold.
 */
export function detectLineDynamicRsiCrosses(
  values: readonly (number | null)[],
  overbought: number,
  oversold: number,
): Array<ChartLineDynamicRsiCross> {
  const out: Array<ChartLineDynamicRsiCross> = [];
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
export function runLineDynamicRsi(
  data: readonly ChartLineDynamicRsiPoint[] | null | undefined,
  options: ChartLineDynamicRsiOptions = {},
): ChartLineDynamicRsiRun {
  const series = getLineDynamicRsiFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const baseLength = normalizeLineDynamicRsiPeriod(
    options.baseLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_BASE_LENGTH,
  );
  const shortVolLength = normalizeLineDynamicRsiPeriod(
    options.shortVolLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_SHORT_VOL_LENGTH,
  );
  const longVolLength = normalizeLineDynamicRsiPeriod(
    options.longVolLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_LONG_VOL_LENGTH,
  );
  const minLength = normalizeLineDynamicRsiPeriod(
    options.minLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_MIN_LENGTH,
  );
  const maxLength = normalizeLineDynamicRsiPeriod(
    options.maxLength,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_MAX_LENGTH,
  );
  const overbought = normalizeLineDynamicRsiThreshold(
    options.overbought,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_OVERBOUGHT,
  );
  const oversold = normalizeLineDynamicRsiThreshold(
    options.oversold,
    DEFAULT_CHART_LINE_DYNAMIC_RSI_OVERSOLD,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineDynamicRsi(closes, {
    baseLength,
    shortVolLength,
    longVolLength,
    minLength,
    maxLength,
  });
  const crosses = detectLineDynamicRsiCrosses(
    channels.rsi,
    overbought,
    oversold,
  );
  const samples: ChartLineDynamicRsiSample[] = series.map((point, index) => {
    const value = channels.rsi[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      shortStd: channels.shortStd[index] ?? null,
      longStd: channels.longStd[index] ?? null,
      ratio: channels.ratio[index] ?? null,
      dynLength: channels.dynLength[index] ?? null,
      avgUp: channels.avgUp[index] ?? null,
      avgDown: channels.avgDown[index] ?? null,
      rsi: value,
      zone: classifyLineDynamicRsiZone(value, overbought, oversold),
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
    series = [],
    baseLength,
    shortVolLength,
    longVolLength,
    minLength,
    maxLength,
    overbought,
    oversold,
    shortStdValues: channels.shortStd,
    longStdValues: channels.longStd,
    ratioValues: channels.ratio,
    dynLengthValues: channels.dynLength,
    rsiValues: channels.rsi,
    samples,
    overboughtCount,
    oversoldCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok:
      series.length >=
      Math.max(shortVolLength + longVolLength - 1, baseLength + 1),
  };
}

export interface ChartLineDynamicRsiLayoutOptions
  extends ChartLineDynamicRsiOptions {
  data: readonly ChartLineDynamicRsiPoint[] | null | undefined;
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
export function computeLineDynamicRsiLayout(
  options: ChartLineDynamicRsiLayoutOptions,
): ChartLineDynamicRsiLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_DYNAMIC_RSI_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_DYNAMIC_RSI_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_DYNAMIC_RSI_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_DYNAMIC_RSI_PANEL_GAP;

  const run = runLineDynamicRsi(options.data, {
    ...(options.baseLength !== undefined
      ? { baseLength: options.baseLength }
      : {}),
    ...(options.shortVolLength !== undefined
      ? { shortVolLength: options.shortVolLength }
      : {}),
    ...(options.longVolLength !== undefined
      ? { longVolLength: options.longVolLength }
      : {}),
    ...(options.minLength !== undefined
      ? { minLength: options.minLength }
      : {}),
    ...(options.maxLength !== undefined
      ? { maxLength: options.maxLength }
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
  const rsiHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const rsiTop = priceBottom + panelGap;
  const rsiBottom = rsiTop + rsiHeight;

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

  // RSI axis is fixed at [0, 100].
  const rsiMin = 0;
  const rsiMax = 100;
  const rsiY = (value: number): number =>
    rsiBottom - ((value - rsiMin) / (rsiMax - rsiMin)) * rsiHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineDynamicRsiDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const rsiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineDynamicRsiMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.rsi)) return;
    const cx = xAt(index);
    const yc = rsiY(sample.rsi);
    rsiLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        rsi: sample.rsi,
        crossed: sample.crossed,
      });
    }
  });

  const overboughtY = rsiY(run.overbought);
  const oversoldY = rsiY(run.oversold);
  const midlineY = rsiY(50);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    rsiTop,
    rsiBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    rsiPath: buildLinePath(rsiLinePoints),
    overboughtY,
    oversoldY,
    midlineY,
    markers,
    priceMin,
    priceMax,
    rsiMin,
    rsiMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineDynamicRsiChart(
  data: readonly ChartLineDynamicRsiPoint[] | null | undefined,
  options: ChartLineDynamicRsiOptions = {},
): string {
  const run = runLineDynamicRsi(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Dynamic RSI oscillator on the lower ` +
    `panel (baseLength ${run.baseLength}, shortVolLength ` +
    `${run.shortVolLength}, longVolLength ${run.longVolLength}, ` +
    `minLength ${run.minLength}, maxLength ${run.maxLength}, ` +
    `overbought ${run.overbought}, oversold ${run.oversold}). The ` +
    `RSI lookback adapts each bar to round(baseLength / ` +
    `volatilityRatio) clamped to [minLength, maxLength]; the ` +
    `oscillator is recomputed fresh over the adaptive window using ` +
    `SMA smoothing of up and down moves. Across ${total} bars the ` +
    `RSI was overbought on ${run.overboughtCount}, oversold on ` +
    `${run.oversoldCount}, neutral on ${run.neutralCount}, and ` +
    `undefined on ${run.noneCount}, with ${run.bullishCrossCount} ` +
    `overbought entries and ${run.bearishCrossCount} oversold ` +
    `entries.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatRsi(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return value.toFixed(2);
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

function zoneLabelOf(zone: ChartLineDynamicRsiZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineDynamicRsiCross): string {
  if (crossed === 'up') return 'Entered overbought';
  if (crossed === 'down') return 'Entered oversold';
  return '-';
}

/** ChartLineDynamicRsi -- dual-panel pure-SVG chart. */
export const ChartLineDynamicRsi = forwardRef<
  HTMLDivElement,
  ChartLineDynamicRsiProps
>(function ChartLineDynamicRsi(props, ref) {
  const {
    data,
    baseLength = DEFAULT_CHART_LINE_DYNAMIC_RSI_BASE_LENGTH,
    shortVolLength = DEFAULT_CHART_LINE_DYNAMIC_RSI_SHORT_VOL_LENGTH,
    longVolLength = DEFAULT_CHART_LINE_DYNAMIC_RSI_LONG_VOL_LENGTH,
    minLength = DEFAULT_CHART_LINE_DYNAMIC_RSI_MIN_LENGTH,
    maxLength = DEFAULT_CHART_LINE_DYNAMIC_RSI_MAX_LENGTH,
    overbought = DEFAULT_CHART_LINE_DYNAMIC_RSI_OVERBOUGHT,
    oversold = DEFAULT_CHART_LINE_DYNAMIC_RSI_OVERSOLD,
    width = DEFAULT_CHART_LINE_DYNAMIC_RSI_WIDTH,
    height = DEFAULT_CHART_LINE_DYNAMIC_RSI_HEIGHT,
    padding = DEFAULT_CHART_LINE_DYNAMIC_RSI_PADDING,
    panelGap = DEFAULT_CHART_LINE_DYNAMIC_RSI_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DYNAMIC_RSI_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DYNAMIC_RSI_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DYNAMIC_RSI_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DYNAMIC_RSI_PRICE_COLOR,
    rsiColor = DEFAULT_CHART_LINE_DYNAMIC_RSI_RSI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_DYNAMIC_RSI_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_DYNAMIC_RSI_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_DYNAMIC_RSI_THRESHOLD_COLOR,
    midlineColor = DEFAULT_CHART_LINE_DYNAMIC_RSI_MIDLINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_DYNAMIC_RSI_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DYNAMIC_RSI_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRsi = true,
    showMarkers = true,
    showThresholds = true,
    showMidline = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatRsi = defaultFormatRsi,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-dynamic-rsi-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineDynamicRsiSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineDynamicRsiSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineDynamicRsiLayout({
        data,
        baseLength,
        shortVolLength,
        longVolLength,
        minLength,
        maxLength,
        overbought,
        oversold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      baseLength,
      shortVolLength,
      longVolLength,
      minLength,
      maxLength,
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
    describeLineDynamicRsiChart(data, {
      baseLength,
      shortVolLength,
      longVolLength,
      minLength,
      maxLength,
      overbought,
      oversold,
    });
  const resolvedLabel =
    ariaLabel ?? `Dynamic RSI chart, baseLength ${run.baseLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineDynamicRsiSeriesId): void => {
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
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-dynamic-rsi-tooltip"
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
          data-section="chart-line-dynamic-rsi-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-dynamic-rsi-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-dynamic-rsi-tooltip-dyn"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Dyn Length: ${hoverSample.dynLength ?? 'n/a'}`}
        </text>
        <text
          data-section="chart-line-dynamic-rsi-tooltip-up"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Avg Up: ${
            hoverSample.avgUp === null ? 'n/a' : formatRsi(hoverSample.avgUp)
          }`}
        </text>
        <text
          data-section="chart-line-dynamic-rsi-tooltip-down"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Avg Down: ${
            hoverSample.avgDown === null
              ? 'n/a'
              : formatRsi(hoverSample.avgDown)
          }`}
        </text>
        <text
          data-section="chart-line-dynamic-rsi-tooltip-rsi"
          x={tx + 10}
          y={ty + 103}
          fill="#5eead4"
          fontSize={11}
          fontWeight={600}
        >
          {`RSI: ${
            hoverSample.rsi === null ? 'n/a' : formatRsi(hoverSample.rsi)
          }`}
        </text>
        <text
          data-section="chart-line-dynamic-rsi-tooltip-zone"
          x={tx + 10}
          y={ty + 121}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-dynamic-rsi-tooltip-cross"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
        <text
          data-section="chart-line-dynamic-rsi-tooltip-thresholds"
          x={tx + 10}
          y={ty + 153}
          fill="#94a3b8"
          fontSize={10}
        >
          {`OB ${run.overbought} / OS ${run.oversold}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const rsiHidden = isHidden('rsi') || !showRsi;

  const legendItems: Array<{
    id: ChartLineDynamicRsiSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'rsi', label: 'Dynamic RSI', color: rsiColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-dynamic-rsi"
      data-empty={isEmpty ? 'true' : 'false'}
      data-base-length={run.baseLength}
      data-short-vol-length={run.shortVolLength}
      data-long-vol-length={run.longVolLength}
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
        data-section="chart-line-dynamic-rsi-aria-desc"
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
          data-section="chart-line-dynamic-rsi-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-dynamic-rsi-empty"
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
          data-section="chart-line-dynamic-rsi-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-dynamic-rsi-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.rsiBottom - t * (layout.rsiBottom - layout.rsiTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-dynamic-rsi-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-dynamic-rsi-grid-line"
                      data-panel="rsi"
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
            <g data-section="chart-line-dynamic-rsi-axes">
              <line
                data-section="chart-line-dynamic-rsi-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-dynamic-rsi-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-dynamic-rsi-axis"
                data-panel="rsi"
                x1={layout.innerLeft}
                y1={layout.rsiTop}
                x2={layout.innerLeft}
                y2={layout.rsiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-dynamic-rsi-axis"
                data-panel="rsi"
                x1={layout.innerLeft}
                y1={layout.rsiBottom}
                x2={layout.innerRight}
                y2={layout.rsiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-dynamic-rsi-tick-label"
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
                data-section="chart-line-dynamic-rsi-tick-label"
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
                data-section="chart-line-dynamic-rsi-tick-label"
                data-panel="rsi"
                x={layout.innerLeft - 6}
                y={layout.rsiTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`100`}
              </text>
              <text
                data-section="chart-line-dynamic-rsi-tick-label"
                data-panel="rsi"
                x={layout.innerLeft - 6}
                y={layout.rsiBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`0`}
              </text>
            </g>
          ) : null}

          {showThresholds ? (
            <g data-section="chart-line-dynamic-rsi-thresholds">
              <line
                data-section="chart-line-dynamic-rsi-overbought-line"
                x1={layout.innerLeft}
                y1={layout.overboughtY}
                x2={layout.innerRight}
                y2={layout.overboughtY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-dynamic-rsi-oversold-line"
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

          {showMidline ? (
            <line
              data-section="chart-line-dynamic-rsi-midline"
              x1={layout.innerLeft}
              y1={layout.midlineY}
              x2={layout.innerRight}
              y2={layout.midlineY}
              stroke={midlineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-dynamic-rsi-price-path"
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
            <g data-section="chart-line-dynamic-rsi-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-dynamic-rsi-dot"
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

          {!rsiHidden ? (
            <path
              data-section="chart-line-dynamic-rsi-line"
              d={layout.rsiPath}
              fill="none"
              stroke={rsiColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Dynamic RSI line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-dynamic-rsi-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-dynamic-rsi-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-rsi={marker.rsi}
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
                  )}, RSI ${formatRsi(marker.rsi)}, ${crossLabelOf(
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
            <g data-section="chart-line-dynamic-rsi-badge">
              <rect
                data-section="chart-line-dynamic-rsi-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={240}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-dynamic-rsi-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Dyn RSI ${run.baseLength} / OB ${run.overbought} OS ${run.oversold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-dynamic-rsi-legend"
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
                data-section="chart-line-dynamic-rsi-legend-item"
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
                  data-section="chart-line-dynamic-rsi-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-dynamic-rsi-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-dynamic-rsi-legend-stats"
            style={{ color: axisColor }}
          >
            {`OB ${run.overboughtCount} / OS ${run.oversoldCount} / neutral ${run.neutralCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDynamicRsi.displayName = 'ChartLineDynamicRsi';
