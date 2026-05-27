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
 * ChartLineStochRsiCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the Stochastic RSI %K with its
 * EMA-smoothed signal in the bottom panel, marking bullish /
 * bearish cross trigger events. The trigger-focused StochRSI
 * variant distinct from 11.857 chart-line-stoch-rsi-cross
 * (which marks K-over-D crossings): this primitive replaces the
 * %D line with an EMA-smoothed signal so the actionable
 * momentum oscillator trigger events line up with the broader
 * cross-sig family.
 *
 *   RSI[i]      = Wilder RSI(close, rsiLength)
 *                  -- midpoint = 50 when both avgGain and
 *                     avgLoss are zero
 *   highest[i]  = max(RSI[i - stochLength + 1 .. i])
 *   lowest[i]   = min(RSI[i - stochLength + 1 .. i])
 *   stochRSI[i] = highest === lowest
 *                   ? 50
 *                   : (RSI[i] - lowest) / (highest - lowest) *
 *                     100
 *   K[i]        = SMA(stochRSI, slowKLength)
 *   signal[i]   = EMA(K, signalLength)
 *   bullish    : (K - signal) crosses up    (prev <= 0, cur > 0)
 *   bearish    : (K - signal) crosses down  (prev >= 0, cur < 0)
 *
 * Defaults: `rsiLength = 14`, `stochLength = 14`, `slowKLength
 * = 3`, `signalLength = 9`. Regime classifier: `bullish` (K >
 * signal), `bearish` (K < signal), `neutral` (K === signal),
 * `none` (either side null).
 *
 * Bit-exact anchors (three):
 *
 * - **CONST close = K (K > 0)**: RSI = 50 every bar -> highest
 *   === lowest = 50 -> stochRSI = 50 via the degenerate-range
 *   midpoint fallback -> K = SMA(50) = 50 -> signal EMA of 50s
 *   = 50. K === signal -> regime `neutral`, cross count = 0.
 * - **LINEAR UP step > 0**: RSI = 100 every bar -> degenerate
 *   range -> stochRSI = 50 -> K = 50 -> signal = 50 -> regime
 *   `neutral`, cross count = 0.
 * - **LINEAR DOWN step < 0**: RSI = 0 every bar -> degenerate
 *   range -> stochRSI = 50 -> K = 50 -> signal = 50 -> regime
 *   `neutral`, cross count = 0.
 *
 * Verified across multiple K values and start values.
 */

export interface ChartLineStochRsiCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineStochRsiCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineStochRsiCrossSigSeriesId =
  | 'price'
  | 'k'
  | 'signal';

export type ChartLineStochRsiCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineStochRsiCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineStochRsiCrossSigCrossKind;
}

export interface ChartLineStochRsiCrossSigSample {
  index: number;
  x: number;
  close: number;
  k: number | null;
  signal: number | null;
  regime: ChartLineStochRsiCrossSigRegime;
}

export interface ChartLineStochRsiCrossSigRun {
  series: ChartLineStochRsiCrossSigPoint[];
  rsiLength: number;
  stochLength: number;
  slowKLength: number;
  signalLength: number;
  kValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineStochRsiCrossSigSample[];
  crosses: ChartLineStochRsiCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineStochRsiCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochRsiCrossSigLayout {
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
  priceDots: ChartLineStochRsiCrossSigDot[];
  kPath: string;
  signalPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineStochRsiCrossSigCrossKind;
  }>;
  run: ChartLineStochRsiCrossSigRun;
}

export interface ChartLineStochRsiCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochRsiCrossSigPoint[];
  rsiLength?: number;
  stochLength?: number;
  slowKLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showK?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochRsiCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineStochRsiCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochRsiCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_RSI_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_STOCH_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SLOW_K_LENGTH = 3;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_K_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineStochRsiCrossSigFinitePoints(
  data: readonly ChartLineStochRsiCrossSigPoint[] | null | undefined,
): ChartLineStochRsiCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochRsiCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineStochRsiCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Wilder smoothing with CONST short-circuit. */
export function applyLineStochRsiCrossSigWilder(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (values.length < length) return out;
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += values[i]!;
  const seed = posZero(sum / length);
  out[length - 1] = seed;
  let prev = seed;
  for (let i = length; i < values.length; i += 1) {
    const v = values[i]!;
    const next =
      v === prev ? v : posZero((prev * (length - 1) + v) / length);
    out[i] = next;
    prev = next;
  }
  return out;
}

/** SMA with the precision fix. */
export function applyLineStochRsiCrossSigSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let winMin = Infinity;
    let winMax = -Infinity;
    let ok = true;
    for (let k = 0; k < length; k += 1) {
      const v = values[i - length + 1 + k];
      if (v == null) {
        ok = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!ok) continue;
    out[i] =
      winMin === winMax && Number.isFinite(winMin)
        ? winMin
        : posZero(sum / length);
  }
  return out;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineStochRsiCrossSigEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);

  let seedSum = 0;
  let seedCount = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < values.length && seedCount < length; i += 1) {
    const v = values[i];
    if (v == null) {
      seedSum = 0;
      seedCount = 0;
      winMin = Infinity;
      winMax = -Infinity;
      continue;
    }
    seedSum += v;
    seedCount += 1;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
    if (seedCount === length) {
      const seed =
        winMin === winMax && Number.isFinite(winMin)
          ? winMin
          : posZero(seedSum / length);
      out[i] = seed;
      let prev = seed;
      for (let j = i + 1; j < values.length; j += 1) {
        const nv = values[j];
        if (nv == null) {
          break;
        }
        const next = nv === prev ? nv : posZero(alpha * nv + (1 - alpha) * prev);
        out[j] = next;
        prev = next;
      }
      break;
    }
  }
  return out;
}

export interface LineStochRsiCrossSigChannels {
  k: Array<number | null>;
  signal: Array<number | null>;
  rsi: Array<number | null>;
}

export function computeLineStochRsiCrossSig(
  series: readonly ChartLineStochRsiCrossSigPoint[] | null | undefined,
  options: {
    rsiLength?: number;
    stochLength?: number;
    slowKLength?: number;
    signalLength?: number;
  } = {},
): LineStochRsiCrossSigChannels {
  const cleaned = getLineStochRsiCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { k: [], signal: [], rsi: [] };
  }
  const rsiLength = normalizeLineStochRsiCrossSigLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiCrossSigLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_STOCH_LENGTH,
  );
  const slowKLength = normalizeLineStochRsiCrossSigLength(
    options.slowKLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SLOW_K_LENGTH,
  );
  const signalLength = normalizeLineStochRsiCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SIGNAL_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const gains: number[] = new Array(closes.length).fill(0);
  const losses: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    const delta = closes[i]! - closes[i - 1]!;
    if (delta > 0) gains[i] = delta;
    else if (delta < 0) losses[i] = -delta;
  }
  const avgG = applyLineStochRsiCrossSigWilder(gains.slice(1), rsiLength);
  const avgL = applyLineStochRsiCrossSigWilder(losses.slice(1), rsiLength);

  const rsi: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = rsiLength; i < closes.length; i += 1) {
    const g = avgG[i - 1];
    const l = avgL[i - 1];
    if (g == null || l == null) continue;
    if (l === 0) {
      rsi[i] = g === 0 ? 50 : 100;
    } else {
      rsi[i] = posZero(100 - 100 / (1 + g / l));
    }
  }

  const stochRsi: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const cur = rsi[i];
    if (cur == null) continue;
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let k = 0; k < stochLength; k += 1) {
      const v = rsi[i - k];
      if (v == null) {
        ok = false;
        break;
      }
      if (v > hh) hh = v;
      if (v < ll) ll = v;
    }
    if (!ok) continue;
    if (hh === ll) {
      stochRsi[i] = 50;
    } else {
      stochRsi[i] = posZero(((cur - ll) / (hh - ll)) * 100);
    }
  }

  const k = applyLineStochRsiCrossSigSma(stochRsi, slowKLength);
  const signal = applyLineStochRsiCrossSigEma(k, signalLength);

  return { k, signal, rsi };
}

export function classifyLineStochRsiCrossSigRegime(
  k: number | null,
  signal: number | null,
): ChartLineStochRsiCrossSigRegime {
  if (k == null || signal == null) return 'none';
  if (k > signal) return 'bullish';
  if (k < signal) return 'bearish';
  return 'neutral';
}

export function detectLineStochRsiCrossSigCrosses(
  series: readonly ChartLineStochRsiCrossSigPoint[],
  k: readonly (number | null)[],
  signal: readonly (number | null)[],
): ChartLineStochRsiCrossSigCross[] {
  const out: ChartLineStochRsiCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevK = k[i - 1];
    const prevSig = signal[i - 1];
    const curK = k[i];
    const curSig = signal[i];
    if (
      prevK == null ||
      prevSig == null ||
      curK == null ||
      curSig == null
    ) {
      continue;
    }
    const prevDiff = prevK - prevSig;
    const curDiff = curK - curSig;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineStochRsiCrossSig(
  data: ChartLineStochRsiCrossSigPoint[],
  options: {
    rsiLength?: number;
    stochLength?: number;
    slowKLength?: number;
    signalLength?: number;
  } = {},
): ChartLineStochRsiCrossSigRun {
  const cleaned = getLineStochRsiCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const rsiLength = normalizeLineStochRsiCrossSigLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiCrossSigLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_STOCH_LENGTH,
  );
  const slowKLength = normalizeLineStochRsiCrossSigLength(
    options.slowKLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SLOW_K_LENGTH,
  );
  const signalLength = normalizeLineStochRsiCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineStochRsiCrossSig(series, {
    rsiLength,
    stochLength,
    slowKLength,
    signalLength,
  });

  const samples: ChartLineStochRsiCrossSigSample[] = series.map((p, i) => {
    const k = channels.k[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const regime = classifyLineStochRsiCrossSigRegime(k, signal);
    return {
      index: i,
      x: p.x,
      close: p.close,
      k,
      signal,
      regime,
    };
  });

  const crosses = detectLineStochRsiCrossSigCrosses(
    series,
    channels.k,
    channels.signal,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok =
    series.length > rsiLength + stochLength + slowKLength + signalLength;

  return {
    series,
    rsiLength,
    stochLength,
    slowKLength,
    signalLength,
    kValues: channels.k,
    signalValues: channels.signal,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineStochRsiCrossSigLayoutOptions {
  data: ChartLineStochRsiCrossSigPoint[];
  rsiLength?: number;
  stochLength?: number;
  slowKLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStochRsiCrossSigLayout(
  opts: ComputeLineStochRsiCrossSigLayoutOptions,
): ChartLineStochRsiCrossSigLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_PANEL_GAP;

  const run = runLineStochRsiCrossSig(opts.data, {
    rsiLength: opts.rsiLength ?? undefined,
    stochLength: opts.stochLength ?? undefined,
    slowKLength: opts.slowKLength ?? undefined,
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

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
      kPath: '',
      signalPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: (oscTop + oscBottom) / 2,
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.k != null) {
      if (s.k < oscMin) oscMin = s.k;
      if (s.k > oscMax) oscMax = s.k;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = 0;
    oscMax = 100;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineStochRsiCrossSigDot[] = [];
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

  let kPath = '';
  let kFirst = true;
  for (const s of run.samples) {
    if (s.k == null) {
      kFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.k);
    kPath += `${kFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    kFirst = false;
  }
  kPath = kPath.trim();

  let signalPath = '';
  let signalFirst = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      signalFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.signal);
    signalPath += `${signalFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    signalFirst = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.kValues[c.index] ?? 0);
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
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
    kPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY: syOsc(0),
    crossMarkers,
    run,
  };
}

export function describeLineStochRsiCrossSigChart(
  data: ChartLineStochRsiCrossSigPoint[],
  options: {
    rsiLength?: number;
    stochLength?: number;
    slowKLength?: number;
    signalLength?: number;
  } = {},
): string {
  const cleaned = getLineStochRsiCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const rsiLength = normalizeLineStochRsiCrossSigLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiCrossSigLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_STOCH_LENGTH,
  );
  const slowKLength = normalizeLineStochRsiCrossSigLength(
    options.slowKLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SLOW_K_LENGTH,
  );
  const signalLength = normalizeLineStochRsiCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `StochRSI Cross Signal chart over ${cleaned.length} bars ` +
    `(rsi ${rsiLength}, stoch ${stochLength}, slowK ` +
    `${slowKLength}, signal ${signalLength}). Top panel renders ` +
    `the close with bullish / bearish arrow overlays at every ` +
    `cross trigger; bottom panel overlays the Stochastic RSI %K ` +
    `with its EMA-smoothed signal line and marks momentum ` +
    `oscillator trigger events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineStochRsiCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineStochRsiCrossSigProps
>(function ChartLineStochRsiCrossSig(props, ref): ReactNode {
  const {
    data,
    rsiLength = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_RSI_LENGTH,
    stochLength = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_STOCH_LENGTH,
    slowKLength = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SLOW_K_LENGTH,
    signalLength = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_PRICE_COLOR,
    kColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_K_COLOR,
    signalColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showK = true,
    showSignal = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showZeroLine = true,
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
    () => getLineStochRsiCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStochRsiCrossSigLayout({
        data: cleaned,
        rsiLength,
        stochLength,
        slowKLength,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      rsiLength,
      stochLength,
      slowKLength,
      signalLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStochRsiCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineStochRsiCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineStochRsiCrossSigSeriesId,
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
        data-section="chart-line-stoch-rsi-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStochRsiCrossSigChart(cleaned, {
      rsiLength,
      stochLength,
      slowKLength,
      signalLength,
    });

  const showPrice = !hidden.has('price');
  const showKLine = !hidden.has('k') && showK;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'StochRSI Cross Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-stoch-rsi-cross-sig"
      data-rsi-length={rsiLength}
      data-stoch-length={stochLength}
      data-slow-k-length={slowKLength}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-stoch-rsi-cross-sig-title"
      >
        {ariaLabel ?? 'StochRSI Cross Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stoch-rsi-cross-sig-aria-desc"
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
        data-section="chart-line-stoch-rsi-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stoch-rsi-cross-sig-grid">
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
                  data-section="chart-line-stoch-rsi-cross-sig-grid-line-price"
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
                  data-section="chart-line-stoch-rsi-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stoch-rsi-cross-sig-axes">
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
                  data-section="chart-line-stoch-rsi-cross-sig-tick-price"
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
                  data-section="chart-line-stoch-rsi-cross-sig-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-stoch-rsi-cross-sig-zeroline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-rsi-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stoch-rsi-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stoch-rsi-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKLine ? (
          <path
            d={layout.kPath}
            stroke={kColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-rsi-cross-sig-k-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-rsi-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-stoch-rsi-cross-sig-crosses"
            role="group"
            aria-label="cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-stoch-rsi-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-stoch-rsi-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                    : `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-stoch-rsi-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stoch-rsi-cross-sig-hover-targets">
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
                data-section="chart-line-stoch-rsi-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stoch-rsi-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={216}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-sig-tooltip-k"
                >
                  k{' '}
                  {tooltipSample.k == null
                    ? '--'
                    : formatOsc(tooltipSample.k)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-sig-tooltip-signal"
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
                  data-section="chart-line-stoch-rsi-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-sig-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-sig-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-stoch-rsi-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          rsi {rsiLength} | stoch {stochLength} | k {slowKLength} | sig{' '}
          {signalLength} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stoch-rsi-cross-sig-legend"
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
              { id: 'k' as const, color: kColor, label: 'k' },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
            ] satisfies Array<{
              id: ChartLineStochRsiCrossSigSeriesId;
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

ChartLineStochRsiCrossSig.displayName = 'ChartLineStochRsiCrossSig';
