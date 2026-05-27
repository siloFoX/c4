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
 * ChartLineRmiDivergenceCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the Roger Altman Relative
 * Momentum Index (RMI) line in the bottom panel, marking
 * bullish (price down + RMI up, potential bottom reversal
 * warning) / bearish (price up + RMI down, potential top
 * reversal warning) divergence cross events. Divergence variant
 * of the RSI-with-lookback family that flags discrete price-vs-
 * RMI direction disagreement transitions over a configurable
 * look-back window.
 *
 *   mom[i]      = close[i] - close[i - momentumLength]
 *   gain[i]     = max(mom[i], 0)
 *   loss[i]     = max(-mom[i], 0)
 *   avgGain     = SMA-seeded Wilder RMA over `length`
 *   avgLoss     = SMA-seeded Wilder RMA over `length`
 *   rmi[i]      = 100 * avgGain / (avgGain + avgLoss);
 *                 50 when (avgGain + avgLoss) === 0 (degenerate)
 *   priceUp     = close[i] > close[i-window]
 *   rmiUp       = rmi[i]   > rmi[i-window]
 *   state
 *     aligned-bullish    : priceUp && rmiUp
 *     aligned-bearish    : !priceUp && !rmiUp
 *     divergent-bullish  : !priceUp && rmiUp   (price down, RMI up)
 *     divergent-bearish  : priceUp && !rmiUp   (price up, RMI down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `length = 14`, `momentumLength = 4` (Altman's
 * canonical RMI tuning), `divergenceWindow = 5`. When
 * `momentumLength = 1` the RMI reduces to the standard Wilder
 * RSI. Crosses never fire when prev state is `none`
 * (insufficient data). Warmup = momentumLength + length - 1:
 * the lookback needs `momentumLength` bars of history and the
 * Wilder RMA needs `length` valid gain/loss samples.
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: mom = 0 -> gain = loss = 0 ->
 *   avgGain = avgLoss = 0 -> degenerate fallback returns 50.
 *   priceUp = false (close[i] === close[i-5]), rmiUp = false
 *   (50 === 50) -> regime `aligned-bearish`. 0 divergence
 *   crosses. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: mom = +momentumLength constant ->
 *   gain saturated, loss = 0 -> rmi = 100. priceUp = true,
 *   rmiUp = false (100 === 100) -> regime `divergent-bearish`
 *   (price still rising while RMI has saturated at its
 *   maximum -- canonical bearish divergence). 0 crosses
 *   because divergent state is entered from `none`.
 * - **LINEAR DOWN close = -i**: mom = -momentumLength constant
 *   -> loss saturated, gain = 0 -> rmi = 0. priceUp = false,
 *   rmiUp = false (0 === 0) -> regime `aligned-bearish`. 0
 *   crosses.
 */

export interface ChartLineRmiDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineRmiDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineRmiDivergenceCrossSeriesId = 'price' | 'rmi';

export type ChartLineRmiDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineRmiDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineRmiDivergenceCrossCrossKind;
}

export interface ChartLineRmiDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  rmi: number | null;
  priceUp: boolean | null;
  rmiUp: boolean | null;
  regime: ChartLineRmiDivergenceCrossRegime;
}

export interface ChartLineRmiDivergenceCrossRun {
  series: ChartLineRmiDivergenceCrossPoint[];
  length: number;
  momentumLength: number;
  divergenceWindow: number;
  rmiValues: Array<number | null>;
  samples: ChartLineRmiDivergenceCrossSample[];
  crosses: ChartLineRmiDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineRmiDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRmiDivergenceCrossLayout {
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
  priceDots: ChartLineRmiDivergenceCrossDot[];
  rmiPath: string;
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
    kind: ChartLineRmiDivergenceCrossCrossKind;
  }>;
  run: ChartLineRmiDivergenceCrossRun;
}

export interface ChartLineRmiDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRmiDivergenceCrossPoint[];
  length?: number;
  momentumLength?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rmiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRmi?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRmiDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineRmiDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRmiDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_MOMENTUM_LENGTH = 4;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_RMI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineRmiDivergenceCrossFinitePoints(
  data: readonly ChartLineRmiDivergenceCrossPoint[] | null | undefined,
): ChartLineRmiDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRmiDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineRmiDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineRmiDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/**
 * SMA-seeded Wilder RMA over a nullable input array. The first
 * `length` contiguous valid entries seed the recurrence with
 * their arithmetic mean, then `rma[i] = rma[i-1] * (1 - 1/length)
 * + value[i] / length`. A null gap aborts further output.
 */
export function applyLineRmiDivergenceCrossSmaSeededRma(
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
 * Roger Altman's Relative Momentum Index: RSI computed over
 * an `momentumLength`-bar momentum lookback. When
 * `momentumLength = 1` this is the standard Wilder RSI. A
 * degenerate=50 fallback fires when both smoothed gain and
 * smoothed loss collapse to 0 (e.g. constant close).
 */
export function applyLineRmiDivergenceCrossRmi(
  closes: readonly number[],
  length: number,
  momentumLength: number,
): Array<number | null> {
  const n = closes.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || momentumLength < 1 || n <= momentumLength) return out;
  const gain: Array<number | null> = new Array(n).fill(null);
  const loss: Array<number | null> = new Array(n).fill(null);
  for (let i = momentumLength; i < n; i += 1) {
    const d = closes[i]! - closes[i - momentumLength]!;
    gain[i] = d > 0 ? d : 0;
    loss[i] = d < 0 ? -d : 0;
  }
  const avgGain = applyLineRmiDivergenceCrossSmaSeededRma(gain, length);
  const avgLoss = applyLineRmiDivergenceCrossSmaSeededRma(loss, length);
  for (let i = 0; i < n; i += 1) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g == null || l == null) continue;
    const sum = g + l;
    if (sum === 0) {
      out[i] = 50;
    } else {
      out[i] = posZero((100 * g) / sum);
    }
  }
  return out;
}

export interface LineRmiDivergenceCrossChannels {
  rmi: Array<number | null>;
}

export function computeLineRmiDivergenceCross(
  series: readonly ChartLineRmiDivergenceCrossPoint[] | null | undefined,
  options: { length?: number; momentumLength?: number } = {},
): LineRmiDivergenceCrossChannels {
  const cleaned = getLineRmiDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { rmi: [] };
  }
  const length = normalizeLineRmiDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_LENGTH,
  );
  const momentumLength = normalizeLineRmiDivergenceCrossLength(
    options.momentumLength,
    DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_MOMENTUM_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const rmi = applyLineRmiDivergenceCrossRmi(closes, length, momentumLength);
  return { rmi };
}

export function classifyLineRmiDivergenceCrossRegime(
  priceUp: boolean | null,
  rmiUp: boolean | null,
): ChartLineRmiDivergenceCrossRegime {
  if (priceUp == null || rmiUp == null) return 'none';
  if (priceUp && rmiUp) return 'aligned-bullish';
  if (!priceUp && !rmiUp) return 'aligned-bearish';
  if (!priceUp && rmiUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineRmiDivergenceCrossCrosses(
  series: readonly ChartLineRmiDivergenceCrossPoint[],
  states: readonly ChartLineRmiDivergenceCrossRegime[],
): ChartLineRmiDivergenceCrossCross[] {
  const out: ChartLineRmiDivergenceCrossCross[] = [];
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

export function runLineRmiDivergenceCross(
  data: ChartLineRmiDivergenceCrossPoint[],
  options: {
    length?: number;
    momentumLength?: number;
    divergenceWindow?: number;
  } = {},
): ChartLineRmiDivergenceCrossRun {
  const cleaned = getLineRmiDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineRmiDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_LENGTH,
  );
  const momentumLength = normalizeLineRmiDivergenceCrossLength(
    options.momentumLength,
    DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_MOMENTUM_LENGTH,
  );
  const divergenceWindow = normalizeLineRmiDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLineRmiDivergenceCross(series, {
    length,
    momentumLength,
  });

  const samples: ChartLineRmiDivergenceCrossSample[] = series.map((p, i) => {
    const rmi = channels.rmi[i] ?? null;
    let priceUp: boolean | null = null;
    let rmiUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const rPrev = channels.rmi[i - divergenceWindow] ?? null;
      if (rmi != null && rPrev != null) rmiUp = rmi > rPrev;
    }
    return {
      index: i,
      x: p.x,
      close: p.close,
      rmi,
      priceUp,
      rmiUp,
      regime: classifyLineRmiDivergenceCrossRegime(priceUp, rmiUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLineRmiDivergenceCrossCrosses(series, states);

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

  const ok = series.length > momentumLength + length - 1 + divergenceWindow;

  return {
    series,
    length,
    momentumLength,
    divergenceWindow,
    rmiValues: channels.rmi,
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

export interface ComputeLineRmiDivergenceCrossLayoutOptions {
  data: ChartLineRmiDivergenceCrossPoint[];
  length?: number;
  momentumLength?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineRmiDivergenceCrossLayout(
  opts: ComputeLineRmiDivergenceCrossLayoutOptions,
): ChartLineRmiDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineRmiDivergenceCross(opts.data, {
    length: opts.length ?? undefined,
    momentumLength: opts.momentumLength ?? undefined,
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
      rmiPath: '',
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
  const priceDots: ChartLineRmiDivergenceCrossDot[] = [];
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

  let rmiPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.rmi == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.rmi);
    rmiPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  rmiPath = rmiPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.rmiValues[c.index] ?? 0);
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
    rmiPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineRmiDivergenceCrossChart(
  data: ChartLineRmiDivergenceCrossPoint[],
  options: {
    length?: number;
    momentumLength?: number;
    divergenceWindow?: number;
  } = {},
): string {
  const cleaned = getLineRmiDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineRmiDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_LENGTH,
  );
  const momentumLength = normalizeLineRmiDivergenceCrossLength(
    options.momentumLength,
    DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_MOMENTUM_LENGTH,
  );
  const divergenceWindow = normalizeLineRmiDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `RMI Divergence Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, momentumLength ${momentumLength}, ` +
    `divergenceWindow ${divergenceWindow}). Top panel renders the ` +
    `close with bullish (price down + RMI up, potential bottom ` +
    `reversal warning) / bearish (price up + RMI down, potential ` +
    `top reversal warning) chevron overlays at every price-versus-` +
    `RMI direction disagreement event; bottom panel renders the ` +
    `Altman Relative Momentum Index on a 0..100 oscillator and ` +
    `marks divergence transitions for RSI-with-lookback reversal ` +
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

export const ChartLineRmiDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineRmiDivergenceCrossProps
>(function ChartLineRmiDivergenceCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_LENGTH,
    momentumLength = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_MOMENTUM_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_PRICE_COLOR,
    rmiColor = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_RMI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_RMI_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRmi = true,
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
    () => getLineRmiDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineRmiDivergenceCrossLayout({
        data: cleaned,
        length,
        momentumLength,
        divergenceWindow,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      momentumLength,
      divergenceWindow,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineRmiDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineRmiDivergenceCrossSeriesId,
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
    seriesId: ChartLineRmiDivergenceCrossSeriesId,
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
        data-section="chart-line-rmi-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineRmiDivergenceCrossChart(cleaned, {
      length,
      momentumLength,
      divergenceWindow,
    });

  const showPrice = !hidden.has('price');
  const showRmiLine = !hidden.has('rmi') && showRmi;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, 30, 50, 70, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'RMI Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-rmi-divergence-cross"
      data-length={length}
      data-momentum-length={momentumLength}
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
        data-section="chart-line-rmi-divergence-cross-title"
      >
        {ariaLabel ?? 'RMI Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-rmi-divergence-cross-aria-desc"
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
        data-section="chart-line-rmi-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-rmi-divergence-cross-grid">
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
                  data-section="chart-line-rmi-divergence-cross-grid-line-price"
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
                  data-section="chart-line-rmi-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-rmi-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-rmi-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-rmi-divergence-cross-axes">
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
                  data-section="chart-line-rmi-divergence-cross-tick-price"
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
                  data-section="chart-line-rmi-divergence-cross-tick-osc"
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
            data-section="chart-line-rmi-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-rmi-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-rmi-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showRmiLine ? (
          <path
            d={layout.rmiPath}
            stroke={rmiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-rmi-divergence-cross-rmi-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-rmi-divergence-cross-crosses"
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
                data-section={`chart-line-rmi-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-rmi-divergence-cross-overlay-crosses"
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
                data-section={`chart-line-rmi-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-rmi-divergence-cross-hover-targets">
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
                data-section="chart-line-rmi-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-rmi-divergence-cross-tooltip"
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
                  data-section="chart-line-rmi-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-divergence-cross-tooltip-rmi"
                >
                  RMI{' '}
                  {tooltipSample.rmi == null
                    ? '--'
                    : formatOsc(tooltipSample.rmi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rmi-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-rmi-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | mom {momentumLength} | window{' '}
          {divergenceWindow} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-rmi-divergence-cross-legend"
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
              { id: 'rmi' as const, color: rmiColor, label: 'RMI' },
            ] satisfies Array<{
              id: ChartLineRmiDivergenceCrossSeriesId;
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

ChartLineRmiDivergenceCross.displayName = 'ChartLineRmiDivergenceCross';
