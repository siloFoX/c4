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
 * ChartLineDpoDivergenceCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Detrended Price
 * Oscillator (DPO) line in the bottom panel, marking bullish
 * (price down + DPO up, potential bottom reversal warning) /
 * bearish (price up + DPO down, potential top reversal warning)
 * divergence cross events. Divergence variant of the detrended
 * momentum family that flags discrete price-vs-DPO direction
 * disagreement transitions over a configurable look-back window.
 *
 *   shift       = floor(length / 2) + 1
 *   sma[i]      = SMA(close[i-length+1..i], length)
 *   dpo[i]      = close[i - shift] - sma[i]
 *   priceUp     = close[i] > close[i-window]
 *   dpoUp       = dpo[i]   > dpo[i-window]
 *   state
 *     aligned-bullish    : priceUp && dpoUp
 *     aligned-bearish    : !priceUp && !dpoUp
 *     divergent-bullish  : !priceUp && dpoUp   (price down, DPO up)
 *     divergent-bearish  : priceUp && !dpoUp   (price up, DPO down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `length = 20` (Vitali Apollonio's canonical DPO
 * window), `divergenceWindow = 5`. Crosses never fire when prev
 * state is `none` (insufficient data). Warmup is `length - 1`:
 * the rolling SMA needs `length` valid closes; the shifted
 * close lookup needs `shift = 11` history bars, both satisfied
 * once SMA is valid.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: close[i - shift] = K, sma = K ->
 *   dpo = 0. priceUp = false (close[i] === close[i-5]),
 *   dpoUp = false (0 === 0) -> regime `aligned-bearish` (no
 *   detrended momentum). 0 divergence crosses. Verified
 *   across K = 0..1234.
 * - **LINEAR UP close = i**: sma[i] = i - 9.5 (centred lag of
 *   (length - 1) / 2 = 9.5 bars), close[i-11] = i - 11, dpo
 *   = -1.5 constant negative. priceUp = true, dpoUp = false
 *   (-1.5 === -1.5) -> regime `divergent-bearish` (price
 *   still rising while DPO is parked at a constant negative
 *   reading -- the bias the centred SMA produces relative to
 *   a steady-trending price, canonical bearish divergence
 *   read). 0 crosses because divergent state is entered from
 *   `none`.
 * - **LINEAR DOWN close = -i**: sma[i] = -i + 9.5,
 *   close[i-11] = -i + 11, dpo = +1.5 constant. priceUp =
 *   false, dpoUp = false (1.5 === 1.5) -> regime
 *   `aligned-bearish`. 0 crosses.
 */

export interface ChartLineDpoDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineDpoDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineDpoDivergenceCrossSeriesId = 'price' | 'dpo';

export type ChartLineDpoDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineDpoDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineDpoDivergenceCrossCrossKind;
}

export interface ChartLineDpoDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  dpo: number | null;
  priceUp: boolean | null;
  dpoUp: boolean | null;
  regime: ChartLineDpoDivergenceCrossRegime;
}

export interface ChartLineDpoDivergenceCrossRun {
  series: ChartLineDpoDivergenceCrossPoint[];
  length: number;
  shift: number;
  divergenceWindow: number;
  dpoValues: Array<number | null>;
  samples: ChartLineDpoDivergenceCrossSample[];
  crosses: ChartLineDpoDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineDpoDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDpoDivergenceCrossLayout {
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
  priceDots: ChartLineDpoDivergenceCrossDot[];
  dpoPath: string;
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
    kind: ChartLineDpoDivergenceCrossCrossKind;
  }>;
  run: ChartLineDpoDivergenceCrossRun;
}

export interface ChartLineDpoDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDpoDivergenceCrossPoint[];
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
  dpoColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDpo?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDpoDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineDpoDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDpoDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_LENGTH = 20;
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_DPO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineDpoDivergenceCrossFinitePoints(
  data: readonly ChartLineDpoDivergenceCrossPoint[] | null | undefined,
): ChartLineDpoDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDpoDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineDpoDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineDpoDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/** Canonical DPO shift = floor(length / 2) + 1. */
export function lineDpoDivergenceCrossShift(length: number): number {
  return Math.floor(length / 2) + 1;
}

/**
 * Simple moving average of closes over `length` bars. Returns
 * null for indices that lack a full window of history.
 */
export function applyLineDpoDivergenceCrossSma(
  closes: readonly number[],
  length: number,
): Array<number | null> {
  const n = closes.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || n < length) return out;
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += closes[i]!;
  out[length - 1] = posZero(sum / length);
  for (let i = length; i < n; i += 1) {
    sum += closes[i]! - closes[i - length]!;
    out[i] = posZero(sum / length);
  }
  return out;
}

/**
 * Detrended Price Oscillator: dpo[i] = close[i - shift] -
 * sma[i] with shift = floor(length / 2) + 1. The shift looks
 * back to remove the bulk of the SMA's centred lag so that
 * the residual tracks short-term momentum around the trend.
 * Returns null until the SMA has seeded and the shifted close
 * index is in range.
 */
export function applyLineDpoDivergenceCrossDpo(
  closes: readonly number[],
  length: number,
): Array<number | null> {
  const n = closes.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || n < length) return out;
  const shift = lineDpoDivergenceCrossShift(length);
  const sma = applyLineDpoDivergenceCrossSma(closes, length);
  for (let i = 0; i < n; i += 1) {
    const s = sma[i];
    if (s == null) continue;
    if (i < shift) continue;
    const c = closes[i - shift];
    if (c == null) continue;
    out[i] = posZero(c - s);
  }
  return out;
}

export interface LineDpoDivergenceCrossChannels {
  dpo: Array<number | null>;
}

export function computeLineDpoDivergenceCross(
  series: readonly ChartLineDpoDivergenceCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineDpoDivergenceCrossChannels {
  const cleaned = getLineDpoDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { dpo: [] };
  }
  const length = normalizeLineDpoDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const dpo = applyLineDpoDivergenceCrossDpo(closes, length);
  return { dpo };
}

export function classifyLineDpoDivergenceCrossRegime(
  priceUp: boolean | null,
  dpoUp: boolean | null,
): ChartLineDpoDivergenceCrossRegime {
  if (priceUp == null || dpoUp == null) return 'none';
  if (priceUp && dpoUp) return 'aligned-bullish';
  if (!priceUp && !dpoUp) return 'aligned-bearish';
  if (!priceUp && dpoUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineDpoDivergenceCrossCrosses(
  series: readonly ChartLineDpoDivergenceCrossPoint[],
  states: readonly ChartLineDpoDivergenceCrossRegime[],
): ChartLineDpoDivergenceCrossCross[] {
  const out: ChartLineDpoDivergenceCrossCross[] = [];
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

export function runLineDpoDivergenceCross(
  data: ChartLineDpoDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): ChartLineDpoDivergenceCrossRun {
  const cleaned = getLineDpoDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineDpoDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineDpoDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WINDOW,
  );
  const shift = lineDpoDivergenceCrossShift(length);

  const channels = computeLineDpoDivergenceCross(series, { length });

  const samples: ChartLineDpoDivergenceCrossSample[] = series.map((p, i) => {
    const dpo = channels.dpo[i] ?? null;
    let priceUp: boolean | null = null;
    let dpoUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const dPrev = channels.dpo[i - divergenceWindow] ?? null;
      if (dpo != null && dPrev != null) dpoUp = dpo > dPrev;
    }
    return {
      index: i,
      x: p.x,
      close: p.close,
      dpo,
      priceUp,
      dpoUp,
      regime: classifyLineDpoDivergenceCrossRegime(priceUp, dpoUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLineDpoDivergenceCrossCrosses(series, states);

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
    series = [],
    length,
    shift,
    divergenceWindow,
    dpoValues: channels.dpo,
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

export interface ComputeLineDpoDivergenceCrossLayoutOptions {
  data: ChartLineDpoDivergenceCrossPoint[];
  length?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineDpoDivergenceCrossLayout(
  opts: ComputeLineDpoDivergenceCrossLayoutOptions,
): ChartLineDpoDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineDpoDivergenceCross(opts.data, {
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

  let dpoMin = Infinity;
  let dpoMax = -Infinity;
  for (let i = 0; i < run.dpoValues.length; i += 1) {
    const v = run.dpoValues[i];
    if (v == null) continue;
    if (v < dpoMin) dpoMin = v;
    if (v > dpoMax) dpoMax = v;
  }
  if (!Number.isFinite(dpoMin) || !Number.isFinite(dpoMax)) {
    dpoMin = -1;
    dpoMax = 1;
  }
  const span = Math.max(Math.abs(dpoMin), Math.abs(dpoMax));
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
      dpoPath: '',
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
  const priceDots: ChartLineDpoDivergenceCrossDot[] = [];
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

  let dpoPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.dpo == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.dpo);
    dpoPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  dpoPath = dpoPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.dpoValues[c.index] ?? 0);
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
    dpoPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineDpoDivergenceCrossChart(
  data: ChartLineDpoDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): string {
  const cleaned = getLineDpoDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineDpoDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineDpoDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `DPO Divergence Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, divergenceWindow ${divergenceWindow}). Top ` +
    `panel renders the close with bullish (price down + DPO up, ` +
    `potential bottom reversal warning) / bearish (price up + DPO ` +
    `down, potential top reversal warning) chevron overlays at ` +
    `every price-versus-DPO direction disagreement event; bottom ` +
    `panel renders the detrended price oscillator with the zero ` +
    `reference and marks divergence transitions for detrended ` +
    `momentum reversal warning.`
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

export const ChartLineDpoDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineDpoDivergenceCrossProps
>(function ChartLineDpoDivergenceCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_PRICE_COLOR,
    dpoColor = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_DPO_COLOR,
    bullishColor = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_DPO_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDpo = true,
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
    () => getLineDpoDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineDpoDivergenceCrossLayout({
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
    ChartLineDpoDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineDpoDivergenceCrossSeriesId,
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
    seriesId: ChartLineDpoDivergenceCrossSeriesId,
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
        data-section="chart-line-dpo-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineDpoDivergenceCrossChart(cleaned, {
      length,
      divergenceWindow,
    });

  const showPrice = !hidden.has('price');
  const showDpoLine = !hidden.has('dpo') && showDpo;

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
      aria-label={ariaLabel ?? 'DPO Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-dpo-divergence-cross"
      data-length={length}
      data-shift={layout.run.shift}
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
        data-section="chart-line-dpo-divergence-cross-title"
      >
        {ariaLabel ?? 'DPO Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-dpo-divergence-cross-aria-desc"
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
        data-section="chart-line-dpo-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-dpo-divergence-cross-grid">
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
                  data-section="chart-line-dpo-divergence-cross-grid-line-price"
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
                  data-section="chart-line-dpo-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-dpo-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-dpo-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-dpo-divergence-cross-axes">
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
                  data-section="chart-line-dpo-divergence-cross-tick-price"
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
                  data-section="chart-line-dpo-divergence-cross-tick-osc"
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
            data-section="chart-line-dpo-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-dpo-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-dpo-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showDpoLine ? (
          <path
            d={layout.dpoPath}
            stroke={dpoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-dpo-divergence-cross-dpo-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-dpo-divergence-cross-crosses"
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
                data-section={`chart-line-dpo-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-dpo-divergence-cross-overlay-crosses"
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
                data-section={`chart-line-dpo-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-dpo-divergence-cross-hover-targets">
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
                data-section="chart-line-dpo-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-dpo-divergence-cross-tooltip"
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
                  data-section="chart-line-dpo-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-divergence-cross-tooltip-dpo"
                >
                  DPO{' '}
                  {tooltipSample.dpo == null
                    ? '--'
                    : formatOsc(tooltipSample.dpo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-dpo-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-dpo-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | shift {layout.run.shift} | window{' '}
          {divergenceWindow} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-dpo-divergence-cross-legend"
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
              { id: 'dpo' as const, color: dpoColor, label: 'DPO' },
            ] satisfies Array<{
              id: ChartLineDpoDivergenceCrossSeriesId;
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

ChartLineDpoDivergenceCross.displayName = 'ChartLineDpoDivergenceCross';
