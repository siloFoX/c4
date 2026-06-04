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
 * ChartLineFisherDivergenceCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Ehlers Fisher
 * Transform line in the bottom panel, marking bullish (price
 * down + Fisher up, potential bottom reversal warning) /
 * bearish (price up + Fisher down, potential top reversal
 * warning) divergence cross events. Divergence variant of the
 * Gaussian-normalised momentum family that flags discrete
 * price-vs-Fisher direction disagreement transitions over a
 * configurable look-back window.
 *
 *   minClose[i]  = min(close[i-length+1..i])
 *   maxClose[i]  = max(close[i-length+1..i])
 *   range[i]     = maxClose - minClose
 *   raw[i]       = 2 * (close[i] - minClose) / range - 1;
 *                  0 when range === 0 (degenerate fallback)
 *   clamped[i]   = clamp(raw[i], -clampLimit, clampLimit)
 *   fisher[i]    = atanh(clamped[i]) = 0.5 * ln((1+c)/(1-c))
 *   priceUp      = close[i]  > close[i-window]
 *   fisherUp     = fisher[i] > fisher[i-window]
 *   state
 *     aligned-bullish    : priceUp && fisherUp
 *     aligned-bearish    : !priceUp && !fisherUp
 *     divergent-bullish  : !priceUp && fisherUp  (price down, Fisher up)
 *     divergent-bearish  : priceUp && !fisherUp  (price up, Fisher down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `length = 9` (Ehlers' canonical Fisher window),
 * `divergenceWindow = 5`, `clampLimit = 0.999` (Ehlers'
 * clamp to avoid the atanh singularity at +/-1). Crosses never
 * fire when prev state is `none` (insufficient data). Warmup
 * is `length - 1`: the rolling min/max needs `length` valid
 * closes to seed.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: minClose = maxClose = K -> range = 0
 *   -> raw = 0 (degenerate fallback) -> fisher = atanh(0) = 0.
 *   priceUp = false (close[i] === close[i-5]), fisherUp =
 *   false (0 === 0) -> regime `aligned-bearish` (no momentum
 *   to normalise). 0 divergence crosses. Verified across
 *   K = 0..1234.
 * - **LINEAR UP close = i**: minClose[i] = i-8, maxClose[i] =
 *   i, range = 8 -> raw = 2 * 8/8 - 1 = 1 -> clamped to 0.999
 *   -> fisher = atanh(0.999) constant. priceUp = true,
 *   fisherUp = false (constant -> not strictly greater) ->
 *   regime `divergent-bearish` (price still rising while
 *   Fisher has saturated -- canonical bearish divergence on
 *   the Gaussian-normalised oscillator). 0 crosses because
 *   the divergent state is entered from `none`.
 * - **LINEAR DOWN close = -i**: raw = -1 -> clamped to
 *   -0.999 -> fisher = -atanh(0.999) constant. priceUp =
 *   false, fisherUp = false -> regime `aligned-bearish`.
 *   0 crosses.
 */

export interface ChartLineFisherDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineFisherDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineFisherDivergenceCrossSeriesId = 'price' | 'fisher';

export type ChartLineFisherDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineFisherDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineFisherDivergenceCrossCrossKind;
}

export interface ChartLineFisherDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  fisher: number | null;
  priceUp: boolean | null;
  fisherUp: boolean | null;
  regime: ChartLineFisherDivergenceCrossRegime;
}

export interface ChartLineFisherDivergenceCrossRun {
  series: ChartLineFisherDivergenceCrossPoint[];
  length: number;
  divergenceWindow: number;
  clampLimit: number;
  fisherValues: Array<number | null>;
  samples: ChartLineFisherDivergenceCrossSample[];
  crosses: ChartLineFisherDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineFisherDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineFisherDivergenceCrossLayout {
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
  priceDots: ChartLineFisherDivergenceCrossDot[];
  fisherPath: string;
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
    kind: ChartLineFisherDivergenceCrossCrossKind;
  }>;
  run: ChartLineFisherDivergenceCrossRun;
}

export interface ChartLineFisherDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFisherDivergenceCrossPoint[];
  length?: number;
  divergenceWindow?: number;
  clampLimit?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  fisherColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFisher?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFisherDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineFisherDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineFisherDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_LENGTH = 9;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_CLAMP_LIMIT = 0.999;
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_FISHER_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_GRID_COLOR =
  '#e2e8f0';
export const DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_ZERO_COLOR =
  '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineFisherDivergenceCrossFinitePoints(
  data: readonly ChartLineFisherDivergenceCrossPoint[] | null | undefined,
): ChartLineFisherDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFisherDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineFisherDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineFisherDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

export function normalizeLineFisherDivergenceCrossClamp(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0 && value < 1) return value;
  return fallback;
}

/**
 * Ehlers Fisher Transform over closes with rolling min/max
 * normalisation. The input is mapped to [-1, 1] via
 * `2 * (close - min) / (max - min) - 1`, clamped to
 * `[-clampLimit, clampLimit]` to avoid the atanh singularity,
 * and then transformed through atanh. A degenerate=0 fallback
 * fires when the rolling range collapses to 0 (e.g. constant
 * close where every value equals the rolling min and max).
 */
export function applyLineFisherDivergenceCrossFisher(
  closes: readonly number[],
  length: number,
  clampLimit: number,
): Array<number | null> {
  const n = closes.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || n === 0) return out;
  for (let i = length - 1; i < n; i += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const c = closes[j]!;
      if (c < lo) lo = c;
      if (c > hi) hi = c;
    }
    const range = hi - lo;
    let raw: number;
    if (range === 0) {
      raw = 0;
    } else {
      raw = (2 * (closes[i]! - lo)) / range - 1;
    }
    const clamped = Math.max(-clampLimit, Math.min(clampLimit, raw));
    out[i] = posZero(Math.atanh(clamped));
  }
  return out;
}

export interface LineFisherDivergenceCrossChannels {
  fisher: Array<number | null>;
}

export function computeLineFisherDivergenceCross(
  series: readonly ChartLineFisherDivergenceCrossPoint[] | null | undefined,
  options: { length?: number; clampLimit?: number } = {},
): LineFisherDivergenceCrossChannels {
  const cleaned = getLineFisherDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { fisher: [] };
  }
  const length = normalizeLineFisherDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_LENGTH,
  );
  const clampLimit = normalizeLineFisherDivergenceCrossClamp(
    options.clampLimit,
    DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_CLAMP_LIMIT,
  );
  const closes = cleaned.map((p) => p.close);
  const fisher = applyLineFisherDivergenceCrossFisher(
    closes,
    length,
    clampLimit,
  );
  return { fisher };
}

export function classifyLineFisherDivergenceCrossRegime(
  priceUp: boolean | null,
  fisherUp: boolean | null,
): ChartLineFisherDivergenceCrossRegime {
  if (priceUp == null || fisherUp == null) return 'none';
  if (priceUp && fisherUp) return 'aligned-bullish';
  if (!priceUp && !fisherUp) return 'aligned-bearish';
  if (!priceUp && fisherUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineFisherDivergenceCrossCrosses(
  series: readonly ChartLineFisherDivergenceCrossPoint[],
  states: readonly ChartLineFisherDivergenceCrossRegime[],
): ChartLineFisherDivergenceCrossCross[] {
  const out: ChartLineFisherDivergenceCrossCross[] = [];
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

export function runLineFisherDivergenceCross(
  data: ChartLineFisherDivergenceCrossPoint[],
  options: {
    length?: number;
    divergenceWindow?: number;
    clampLimit?: number;
  } = {},
): ChartLineFisherDivergenceCrossRun {
  const cleaned = getLineFisherDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineFisherDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineFisherDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WINDOW,
  );
  const clampLimit = normalizeLineFisherDivergenceCrossClamp(
    options.clampLimit,
    DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_CLAMP_LIMIT,
  );

  const channels = computeLineFisherDivergenceCross(series, {
    length,
    clampLimit,
  });

  const samples: ChartLineFisherDivergenceCrossSample[] = series.map(
    (p, i) => {
      const fisher = channels.fisher[i] ?? null;
      let priceUp: boolean | null = null;
      let fisherUp: boolean | null = null;
      if (i >= divergenceWindow) {
        const cPrev = series[i - divergenceWindow]?.close;
        if (cPrev != null) priceUp = p.close > cPrev;
        const fPrev = channels.fisher[i - divergenceWindow] ?? null;
        if (fisher != null && fPrev != null) fisherUp = fisher > fPrev;
      }
      return {
        index: i,
        x: p.x,
        close: p.close,
        fisher,
        priceUp,
        fisherUp,
        regime: classifyLineFisherDivergenceCrossRegime(priceUp, fisherUp),
      };
    },
  );

  const states = samples.map((s) => s.regime);
  const crosses = detectLineFisherDivergenceCrossCrosses(series, states);

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

  const ok = series.length > length - 1 + divergenceWindow;

  return {
    series,
    length,
    divergenceWindow,
    clampLimit,
    fisherValues: channels.fisher,
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

export interface ComputeLineFisherDivergenceCrossLayoutOptions {
  data: ChartLineFisherDivergenceCrossPoint[];
  length?: number;
  divergenceWindow?: number;
  clampLimit?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineFisherDivergenceCrossLayout(
  opts: ComputeLineFisherDivergenceCrossLayoutOptions,
): ChartLineFisherDivergenceCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineFisherDivergenceCross(opts.data, {
    length: opts.length ?? undefined,
    divergenceWindow: opts.divergenceWindow ?? undefined,
    clampLimit: opts.clampLimit ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  const clampAtanh = Math.atanh(run.clampLimit);
  const oscPadded = clampAtanh === 0 ? 1 : clampAtanh * 1.1;
  const oscMin = -oscPadded;
  const oscMax = oscPadded;
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
      fisherPath: '',
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
  const priceDots: ChartLineFisherDivergenceCrossDot[] = [];
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

  let fisherPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.fisher == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.fisher);
    fisherPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  fisherPath = fisherPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.fisherValues[c.index] ?? 0);
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
    fisherPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineFisherDivergenceCrossChart(
  data: ChartLineFisherDivergenceCrossPoint[],
  options: {
    length?: number;
    divergenceWindow?: number;
    clampLimit?: number;
  } = {},
): string {
  const cleaned = getLineFisherDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineFisherDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineFisherDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `Fisher Divergence Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, divergenceWindow ${divergenceWindow}). Top ` +
    `panel renders the close with bullish (price down + Fisher up, ` +
    `potential bottom reversal warning) / bearish (price up + Fisher ` +
    `down, potential top reversal warning) chevron overlays at every ` +
    `price-versus-Fisher direction disagreement event; bottom panel ` +
    `renders the Gaussian-normalised Ehlers Fisher Transform and marks ` +
    `divergence transitions for normalised momentum reversal warning.`
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

export const ChartLineFisherDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineFisherDivergenceCrossProps
>(function ChartLineFisherDivergenceCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WINDOW,
    clampLimit = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_CLAMP_LIMIT,
    width = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_PRICE_COLOR,
    fisherColor = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_FISHER_COLOR,
    bullishColor = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_FISHER_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFisher = true,
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
    () => getLineFisherDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineFisherDivergenceCrossLayout({
        data: cleaned,
        length,
        divergenceWindow,
        clampLimit,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      divergenceWindow,
      clampLimit,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineFisherDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineFisherDivergenceCrossSeriesId,
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
    seriesId: ChartLineFisherDivergenceCrossSeriesId,
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
        data-section="chart-line-fisher-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineFisherDivergenceCrossChart(cleaned, {
      length,
      divergenceWindow,
      clampLimit,
    });

  const showPrice = !hidden.has('price');
  const showFisherLine = !hidden.has('fisher') && showFisher;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, 0, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Fisher Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-fisher-divergence-cross"
      data-length={length}
      data-divergence-window={divergenceWindow}
      data-clamp-limit={clampLimit}
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
        data-section="chart-line-fisher-divergence-cross-title"
      >
        {ariaLabel ?? 'Fisher Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-fisher-divergence-cross-aria-desc"
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
        data-section="chart-line-fisher-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-fisher-divergence-cross-grid">
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
                  data-section="chart-line-fisher-divergence-cross-grid-line-price"
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
                  data-section="chart-line-fisher-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-fisher-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-fisher-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-fisher-divergence-cross-axes">
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
                  data-section="chart-line-fisher-divergence-cross-tick-price"
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
                  data-section="chart-line-fisher-divergence-cross-tick-osc"
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
            data-section="chart-line-fisher-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-fisher-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-fisher-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showFisherLine ? (
          <path
            d={layout.fisherPath}
            stroke={fisherColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fisher-divergence-cross-fisher-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-fisher-divergence-cross-crosses"
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
                data-section={`chart-line-fisher-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-fisher-divergence-cross-overlay-crosses"
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
                data-section={`chart-line-fisher-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-fisher-divergence-cross-hover-targets">
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
                data-section="chart-line-fisher-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-fisher-divergence-cross-tooltip"
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
                  data-section="chart-line-fisher-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-divergence-cross-tooltip-fisher"
                >
                  Fisher{' '}
                  {tooltipSample.fisher == null
                    ? '--'
                    : formatOsc(tooltipSample.fisher)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fisher-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-fisher-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | window {divergenceWindow} | clamp {clampLimit}{' '}
          | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-fisher-divergence-cross-legend"
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
              { id: 'fisher' as const, color: fisherColor, label: 'Fisher' },
            ] satisfies Array<{
              id: ChartLineFisherDivergenceCrossSeriesId;
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

ChartLineFisherDivergenceCross.displayName = 'ChartLineFisherDivergenceCross';
