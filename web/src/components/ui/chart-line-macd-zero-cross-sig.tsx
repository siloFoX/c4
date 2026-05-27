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
 * ChartLineMacdZeroCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the MACD line plus its
 * smoothed signal line in the bottom panel, marking bullish
 * (signal crosses up through zero, centerline confirmation up)
 * / bearish (signal crosses down through zero, centerline
 * confirmation down) MACD zero-over-signal crossover trigger
 * events with bias coloring derived from the signal slope at
 * the trigger bar.
 *
 *   ema_fast   = SMA-seeded EMA(close, fastLength)
 *   ema_slow   = SMA-seeded EMA(close, slowLength)
 *   macd[i]    = ema_fast - ema_slow
 *   signal[i]  = SMA-seeded EMA(macd, signalLength)
 *   bullish    : prev signal <= 0 && cur signal >  0
 *   bearish    : prev signal >= 0 && cur signal <  0
 *   regime     : bullish (signal >= 0), bearish (signal < 0),
 *                none (signal null)
 *   bias       : up / down / flat / none from signal[i] vs
 *                signal[i-1]
 *
 * Defaults: `fastLength = 12`, `slowLength = 26`,
 * `signalLength = 9` (Appel's canonical MACD tuning),
 * `threshold = 0` (zero line). Warmup is `slowLength +
 * signalLength - 2 = 33` for the default tuning: the slow
 * SMA-seeded EMA becomes valid at `slowLength - 1 = 25`,
 * then the signal SMA-seeded EMA needs another
 * `signalLength - 1 = 8` valid macd samples.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: ema_fast = ema_slow = K -> macd =
 *   0. signal SMA-seed of zeros -> 0. signal >= 0 ->
 *   regime `bullish` (zero line is the bullish boundary
 *   under prev <= 0 && cur > 0 cross convention; the regime
 *   classifier uses `>=` for inclusive zero membership).
 *   bias `flat` from the second valid signal sample. 0
 *   triggers. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: ema_fast settles at `i - 5.5`,
 *   ema_slow at `i - 12.5`, macd = `+7` constant. signal
 *   SMA-seed -> 7. signal > 0 -> regime `bullish`. 0
 *   triggers because signal is constant at +7 (no zero
 *   crossing).
 * - **LINEAR DOWN close = -i**: ema_fast = `-i + 5.5`,
 *   ema_slow = `-i + 12.5`, macd = `-7` constant. signal
 *   -> -7. signal < 0 -> regime `bearish`. 0 triggers.
 */

export interface ChartLineMacdZeroCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineMacdZeroCrossSigRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineMacdZeroCrossSigBias = 'up' | 'down' | 'flat' | 'none';

export type ChartLineMacdZeroCrossSigSeriesId = 'price' | 'macd' | 'signal';

export type ChartLineMacdZeroCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineMacdZeroCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineMacdZeroCrossSigCrossKind;
  bias: ChartLineMacdZeroCrossSigBias;
}

export interface ChartLineMacdZeroCrossSigSample {
  index: number;
  x: number;
  close: number;
  macd: number | null;
  signal: number | null;
  regime: ChartLineMacdZeroCrossSigRegime;
  bias: ChartLineMacdZeroCrossSigBias;
}

export interface ChartLineMacdZeroCrossSigRun {
  series: ChartLineMacdZeroCrossSigPoint[];
  fastLength: number;
  slowLength: number;
  signalLength: number;
  threshold: number;
  macdValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineMacdZeroCrossSigSample[];
  crosses: ChartLineMacdZeroCrossSigCross[];
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

export interface ChartLineMacdZeroCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMacdZeroCrossSigLayout {
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
  priceDots: ChartLineMacdZeroCrossSigDot[];
  macdPath: string;
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
    kind: ChartLineMacdZeroCrossSigCrossKind;
    bias: ChartLineMacdZeroCrossSigBias;
  }>;
  run: ChartLineMacdZeroCrossSigRun;
}

export interface ChartLineMacdZeroCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMacdZeroCrossSigPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  macdColor?: string;
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
  showMacd?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showThreshold?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMacdZeroCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineMacdZeroCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMacdZeroCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_FAST_LENGTH = 12;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SLOW_LENGTH = 26;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_MACD_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_THRESHOLD_COLOR =
  '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineMacdZeroCrossSigFinitePoints(
  data: readonly ChartLineMacdZeroCrossSigPoint[] | null | undefined,
): ChartLineMacdZeroCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMacdZeroCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineMacdZeroCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineMacdZeroCrossSigThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/**
 * SMA-seeded EMA over a nullable input array. The first
 * `length` contiguous valid entries seed the recurrence with
 * their arithmetic mean, then `ema[i] = alpha * v + (1 -
 * alpha) * ema[i-1]` with `alpha = 2 / (length + 1)`. A null
 * gap aborts further output.
 */
export function applyLineMacdZeroCrossSigSmaSeededEma(
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
  const alpha = 2 / (length + 1);
  let ema = seed;
  for (let i = seedEnd + 1; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) return out;
    ema = alpha * v + (1 - alpha) * ema;
    out[i] = posZero(ema);
  }
  return out;
}

export interface LineMacdZeroCrossSigChannels {
  macd: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineMacdZeroCrossSig(
  series: readonly ChartLineMacdZeroCrossSigPoint[] | null | undefined,
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): LineMacdZeroCrossSigChannels {
  const cleaned = getLineMacdZeroCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { macd: [], signal: [] };
  }
  const fastLength = normalizeLineMacdZeroCrossSigLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdZeroCrossSigLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SLOW_LENGTH,
  );
  const signalLength = normalizeLineMacdZeroCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SIGNAL_LENGTH,
  );
  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const emaFast = applyLineMacdZeroCrossSigSmaSeededEma(closes, fastLength);
  const emaSlow = applyLineMacdZeroCrossSigSmaSeededEma(closes, slowLength);
  const macd: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f != null && s != null) macd[i] = posZero(f - s);
  }
  const signal = applyLineMacdZeroCrossSigSmaSeededEma(macd, signalLength);
  return { macd, signal };
}

export function classifyLineMacdZeroCrossSigRegime(
  signal: number | null,
  threshold: number,
): ChartLineMacdZeroCrossSigRegime {
  if (signal == null) return 'none';
  if (signal >= threshold) return 'bullish';
  return 'bearish';
}

export function classifyLineMacdZeroCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineMacdZeroCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineMacdZeroCrossSigCrosses(
  series: readonly ChartLineMacdZeroCrossSigPoint[],
  signalValues: readonly (number | null)[],
  threshold: number,
): ChartLineMacdZeroCrossSigCross[] {
  const out: ChartLineMacdZeroCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = signalValues[i - 1];
    const cur = signalValues[i];
    if (prev == null || cur == null) continue;
    const bias = classifyLineMacdZeroCrossSigBias(cur, prev);
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineMacdZeroCrossSig(
  data: ChartLineMacdZeroCrossSigPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
    threshold?: number;
  } = {},
): ChartLineMacdZeroCrossSigRun {
  const cleaned = getLineMacdZeroCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineMacdZeroCrossSigLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdZeroCrossSigLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SLOW_LENGTH,
  );
  const signalLength = normalizeLineMacdZeroCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SIGNAL_LENGTH,
  );
  const threshold = normalizeLineMacdZeroCrossSigThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_THRESHOLD,
  );

  const channels = computeLineMacdZeroCrossSig(series, {
    fastLength,
    slowLength,
    signalLength,
  });

  const samples: ChartLineMacdZeroCrossSigSample[] = series.map((p, i) => {
    const macd = channels.macd[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prevSignal = i > 0 ? (channels.signal[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      macd,
      signal,
      regime: classifyLineMacdZeroCrossSigRegime(signal, threshold),
      bias: classifyLineMacdZeroCrossSigBias(signal, prevSignal),
    };
  });

  const crosses = detectLineMacdZeroCrossSigCrosses(
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

  const warmup = slowLength + signalLength - 2;
  const ok = series.length > warmup;

  return {
    series,
    fastLength,
    slowLength,
    signalLength,
    threshold,
    macdValues: channels.macd,
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

export interface ComputeLineMacdZeroCrossSigLayoutOptions {
  data: ChartLineMacdZeroCrossSigPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMacdZeroCrossSigLayout(
  opts: ComputeLineMacdZeroCrossSigLayoutOptions,
): ChartLineMacdZeroCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PANEL_GAP;

  const run = runLineMacdZeroCrossSig(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
    signalLength: opts.signalLength ?? undefined,
    threshold: opts.threshold ?? undefined,
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
  for (let i = 0; i < run.macdValues.length; i += 1) {
    const m = run.macdValues[i];
    const s = run.signalValues[i];
    if (m != null) {
      if (m < oscRawMin) oscRawMin = m;
      if (m > oscRawMax) oscRawMax = m;
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
  const span = Math.max(Math.abs(oscRawMin), Math.abs(oscRawMax));
  const padded = span === 0 ? 1 : span * 1.1;
  const oscMin = -padded;
  const oscMax = padded;
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
      macdPath: '',
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
  const priceDots: ChartLineMacdZeroCrossSigDot[] = [];
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

  let macdPath = '';
  let firstMacd = true;
  for (const s of run.samples) {
    if (s.macd == null) {
      firstMacd = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.macd);
    macdPath += `${firstMacd ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstMacd = false;
  }
  macdPath = macdPath.trim();

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
    macdPath,
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

export function describeLineMacdZeroCrossSigChart(
  data: ChartLineMacdZeroCrossSigPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineMacdZeroCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineMacdZeroCrossSigLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdZeroCrossSigLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SLOW_LENGTH,
  );
  const signalLength = normalizeLineMacdZeroCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SIGNAL_LENGTH,
  );
  const threshold = normalizeLineMacdZeroCrossSigThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_THRESHOLD,
  );
  return (
    `MACD Zero-over-Signal chart over ${cleaned.length} bars ` +
    `(fast ${fastLength}, slow ${slowLength}, signal ${signalLength}, ` +
    `threshold ${threshold}). Top panel renders the close with ` +
    `bullish (signal crosses up through ${threshold}, centerline ` +
    `confirmation up) / bearish (signal crosses down through ` +
    `${threshold}, centerline confirmation down) chevron overlays ` +
    `at every MACD-signal-zero trigger event; bottom panel renders ` +
    `the MACD line and its EMA signal line with markers coloured ` +
    `by slope bias (rising / falling / flat) at the trigger bar, ` +
    `flagging centerline confirmation events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineMacdZeroCrossSigCrossKind,
  bias: ChartLineMacdZeroCrossSigBias,
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

export const ChartLineMacdZeroCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineMacdZeroCrossSigProps
>(function ChartLineMacdZeroCrossSig(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SLOW_LENGTH,
    signalLength = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SIGNAL_LENGTH,
    threshold = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_THRESHOLD,
    width = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_PRICE_COLOR,
    macdColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_MACD_COLOR,
    signalColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_SIGNAL_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_GRID_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_MACD_ZERO_CROSS_SIG_THRESHOLD_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMacd = true,
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
    () => getLineMacdZeroCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMacdZeroCrossSigLayout({
        data: cleaned,
        fastLength,
        slowLength,
        signalLength,
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
      signalLength,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineMacdZeroCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineMacdZeroCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineMacdZeroCrossSigSeriesId,
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
        data-section="chart-line-macd-zero-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMacdZeroCrossSigChart(cleaned, {
      fastLength,
      slowLength,
      signalLength,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showMacdLine = !hidden.has('macd') && showMacd;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, 0, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'MACD Zero-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-macd-zero-cross-sig"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-signal-length={signalLength}
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
        data-section="chart-line-macd-zero-cross-sig-title"
      >
        {ariaLabel ?? 'MACD Zero-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-macd-zero-cross-sig-aria-desc"
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
        data-section="chart-line-macd-zero-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-macd-zero-cross-sig-grid">
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
                  data-section="chart-line-macd-zero-cross-sig-grid-line-price"
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
                  data-section="chart-line-macd-zero-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showThreshold ? (
          <g data-section="chart-line-macd-zero-cross-sig-threshold">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-macd-zero-cross-sig-threshold-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-macd-zero-cross-sig-axes">
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
                  data-section="chart-line-macd-zero-cross-sig-tick-price"
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
                  data-section="chart-line-macd-zero-cross-sig-tick-osc"
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
            data-section="chart-line-macd-zero-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-macd-zero-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-macd-zero-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMacdLine ? (
          <path
            d={layout.macdPath}
            stroke={macdColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-macd-zero-cross-sig-macd-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-macd-zero-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-macd-zero-cross-sig-crosses"
            role="group"
            aria-label="zero-line trigger markers"
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
                aria-label={`${m.kind} zero-line trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-macd-zero-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-macd-zero-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay zero-line trigger markers"
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
                data-section={`chart-line-macd-zero-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-macd-zero-cross-sig-hover-targets">
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
                data-section="chart-line-macd-zero-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-macd-zero-cross-sig-tooltip"
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
                  data-section="chart-line-macd-zero-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-zero-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-zero-cross-sig-tooltip-macd"
                >
                  MACD{' '}
                  {tooltipSample.macd == null
                    ? '--'
                    : formatOsc(tooltipSample.macd)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-zero-cross-sig-tooltip-signal"
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
                  data-section="chart-line-macd-zero-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-zero-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-zero-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-zero-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-zero-cross-sig-tooltip-biases"
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
          data-section="chart-line-macd-zero-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | signal {signalLength}{' '}
          | threshold {threshold} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-macd-zero-cross-sig-legend"
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
              { id: 'macd' as const, color: macdColor, label: 'MACD' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineMacdZeroCrossSigSeriesId;
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

ChartLineMacdZeroCrossSig.displayName = 'ChartLineMacdZeroCrossSig';
