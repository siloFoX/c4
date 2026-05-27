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
 * ChartLineSchaffDivergenceCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Doug Schaff Trend
 * Cycle (STC) line in the bottom panel, marking bullish (price
 * down + STC up, potential bottom reversal warning) / bearish
 * (price up + STC down, potential top reversal warning)
 * divergence cross events. Divergence variant of the cycle-
 * momentum family that flags discrete price-vs-STC direction
 * disagreement transitions over a configurable look-back
 * window.
 *
 *   macd[i]   = SMA(close, fastLength) - SMA(close, slowLength)
 *   k1[i]     = 100 * (macd[i] - LLV(macd, cycle)) / (HHV - LLV);
 *               50 when HHV === LLV (degenerate fallback)
 *   d1[i]     = EMA(k1, factor)
 *   k2[i]     = 100 * (d1[i] - LLV(d1, cycle)) / (HHV - LLV);
 *               50 when HHV === LLV (degenerate fallback)
 *   stc[i]    = EMA(k2, factor)
 *   priceUp   = close[i] > close[i-window]
 *   stcUp     = stc[i]   > stc[i-window]
 *   state
 *     aligned-bullish    : priceUp && stcUp
 *     aligned-bearish    : !priceUp && !stcUp
 *     divergent-bullish  : !priceUp && stcUp   (price down, STC up)
 *     divergent-bearish  : priceUp && !stcUp   (price up, STC down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `fastLength = 23`, `slowLength = 50`,
 * `cycleLength = 10`, `factor = 0.5` (Schaff's canonical STC
 * tuning), `divergenceWindow = 5`. Crosses never fire when
 * prev state is `none` (insufficient data). Warmup =
 * slowLength + 2 * cycleLength - 3 = 67 because the SMA seeds
 * at slowLength - 1, two stochastic stages add `cycleLength
 * - 1` bars each, and the EMA chain inherits each prior
 * valid index.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: macd = 0 -> stochastic over a flat
 *   constant returns 50 (degenerate fallback) -> d1, k2, stc
 *   all collapse to 50. priceUp = false (close[i] ===
 *   close[i-5]), stcUp = false (50 === 50) -> regime
 *   `aligned-bearish` (no cycle to oscillate). 0 divergence
 *   crosses. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: fastSma[i] = i - 11, slowSma[i]
 *   = i - 24.5, macd = +13.5 constant -> stochastic on a
 *   constant returns 50 -> stc = 50 saturated. priceUp =
 *   true, stcUp = false -> regime `divergent-bearish` (price
 *   still rising while STC sits at the cycle midline -- no
 *   detectable trend cycle in a pure linear trend, canonical
 *   bearish divergence read of the cycle oscillator). 0
 *   crosses because divergent state is entered from `none`.
 * - **LINEAR DOWN close = -i**: macd = -13.5 constant -> stc
 *   = 50 saturated. priceUp = false, stcUp = false -> regime
 *   `aligned-bearish`. 0 crosses.
 */

export interface ChartLineSchaffDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineSchaffDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineSchaffDivergenceCrossSeriesId = 'price' | 'stc';

export type ChartLineSchaffDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineSchaffDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineSchaffDivergenceCrossCrossKind;
}

export interface ChartLineSchaffDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  stc: number | null;
  priceUp: boolean | null;
  stcUp: boolean | null;
  regime: ChartLineSchaffDivergenceCrossRegime;
}

export interface ChartLineSchaffDivergenceCrossRun {
  series: ChartLineSchaffDivergenceCrossPoint[];
  fastLength: number;
  slowLength: number;
  cycleLength: number;
  factor: number;
  divergenceWindow: number;
  stcValues: Array<number | null>;
  samples: ChartLineSchaffDivergenceCrossSample[];
  crosses: ChartLineSchaffDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineSchaffDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSchaffDivergenceCrossLayout {
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
  priceDots: ChartLineSchaffDivergenceCrossDot[];
  stcPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineSchaffDivergenceCrossCrossKind;
  }>;
  run: ChartLineSchaffDivergenceCrossRun;
}

export interface ChartLineSchaffDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSchaffDivergenceCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  cycleLength?: number;
  factor?: number;
  divergenceWindow?: number;
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
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStc?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSchaffDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineSchaffDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSchaffDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FAST_LENGTH = 23;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_SLOW_LENGTH = 50;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_CYCLE_LENGTH = 10;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FACTOR = 0.5;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_STC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_GRID_COLOR =
  '#e2e8f0';
export const DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_ZERO_COLOR =
  '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineSchaffDivergenceCrossFinitePoints(
  data: readonly ChartLineSchaffDivergenceCrossPoint[] | null | undefined,
): ChartLineSchaffDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSchaffDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineSchaffDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineSchaffDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

export function normalizeLineSchaffDivergenceCrossFactor(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0 && value <= 1) return value;
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineSchaffDivergenceCrossSma(
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

/** Rolling stochastic with degenerate=50 fallback. */
export function applyLineSchaffDivergenceCrossStochastic(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    let valid = true;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!valid) continue;
    const v = values[i]!;
    if (hi === lo) {
      out[i] = 50;
    } else {
      out[i] = posZero((100 * (v - lo)) / (hi - lo));
    }
  }
  return out;
}

/** EMA with first-valid seed; preserves nulls before seed. */
export function applyLineSchaffDivergenceCrossEma(
  values: readonly (number | null)[],
  factor: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  let ema: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) continue;
    if (ema == null) {
      ema = v;
    } else {
      ema = factor * v + (1 - factor) * ema;
    }
    out[i] = posZero(ema);
  }
  return out;
}

export interface LineSchaffDivergenceCrossChannels {
  macd: Array<number | null>;
  k1: Array<number | null>;
  d1: Array<number | null>;
  k2: Array<number | null>;
  stc: Array<number | null>;
}

export function computeLineSchaffDivergenceCross(
  series: readonly ChartLineSchaffDivergenceCrossPoint[] | null | undefined,
  options: {
    fastLength?: number;
    slowLength?: number;
    cycleLength?: number;
    factor?: number;
  } = {},
): LineSchaffDivergenceCrossChannels {
  const cleaned = getLineSchaffDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { macd: [], k1: [], d1: [], k2: [], stc: [] };
  }
  const fastLength = normalizeLineSchaffDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineSchaffDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  const cycleLength = normalizeLineSchaffDivergenceCrossLength(
    options.cycleLength,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_CYCLE_LENGTH,
  );
  const factor = normalizeLineSchaffDivergenceCrossFactor(
    options.factor,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FACTOR,
  );
  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const fastSma = applyLineSchaffDivergenceCrossSma(closes, fastLength);
  const slowSma = applyLineSchaffDivergenceCrossSma(closes, slowLength);
  const macd: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const f = fastSma[i];
    const s = slowSma[i];
    if (f != null && s != null) macd[i] = posZero(f - s);
  }
  const k1 = applyLineSchaffDivergenceCrossStochastic(macd, cycleLength);
  const d1 = applyLineSchaffDivergenceCrossEma(k1, factor);
  const k2 = applyLineSchaffDivergenceCrossStochastic(d1, cycleLength);
  const stc = applyLineSchaffDivergenceCrossEma(k2, factor);
  return { macd, k1, d1, k2, stc };
}

export function classifyLineSchaffDivergenceCrossRegime(
  priceUp: boolean | null,
  stcUp: boolean | null,
): ChartLineSchaffDivergenceCrossRegime {
  if (priceUp == null || stcUp == null) return 'none';
  if (priceUp && stcUp) return 'aligned-bullish';
  if (!priceUp && !stcUp) return 'aligned-bearish';
  if (!priceUp && stcUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineSchaffDivergenceCrossCrosses(
  series: readonly ChartLineSchaffDivergenceCrossPoint[],
  states: readonly ChartLineSchaffDivergenceCrossRegime[],
): ChartLineSchaffDivergenceCrossCross[] {
  const out: ChartLineSchaffDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = states[i - 1];
    const cur = states[i];
    if (prev === 'none' || cur === 'none') continue;
    if (prev !== 'divergent-bullish' && cur === 'divergent-bullish') {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (
      prev !== 'divergent-bearish' &&
      cur === 'divergent-bearish'
    ) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineSchaffDivergenceCross(
  data: ChartLineSchaffDivergenceCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    cycleLength?: number;
    factor?: number;
    divergenceWindow?: number;
  } = {},
): ChartLineSchaffDivergenceCrossRun {
  const cleaned = getLineSchaffDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineSchaffDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineSchaffDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  const cycleLength = normalizeLineSchaffDivergenceCrossLength(
    options.cycleLength,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_CYCLE_LENGTH,
  );
  const factor = normalizeLineSchaffDivergenceCrossFactor(
    options.factor,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FACTOR,
  );
  const divergenceWindow = normalizeLineSchaffDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLineSchaffDivergenceCross(series, {
    fastLength,
    slowLength,
    cycleLength,
    factor,
  });

  const samples: ChartLineSchaffDivergenceCrossSample[] = series.map(
    (p, i) => {
      const stc = channels.stc[i] ?? null;
      let priceUp: boolean | null = null;
      let stcUp: boolean | null = null;
      if (i >= divergenceWindow) {
        const cPrev = series[i - divergenceWindow]?.close;
        if (cPrev != null) priceUp = p.close > cPrev;
        const sPrev = channels.stc[i - divergenceWindow] ?? null;
        if (stc != null && sPrev != null) stcUp = stc > sPrev;
      }
      return {
        index: i,
        x: p.x,
        close: p.close,
        stc,
        priceUp,
        stcUp,
        regime: classifyLineSchaffDivergenceCrossRegime(priceUp, stcUp),
      };
    },
  );

  const states = samples.map((s) => s.regime);
  const crosses = detectLineSchaffDivergenceCrossCrosses(series, states);

  let alignedBullishCount = 0;
  let alignedBearishCount = 0;
  let divergentBullishCount = 0;
  let divergentBearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    switch (s.regime) {
      case 'aligned-bullish':
        alignedBullishCount += 1;
        break;
      case 'aligned-bearish':
        alignedBearishCount += 1;
        break;
      case 'divergent-bullish':
        divergentBullishCount += 1;
        break;
      case 'divergent-bearish':
        divergentBearishCount += 1;
        break;
      default:
        noneCount += 1;
    }
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const warmup = slowLength + 2 * cycleLength - 3;
  const ok = series.length > warmup + divergenceWindow;

  return {
    series,
    fastLength,
    slowLength,
    cycleLength,
    factor,
    divergenceWindow,
    stcValues: channels.stc,
    samples,
    crosses,
    alignedBullishCount,
    alignedBearishCount,
    divergentBullishCount,
    divergentBearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineSchaffDivergenceCrossLayoutOptions {
  data: ChartLineSchaffDivergenceCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  cycleLength?: number;
  factor?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSchaffDivergenceCrossLayout(
  opts: ComputeLineSchaffDivergenceCrossLayoutOptions,
): ChartLineSchaffDivergenceCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineSchaffDivergenceCross(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
    cycleLength: opts.cycleLength ?? undefined,
    factor: opts.factor ?? undefined,
    divergenceWindow: opts.divergenceWindow ?? undefined,
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
  const zeroY = syOscBase(0);

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
      zeroY,
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
  const priceDots: ChartLineSchaffDivergenceCrossDot[] = [];
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
    const cyOsc = syOscBase(run.stcValues[c.index] ?? 0);
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
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineSchaffDivergenceCrossChart(
  data: ChartLineSchaffDivergenceCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    cycleLength?: number;
    divergenceWindow?: number;
  } = {},
): string {
  const cleaned = getLineSchaffDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineSchaffDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineSchaffDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  const cycleLength = normalizeLineSchaffDivergenceCrossLength(
    options.cycleLength,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_CYCLE_LENGTH,
  );
  const divergenceWindow = normalizeLineSchaffDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `Schaff STC Divergence Cross chart over ${cleaned.length} bars ` +
    `(fast ${fastLength}, slow ${slowLength}, cycle ${cycleLength}, ` +
    `divergenceWindow ${divergenceWindow}). Top panel renders the ` +
    `close with bullish (price down + STC up, potential bottom ` +
    `reversal warning) / bearish (price up + STC down, potential ` +
    `top reversal warning) chevron overlays at every price-versus-` +
    `STC direction disagreement event; bottom panel renders the ` +
    `double-stochastic Schaff Trend Cycle on a 0..100 oscillator ` +
    `and marks divergence transitions for cycle-momentum reversal ` +
    `warning.`
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

export const ChartLineSchaffDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineSchaffDivergenceCrossProps
>(function ChartLineSchaffDivergenceCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_SLOW_LENGTH,
    cycleLength = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_CYCLE_LENGTH,
    factor = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_FACTOR,
    divergenceWindow = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_PRICE_COLOR,
    stcColor = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_STC_COLOR,
    bullishColor = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_SCHAFF_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStc = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showZero = true,
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
    () => getLineSchaffDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSchaffDivergenceCrossLayout({
        data: cleaned,
        fastLength,
        slowLength,
        cycleLength,
        factor,
        divergenceWindow,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      fastLength,
      slowLength,
      cycleLength,
      factor,
      divergenceWindow,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSchaffDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineSchaffDivergenceCrossSeriesId,
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
    seriesId: ChartLineSchaffDivergenceCrossSeriesId,
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
        data-section="chart-line-schaff-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSchaffDivergenceCrossChart(cleaned, {
      fastLength,
      slowLength,
      cycleLength,
      divergenceWindow,
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
  const tickOscValues: number[] = [0, 25, 50, 75, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Schaff STC Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-schaff-divergence-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-cycle-length={cycleLength}
      data-divergence-window={divergenceWindow}
      data-total-points={cleaned.length}
      data-aligned-bullish-count={layout.run.alignedBullishCount}
      data-aligned-bearish-count={layout.run.alignedBearishCount}
      data-divergent-bullish-count={layout.run.divergentBullishCount}
      data-divergent-bearish-count={layout.run.divergentBearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-schaff-divergence-cross-title"
      >
        {ariaLabel ?? 'Schaff STC Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-schaff-divergence-cross-aria-desc"
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
        data-section="chart-line-schaff-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-schaff-divergence-cross-grid">
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
                  data-section="chart-line-schaff-divergence-cross-grid-line-price"
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
                  data-section="chart-line-schaff-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-schaff-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-schaff-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-schaff-divergence-cross-axes">
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
                  data-section="chart-line-schaff-divergence-cross-tick-price"
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
                  data-section="chart-line-schaff-divergence-cross-tick-osc"
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
            data-section="chart-line-schaff-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-schaff-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-schaff-divergence-cross-price-dot"
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
            data-section="chart-line-schaff-divergence-cross-stc-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-schaff-divergence-cross-crosses"
            role="group"
            aria-label="divergence markers"
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
                aria-label={`${m.kind} divergence at ${formatX(m.x)}`}
                data-section={`chart-line-schaff-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-schaff-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay divergence markers"
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
                aria-label={`${m.kind} divergence overlay at ${formatX(m.x)}`}
                data-section={`chart-line-schaff-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-schaff-divergence-cross-hover-targets">
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
                data-section="chart-line-schaff-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-schaff-divergence-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-schaff-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-schaff-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-schaff-divergence-cross-tooltip-stc"
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
                  data-section="chart-line-schaff-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-schaff-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-schaff-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-schaff-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-schaff-divergence-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-schaff-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | cycle {cycleLength}{' '}
          | window {divergenceWindow} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-schaff-divergence-cross-legend"
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
              id: ChartLineSchaffDivergenceCrossSeriesId;
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

ChartLineSchaffDivergenceCross.displayName = 'ChartLineSchaffDivergenceCross';
