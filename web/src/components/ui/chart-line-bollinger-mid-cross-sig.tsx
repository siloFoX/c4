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
 * ChartLineBollingerMidCrossSig -- pure-SVG dual-panel
 * chart with the close in the top panel and the Bollinger
 * Band middle line (`SMA(close, period)`) plus its
 * smoothed SMA signal line in the bottom panel, marking
 * bullish (middle crosses up through signal -- centerline
 * trend trigger up) / bearish (middle crosses down through
 * signal -- centerline trend trigger down) middle-over-
 * signal crossover trigger events with bias coloring
 * derived from the middle slope at the trigger bar.
 *
 *   middle[i]  = SMA(close, period)
 *   signal[i]  = SMA(middle, signalLength)
 *   bullish    : prev middle <= prev signal &&
 *                cur middle > cur signal
 *   bearish    : prev middle >= prev signal &&
 *                cur middle < cur signal
 *   regime     : bullish (middle >= signal),
 *                bearish (middle < signal)
 *   bias       : middle[i] vs middle[i-1] ->
 *                up / down / flat / none
 *
 * Defaults: `period = 20` (Bollinger's canonical lookback,
 * vs `chart-line-sma-cross-sig`'s 14) and `signalLength =
 * 3`. The middle centroid lag is `(period - 1) / 2 = 9.5`
 * for the default period -- precisely Bollinger's
 * centerline. The signal SMA adds another `(signalLength
 * - 1) / 2 = 1` bar of lag, so the steady-state
 * `middle - signal` separation on linear input is exactly
 * `1`, matching the sibling cross-sig family identity.
 *
 * Warmup is `period + signalLength - 2 = 21` for the
 * default tuning: middle seeds at `period - 1 = 19`, then
 * the signal SMA adds `signalLength - 1 = 2` bars.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: middle = K -> signal = K -> middle
 *   === signal -> regime `bullish` (>=). 0 crosses. bias
 *   `flat` from second valid sample. Verified across K =
 *   0..1234.
 * - **LINEAR UP close = i**: middle settles at `i -
 *   (period - 1) / 2 = i - 9.5`; signal = SMA(middle, 3)
 *   adds `(signalLength - 1) / 2 = 1` bar of lag, giving
 *   signal = `i - 10.5`. middle - signal = `+1` -> regime
 *   `bullish`. 0 crosses.
 * - **LINEAR DOWN close = -i**: middle = `-i + 9.5`,
 *   signal = `-i + 10.5`. middle - signal = `-1` -> regime
 *   `bearish`. 0 crosses.
 */

export interface ChartLineBollingerMidCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineBollingerMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineBollingerMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineBollingerMidCrossSigSeriesId =
  | 'price'
  | 'middle'
  | 'signal';

export type ChartLineBollingerMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineBollingerMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineBollingerMidCrossSigCrossKind;
  bias: ChartLineBollingerMidCrossSigBias;
}

export interface ChartLineBollingerMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  middle: number | null;
  signal: number | null;
  regime: ChartLineBollingerMidCrossSigRegime;
  bias: ChartLineBollingerMidCrossSigBias;
}

export interface ChartLineBollingerMidCrossSigRun {
  series: ChartLineBollingerMidCrossSigPoint[];
  period: number;
  signalLength: number;
  middleValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineBollingerMidCrossSigSample[];
  crosses: ChartLineBollingerMidCrossSigCross[];
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

export interface ChartLineBollingerMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineBollingerMidCrossSigLayout {
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
  priceDots: ChartLineBollingerMidCrossSigDot[];
  middlePath: string;
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
    kind: ChartLineBollingerMidCrossSigCrossKind;
    bias: ChartLineBollingerMidCrossSigBias;
  }>;
  run: ChartLineBollingerMidCrossSigRun;
}

export interface ChartLineBollingerMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineBollingerMidCrossSigPoint[];
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
  middleColor?: string;
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
  showMiddle?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineBollingerMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineBollingerMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineBollingerMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PERIOD = 20;
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_MIDDLE_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_SIGNAL_COLOR =
  '#f59e0b';
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineBollingerMidCrossSigFinitePoints(
  data: readonly ChartLineBollingerMidCrossSigPoint[] | null | undefined,
): ChartLineBollingerMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineBollingerMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineBollingerMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineBollingerMidCrossSigSma(
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

export interface BollingerMidCrossSigChannels {
  middle: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineBollingerMidCrossSig(
  series: readonly ChartLineBollingerMidCrossSigPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): BollingerMidCrossSigChannels {
  const cleaned = getLineBollingerMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { middle: [], signal: [] };
  }
  const period = normalizeLineBollingerMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineBollingerMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const middle = applyLineBollingerMidCrossSigSma(closes, period);
  const signal = applyLineBollingerMidCrossSigSma(middle, signalLength);
  return { middle, signal };
}

export function classifyLineBollingerMidCrossSigRegime(
  middle: number | null,
  signal: number | null,
): ChartLineBollingerMidCrossSigRegime {
  if (middle == null || signal == null) return 'none';
  if (middle >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineBollingerMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineBollingerMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineBollingerMidCrossSigCrosses(
  series: readonly ChartLineBollingerMidCrossSigPoint[],
  middleValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineBollingerMidCrossSigCross[] {
  const out: ChartLineBollingerMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pm = middleValues[i - 1];
    const ps = signalValues[i - 1];
    const cm = middleValues[i];
    const cs = signalValues[i];
    if (pm == null || ps == null || cm == null || cs == null) continue;
    const bias = classifyLineBollingerMidCrossSigBias(cm, pm);
    if (pm <= ps && cm > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pm >= ps && cm < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineBollingerMidCrossSig(
  data: ChartLineBollingerMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineBollingerMidCrossSigRun {
  const cleaned = getLineBollingerMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineBollingerMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineBollingerMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineBollingerMidCrossSig(series, {
    period,
    signalLength,
  });

  const samples: ChartLineBollingerMidCrossSigSample[] = series.map(
    (p, i) => {
      const middle = channels.middle[i] ?? null;
      const signal = channels.signal[i] ?? null;
      const prevMiddle = i > 0 ? (channels.middle[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        middle,
        signal,
        regime: classifyLineBollingerMidCrossSigRegime(middle, signal),
        bias: classifyLineBollingerMidCrossSigBias(middle, prevMiddle),
      };
    },
  );

  const crosses = detectLineBollingerMidCrossSigCrosses(
    series,
    channels.middle,
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
    middleValues: channels.middle,
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

export interface ComputeLineBollingerMidCrossSigLayoutOptions {
  data: ChartLineBollingerMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineBollingerMidCrossSigLayout(
  opts: ComputeLineBollingerMidCrossSigLayoutOptions,
): ChartLineBollingerMidCrossSigLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineBollingerMidCrossSig(opts.data, {
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
  for (let i = 0; i < run.middleValues.length; i += 1) {
    const m = run.middleValues[i];
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
      middlePath: '',
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
  const priceDots: ChartLineBollingerMidCrossSigDot[] = [];
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

  let middlePath = '';
  let firstMiddle = true;
  for (const s of run.samples) {
    if (s.middle == null) {
      firstMiddle = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.middle);
    middlePath += `${firstMiddle ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstMiddle = false;
  }
  middlePath = middlePath.trim();

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
    const middleAtCross = run.middleValues[c.index];
    const cyOsc =
      middleAtCross != null ? syOscBase(middleAtCross) : oscBottom;
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
    middlePath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineBollingerMidCrossSigChart(
  data: ChartLineBollingerMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineBollingerMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineBollingerMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineBollingerMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `Bollinger middle-over-Signal chart over ${cleaned.length} ` +
    `bars (period ${period}, signalLength ${signalLength}). Top ` +
    `panel renders the close with bullish (Bollinger middle ` +
    `crosses up through signal, centerline trend trigger up) ` +
    `/ bearish (Bollinger middle crosses down through signal, ` +
    `centerline trend trigger down) chevron overlays at every ` +
    `middle-signal trigger event; bottom panel renders the ` +
    `Bollinger Band middle line (SMA of close) and its SMA ` +
    `signal line with markers coloured by middle slope bias ` +
    `(rising / falling / flat) at the trigger bar, flagging ` +
    `centerline trend trigger events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineBollingerMidCrossSigCrossKind,
  bias: ChartLineBollingerMidCrossSigBias,
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

export const ChartLineBollingerMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineBollingerMidCrossSigProps
>(function ChartLineBollingerMidCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PERIOD,
    signalLength = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_PRICE_COLOR,
    middleColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_MIDDLE_COLOR,
    signalColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_SIGNAL_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_BOLLINGER_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMiddle = true,
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
    () => getLineBollingerMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineBollingerMidCrossSigLayout({
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
    ChartLineBollingerMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineBollingerMidCrossSigSeriesId,
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
    seriesId: ChartLineBollingerMidCrossSigSeriesId,
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
        data-section="chart-line-bollinger-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineBollingerMidCrossSigChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showMiddleLine = !hidden.has('middle') && showMiddle;
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
      aria-label={ariaLabel ?? 'Bollinger middle-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-bollinger-mid-cross-sig"
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
        data-section="chart-line-bollinger-mid-cross-sig-title"
      >
        {ariaLabel ?? 'Bollinger middle-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-bollinger-mid-cross-sig-aria-desc"
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
        data-section="chart-line-bollinger-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-bollinger-mid-cross-sig-grid">
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
                  data-section="chart-line-bollinger-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-bollinger-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-bollinger-mid-cross-sig-axes">
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
                  data-section="chart-line-bollinger-mid-cross-sig-tick-price"
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
                  data-section="chart-line-bollinger-mid-cross-sig-tick-osc"
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
            data-section="chart-line-bollinger-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-bollinger-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-bollinger-mid-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMiddleLine ? (
          <path
            d={layout.middlePath}
            stroke={middleColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-bollinger-mid-cross-sig-middle-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-bollinger-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-bollinger-mid-cross-sig-crosses"
            role="group"
            aria-label="Bollinger middle-signal trigger markers"
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
                aria-label={`${m.kind} Bollinger middle-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-bollinger-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-bollinger-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay Bollinger middle-signal trigger markers"
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
                data-section={`chart-line-bollinger-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-bollinger-mid-cross-sig-hover-targets">
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
                data-section="chart-line-bollinger-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-bollinger-mid-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={264}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bollinger-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bollinger-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bollinger-mid-cross-sig-tooltip-middle"
                >
                  middle{' '}
                  {tooltipSample.middle == null
                    ? '--'
                    : formatOsc(tooltipSample.middle)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bollinger-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-bollinger-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bollinger-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bollinger-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bollinger-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bollinger-mid-cross-sig-tooltip-biases"
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
          data-section="chart-line-bollinger-mid-cross-sig-badge"
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
          data-section="chart-line-bollinger-mid-cross-sig-legend"
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
                id: 'middle' as const,
                color: middleColor,
                label: 'middle',
              },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineBollingerMidCrossSigSeriesId;
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

ChartLineBollingerMidCrossSig.displayName = 'ChartLineBollingerMidCrossSig';
