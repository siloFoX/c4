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
 * ChartLineCciMidCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the Commodity Channel
 * Index (CCI) plus its smoothed SMA signal line in the
 * bottom panel, marking bullish (CCI crosses up through
 * signal -- centerline trend trigger up) / bearish (CCI
 * crosses down through signal -- centerline trend trigger
 * down) CCI-over-signal crossover trigger events with bias
 * coloring derived from the CCI slope at the trigger bar.
 *
 *   typical[i]   = (high[i] + low[i] + close[i]) / 3
 *   smaTp[i]     = SMA(typical, period)
 *   meanDev[i]   = sum(|typical[j] - smaTp[i]|,
 *                       j = i - period + 1 .. i) / period
 *   cci[i]       = meanDev[i] > 0
 *                  ? (typical[i] - smaTp[i]) /
 *                    (0.015 * meanDev[i])
 *                  : 0
 *   signal[i]    = SMA(cci, signalLength)
 *
 *   bullish      : prev cci <= prev signal &&
 *                  cur cci > cur signal
 *   bearish      : prev cci >= prev signal &&
 *                  cur cci < cur signal
 *   regime       : 'bullish' when cci >= signal
 *                  'bearish' when cci <  signal
 *                  'none'    when either is null
 *   bias         : cci[i] vs cci[i-1] -> up / down / flat /
 *                  none
 *
 * Defaults: `period = 14`, `signalLength = 3`. Donald
 * Lambert's 1980 Commodity Channel Index is the canonical
 * mean-reversion oscillator: it measures the deviation of
 * the current typical price from its rolling SMA, scaled
 * by the rolling mean absolute deviation. The 0.015 scaling
 * constant ensures roughly 75% of values fall within
 * `[-100, +100]` for typical-volatility instruments,
 * making `+/- 100` the conventional overbought / oversold
 * boundaries and `0` the natural centerline.
 *
 * Warmup is `period + signalLength - 2 = 15` for the
 * default tuning: smaTp seeds at `period - 1 = 13`, CCI is
 * valid from i = 13, then the signal SMA needs
 * `signalLength - 1 = 2` more bars.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: typical = K, smaTp = K -> typical - smaTp = 0.
 *   meanDev = 0 (all deviations are 0). The zero-guard
 *   returns CCI = 0 (instead of 0/0 NaN). signal = 0.
 *   CCI === signal -> regime `bullish` (>=) for every
 *   valid bar. 0 crosses. Verified across K in {0, 1, 50,
 *   200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: typical = i, smaTp = i - 6.5. typical - smaTp
 *   = `+6.5` (constant). meanDev = sum of `|j - (i -
 *   6.5)|` for j in `[i - 13, i]` = `2 * (0.5 + 1.5 +
 *   2.5 + 3.5 + 4.5 + 5.5 + 6.5) / 14 = 49 / 14 = 3.5`.
 *   CCI = `6.5 / (0.015 * 3.5) = 6.5 / 0.0525 = 2600 /
 *   21 ~= 123.81`. signal = CCI (constant) -> regime
 *   `bullish` (>=). 0 crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: mirror -> CCI = `-2600 / 21 ~=
 *   -123.81`. signal = CCI -> regime `bullish` (>=) for
 *   the same `===` reason. 0 crosses.
 */

export interface ChartLineCciMidCrossSigPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineCciMidCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineCciMidCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineCciMidCrossSigSeriesId =
  | 'price'
  | 'cci'
  | 'signal';

export type ChartLineCciMidCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineCciMidCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineCciMidCrossSigCrossKind;
  bias: ChartLineCciMidCrossSigBias;
}

export interface ChartLineCciMidCrossSigSample {
  index: number;
  x: number;
  close: number;
  cci: number | null;
  signal: number | null;
  regime: ChartLineCciMidCrossSigRegime;
  bias: ChartLineCciMidCrossSigBias;
}

export interface ChartLineCciMidCrossSigRun {
  series: ChartLineCciMidCrossSigPoint[];
  period: number;
  signalLength: number;
  typicalValues: Array<number | null>;
  cciValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineCciMidCrossSigSample[];
  crosses: ChartLineCciMidCrossSigCross[];
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

export interface ChartLineCciMidCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCciMidCrossSigLayout {
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
  priceDots: ChartLineCciMidCrossSigDot[];
  cciPath: string;
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
    kind: ChartLineCciMidCrossSigCrossKind;
    bias: ChartLineCciMidCrossSigBias;
  }>;
  run: ChartLineCciMidCrossSigRun;
}

export interface ChartLineCciMidCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCciMidCrossSigPoint[];
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
  cciColor?: string;
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
  showCci?: boolean;
  showSignal?: boolean;
  showCenterline?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCciMidCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineCciMidCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCciMidCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PERIOD = 14;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_CENTERLINE = 0;
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_CCI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_CENTERLINE_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const CCI_SCALING = 0.015;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineCciMidCrossSigFinitePoints(
  data: readonly ChartLineCciMidCrossSigPoint[] | null | undefined,
): ChartLineCciMidCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCciMidCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      point.high >= point.low
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

export function normalizeLineCciMidCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineCciMidCrossSigSma(
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

export interface CciMidCrossSigChannels {
  typical: Array<number | null>;
  cci: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineCciMidCrossSig(
  series: readonly ChartLineCciMidCrossSigPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): CciMidCrossSigChannels {
  const cleaned = getLineCciMidCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { typical: [], cci: [], signal: [] };
  }
  const period = normalizeLineCciMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineCciMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const n = cleaned.length;
  const typical: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const p = cleaned[i]!;
    typical[i] = posZero((p.high + p.low + p.close) / 3);
  }

  const smaTp = applyLineCciMidCrossSigSma(typical, period);

  const cci: Array<number | null> = new Array(n).fill(null);
  for (let i = period - 1; i < n; i += 1) {
    const tpNow = typical[i];
    const smaNow = smaTp[i];
    if (tpNow == null || smaNow == null) continue;
    let deviationSum = 0;
    let valid = true;
    for (let j = i - period + 1; j <= i; j += 1) {
      const tpJ = typical[j];
      if (tpJ == null) {
        valid = false;
        break;
      }
      deviationSum += Math.abs(tpJ - smaNow);
    }
    if (!valid) continue;
    const meanDev = deviationSum / period;
    if (meanDev === 0) {
      cci[i] = 0;
    } else {
      cci[i] = posZero((tpNow - smaNow) / (CCI_SCALING * meanDev));
    }
  }

  const signal = applyLineCciMidCrossSigSma(cci, signalLength);
  return { typical, cci, signal };
}

export function classifyLineCciMidCrossSigRegime(
  cci: number | null,
  signal: number | null,
): ChartLineCciMidCrossSigRegime {
  if (cci == null || signal == null) return 'none';
  if (cci >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineCciMidCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineCciMidCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineCciMidCrossSigCrosses(
  series: readonly ChartLineCciMidCrossSigPoint[],
  cciValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineCciMidCrossSigCross[] {
  const out: ChartLineCciMidCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pc = cciValues[i - 1];
    const ps = signalValues[i - 1];
    const cc = cciValues[i];
    const cs = signalValues[i];
    if (pc == null || ps == null || cc == null || cs == null) continue;
    const bias = classifyLineCciMidCrossSigBias(cc, pc);
    if (pc <= ps && cc > cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pc >= ps && cc < cs) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineCciMidCrossSig(
  data: ChartLineCciMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineCciMidCrossSigRun {
  const cleaned = getLineCciMidCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineCciMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineCciMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineCciMidCrossSig(series, {
    period,
    signalLength,
  });

  const samples: ChartLineCciMidCrossSigSample[] = series.map((p, i) => {
    const cci = channels.cci[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const prevCci = i > 0 ? (channels.cci[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      cci,
      signal,
      regime: classifyLineCciMidCrossSigRegime(cci, signal),
      bias: classifyLineCciMidCrossSigBias(cci, prevCci),
    };
  });

  const crosses = detectLineCciMidCrossSigCrosses(
    series,
    channels.cci,
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
    typicalValues: channels.typical,
    cciValues: channels.cci,
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

export interface ComputeLineCciMidCrossSigLayoutOptions {
  data: ChartLineCciMidCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineCciMidCrossSigLayout(
  opts: ComputeLineCciMidCrossSigLayoutOptions,
): ChartLineCciMidCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PANEL_GAP;

  const run = runLineCciMidCrossSig(opts.data, {
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
  for (let i = 0; i < run.cciValues.length; i += 1) {
    const c = run.cciValues[i];
    const s = run.signalValues[i];
    if (c != null) {
      if (c < oscRawMin) oscRawMin = c;
      if (c > oscRawMax) oscRawMax = c;
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
  // Ensure the centerline (0) is always within view so the
  // dashed reference renders inside the panel.
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
    DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_CENTERLINE,
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
      cciPath: '',
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
  const priceDots: ChartLineCciMidCrossSigDot[] = [];
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

  let cciPath = '';
  let firstCci = true;
  for (const s of run.samples) {
    if (s.cci == null) {
      firstCci = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.cci);
    cciPath += `${firstCci ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstCci = false;
  }
  cciPath = cciPath.trim();

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
    const cciAtCross = run.cciValues[c.index];
    const cyOsc = cciAtCross != null ? syOscBase(cciAtCross) : oscBottom;
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
    cciPath,
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

export function describeLineCciMidCrossSigChart(
  data: ChartLineCciMidCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineCciMidCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineCciMidCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineCciMidCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `CCI centerline-over-Signal chart over ${cleaned.length} bars ` +
    `(period ${period}, signalLength ${signalLength}). Top panel ` +
    `renders the close with bullish (CCI crosses up through ` +
    `signal, centerline trend trigger up) / bearish (CCI crosses ` +
    `down through signal, centerline trend trigger down) chevron ` +
    `overlays at every CCI-signal trigger event; bottom panel ` +
    `renders Donald Lambert's Commodity Channel Index (typical- ` +
    `price deviation from rolling SMA, scaled by 0.015 * mean ` +
    `absolute deviation) with the conventional centerline at 0 ` +
    `and its SMA signal line, marker-coloured by CCI slope bias ` +
    `(rising / falling / flat) at the trigger bar, flagging ` +
    `centerline trend trigger events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineCciMidCrossSigCrossKind,
  bias: ChartLineCciMidCrossSigBias,
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

export const ChartLineCciMidCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineCciMidCrossSigProps
>(function ChartLineCciMidCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PERIOD,
    signalLength = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_PRICE_COLOR,
    cciColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_CCI_COLOR,
    signalColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_SIGNAL_COLOR,
    centerlineColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_CENTERLINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCci = true,
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
    () => getLineCciMidCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineCciMidCrossSigLayout({
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
    ChartLineCciMidCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineCciMidCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineCciMidCrossSigSeriesId,
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
        data-section="chart-line-cci-mid-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineCciMidCrossSigChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showCciLine = !hidden.has('cci') && showCci;
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
    DEFAULT_CHART_LINE_CCI_MID_CROSS_SIG_CENTERLINE,
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
      aria-label={ariaLabel ?? 'CCI centerline-over-Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-cci-mid-cross-sig"
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
        data-section="chart-line-cci-mid-cross-sig-title"
      >
        {ariaLabel ?? 'CCI centerline-over-Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-cci-mid-cross-sig-aria-desc"
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
        data-section="chart-line-cci-mid-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-cci-mid-cross-sig-grid">
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
                  data-section="chart-line-cci-mid-cross-sig-grid-line-price"
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
                  data-section="chart-line-cci-mid-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-cci-mid-cross-sig-axes">
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
                  data-section="chart-line-cci-mid-cross-sig-tick-price"
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
                  data-section="chart-line-cci-mid-cross-sig-tick-osc"
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
            data-section="chart-line-cci-mid-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-cci-mid-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-cci-mid-cross-sig-price-dot"
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
            data-section="chart-line-cci-mid-cross-sig-centerline"
          />
        ) : null}

        {showCciLine ? (
          <path
            d={layout.cciPath}
            stroke={cciColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cci-mid-cross-sig-cci-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cci-mid-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-cci-mid-cross-sig-crosses"
            role="group"
            aria-label="CCI-signal trigger markers"
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
                aria-label={`${m.kind} CCI-signal trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-cci-mid-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-cci-mid-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay CCI-signal trigger markers"
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
                data-section={`chart-line-cci-mid-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-cci-mid-cross-sig-hover-targets">
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
                data-section="chart-line-cci-mid-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-cci-mid-cross-sig-tooltip"
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
                  data-section="chart-line-cci-mid-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-mid-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-mid-cross-sig-tooltip-cci"
                >
                  CCI{' '}
                  {tooltipSample.cci == null
                    ? '--'
                    : formatOsc(tooltipSample.cci)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-mid-cross-sig-tooltip-signal"
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
                  data-section="chart-line-cci-mid-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-mid-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-mid-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-mid-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cci-mid-cross-sig-tooltip-biases"
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
          data-section="chart-line-cci-mid-cross-sig-badge"
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
          data-section="chart-line-cci-mid-cross-sig-legend"
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
              { id: 'cci' as const, color: cciColor, label: 'CCI' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineCciMidCrossSigSeriesId;
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

ChartLineCciMidCrossSig.displayName = 'ChartLineCciMidCrossSig';
