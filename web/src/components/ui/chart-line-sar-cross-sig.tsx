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
 * ChartLineSarCrossSig -- pure-SVG dual-panel chart with the
 * close in the top panel and the Wilder Parabolic SAR with a
 * smoothed signal line in the bottom panel, marking bullish
 * (SAR crosses up through signal -- trailing stop confirms
 * uptrend; SAR is pulling above its smoothed mean) / bearish
 * (SAR crosses down through signal -- trailing stop confirms
 * downtrend; SAR is pulling below its smoothed mean)
 * SAR-vs-signal crossover trigger events with bias coloring
 * derived from the (SAR - signal) slope at the trigger bar.
 *
 *   nextSar  = sar + af * (ep - sar)              (Wilder)
 *   clamp    = min/max with prev one or two values to keep
 *              SAR from crossing recent price
 *   reverse  = price pierces nextSar -> trend flips, SAR
 *              jumps to ep, ep := price, af := step
 *   signal[i] = SMA(SAR, signalLength)
 *
 *   bullish (SAR-cross up) :
 *     prev sar <= prev signal && cur sar > cur signal
 *   bearish (SAR-cross down) :
 *     prev sar >= prev signal && cur sar < cur signal
 *
 *   regime   : 'bullish' when sar >= signal
 *              'bearish' when sar <  signal
 *              'none'    when either is null
 *   bias     : (sar - signal)[i] vs prev -> up/down/flat/none
 *
 * Defaults: step = 0.02, maxStep = 0.2, signalLength = 9 --
 * canonical Wilder SAR tuning paired with the cross-sig
 * family convention SMA(indicator, 9) signal line.
 *
 * SAR semantics: the Wilder Parabolic SAR (Stop And Reverse)
 * is a trailing stop line that pulls upward in uptrends
 * (SAR below price) and downward in downtrends (SAR above
 * price). When SAR rises faster than its smoothed average,
 * the trailing stop is tightening upward, confirming
 * uptrend strength. When SAR falls faster, the trailing
 * stop is dropping, confirming downtrend strength. Crosses
 * of SAR vs its SMA signal therefore flag trailing stop
 * confirmation trigger events.
 *
 * Sibling family (SAR signal family):
 *   - chart-line-parabolic-sar -- raw SAR with reversal
 *     markers
 *   - chart-line-psar-cross-pct v1.11.x -- SAR vs close
 *     percent threshold
 *   - chart-line-supertrend-cross-sig v1.11.x -- analogous
 *     trailing-stop cross-sig (Supertrend instead of SAR)
 *   - this primitive: SAR vs SMA(SAR) -- trailing stop
 *     confirmation
 *
 * Warmup is `signalLength` for the signal line: the SMA
 * window needs `signalLength` consecutive SAR samples
 * before the first signal value emerges. Cross detection
 * needs the previous bar's SAR and signal, so the first
 * potential cross lands at i = signalLength.
 *
 * Bit-exact anchors (single-value input):
 *
 * - **CONST** `value = K`: First move = 0, initial trend
 *   'up' (>=). SAR stays at K (af*(ep-sar) = af*0 = 0
 *   forever, no piercing). signal = SMA(K) = K. SAR ===
 *   signal every bar -> no cross. regime `bullish` (via
 *   >=). 0 crosses. Verified across K in {0, 1, 50, 200,
 *   1234}.
 * - **LINEAR UP** `value = i`: First move +1, trend 'up'.
 *   SAR rises but is clamped by recent values, trailing as
 *   a slow-moving lower envelope. signal = SMA(SAR) trails
 *   further behind. SAR >= signal throughout. 0 crosses
 *   (no transition from below). regime `bullish`.
 * - **LINEAR DOWN** `value = -i`: First move -1, trend
 *   'down'. SAR falls clamped by recent values, trailing
 *   as a slow-moving upper envelope. signal = SMA(SAR)
 *   trails further. SAR <= signal throughout. 0 crosses
 *   (no transition from above). regime `bearish`.
 */

export type ChartLineSarCrossSigTrend = 'up' | 'down';

export interface ChartLineSarCrossSigPoint {
  x: number;
  value: number;
}

export type ChartLineSarCrossSigRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineSarCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineSarCrossSigSeriesId = 'price' | 'sar' | 'signal';

export type ChartLineSarCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineSarCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineSarCrossSigCrossKind;
  bias: ChartLineSarCrossSigBias;
}

export interface ChartLineSarCrossSigSample {
  index: number;
  x: number;
  value: number;
  sar: number | null;
  signal: number | null;
  diff: number | null;
  trend: ChartLineSarCrossSigTrend | null;
  reversed: boolean;
  regime: ChartLineSarCrossSigRegime;
  bias: ChartLineSarCrossSigBias;
}

export interface ChartLineSarCrossSigRun {
  series: ChartLineSarCrossSigPoint[];
  step: number;
  maxStep: number;
  signalLength: number;
  sarValues: Array<number | null>;
  signalValues: Array<number | null>;
  diffValues: Array<number | null>;
  samples: ChartLineSarCrossSigSample[];
  crosses: ChartLineSarCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  reversalCount: number;
  ok: boolean;
}

export interface ChartLineSarCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineSarCrossSigLayout {
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
  priceDots: ChartLineSarCrossSigDot[];
  sarPath: string;
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
    kind: ChartLineSarCrossSigCrossKind;
    bias: ChartLineSarCrossSigBias;
  }>;
  run: ChartLineSarCrossSigRun;
}

export interface ChartLineSarCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSarCrossSigPoint[];
  step?: number;
  maxStep?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  sarColor?: string;
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
  showSar?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSarCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineSarCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSarCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_STEP = 0.02;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_MAX_STEP = 0.2;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_SAR_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SAR_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineSarCrossSigFinitePoints(
  data: readonly ChartLineSarCrossSigPoint[] | null | undefined,
): ChartLineSarCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSarCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

export function normalizeLineSarCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineSarCrossSigStep(
  value: unknown,
  fallback: number,
): number {
  return isFiniteNumber(value) && value > 0 ? value : fallback;
}

export interface ComputeLineSarCrossSigResult {
  sar: Array<number | null>;
  signal: Array<number | null>;
  trends: Array<ChartLineSarCrossSigTrend | null>;
  reversed: boolean[];
}

export function computeLineSarCrossSig(
  series: readonly ChartLineSarCrossSigPoint[] | null | undefined,
  options: { step?: number; maxStep?: number; signalLength?: number } = {},
): ComputeLineSarCrossSigResult {
  const cleaned = getLineSarCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { sar: [], signal: [], trends: [], reversed: [] };
  }
  const step = normalizeLineSarCrossSigStep(
    options.step,
    DEFAULT_CHART_LINE_SAR_CROSS_SIG_STEP,
  );
  const maxStep = Math.max(
    step,
    normalizeLineSarCrossSigStep(
      options.maxStep,
      DEFAULT_CHART_LINE_SAR_CROSS_SIG_MAX_STEP,
    ),
  );
  const signalLength = normalizeLineSarCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_SAR_CROSS_SIG_SIGNAL_LENGTH,
  );

  const n = cleaned.length;
  const sar: Array<number | null> = new Array(n).fill(null);
  const trends: Array<ChartLineSarCrossSigTrend | null> = new Array(n).fill(
    null,
  );
  const reversed: boolean[] = new Array(n).fill(false);

  if (n < 2) {
    return { sar, signal: new Array(n).fill(null), trends, reversed };
  }

  const values = cleaned.map((p) => p.value);
  let trend: ChartLineSarCrossSigTrend =
    values[1]! >= values[0]! ? 'up' : 'down';
  let af = step;
  let curSar = values[0]!;
  let ep = values[0]!;

  sar[0] = posZero(curSar);
  trends[0] = trend;

  for (let i = 1; i < n; i += 1) {
    const v = values[i]!;
    let nextSar = curSar + af * (ep - curSar);
    let didReverse = false;

    if (trend === 'up') {
      nextSar = Math.min(nextSar, values[i - 1]!);
      if (i >= 2) nextSar = Math.min(nextSar, values[i - 2]!);
      if (v < nextSar) {
        didReverse = true;
        trend = 'down';
        nextSar = ep;
        ep = v;
        af = step;
      } else if (v > ep) {
        ep = v;
        af = Math.min(af + step, maxStep);
      }
    } else {
      nextSar = Math.max(nextSar, values[i - 1]!);
      if (i >= 2) nextSar = Math.max(nextSar, values[i - 2]!);
      if (v > nextSar) {
        didReverse = true;
        trend = 'up';
        nextSar = ep;
        ep = v;
        af = step;
      } else if (v < ep) {
        ep = v;
        af = Math.min(af + step, maxStep);
      }
    }

    curSar = nextSar;
    sar[i] = posZero(curSar);
    trends[i] = trend;
    reversed[i] = didReverse;
  }

  const signal: Array<number | null> = new Array(n).fill(null);
  for (let i = signalLength - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - signalLength + 1; j <= i; j += 1) {
      const s = sar[j];
      if (s == null) {
        valid = false;
        break;
      }
      sum += s;
      if (s < winMin) winMin = s;
      if (s > winMax) winMax = s;
    }
    if (!valid) continue;
    signal[i] = winMin === winMax ? winMin : posZero(sum / signalLength);
  }

  return { sar, signal, trends, reversed };
}

export function classifyLineSarCrossSigRegime(
  sar: number | null,
  signal: number | null,
): ChartLineSarCrossSigRegime {
  if (sar == null || signal == null) return 'none';
  if (sar >= signal) return 'bullish';
  return 'bearish';
}

export function classifyLineSarCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineSarCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineSarCrossSigCrosses(
  series: readonly ChartLineSarCrossSigPoint[],
  sarValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineSarCrossSigCross[] {
  const out: ChartLineSarCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pS = sarValues[i - 1];
    const pSig = signalValues[i - 1];
    const cS = sarValues[i];
    const cSig = signalValues[i];
    if (pS == null || pSig == null || cS == null || cSig == null) continue;
    const prevDiff = pS - pSig;
    const curDiff = cS - cSig;
    const bias = classifyLineSarCrossSigBias(curDiff, prevDiff);
    if (pS <= pSig && cS > cSig) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pS >= pSig && cS < cSig) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineSarCrossSig(
  data: ChartLineSarCrossSigPoint[],
  options: { step?: number; maxStep?: number; signalLength?: number } = {},
): ChartLineSarCrossSigRun {
  const cleaned = getLineSarCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const step = normalizeLineSarCrossSigStep(
    options.step,
    DEFAULT_CHART_LINE_SAR_CROSS_SIG_STEP,
  );
  const maxStep = Math.max(
    step,
    normalizeLineSarCrossSigStep(
      options.maxStep,
      DEFAULT_CHART_LINE_SAR_CROSS_SIG_MAX_STEP,
    ),
  );
  const signalLength = normalizeLineSarCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_SAR_CROSS_SIG_SIGNAL_LENGTH,
  );

  const { sar: sarValues, signal: signalValues, trends, reversed } =
    computeLineSarCrossSig(series, { step, maxStep, signalLength });

  const diffValues: Array<number | null> = series.map((_, i) => {
    const s = sarValues[i] ?? null;
    const g = signalValues[i] ?? null;
    if (s == null || g == null) return null;
    return posZero(s - g);
  });

  const samples: ChartLineSarCrossSigSample[] = series.map((p, i) => {
    const sar = sarValues[i] ?? null;
    const signal = signalValues[i] ?? null;
    const diff = diffValues[i] ?? null;
    const prevDiff = i > 0 ? (diffValues[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      sar,
      signal,
      diff,
      trend: trends[i] ?? null,
      reversed: reversed[i] ?? false,
      regime: classifyLineSarCrossSigRegime(sar, signal),
      bias: classifyLineSarCrossSigBias(diff, prevDiff),
    };
  });

  const crosses = detectLineSarCrossSigCrosses(
    series,
    sarValues,
    signalValues,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  let reversalCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
    if (s.bias === 'up') upBiasCount += 1;
    else if (s.bias === 'down') downBiasCount += 1;
    else if (s.bias === 'flat') flatBiasCount += 1;
    if (s.reversed) reversalCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > signalLength;

  return {
    series,
    step,
    maxStep,
    signalLength,
    sarValues,
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
    reversalCount,
    ok,
  };
}

export interface ComputeLineSarCrossSigLayoutOptions {
  data: ChartLineSarCrossSigPoint[];
  step?: number;
  maxStep?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSarCrossSigLayout(
  opts: ComputeLineSarCrossSigLayoutOptions,
): ChartLineSarCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_SAR_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_SAR_CROSS_SIG_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_SAR_CROSS_SIG_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_SAR_CROSS_SIG_PANEL_GAP;

  const run = runLineSarCrossSig(opts.data, {
    step: opts.step ?? undefined,
    maxStep: opts.maxStep ?? undefined,
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

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
      sarPath: '',
      signalPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: 0,
      oscMax: 0,
      crossMarkers: [],
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.value < priceMin) priceMin = s.value;
    if (s.value > priceMax) priceMax = s.value;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.sar != null) {
      if (s.sar < oscMin) oscMin = s.sar;
      if (s.sar > oscMax) oscMax = s.sar;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = priceMin;
    oscMax = priceMax;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineSarCrossSigDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.value);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      value: s.value,
    });
  }

  let sarPath = '';
  let firstSar = true;
  for (const s of run.samples) {
    if (s.sar == null) {
      firstSar = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.sar);
    sarPath += `${firstSar ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstSar = false;
  }
  sarPath = sarPath.trim();

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
    const cyPrice = samp ? syPrice(samp.value) : priceBottom;
    const sAt = run.sarValues[c.index];
    const cyOsc = sAt != null ? syOsc(sAt) : oscBottom;
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
    sarPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineSarCrossSigChart(
  data: ChartLineSarCrossSigPoint[],
  options: { step?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineSarCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const step = normalizeLineSarCrossSigStep(
    options.step,
    DEFAULT_CHART_LINE_SAR_CROSS_SIG_STEP,
  );
  const signalLength = normalizeLineSarCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_SAR_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `Parabolic SAR vs signal cross-sig chart over ` +
    `${cleaned.length} bars (step ${step}, signal ` +
    `${signalLength}). Top panel renders the close with ` +
    `bullish (SAR crosses up through signal, trailing stop ` +
    `confirms uptrend) / bearish (SAR crosses down through ` +
    `signal, trailing stop confirms downtrend) chevron ` +
    `overlays at every trailing stop confirmation trigger ` +
    `event; bottom panel renders J. Welles Wilder Jr's ` +
    `Parabolic SAR (Stop And Reverse) with its smoothed SMA ` +
    `signal line, markers coloured by (SAR - signal) slope ` +
    `bias (rising / falling / flat) at the trigger bar.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineSarCrossSigCrossKind,
  bias: ChartLineSarCrossSigBias,
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

export const ChartLineSarCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineSarCrossSigProps
>(function ChartLineSarCrossSig(props, ref): ReactNode {
  const {
    data,
    step = DEFAULT_CHART_LINE_SAR_CROSS_SIG_STEP,
    maxStep = DEFAULT_CHART_LINE_SAR_CROSS_SIG_MAX_STEP,
    signalLength = DEFAULT_CHART_LINE_SAR_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_SAR_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_SAR_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_SAR_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_SAR_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SAR_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SAR_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SAR_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_PRICE_COLOR,
    sarColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_SAR_COLOR,
    signalColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_SIGNAL_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SAR_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSar = true,
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
    () => getLineSarCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSarCrossSigLayout({
        data: cleaned,
        step,
        maxStep,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      step,
      maxStep,
      signalLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSarCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineSarCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineSarCrossSigSeriesId,
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
        data-section="chart-line-sar-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSarCrossSigChart(cleaned, { step, signalLength });

  const showPrice = !hidden.has('price');
  const showSarLine = !hidden.has('sar') && showSar;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Parabolic SAR vs signal cross-sig chart'}
      aria-describedby={descId}
      data-section="chart-line-sar-cross-sig"
      data-step={step}
      data-max-step={maxStep}
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
      data-reversal-count={layout.run.reversalCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-sar-cross-sig-title"
      >
        {ariaLabel ?? 'Parabolic SAR vs signal cross-sig chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-sar-cross-sig-aria-desc"
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
        data-section="chart-line-sar-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-sar-cross-sig-grid">
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
                  data-section="chart-line-sar-cross-sig-grid-line-price"
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
                  data-section="chart-line-sar-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-sar-cross-sig-axes">
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
                  data-section="chart-line-sar-cross-sig-tick-price"
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
                  data-section="chart-line-sar-cross-sig-tick-osc"
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
            data-section="chart-line-sar-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-sar-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-sar-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSarLine ? (
          <path
            d={layout.sarPath}
            stroke={sarColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-sar-cross-sig-sar-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-sar-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-sar-cross-sig-crosses"
            role="group"
            aria-label="SAR cross-sig trigger markers"
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
                aria-label={`${m.kind} SAR cross at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-sar-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-sar-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay SAR cross-sig trigger markers"
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
                data-section={`chart-line-sar-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-sar-cross-sig-hover-targets">
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
                data-section="chart-line-sar-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-sar-cross-sig-tooltip"
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
                  data-section="chart-line-sar-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sar-cross-sig-tooltip-value"
                >
                  value {formatPrice(tooltipSample.value)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sar-cross-sig-tooltip-sar"
                >
                  SAR{' '}
                  {tooltipSample.sar == null
                    ? '--'
                    : formatOsc(tooltipSample.sar)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sar-cross-sig-tooltip-signal"
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
                  data-section="chart-line-sar-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sar-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sar-cross-sig-tooltip-counts"
                >
                  bull {layout.run.bullishCount} | bear{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sar-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sar-cross-sig-tooltip-reversals"
                >
                  reversals {layout.run.reversalCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-sar-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          step {step} | signal {signalLength} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-sar-cross-sig-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'value' },
              { id: 'sar' as const, color: sarColor, label: 'SAR' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineSarCrossSigSeriesId;
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

ChartLineSarCrossSig.displayName = 'ChartLineSarCrossSig';
