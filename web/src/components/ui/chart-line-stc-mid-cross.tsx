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
 * ChartLineStcMidCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only Schaff Trend Cycle
 * (STC) line in the bottom panel, marking bullish (cross up
 * through the 50 midline) / bearish (cross down through 50)
 * double-smoothed MACD cycle centerline regime transitions with
 * bias coloring. Midline-50 cross variant of the Doug Schaff
 * trend cycle family that flags the discrete STC crossing of the
 * neutral 50 centerline.
 *
 * STC takes the MACD line (`EMA(fast) - EMA(slow)`) and applies
 * a stochastic + smoothing pair twice, producing a fast, bounded
 * `[0, 100]` cycle oscillator. The midline (50) splits the cycle
 * into bullish-trend vs. bearish-trend halves -- cross markers
 * and price-panel chevrons inherit the bullish / bearish bias
 * coloring so the regime is visually obvious at the crossover
 * bar.
 *
 *   ema_fast_i = EMA(close, fast, SMA-seed)
 *   ema_slow_i = EMA(close, slow, SMA-seed)
 *   macd_i     = ema_fast_i - ema_slow_i
 *   // First pass
 *   k1_i = macd_high == macd_low
 *          ? prev_k1 (initial 50)
 *          : 100 * (macd - macd_low) / (macd_high - macd_low)
 *   d1_i = prev_d1 + 0.5 * (k1_i - prev_d1)       (initial 50)
 *   // Second pass
 *   k2_i = d1_high == d1_low
 *          ? prev_k2 (initial 50)
 *          : 100 * (d1 - d1_low) / (d1_high - d1_low)
 *   d2_i = prev_d2 + 0.5 * (k2_i - prev_d2)       (initial 50)
 *   stc_i = d2_i
 *   bullish : prev stc <= 50 && cur stc > 50
 *   bearish : prev stc >= 50 && cur stc < 50
 *
 * Defaults: `cycle = 10`, `fast = 23`, `slow = 50` (Schaff
 * canonical), `threshold = 50` (neutral centerline). Regime
 * classifier `bullish` (stc >= 50), `bearish` (stc < 50), `none`
 * (stc null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: ema_fast = ema_slow = K, macd = 0
 *   every bar. Both stochastic passes find macd_high ==
 *   macd_low and fall back to the seed (50). Smoothing of 50
 *   against the seed 50 stays at 50. stc = 50, regime `bullish`
 *   (stc >= 50). cross count = 0. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: after SMA-seed, both EMAs hit their
 *   exact steady-state lag, so `macd = constant`. The stochastic
 *   of a constant holds the seed, so stc = 50 (boundary). regime
 *   `bullish`. 0 crosses.
 * - **LINEAR DOWN close = -i**: same constant-MACD argument
 *   yields stc = 50. The directional information lives in the
 *   transient (decline-then-rise / rise-then-decline) patterns,
 *   where MACD passes through zero and the double-stochastic
 *   captures the cycle.
 */

export interface ChartLineStcMidCrossPoint {
  x: number;
  close: number;
}

export type ChartLineStcMidCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineStcMidCrossSeriesId = 'price' | 'stc';

export type ChartLineStcMidCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineStcMidCrossCross {
  index: number;
  x: number;
  kind: ChartLineStcMidCrossCrossKind;
}

export interface ChartLineStcMidCrossSample {
  index: number;
  x: number;
  close: number;
  stc: number | null;
  regime: ChartLineStcMidCrossRegime;
}

export interface ChartLineStcMidCrossRun {
  series: ChartLineStcMidCrossPoint[];
  cycle: number;
  fast: number;
  slow: number;
  threshold: number;
  stcValues: Array<number | null>;
  samples: ChartLineStcMidCrossSample[];
  crosses: ChartLineStcMidCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineStcMidCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStcMidCrossLayout {
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
  priceDots: ChartLineStcMidCrossDot[];
  stcPath: string;
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
    kind: ChartLineStcMidCrossCrossKind;
  }>;
  run: ChartLineStcMidCrossRun;
}

export interface ChartLineStcMidCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStcMidCrossPoint[];
  cycle?: number;
  fast?: number;
  slow?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  stcColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStc?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStcMidCrossSeriesId[];
  defaultHiddenSeries?: ChartLineStcMidCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStcMidCrossSeriesId;
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

export const DEFAULT_CHART_LINE_STC_MID_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_CYCLE = 10;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_FAST = 23;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_SLOW = 50;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_STC_MID_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_STC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STC_MID_CROSS_MID_COLOR = '#cbd5e1';

const SCHAFF_SEED = 50;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineStcMidCrossFinitePoints(
  data: readonly ChartLineStcMidCrossPoint[] | null | undefined,
): ChartLineStcMidCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStcMidCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineStcMidCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineStcMidCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/**
 * SMA-seeded EMA. SMA seed at index `length - 1`, then recursive
 * `prev + alpha * (cur - prev)` with `alpha = 2 / (length + 1)`.
 */
export function applyLineStcMidCrossEma(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      out[i] = posZero(values[i]!);
    }
    return out;
  }
  if (length - 1 >= values.length) return out;
  let sum = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let j = 0; j < length; j += 1) {
    const v = values[j]!;
    sum += v;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
  }
  let prev = winMin === winMax ? winMin : sum / length;
  out[length - 1] = posZero(prev);
  const alpha = 2 / (length + 1);
  for (let i = length; i < values.length; i += 1) {
    const v = values[i]!;
    prev = prev + alpha * (v - prev);
    out[i] = posZero(prev);
  }
  return out;
}

export interface LineStcMidCrossChannels {
  macd: Array<number | null>;
  k1: Array<number | null>;
  d1: Array<number | null>;
  k2: Array<number | null>;
  stc: Array<number | null>;
  cycle: number;
  fast: number;
  slow: number;
}

export function computeLineStcMidCross(
  series: readonly ChartLineStcMidCrossPoint[] | null | undefined,
  options: { cycle?: number; fast?: number; slow?: number } = {},
): LineStcMidCrossChannels {
  const cleaned = getLineStcMidCrossFinitePoints(series);
  const cycle = normalizeLineStcMidCrossLength(
    options.cycle,
    DEFAULT_CHART_LINE_STC_MID_CROSS_CYCLE,
  );
  const fast = normalizeLineStcMidCrossLength(
    options.fast,
    DEFAULT_CHART_LINE_STC_MID_CROSS_FAST,
  );
  const slow = normalizeLineStcMidCrossLength(
    options.slow,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SLOW,
  );
  if (cleaned.length === 0) {
    return { macd: [], k1: [], d1: [], k2: [], stc: [], cycle, fast, slow };
  }
  const n = cleaned.length;
  const closes = cleaned.map((p) => p.close);
  const emaFast = applyLineStcMidCrossEma(closes, fast);
  const emaSlow = applyLineStcMidCrossEma(closes, slow);

  const macd: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const a = emaFast[i];
    const b = emaSlow[i];
    if (a == null || b == null) continue;
    macd[i] = posZero(a - b);
  }

  // First stochastic / smoothing pass over the MACD.
  const k1: Array<number | null> = new Array(n).fill(null);
  const d1: Array<number | null> = new Array(n).fill(null);
  let prevK1 = SCHAFF_SEED;
  let prevD1 = SCHAFF_SEED;
  for (let i = 0; i < n; i += 1) {
    if (i < cycle - 1) continue;
    let winMin = Infinity;
    let winMax = -Infinity;
    let allValid = true;
    for (let j = i - cycle + 1; j <= i; j += 1) {
      const v = macd[j];
      if (v == null) {
        allValid = false;
        break;
      }
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!allValid) continue;
    const cur = macd[i]!;
    const range = winMax - winMin;
    const kVal = range === 0 ? prevK1 : 100 * ((cur - winMin) / range);
    k1[i] = posZero(kVal);
    const dVal = prevD1 + 0.5 * (kVal - prevD1);
    d1[i] = posZero(dVal);
    prevK1 = kVal;
    prevD1 = dVal;
  }

  // Second stochastic / smoothing pass over d1.
  const k2: Array<number | null> = new Array(n).fill(null);
  const stc: Array<number | null> = new Array(n).fill(null);
  let prevK2 = SCHAFF_SEED;
  let prevD2 = SCHAFF_SEED;
  for (let i = 0; i < n; i += 1) {
    if (i < cycle - 1) continue;
    let winMin = Infinity;
    let winMax = -Infinity;
    let allValid = true;
    for (let j = i - cycle + 1; j <= i; j += 1) {
      const v = d1[j];
      if (v == null) {
        allValid = false;
        break;
      }
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!allValid) continue;
    const cur = d1[i]!;
    const range = winMax - winMin;
    const kVal = range === 0 ? prevK2 : 100 * ((cur - winMin) / range);
    k2[i] = posZero(kVal);
    const dVal = prevD2 + 0.5 * (kVal - prevD2);
    stc[i] = posZero(dVal);
    prevK2 = kVal;
    prevD2 = dVal;
  }

  return { macd, k1, d1, k2, stc, cycle, fast, slow };
}

export function classifyLineStcMidCrossRegime(
  stc: number | null,
  threshold: number,
): ChartLineStcMidCrossRegime {
  if (stc == null) return 'none';
  if (stc >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineStcMidCrossCrosses(
  series: readonly ChartLineStcMidCrossPoint[],
  stc: readonly (number | null)[],
  threshold: number,
): ChartLineStcMidCrossCross[] {
  const out: ChartLineStcMidCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = stc[i - 1];
    const cur = stc[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineStcMidCross(
  data: ChartLineStcMidCrossPoint[],
  options: {
    cycle?: number;
    fast?: number;
    slow?: number;
    threshold?: number;
  } = {},
): ChartLineStcMidCrossRun {
  const cleaned = getLineStcMidCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineStcMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STC_MID_CROSS_THRESHOLD,
  );
  const channels = computeLineStcMidCross(series, {
    cycle: options.cycle ?? undefined,
    fast: options.fast ?? undefined,
    slow: options.slow ?? undefined,
  });

  const samples: ChartLineStcMidCrossSample[] = series.map((p, i) => {
    const v = channels.stc[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      stc: v,
      regime: classifyLineStcMidCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineStcMidCrossCrosses(
    series,
    channels.stc,
    threshold,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > channels.slow + 2 * channels.cycle;

  return {
    series,
    cycle: channels.cycle,
    fast: channels.fast,
    slow: channels.slow,
    threshold,
    stcValues: channels.stc,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineStcMidCrossLayoutOptions {
  data: ChartLineStcMidCrossPoint[];
  cycle?: number;
  fast?: number;
  slow?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStcMidCrossLayout(
  opts: ComputeLineStcMidCrossLayoutOptions,
): ChartLineStcMidCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_STC_MID_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_STC_MID_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_STC_MID_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_STC_MID_CROSS_PANEL_GAP;
  const threshold = normalizeLineStcMidCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_STC_MID_CROSS_THRESHOLD,
  );

  const run = runLineStcMidCross(opts.data, {
    cycle: opts.cycle ?? undefined,
    fast: opts.fast ?? undefined,
    slow: opts.slow ?? undefined,
    threshold,
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
  const thresholdY = syOscBase(threshold);

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
      stcPath: '',
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
  const priceDots: ChartLineStcMidCrossDot[] = [];
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

  let stcPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.stc == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.stc);
    stcPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  stcPath = stcPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.stcValues[c.index] ?? threshold);
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
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
    stcPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineStcMidCrossChart(
  data: ChartLineStcMidCrossPoint[],
  options: {
    cycle?: number;
    fast?: number;
    slow?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineStcMidCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const cycle = normalizeLineStcMidCrossLength(
    options.cycle,
    DEFAULT_CHART_LINE_STC_MID_CROSS_CYCLE,
  );
  const fast = normalizeLineStcMidCrossLength(
    options.fast,
    DEFAULT_CHART_LINE_STC_MID_CROSS_FAST,
  );
  const slow = normalizeLineStcMidCrossLength(
    options.slow,
    DEFAULT_CHART_LINE_STC_MID_CROSS_SLOW,
  );
  const threshold = normalizeLineStcMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STC_MID_CROSS_THRESHOLD,
  );
  return (
    `STC Mid Cross chart over ${cleaned.length} bars ` +
    `(cycle ${cycle}, fast ${fast}, slow ${slow}, threshold ` +
    `${threshold}). Top panel renders the close with bullish ` +
    `(double-smoothed MACD cycle centerline cross up) / bearish ` +
    `(cross down) chevron overlays at every Schaff Trend Cycle ` +
    `centerline crossover with bias coloring; bottom panel ` +
    `renders the close-only STC line on a fixed 0 to 100 ` +
    `oscillator with the centerline ${threshold} reference band ` +
    `and marks STC level ${threshold} centerline regime ` +
    `transition events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineStcMidCross = forwardRef<
  HTMLDivElement,
  ChartLineStcMidCrossProps
>(function ChartLineStcMidCross(props, ref): ReactNode {
  const {
    data,
    cycle = DEFAULT_CHART_LINE_STC_MID_CROSS_CYCLE,
    fast = DEFAULT_CHART_LINE_STC_MID_CROSS_FAST,
    slow = DEFAULT_CHART_LINE_STC_MID_CROSS_SLOW,
    threshold = DEFAULT_CHART_LINE_STC_MID_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_STC_MID_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_STC_MID_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_STC_MID_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_STC_MID_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STC_MID_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STC_MID_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STC_MID_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STC_MID_CROSS_PRICE_COLOR,
    stcColor = DEFAULT_CHART_LINE_STC_MID_CROSS_STC_COLOR,
    bullishColor = DEFAULT_CHART_LINE_STC_MID_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_STC_MID_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_STC_MID_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STC_MID_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_STC_MID_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStc = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
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
    () => getLineStcMidCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStcMidCrossLayout({
        data: cleaned,
        cycle,
        fast,
        slow,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      cycle,
      fast,
      slow,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStcMidCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineStcMidCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineStcMidCrossSeriesId,
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
        data-section="chart-line-stc-mid-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStcMidCrossChart(cleaned, {
      cycle,
      fast,
      slow,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showStcLine = !hidden.has('stc') && showStc;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, threshold, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'STC Mid Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-stc-mid-cross"
      data-cycle={cycle}
      data-fast={fast}
      data-slow={slow}
      data-threshold={threshold}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-stc-mid-cross-title"
      >
        {ariaLabel ?? 'STC Mid Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stc-mid-cross-aria-desc"
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
        data-section="chart-line-stc-mid-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stc-mid-cross-grid">
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
                  data-section="chart-line-stc-mid-cross-grid-line-price"
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
                  data-section="chart-line-stc-mid-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-stc-mid-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-stc-mid-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stc-mid-cross-axes">
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
                  data-section="chart-line-stc-mid-cross-tick-price"
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
                  data-section="chart-line-stc-mid-cross-tick-osc"
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
            data-section="chart-line-stc-mid-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stc-mid-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stc-mid-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showStcLine ? (
          <path
            d={layout.stcPath}
            stroke={stcColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stc-mid-cross-stc-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-stc-mid-cross-crosses"
            role="group"
            aria-label="cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-stc-mid-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-stc-mid-cross-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-stc-mid-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stc-mid-cross-hover-targets">
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
                data-section="chart-line-stc-mid-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stc-mid-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={244}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-tooltip-stc"
                >
                  STC{' '}
                  {tooltipSample.stc == null
                    ? '--'
                    : formatOsc(tooltipSample.stc)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-tooltip-cycle"
                >
                  cycle {layout.run.cycle} | f/s {layout.run.fast}/
                  {layout.run.slow}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stc-mid-cross-tooltip-threshold"
                >
                  threshold {layout.run.threshold}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-stc-mid-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          cycle {cycle} | fast {fast} | slow {slow} | threshold {threshold} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stc-mid-cross-legend"
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
              { id: 'stc' as const, color: stcColor, label: 'STC' },
            ] satisfies Array<{
              id: ChartLineStcMidCrossSeriesId;
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

ChartLineStcMidCross.displayName = 'ChartLineStcMidCross';
