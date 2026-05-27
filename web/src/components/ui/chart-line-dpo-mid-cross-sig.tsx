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
 * ChartLineDpoMidCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the Detrended Price
 * Oscillator (DPO) plus its smoothed SMA signal line in
 * the bottom panel, marking bullish (DPO crosses up through
 * signal -- detrended centerline trigger up) / bearish
 * (DPO crosses down through signal -- detrended centerline
 * trigger down) DPO-over-signal crossover trigger events
 * with bias coloring derived from the DPO slope at the
 * trigger bar.
 *
 *   shift        = floor(period / 2) + 1
 *   sma[i]       = SMA(close, period)
 *   dpo[i]       = close[i - shift] - sma[i]    (i >= shift)
 *   signal[i]    = SMA(dpo, signalLength)
 *
 *   bullish      : prev dpo <= prev signal &&
 *                  cur dpo > cur signal
 *   bearish      : prev dpo >= prev signal &&
 *                  cur dpo < cur signal
 *   regime       : 'bullish' when dpo >= signal
 *                  'bearish' when dpo <  signal
 *                  'none'    when either is null
 *   bias         : dpo[i] vs dpo[i-1] -> up / down / flat /
 *                  none
 *
 * Defaults: `period = 20`, `signalLength = 3`. The
 * Detrended Price Oscillator removes long-term trend
 * components from price by subtracting a backward-shifted
 * SMA from the close. Unlike trend-following oscillators
 * (MACD, RSI, etc), DPO does not predict future direction
 * -- it merely identifies short-term cycle peaks and
 * troughs by stripping the trend bias. `0` is the natural
 * centerline; positive DPO means the close (shift periods
 * ago) was above the current rolling average (cycle high),
 * negative DPO means below (cycle low). This primitive
 * watches the DPO vs its own SMA-smoothed signal line to
 * detect detrended centerline trigger events.
 *
 * The `shift = floor(period/2) + 1` displacement is the
 * standard DPO convention introduced by William Blau --
 * it aligns the SMA's centroid lag with the historical
 * close so the residual purely reflects deviation from
 * trend, not lag.
 *
 * Warmup is `period + signalLength - 2 = 21` for the
 * default tuning: DPO is valid from i = period - 1 = 19
 * (the rolling SMA needs `period` bars and the shifted
 * close at i - 11 is available since i >= 19 > 11), then
 * the signal SMA needs `signalLength - 1 = 2` more bars.
 *
 * Bit-exact anchors (close-input):
 *
 * - **CONST band** `close = K`: SMA(K, 20) = K.
 *   close[i - 11] = K. dpo = K - K = 0 (exactly the
 *   centerline). signal = SMA(0, 3) = 0. dpo === signal
 *   -> regime `bullish` (>=) for every valid bar. 0
 *   crosses. Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `close = i`: SMA(close, 20) at i =
 *   (i + (i-1) + ... + (i-19)) / 20 = i - 9.5.
 *   close[i - 11] = i - 11. dpo = (i - 11) - (i - 9.5)
 *   = -1.5 (constant). signal = SMA(-1.5, 3) = -1.5.
 *   dpo === signal -> regime `bullish` (>=). 0 crosses.
 *   The constant -1.5 reflects that the close 11 periods
 *   ago was 1.5 units below the centroid of the current
 *   20-bar SMA -- the canonical DPO residual on a linear
 *   trend.
 * - **LINEAR DOWN** `close = -i`: SMA(close, 20) at i =
 *   -i + 9.5. close[i - 11] = -i + 11. dpo = (-i + 11)
 *   - (-i + 9.5) = +1.5 (constant). signal = +1.5. dpo
 *   === signal -> regime `bullish` (>=) for the same
 *   `===` reason. 0 crosses.
 */

export interface ChartLineDpoMidCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineDpoMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineDpoMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineDpoMidCrossSigSeriesId =
  | 'price'
  | 'dpo'
  | 'signal';

export type ChartLineDpoMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineDpoMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineDpoMidCrossSigCrossKind;
  bias: ChartLineDpoMidCrossSigBias;
}

export interface ChartLineDpoMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  dpo: number | null;
  signal: number | null;
  regime: ChartLineDpoMidCrossSigRegime;
  bias: ChartLineDpoMidCrossSigBias;
}

export interface ChartLineDpoMidCrossSigRun {
  series: ChartLineDpoMidCrossSigPoint[];
  period: number;
  signalLength: number;
  shift: number;
  dpoValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineDpoMidCrossSigSample[];
  crosses: ChartLineDpoMidCrossSigCross[];
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

export interface ChartLineDpoMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDpoMidCrossSigLayout {
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
  priceDots: ChartLineDpoMidCrossSigDot[];
  dpoPath: string;
  signalPath: string;
  centerlineY: number;
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
    kind: ChartLineDpoMidCrossSigCrossKind;
    bias: ChartLineDpoMidCrossSigBias;
  }>;
  run: ChartLineDpoMidCrossSigRun;
}

export interface ChartLineDpoMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDpoMidCrossSigPoint[];
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
  dpoColor?: string;
  signalColor?: string;
  centerlineColor?: string;
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
  showDpo?: boolean;
  showSignal?: boolean;
  showCenterline?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDpoMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineDpoMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDpoMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PERIOD = 20;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_CENTERLINE = 0;
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_DPO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_CENTERLINE_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineDpoMidCrossSigFinitePoints(
  data: readonly ChartLineDpoMidCrossSigPoint[] | null | undefined,
): ChartLineDpoMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDpoMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineDpoMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineDpoMidCrossSigSma(
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

export interface DpoMidCrossSigChannels {
  dpo: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineDpoMidCrossSig(
  series: readonly ChartLineDpoMidCrossSigPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): DpoMidCrossSigChannels {
  const cleaned = getLineDpoMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { dpo: [], signal: [] };
  }
  const period = normalizeLineDpoMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineDpoMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  const shift = Math.floor(period / 2) + 1;

  const n = cleaned.length;
  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const sma = applyLineDpoMidCrossSigSma(closes, period);

  const dpo: Array<number | null> = new Array(n).fill(null);
  for (let i = period - 1; i < n; i += 1) {
    if (i - shift < 0) continue;
    const smaNow = sma[i];
    const shiftedClose = closes[i - shift];
    if (smaNow == null || shiftedClose == null) continue;
    dpo[i] = posZero(shiftedClose - smaNow);
  }

  const signal = applyLineDpoMidCrossSigSma(dpo, signalLength);
  return { dpo, signal };
}

export function classifyLineDpoMidCrossSigRegime(
  dpo: number | null,
  signal: number | null,
): ChartLineDpoMidCrossSigRegime {
  if (dpo == null || signal == null) return 'none';
  if (dpo >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineDpoMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineDpoMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineDpoMidCrossSigCrosses(
  series: readonly ChartLineDpoMidCrossSigPoint[],
  dpoValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineDpoMidCrossSigCross[] {
  const out: ChartLineDpoMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pd = dpoValues[i - 1];
    const ps = signalValues[i - 1];
    const cd = dpoValues[i];
    const cs = signalValues[i];
    if (pd == null || ps == null || cd == null || cs == null) continue;
    const bias = classifyLineDpoMidCrossSigBias(cd, pd);
    if (pd <= ps && cd > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pd >= ps && cd < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineDpoMidCrossSig(
  data: ChartLineDpoMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineDpoMidCrossSigRun {
  const cleaned = getLineDpoMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineDpoMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineDpoMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  const shift = Math.floor(period / 2) + 1;

  const channels = computeLineDpoMidCrossSig(series, {
    period,
    signalLength,
  });

  const samples: ChartLineDpoMidCrossSigSample[] = series.map((p, i) => {
    const dpo = channels.dpo[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prev = i > 0 ? (channels.dpo[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      dpo,
      signal,
      regime: classifyLineDpoMidCrossSigRegime(dpo, signal),
      bias: classifyLineDpoMidCrossSigBias(dpo, prev),
    };
  });

  const crosses = detectLineDpoMidCrossSigCrosses(
    series,
    channels.dpo,
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

  const warmup = period + signalLength - 2;
  const ok = series.length > warmup;

  return {
    series,
    period,
    signalLength,
    shift,
    dpoValues: channels.dpo,
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

export interface ComputeLineDpoMidCrossSigLayoutOptions {
  data: ChartLineDpoMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineDpoMidCrossSigLayout(
  opts: ComputeLineDpoMidCrossSigLayoutOptions,
): ChartLineDpoMidCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineDpoMidCrossSig(opts.data, {
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
  for (let i = 0; i < run.dpoValues.length; i += 1) {
    const d = run.dpoValues[i];
    const s = run.signalValues[i];
    if (d != null) {
      if (d < oscRawMin) oscRawMin = d;
      if (d > oscRawMax) oscRawMax = d;
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
  // Guarantee the centerline (0) is always within view.
  if (oscRawMin > 0) oscRawMin = 0;
  if (oscRawMax < 0) oscRawMax = 0;
  if (oscRawMin === oscRawMax) {
    oscRawMin -= 1;
    oscRawMax += 1;
  }
  const oscMin = oscRawMin;
  const oscMax = oscRawMax;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const centerlineY = syOscBase(
    DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_CENTERLINE,
  );

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
      dpoPath: '',
      signalPath: '',
      centerlineY,
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
  const priceDots: ChartLineDpoMidCrossSigDot[] = [];
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

  let dpoPath = '';
  let firstDpo = true;
  for (const s of run.samples) {
    if (s.dpo == null) {
      firstDpo = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.dpo);
    dpoPath += `${firstDpo ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstDpo = false;
  }
  dpoPath = dpoPath.trim();

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
    const dpoAt = run.dpoValues[c.index];
    const cyOsc = dpoAt != null ? syOscBase(dpoAt) : oscBottom;
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
    dpoPath,
    signalPath,
    centerlineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineDpoMidCrossSigChart(
  data: ChartLineDpoMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineDpoMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineDpoMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineDpoMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `DPO midline-over-Signal chart over ${cleaned.length} bars ` +
    `(period ${period}, signalLength ${signalLength}). Top panel ` +
    `renders the close with bullish (DPO crosses up through signal, ` +
    `detrended centerline trigger up) / bearish (DPO crosses down ` +
    `through signal, detrended centerline trigger down) chevron ` +
    `overlays at every DPO-signal trigger event; bottom panel ` +
    `renders the Detrended Price Oscillator (the past close at i - ` +
    `(floor(period/2) + 1) minus the current rolling SMA of close) ` +
    `with the conventional zero centerline and its SMA signal line, ` +
    `marker-coloured by DPO slope bias (rising / falling / flat) at ` +
    `the trigger bar, flagging detrended centerline trigger events ` +
    `with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineDpoMidCrossSigCrossKind,
  bias: ChartLineDpoMidCrossSigBias,
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

export const ChartLineDpoMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineDpoMidCrossSigProps
>(function ChartLineDpoMidCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PERIOD,
    signalLength = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_PRICE_COLOR,
    dpoColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_DPO_COLOR,
    signalColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_SIGNAL_COLOR,
    centerlineColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_CENTERLINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDpo = true,
    showSignal = true,
    showCenterline = true,
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
    () => getLineDpoMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineDpoMidCrossSigLayout({
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
    ChartLineDpoMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineDpoMidCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineDpoMidCrossSigSeriesId,
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
        data-section="chart-line-dpo-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineDpoMidCrossSigChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showDpoLine = !hidden.has('dpo') && showDpo;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [
    layout.oscMin,
    DEFAULT_CHART_LINE_DPO_MID_CROSS_SIG_CENTERLINE,
    layout.oscMax,
  ];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'DPO midline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-dpo-mid-cross-sig"
      data-period={period}
      data-signal-length={signalLength}
      data-shift={layout.run.shift}
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
        data-section="chart-line-dpo-mid-cross-sig-title"
      >
        {ariaLabel ?? 'DPO midline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-dpo-mid-cross-sig-aria-desc"
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
        data-section="chart-line-dpo-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-dpo-mid-cross-sig-grid">
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
                  data-section="chart-line-dpo-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-dpo-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-dpo-mid-cross-sig-axes">
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
                  data-section="chart-line-dpo-mid-cross-sig-tick-price"
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
                  data-section="chart-line-dpo-mid-cross-sig-tick-osc"
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
            data-section="chart-line-dpo-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-dpo-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-dpo-mid-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCenterline ? (
          <line
            x1={layout.innerLeft}
            y1={layout.centerlineY}
            x2={layout.innerRight}
            y2={layout.centerlineY}
            stroke={centerlineColor}
            strokeDasharray="4 3"
            data-section="chart-line-dpo-mid-cross-sig-centerline"
          />
        ) : null}

        {showDpoLine ? (
          <path
            d={layout.dpoPath}
            stroke={dpoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-dpo-mid-cross-sig-dpo-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-dpo-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-dpo-mid-cross-sig-crosses"
            role="group"
            aria-label="DPO-signal trigger markers"
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
                aria-label={`${m.kind} DPO-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-dpo-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-dpo-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay DPO-signal trigger markers"
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
                data-section={`chart-line-dpo-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-dpo-mid-cross-sig-hover-targets">
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
                data-section="chart-line-dpo-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-dpo-mid-cross-sig-tooltip"
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
                  data-section="chart-line-dpo-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-mid-cross-sig-tooltip-dpo"
                >
                  DPO{' '}
                  {tooltipSample.dpo == null
                    ? '--'
                    : formatOsc(tooltipSample.dpo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-dpo-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-mid-cross-sig-tooltip-biases"
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
          data-section="chart-line-dpo-mid-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | signal {signalLength} | shift {layout.run.shift}{' '}
          | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-dpo-mid-cross-sig-legend"
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
              { id: 'dpo' as const, color: dpoColor, label: 'DPO' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineDpoMidCrossSigSeriesId;
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

ChartLineDpoMidCrossSig.displayName = 'ChartLineDpoMidCrossSig';
