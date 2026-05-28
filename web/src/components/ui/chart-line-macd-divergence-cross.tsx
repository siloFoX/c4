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
 * ChartLineMacdDivergenceCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the close-only MACD-style
 * fast-vs-slow SMA difference line in the bottom panel, marking
 * bullish (price down + MACD up, potential bottom reversal
 * warning) / bearish (price up + MACD down, potential top
 * reversal warning) divergence cross events. Divergence variant
 * of the MACD family that flags discrete price-vs-MACD direction
 * disagreement transitions over a configurable look-back window
 * -- the canonical reversal-warning signal analysts pair with
 * support/resistance for swing-trade entries.
 *
 *   fastSma  = SMA(close, fastLength)
 *   slowSma  = SMA(close, slowLength)
 *   macd[i]  = fastSma[i] - slowSma[i]
 *   priceUp  = close[i] > close[i-window]
 *   macdUp   = macd[i]  > macd[i-window]
 *   state
 *     aligned-bullish    : priceUp && macdUp
 *     aligned-bearish    : !priceUp && !macdUp
 *     divergent-bullish  : !priceUp && macdUp   (price down, MACD up)
 *     divergent-bearish  : priceUp && !macdUp   (price up, MACD down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `fastLength = 12`, `slowLength = 26` (canonical MACD
 * SMA windows -- SMA chosen over EMA so the line difference is
 * deterministic for testing), `divergenceWindow = 5`. Crosses
 * never fire when prev state is `none` (insufficient data).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: fastSma = slowSma = K -> macd = 0
 *   constant. priceUp = false (close[i] === close[i-5]), macdUp
 *   = false (macd[i] === macd[i-5]) -> regime `aligned-bearish`
 *   (neither side rising). 0 divergence crosses.
 * - **LINEAR UP close = i**: fastSma = i - 5.5, slowSma = i -
 *   12.5, macd = 7 constant for i >= 25. priceUp = true (close[i]
 *   > close[i-5]), macdUp = false (7 === 7) -> regime
 *   `divergent-bearish` (price still rising while MACD has
 *   flattened -- waning momentum, canonical bearish divergence).
 *   0 crosses because divergent state is entered from `none`
 *   (prev == 'none' is never a valid cross precursor).
 * - **LINEAR DOWN close = -i**: macd = -7 constant. priceUp =
 *   false, macdUp = false -> regime `aligned-bearish`. 0 crosses.
 */

export interface ChartLineMacdDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineMacdDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineMacdDivergenceCrossSeriesId = 'price' | 'macd';

export type ChartLineMacdDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineMacdDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineMacdDivergenceCrossCrossKind;
}

export interface ChartLineMacdDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  macd: number | null;
  priceUp: boolean | null;
  macdUp: boolean | null;
  regime: ChartLineMacdDivergenceCrossRegime;
}

export interface ChartLineMacdDivergenceCrossRun {
  series: ChartLineMacdDivergenceCrossPoint[];
  fastLength: number;
  slowLength: number;
  divergenceWindow: number;
  macdValues: Array<number | null>;
  samples: ChartLineMacdDivergenceCrossSample[];
  crosses: ChartLineMacdDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineMacdDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMacdDivergenceCrossLayout {
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
  priceDots: ChartLineMacdDivergenceCrossDot[];
  macdPath: string;
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
    kind: ChartLineMacdDivergenceCrossCrossKind;
  }>;
  run: ChartLineMacdDivergenceCrossRun;
}

export interface ChartLineMacdDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMacdDivergenceCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  macdColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMacd?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMacdDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineMacdDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMacdDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_FAST_LENGTH = 12;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_SLOW_LENGTH = 26;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_MACD_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineMacdDivergenceCrossFinitePoints(
  data:
    | readonly ChartLineMacdDivergenceCrossPoint[]
    | null
    | undefined,
): ChartLineMacdDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMacdDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineMacdDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer window (>= 1). */
export function normalizeLineMacdDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineMacdDivergenceCrossSma(
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

export interface LineMacdDivergenceCrossChannels {
  fastSma: Array<number | null>;
  slowSma: Array<number | null>;
  macd: Array<number | null>;
}

export function computeLineMacdDivergenceCross(
  series:
    | readonly ChartLineMacdDivergenceCrossPoint[]
    | null
    | undefined,
  options: { fastLength?: number; slowLength?: number } = {},
): LineMacdDivergenceCrossChannels {
  const cleaned = getLineMacdDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { fastSma: [], slowSma: [], macd: [] };
  }
  const fastLength = normalizeLineMacdDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_SLOW_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const fastSma = applyLineMacdDivergenceCrossSma(closes, fastLength);
  const slowSma = applyLineMacdDivergenceCrossSma(closes, slowLength);

  const macd: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const f = fastSma[i];
    const s = slowSma[i];
    if (f == null || s == null) continue;
    macd[i] = posZero(f - s);
  }
  return { fastSma, slowSma, macd };
}

export function classifyLineMacdDivergenceCrossRegime(
  priceUp: boolean | null,
  macdUp: boolean | null,
): ChartLineMacdDivergenceCrossRegime {
  if (priceUp == null || macdUp == null) return 'none';
  if (priceUp && macdUp) return 'aligned-bullish';
  if (!priceUp && !macdUp) return 'aligned-bearish';
  if (!priceUp && macdUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineMacdDivergenceCrossCrosses(
  series: readonly ChartLineMacdDivergenceCrossPoint[],
  states: readonly ChartLineMacdDivergenceCrossRegime[],
): ChartLineMacdDivergenceCrossCross[] {
  const out: ChartLineMacdDivergenceCrossCross[] = [];
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

export function runLineMacdDivergenceCross(
  data: ChartLineMacdDivergenceCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    divergenceWindow?: number;
  } = {},
): ChartLineMacdDivergenceCrossRun {
  const cleaned = getLineMacdDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineMacdDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  const divergenceWindow = normalizeLineMacdDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLineMacdDivergenceCross(series, {
    fastLength,
    slowLength,
  });

  const samples: ChartLineMacdDivergenceCrossSample[] = series.map((p, i) => {
    const macd = channels.macd[i] ?? null;
    let priceUp: boolean | null = null;
    let macdUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const mCur = macd;
      const mPrev = channels.macd[i - divergenceWindow] ?? null;
      if (mCur != null && mPrev != null) macdUp = mCur > mPrev;
    }
    return {
      index: i,
      x: p.x,
      close: p.close,
      macd,
      priceUp,
      macdUp,
      regime: classifyLineMacdDivergenceCrossRegime(priceUp, macdUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLineMacdDivergenceCrossCrosses(series, states);

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

  const ok = series.length > slowLength + divergenceWindow - 1;

  return {
    series = [],
    fastLength,
    slowLength,
    divergenceWindow,
    macdValues: channels.macd,
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

export interface ComputeLineMacdDivergenceCrossLayoutOptions {
  data: ChartLineMacdDivergenceCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMacdDivergenceCrossLayout(
  opts: ComputeLineMacdDivergenceCrossLayoutOptions,
): ChartLineMacdDivergenceCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineMacdDivergenceCross(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
    divergenceWindow: opts.divergenceWindow ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let macdMin = Infinity;
  let macdMax = -Infinity;
  for (const v of run.macdValues) {
    if (v == null) continue;
    if (v < macdMin) macdMin = v;
    if (v > macdMax) macdMax = v;
  }
  let oscMin: number;
  let oscMax: number;
  if (!Number.isFinite(macdMin) || !Number.isFinite(macdMax)) {
    oscMin = -1;
    oscMax = 1;
  } else {
    const lo = Math.min(macdMin, 0);
    const hi = Math.max(macdMax, 0);
    if (lo === hi) {
      oscMin = -1;
      oscMax = 1;
    } else {
      const span = Math.max(Math.abs(lo), Math.abs(hi));
      oscMin = -span * 1.1;
      oscMax = span * 1.1;
    }
  }
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
      macdPath: '',
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
  const priceDots: ChartLineMacdDivergenceCrossDot[] = [];
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

  let macdPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.macd == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.macd);
    macdPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  macdPath = macdPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.macdValues[c.index] ?? 0);
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
    macdPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineMacdDivergenceCrossChart(
  data: ChartLineMacdDivergenceCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    divergenceWindow?: number;
  } = {},
): string {
  const cleaned = getLineMacdDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineMacdDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  const divergenceWindow = normalizeLineMacdDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `MACD Divergence Cross chart over ${cleaned.length} bars ` +
    `(fastLength ${fastLength}, slowLength ${slowLength}, ` +
    `divergenceWindow ${divergenceWindow}). Top panel renders the ` +
    `close with bullish (price down + MACD up, potential bottom ` +
    `reversal warning) / bearish (price up + MACD down, potential ` +
    `top reversal warning) chevron overlays at every price-versus- ` +
    `MACD direction disagreement event; bottom panel renders the ` +
    `close-only MACD-style fast-vs-slow SMA difference line on a ` +
    `symmetric oscillator with the zero reference and marks ` +
    `divergence transitions for reversal warning.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 3);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineMacdDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineMacdDivergenceCrossProps
>(function ChartLineMacdDivergenceCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_SLOW_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_PRICE_COLOR,
    macdColor = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_MACD_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_MACD_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMacd = true,
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
    () => getLineMacdDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMacdDivergenceCrossLayout({
        data: cleaned,
        fastLength,
        slowLength,
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
      divergenceWindow,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineMacdDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineMacdDivergenceCrossSeriesId,
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
    seriesId: ChartLineMacdDivergenceCrossSeriesId,
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
        data-section="chart-line-macd-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMacdDivergenceCrossChart(cleaned, {
      fastLength,
      slowLength,
      divergenceWindow,
    });

  const showPrice = !hidden.has('price');
  const showMacdLine = !hidden.has('macd') && showMacd;

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
      aria-label={ariaLabel ?? 'MACD Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-macd-divergence-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
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
        data-section="chart-line-macd-divergence-cross-title"
      >
        {ariaLabel ?? 'MACD Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-macd-divergence-cross-aria-desc"
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
        data-section="chart-line-macd-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-macd-divergence-cross-grid">
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
                  data-section="chart-line-macd-divergence-cross-grid-line-price"
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
                  data-section="chart-line-macd-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-macd-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-macd-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-macd-divergence-cross-axes">
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
                  data-section="chart-line-macd-divergence-cross-tick-price"
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
                  data-section="chart-line-macd-divergence-cross-tick-osc"
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
            data-section="chart-line-macd-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-macd-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-macd-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMacdLine ? (
          <path
            d={layout.macdPath}
            stroke={macdColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-macd-divergence-cross-macd-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-macd-divergence-cross-crosses"
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
                data-section={`chart-line-macd-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-macd-divergence-cross-overlay-crosses"
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
                data-section={`chart-line-macd-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-macd-divergence-cross-hover-targets">
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
                data-section="chart-line-macd-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-macd-divergence-cross-tooltip"
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
                  data-section="chart-line-macd-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-divergence-cross-tooltip-macd"
                >
                  MACD{' '}
                  {tooltipSample.macd == null
                    ? '--'
                    : formatOsc(tooltipSample.macd)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-macd-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | window {divergenceWindow} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-macd-divergence-cross-legend"
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
              { id: 'macd' as const, color: macdColor, label: 'MACD' },
            ] satisfies Array<{
              id: ChartLineMacdDivergenceCrossSeriesId;
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

ChartLineMacdDivergenceCross.displayName = 'ChartLineMacdDivergenceCross';
