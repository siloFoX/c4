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
 * ChartLineRsiDivergenceCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Wilder RSI line
 * in the bottom panel, marking bullish (price down + RSI up,
 * potential bottom reversal warning) / bearish (price up + RSI
 * down, potential top reversal warning) divergence cross events.
 * Divergence variant of the RSI family that flags discrete
 * price-vs-RSI direction disagreement transitions over a
 * configurable look-back window -- the canonical reversal-warning
 * signal analysts pair with support / resistance for swing-trade
 * entries.
 *
 *   rsi[i]   = WilderRSI(close, length)
 *   priceUp  = close[i] > close[i-window]
 *   rsiUp    = rsi[i]   > rsi[i-window]
 *   state
 *     aligned-bullish    : priceUp && rsiUp
 *     aligned-bearish    : !priceUp && !rsiUp
 *     divergent-bullish  : !priceUp && rsiUp   (price down, RSI up)
 *     divergent-bearish  : priceUp && !rsiUp   (price up, RSI down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `length = 14` (canonical Wilder RSI period),
 * `divergenceWindow = 5`. Crosses never fire when prev state is
 * `none` (insufficient data).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: deltas = 0 -> avgGain == avgLoss == 0
 *   -> RSI degenerate = 50. priceUp = false (close[i] ===
 *   close[i-5]), rsiUp = false (50 === 50) -> regime
 *   `aligned-bearish`. 0 divergence crosses. Verified across
 *   K = 0..1234.
 * - **LINEAR UP close = i**: deltas = +1 -> avgLoss = 0 -> RSI
 *   = 100 constant. priceUp = true (close[i] > close[i-5]),
 *   rsiUp = false (100 === 100) -> regime `divergent-bearish`
 *   (price still rising while RSI has saturated at 100 --
 *   waning relative-strength momentum, canonical bearish
 *   divergence). 0 crosses because divergent state is entered
 *   from `none` (prev == 'none' is never a valid cross
 *   precursor).
 * - **LINEAR DOWN close = -i**: RSI = 0 constant. priceUp =
 *   false, rsiUp = false -> regime `aligned-bearish`. 0 crosses.
 */

export interface ChartLineRsiDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineRsiDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineRsiDivergenceCrossSeriesId = 'price' | 'rsi';

export type ChartLineRsiDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineRsiDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineRsiDivergenceCrossCrossKind;
}

export interface ChartLineRsiDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  rsi: number | null;
  priceUp: boolean | null;
  rsiUp: boolean | null;
  regime: ChartLineRsiDivergenceCrossRegime;
}

export interface ChartLineRsiDivergenceCrossRun {
  series: ChartLineRsiDivergenceCrossPoint[];
  length: number;
  divergenceWindow: number;
  rsiValues: Array<number | null>;
  samples: ChartLineRsiDivergenceCrossSample[];
  crosses: ChartLineRsiDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineRsiDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRsiDivergenceCrossLayout {
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
  priceDots: ChartLineRsiDivergenceCrossDot[];
  rsiPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineRsiDivergenceCrossCrossKind;
  }>;
  run: ChartLineRsiDivergenceCrossRun;
}

export interface ChartLineRsiDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRsiDivergenceCrossPoint[];
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
  rsiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRsi?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showMid?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRsiDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineRsiDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRsiDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_RSI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineRsiDivergenceCrossFinitePoints(
  data:
    | readonly ChartLineRsiDivergenceCrossPoint[]
    | null
    | undefined,
): ChartLineRsiDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRsiDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineRsiDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer window (>= 1). */
export function normalizeLineRsiDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/**
 * Wilder RSI on `closes` with the canonical degenerate=50
 * fallback when both gain and loss averages collapse to 0.
 */
export function applyLineRsiDivergenceCrossWilderRsi(
  closes: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (length < 1 || closes.length <= length) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= length; i += 1) {
    const d = closes[i]! - closes[i - 1]!;
    if (d > 0) gainSum += d;
    else if (d < 0) lossSum += -d;
  }
  let avgGain = gainSum / length;
  let avgLoss = lossSum / length;
  out[length] = rsiFromAverages(avgGain, avgLoss);

  for (let i = length + 1; i < closes.length; i += 1) {
    const d = closes[i]! - closes[i - 1]!;
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = ((length - 1) * avgGain + gain) / length;
    avgLoss = ((length - 1) * avgLoss + loss) / length;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  if (avgGain === 0) return 0;
  const rs = avgGain / avgLoss;
  return posZero(100 - 100 / (1 + rs));
}

export interface LineRsiDivergenceCrossChannels {
  rsi: Array<number | null>;
}

export function computeLineRsiDivergenceCross(
  series:
    | readonly ChartLineRsiDivergenceCrossPoint[]
    | null
    | undefined,
  options: { length?: number } = {},
): LineRsiDivergenceCrossChannels {
  const cleaned = getLineRsiDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { rsi: [] };
  }
  const length = normalizeLineRsiDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const rsi = applyLineRsiDivergenceCrossWilderRsi(closes, length);
  return { rsi };
}

export function classifyLineRsiDivergenceCrossRegime(
  priceUp: boolean | null,
  rsiUp: boolean | null,
): ChartLineRsiDivergenceCrossRegime {
  if (priceUp == null || rsiUp == null) return 'none';
  if (priceUp && rsiUp) return 'aligned-bullish';
  if (!priceUp && !rsiUp) return 'aligned-bearish';
  if (!priceUp && rsiUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineRsiDivergenceCrossCrosses(
  series: readonly ChartLineRsiDivergenceCrossPoint[],
  states: readonly ChartLineRsiDivergenceCrossRegime[],
): ChartLineRsiDivergenceCrossCross[] {
  const out: ChartLineRsiDivergenceCrossCross[] = [];
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

export function runLineRsiDivergenceCross(
  data: ChartLineRsiDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): ChartLineRsiDivergenceCrossRun {
  const cleaned = getLineRsiDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineRsiDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineRsiDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLineRsiDivergenceCross(series, { length });

  const samples: ChartLineRsiDivergenceCrossSample[] = series.map((p, i) => {
    const rsi = channels.rsi[i] ?? null;
    let priceUp: boolean | null = null;
    let rsiUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const rCur = rsi;
      const rPrev = channels.rsi[i - divergenceWindow] ?? null;
      if (rCur != null && rPrev != null) rsiUp = rCur > rPrev;
    }
    return {
      index: i,
      x: p.x,
      close: p.close,
      rsi,
      priceUp,
      rsiUp,
      regime: classifyLineRsiDivergenceCrossRegime(priceUp, rsiUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLineRsiDivergenceCrossCrosses(series, states);

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

  const ok = series.length > length + divergenceWindow;

  return {
    series = [],
    length,
    divergenceWindow,
    rsiValues: channels.rsi,
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

export interface ComputeLineRsiDivergenceCrossLayoutOptions {
  data: ChartLineRsiDivergenceCrossPoint[];
  length?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineRsiDivergenceCrossLayout(
  opts: ComputeLineRsiDivergenceCrossLayoutOptions,
): ChartLineRsiDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineRsiDivergenceCross(opts.data, {
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
  const midY = syOscBase(50);

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
      rsiPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      midY,
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
  const priceDots: ChartLineRsiDivergenceCrossDot[] = [];
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

  let rsiPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.rsi == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.rsi);
    rsiPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  rsiPath = rsiPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.rsiValues[c.index] ?? 50);
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
    rsiPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY,
    crossMarkers,
    run,
  };
}

export function describeLineRsiDivergenceCrossChart(
  data: ChartLineRsiDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): string {
  const cleaned = getLineRsiDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineRsiDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineRsiDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `RSI Divergence Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, divergenceWindow ${divergenceWindow}). ` +
    `Top panel renders the close with bullish (price down + RSI ` +
    `up, potential bottom reversal warning) / bearish (price up ` +
    `+ RSI down, potential top reversal warning) chevron ` +
    `overlays at every price-versus-RSI direction disagreement ` +
    `event; bottom panel renders the close-only Wilder RSI line ` +
    `on a 0..100 oscillator with the midline 50 reference and ` +
    `marks divergence transitions for reversal warning.`
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

export const ChartLineRsiDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineRsiDivergenceCrossProps
>(function ChartLineRsiDivergenceCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_PRICE_COLOR,
    rsiColor = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_RSI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_RSI_DIVERGENCE_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRsi = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showMid = true,
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
    () => getLineRsiDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineRsiDivergenceCrossLayout({
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
    ChartLineRsiDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineRsiDivergenceCrossSeriesId,
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
    seriesId: ChartLineRsiDivergenceCrossSeriesId,
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
        data-section="chart-line-rsi-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineRsiDivergenceCrossChart(cleaned, {
      length,
      divergenceWindow,
    });

  const showPrice = !hidden.has('price');
  const showRsiLine = !hidden.has('rsi') && showRsi;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, 50, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'RSI Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-rsi-divergence-cross"
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
        data-section="chart-line-rsi-divergence-cross-title"
      >
        {ariaLabel ?? 'RSI Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-rsi-divergence-cross-aria-desc"
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
        data-section="chart-line-rsi-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-rsi-divergence-cross-grid">
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
                  data-section="chart-line-rsi-divergence-cross-grid-line-price"
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
                  data-section="chart-line-rsi-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showMid ? (
          <g data-section="chart-line-rsi-divergence-cross-mid">
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-rsi-divergence-cross-mid-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-rsi-divergence-cross-axes">
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
                  data-section="chart-line-rsi-divergence-cross-tick-price"
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
                  data-section="chart-line-rsi-divergence-cross-tick-osc"
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
            data-section="chart-line-rsi-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-rsi-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-rsi-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showRsiLine ? (
          <path
            d={layout.rsiPath}
            stroke={rsiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-rsi-divergence-cross-rsi-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-rsi-divergence-cross-crosses"
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
                data-section={`chart-line-rsi-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-rsi-divergence-cross-overlay-crosses"
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
                data-section={`chart-line-rsi-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-rsi-divergence-cross-hover-targets">
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
                data-section="chart-line-rsi-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-rsi-divergence-cross-tooltip"
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
                  data-section="chart-line-rsi-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-divergence-cross-tooltip-rsi"
                >
                  RSI{' '}
                  {tooltipSample.rsi == null
                    ? '--'
                    : formatOsc(tooltipSample.rsi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-rsi-divergence-cross-badge"
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
          data-section="chart-line-rsi-divergence-cross-legend"
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
              { id: 'rsi' as const, color: rsiColor, label: 'RSI' },
            ] satisfies Array<{
              id: ChartLineRsiDivergenceCrossSeriesId;
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

ChartLineRsiDivergenceCross.displayName = 'ChartLineRsiDivergenceCross';
