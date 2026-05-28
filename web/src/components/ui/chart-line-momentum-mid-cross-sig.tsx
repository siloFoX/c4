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
 * ChartLineMomentumMidCrossSig -- pure-SVG dual-panel chart
 * with the close in the top panel and the Momentum
 * oscillator plus its smoothed SMA signal line in the
 * bottom panel, marking bullish (Momentum crosses up
 * through signal -- momentum centerline trigger up) /
 * bearish (Momentum crosses down through signal --
 * momentum centerline trigger down) Momentum-over-signal
 * crossover trigger events with bias coloring derived
 * from the Momentum slope at the trigger bar.
 *
 *   momentum[i]  = close[i] - close[i - period]
 *   signal[i]    = SMA(momentum, signalLength)
 *
 *   bullish      : prev momentum <= prev signal &&
 *                  cur momentum > cur signal
 *   bearish      : prev momentum >= prev signal &&
 *                  cur momentum < cur signal
 *   regime       : 'bullish' when momentum >= signal
 *                  'bearish' when momentum <  signal
 *                  'none'    when either is null
 *   bias         : momentum[i] vs momentum[i-1] -> up /
 *                  down / flat / none
 *
 * Defaults: `period = 10`, `signalLength = 3`. The
 * Momentum oscillator is the simplest and oldest of all
 * momentum indicators: the raw difference between the
 * current close and the close `period` bars ago. Unlike
 * the rate-of-change (ROC) sibling, Momentum is in
 * price units rather than a percentage. `0` is the
 * natural centerline; positive momentum means price is
 * higher than `period` bars ago (uptrending pressure),
 * negative means lower (downtrending pressure). This
 * primitive watches the Momentum vs its own SMA-smoothed
 * signal line to detect momentum centerline trigger
 * events.
 *
 * Warmup is `period + signalLength - 1 = 12` for the
 * default tuning: momentum is valid from i = period =
 * 10, then the signal SMA needs `signalLength - 1 = 2`
 * more bars.
 *
 * Bit-exact anchors (close-input):
 *
 * - **CONST band** `close = K`: momentum = K - K = 0
 *   (exactly the centerline). signal = SMA(0, 3) = 0.
 *   momentum === signal -> regime `bullish` (>=) for
 *   every valid bar. 0 crosses. Verified across K in
 *   {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `close = i`: momentum = i - (i -
 *   period) = period = +10 (constant -- exactly the
 *   slope per bar times the lookback). signal = SMA
 *   (+10, 3) = +10. momentum === signal -> regime
 *   `bullish` (>=). 0 crosses. The constant +10 is the
 *   simplest possible momentum reading: a steady +1/bar
 *   slope over a 10-bar lookback yields a constant
 *   momentum of +10.
 * - **LINEAR DOWN** `close = -i`: momentum = -i - (-i
 *   + period) = -period = -10 (mirror). signal = -10.
 *   momentum === signal -> regime `bullish` (>=) for
 *   the same `===` reason. 0 crosses.
 */

export interface ChartLineMomentumMidCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineMomentumMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineMomentumMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineMomentumMidCrossSigSeriesId =
  | 'price'
  | 'momentum'
  | 'signal';

export type ChartLineMomentumMidCrossSigCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineMomentumMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineMomentumMidCrossSigCrossKind;
  bias: ChartLineMomentumMidCrossSigBias;
}

export interface ChartLineMomentumMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  momentum: number | null;
  signal: number | null;
  regime: ChartLineMomentumMidCrossSigRegime;
  bias: ChartLineMomentumMidCrossSigBias;
}

export interface ChartLineMomentumMidCrossSigRun {
  series: ChartLineMomentumMidCrossSigPoint[];
  period: number;
  signalLength: number;
  momentumValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineMomentumMidCrossSigSample[];
  crosses: ChartLineMomentumMidCrossSigCross[];
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

export interface ChartLineMomentumMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMomentumMidCrossSigLayout {
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
  priceDots: ChartLineMomentumMidCrossSigDot[];
  momentumPath: string;
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
    kind: ChartLineMomentumMidCrossSigCrossKind;
    bias: ChartLineMomentumMidCrossSigBias;
  }>;
  run: ChartLineMomentumMidCrossSigRun;
}

export interface ChartLineMomentumMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMomentumMidCrossSigPoint[];
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
  momentumColor?: string;
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
  showMomentum?: boolean;
  showSignal?: boolean;
  showCenterline?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMomentumMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineMomentumMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMomentumMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PERIOD = 10;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_CENTERLINE = 0;
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_MOMENTUM_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_SIGNAL_COLOR =
  '#f59e0b';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_CENTERLINE_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineMomentumMidCrossSigFinitePoints(
  data: readonly ChartLineMomentumMidCrossSigPoint[] | null | undefined,
): ChartLineMomentumMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMomentumMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineMomentumMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineMomentumMidCrossSigSma(
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

export interface MomentumMidCrossSigChannels {
  momentum: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineMomentumMidCrossSig(
  series: readonly ChartLineMomentumMidCrossSigPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): MomentumMidCrossSigChannels {
  const cleaned = getLineMomentumMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { momentum: [], signal: [] };
  }
  const period = normalizeLineMomentumMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineMomentumMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const n = cleaned.length;
  const momentum: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    momentum[i] = posZero(cleaned[i]!.close - cleaned[i - period]!.close);
  }

  const signal = applyLineMomentumMidCrossSigSma(momentum, signalLength);
  return { momentum, signal };
}

export function classifyLineMomentumMidCrossSigRegime(
  momentum: number | null,
  signal: number | null,
): ChartLineMomentumMidCrossSigRegime {
  if (momentum == null || signal == null) return 'none';
  if (momentum >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineMomentumMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineMomentumMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineMomentumMidCrossSigCrosses(
  series: readonly ChartLineMomentumMidCrossSigPoint[],
  momentumValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineMomentumMidCrossSigCross[] {
  const out: ChartLineMomentumMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pm = momentumValues[i - 1];
    const ps = signalValues[i - 1];
    const cm = momentumValues[i];
    const cs = signalValues[i];
    if (pm == null || ps == null || cm == null || cs == null) continue;
    const bias = classifyLineMomentumMidCrossSigBias(cm, pm);
    if (pm <= ps && cm > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pm >= ps && cm < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineMomentumMidCrossSig(
  data: ChartLineMomentumMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineMomentumMidCrossSigRun {
  const cleaned = getLineMomentumMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineMomentumMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineMomentumMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineMomentumMidCrossSig(series, {
    period,
    signalLength,
  });

  const samples: ChartLineMomentumMidCrossSigSample[] = series.map(
    (p, i) => {
      const momentum = channels.momentum[i] ?? null;
      const signal = channels.signal[i] ?? null;
      const prev = i > 0 ? (channels.momentum[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        momentum,
        signal,
        regime: classifyLineMomentumMidCrossSigRegime(momentum, signal),
        bias: classifyLineMomentumMidCrossSigBias(momentum, prev),
      };
    },
  );

  const crosses = detectLineMomentumMidCrossSigCrosses(
    series,
    channels.momentum,
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
    momentumValues: channels.momentum,
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

export interface ComputeLineMomentumMidCrossSigLayoutOptions {
  data: ChartLineMomentumMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMomentumMidCrossSigLayout(
  opts: ComputeLineMomentumMidCrossSigLayoutOptions,
): ChartLineMomentumMidCrossSigLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineMomentumMidCrossSig(opts.data, {
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
  for (let i = 0; i < run.momentumValues.length; i += 1) {
    const m = run.momentumValues[i];
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
  // Guarantee centerline (0) is always within view.
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
    DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_CENTERLINE,
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
      momentumPath: '',
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
  const priceDots: ChartLineMomentumMidCrossSigDot[] = [];
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
    accessor: (s: ChartLineMomentumMidCrossSigSample) => number | null,
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

  const momentumPath = buildPath((s) => s.momentum);
  const signalPath = buildPath((s) => s.signal);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const mAt = run.momentumValues[c.index];
    const cyOsc = mAt != null ? syOscBase(mAt) : oscBottom;
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
    momentumPath,
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

export function describeLineMomentumMidCrossSigChart(
  data: ChartLineMomentumMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineMomentumMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineMomentumMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineMomentumMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `Momentum midline-over-Signal chart over ${cleaned.length} bars ` +
    `(period ${period}, signalLength ${signalLength}). Top panel ` +
    `renders the close with bullish (Momentum crosses up through ` +
    `signal, momentum centerline trigger up) / bearish (Momentum ` +
    `crosses down through signal, momentum centerline trigger down) ` +
    `chevron overlays at every Momentum-signal trigger event; ` +
    `bottom panel renders the canonical Momentum oscillator (close ` +
    `at i minus close at i - period) with the conventional zero ` +
    `centerline and its SMA signal line, marker-coloured by ` +
    `Momentum slope bias (rising / falling / flat) at the trigger ` +
    `bar, flagging momentum centerline trigger events with bias ` +
    `coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineMomentumMidCrossSigCrossKind,
  bias: ChartLineMomentumMidCrossSigBias,
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

export const ChartLineMomentumMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineMomentumMidCrossSigProps
>(function ChartLineMomentumMidCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PERIOD,
    signalLength = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_PRICE_COLOR,
    momentumColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_MOMENTUM_COLOR,
    signalColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_SIGNAL_COLOR,
    centerlineColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_CENTERLINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMomentum = true,
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
    () => getLineMomentumMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMomentumMidCrossSigLayout({
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
    ChartLineMomentumMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineMomentumMidCrossSigSeriesId,
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
    seriesId: ChartLineMomentumMidCrossSigSeriesId,
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
        data-section="chart-line-momentum-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMomentumMidCrossSigChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showMomentumLine = !hidden.has('momentum') && showMomentum;
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
    DEFAULT_CHART_LINE_MOMENTUM_MID_CROSS_SIG_CENTERLINE,
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
      aria-label={ariaLabel ?? 'Momentum midline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-momentum-mid-cross-sig"
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
        data-section="chart-line-momentum-mid-cross-sig-title"
      >
        {ariaLabel ?? 'Momentum midline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-momentum-mid-cross-sig-aria-desc"
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
        data-section="chart-line-momentum-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-momentum-mid-cross-sig-grid">
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
                  data-section="chart-line-momentum-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-momentum-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-momentum-mid-cross-sig-axes">
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
                  data-section="chart-line-momentum-mid-cross-sig-tick-price"
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
                  data-section="chart-line-momentum-mid-cross-sig-tick-osc"
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
            data-section="chart-line-momentum-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-momentum-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-momentum-mid-cross-sig-price-dot"
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
            data-section="chart-line-momentum-mid-cross-sig-centerline"
          />
        ) : null}

        {showMomentumLine ? (
          <path
            d={layout.momentumPath}
            stroke={momentumColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-momentum-mid-cross-sig-momentum-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-momentum-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-momentum-mid-cross-sig-crosses"
            role="group"
            aria-label="Momentum-signal trigger markers"
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
                aria-label={`${m.kind} Momentum-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-momentum-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-momentum-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay Momentum-signal trigger markers"
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
                data-section={`chart-line-momentum-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-momentum-mid-cross-sig-hover-targets">
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
                data-section="chart-line-momentum-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-momentum-mid-cross-sig-tooltip"
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
                  data-section="chart-line-momentum-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-mid-cross-sig-tooltip-momentum"
                >
                  momentum{' '}
                  {tooltipSample.momentum == null
                    ? '--'
                    : formatOsc(tooltipSample.momentum)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-momentum-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-mid-cross-sig-tooltip-biases"
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
          data-section="chart-line-momentum-mid-cross-sig-badge"
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
          data-section="chart-line-momentum-mid-cross-sig-legend"
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
                id: 'momentum' as const,
                color: momentumColor,
                label: 'momentum',
              },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineMomentumMidCrossSigSeriesId;
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

ChartLineMomentumMidCrossSig.displayName = 'ChartLineMomentumMidCrossSig';
