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
 * ChartLineCmoZeroCrossSig -- pure-SVG dual-panel chart
 * with the close in the top panel and the Tushar Chande
 * Momentum Oscillator (CMO) along with its smoothed SMA
 * signal line in the bottom panel, marking bullish (CMO
 * crosses up through signal -- centerline momentum
 * trigger; CMO pulling above its smoothed mean) /
 * bearish (CMO crosses down through signal -- centerline
 * momentum trigger; CMO pulling below its smoothed mean)
 * CMO-vs-signal crossover trigger events with bias
 * coloring derived from the (CMO - signal) slope at the
 * trigger bar.
 *
 *   For each i = 1..n-1:
 *     diff[i] = close[i] - close[i-1]
 *     up[i]   = max(diff[i], 0)
 *     dn[i]   = max(-diff[i], 0)
 *
 *   For each i >= period:
 *     Su[i]   = sum(up[i-period+1..i])
 *     Sd[i]   = sum(dn[i-period+1..i])
 *     CMO[i]  = (Su[i] === 0 && Sd[i] === 0)
 *                 ? 0
 *                 : ((Su[i] - Sd[i]) / (Su[i] + Sd[i])) * 100
 *
 *   signal[i] = SMA(CMO, signalLength)[i]
 *
 *   bullish (CMO-cross up) :
 *     prev CMO <= prev signal && cur CMO > cur signal
 *   bearish (CMO-cross down) :
 *     prev CMO >= prev signal && cur CMO < cur signal
 *
 *   regime : 'bullish' when CMO >= signal
 *            'bearish' when CMO <  signal
 *            'none'    when either is null
 *   bias   : (CMO - signal)[i] vs prev -> up/down/flat/none
 *
 * Defaults: `period = 14`, `signalLength = 9`. The CMO
 * was introduced by Tushar Chande in 1994 as a
 * zero-centered alternative to the RSI: it normalises the
 * up-minus-down momentum by the up-plus-down total, so
 * the result lives in [-100, +100] with zero as the
 * centerline. When CMO is above its smoothed mean, the
 * recent momentum balance has been tilting upward; when
 * below, the recent balance has been tilting downward.
 * The signal-line cross is the canonical CMO centerline
 * momentum trigger.
 *
 * Sibling family (cross-sig family):
 *   - chart-line-rsi-mid-cross-sig v1.11.1066 -- RSI
 *     vs its 50 mid level (RSI is 0-100, CMO is
 *     -100..+100; conceptually parallel pair)
 *   - chart-line-cci-mid-cross-sig v1.11.1065 -- CCI
 *     vs zero
 *   - chart-line-momentum-mid-cross-sig v1.11.1080 --
 *     Momentum vs zero
 *   - chart-line-roc-mid-cross-sig v1.11.1081 -- ROC
 *     vs zero
 *   - chart-line-dpo-mid-cross-sig v1.11.1070 -- DPO
 *     vs zero
 *   - chart-line-trix-mid-cross-sig v1.11.1071 -- TRIX
 *     vs zero
 *   - this primitive: CMO vs SMA(CMO) signal line
 *     (centerline momentum trigger)
 *
 * Distinct from the existing chart-line-cmo-mid-cross
 * (CMO vs 50 level), chart-line-cmo-cross-sig (CMO vs
 * SMA but no zero-line awareness), and
 * chart-line-cmo-zero-cross (CMO vs zero only, no signal
 * line). This primitive specifically targets the
 * "centerline + signal" pair: CMO is centered at zero,
 * and the SMA signal is the smoothing reference for that
 * centerline-based oscillator.
 *
 * Warmup is `period + signalLength - 1 = 22` for the
 * first signal value (CMO seeds at i = period = 14, then
 * the SMA window over CMO fills at i = period +
 * signalLength - 1 = 22). Cross detection needs the
 * previous bar's signal, so the first potential cross
 * lands at i = period + signalLength = 23.
 *
 * Bit-exact anchors (single-close input):
 *
 * - **CONST** `close = K`: All diff[i] = 0 -> up = dn =
 *   0 -> Su = Sd = 0. Divide-by-zero guard returns
 *   CMO = 0 (constant). signal = SMA(0) = 0. CMO === 0
 *   === signal every bar -> regime `bullish` (via >=).
 *   0 crosses. Verified across K in {0, 1, 50, 200,
 *   1234}.
 * - **LINEAR UP** `close = i`: All diff[i] = +1 ->
 *   up[i] = 1, dn[i] = 0. Su = period, Sd = 0. CMO =
 *   (period - 0) / (period + 0) * 100 = 100 (constant
 *   from i = period). signal = SMA(100) = 100. CMO ===
 *   signal = 100. regime `bullish` (via >=). 0 crosses.
 * - **LINEAR DOWN** `close = -i`: All diff[i] = -1 ->
 *   up = 0, dn = 1. Su = 0, Sd = period. CMO = (0 -
 *   period) / (0 + period) * 100 = -100 (constant
 *   from i = period). signal = -100. CMO === signal.
 *   regime `bullish` (via >=, since equal). 0 crosses.
 *   Note: the family convention `bullish on ===`
 *   produces an asymmetric label here (LINEAR DOWN is
 *   "bullish" in the cross-sig sense even though the
 *   price is falling), but this is the deliberate
 *   family convention: cross-sig regime measures the
 *   indicator-vs-signal relationship, not the price
 *   direction.
 */

export interface ChartLineCmoZeroCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineCmoZeroCrossSigRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineCmoZeroCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineCmoZeroCrossSigSeriesId = 'price' | 'cmo' | 'signal';

export type ChartLineCmoZeroCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineCmoZeroCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineCmoZeroCrossSigCrossKind;
  bias: ChartLineCmoZeroCrossSigBias;
}

export interface ChartLineCmoZeroCrossSigSample {
  index: number;
  x: number;
  close: number;
  cmo: number | null;
  signal: number | null;
  diff: number | null;
  regime: ChartLineCmoZeroCrossSigRegime;
  bias: ChartLineCmoZeroCrossSigBias;
}

export interface ChartLineCmoZeroCrossSigRun {
  series: ChartLineCmoZeroCrossSigPoint[];
  period: number;
  signalLength: number;
  cmoValues: Array<number | null>;
  signalValues: Array<number | null>;
  diffValues: Array<number | null>;
  samples: ChartLineCmoZeroCrossSigSample[];
  crosses: ChartLineCmoZeroCrossSigCross[];
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

export interface ChartLineCmoZeroCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCmoZeroCrossSigLayout {
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
  priceDots: ChartLineCmoZeroCrossSigDot[];
  cmoPath: string;
  signalPath: string;
  zeroLineY: number;
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
    kind: ChartLineCmoZeroCrossSigCrossKind;
    bias: ChartLineCmoZeroCrossSigBias;
  }>;
  run: ChartLineCmoZeroCrossSigRun;
}

export interface ChartLineCmoZeroCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCmoZeroCrossSigPoint[];
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
  cmoColor?: string;
  signalColor?: string;
  zeroLineColor?: string;
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
  showCmo?: boolean;
  showSignal?: boolean;
  showZeroLine?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCmoZeroCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineCmoZeroCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCmoZeroCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PERIOD = 14;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_CMO_COLOR = '#db2777';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_ZERO_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineCmoZeroCrossSigFinitePoints(
  data: readonly ChartLineCmoZeroCrossSigPoint[] | null | undefined,
): ChartLineCmoZeroCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCmoZeroCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineCmoZeroCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface ComputeLineCmoZeroCrossSigResult {
  cmo: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineCmoZeroCrossSig(
  series: readonly ChartLineCmoZeroCrossSigPoint[] | null | undefined,
  options: { period?: number; signalLength?: number } = {},
): ComputeLineCmoZeroCrossSigResult {
  const cleaned = getLineCmoZeroCrossSigFinitePoints(series);
  if (cleaned.length === 0) return { cmo: [], signal: [] };
  const period = normalizeLineCmoZeroCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineCmoZeroCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_SIGNAL_LENGTH,
  );

  const n = cleaned.length;
  const up: number[] = new Array(n).fill(0);
  const dn: number[] = new Array(n).fill(0);
  for (let i = 1; i < n; i += 1) {
    const d = cleaned[i]!.close - cleaned[i - 1]!.close;
    if (d > 0) up[i] = d;
    else if (d < 0) dn[i] = -d;
  }

  const cmo: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    let su = 0;
    let sd = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      su += up[j]!;
      sd += dn[j]!;
    }
    const denom = su + sd;
    cmo[i] = denom === 0 ? 0 : posZero(((su - sd) / denom) * 100);
  }

  const signal: Array<number | null> = new Array(n).fill(null);
  for (let i = period + signalLength - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - signalLength + 1; j <= i; j += 1) {
      const c = cmo[j];
      if (c == null) {
        valid = false;
        break;
      }
      sum += c;
      if (c < winMin) winMin = c;
      if (c > winMax) winMax = c;
    }
    if (!valid) continue;
    signal[i] = winMin === winMax ? winMin : posZero(sum / signalLength);
  }

  return { cmo, signal };
}

export function classifyLineCmoZeroCrossSigRegime(
  cmo: number | null,
  signal: number | null,
): ChartLineCmoZeroCrossSigRegime {
  if (cmo == null || signal == null) return 'none';
  if (cmo >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineCmoZeroCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineCmoZeroCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineCmoZeroCrossSigCrosses(
  series: readonly ChartLineCmoZeroCrossSigPoint[],
  cmoValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineCmoZeroCrossSigCross[] {
  const out: ChartLineCmoZeroCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pC = cmoValues[i - 1];
    const pSig = signalValues[i - 1];
    const cC = cmoValues[i];
    const cSig = signalValues[i];
    if (pC == null || pSig == null || cC == null || cSig == null) continue;
    const prevDiff = pC - pSig;
    const curDiff = cC - cSig;
    const bias = classifyLineCmoZeroCrossSigBias(curDiff, prevDiff);
    if (pC <= pSig && cC > cSig) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pC >= pSig && cC < cSig) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineCmoZeroCrossSig(
  data: ChartLineCmoZeroCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): ChartLineCmoZeroCrossSigRun {
  const cleaned = getLineCmoZeroCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineCmoZeroCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineCmoZeroCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_SIGNAL_LENGTH,
  );

  const { cmo: cmoValues, signal: signalValues } = computeLineCmoZeroCrossSig(
    series,
    { period, signalLength },
  );

  const diffValues: Array<number | null> = series.map((_, i) => {
    const c = cmoValues[i] ?? null;
    const s = signalValues[i] ?? null;
    if (c == null || s == null) return null;
    return posZero(c - s);
  });

  const samples: ChartLineCmoZeroCrossSigSample[] = series.map((p, i) => {
    const cmo = cmoValues[i] ?? null;
    const signal = signalValues[i] ?? null;
    const diff = diffValues[i] ?? null;
    const prevDiff = i > 0 ? (diffValues[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      cmo,
      signal,
      diff,
      regime: classifyLineCmoZeroCrossSigRegime(cmo, signal),
      bias: classifyLineCmoZeroCrossSigBias(diff, prevDiff),
    };
  });

  const crosses = detectLineCmoZeroCrossSigCrosses(
    series,
    cmoValues,
    signalValues,
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

  const warmup = period + signalLength;
  const ok = series.length > warmup;

  return {
    series,
    period,
    signalLength,
    cmoValues,
    signalValues,
    diffValues,
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

export interface ComputeLineCmoZeroCrossSigLayoutOptions {
  data: ChartLineCmoZeroCrossSigPoint[];
  period?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineCmoZeroCrossSigLayout(
  opts: ComputeLineCmoZeroCrossSigLayoutOptions,
): ChartLineCmoZeroCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PANEL_GAP;

  const run = runLineCmoZeroCrossSig(opts.data, {
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

  // CMO is conventionally bounded to [-100, +100]. Hard-lock the panel.
  const oscMin = -100;
  const oscMax = 100;
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const zeroLineY = syOsc(0);

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
      cmoPath: '',
      signalPath: '',
      zeroLineY,
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
  const priceDots: ChartLineCmoZeroCrossSigDot[] = [];
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

  let cmoPath = '';
  let firstCmo = true;
  for (const s of run.samples) {
    if (s.cmo == null) {
      firstCmo = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.cmo);
    cmoPath += `${firstCmo ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstCmo = false;
  }
  cmoPath = cmoPath.trim();

  let signalPath = '';
  let firstSig = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      firstSig = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.signal);
    signalPath += `${firstSig ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstSig = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cmoAt = run.cmoValues[c.index];
    const cyOsc = cmoAt != null ? syOsc(cmoAt) : oscBottom;
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
    cmoPath,
    signalPath,
    zeroLineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineCmoZeroCrossSigChart(
  data: ChartLineCmoZeroCrossSigPoint[],
  options: { period?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineCmoZeroCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineCmoZeroCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PERIOD,
  );
  const signalLength = normalizeLineCmoZeroCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `Chande Momentum Oscillator zero-line cross-sig chart ` +
    `over ${cleaned.length} bars (period ${period}, signal ` +
    `${signalLength}). Top panel renders the close with ` +
    `bullish (CMO crosses up through signal, centerline ` +
    `momentum trigger) / bearish (CMO crosses down through ` +
    `signal, centerline momentum trigger) chevron overlays ` +
    `at every CMO-signal crossover event; bottom panel ` +
    `renders Tushar Chande's (1994) Momentum Oscillator ` +
    `((Su - Sd) / (Su + Sd) * 100, where Su = sum of up ` +
    `closes and Sd = sum of down closes over period) with ` +
    `its smoothed SMA signal line and the zero centerline ` +
    `reference, markers coloured by (CMO - signal) slope ` +
    `bias (rising / falling / flat) at the trigger bar.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineCmoZeroCrossSigCrossKind,
  bias: ChartLineCmoZeroCrossSigBias,
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

export const ChartLineCmoZeroCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineCmoZeroCrossSigProps
>(function ChartLineCmoZeroCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PERIOD,
    signalLength = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_PRICE_COLOR,
    cmoColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_CMO_COLOR,
    signalColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_SIGNAL_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_ZERO_LINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CMO_ZERO_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCmo = true,
    showSignal = true,
    showZeroLine = true,
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
    () => getLineCmoZeroCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineCmoZeroCrossSigLayout({
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
    ChartLineCmoZeroCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineCmoZeroCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineCmoZeroCrossSigSeriesId,
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
        data-section="chart-line-cmo-zero-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineCmoZeroCrossSigChart(cleaned, { period, signalLength });

  const showPrice = !hidden.has('price');
  const showCmoLine = !hidden.has('cmo') && showCmo;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [-100, -50, 0, 50, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={
        ariaLabel ?? 'Chande Momentum Oscillator zero-line cross-sig chart'
      }
      aria-describedby={descId}
      data-section="chart-line-cmo-zero-cross-sig"
      data-period={period}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-none-count={layout.run.noneCount}
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
        data-section="chart-line-cmo-zero-cross-sig-title"
      >
        {ariaLabel ?? 'Chande Momentum Oscillator zero-line cross-sig chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-cmo-zero-cross-sig-aria-desc"
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
        data-section="chart-line-cmo-zero-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-cmo-zero-cross-sig-grid">
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
                  data-section="chart-line-cmo-zero-cross-sig-grid-line-price"
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
                  data-section="chart-line-cmo-zero-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-cmo-zero-cross-sig-axes">
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
                  data-section="chart-line-cmo-zero-cross-sig-tick-price"
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
                  data-section="chart-line-cmo-zero-cross-sig-tick-osc"
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
            data-section="chart-line-cmo-zero-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-cmo-zero-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-cmo-zero-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroLineY}
            x2={layout.innerRight}
            y2={layout.zeroLineY}
            stroke={zeroLineColor}
            strokeDasharray="4 3"
            data-section="chart-line-cmo-zero-cross-sig-zero-line"
          />
        ) : null}

        {showCmoLine ? (
          <path
            d={layout.cmoPath}
            stroke={cmoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cmo-zero-cross-sig-cmo-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-cmo-zero-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-cmo-zero-cross-sig-crosses"
            role="group"
            aria-label="CMO cross-sig trigger markers"
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
                aria-label={`${m.kind} CMO cross at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-cmo-zero-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-cmo-zero-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay CMO cross-sig trigger markers"
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
                data-section={`chart-line-cmo-zero-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-cmo-zero-cross-sig-hover-targets">
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
                data-section="chart-line-cmo-zero-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-cmo-zero-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={288}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-sig-tooltip-cmo"
                >
                  CMO{' '}
                  {tooltipSample.cmo == null
                    ? '--'
                    : formatOsc(tooltipSample.cmo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-sig-tooltip-signal"
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
                  data-section="chart-line-cmo-zero-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-sig-tooltip-counts"
                >
                  bull {layout.run.bullishCount} | bear{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-cmo-zero-cross-sig-tooltip-biases"
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
          data-section="chart-line-cmo-zero-cross-sig-badge"
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
          data-section="chart-line-cmo-zero-cross-sig-legend"
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
              { id: 'cmo' as const, color: cmoColor, label: 'CMO' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineCmoZeroCrossSigSeriesId;
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

ChartLineCmoZeroCrossSig.displayName = 'ChartLineCmoZeroCrossSig';
