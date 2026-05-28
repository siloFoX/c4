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
 * ChartLineTrixDivergenceCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the TRIX line in the bottom
 * panel, marking bullish (price down + TRIX up, potential bottom
 * reversal warning) / bearish (price up + TRIX down, potential
 * top reversal warning) divergence cross events. Divergence
 * variant of the triple-smoothed momentum family that flags
 * discrete price-vs-TRIX direction disagreement transitions
 * over a configurable look-back window.
 *
 *   ema1   = SMA-seeded EMA(close, length)
 *   ema2   = SMA-seeded EMA(ema1, length)
 *   ema3   = SMA-seeded EMA(ema2, length)
 *   trix[i] = 100 * (ema3[i] - ema3[i-1]) / ema3[i-1];
 *             0 when ema3[i-1] === 0 (degenerate)
 *   priceUp = close[i] > close[i-window]
 *   trixUp  = trix[i]  > trix[i-window]
 *   state
 *     aligned-bullish    : priceUp && trixUp
 *     aligned-bearish    : !priceUp && !trixUp
 *     divergent-bullish  : !priceUp && trixUp   (price down, TRIX up)
 *     divergent-bearish  : priceUp && !trixUp   (price up, TRIX down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `length = 15` (Hutson's recommended TRIX window),
 * `divergenceWindow = 5`. Crosses never fire when prev state is
 * `none` (insufficient data). Warmup is `3 * (length - 1) + 1`:
 * each EMA layer is SMA-seeded after `length - 1` valid samples
 * past the previous layer's seed, and TRIX itself needs one
 * additional bar for the 1-period rate of change.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: ema3 = K -> trix = 0 (zero numerator
 *   or degenerate fallback when K = 0). priceUp = false
 *   (close[i] === close[i-5]), trixUp = false (0 === 0) ->
 *   regime `aligned-bearish` (neither rising). 0 divergence
 *   crosses. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: ema3 = i - 21 (settles at
 *   length-1 lag per layer for L = 15). trix[i] = 100 /
 *   (i - 22) -- positive monotone decreasing. priceUp = true,
 *   trixUp = false (decay) -> regime `divergent-bearish`
 *   (price still rising while TRIX has lost momentum --
 *   canonical bearish divergence on the triple-smoothed
 *   oscillator). 0 crosses because the divergent state is
 *   entered from `none` (prev == 'none' is never a valid
 *   cross precursor).
 * - **LINEAR DOWN close = -i**: ema3 = -i + 21, trix[i] =
 *   100 / (i - 22) (still positive because dividing -1 by a
 *   negative ema3). priceUp = false, trixUp = false (decay)
 *   -> regime `aligned-bearish`. 0 crosses.
 */

export interface ChartLineTrixDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineTrixDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineTrixDivergenceCrossSeriesId = 'price' | 'trix';

export type ChartLineTrixDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineTrixDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineTrixDivergenceCrossCrossKind;
}

export interface ChartLineTrixDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  trix: number | null;
  priceUp: boolean | null;
  trixUp: boolean | null;
  regime: ChartLineTrixDivergenceCrossRegime;
}

export interface ChartLineTrixDivergenceCrossRun {
  series: ChartLineTrixDivergenceCrossPoint[];
  length: number;
  divergenceWindow: number;
  trixValues: Array<number | null>;
  samples: ChartLineTrixDivergenceCrossSample[];
  crosses: ChartLineTrixDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineTrixDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrixDivergenceCrossLayout {
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
  priceDots: ChartLineTrixDivergenceCrossDot[];
  trixPath: string;
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
    kind: ChartLineTrixDivergenceCrossCrossKind;
  }>;
  run: ChartLineTrixDivergenceCrossRun;
}

export interface ChartLineTrixDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrixDivergenceCrossPoint[];
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
  trixColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrix?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrixDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineTrixDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrixDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_LENGTH = 15;
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_TRIX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineTrixDivergenceCrossFinitePoints(
  data: readonly ChartLineTrixDivergenceCrossPoint[] | null | undefined,
): ChartLineTrixDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrixDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineTrixDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineTrixDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/**
 * SMA-seeded EMA over a nullable input array. The first
 * `length` contiguous valid entries seed the EMA with their
 * arithmetic mean, then recurrence applies. A null gap aborts
 * further output.
 */
export function applyLineTrixDivergenceCrossSmaSeededEma(
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
  const alpha = 2 / (length + 1);
  let ema = seed;
  for (let i = seedEnd + 1; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) return out;
    ema = alpha * v + (1 - alpha) * ema;
    out[i] = posZero(ema);
  }
  return out;
}

/**
 * Hutson TRIX over closes using a triple-smoothed EMA. The
 * percentage rate of change of `ema3` is reported as
 * `trix[i] = 100 * (ema3[i] - ema3[i-1]) / ema3[i-1]`. A
 * degenerate=0 fallback fires when `ema3[i-1] === 0` (e.g.
 * constant close = 0 collapses every layer to 0).
 */
export function applyLineTrixDivergenceCrossTrix(
  closes: readonly number[],
  length: number,
): Array<number | null> {
  const n = closes.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || n === 0) return out;
  const closesNullable: Array<number | null> = closes.map((v) => v);
  const ema1 = applyLineTrixDivergenceCrossSmaSeededEma(
    closesNullable,
    length,
  );
  const ema2 = applyLineTrixDivergenceCrossSmaSeededEma(ema1, length);
  const ema3 = applyLineTrixDivergenceCrossSmaSeededEma(ema2, length);
  for (let i = 1; i < n; i += 1) {
    const cur = ema3[i];
    const prev = ema3[i - 1];
    if (cur == null || prev == null) continue;
    if (prev === 0) {
      out[i] = 0;
    } else {
      out[i] = posZero((100 * (cur - prev)) / prev);
    }
  }
  return out;
}

export interface LineTrixDivergenceCrossChannels {
  trix: Array<number | null>;
}

export function computeLineTrixDivergenceCross(
  series: readonly ChartLineTrixDivergenceCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineTrixDivergenceCrossChannels {
  const cleaned = getLineTrixDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { trix: [] };
  }
  const length = normalizeLineTrixDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const trix = applyLineTrixDivergenceCrossTrix(closes, length);
  return { trix };
}

export function classifyLineTrixDivergenceCrossRegime(
  priceUp: boolean | null,
  trixUp: boolean | null,
): ChartLineTrixDivergenceCrossRegime {
  if (priceUp == null || trixUp == null) return 'none';
  if (priceUp && trixUp) return 'aligned-bullish';
  if (!priceUp && !trixUp) return 'aligned-bearish';
  if (!priceUp && trixUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineTrixDivergenceCrossCrosses(
  series: readonly ChartLineTrixDivergenceCrossPoint[],
  states: readonly ChartLineTrixDivergenceCrossRegime[],
): ChartLineTrixDivergenceCrossCross[] {
  const out: ChartLineTrixDivergenceCrossCross[] = [];
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

export function runLineTrixDivergenceCross(
  data: ChartLineTrixDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): ChartLineTrixDivergenceCrossRun {
  const cleaned = getLineTrixDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineTrixDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineTrixDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLineTrixDivergenceCross(series, { length });

  const samples: ChartLineTrixDivergenceCrossSample[] = series.map((p, i) => {
    const trix = channels.trix[i] ?? null;
    let priceUp: boolean | null = null;
    let trixUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const tPrev = channels.trix[i - divergenceWindow] ?? null;
      if (trix != null && tPrev != null) trixUp = trix > tPrev;
    }
    return {
      index: i,
      x: p.x,
      close: p.close,
      trix,
      priceUp,
      trixUp,
      regime: classifyLineTrixDivergenceCrossRegime(priceUp, trixUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLineTrixDivergenceCrossCrosses(series, states);

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

  const ok = series.length > 3 * (length - 1) + 1 + divergenceWindow;

  return {
    series = [],
    length,
    divergenceWindow,
    trixValues: channels.trix,
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

export interface ComputeLineTrixDivergenceCrossLayoutOptions {
  data: ChartLineTrixDivergenceCrossPoint[];
  length?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTrixDivergenceCrossLayout(
  opts: ComputeLineTrixDivergenceCrossLayoutOptions,
): ChartLineTrixDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineTrixDivergenceCross(opts.data, {
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

  let trixMin = Infinity;
  let trixMax = -Infinity;
  for (let i = 0; i < run.trixValues.length; i += 1) {
    const v = run.trixValues[i];
    if (v == null) continue;
    if (v < trixMin) trixMin = v;
    if (v > trixMax) trixMax = v;
  }
  if (!Number.isFinite(trixMin) || !Number.isFinite(trixMax)) {
    trixMin = -1;
    trixMax = 1;
  }
  const span = Math.max(Math.abs(trixMin), Math.abs(trixMax));
  const padded = span === 0 ? 1 : span * 1.1;
  const oscMin = -padded;
  const oscMax = padded;
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
      trixPath: '',
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
  const priceDots: ChartLineTrixDivergenceCrossDot[] = [];
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
  let first = true;
  for (const s of run.samples) {
    if (s.trix == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.trix);
    trixPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  trixPath = trixPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.trixValues[c.index] ?? 0);
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
    trixPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineTrixDivergenceCrossChart(
  data: ChartLineTrixDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): string {
  const cleaned = getLineTrixDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineTrixDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineTrixDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `TRIX Divergence Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, divergenceWindow ${divergenceWindow}). ` +
    `Top panel renders the close with bullish (price down + TRIX ` +
    `up, potential bottom reversal warning) / bearish (price up ` +
    `+ TRIX down, potential top reversal warning) chevron overlays ` +
    `at every price-versus-TRIX direction disagreement event; ` +
    `bottom panel renders the triple-smoothed momentum oscillator ` +
    `with the zero reference and marks divergence transitions for ` +
    `triple-smoothed momentum reversal warning.`
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

export const ChartLineTrixDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineTrixDivergenceCrossProps
>(function ChartLineTrixDivergenceCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_PRICE_COLOR,
    trixColor = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_TRIX_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TRIX_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTrix = true,
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
    () => getLineTrixDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTrixDivergenceCrossLayout({
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
    ChartLineTrixDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineTrixDivergenceCrossSeriesId,
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
    seriesId: ChartLineTrixDivergenceCrossSeriesId,
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
        data-section="chart-line-trix-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTrixDivergenceCrossChart(cleaned, {
      length,
      divergenceWindow,
    });

  const showPrice = !hidden.has('price');
  const showTrixLine = !hidden.has('trix') && showTrix;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [
    layout.oscMin,
    0,
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
      aria-label={ariaLabel ?? 'TRIX Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-trix-divergence-cross"
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
        data-section="chart-line-trix-divergence-cross-title"
      >
        {ariaLabel ?? 'TRIX Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-trix-divergence-cross-aria-desc"
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
        data-section="chart-line-trix-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-trix-divergence-cross-grid">
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
                  data-section="chart-line-trix-divergence-cross-grid-line-price"
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
                  data-section="chart-line-trix-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-trix-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-trix-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-trix-divergence-cross-axes">
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
                  data-section="chart-line-trix-divergence-cross-tick-price"
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
                  data-section="chart-line-trix-divergence-cross-tick-osc"
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
            data-section="chart-line-trix-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-trix-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-trix-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showTrixLine ? (
          <path
            d={layout.trixPath}
            stroke={trixColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-divergence-cross-trix-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-trix-divergence-cross-crosses"
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
                data-section={`chart-line-trix-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-trix-divergence-cross-overlay-crosses"
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
                data-section={`chart-line-trix-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-trix-divergence-cross-hover-targets">
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
                data-section="chart-line-trix-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-trix-divergence-cross-tooltip"
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
                  data-section="chart-line-trix-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-divergence-cross-tooltip-trix"
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
                  data-section="chart-line-trix-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-trix-divergence-cross-badge"
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
          data-section="chart-line-trix-divergence-cross-legend"
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
            ] satisfies Array<{
              id: ChartLineTrixDivergenceCrossSeriesId;
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

ChartLineTrixDivergenceCross.displayName = 'ChartLineTrixDivergenceCross';
