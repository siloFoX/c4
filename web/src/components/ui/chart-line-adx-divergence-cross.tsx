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
 * ChartLineAdxDivergenceCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the Average Directional Index
 * (ADX) line in the bottom panel, marking bullish (price down +
 * ADX up, potential bottom reversal warning when trend strength
 * is rising into a down move) / bearish (price up + ADX down,
 * potential top reversal warning when trend strength is fading
 * during an up move) divergence cross events. Divergence variant
 * of the directional movement family that flags discrete
 * price-vs-ADX direction disagreement transitions over a
 * configurable look-back window.
 *
 *   highMove[i]  = high[i] - high[i-1]
 *   lowMove[i]   = low[i-1] - low[i]
 *   plusDM[i]    = highMove > lowMove && highMove > 0 ? highMove : 0
 *   minusDM[i]   = lowMove  > highMove && lowMove > 0 ? lowMove  : 0
 *   tr[i]        = max(high - low,
 *                      |high - prevClose|,
 *                      |low  - prevClose|)
 *   smTr / smPlusDM / smMinusDM = SMA-seeded Wilder RMA over `length`
 *   plusDI[i]    = 100 * smPlusDM  / smTr   (0 when smTr === 0)
 *   minusDI[i]   = 100 * smMinusDM / smTr   (0 when smTr === 0)
 *   dx[i]        = 100 * |plusDI - minusDI| / (plusDI + minusDI);
 *                  0 when (plusDI + minusDI) === 0 (degenerate)
 *   adx[i]       = SMA-seeded Wilder RMA of dx over `length`
 *   priceUp      = close[i] > close[i-window]
 *   adxUp        = adx[i]   > adx[i-window]
 *   state
 *     aligned-bullish    : priceUp && adxUp
 *     aligned-bearish    : !priceUp && !adxUp
 *     divergent-bullish  : !priceUp && adxUp   (price down, ADX up)
 *     divergent-bearish  : priceUp && !adxUp   (price up, ADX down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `length = 14` (Wilder's canonical ADX window),
 * `divergenceWindow = 5`. Crosses never fire when prev state is
 * `none` (insufficient data). Warmup is `2 * length - 1`: the
 * directional indicators are smoothed at `length`, then DX feeds
 * into another `length`-bar Wilder RMA to produce ADX.
 *
 * Bit-exact anchor:
 *
 * - **CONST high = low = close = K**: TR = 0, +DM = -DM = 0 ->
 *   degenerate +DI = -DI = 0 -> degenerate DX = 0 -> ADX = 0.
 *   priceUp = false (close[i] === close[i-5]), adxUp = false
 *   (0 === 0) -> regime `aligned-bearish` (no trend strength).
 *   0 divergence crosses. Verified across K = 0..1234.
 * - **LINEAR UP high=i+1, low=i-1, close=i**: TR = 2, +DM = 1,
 *   -DM = 0 from i=1 onward. Smoothed +DI = 50, -DI = 0, DX =
 *   100 constant. ADX = 100 saturated. priceUp = true, adxUp =
 *   false (100 === 100) -> regime `divergent-bearish` (price
 *   still rising while ADX has saturated at its maximum --
 *   waning trend strength as an oscillator reading, canonical
 *   bearish divergence). 0 crosses because divergent state is
 *   entered from `none` (prev == 'none' is never a valid cross
 *   precursor).
 * - **LINEAR DOWN high=-i+1, low=-i-1, close=-i**: TR = 2,
 *   +DM = 0, -DM = 1 -> +DI = 0, -DI = 50, DX = 100, ADX = 100.
 *   priceUp = false, adxUp = false -> regime `aligned-bearish`.
 *   0 crosses.
 */

export interface ChartLineAdxDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAdxDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineAdxDivergenceCrossSeriesId = 'price' | 'adx';

export type ChartLineAdxDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineAdxDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineAdxDivergenceCrossCrossKind;
}

export interface ChartLineAdxDivergenceCrossSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  adx: number | null;
  priceUp: boolean | null;
  adxUp: boolean | null;
  regime: ChartLineAdxDivergenceCrossRegime;
}

export interface ChartLineAdxDivergenceCrossRun {
  series: ChartLineAdxDivergenceCrossPoint[];
  length: number;
  divergenceWindow: number;
  adxValues: Array<number | null>;
  samples: ChartLineAdxDivergenceCrossSample[];
  crosses: ChartLineAdxDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineAdxDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxDivergenceCrossLayout {
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
  priceDots: ChartLineAdxDivergenceCrossDot[];
  adxPath: string;
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
    kind: ChartLineAdxDivergenceCrossCrossKind;
  }>;
  run: ChartLineAdxDivergenceCrossRun;
}

export interface ChartLineAdxDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxDivergenceCrossPoint[];
  length?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  adxColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdx?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAdxDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_ADX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineAdxDivergenceCrossFinitePoints(
  data: readonly ChartLineAdxDivergenceCrossPoint[] | null | undefined,
): ChartLineAdxDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
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

export function normalizeLineAdxDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineAdxDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/**
 * SMA-seeded Wilder RMA over a nullable input array. The first
 * `length` contiguous valid entries seed the recurrence with
 * their arithmetic mean, then Wilder smoothing applies (`rma[i]
 * = rma[i-1] * (1 - 1/length) + value[i] / length`). A null gap
 * aborts further output.
 */
export function applyLineAdxDivergenceCrossSmaSeededRma(
  values: ReadonlyArray<number | null>,
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  let firstValidIdx = -1;
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] != null) {
      firstValidIdx = i;
      break;
    }
  }
  if (firstValidIdx === -1) return out;
  const seedEnd = firstValidIdx + length - 1;
  if (seedEnd >= values.length) return out;
  let sum = 0;
  for (let i = firstValidIdx; i <= seedEnd; i += 1) {
    const v = values[i];
    if (v == null) return out;
    sum += v;
  }
  const seed = sum / length;
  out[seedEnd] = posZero(seed);
  let rma = seed;
  const alpha = 1 / length;
  for (let i = seedEnd + 1; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) return out;
    rma = rma * (1 - alpha) + v * alpha;
    out[i] = posZero(rma);
  }
  return out;
}

/**
 * Wilder ADX from HLC inputs. Returns the smoothed average
 * directional index series with a Wilder RMA on directional
 * indicators and another Wilder RMA on DX. Returns 0 for the
 * degenerate cases where the +DI / -DI denominator is zero
 * (e.g. constant HLC inputs collapse every indicator to 0).
 */
export function applyLineAdxDivergenceCrossAdx(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  length: number,
): Array<number | null> {
  const n = Math.min(highs.length, lows.length, closes.length);
  const out: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || n < 2) return out;
  const tr: Array<number | null> = new Array(n).fill(null);
  const plusDm: Array<number | null> = new Array(n).fill(null);
  const minusDm: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const h = highs[i]!;
    const l = lows[i]!;
    const ph = highs[i - 1]!;
    const pl = lows[i - 1]!;
    const pc = closes[i - 1]!;
    const highMove = h - ph;
    const lowMove = pl - l;
    plusDm[i] = highMove > lowMove && highMove > 0 ? highMove : 0;
    minusDm[i] = lowMove > highMove && lowMove > 0 ? lowMove : 0;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  const smTr = applyLineAdxDivergenceCrossSmaSeededRma(tr, length);
  const smPlusDm = applyLineAdxDivergenceCrossSmaSeededRma(plusDm, length);
  const smMinusDm = applyLineAdxDivergenceCrossSmaSeededRma(minusDm, length);
  const dx: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const t = smTr[i];
    const p = smPlusDm[i];
    const m = smMinusDm[i];
    if (t == null || p == null || m == null) continue;
    if (t === 0) {
      dx[i] = 0;
      continue;
    }
    const plusDi = (100 * p) / t;
    const minusDi = (100 * m) / t;
    const sum = plusDi + minusDi;
    if (sum === 0) {
      dx[i] = 0;
    } else {
      dx[i] = posZero((100 * Math.abs(plusDi - minusDi)) / sum);
    }
  }
  const adx = applyLineAdxDivergenceCrossSmaSeededRma(dx, length);
  for (let i = 0; i < n; i += 1) {
    out[i] = adx[i];
  }
  return out;
}

export interface LineAdxDivergenceCrossChannels {
  adx: Array<number | null>;
}

export function computeLineAdxDivergenceCross(
  series: readonly ChartLineAdxDivergenceCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineAdxDivergenceCrossChannels {
  const cleaned = getLineAdxDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { adx: [] };
  }
  const length = normalizeLineAdxDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_LENGTH,
  );
  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  const closes = cleaned.map((p) => p.close);
  const adx = applyLineAdxDivergenceCrossAdx(highs, lows, closes, length);
  return { adx };
}

export function classifyLineAdxDivergenceCrossRegime(
  priceUp: boolean | null,
  adxUp: boolean | null,
): ChartLineAdxDivergenceCrossRegime {
  if (priceUp == null || adxUp == null) return 'none';
  if (priceUp && adxUp) return 'aligned-bullish';
  if (!priceUp && !adxUp) return 'aligned-bearish';
  if (!priceUp && adxUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineAdxDivergenceCrossCrosses(
  series: readonly ChartLineAdxDivergenceCrossPoint[],
  states: readonly ChartLineAdxDivergenceCrossRegime[],
): ChartLineAdxDivergenceCrossCross[] {
  const out: ChartLineAdxDivergenceCrossCross[] = [];
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

export function runLineAdxDivergenceCross(
  data: ChartLineAdxDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): ChartLineAdxDivergenceCrossRun {
  const cleaned = getLineAdxDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineAdxDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineAdxDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLineAdxDivergenceCross(series, { length });

  const samples: ChartLineAdxDivergenceCrossSample[] = series.map((p, i) => {
    const adx = channels.adx[i] ?? null;
    let priceUp: boolean | null = null;
    let adxUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const aPrev = channels.adx[i - divergenceWindow] ?? null;
      if (adx != null && aPrev != null) adxUp = adx > aPrev;
    }
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      adx,
      priceUp,
      adxUp,
      regime: classifyLineAdxDivergenceCrossRegime(priceUp, adxUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLineAdxDivergenceCrossCrosses(series, states);

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

  const ok = series.length > 2 * length - 1 + divergenceWindow;

  return {
    series,
    length,
    divergenceWindow,
    adxValues: channels.adx,
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

export interface ComputeLineAdxDivergenceCrossLayoutOptions {
  data: ChartLineAdxDivergenceCrossPoint[];
  length?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAdxDivergenceCrossLayout(
  opts: ComputeLineAdxDivergenceCrossLayoutOptions,
): ChartLineAdxDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineAdxDivergenceCross(opts.data, {
    length: opts.length ?? undefined,
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
      adxPath: '',
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
  const priceDots: ChartLineAdxDivergenceCrossDot[] = [];
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

  let adxPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.adx == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.adx);
    adxPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  adxPath = adxPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.adxValues[c.index] ?? 0);
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
    adxPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineAdxDivergenceCrossChart(
  data: ChartLineAdxDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): string {
  const cleaned = getLineAdxDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineAdxDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineAdxDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `ADX Divergence Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, divergenceWindow ${divergenceWindow}). ` +
    `Top panel renders the close with bullish (price down + ADX ` +
    `up, potential bottom reversal warning when trend strength is ` +
    `rising into a down move) / bearish (price up + ADX down, ` +
    `potential top reversal warning when trend strength is fading ` +
    `during an up move) chevron overlays at every price-versus-ADX ` +
    `direction disagreement event; bottom panel renders the Wilder ` +
    `Average Directional Index on a 0..100 oscillator and marks ` +
    `divergence transitions for trend strength reversal warning.`
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

export const ChartLineAdxDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineAdxDivergenceCrossProps
>(function ChartLineAdxDivergenceCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_PRICE_COLOR,
    adxColor = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_ADX_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ADX_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAdx = true,
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
    () => getLineAdxDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAdxDivergenceCrossLayout({
        data: cleaned,
        length,
        divergenceWindow,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      divergenceWindow,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAdxDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineAdxDivergenceCrossSeriesId,
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
    seriesId: ChartLineAdxDivergenceCrossSeriesId,
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
        data-section="chart-line-adx-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAdxDivergenceCrossChart(cleaned, {
      length,
      divergenceWindow,
    });

  const showPrice = !hidden.has('price');
  const showAdxLine = !hidden.has('adx') && showAdx;

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
      aria-label={ariaLabel ?? 'ADX Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-adx-divergence-cross"
      data-length={length}
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
        data-section="chart-line-adx-divergence-cross-title"
      >
        {ariaLabel ?? 'ADX Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-adx-divergence-cross-aria-desc"
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
        data-section="chart-line-adx-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-adx-divergence-cross-grid">
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
                  data-section="chart-line-adx-divergence-cross-grid-line-price"
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
                  data-section="chart-line-adx-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-adx-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-adx-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-adx-divergence-cross-axes">
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
                  data-section="chart-line-adx-divergence-cross-tick-price"
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
                  data-section="chart-line-adx-divergence-cross-tick-osc"
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
            data-section="chart-line-adx-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-adx-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-adx-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAdxLine ? (
          <path
            d={layout.adxPath}
            stroke={adxColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-divergence-cross-adx-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-adx-divergence-cross-crosses"
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
                data-section={`chart-line-adx-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-adx-divergence-cross-overlay-crosses"
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
                data-section={`chart-line-adx-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-adx-divergence-cross-hover-targets">
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
                data-section="chart-line-adx-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-adx-divergence-cross-tooltip"
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
                  data-section="chart-line-adx-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-divergence-cross-tooltip-adx"
                >
                  ADX{' '}
                  {tooltipSample.adx == null
                    ? '--'
                    : formatOsc(tooltipSample.adx)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-adx-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | window {divergenceWindow} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-adx-divergence-cross-legend"
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
              { id: 'adx' as const, color: adxColor, label: 'ADX' },
            ] satisfies Array<{
              id: ChartLineAdxDivergenceCrossSeriesId;
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

ChartLineAdxDivergenceCross.displayName = 'ChartLineAdxDivergenceCross';
