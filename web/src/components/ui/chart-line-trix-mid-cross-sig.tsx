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
 * ChartLineTrixMidCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the TRIX (triple-smoothed
 * exponential rate-of-change) plus its smoothed SMA signal
 * line in the bottom panel, marking bullish (TRIX crosses
 * up through signal -- triple smoothed centerline trigger
 * up) / bearish (TRIX crosses down through signal -- triple
 * smoothed centerline trigger down) TRIX-over-signal
 * crossover trigger events with bias coloring derived from
 * the TRIX slope at the trigger bar.
 *
 *   ema1[i]      = EMA(close, period)   (SMA-seeded)
 *   ema2[i]      = EMA(ema1,  period)
 *   ema3[i]      = EMA(ema2,  period)
 *   trix[i]      = ema3[i] - ema3[i - 1]   (i >= 3p - 2)
 *   signal[i]    = SMA(trix, signalLength)
 *
 *   bullish      : prev trix <= prev signal &&
 *                  cur trix > cur signal
 *   bearish      : prev trix >= prev signal &&
 *                  cur trix < cur signal
 *   regime       : 'bullish' when trix >= signal
 *                  'bearish' when trix <  signal
 *                  'none'    when either is null
 *   bias         : trix[i] vs trix[i-1] -> up / down / flat
 *                  / none
 *
 * Defaults: `period = 15`, `signalLength = 3`. Jack Hutson's
 * 1980 TRIX is the canonical triple-exponential smoothed
 * rate-of-change oscillator: by chaining three EMAs and
 * taking the change of the third, it filters out short-term
 * noise and pure-trend lag while preserving turning-point
 * detection. `0` is the natural centerline; positive TRIX
 * means the triple-smoothed close is accelerating up
 * (bullish momentum), negative means decelerating (bearish
 * momentum). This primitive watches the TRIX vs its own
 * SMA-smoothed signal line to detect triple smoothed
 * centerline trigger events.
 *
 * This primitive uses the **absolute-slope variant** of TRIX
 * (`ema3[i] - ema3[i-1]`) rather than Hutson's percentage
 * form (`100 * (ema3[i] - ema3[i-1]) / ema3[i-1]`). The two
 * variants share the centerline-at-0 semantics; the
 * absolute-slope form gives bit-exact integer anchors on
 * linear input (mirroring the TEMA divergence sibling's
 * zero-lag identity convention) and avoids the
 * 0/0 / NaN edge case when EMA3 transits through 0. This is
 * a documented family-level tuning choice -- consumers who
 * prefer the percentage form can wrap the output with
 * `100 * trix / prevEma3`.
 *
 * Warmup is `3 * (period - 1) + signalLength = 45` for the
 * default tuning: EMA1 seeds at i = period - 1 = 14, EMA2
 * at i = 2 * (period - 1) = 28, EMA3 at i = 3 * (period -
 * 1) = 42, TRIX (needs EMA3[i - 1]) at i = 43, then the
 * signal SMA needs `signalLength - 1 = 2` more bars.
 *
 * Bit-exact anchors (close-input):
 *
 * - **CONST band** `close = K`: SMA-seeded EMA on a
 *   constant input is exactly the constant. ema1 = ema2 =
 *   ema3 = K for every valid bar. trix = K - K = 0
 *   (exactly the centerline). signal = SMA(0, 3) = 0.
 *   trix === signal -> regime `bullish` (>=) for every
 *   valid bar. 0 crosses. Verified across K in {0, 1, 50,
 *   200, 1234}.
 * - **LINEAR UP** `close = i`: SMA(close[0..14], 15) = 7,
 *   so ema1[14] = 7. Recurrence on linear: ema1[i] =
 *   alpha * i + (1 - alpha) * (i - 1 - 7) = i - 7
 *   (exact). Similarly ema2[i] = ema1[i] - 7 = i - 14
 *   and ema3[i] = ema2[i] - 7 = i - 21. trix[i] =
 *   ema3[i] - ema3[i - 1] = (i - 21) - (i - 1 - 21) =
 *   +1 (constant slope). signal = SMA(+1, 3) = +1.
 *   trix === signal -> regime `bullish` (>=). 0
 *   crosses. The constant +1 reflects the unit slope of
 *   the LINEAR input -- canonical TRIX behaviour: the
 *   rate-of-change of a triple-smoothed line is exactly
 *   the original line's slope.
 * - **LINEAR DOWN** `close = -i`: mirror -> trix = -1
 *   (constant). signal = -1. trix === signal -> regime
 *   `bullish` (>=) for the same `===` reason. 0
 *   crosses.
 */

export interface ChartLineTrixMidCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineTrixMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineTrixMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineTrixMidCrossSigSeriesId =
  | 'price'
  | 'trix'
  | 'signal';

export type ChartLineTrixMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineTrixMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineTrixMidCrossSigCrossKind;
  bias: ChartLineTrixMidCrossSigBias;
}

export interface ChartLineTrixMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  trix: number | null;
  signal: number | null;
  regime: ChartLineTrixMidCrossSigRegime;
  bias: ChartLineTrixMidCrossSigBias;
}

export interface ChartLineTrixMidCrossSigRun {
  series: ChartLineTrixMidCrossSigPoint[];
  period: number;
  signalLength: number;
  ema1Values: Array<number | null>;
  ema2Values: Array<number | null>;
  ema3Values: Array<number | null>;
  trixValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineTrixMidCrossSigSample[];
  crosses: ChartLineTrixMidCrossSigCross[];
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

export interface ChartLineTrixMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrixMidCrossSigLayout {
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
  priceDots: ChartLineTrixMidCrossSigDot[];
  trixPath: string;
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
    kind: ChartLineTrixMidCrossSigCrossKind;
    bias: ChartLineTrixMidCrossSigBias;
  }>;
  run: ChartLineTrixMidCrossSigRun;
}

export interface ChartLineTrixMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrixMidCrossSigPoint[];
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
  trixColor?: string;
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
  showTrix?: boolean;
  showSignal?: boolean;
  showCenterline?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrixMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineTrixMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrixMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PERIOD = 15;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_CENTERLINE = 0;
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_TRIX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_CENTERLINE_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineTrixMidCrossSigFinitePoints(
  data: readonly ChartLineTrixMidCrossSigPoint[] | null | undefined,
): ChartLineTrixMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrixMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineTrixMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with min===max short-circuit for CONST bit-exactness. */
export function applyLineTrixMidCrossSigEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || n === 0) return out;
  if (length === 1) {
    for (let i = 0; i < n; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  const alpha = 2 / (length + 1);
  // Find the first index where the previous `length` values
  // (including this one) are all non-null. Seed there with the
  // SMA of that window so chained EMAs (EMA(EMA(x))) work
  // despite leading nulls in the input.
  let seedEnd = -1;
  for (let i = length - 1; i < n; i += 1) {
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
    if (valid) {
      out[i] = winMin === winMax ? winMin : posZero(sum / length);
      seedEnd = i;
      break;
    }
  }
  if (seedEnd === -1) return out;
  let prev = out[seedEnd]!;
  for (let i = seedEnd + 1; i < n; i += 1) {
    const v = values[i];
    if (v == null) {
      // null after seed breaks the recurrence; subsequent values stay null.
      return out;
    }
    const next = alpha * v + (1 - alpha) * prev;
    out[i] = posZero(next);
    prev = next;
  }
  return out;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineTrixMidCrossSigSma(
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

export interface TrixMidCrossSigChannels {
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  ema3: Array<number | null>;
  trix: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineTrixMidCrossSig(
  series: readonly ChartLineTrixMidCrossSigPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): TrixMidCrossSigChannels {
  const cleaned = getLineTrixMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { ema1: [], ema2: [], ema3: [], trix: [], signal: [] };
  }
  const period = normalizeLineTrixMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineTrixMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const n = cleaned.length;
  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const ema1 = applyLineTrixMidCrossSigEma(closes, period);
  const ema2 = applyLineTrixMidCrossSigEma(ema1, period);
  const ema3 = applyLineTrixMidCrossSigEma(ema2, period);

  const trix: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = ema3[i];
    const prev = ema3[i - 1];
    if (cur == null || prev == null) continue;
    trix[i] = posZero(cur - prev);
  }

  const signal = applyLineTrixMidCrossSigSma(trix, signalLength);
  return { ema1, ema2, ema3, trix, signal };
}

export function classifyLineTrixMidCrossSigRegime(
  trix: number | null,
  signal: number | null,
): ChartLineTrixMidCrossSigRegime {
  if (trix == null || signal == null) return 'none';
  if (trix >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineTrixMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineTrixMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineTrixMidCrossSigCrosses(
  series: readonly ChartLineTrixMidCrossSigPoint[],
  trixValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineTrixMidCrossSigCross[] {
  const out: ChartLineTrixMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pt = trixValues[i - 1];
    const ps = signalValues[i - 1];
    const ct = trixValues[i];
    const cs = signalValues[i];
    if (pt == null || ps == null || ct == null || cs == null) continue;
    const bias = classifyLineTrixMidCrossSigBias(ct, pt);
    if (pt <= ps && ct > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pt >= ps && ct < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineTrixMidCrossSig(
  data: ChartLineTrixMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineTrixMidCrossSigRun {
  const cleaned = getLineTrixMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineTrixMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineTrixMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineTrixMidCrossSig(series, {
    period,
    signalLength,
  });

  const samples: ChartLineTrixMidCrossSigSample[] = series.map((p, i) => {
    const trix = channels.trix[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prev = i > 0 ? (channels.trix[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      trix,
      signal,
      regime: classifyLineTrixMidCrossSigRegime(trix, signal),
      bias: classifyLineTrixMidCrossSigBias(trix, prev),
    };
  });

  const crosses = detectLineTrixMidCrossSigCrosses(
    series,
    channels.trix,
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

  const warmup = 3 * (period - 1) + signalLength;
  const ok = series.length > warmup;

  return {
    series,
    period,
    signalLength,
    ema1Values: channels.ema1,
    ema2Values: channels.ema2,
    ema3Values: channels.ema3,
    trixValues: channels.trix,
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

export interface ComputeLineTrixMidCrossSigLayoutOptions {
  data: ChartLineTrixMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTrixMidCrossSigLayout(
  opts: ComputeLineTrixMidCrossSigLayoutOptions,
): ChartLineTrixMidCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineTrixMidCrossSig(opts.data, {
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
  for (let i = 0; i < run.trixValues.length; i += 1) {
    const t = run.trixValues[i];
    const s = run.signalValues[i];
    if (t != null) {
      if (t < oscRawMin) oscRawMin = t;
      if (t > oscRawMax) oscRawMax = t;
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
    DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_CENTERLINE,
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
      trixPath: '',
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
  const priceDots: ChartLineTrixMidCrossSigDot[] = [];
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

  let trixPath = '';
  let firstTrix = true;
  for (const s of run.samples) {
    if (s.trix == null) {
      firstTrix = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.trix);
    trixPath += `${firstTrix ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstTrix = false;
  }
  trixPath = trixPath.trim();

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
    const tAt = run.trixValues[c.index];
    const cyOsc = tAt != null ? syOscBase(tAt) : oscBottom;
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
    trixPath,
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

export function describeLineTrixMidCrossSigChart(
  data: ChartLineTrixMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineTrixMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineTrixMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineTrixMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `TRIX midline-over-Signal chart over ${cleaned.length} bars ` +
    `(period ${period}, signalLength ${signalLength}). Top panel ` +
    `renders the close with bullish (TRIX crosses up through ` +
    `signal, triple smoothed centerline trigger up) / bearish ` +
    `(TRIX crosses down through signal, triple smoothed centerline ` +
    `trigger down) chevron overlays at every TRIX-signal trigger ` +
    `event; bottom panel renders Jack Hutson's (1980) Triple ` +
    `Exponential Average rate-of-change (the slope of the triple- ` +
    `chained EMA of the close, absolute-slope variant) with the ` +
    `conventional zero centerline and its SMA signal line, ` +
    `marker-coloured by TRIX slope bias (rising / falling / flat) ` +
    `at the trigger bar, flagging triple smoothed centerline ` +
    `trigger events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineTrixMidCrossSigCrossKind,
  bias: ChartLineTrixMidCrossSigBias,
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

export const ChartLineTrixMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineTrixMidCrossSigProps
>(function ChartLineTrixMidCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PERIOD,
    signalLength = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_PRICE_COLOR,
    trixColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_TRIX_COLOR,
    signalColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_SIGNAL_COLOR,
    centerlineColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_CENTERLINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTrix = true,
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
    () => getLineTrixMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTrixMidCrossSigLayout({
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
    ChartLineTrixMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineTrixMidCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineTrixMidCrossSigSeriesId,
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
        data-section="chart-line-trix-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTrixMidCrossSigChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showTrixLine = !hidden.has('trix') && showTrix;
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
    DEFAULT_CHART_LINE_TRIX_MID_CROSS_SIG_CENTERLINE,
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
      aria-label={ariaLabel ?? 'TRIX midline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-trix-mid-cross-sig"
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
        data-section="chart-line-trix-mid-cross-sig-title"
      >
        {ariaLabel ?? 'TRIX midline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-trix-mid-cross-sig-aria-desc"
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
        data-section="chart-line-trix-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-trix-mid-cross-sig-grid">
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
                  data-section="chart-line-trix-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-trix-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-trix-mid-cross-sig-axes">
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
                  data-section="chart-line-trix-mid-cross-sig-tick-price"
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
                  data-section="chart-line-trix-mid-cross-sig-tick-osc"
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
            data-section="chart-line-trix-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-trix-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-trix-mid-cross-sig-price-dot"
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
            data-section="chart-line-trix-mid-cross-sig-centerline"
          />
        ) : null}

        {showTrixLine ? (
          <path
            d={layout.trixPath}
            stroke={trixColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-mid-cross-sig-trix-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-trix-mid-cross-sig-crosses"
            role="group"
            aria-label="TRIX-signal trigger markers"
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
                aria-label={`${m.kind} TRIX-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-trix-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-trix-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay TRIX-signal trigger markers"
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
                data-section={`chart-line-trix-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-trix-mid-cross-sig-hover-targets">
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
                data-section="chart-line-trix-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-trix-mid-cross-sig-tooltip"
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
                  data-section="chart-line-trix-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-mid-cross-sig-tooltip-trix"
                >
                  TRIX{' '}
                  {tooltipSample.trix == null
                    ? '--'
                    : formatOsc(tooltipSample.trix)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-trix-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-mid-cross-sig-tooltip-biases"
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
          data-section="chart-line-trix-mid-cross-sig-badge"
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
          data-section="chart-line-trix-mid-cross-sig-legend"
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
              { id: 'trix' as const, color: trixColor, label: 'TRIX' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineTrixMidCrossSigSeriesId;
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

ChartLineTrixMidCrossSig.displayName = 'ChartLineTrixMidCrossSig';
