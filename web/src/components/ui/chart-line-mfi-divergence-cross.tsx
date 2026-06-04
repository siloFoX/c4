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
 * ChartLineMfiDivergenceCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the HLCV Money Flow Index
 * (MFI) line in the bottom panel, marking bullish (price down +
 * MFI up, potential volume-weighted bottom reversal warning) /
 * bearish (price up + MFI down, potential volume-weighted top
 * reversal warning) divergence cross events. MFI is the
 * volume-weighted RSI: it incorporates volume into the
 * momentum reading, which makes its divergences carry more
 * weight than pure-price divergences.
 *
 *   typical[i]   = (high + low + close) / 3
 *   moneyFlow[i] = typical[i] * volume[i]
 *   posFlow[i]   = moneyFlow when typical rises, 0 otherwise
 *   negFlow[i]   = moneyFlow when typical falls, 0 otherwise
 *   posSum       = sum of posFlow over length
 *   negSum       = sum of negFlow over length
 *   mfi[i]       = 100 - 100 / (1 + posSum/negSum);
 *                  50 when both sums are 0 (degenerate)
 *                  100 when only positive flow
 *                  0 when only negative flow
 *   priceUp      = close[i] > close[i-window]
 *   mfiUp        = mfi[i]   > mfi[i-window]
 *   five-state regime model with crosses suppressed when
 *   prev/cur is 'none'
 *
 * Defaults: `length = 14` (canonical MFI window),
 * `divergenceWindow = 5`.
 *
 * Bit-exact anchor:
 *
 * - **CONST H=L=C=K, V=const**: typical=K, no direction change
 *   -> posSum=negSum=0 -> mfi=50 (degenerate neutral). priceUp
 *   = false, mfiUp = false -> regime `aligned-bearish` (neither
 *   rising). 0 divergence crosses. Verified across K = 0..1234
 *   and V = 1, 100, 1000, 1234.
 * - **LINEAR UP H=L=C=i, V=const**: typical=i, only positive
 *   flow -> negSum=0 -> mfi=100 saturated. priceUp = true,
 *   mfiUp = false (100 === 100) -> regime `divergent-bearish`
 *   (price still rising while MFI saturated -- canonical
 *   volume-weighted bearish divergence). 0 crosses (prev=none).
 * - **LINEAR DOWN H=L=C=-i, V=const**: typical=-i, only
 *   negative flow -> posSum=0 -> mfi=0 saturated. priceUp =
 *   false, mfiUp = false -> regime `aligned-bearish`. 0 crosses.
 */

export interface ChartLineMfiDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartLineMfiDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineMfiDivergenceCrossSeriesId = 'price' | 'mfi';

export type ChartLineMfiDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineMfiDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineMfiDivergenceCrossCrossKind;
}

export interface ChartLineMfiDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  mfi: number | null;
  priceUp: boolean | null;
  mfiUp: boolean | null;
  regime: ChartLineMfiDivergenceCrossRegime;
}

export interface ChartLineMfiDivergenceCrossRun {
  series: ChartLineMfiDivergenceCrossPoint[];
  length: number;
  divergenceWindow: number;
  mfiValues: Array<number | null>;
  samples: ChartLineMfiDivergenceCrossSample[];
  crosses: ChartLineMfiDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineMfiDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMfiDivergenceCrossLayout {
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
  priceDots: ChartLineMfiDivergenceCrossDot[];
  mfiPath: string;
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
    kind: ChartLineMfiDivergenceCrossCrossKind;
  }>;
  run: ChartLineMfiDivergenceCrossRun;
}

export interface ChartLineMfiDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMfiDivergenceCrossPoint[];
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
  mfiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMfi?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showMid?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMfiDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineMfiDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMfiDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_MFI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineMfiDivergenceCrossFinitePoints(
  data: readonly ChartLineMfiDivergenceCrossPoint[] | null | undefined,
): ChartLineMfiDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMfiDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

export function normalizeLineMfiDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineMfiDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/**
 * Money Flow Index from HLCV series with three degenerate
 * fallbacks: both sums 0 -> 50 (neutral), only positive ->
 * 100, only negative -> 0.
 */
export function applyLineMfiDivergenceCrossMfi(
  series: readonly ChartLineMfiDivergenceCrossPoint[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(series.length).fill(null);
  if (length < 1 || series.length <= length) return out;
  for (let i = length; i < series.length; i += 1) {
    let posSum = 0;
    let negSum = 0;
    for (let j = i - length + 1; j <= i; j += 1) {
      const prev = series[j - 1]!;
      const cur = series[j]!;
      const prevTypical = (prev.high + prev.low + prev.close) / 3;
      const curTypical = (cur.high + cur.low + cur.close) / 3;
      const flow = curTypical * cur.volume;
      if (curTypical > prevTypical) posSum += flow;
      else if (curTypical < prevTypical) negSum += flow;
    }
    if (posSum === 0 && negSum === 0) {
      out[i] = 50;
    } else if (negSum === 0) {
      out[i] = 100;
    } else if (posSum === 0) {
      out[i] = 0;
    } else {
      const mfr = posSum / negSum;
      out[i] = posZero(100 - 100 / (1 + mfr));
    }
  }
  return out;
}

export interface LineMfiDivergenceCrossChannels {
  mfi: Array<number | null>;
}

export function computeLineMfiDivergenceCross(
  series: readonly ChartLineMfiDivergenceCrossPoint[] | null | undefined,
  options: { length?: number } = {},
): LineMfiDivergenceCrossChannels {
  const cleaned = getLineMfiDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) return { mfi: [] };
  const length = normalizeLineMfiDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_LENGTH,
  );
  const mfi = applyLineMfiDivergenceCrossMfi(cleaned, length);
  return { mfi };
}

export function classifyLineMfiDivergenceCrossRegime(
  priceUp: boolean | null,
  mfiUp: boolean | null,
): ChartLineMfiDivergenceCrossRegime {
  if (priceUp == null || mfiUp == null) return 'none';
  if (priceUp && mfiUp) return 'aligned-bullish';
  if (!priceUp && !mfiUp) return 'aligned-bearish';
  if (!priceUp && mfiUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineMfiDivergenceCrossCrosses(
  series: readonly ChartLineMfiDivergenceCrossPoint[],
  states: readonly ChartLineMfiDivergenceCrossRegime[],
): ChartLineMfiDivergenceCrossCross[] {
  const out: ChartLineMfiDivergenceCrossCross[] = [];
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

export function runLineMfiDivergenceCross(
  data: ChartLineMfiDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): ChartLineMfiDivergenceCrossRun {
  const cleaned = getLineMfiDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineMfiDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineMfiDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLineMfiDivergenceCross(series, { length });

  const samples: ChartLineMfiDivergenceCrossSample[] = series.map((p, i) => {
    const mfi = channels.mfi[i] ?? null;
    let priceUp: boolean | null = null;
    let mfiUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const mPrev = channels.mfi[i - divergenceWindow] ?? null;
      if (mfi != null && mPrev != null) mfiUp = mfi > mPrev;
    }
    return {
      index: i,
      x: p.x,
      close: p.close,
      mfi,
      priceUp,
      mfiUp,
      regime: classifyLineMfiDivergenceCrossRegime(priceUp, mfiUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLineMfiDivergenceCrossCrosses(series, states);

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
    series,
    length,
    divergenceWindow,
    mfiValues: channels.mfi,
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

export interface ComputeLineMfiDivergenceCrossLayoutOptions {
  data: ChartLineMfiDivergenceCrossPoint[];
  length?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMfiDivergenceCrossLayout(
  opts: ComputeLineMfiDivergenceCrossLayoutOptions,
): ChartLineMfiDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineMfiDivergenceCross(opts.data, {
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
      mfiPath: '',
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
  const priceDots: ChartLineMfiDivergenceCrossDot[] = [];
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

  let mfiPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.mfi == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.mfi);
    mfiPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  mfiPath = mfiPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.mfiValues[c.index] ?? 50);
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
    mfiPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY,
    crossMarkers,
    run,
  };
}

export function describeLineMfiDivergenceCrossChart(
  data: ChartLineMfiDivergenceCrossPoint[],
  options: { length?: number; divergenceWindow?: number } = {},
): string {
  const cleaned = getLineMfiDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineMfiDivergenceCrossLength(
    options.length,
    DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_LENGTH,
  );
  const divergenceWindow = normalizeLineMfiDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `MFI Divergence Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, divergenceWindow ${divergenceWindow}). ` +
    `Top panel renders the close with bullish (price down + MFI ` +
    `up, potential volume-weighted bottom reversal warning) / ` +
    `bearish (price up + MFI down, potential volume-weighted top ` +
    `reversal warning) chevron overlays at every price-versus-MFI ` +
    `direction disagreement event; bottom panel renders the Money ` +
    `Flow Index (volume-weighted RSI) on a 0..100 oscillator with ` +
    `the midline 50 reference and marks volume weighted reversal ` +
    `warning events.`
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

export const ChartLineMfiDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineMfiDivergenceCrossProps
>(function ChartLineMfiDivergenceCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_PRICE_COLOR,
    mfiColor = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_MFI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_MFI_DIVERGENCE_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMfi = true,
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
    () => getLineMfiDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMfiDivergenceCrossLayout({
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
    ChartLineMfiDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineMfiDivergenceCrossSeriesId,
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
    seriesId: ChartLineMfiDivergenceCrossSeriesId,
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
        data-section="chart-line-mfi-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMfiDivergenceCrossChart(cleaned, {
      length,
      divergenceWindow,
    });

  const showPrice = !hidden.has('price');
  const showMfiLine = !hidden.has('mfi') && showMfi;

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
      aria-label={ariaLabel ?? 'MFI Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-mfi-divergence-cross"
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
        data-section="chart-line-mfi-divergence-cross-title"
      >
        {ariaLabel ?? 'MFI Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-mfi-divergence-cross-aria-desc"
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
        data-section="chart-line-mfi-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-mfi-divergence-cross-grid">
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
                  data-section="chart-line-mfi-divergence-cross-grid-line-price"
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
                  data-section="chart-line-mfi-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showMid ? (
          <g data-section="chart-line-mfi-divergence-cross-mid">
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-mfi-divergence-cross-mid-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-mfi-divergence-cross-axes">
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
                  data-section="chart-line-mfi-divergence-cross-tick-price"
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
                  data-section="chart-line-mfi-divergence-cross-tick-osc"
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
            data-section="chart-line-mfi-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-mfi-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-mfi-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showMfiLine ? (
          <path
            d={layout.mfiPath}
            stroke={mfiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-mfi-divergence-cross-mfi-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-mfi-divergence-cross-crosses"
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
                data-section={`chart-line-mfi-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-mfi-divergence-cross-overlay-crosses"
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
                data-section={`chart-line-mfi-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-mfi-divergence-cross-hover-targets">
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
                data-section="chart-line-mfi-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-mfi-divergence-cross-tooltip"
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
                  data-section="chart-line-mfi-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-divergence-cross-tooltip-mfi"
                >
                  MFI{' '}
                  {tooltipSample.mfi == null
                    ? '--'
                    : formatOsc(tooltipSample.mfi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-mfi-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-mfi-divergence-cross-badge"
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
          data-section="chart-line-mfi-divergence-cross-legend"
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
              { id: 'mfi' as const, color: mfiColor, label: 'MFI' },
            ] satisfies Array<{
              id: ChartLineMfiDivergenceCrossSeriesId;
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

ChartLineMfiDivergenceCross.displayName = 'ChartLineMfiDivergenceCross';
