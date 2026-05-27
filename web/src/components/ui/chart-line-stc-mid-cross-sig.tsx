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
 * ChartLineStcMidCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Schaff Trend
 * Cycle (STC) plus its smoothed signal line in the bottom
 * panel, marking bullish (STC signal crosses up through the
 * midline 50, cycle centerline trigger) / bearish (STC signal
 * crosses down through the midline 50) STC midline-over-signal
 * crossover events with bias coloring derived from the signal
 * slope at the trigger bar. Signal-line variant of the STC
 * midline family: smooths the STC line with an additional SMA
 * so the trigger fires only when the smoothed cycle centerline
 * crosses the midline 50, suppressing the raw-STC whipsaws.
 *
 *   macd      = SMA(close, fast) - SMA(close, slow)
 *   k1        = stochastic(macd, cycleLength)  (degenerate = 50)
 *   d1        = EMA(k1, factor)
 *   k2        = stochastic(d1, cycleLength)    (degenerate = 50)
 *   stc       = EMA(k2, factor)
 *   signal    = SMA(stc, kSmoothing)
 *   bullish   : prev signal <= 50 && cur signal >  50
 *   bearish   : prev signal >= 50 && cur signal <  50
 *
 * Defaults: `fastLength = 23`, `slowLength = 50`, `cycleLength
 * = 10`, `factor = 0.5`, `kSmoothing = 3` (signal smoothing),
 * `threshold = 50` (midline). Regime classifier `bullish`
 * (signal >= 50), `bearish` (signal < 50), `none` (signal null).
 * Each sample also carries a `bias` field (`up` / `down` /
 * `flat` / `none`) derived from the signal slope at that bar.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: macd = 0 -> cycle collapses through
 *   stochastic and EMA cascade to stc = 50. signal = SMA(50, 3)
 *   = 50 via the SMA `min === max` short-circuit. signal == 50
 *   -> regime `bullish` (boundary inclusive). 0 crosses.
 *   Verified across K = 0..1234.
 * - **LINEAR UP close = i**: macd = 13.5 constant. cycle
 *   collapses to stc = 50. signal = 50. regime `bullish`. 0
 *   crosses.
 * - **LINEAR DOWN close = -i**: macd = -13.5. stc = 50. signal
 *   = 50. regime `bullish`. 0 crosses.
 */

export interface ChartLineStcMidCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineStcMidCrossSigRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineStcMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineStcMidCrossSigSeriesId = 'price' | 'stc' | 'signal';

export type ChartLineStcMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineStcMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineStcMidCrossSigCrossKind;
  bias: ChartLineStcMidCrossSigBias;
}

export interface ChartLineStcMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  stc: number | null;
  signal: number | null;
  bias: ChartLineStcMidCrossSigBias;
  regime: ChartLineStcMidCrossSigRegime;
}

export interface ChartLineStcMidCrossSigRun {
  series: ChartLineStcMidCrossSigPoint[];
  fastLength: number;
  slowLength: number;
  cycleLength: number;
  factor: number;
  kSmoothing: number;
  threshold: number;
  macdValues: Array<number | null>;
  k1Values: Array<number | null>;
  d1Values: Array<number | null>;
  k2Values: Array<number | null>;
  stcValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineStcMidCrossSigSample[];
  crosses: ChartLineStcMidCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineStcMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStcMidCrossSigLayout {
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
  priceDots: ChartLineStcMidCrossSigDot[];
  stcPath: string;
  signalPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  thresholdY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineStcMidCrossSigCrossKind;
    bias: ChartLineStcMidCrossSigBias;
  }>;
  run: ChartLineStcMidCrossSigRun;
}

export interface ChartLineStcMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStcMidCrossSigPoint[];
  fastLength?: number;
  slowLength?: number;
  cycleLength?: number;
  factor?: number;
  kSmoothing?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  stcColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  upBiasColor?: string;
  downBiasColor?: string;
  flatBiasColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStc?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showThreshold?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStcMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineStcMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStcMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FAST_LENGTH = 23;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_SLOW_LENGTH = 50;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_CYCLE_LENGTH = 10;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FACTOR = 0.5;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_K_SMOOTHING = 3;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_STC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineStcMidCrossSigFinitePoints(
  data: readonly ChartLineStcMidCrossSigPoint[] | null | undefined,
): ChartLineStcMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStcMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineStcMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineStcMidCrossSigThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

export function normalizeLineStcMidCrossSigFactor(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0 && value <= 1) return value;
  return fallback;
}

export function applyLineStcMidCrossSigSma(
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

export function applyLineStcMidCrossSigStochastic(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    let valid = true;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!valid) continue;
    const v = values[i]!;
    if (hi === lo) {
      out[i] = 50;
    } else {
      out[i] = posZero((100 * (v - lo)) / (hi - lo));
    }
  }
  return out;
}

export function applyLineStcMidCrossSigEma(
  values: readonly (number | null)[],
  factor: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let ema: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) continue;
    if (ema == null) {
      ema = v;
    } else {
      ema = factor * v + (1 - factor) * ema;
    }
    out[i] = posZero(ema);
  }
  return out;
}

export interface LineStcMidCrossSigChannels {
  macd: Array<number | null>;
  k1: Array<number | null>;
  d1: Array<number | null>;
  k2: Array<number | null>;
  stc: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineStcMidCrossSig(
  series: readonly ChartLineStcMidCrossSigPoint[] | null | undefined,
  options: {
    fastLength?: number;
    slowLength?: number;
    cycleLength?: number;
    factor?: number;
    kSmoothing?: number;
  } = {},
): LineStcMidCrossSigChannels {
  const cleaned = getLineStcMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { macd: [], k1: [], d1: [], k2: [], stc: [], signal: [] };
  }
  const fastLength = normalizeLineStcMidCrossSigLength(
    options.fastLength,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FAST_LENGTH,
  );
  const slowLength = normalizeLineStcMidCrossSigLength(
    options.slowLength,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_SLOW_LENGTH,
  );
  const cycleLength = normalizeLineStcMidCrossSigLength(
    options.cycleLength,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_CYCLE_LENGTH,
  );
  const factor = normalizeLineStcMidCrossSigFactor(
    options.factor,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FACTOR,
  );
  const kSmoothing = normalizeLineStcMidCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_K_SMOOTHING,
  );

  const closes = cleaned.map((p) => p.close);
  const fastSma = applyLineStcMidCrossSigSma(closes, fastLength);
  const slowSma = applyLineStcMidCrossSigSma(closes, slowLength);

  const macd: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const f = fastSma[i];
    const s = slowSma[i];
    if (f == null || s == null) continue;
    macd[i] = posZero(f - s);
  }

  const k1 = applyLineStcMidCrossSigStochastic(macd, cycleLength);
  const d1 = applyLineStcMidCrossSigEma(k1, factor);
  const k2 = applyLineStcMidCrossSigStochastic(d1, cycleLength);
  const stc = applyLineStcMidCrossSigEma(k2, factor);
  const signal = applyLineStcMidCrossSigSma(stc, kSmoothing);

  return { macd, k1, d1, k2, stc, signal };
}

export function classifyLineStcMidCrossSigRegime(
  signal: number | null,
  threshold: number,
): ChartLineStcMidCrossSigRegime {
  if (signal == null) return 'none';
  if (signal >= threshold) return 'bullish';
  return 'bearish';
}

export function classifyLineStcMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineStcMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineStcMidCrossSigCrosses(
  series: readonly ChartLineStcMidCrossSigPoint[],
  signalValues: readonly (number | null)[],
  threshold: number,
): ChartLineStcMidCrossSigCross[] {
  const out: ChartLineStcMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = signalValues[i - 1];
    const cur = signalValues[i];
    if (prev == null || cur == null) continue;
    const bias = classifyLineStcMidCrossSigBias(cur, prev);
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineStcMidCrossSig(
  data: ChartLineStcMidCrossSigPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    cycleLength?: number;
    factor?: number;
    kSmoothing?: number;
    threshold?: number;
  } = {},
): ChartLineStcMidCrossSigRun {
  const cleaned = getLineStcMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineStcMidCrossSigLength(
    options.fastLength,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FAST_LENGTH,
  );
  const slowLength = normalizeLineStcMidCrossSigLength(
    options.slowLength,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_SLOW_LENGTH,
  );
  const cycleLength = normalizeLineStcMidCrossSigLength(
    options.cycleLength,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_CYCLE_LENGTH,
  );
  const factor = normalizeLineStcMidCrossSigFactor(
    options.factor,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FACTOR,
  );
  const kSmoothing = normalizeLineStcMidCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_K_SMOOTHING,
  );
  const threshold = normalizeLineStcMidCrossSigThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_THRESHOLD,
  );

  const channels = computeLineStcMidCrossSig(series, {
    fastLength,
    slowLength,
    cycleLength,
    factor,
    kSmoothing,
  });

  const samples: ChartLineStcMidCrossSigSample[] = series.map((p, i) => {
    const stc = channels.stc[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prevSignal =
      i > 0 ? (channels.signal[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      stc,
      signal,
      bias: classifyLineStcMidCrossSigBias(signal, prevSignal),
      regime: classifyLineStcMidCrossSigRegime(signal, threshold),
    };
  });

  const crosses = detectLineStcMidCrossSigCrosses(
    series,
    channels.signal,
    threshold,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > slowLength + cycleLength * 2 + kSmoothing - 3;

  return {
    series,
    fastLength,
    slowLength,
    cycleLength,
    factor,
    kSmoothing,
    threshold,
    macdValues: channels.macd,
    k1Values: channels.k1,
    d1Values: channels.d1,
    k2Values: channels.k2,
    stcValues: channels.stc,
    signalValues: channels.signal,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineStcMidCrossSigLayoutOptions {
  data: ChartLineStcMidCrossSigPoint[];
  fastLength?: number;
  slowLength?: number;
  cycleLength?: number;
  factor?: number;
  kSmoothing?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStcMidCrossSigLayout(
  opts: ComputeLineStcMidCrossSigLayoutOptions,
): ChartLineStcMidCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PANEL_GAP;
  const threshold = normalizeLineStcMidCrossSigThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_THRESHOLD,
  );

  const run = runLineStcMidCrossSig(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
    cycleLength: opts.cycleLength ?? undefined,
    factor: opts.factor ?? undefined,
    kSmoothing: opts.kSmoothing ?? undefined,
    threshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  const oscMin = 0;
  const oscMax = 100;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const thresholdY = syOscBase(threshold);

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
      stcPath: '',
      signalPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      thresholdY,
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
  const priceDots: ChartLineStcMidCrossSigDot[] = [];
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

  let stcPath = '';
  let stcFirst = true;
  for (const s of run.samples) {
    if (s.stc == null) {
      stcFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.stc);
    stcPath += `${stcFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    stcFirst = false;
  }
  stcPath = stcPath.trim();

  let signalPath = '';
  let sigFirst = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      sigFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.signal);
    signalPath += `${sigFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    sigFirst = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.signalValues[c.index] ?? threshold);
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
    stcPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineStcMidCrossSigChart(
  data: ChartLineStcMidCrossSigPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    cycleLength?: number;
    factor?: number;
    kSmoothing?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineStcMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineStcMidCrossSigLength(
    options.fastLength,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FAST_LENGTH,
  );
  const slowLength = normalizeLineStcMidCrossSigLength(
    options.slowLength,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_SLOW_LENGTH,
  );
  const cycleLength = normalizeLineStcMidCrossSigLength(
    options.cycleLength,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_CYCLE_LENGTH,
  );
  const factor = normalizeLineStcMidCrossSigFactor(
    options.factor,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FACTOR,
  );
  const kSmoothing = normalizeLineStcMidCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_K_SMOOTHING,
  );
  const threshold = normalizeLineStcMidCrossSigThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_THRESHOLD,
  );
  return (
    `STC Midline Signal Cross chart over ${cleaned.length} bars ` +
    `(fastLength ${fastLength}, slowLength ${slowLength}, ` +
    `cycleLength ${cycleLength}, factor ${factor}, kSmoothing ` +
    `${kSmoothing}, threshold ${threshold}). Top panel renders ` +
    `the close with bullish (signal crosses up through midline ` +
    `50, cycle centerline trigger) / bearish (signal crosses ` +
    `down through midline 50) chevron overlays at every STC ` +
    `signal-line midline crossover, color-tinted by the signal ` +
    `slope bias at the trigger bar; bottom panel renders the ` +
    `close-only Schaff Trend Cycle and its smoothed signal line ` +
    `on a 0..100 oscillator with the midline ${threshold} ` +
    `reference and marks cycle centerline trigger events with ` +
    `bias coloring.`
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

function biasFillColor(
  kind: ChartLineStcMidCrossSigCrossKind,
  bias: ChartLineStcMidCrossSigBias,
  bullishColor: string,
  bearishColor: string,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (bias === 'up') return upColor;
  if (bias === 'down') return downColor;
  if (bias === 'flat') return flatColor;
  return kind === 'bullish' ? bullishColor : bearishColor;
}

export const ChartLineStcMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineStcMidCrossSigProps
>(function ChartLineStcMidCrossSig(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_SLOW_LENGTH,
    cycleLength = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_CYCLE_LENGTH,
    factor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FACTOR,
    kSmoothing = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_K_SMOOTHING,
    threshold = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_THRESHOLD,
    width = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_PRICE_COLOR,
    stcColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_STC_COLOR,
    signalColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_BEARISH_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    axisColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_STC_MID_CROSS_SIG_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStc = true,
    showSignal = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showThreshold = true,
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
    () => getLineStcMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStcMidCrossSigLayout({
        data: cleaned,
        fastLength,
        slowLength,
        cycleLength,
        factor,
        kSmoothing,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      fastLength,
      slowLength,
      cycleLength,
      factor,
      kSmoothing,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStcMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineStcMidCrossSigSeriesId,
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
    seriesId: ChartLineStcMidCrossSigSeriesId,
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
        data-section="chart-line-stc-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStcMidCrossSigChart(cleaned, {
      fastLength,
      slowLength,
      cycleLength,
      factor,
      kSmoothing,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showStcLine = !hidden.has('stc') && showStc;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, threshold, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'STC Midline Signal Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-stc-mid-cross-sig"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-cycle-length={cycleLength}
      data-factor={factor}
      data-k-smoothing={kSmoothing}
      data-threshold={threshold}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-stc-mid-cross-sig-title"
      >
        {ariaLabel ?? 'STC Midline Signal Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stc-mid-cross-sig-aria-desc"
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
        data-section="chart-line-stc-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stc-mid-cross-sig-grid">
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
                  data-section="chart-line-stc-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-stc-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showThreshold ? (
          <g data-section="chart-line-stc-mid-cross-sig-threshold">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-stc-mid-cross-sig-threshold-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stc-mid-cross-sig-axes">
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
                  data-section="chart-line-stc-mid-cross-sig-tick-price"
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
                  data-section="chart-line-stc-mid-cross-sig-tick-osc"
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
            data-section="chart-line-stc-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stc-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stc-mid-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showStcLine ? (
          <path
            d={layout.stcPath}
            stroke={stcColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stc-mid-cross-sig-stc-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            strokeDasharray="3 3"
            fill="none"
            data-section="chart-line-stc-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-stc-mid-cross-sig-crosses"
            role="group"
            aria-label="cross markers"
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
                  bullishColor,
                  bearishColor,
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-stc-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-stc-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
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
                  bullishColor,
                  bearishColor,
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-stc-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stc-mid-cross-sig-hover-targets">
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
                data-section="chart-line-stc-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stc-mid-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={256}
                  height={160}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-sig-tooltip-stc"
                >
                  STC{' '}
                  {tooltipSample.stc == null
                    ? '--'
                    : formatOsc(tooltipSample.stc)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-stc-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-sig-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-sig-tooltip-crosses"
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
          data-section="chart-line-stc-mid-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | cycle {cycleLength} |
          factor {factor} | kSmoothing {kSmoothing} | threshold {threshold} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stc-mid-cross-sig-legend"
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
              { id: 'stc' as const, color: stcColor, label: 'STC' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineStcMidCrossSigSeriesId;
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

ChartLineStcMidCrossSig.displayName = 'ChartLineStcMidCrossSig';
