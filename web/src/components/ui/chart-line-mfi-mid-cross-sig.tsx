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
 * ChartLineMfiMidCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the Money Flow Index (MFI)
 * plus its smoothed SMA signal line in the bottom panel,
 * marking bullish (MFI crosses up through signal --
 * volume-weighted momentum trend trigger up) / bearish (MFI
 * crosses down through signal -- volume-weighted momentum
 * trend trigger down) MFI-over-signal crossover trigger
 * events with bias coloring derived from the MFI slope at
 * the trigger bar.
 *
 *   typical[i]   = (high[i] + low[i] + close[i]) / 3
 *   rawMf[i]     = |typical[i] * volume[i]|
 *   posMf[i]     = rawMf[i] when typical[i] > typical[i-1]
 *                  else 0
 *   negMf[i]     = rawMf[i] when typical[i] < typical[i-1]
 *                  else 0
 *   sumPos[i]    = sum(posMf, period)
 *   sumNeg[i]    = sum(negMf, period)
 *   mfi[i]       = sumPos = sumNeg = 0     -> 50
 *                  sumNeg = 0, sumPos > 0  -> 100
 *                  sumPos = 0, sumNeg > 0  -> 0
 *                  otherwise: 100 - 100 / (1 + sumPos / sumNeg)
 *   signal[i]    = SMA(mfi, signalLength)
 *
 *   bullish      : prev mfi <= prev signal &&
 *                  cur mfi > cur signal
 *   bearish      : prev mfi >= prev signal &&
 *                  cur mfi < cur signal
 *   regime       : 'bullish' when mfi >= signal
 *                  'bearish' when mfi <  signal
 *                  'none'    when either is null
 *   bias         : mfi[i] vs mfi[i-1] -> up / down / flat /
 *                  none
 *
 * Defaults: `period = 14` (canonical MFI lookback) and
 * `signalLength = 3`. MFI is the volume-weighted RSI: it
 * uses the magnitude of typical-price * volume as the
 * money-flow quantity, splits each bar's money flow into
 * positive or negative depending on the typical-price
 * direction, and produces a momentum reading bounded in
 * `[0, 100]`. The conventional centerline is 50 -- a
 * neutral level above which momentum is read as bullish
 * and below which as bearish.
 *
 * Warmup is `period + signalLength - 1 = 16` for the
 * default tuning: posMf / negMf seed at `i >= 1`, the
 * rolling sum first fills at `i = period = 14`, then the
 * signal SMA adds another `signalLength - 1 = 2` bars.
 *
 * Bit-exact anchors (HLCV input, constant volume V = 1):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`, `volume = 1`: typical = K constant -> no
 *   directional change between bars, so posMf = negMf = 0
 *   for every i >= 1. With both sums zero, MFI defaults
 *   to 50 (neutral). signal = SMA(50, 3) = 50. MFI ===
 *   signal -> regime `bullish` (>=). 0 crosses. Verified
 *   across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`, `volume = 1`: typical = i monotone up, so
 *   every i >= 1 contributes to posMf and never to negMf.
 *   sumNeg = 0 -> MFI = 100. signal = 100. MFI === signal
 *   -> regime `bullish`. 0 crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`, `volume = 1`: typical = -i monotone
 *   down, so every i >= 1 contributes to negMf and never
 *   to posMf. sumPos = 0 -> MFI = 0. signal = 0. MFI ===
 *   signal -> regime `bullish` (>=). 0 crosses.
 */

export interface ChartLineMfiMidCrossSigPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartLineMfiMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineMfiMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineMfiMidCrossSigSeriesId = 'price' | 'mfi' | 'signal';

export type ChartLineMfiMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineMfiMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineMfiMidCrossSigCrossKind;
  bias: ChartLineMfiMidCrossSigBias;
}

export interface ChartLineMfiMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  mfi: number | null;
  signal: number | null;
  regime: ChartLineMfiMidCrossSigRegime;
  bias: ChartLineMfiMidCrossSigBias;
}

export interface ChartLineMfiMidCrossSigRun {
  series: ChartLineMfiMidCrossSigPoint[];
  period: number;
  signalLength: number;
  typicalValues: Array<number | null>;
  mfiValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineMfiMidCrossSigSample[];
  crosses: ChartLineMfiMidCrossSigCross[];
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

export interface ChartLineMfiMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMfiMidCrossSigLayout {
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
  priceDots: ChartLineMfiMidCrossSigDot[];
  mfiPath: string;
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
    kind: ChartLineMfiMidCrossSigCrossKind;
    bias: ChartLineMfiMidCrossSigBias;
  }>;
  run: ChartLineMfiMidCrossSigRun;
}

export interface ChartLineMfiMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMfiMidCrossSigPoint[];
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
  mfiColor?: string;
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
  showMfi?: boolean;
  showSignal?: boolean;
  showCenterline?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMfiMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineMfiMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMfiMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PERIOD = 14;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_CENTERLINE = 50;
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_MFI_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_CENTERLINE_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineMfiMidCrossSigFinitePoints(
  data: readonly ChartLineMfiMidCrossSigPoint[] | null | undefined,
): ChartLineMfiMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMfiMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume) &&
      point.high >= point.low &&
      point.volume >= 0
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

export function normalizeLineMfiMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineMfiMidCrossSigSma(
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

export interface MfiMidCrossSigChannels {
  typical: Array<number | null>;
  mfi: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineMfiMidCrossSig(
  series: readonly ChartLineMfiMidCrossSigPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): MfiMidCrossSigChannels {
  const cleaned = getLineMfiMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { typical: [], mfi: [], signal: [] };
  }
  const period = normalizeLineMfiMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineMfiMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const n = cleaned.length;
  const typical: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const p = cleaned[i]!;
    typical[i] = posZero((p.high + p.low + p.close) / 3);
  }

  const posMf: Array<number | null> = new Array(n).fill(null);
  const negMf: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]!;
    const curT = typical[i]!;
    const prevT = typical[i - 1]!;
    const rawMf = Math.abs(curT * cur.volume);
    if (curT > prevT) {
      posMf[i] = posZero(rawMf);
      negMf[i] = 0;
    } else if (curT < prevT) {
      posMf[i] = 0;
      negMf[i] = posZero(rawMf);
    } else {
      posMf[i] = 0;
      negMf[i] = 0;
    }
  }

  const mfi: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    let sumPos = 0;
    let sumNeg = 0;
    let valid = true;
    for (let j = i - period + 1; j <= i; j += 1) {
      const p = posMf[j];
      const ne = negMf[j];
      if (p == null || ne == null) {
        valid = false;
        break;
      }
      sumPos += p;
      sumNeg += ne;
    }
    if (!valid) continue;
    if (sumPos === 0 && sumNeg === 0) {
      mfi[i] = 50;
    } else if (sumNeg === 0) {
      mfi[i] = 100;
    } else if (sumPos === 0) {
      mfi[i] = 0;
    } else {
      const ratio = sumPos / sumNeg;
      mfi[i] = posZero(100 - 100 / (1 + ratio));
    }
  }

  const signal = applyLineMfiMidCrossSigSma(mfi, signalLength);
  return { typical, mfi, signal };
}

export function classifyLineMfiMidCrossSigRegime(
  mfi: number | null,
  signal: number | null,
): ChartLineMfiMidCrossSigRegime {
  if (mfi == null || signal == null) return 'none';
  if (mfi >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineMfiMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineMfiMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineMfiMidCrossSigCrosses(
  series: readonly ChartLineMfiMidCrossSigPoint[],
  mfiValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineMfiMidCrossSigCross[] {
  const out: ChartLineMfiMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pm = mfiValues[i - 1];
    const ps = signalValues[i - 1];
    const cm = mfiValues[i];
    const cs = signalValues[i];
    if (pm == null || ps == null || cm == null || cs == null) continue;
    const bias = classifyLineMfiMidCrossSigBias(cm, pm);
    if (pm <= ps && cm > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pm >= ps && cm < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineMfiMidCrossSig(
  data: ChartLineMfiMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineMfiMidCrossSigRun {
  const cleaned = getLineMfiMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineMfiMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineMfiMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineMfiMidCrossSig(series, {
    period,
    signalLength,
  });

  const samples: ChartLineMfiMidCrossSigSample[] = series.map((p, i) => {
    const mfi = channels.mfi[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prevMfi = i > 0 ? (channels.mfi[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      mfi,
      signal,
      regime: classifyLineMfiMidCrossSigRegime(mfi, signal),
      bias: classifyLineMfiMidCrossSigBias(mfi, prevMfi),
    };
  });

  const crosses = detectLineMfiMidCrossSigCrosses(
    series,
    channels.mfi,
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

  const warmup = period + signalLength - 1;
  const ok = series.length > warmup;

  return {
    series,
    period,
    signalLength,
    typicalValues: channels.typical,
    mfiValues: channels.mfi,
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

export interface ComputeLineMfiMidCrossSigLayoutOptions {
  data: ChartLineMfiMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMfiMidCrossSigLayout(
  opts: ComputeLineMfiMidCrossSigLayoutOptions,
): ChartLineMfiMidCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineMfiMidCrossSig(opts.data, {
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

  // MFI is bounded [0, 100]; lock the oscillator range so the
  // centerline at 50 always renders in the middle of the panel.
  const oscMin = 0;
  const oscMax = 100;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const centerlineY = syOscBase(
    DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_CENTERLINE,
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
      mfiPath: '',
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
  const priceDots: ChartLineMfiMidCrossSigDot[] = [];
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

  let mfiPath = '';
  let firstMfi = true;
  for (const s of run.samples) {
    if (s.mfi == null) {
      firstMfi = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.mfi);
    mfiPath += `${firstMfi ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstMfi = false;
  }
  mfiPath = mfiPath.trim();

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
    const mfiAtCross = run.mfiValues[c.index];
    const cyOsc = mfiAtCross != null ? syOscBase(mfiAtCross) : oscBottom;
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
    mfiPath,
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

export function describeLineMfiMidCrossSigChart(
  data: ChartLineMfiMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineMfiMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineMfiMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineMfiMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `MFI centerline-over-Signal chart over ${cleaned.length} ` +
    `bars (period ${period}, signalLength ${signalLength}). ` +
    `Top panel renders the close with bullish (MFI crosses ` +
    `up through signal, volume-weighted momentum trend ` +
    `trigger up) / bearish (MFI crosses down through signal, ` +
    `volume-weighted momentum trend trigger down) chevron ` +
    `overlays at every MFI-signal trigger event; bottom panel ` +
    `renders the Money Flow Index (the volume-weighted RSI ` +
    `bounded in [0, 100], with the canonical centerline at ` +
    `50) and its SMA signal line with markers coloured by ` +
    `MFI slope bias (rising / falling / flat) at the trigger ` +
    `bar, flagging volume-weighted momentum trend trigger ` +
    `events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineMfiMidCrossSigCrossKind,
  bias: ChartLineMfiMidCrossSigBias,
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

export const ChartLineMfiMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineMfiMidCrossSigProps
>(function ChartLineMfiMidCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PERIOD,
    signalLength = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_PRICE_COLOR,
    mfiColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_MFI_COLOR,
    signalColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_SIGNAL_COLOR,
    centerlineColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_CENTERLINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMfi = true,
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
    () => getLineMfiMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMfiMidCrossSigLayout({
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
    ChartLineMfiMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineMfiMidCrossSigSeriesId,
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
    seriesId: ChartLineMfiMidCrossSigSeriesId,
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
        data-section="chart-line-mfi-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMfiMidCrossSigChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showMfiLine = !hidden.has('mfi') && showMfi;
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
    DEFAULT_CHART_LINE_MFI_MID_CROSS_SIG_CENTERLINE,
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
      aria-label={ariaLabel ?? 'MFI centerline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-mfi-mid-cross-sig"
      data-period={period}
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
        data-section="chart-line-mfi-mid-cross-sig-title"
      >
        {ariaLabel ?? 'MFI centerline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-mfi-mid-cross-sig-aria-desc"
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
        data-section="chart-line-mfi-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-mfi-mid-cross-sig-grid">
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
                  data-section="chart-line-mfi-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-mfi-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-mfi-mid-cross-sig-axes">
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
                  data-section="chart-line-mfi-mid-cross-sig-tick-price"
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
                  data-section="chart-line-mfi-mid-cross-sig-tick-osc"
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
            data-section="chart-line-mfi-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-mfi-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-mfi-mid-cross-sig-price-dot"
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
            data-section="chart-line-mfi-mid-cross-sig-centerline"
          />
        ) : null}

        {showMfiLine ? (
          <path
            d={layout.mfiPath}
            stroke={mfiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-mfi-mid-cross-sig-mfi-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-mfi-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-mfi-mid-cross-sig-crosses"
            role="group"
            aria-label="MFI-signal trigger markers"
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
                aria-label={`${m.kind} MFI-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-mfi-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-mfi-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay MFI-signal trigger markers"
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
                data-section={`chart-line-mfi-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-mfi-mid-cross-sig-hover-targets">
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
                data-section="chart-line-mfi-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-mfi-mid-cross-sig-tooltip"
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
                  data-section="chart-line-mfi-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-mid-cross-sig-tooltip-mfi"
                >
                  MFI{' '}
                  {tooltipSample.mfi == null
                    ? '--'
                    : formatOsc(tooltipSample.mfi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-mfi-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-mid-cross-sig-tooltip-biases"
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
          data-section="chart-line-mfi-mid-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | signal {signalLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-mfi-mid-cross-sig-legend"
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
              { id: 'mfi' as const, color: mfiColor, label: 'MFI' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineMfiMidCrossSigSeriesId;
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

ChartLineMfiMidCrossSig.displayName = 'ChartLineMfiMidCrossSig';
