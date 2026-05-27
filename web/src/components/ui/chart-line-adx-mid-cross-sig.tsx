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
 * ChartLineAdxMidCrossSig -- pure-SVG dual-panel chart with the
 * close in the top panel and the Wilder Average Directional
 * Index (ADX) plus its smoothed signal line in the bottom
 * panel, marking bullish (signal crosses up through the
 * midline 25, trend strength emerging) / bearish (signal
 * crosses down through the midline 25, trend strength dying)
 * ADX midline-over-signal crossover trigger events with bias
 * coloring derived from the signal slope at the trigger bar.
 *
 * Signal-line variant of the ADX midline family: smooths the
 * Wilder ADX with an additional SMA so the trigger fires only
 * when the smoothed trend strength crosses the canonical
 * trending threshold of 25, suppressing the raw-ADX whipsaws.
 *
 *   adx       = Wilder ADX over HLC (length-bar smoothing)
 *   signal    = SMA(adx, kSmoothing)
 *   bullish   : prev signal <= 25 && cur signal >  25
 *   bearish   : prev signal >= 25 && cur signal <  25
 *   regime    : bullish (signal >= 25), bearish (signal < 25),
 *               none (signal null)
 *   bias      : up / down / flat / none derived from signal[i]
 *               vs signal[i-1]
 *
 * Defaults: `length = 14` (Wilder's canonical ADX window),
 * `kSmoothing = 3` (signal smoothing), `threshold = 25`
 * (midline). Warmup is `2 * length - 1 + kSmoothing - 1 =
 * 29` for the default tuning: ADX seeds at `2 * length - 1
 * = 27`, signal SMA needs another `kSmoothing - 1` valid ADX
 * samples.
 *
 * Bit-exact anchor:
 *
 * - **CONST HLC = K**: TR = 0, +DM = -DM = 0 -> degenerate
 *   directional indicators -> degenerate DX = 0 -> ADX = 0.
 *   signal = SMA(0, 3) = 0 via the SMA `min === max` short-
 *   circuit. signal < 25 -> regime `bearish`, bias `flat`
 *   from the second valid signal. 0 triggers. Verified
 *   across K = 0..1234.
 * - **LINEAR UP (h=i+1, l=i-1, c=i)**: TR = 2, +DM = 1,
 *   -DM = 0 -> +DI = 50, -DI = 0, DX = 100, ADX = 100.
 *   signal = SMA(100, 3) = 100. signal > 25 -> regime
 *   `bullish`. signal at i = WARMUP has prev null (`bias =
 *   none`); from i = WARMUP + 1 onwards signal[i] ===
 *   signal[i-1] = 100 -> `bias = flat`. 0 triggers because
 *   the very first valid signal already sits above 25 (no
 *   crossing).
 * - **LINEAR DOWN (h=-i+1, l=-i-1, c=-i)**: TR = 2, +DM = 0,
 *   -DM = 1 -> +DI = 0, -DI = 50, DX = 100, ADX = 100,
 *   signal = 100, regime `bullish`. 0 triggers.
 */

export interface ChartLineAdxMidCrossSigPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAdxMidCrossSigRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineAdxMidCrossSigBias = 'up' | 'down' | 'flat' | 'none';

export type ChartLineAdxMidCrossSigSeriesId = 'price' | 'adx' | 'signal';

export type ChartLineAdxMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineAdxMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineAdxMidCrossSigCrossKind;
  bias: ChartLineAdxMidCrossSigBias;
}

export interface ChartLineAdxMidCrossSigSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  adx: number | null;
  signal: number | null;
  regime: ChartLineAdxMidCrossSigRegime;
  bias: ChartLineAdxMidCrossSigBias;
}

export interface ChartLineAdxMidCrossSigRun {
  series: ChartLineAdxMidCrossSigPoint[];
  length: number;
  kSmoothing: number;
  threshold: number;
  adxValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineAdxMidCrossSigSample[];
  crosses: ChartLineAdxMidCrossSigCross[];
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

export interface ChartLineAdxMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxMidCrossSigLayout {
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
  priceDots: ChartLineAdxMidCrossSigDot[];
  adxPath: string;
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
    kind: ChartLineAdxMidCrossSigCrossKind;
    bias: ChartLineAdxMidCrossSigBias;
  }>;
  run: ChartLineAdxMidCrossSigRun;
}

export interface ChartLineAdxMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxMidCrossSigPoint[];
  length?: number;
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
  adxColor?: string;
  signalColor?: string;
  upBiasColor?: string;
  downBiasColor?: string;
  flatBiasColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  thresholdColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdx?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showThreshold?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineAdxMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_LENGTH = 14;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_K_SMOOTHING = 3;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_THRESHOLD = 25;
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_ADX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_THRESHOLD_COLOR =
  '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineAdxMidCrossSigFinitePoints(
  data: readonly ChartLineAdxMidCrossSigPoint[] | null | undefined,
): ChartLineAdxMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxMidCrossSigPoint[] = [];
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

export function normalizeLineAdxMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineAdxMidCrossSigThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/** SMA-seeded Wilder RMA over a nullable input array. */
export function applyLineAdxMidCrossSigSmaSeededRma(
  values: ReadonlyArray<number | null>,
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  let firstValidIdx = -1;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] != null) {
      firstValidIdx = i;
      break;
    }
  }
  if (firstValidIdx === -1) return out;
  const seedEnd = firstValidIdx + length - 1;
  if (seedEnd >= values.length) return out;
  let sum = 0;
  for (let i = firstValidIdx; i <= seedEnd; i += 1) {
    const v = values[i];
    if (v == null) return out;
    sum += v;
  }
  const seed = sum / length;
  out[seedEnd] = posZero(seed);
  let rma = seed;
  const alpha = 1 / length;
  for (let i = seedEnd + 1; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) return out;
    rma = rma * (1 - alpha) + v * alpha;
    out[i] = posZero(rma);
  }
  return out;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineAdxMidCrossSigSma(
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

/** Wilder ADX from HLC inputs. */
export function applyLineAdxMidCrossSigAdx(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  length: number,
): Array<number | null> {
  const n = Math.min(highs.length, lows.length, closes.length);
  const out: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || n < 2) return out;
  const tr: Array<number | null> = new Array(n).fill(null);
  const plusDm: Array<number | null> = new Array(n).fill(null);
  const minusDm: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const h = highs[i]!;
    const l = lows[i]!;
    const ph = highs[i - 1]!;
    const pl = lows[i - 1]!;
    const pc = closes[i - 1]!;
    const highMove = h - ph;
    const lowMove = pl - l;
    plusDm[i] = highMove > lowMove && highMove > 0 ? highMove : 0;
    minusDm[i] = lowMove > highMove && lowMove > 0 ? lowMove : 0;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const smTr = applyLineAdxMidCrossSigSmaSeededRma(tr, length);
  const smPlusDm = applyLineAdxMidCrossSigSmaSeededRma(plusDm, length);
  const smMinusDm = applyLineAdxMidCrossSigSmaSeededRma(minusDm, length);
  const dx: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const t = smTr[i];
    const p = smPlusDm[i];
    const m = smMinusDm[i];
    if (t == null || p == null || m == null) continue;
    if (t === 0) {
      dx[i] = 0;
      continue;
    }
    const plusDi = (100 * p) / t;
    const minusDi = (100 * m) / t;
    const sum = plusDi + minusDi;
    if (sum === 0) {
      dx[i] = 0;
    } else {
      dx[i] = posZero((100 * Math.abs(plusDi - minusDi)) / sum);
    }
  }
  return applyLineAdxMidCrossSigSmaSeededRma(dx, length);
}

export interface LineAdxMidCrossSigChannels {
  adx: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineAdxMidCrossSig(
  series: readonly ChartLineAdxMidCrossSigPoint[] | null | undefined,
  options: { length?: number; kSmoothing?: number } = {},
): LineAdxMidCrossSigChannels {
  const cleaned = getLineAdxMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { adx: [], signal: [] };
  }
  const length = normalizeLineAdxMidCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_LENGTH,
  );
  const kSmoothing = normalizeLineAdxMidCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_K_SMOOTHING,
  );
  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  const closes = cleaned.map((p) => p.close);
  const adx = applyLineAdxMidCrossSigAdx(highs, lows, closes, length);
  const signal = applyLineAdxMidCrossSigSma(adx, kSmoothing);
  return { adx, signal };
}

export function classifyLineAdxMidCrossSigRegime(
  signal: number | null,
  threshold: number,
): ChartLineAdxMidCrossSigRegime {
  if (signal == null) return 'none';
  if (signal >= threshold) return 'bullish';
  return 'bearish';
}

export function classifyLineAdxMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineAdxMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineAdxMidCrossSigCrosses(
  series: readonly ChartLineAdxMidCrossSigPoint[],
  signalValues: readonly (number | null)[],
  threshold: number,
): ChartLineAdxMidCrossSigCross[] {
  const out: ChartLineAdxMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = signalValues[i - 1];
    const cur = signalValues[i];
    if (prev == null || cur == null) continue;
    const bias = classifyLineAdxMidCrossSigBias(cur, prev);
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineAdxMidCrossSig(
  data: ChartLineAdxMidCrossSigPoint[],
  options: {
    length?: number;
    kSmoothing?: number;
    threshold?: number;
  } = {},
): ChartLineAdxMidCrossSigRun {
  const cleaned = getLineAdxMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineAdxMidCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_LENGTH,
  );
  const kSmoothing = normalizeLineAdxMidCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_K_SMOOTHING,
  );
  const threshold = normalizeLineAdxMidCrossSigThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_THRESHOLD,
  );

  const channels = computeLineAdxMidCrossSig(series, {
    length,
    kSmoothing,
  });

  const samples: ChartLineAdxMidCrossSigSample[] = series.map((p, i) => {
    const adx = channels.adx[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prevSignal = i > 0 ? (channels.signal[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      adx,
      signal,
      regime: classifyLineAdxMidCrossSigRegime(signal, threshold),
      bias: classifyLineAdxMidCrossSigBias(signal, prevSignal),
    };
  });

  const crosses = detectLineAdxMidCrossSigCrosses(
    series,
    channels.signal,
    threshold,
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

  const warmup = 2 * length - 1 + kSmoothing - 1;
  const ok = series.length > warmup;

  return {
    series,
    length,
    kSmoothing,
    threshold,
    adxValues: channels.adx,
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

export interface ComputeLineAdxMidCrossSigLayoutOptions {
  data: ChartLineAdxMidCrossSigPoint[];
  length?: number;
  kSmoothing?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAdxMidCrossSigLayout(
  opts: ComputeLineAdxMidCrossSigLayoutOptions,
): ChartLineAdxMidCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineAdxMidCrossSig(opts.data, {
    length: opts.length ?? undefined,
    kSmoothing: opts.kSmoothing ?? undefined,
    threshold: opts.threshold ?? undefined,
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
  const thresholdY = syOscBase(run.threshold);

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
      adxPath: '',
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
  const priceDots: ChartLineAdxMidCrossSigDot[] = [];
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

  let adxPath = '';
  let firstAdx = true;
  for (const s of run.samples) {
    if (s.adx == null) {
      firstAdx = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.adx);
    adxPath += `${firstAdx ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstAdx = false;
  }
  adxPath = adxPath.trim();

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
    const cyOsc = syOscBase(run.signalValues[c.index] ?? 0);
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
    adxPath,
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

export function describeLineAdxMidCrossSigChart(
  data: ChartLineAdxMidCrossSigPoint[],
  options: {
    length?: number;
    kSmoothing?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineAdxMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineAdxMidCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_LENGTH,
  );
  const kSmoothing = normalizeLineAdxMidCrossSigLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_K_SMOOTHING,
  );
  const threshold = normalizeLineAdxMidCrossSigThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_THRESHOLD,
  );
  return (
    `ADX Midline-over-Signal chart over ${cleaned.length} bars ` +
    `(length ${length}, kSmoothing ${kSmoothing}, threshold ` +
    `${threshold}). Top panel renders the close with bullish ` +
    `(signal crosses up through ${threshold}, trend strength ` +
    `emerging) / bearish (signal crosses down through ${threshold}, ` +
    `trend strength dying) chevron overlays at every ADX-signal-` +
    `midline trigger event; bottom panel renders the Wilder ADX and ` +
    `its SMA signal line with markers coloured by slope bias ` +
    `(rising / falling / flat) at the trigger bar, flagging trend ` +
    `strength threshold trigger events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineAdxMidCrossSigCrossKind,
  bias: ChartLineAdxMidCrossSigBias,
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

export const ChartLineAdxMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineAdxMidCrossSigProps
>(function ChartLineAdxMidCrossSig(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_LENGTH,
    kSmoothing = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_K_SMOOTHING,
    threshold = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_THRESHOLD,
    width = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_PRICE_COLOR,
    adxColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_ADX_COLOR,
    signalColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_SIGNAL_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_GRID_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ADX_MID_CROSS_SIG_THRESHOLD_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAdx = true,
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
    () => getLineAdxMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAdxMidCrossSigLayout({
        data: cleaned,
        length,
        kSmoothing,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, kSmoothing, threshold, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAdxMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAdxMidCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAdxMidCrossSigSeriesId,
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
        data-section="chart-line-adx-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAdxMidCrossSigChart(cleaned, {
      length,
      kSmoothing,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showAdxLine = !hidden.has('adx') && showAdx;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, 25, 50, 75, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'ADX Midline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-adx-mid-cross-sig"
      data-length={length}
      data-k-smoothing={kSmoothing}
      data-threshold={threshold}
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
        data-section="chart-line-adx-mid-cross-sig-title"
      >
        {ariaLabel ?? 'ADX Midline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-adx-mid-cross-sig-aria-desc"
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
        data-section="chart-line-adx-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-adx-mid-cross-sig-grid">
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
                  data-section="chart-line-adx-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-adx-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showThreshold ? (
          <g data-section="chart-line-adx-mid-cross-sig-threshold">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-adx-mid-cross-sig-threshold-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-adx-mid-cross-sig-axes">
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
                  data-section="chart-line-adx-mid-cross-sig-tick-price"
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
                  data-section="chart-line-adx-mid-cross-sig-tick-osc"
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
            data-section="chart-line-adx-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-adx-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-adx-mid-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAdxLine ? (
          <path
            d={layout.adxPath}
            stroke={adxColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-mid-cross-sig-adx-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-adx-mid-cross-sig-crosses"
            role="group"
            aria-label="midline trigger markers"
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
                aria-label={`${m.kind} midline trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-adx-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-adx-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay midline trigger markers"
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
                data-section={`chart-line-adx-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-adx-mid-cross-sig-hover-targets">
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
                data-section="chart-line-adx-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-adx-mid-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-mid-cross-sig-tooltip-adx"
                >
                  ADX{' '}
                  {tooltipSample.adx == null
                    ? '--'
                    : formatOsc(tooltipSample.adx)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-adx-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-adx-mid-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | k {kSmoothing} | threshold {threshold} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-adx-mid-cross-sig-legend"
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
              { id: 'adx' as const, color: adxColor, label: 'ADX' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineAdxMidCrossSigSeriesId;
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

ChartLineAdxMidCrossSig.displayName = 'ChartLineAdxMidCrossSig';
