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
 * ChartLineHmaMidCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the Hull Moving Average
 * (HMA) plus its smoothed SMA signal line in the bottom
 * panel, marking bullish (HMA crosses up through signal --
 * fast smoothed centerline trigger up) / bearish (HMA
 * crosses down through signal -- fast smoothed centerline
 * trigger down) HMA-over-signal crossover trigger events
 * with bias coloring derived from the HMA slope at the
 * trigger bar.
 *
 *   half        = floor(period / 2)
 *   sqrtPeriod  = round(sqrt(period))
 *   wmaHalf[i]  = WMA(close, half)
 *   wmaFull[i]  = WMA(close, period)
 *   raw[i]      = 2 * wmaHalf[i] - wmaFull[i]
 *   hma[i]      = WMA(raw, sqrtPeriod)
 *   signal[i]   = SMA(hma, signalLength)
 *
 *   bullish     : prev hma <= prev signal &&
 *                 cur hma > cur signal
 *   bearish     : prev hma >= prev signal &&
 *                 cur hma < cur signal
 *   regime      : 'bullish' when hma >= signal
 *                 'bearish' when hma <  signal
 *                 'none'    when either is null
 *   bias        : hma[i] vs hma[i-1] -> up / down / flat /
 *                 none
 *
 * Defaults: `period = 14`, `signalLength = 3`. Alan Hull's
 * 2005 Hull Moving Average is engineered to virtually
 * eliminate lag while preserving smoothness. The formula
 * `2 * WMA(close, period/2) - WMA(close, period)` projects
 * the trend forward by the WMA's centroid lag, and the
 * outer WMA over `sqrt(period)` bars smooths the
 * projection. The net effect is a near-zero-lag MA that
 * follows the trend tightly but without the noise of a
 * pure unsmoothed projection. This primitive watches the
 * HMA vs its own SMA-smoothed signal line to detect fast
 * smoothed centerline trigger events.
 *
 * Sibling to chart-line-hma-divergence-cross v1.11.1052
 * (same HMA pipeline; the divergence-cross sibling
 * compares HMA direction vs price direction, this cross-
 * sig compares HMA vs its SMA signal line).
 *
 * Warmup is `period + sqrtPeriod + signalLength - 3 = 18`
 * for the default tuning: WMA_half (7) seeds at i = 6,
 * WMA_full (14) seeds at i = 13, raw is valid from i =
 * 13, HMA (WMA over 4 raw values) is valid from i = 16,
 * signal (SMA over 3 HMA values) is valid from i = 18.
 *
 * Bit-exact anchors (close-input):
 *
 * - **CONST band** `close = K`: WMA on a constant is
 *   exactly the constant. wmaHalf = wmaFull = K. raw =
 *   2 * K - K = K. hma = K. signal = SMA(K, 3) = K. hma
 *   === signal -> regime `bullish` (>=) for every valid
 *   bar. 0 crosses. Verified across K in {0, 1, 50, 200,
 *   1234}.
 * - **LINEAR UP** `close = i`: WMA centroid lag on
 *   linear input is `(n - 1) / 3`. wmaHalf = WMA(close,
 *   7) = i - (7 - 1) / 3 = i - 2. wmaFull = WMA(close,
 *   14) = i - 13 / 3. raw = 2 * (i - 2) - (i - 13/3)
 *   = i - 4 + 13/3 = i + 1/3. hma = WMA(raw, 4) = raw -
 *   (4 - 1) / 3 = raw - 1 = i - 2/3. The +1/3 lift on
 *   `raw` and the -1 from the outer WMA cancel net 2/3
 *   of lag -- the canonical near-zero-lag Hull
 *   property. signal = SMA(hma, 3) = hma - 1 = i - 5/3.
 *   hma - signal = 1 (constant). regime `bullish`
 *   (>=). 0 crosses (no transition into bearish). The
 *   constant +1 offset is the 1-bar SMA lag on a unit-
 *   slope line.
 * - **LINEAR DOWN** `close = -i`: mirror -> hma = -i +
 *   2/3. signal = -i + 5/3. hma - signal = -1. regime
 *   `bearish` for every valid bar. 0 crosses.
 */

export interface ChartLineHmaMidCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineHmaMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineHmaMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineHmaMidCrossSigSeriesId =
  | 'price'
  | 'hma'
  | 'signal';

export type ChartLineHmaMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineHmaMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineHmaMidCrossSigCrossKind;
  bias: ChartLineHmaMidCrossSigBias;
}

export interface ChartLineHmaMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  hma: number | null;
  signal: number | null;
  regime: ChartLineHmaMidCrossSigRegime;
  bias: ChartLineHmaMidCrossSigBias;
}

export interface ChartLineHmaMidCrossSigRun {
  series: ChartLineHmaMidCrossSigPoint[];
  period: number;
  signalLength: number;
  half: number;
  sqrtPeriod: number;
  wmaHalfValues: Array<number | null>;
  wmaFullValues: Array<number | null>;
  rawValues: Array<number | null>;
  hmaValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineHmaMidCrossSigSample[];
  crosses: ChartLineHmaMidCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineHmaMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHmaMidCrossSigLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  oscTop: number;
  oscBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineHmaMidCrossSigDot[];
  hmaPath: string;
  signalPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineHmaMidCrossSigCrossKind;
    bias: ChartLineHmaMidCrossSigBias;
  }>;
  run: ChartLineHmaMidCrossSigRun;
}

export interface ChartLineHmaMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHmaMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  hmaColor?: string;
  signalColor?: string;
  upBiasColor?: string;
  downBiasColor?: string;
  flatBiasColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showHma?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHmaMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineHmaMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHmaMidCrossSigSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PERIOD = 14;
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_HMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineHmaMidCrossSigFinitePoints(
  data: readonly ChartLineHmaMidCrossSigPoint[] | null | undefined,
): ChartLineHmaMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHmaMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineHmaMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Weighted Moving Average with min===max short-circuit. */
export function applyLineHmaMidCrossSigWma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  const denom = (length * (length + 1)) / 2;
  for (let i = length - 1; i < values.length; i += 1) {
    let weightedSum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null) {
        valid = false;
        break;
      }
      // weight = length - j (latest gets largest weight).
      weightedSum += (length - j) * v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(weightedSum / denom);
  }
  return out;
}

/** Simple moving average with min===max short-circuit. */
export function applyLineHmaMidCrossSigSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(sum / length);
  }
  return out;
}

export interface HmaMidCrossSigChannels {
  wmaHalf: Array<number | null>;
  wmaFull: Array<number | null>;
  raw: Array<number | null>;
  hma: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineHmaMidCrossSig(
  series: readonly ChartLineHmaMidCrossSigPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): HmaMidCrossSigChannels {
  const cleaned = getLineHmaMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { wmaHalf: [], wmaFull: [], raw: [], hma: [], signal: [] };
  }
  const period = normalizeLineHmaMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineHmaMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)));

  const n = cleaned.length;
  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const wmaHalf = applyLineHmaMidCrossSigWma(closes, half);
  const wmaFull = applyLineHmaMidCrossSigWma(closes, period);

  const raw: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const h = wmaHalf[i];
    const f = wmaFull[i];
    if (h == null || f == null) continue;
    raw[i] = posZero(2 * h - f);
  }

  const hma = applyLineHmaMidCrossSigWma(raw, sqrtPeriod);
  const signal = applyLineHmaMidCrossSigSma(hma, signalLength);
  return { wmaHalf, wmaFull, raw, hma, signal };
}

export function classifyLineHmaMidCrossSigRegime(
  hma: number | null,
  signal: number | null,
): ChartLineHmaMidCrossSigRegime {
  if (hma == null || signal == null) return 'none';
  if (hma >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineHmaMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineHmaMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineHmaMidCrossSigCrosses(
  series: readonly ChartLineHmaMidCrossSigPoint[],
  hmaValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineHmaMidCrossSigCross[] {
  const out: ChartLineHmaMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const ph = hmaValues[i - 1];
    const ps = signalValues[i - 1];
    const ch = hmaValues[i];
    const cs = signalValues[i];
    if (ph == null || ps == null || ch == null || cs == null) continue;
    const bias = classifyLineHmaMidCrossSigBias(ch, ph);
    if (ph <= ps && ch > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (ph >= ps && ch < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineHmaMidCrossSig(
  data: ChartLineHmaMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineHmaMidCrossSigRun {
  const cleaned = getLineHmaMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineHmaMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineHmaMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  const half = Math.max(1, Math.floor(period / 2));
  const sqrtPeriod = Math.max(1, Math.round(Math.sqrt(period)));

  const channels = computeLineHmaMidCrossSig(series, {
    period,
    signalLength,
  });

  const samples: ChartLineHmaMidCrossSigSample[] = series.map((p, i) => {
    const hma = channels.hma[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prev = i > 0 ? (channels.hma[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      hma,
      signal,
      regime: classifyLineHmaMidCrossSigRegime(hma, signal),
      bias: classifyLineHmaMidCrossSigBias(hma, prev),
    };
  });

  const crosses = detectLineHmaMidCrossSigCrosses(
    series,
    channels.hma,
    channels.signal,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
    if (s.bias === 'up') upBiasCount += 1;
    else if (s.bias === 'down') downBiasCount += 1;
    else if (s.bias === 'flat') flatBiasCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const warmup = period + sqrtPeriod + signalLength - 3;
  const ok = series.length > warmup;

  return {
    series,
    period,
    signalLength,
    half,
    sqrtPeriod,
    wmaHalfValues: channels.wmaHalf,
    wmaFullValues: channels.wmaFull,
    rawValues: channels.raw,
    hmaValues: channels.hma,
    signalValues: channels.signal,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineHmaMidCrossSigLayoutOptions {
  data: ChartLineHmaMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineHmaMidCrossSigLayout(
  opts: ComputeLineHmaMidCrossSigLayoutOptions,
): ChartLineHmaMidCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineHmaMidCrossSig(opts.data, {
    period: opts.period ?? undefined,
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let oscRawMin = Infinity;
  let oscRawMax = -Infinity;
  for (let i = 0; i < run.hmaValues.length; i += 1) {
    const h = run.hmaValues[i];
    const s = run.signalValues[i];
    if (h != null) {
      if (h < oscRawMin) oscRawMin = h;
      if (h > oscRawMax) oscRawMax = h;
    }
    if (s != null) {
      if (s < oscRawMin) oscRawMin = s;
      if (s > oscRawMax) oscRawMax = s;
    }
  }
  if (!Number.isFinite(oscRawMin) || !Number.isFinite(oscRawMax)) {
    oscRawMin = -1;
    oscRawMax = 1;
  }
  if (oscRawMin === oscRawMax) {
    oscRawMin -= 1;
    oscRawMax += 1;
  }
  const oscMin = oscRawMin;
  const oscMax = oscRawMax;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      oscTop,
      oscBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      hmaPath: '',
      signalPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      crossMarkers: [],
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);

  let pricePath = '';
  const priceDots: ChartLineHmaMidCrossSigDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  const buildPath = (
    accessor: (s: ChartLineHmaMidCrossSigSample) => number | null,
  ): string => {
    let path = '';
    let first = true;
    for (const s of run.samples) {
      const v = accessor(s);
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syOscBase(v);
      path += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return path.trim();
  };

  const hmaPath = buildPath((s) => s.hma);
  const signalPath = buildPath((s) => s.signal);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const hAt = run.hmaValues[c.index];
    const cyOsc = hAt != null ? syOscBase(hAt) : oscBottom;
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
      bias: c.bias,
    };
  });

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    hmaPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineHmaMidCrossSigChart(
  data: ChartLineHmaMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineHmaMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineHmaMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineHmaMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `HMA midline-over-Signal chart over ${cleaned.length} bars ` +
    `(period ${period}, signalLength ${signalLength}). Top panel ` +
    `renders the close with bullish (HMA crosses up through signal, ` +
    `fast smoothed centerline trigger up) / bearish (HMA crosses ` +
    `down through signal, fast smoothed centerline trigger down) ` +
    `chevron overlays at every HMA-signal trigger event; bottom ` +
    `panel renders Alan Hull's (2005) near-zero-lag Hull Moving ` +
    `Average (2 * WMA(close, period/2) - WMA(close, period), ` +
    `smoothed by WMA over round(sqrt(period)) bars) and its SMA ` +
    `signal line, marker-coloured by HMA slope bias (rising / ` +
    `falling / flat) at the trigger bar, flagging fast smoothed ` +
    `centerline trigger events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineHmaMidCrossSigCrossKind,
  bias: ChartLineHmaMidCrossSigBias,
  upColor: string,
  downColor: string,
  flatColor: string,
  bullishColor: string,
  bearishColor: string,
): string {
  if (bias === 'up') return upColor;
  if (bias === 'down') return downColor;
  if (bias === 'flat') return flatColor;
  return kind === 'bullish' ? bullishColor : bearishColor;
}

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineHmaMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineHmaMidCrossSigProps
>(function ChartLineHmaMidCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PERIOD,
    signalLength = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_PRICE_COLOR,
    hmaColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_HMA_COLOR,
    signalColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_SIGNAL_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HMA_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showHma = true,
    showSignal = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatPrice = defaultPriceFormatter,
    formatOsc = defaultOscFormatter,
    formatX = defaultXFormatter,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...rest
  } = props;

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cleaned = useMemo(
    () => getLineHmaMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineHmaMidCrossSigLayout({
        data: cleaned,
        period,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, period, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineHmaMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineHmaMidCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineHmaMidCrossSigSeriesId,
  ): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLegendClick(seriesId);
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (cleaned.length === 0) {
    return (
      <div
        ref={ref}
        className={className}
        style={style}
        data-section="chart-line-hma-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineHmaMidCrossSigChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showHmaLine = !hidden.has('hma') && showHma;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'HMA midline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-hma-mid-cross-sig"
      data-period={period}
      data-signal-length={signalLength}
      data-half={layout.run.half}
      data-sqrt-period={layout.run.sqrtPeriod}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-up-bias-count={layout.run.upBiasCount}
      data-down-bias-count={layout.run.downBiasCount}
      data-flat-bias-count={layout.run.flatBiasCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-hma-mid-cross-sig-title"
      >
        {ariaLabel ?? 'HMA midline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-hma-mid-cross-sig-aria-desc"
      >
        {desc}
      </span>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={animate ? 'motion-safe:animate-fade-in' : undefined}
        data-section="chart-line-hma-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-hma-mid-cross-sig-grid">
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <line
                  key={`grid-price-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-hma-mid-cross-sig-grid-line-price"
                />
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <line
                  key={`grid-osc-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-hma-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-hma-mid-cross-sig-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.priceTop}
              x2={layout.innerLeft}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.priceBottom}
              x2={layout.innerRight}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscTop}
              x2={layout.innerLeft}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscBottom}
              x2={layout.innerRight}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <text
                  key={`tick-price-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-hma-mid-cross-sig-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <text
                  key={`tick-osc-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-hma-mid-cross-sig-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hma-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-hma-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-hma-mid-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showHmaLine ? (
          <path
            d={layout.hmaPath}
            stroke={hmaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hma-mid-cross-sig-hma-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hma-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-hma-mid-cross-sig-crosses"
            role="group"
            aria-label="HMA-signal trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={biasFillColor(
                  m.kind,
                  m.bias,
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} HMA-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-hma-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-hma-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay HMA-signal trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={biasFillColor(
                  m.kind,
                  m.bias,
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-hma-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-hma-mid-cross-sig-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.oscBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-hma-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-hma-mid-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={272}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-mid-cross-sig-tooltip-hma"
                >
                  HMA{' '}
                  {tooltipSample.hma == null
                    ? '--'
                    : formatOsc(tooltipSample.hma)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-mid-cross-sig-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatOsc(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hma-mid-cross-sig-tooltip-biases"
                >
                  up {layout.run.upBiasCount} | down {layout.run.downBiasCount}{' '}
                  | flat {layout.run.flatBiasCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-hma-mid-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | half {layout.run.half} | sqrt{' '}
          {layout.run.sqrtPeriod} | signal {signalLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-hma-mid-cross-sig-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'close' },
              { id: 'hma' as const, color: hmaColor, label: 'HMA' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineHmaMidCrossSigSeriesId;
              color: string;
              label: string;
            }>
          ).map(({ id, color, label }) => (
            <button
              key={id}
              type="button"
              data-series-id={id}
              aria-pressed={!hidden.has(id)}
              onClick={() => handleLegendClick(id)}
              onKeyDown={(e) => handleLegendKey(e, id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 11,
                opacity: hidden.has(id) ? 0.4 : 1,
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: color,
                  borderRadius: 2,
                }}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

ChartLineHmaMidCrossSig.displayName = 'ChartLineHmaMidCrossSig';
