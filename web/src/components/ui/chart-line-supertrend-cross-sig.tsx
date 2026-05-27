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
 * ChartLineSupertrendCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the Supertrend trailing band
 * over its EMA-smoothed signal in the bottom panel, marking
 * bullish / bearish cross trigger events. This is the signal-
 * cross variant of the Supertrend family that separates the
 * smoothed trend trigger events from the discrete Supertrend
 * flip line published by 11.859 chart-line-supertrend-cross.
 *
 *   TR[i]       = i === 0 ? 0 : |close[i] - close[i-1]|
 *   ATR[i]      = Wilder smooth of TR over length
 *   upperBand   = close + factor * ATR
 *   lowerBand   = close - factor * ATR
 *   ST[i]       = trend flip with stickiness when close crosses
 *                 the active band
 *   signal[i]   = EMA(ST, signalLength)
 *   bullish    : (ST - signal) crosses up    (prev <= 0, cur > 0)
 *   bearish    : (ST - signal) crosses down  (prev >= 0, cur < 0)
 *
 * Defaults: `length = 10`, `factor = 3` (canonical Supertrend),
 * `signalLength = 9`. Regime classifier: `bullish` (ST >
 * signal), `bearish` (ST < signal), `neutral` (ST === signal),
 * `none` (either side null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: TR = 0 every bar -> ATR = 0
 *   -> upperBand = lowerBand = K -> Supertrend = K every bar.
 *   signal EMA of Ks = K via the `min === max` precision fix.
 *   ST === signal -> regime `neutral`, cross count = 0.
 *   Verified across K = 1..1234.
 */

export interface ChartLineSupertrendCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineSupertrendCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineSupertrendCrossSigSeriesId =
  | 'price'
  | 'supertrend'
  | 'signal';

export type ChartLineSupertrendCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineSupertrendCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineSupertrendCrossSigCrossKind;
}

export interface ChartLineSupertrendCrossSigSample {
  index: number;
  x: number;
  close: number;
  supertrend: number | null;
  signal: number | null;
  regime: ChartLineSupertrendCrossSigRegime;
}

export interface ChartLineSupertrendCrossSigRun {
  series: ChartLineSupertrendCrossSigPoint[];
  length: number;
  factor: number;
  signalLength: number;
  supertrendValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineSupertrendCrossSigSample[];
  crosses: ChartLineSupertrendCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineSupertrendCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSupertrendCrossSigLayout {
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
  priceDots: ChartLineSupertrendCrossSigDot[];
  supertrendPath: string;
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
    kind: ChartLineSupertrendCrossSigCrossKind;
  }>;
  run: ChartLineSupertrendCrossSigRun;
}

export interface ChartLineSupertrendCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSupertrendCrossSigPoint[];
  length?: number;
  factor?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  supertrendColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSupertrend?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSupertrendCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineSupertrendCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSupertrendCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_LENGTH = 10;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_FACTOR = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_SUPERTREND_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineSupertrendCrossSigFinitePoints(
  data: readonly ChartLineSupertrendCrossSigPoint[] | null | undefined,
): ChartLineSupertrendCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSupertrendCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineSupertrendCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite factor (> 0). */
export function normalizeLineSupertrendCrossSigFactor(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0) return value;
  return fallback;
}

/** Wilder smoothing with CONST short-circuit. */
export function applyLineSupertrendCrossSigWilder(
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

/** SMA-seeded EMA with the precision fix. */
export function applyLineSupertrendCrossSigEma(
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

export interface LineSupertrendCrossSigChannels {
  supertrend: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineSupertrendCrossSig(
  series: readonly ChartLineSupertrendCrossSigPoint[] | null | undefined,
  options: { length?: number; factor?: number; signalLength?: number } = {},
): LineSupertrendCrossSigChannels {
  const cleaned = getLineSupertrendCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { supertrend: [], signal: [] };
  }
  const length = normalizeLineSupertrendCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_LENGTH,
  );
  const factor = normalizeLineSupertrendCrossSigFactor(
    options.factor,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_FACTOR,
  );
  const signalLength = normalizeLineSupertrendCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_SIGNAL_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const tr: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i += 1) {
    tr[i] = Math.abs(closes[i]! - closes[i - 1]!);
  }
  const atrFromIdx1 = applyLineSupertrendCrossSigWilder(
    tr.slice(1),
    length,
  );
  const atr: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < atrFromIdx1.length; i += 1) {
    atr[i + 1] = atrFromIdx1[i] ?? null;
  }

  const supertrend: Array<number | null> = new Array(closes.length).fill(
    null,
  );
  let direction: 1 | -1 = 1;
  let prevUpper = Infinity;
  let prevLower = -Infinity;
  let prevSt: number | null = null;

  for (let i = 0; i < closes.length; i += 1) {
    const a = atr[i];
    if (a == null) continue;
    const c = closes[i]!;
    const rawUpper = c + factor * a;
    const rawLower = c - factor * a;
    let upper = rawUpper;
    let lower = rawLower;
    if (Number.isFinite(prevUpper)) {
      upper =
        rawUpper < prevUpper || closes[i - 1]! > prevUpper
          ? rawUpper
          : prevUpper;
    }
    if (Number.isFinite(prevLower)) {
      lower =
        rawLower > prevLower || closes[i - 1]! < prevLower
          ? rawLower
          : prevLower;
    }
    if (prevSt != null) {
      if (prevSt === prevUpper) {
        direction = c > upper ? 1 : -1;
      } else if (prevSt === prevLower) {
        direction = c < lower ? -1 : 1;
      } else {
        direction = c > prevSt ? 1 : -1;
      }
    } else {
      direction = c > rawUpper ? 1 : -1;
    }
    const st = direction === 1 ? lower : upper;
    supertrend[i] = posZero(st);
    prevUpper = upper;
    prevLower = lower;
    prevSt = st;
  }

  const signal = applyLineSupertrendCrossSigEma(supertrend, signalLength);

  return { supertrend, signal };
}

export function classifyLineSupertrendCrossSigRegime(
  supertrend: number | null,
  signal: number | null,
): ChartLineSupertrendCrossSigRegime {
  if (supertrend == null || signal == null) return 'none';
  if (supertrend > signal) return 'bullish';
  if (supertrend < signal) return 'bearish';
  return 'neutral';
}

export function detectLineSupertrendCrossSigCrosses(
  series: readonly ChartLineSupertrendCrossSigPoint[],
  supertrend: readonly (number | null)[],
  signal: readonly (number | null)[],
): ChartLineSupertrendCrossSigCross[] {
  const out: ChartLineSupertrendCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevSt = supertrend[i - 1];
    const prevSig = signal[i - 1];
    const curSt = supertrend[i];
    const curSig = signal[i];
    if (
      prevSt == null ||
      prevSig == null ||
      curSt == null ||
      curSig == null
    ) {
      continue;
    }
    const prevDiff = prevSt - prevSig;
    const curDiff = curSt - curSig;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineSupertrendCrossSig(
  data: ChartLineSupertrendCrossSigPoint[],
  options: { length?: number; factor?: number; signalLength?: number } = {},
): ChartLineSupertrendCrossSigRun {
  const cleaned = getLineSupertrendCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineSupertrendCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_LENGTH,
  );
  const factor = normalizeLineSupertrendCrossSigFactor(
    options.factor,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_FACTOR,
  );
  const signalLength = normalizeLineSupertrendCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineSupertrendCrossSig(series, {
    length,
    factor,
    signalLength,
  });

  const samples: ChartLineSupertrendCrossSigSample[] = series.map((p, i) => {
    const st = channels.supertrend[i] ?? null;
    const sig = channels.signal[i] ?? null;
    const regime = classifyLineSupertrendCrossSigRegime(st, sig);
    return {
      index: i,
      x: p.x,
      close: p.close,
      supertrend: st,
      signal: sig,
      regime,
    };
  });

  const crosses = detectLineSupertrendCrossSigCrosses(
    series,
    channels.supertrend,
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

  const ok = series.length > length + signalLength;

  return {
    series,
    length,
    factor,
    signalLength,
    supertrendValues: channels.supertrend,
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

export interface ComputeLineSupertrendCrossSigLayoutOptions {
  data: ChartLineSupertrendCrossSigPoint[];
  length?: number;
  factor?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSupertrendCrossSigLayout(
  opts: ComputeLineSupertrendCrossSigLayoutOptions,
): ChartLineSupertrendCrossSigLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_PANEL_GAP;

  const run = runLineSupertrendCrossSig(opts.data, {
    length: opts.length ?? undefined,
    factor: opts.factor ?? undefined,
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
      supertrendPath: '',
      signalPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: 0,
      oscMax: 1,
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
    if (s.supertrend != null) {
      if (s.supertrend < oscMin) oscMin = s.supertrend;
      if (s.supertrend > oscMax) oscMax = s.supertrend;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = 0;
    oscMax = 1;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }

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
  const priceDots: ChartLineSupertrendCrossSigDot[] = [];
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

  let supertrendPath = '';
  let stFirst = true;
  for (const s of run.samples) {
    if (s.supertrend == null) {
      stFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.supertrend);
    supertrendPath += `${stFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    stFirst = false;
  }
  supertrendPath = supertrendPath.trim();

  let signalPath = '';
  let sigFirst = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      sigFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.signal);
    signalPath += `${sigFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    sigFirst = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.supertrendValues[c.index] ?? oscMin);
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
    supertrendPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineSupertrendCrossSigChart(
  data: ChartLineSupertrendCrossSigPoint[],
  options: { length?: number; factor?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineSupertrendCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineSupertrendCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_LENGTH,
  );
  const factor = normalizeLineSupertrendCrossSigFactor(
    options.factor,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_FACTOR,
  );
  const signalLength = normalizeLineSupertrendCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `Supertrend Cross Signal chart over ${cleaned.length} bars ` +
    `(length ${length}, factor ${factor}, signalLength ` +
    `${signalLength}). Top panel renders the close with bullish ` +
    `/ bearish arrow overlays at every cross trigger; bottom ` +
    `panel overlays the Supertrend trailing band with its EMA-` +
    `smoothed signal line and marks trend trigger events ` +
    `separate from the discrete Supertrend flip line.`
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

export const ChartLineSupertrendCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineSupertrendCrossSigProps
>(function ChartLineSupertrendCrossSig(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_LENGTH,
    factor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_FACTOR,
    signalLength = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_PRICE_COLOR,
    supertrendColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_SUPERTREND_COLOR,
    signalColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SUPERTREND_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSupertrend = true,
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
    () => getLineSupertrendCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSupertrendCrossSigLayout({
        data: cleaned,
        length,
        factor,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      factor,
      signalLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSupertrendCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineSupertrendCrossSigSeriesId,
  ) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineSupertrendCrossSigSeriesId,
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
        data-section="chart-line-supertrend-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSupertrendCrossSigChart(cleaned, {
      length,
      factor,
      signalLength,
    });

  const showPrice = !hidden.has('price');
  const showSupertrendLine = !hidden.has('supertrend') && showSupertrend;
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
      aria-label={ariaLabel ?? 'Supertrend Cross Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-supertrend-cross-sig"
      data-length={length}
      data-factor={factor}
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
        data-section="chart-line-supertrend-cross-sig-title"
      >
        {ariaLabel ?? 'Supertrend Cross Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-supertrend-cross-sig-aria-desc"
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
        data-section="chart-line-supertrend-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-supertrend-cross-sig-grid">
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
                  data-section="chart-line-supertrend-cross-sig-grid-line-price"
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
                  data-section="chart-line-supertrend-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-supertrend-cross-sig-axes">
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
                  data-section="chart-line-supertrend-cross-sig-tick-price"
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
                  data-section="chart-line-supertrend-cross-sig-tick-osc"
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
            data-section="chart-line-supertrend-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-supertrend-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-supertrend-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSupertrendLine ? (
          <path
            d={layout.supertrendPath}
            stroke={supertrendColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-supertrend-cross-sig-supertrend-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-supertrend-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-supertrend-cross-sig-crosses"
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
                data-section={`chart-line-supertrend-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-supertrend-cross-sig-overlay-crosses"
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
                data-section={`chart-line-supertrend-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-supertrend-cross-sig-hover-targets">
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
                data-section="chart-line-supertrend-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-supertrend-cross-sig-tooltip"
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
                  data-section="chart-line-supertrend-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-sig-tooltip-supertrend"
                >
                  st{' '}
                  {tooltipSample.supertrend == null
                    ? '--'
                    : formatOsc(tooltipSample.supertrend)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-sig-tooltip-signal"
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
                  data-section="chart-line-supertrend-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-sig-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-cross-sig-tooltip-crosses"
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
          data-section="chart-line-supertrend-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | factor {factor} | signal {signalLength} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-supertrend-cross-sig-legend"
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
              {
                id: 'supertrend' as const,
                color: supertrendColor,
                label: 'supertrend',
              },
              {
                id: 'signal' as const,
                color: signalColor,
                label: 'signal',
              },
            ] satisfies Array<{
              id: ChartLineSupertrendCrossSigSeriesId;
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

ChartLineSupertrendCrossSig.displayName = 'ChartLineSupertrendCrossSig';
