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
 * ChartLineKamaCrossSig -- pure-SVG dual-panel chart with the
 * close in the top panel and the Perry Kaufman Adaptive
 * Moving Average (KAMA) plus its smoothed SMA signal line in
 * the bottom panel, marking bullish (KAMA crosses up through
 * signal -- volatility-adaptive trend trigger up) / bearish
 * (KAMA crosses down through signal -- volatility-adaptive
 * trend trigger down) KAMA-over-signal crossover trigger
 * events with bias coloring derived from the KAMA slope at
 * the trigger bar.
 *
 *   direction[i] = close[i] - close[i - efficiencyPeriod]
 *   volatility[i] = sum_{j=i-efficiencyPeriod+1..i} |close[j] - close[j-1]|
 *   er[i]        = |direction| / volatility;
 *                  0 when volatility === 0 (degenerate)
 *   fastSc       = 2 / (fastPeriod + 1)
 *   slowSc       = 2 / (slowPeriod + 1)
 *   sc[i]        = (er * (fastSc - slowSc) + slowSc) ** 2
 *   kama[i]      = kama[i-1] + sc[i] * (close[i] - kama[i-1])
 *   signal[i]    = SMA(kama, signalLength)
 *   bullish      : prev kama <= prev signal && cur kama > cur signal
 *   bearish      : prev kama >= prev signal && cur kama < cur signal
 *   regime       : bullish (kama >= signal), bearish (kama < signal)
 *   bias         : up / down / flat / none from kama[i] vs kama[i-1]
 *
 * Defaults: `efficiencyPeriod = 10`, `fastPeriod = 2`,
 * `slowPeriod = 30` (Kaufman's canonical KAMA tuning),
 * `signalLength = 3` (signal SMA window). Warmup is
 * `efficiencyPeriod + signalLength - 1 = 12` for the default
 * tuning: KAMA SMA-seeds at `efficiencyPeriod - 1 = 9`, then
 * the signal SMA needs another `signalLength - 1 = 2` valid
 * KAMA samples.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: direction = 0, volatility = 0 ->
 *   er = 0 (degenerate fallback) -> sc = slowSc^2 -> kama
 *   stays at K (no acceleration target since `close[i] -
 *   kama[i-1] = 0`). signal = K. kama === signal -> regime
 *   `bullish` (>=). 0 crosses. bias `flat` from second
 *   valid sample. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: direction = +efficiencyPeriod,
 *   volatility = efficiencyPeriod, er = 1 -> sc = fastSc^2
 *   = (2/3)^2 = 4/9. kama steady-state lag from `kama[i] =
 *   kama[i-1] + (4/9) * (i - kama[i-1])` solves to `kama[i]
 *   = i - 1.25`. signal SMA over kama lags another `(L-1)/2
 *   = 1` bar, so signal = `i - 2.25` and `kama - signal =
 *   +1`. regime `bullish`. 0 crosses (KAMA > signal
 *   monotonically throughout including the SMA-seed
 *   convergence).
 * - **LINEAR DOWN close = -i**: er = 1 -> sc = 4/9. kama =
 *   `-i + 1.25`, signal = `-i + 2.25`, `kama - signal =
 *   -1`. regime `bearish`. 0 crosses.
 */

export interface ChartLineKamaCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineKamaCrossSigRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineKamaCrossSigBias = 'up' | 'down' | 'flat' | 'none';

export type ChartLineKamaCrossSigSeriesId = 'price' | 'kama' | 'signal';

export type ChartLineKamaCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineKamaCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineKamaCrossSigCrossKind;
  bias: ChartLineKamaCrossSigBias;
}

export interface ChartLineKamaCrossSigSample {
  index: number;
  x: number;
  close: number;
  kama: number | null;
  signal: number | null;
  regime: ChartLineKamaCrossSigRegime;
  bias: ChartLineKamaCrossSigBias;
}

export interface ChartLineKamaCrossSigRun {
  series: ChartLineKamaCrossSigPoint[];
  efficiencyPeriod: number;
  fastPeriod: number;
  slowPeriod: number;
  signalLength: number;
  kamaValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineKamaCrossSigSample[];
  crosses: ChartLineKamaCrossSigCross[];
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

export interface ChartLineKamaCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKamaCrossSigLayout {
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
  priceDots: ChartLineKamaCrossSigDot[];
  kamaPath: string;
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
    kind: ChartLineKamaCrossSigCrossKind;
    bias: ChartLineKamaCrossSigBias;
  }>;
  run: ChartLineKamaCrossSigRun;
}

export interface ChartLineKamaCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKamaCrossSigPoint[];
  efficiencyPeriod?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kamaColor?: string;
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
  showKama?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKamaCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineKamaCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKamaCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_EFFICIENCY_PERIOD = 10;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_FAST_PERIOD = 2;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SLOW_PERIOD = 30;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_KAMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KAMA_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineKamaCrossSigFinitePoints(
  data: readonly ChartLineKamaCrossSigPoint[] | null | undefined,
): ChartLineKamaCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKamaCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineKamaCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average over `length` values. */
export function applyLineKamaCrossSigSma(
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

/**
 * Perry Kaufman's Adaptive Moving Average. The smoothing
 * constant adapts to recent volatility: in a clean trend
 * (high efficiency ratio) the SC approaches the fast
 * smoothing weight; in a choppy market (low ER) it
 * approaches the slow weight. Seeded with the SMA of the
 * first `efficiencyPeriod` closes.
 */
export function applyLineKamaCrossSigKama(
  closes: readonly number[],
  efficiencyPeriod: number,
  fastPeriod: number,
  slowPeriod: number,
): Array<number | null> {
  const n = closes.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (
    efficiencyPeriod < 1 ||
    fastPeriod < 1 ||
    slowPeriod < 1 ||
    n < efficiencyPeriod
  ) {
    return out;
  }
  const fastSc = 2 / (fastPeriod + 1);
  const slowSc = 2 / (slowPeriod + 1);
  // SMA seed at i = efficiencyPeriod - 1
  let sum = 0;
  for (let i = 0; i < efficiencyPeriod; i += 1) sum += closes[i]!;
  let kama = sum / efficiencyPeriod;
  out[efficiencyPeriod - 1] = posZero(kama);
  for (let i = efficiencyPeriod; i < n; i += 1) {
    const direction = Math.abs(closes[i]! - closes[i - efficiencyPeriod]!);
    let volatility = 0;
    for (let j = i - efficiencyPeriod + 1; j <= i; j += 1) {
      volatility += Math.abs(closes[j]! - closes[j - 1]!);
    }
    const er = volatility === 0 ? 0 : direction / volatility;
    const sc = (er * (fastSc - slowSc) + slowSc) ** 2;
    kama = kama + sc * (closes[i]! - kama);
    out[i] = posZero(kama);
  }
  return out;
}

export interface LineKamaCrossSigChannels {
  kama: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineKamaCrossSig(
  series: readonly ChartLineKamaCrossSigPoint[] | null | undefined,
  options: {
    efficiencyPeriod?: number;
    fastPeriod?: number;
    slowPeriod?: number;
    signalLength?: number;
  } = {},
): LineKamaCrossSigChannels {
  const cleaned = getLineKamaCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { kama: [], signal: [] };
  }
  const efficiencyPeriod = normalizeLineKamaCrossSigLength(
    options.efficiencyPeriod,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_EFFICIENCY_PERIOD,
  );
  const fastPeriod = normalizeLineKamaCrossSigLength(
    options.fastPeriod,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineKamaCrossSigLength(
    options.slowPeriod,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SLOW_PERIOD,
  );
  const signalLength = normalizeLineKamaCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SIGNAL_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const kama = applyLineKamaCrossSigKama(
    closes,
    efficiencyPeriod,
    fastPeriod,
    slowPeriod,
  );
  const signal = applyLineKamaCrossSigSma(kama, signalLength);
  return { kama, signal };
}

export function classifyLineKamaCrossSigRegime(
  kama: number | null,
  signal: number | null,
): ChartLineKamaCrossSigRegime {
  if (kama == null || signal == null) return 'none';
  if (kama >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineKamaCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineKamaCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineKamaCrossSigCrosses(
  series: readonly ChartLineKamaCrossSigPoint[],
  kamaValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineKamaCrossSigCross[] {
  const out: ChartLineKamaCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pk = kamaValues[i - 1];
    const ps = signalValues[i - 1];
    const ck = kamaValues[i];
    const cs = signalValues[i];
    if (pk == null || ps == null || ck == null || cs == null) continue;
    const bias = classifyLineKamaCrossSigBias(ck, pk);
    if (pk <= ps && ck > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pk >= ps && ck < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineKamaCrossSig(
  data: ChartLineKamaCrossSigPoint[],
  options: {
    efficiencyPeriod?: number;
    fastPeriod?: number;
    slowPeriod?: number;
    signalLength?: number;
  } = {},
): ChartLineKamaCrossSigRun {
  const cleaned = getLineKamaCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const efficiencyPeriod = normalizeLineKamaCrossSigLength(
    options.efficiencyPeriod,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_EFFICIENCY_PERIOD,
  );
  const fastPeriod = normalizeLineKamaCrossSigLength(
    options.fastPeriod,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineKamaCrossSigLength(
    options.slowPeriod,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SLOW_PERIOD,
  );
  const signalLength = normalizeLineKamaCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineKamaCrossSig(series, {
    efficiencyPeriod,
    fastPeriod,
    slowPeriod,
    signalLength,
  });

  const samples: ChartLineKamaCrossSigSample[] = series.map((p, i) => {
    const kama = channels.kama[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prevKama = i > 0 ? (channels.kama[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      kama,
      signal,
      regime: classifyLineKamaCrossSigRegime(kama, signal),
      bias: classifyLineKamaCrossSigBias(kama, prevKama),
    };
  });

  const crosses = detectLineKamaCrossSigCrosses(
    series,
    channels.kama,
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

  const warmup = efficiencyPeriod + signalLength - 2;
  const ok = series.length > warmup;

  return {
    series,
    efficiencyPeriod,
    fastPeriod,
    slowPeriod,
    signalLength,
    kamaValues: channels.kama,
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

export interface ComputeLineKamaCrossSigLayoutOptions {
  data: ChartLineKamaCrossSigPoint[];
  efficiencyPeriod?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineKamaCrossSigLayout(
  opts: ComputeLineKamaCrossSigLayoutOptions,
): ChartLineKamaCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_KAMA_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_KAMA_CROSS_SIG_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PANEL_GAP;

  const run = runLineKamaCrossSig(opts.data, {
    efficiencyPeriod: opts.efficiencyPeriod ?? undefined,
    fastPeriod: opts.fastPeriod ?? undefined,
    slowPeriod: opts.slowPeriod ?? undefined,
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
  for (let i = 0; i < run.kamaValues.length; i += 1) {
    const k = run.kamaValues[i];
    const s = run.signalValues[i];
    if (k != null) {
      if (k < oscRawMin) oscRawMin = k;
      if (k > oscRawMax) oscRawMax = k;
    }
    if (s != null) {
      if (s < oscRawMin) oscRawMin = s;
      if (s > oscRawMax) oscRawMax = s;
    }
  }
  if (!Number.isFinite(oscRawMin) || !Number.isFinite(oscRawMax)) {
    oscRawMin = 0;
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
      kamaPath: '',
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
  const priceDots: ChartLineKamaCrossSigDot[] = [];
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

  let kamaPath = '';
  let firstKama = true;
  for (const s of run.samples) {
    if (s.kama == null) {
      firstKama = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.kama);
    kamaPath += `${firstKama ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstKama = false;
  }
  kamaPath = kamaPath.trim();

  let signalPath = '';
  let firstSignal = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      firstSignal = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.signal);
    signalPath += `${firstSignal ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstSignal = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const kamaAtCross = run.kamaValues[c.index];
    const cyOsc = kamaAtCross != null ? syOscBase(kamaAtCross) : oscBottom;
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
    kamaPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineKamaCrossSigChart(
  data: ChartLineKamaCrossSigPoint[],
  options: {
    efficiencyPeriod?: number;
    fastPeriod?: number;
    slowPeriod?: number;
    signalLength?: number;
  } = {},
): string {
  const cleaned = getLineKamaCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const efficiencyPeriod = normalizeLineKamaCrossSigLength(
    options.efficiencyPeriod,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_EFFICIENCY_PERIOD,
  );
  const fastPeriod = normalizeLineKamaCrossSigLength(
    options.fastPeriod,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineKamaCrossSigLength(
    options.slowPeriod,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SLOW_PERIOD,
  );
  const signalLength = normalizeLineKamaCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `KAMA-over-Signal chart over ${cleaned.length} bars ` +
    `(efficiencyPeriod ${efficiencyPeriod}, fastPeriod ${fastPeriod}, ` +
    `slowPeriod ${slowPeriod}, signalLength ${signalLength}). Top ` +
    `panel renders the close with bullish (KAMA crosses up through ` +
    `signal, volatility-adaptive trend trigger up) / bearish (KAMA ` +
    `crosses down through signal, volatility-adaptive trend trigger ` +
    `down) chevron overlays at every KAMA-signal trigger event; ` +
    `bottom panel renders the Kaufman Adaptive Moving Average and ` +
    `its SMA signal line with markers coloured by KAMA slope bias ` +
    `(rising / falling / flat) at the trigger bar, flagging ` +
    `volatility-adaptive trend trigger events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineKamaCrossSigCrossKind,
  bias: ChartLineKamaCrossSigBias,
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

export const ChartLineKamaCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineKamaCrossSigProps
>(function ChartLineKamaCrossSig(props, ref): ReactNode {
  const {
    data,
    efficiencyPeriod = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_EFFICIENCY_PERIOD,
    fastPeriod = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_FAST_PERIOD,
    slowPeriod = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SLOW_PERIOD,
    signalLength = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_PRICE_COLOR,
    kamaColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_KAMA_COLOR,
    signalColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_SIGNAL_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_KAMA_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKama = true,
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
    () => getLineKamaCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineKamaCrossSigLayout({
        data: cleaned,
        efficiencyPeriod,
        fastPeriod,
        slowPeriod,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      efficiencyPeriod,
      fastPeriod,
      slowPeriod,
      signalLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineKamaCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineKamaCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineKamaCrossSigSeriesId,
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
        data-section="chart-line-kama-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineKamaCrossSigChart(cleaned, {
      efficiencyPeriod,
      fastPeriod,
      slowPeriod,
      signalLength,
    });

  const showPrice = !hidden.has('price');
  const showKamaLine = !hidden.has('kama') && showKama;
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
      aria-label={ariaLabel ?? 'KAMA-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-kama-cross-sig"
      data-efficiency-period={efficiencyPeriod}
      data-fast-period={fastPeriod}
      data-slow-period={slowPeriod}
      data-signal-length={signalLength}
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
        data-section="chart-line-kama-cross-sig-title"
      >
        {ariaLabel ?? 'KAMA-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-kama-cross-sig-aria-desc"
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
        data-section="chart-line-kama-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-kama-cross-sig-grid">
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
                  data-section="chart-line-kama-cross-sig-grid-line-price"
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
                  data-section="chart-line-kama-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-kama-cross-sig-axes">
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
                  data-section="chart-line-kama-cross-sig-tick-price"
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
                  data-section="chart-line-kama-cross-sig-tick-osc"
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
            data-section="chart-line-kama-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-kama-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-kama-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKamaLine ? (
          <path
            d={layout.kamaPath}
            stroke={kamaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kama-cross-sig-kama-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kama-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-kama-cross-sig-crosses"
            role="group"
            aria-label="KAMA-signal trigger markers"
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
                aria-label={`${m.kind} KAMA-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-kama-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-kama-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay KAMA-signal trigger markers"
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
                data-section={`chart-line-kama-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-kama-cross-sig-hover-targets">
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
                data-section="chart-line-kama-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-kama-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-sig-tooltip-kama"
                >
                  KAMA{' '}
                  {tooltipSample.kama == null
                    ? '--'
                    : formatOsc(tooltipSample.kama)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-sig-tooltip-signal"
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
                  data-section="chart-line-kama-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-cross-sig-tooltip-biases"
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
          data-section="chart-line-kama-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          eff {efficiencyPeriod} | fast {fastPeriod} | slow {slowPeriod}{' '}
          | signal {signalLength} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-kama-cross-sig-legend"
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
              { id: 'kama' as const, color: kamaColor, label: 'KAMA' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineKamaCrossSigSeriesId;
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

ChartLineKamaCrossSig.displayName = 'ChartLineKamaCrossSig';
