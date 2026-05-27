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
 * ChartLineSmaDivergenceCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Simple Moving
 * Average (SMA) in the bottom panel, marking price vs SMA
 * direction-disagreement events as trend reversal warnings.
 *
 *   sma[i]      = SMA(close, period)
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   smaUp       : sma[i]   > sma[i-1]
 *   smaDown     : sma[i]   < sma[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && smaUp
 *     'aligned-bearish'   when priceDown && smaDown
 *     'divergent-bullish' when priceDown && smaUp
 *                          (price falling but SMA rising
 *                           -- bullish reversal warning)
 *     'divergent-bearish' when priceUp   && smaDown
 *                          (price rising but SMA falling
 *                           -- bearish reversal warning)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : sma[i] vs sma[i-1] -> up / down / flat /
 *                 none (matches the chart-line-* convention)
 *
 * Defaults: `period = 14`. SMA is the close-only, uniform-
 * weight moving-average baseline. Its steady-state lag on
 * linear input is exactly `(period - 1) / 2 = 6.5` --
 * matching the SMA-seeded EMA, WMA, and HMA centroid
 * identity from the chart-line-*-divergence-cross siblings.
 *
 * Warmup is `period - 1 = 13` for the default tuning: SMA
 * first valid at i = 13. Divergence detection requires the
 * previous SMA + close, so the first regime classification
 * lands at i = 14 (one bar past warmup).
 *
 * Bit-exact anchors (close-only):
 *
 * - **CONST close = K**: every SMA window averages K -> SMA
 *   = K. Both close and SMA are flat -> regime `none` for
 *   every bar. 0 divergence crosses. Verified across K in
 *   {0, 1, 50, 200, 1234}.
 * - **LINEAR UP close = i**: SMA over linear input settles
 *   at `i - (period - 1) / 2 = i - 6.5`. SMA[i] - SMA[i-1]
 *   = +1 (up); close[i] - close[i-1] = +1 (up). Both up
 *   -> regime `aligned-bullish`. 0 divergence crosses.
 * - **LINEAR DOWN close = -i**: mirror -> SMA = `-i + 6.5`.
 *   Both close and SMA falling -> regime `aligned-bearish`.
 *   0 divergence crosses.
 */

export interface ChartLineSmaDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineSmaDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineSmaDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineSmaDivergenceCrossSeriesId = 'price' | 'sma';

export type ChartLineSmaDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineSmaDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineSmaDivergenceCrossCrossKind;
  bias: ChartLineSmaDivergenceCrossBias;
}

export interface ChartLineSmaDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  sma: number | null;
  regime: ChartLineSmaDivergenceCrossRegime;
  bias: ChartLineSmaDivergenceCrossBias;
}

export interface ChartLineSmaDivergenceCrossRun {
  series: ChartLineSmaDivergenceCrossPoint[];
  period: number;
  smaValues: Array<number | null>;
  samples: ChartLineSmaDivergenceCrossSample[];
  crosses: ChartLineSmaDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineSmaDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSmaDivergenceCrossLayout {
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
  priceDots: ChartLineSmaDivergenceCrossDot[];
  smaPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineSmaDivergenceCrossCrossKind;
    bias: ChartLineSmaDivergenceCrossBias;
  }>;
  run: ChartLineSmaDivergenceCrossRun;
}

export interface ChartLineSmaDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSmaDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  smaColor?: string;
  upBiasColor?: string;
  downBiasColor?: string;
  flatBiasColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSma?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSmaDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineSmaDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSmaDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_SMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineSmaDivergenceCrossFinitePoints(
  data: readonly ChartLineSmaDivergenceCrossPoint[] | null | undefined,
): ChartLineSmaDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSmaDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineSmaDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineSmaDivergenceCrossSma(
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

export interface SmaDivergenceCrossChannels {
  sma: Array<number | null>;
}

export function computeLineSmaDivergenceCross(
  series: readonly ChartLineSmaDivergenceCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): SmaDivergenceCrossChannels {
  const cleaned = getLineSmaDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { sma: [] };
  }
  const period = normalizeLineSmaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PERIOD,
  );
  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const sma = applyLineSmaDivergenceCrossSma(closes, period);
  return { sma };
}

export function classifyLineSmaDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curSma: number | null,
  prevSma: number | null,
): ChartLineSmaDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curSma == null ||
    prevSma == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const smaUp = curSma > prevSma;
  const smaDown = curSma < prevSma;
  if (priceUp && smaUp) return 'aligned-bullish';
  if (priceDown && smaDown) return 'aligned-bearish';
  if (priceDown && smaUp) return 'divergent-bullish';
  if (priceUp && smaDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineSmaDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineSmaDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineSmaDivergenceCrossCrosses(
  series: readonly ChartLineSmaDivergenceCrossPoint[],
  regimes: readonly ChartLineSmaDivergenceCrossRegime[],
  smaValues: readonly (number | null)[],
): ChartLineSmaDivergenceCrossCross[] {
  const out: ChartLineSmaDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevSma = smaValues[i - 1];
    const curSma = smaValues[i];
    const bias = classifyLineSmaDivergenceCrossBias(
      curSma ?? null,
      prevSma ?? null,
    );
    if (cur === 'divergent-bullish' && prev !== 'divergent-bullish') {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (
      cur === 'divergent-bearish' &&
      prev !== 'divergent-bearish'
    ) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineSmaDivergenceCross(
  data: ChartLineSmaDivergenceCrossPoint[],
  options: { period?: number } = {},
): ChartLineSmaDivergenceCrossRun {
  const cleaned = getLineSmaDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineSmaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PERIOD,
  );

  const channels = computeLineSmaDivergenceCross(series, { period });

  const regimes: ChartLineSmaDivergenceCrossRegime[] = series.map((p, i) => {
    if (i === 0) return 'none';
    const prevSample = series[i - 1];
    const curSma = channels.sma[i] ?? null;
    const prevSma = channels.sma[i - 1] ?? null;
    return classifyLineSmaDivergenceCrossRegime(
      p.close,
      prevSample ? prevSample.close : null,
      curSma,
      prevSma,
    );
  });

  const samples: ChartLineSmaDivergenceCrossSample[] = series.map((p, i) => {
    const sma = channels.sma[i] ?? null;
    const prevSma = i > 0 ? (channels.sma[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      sma,
      regime: regimes[i] ?? 'none',
      bias: classifyLineSmaDivergenceCrossBias(sma, prevSma),
    };
  });

  const crosses = detectLineSmaDivergenceCrossCrosses(
    series,
    regimes,
    channels.sma,
  );

  let alignedBullishCount = 0;
  let alignedBearishCount = 0;
  let divergentBullishCount = 0;
  let divergentBearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  for (const s of samples) {
    if (s.regime === 'aligned-bullish') alignedBullishCount += 1;
    else if (s.regime === 'aligned-bearish') alignedBearishCount += 1;
    else if (s.regime === 'divergent-bullish') divergentBullishCount += 1;
    else if (s.regime === 'divergent-bearish') divergentBearishCount += 1;
    else noneCount += 1;
    if (s.bias === 'up') upBiasCount += 1;
    else if (s.bias === 'down') downBiasCount += 1;
    else if (s.bias === 'flat') flatBiasCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const warmup = period - 1;
  const ok = series.length > warmup + 1;

  return {
    series,
    period,
    smaValues: channels.sma,
    samples,
    crosses,
    alignedBullishCount,
    alignedBearishCount,
    divergentBullishCount,
    divergentBearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineSmaDivergenceCrossLayoutOptions {
  data: ChartLineSmaDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSmaDivergenceCrossLayout(
  opts: ComputeLineSmaDivergenceCrossLayoutOptions,
): ChartLineSmaDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineSmaDivergenceCross(opts.data, {
    period: opts.period ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let oscRawMin = Infinity;
  let oscRawMax = -Infinity;
  for (let i = 0; i < run.smaValues.length; i += 1) {
    const s = run.smaValues[i];
    if (s != null) {
      if (s < oscRawMin) oscRawMin = s;
      if (s > oscRawMax) oscRawMax = s;
    }
  }
  if (!Number.isFinite(oscRawMin) || !Number.isFinite(oscRawMax)) {
    oscRawMin = 0;
    oscRawMax = 1;
  }
  if (oscRawMin === oscRawMax) {
    oscRawMin -= 1;
    oscRawMax += 1;
  }
  const oscMin = oscRawMin;
  const oscMax = oscRawMax;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

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
      smaPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
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
  const priceDots: ChartLineSmaDivergenceCrossDot[] = [];
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

  let smaPath = '';
  let firstSma = true;
  for (const s of run.samples) {
    if (s.sma == null) {
      firstSma = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.sma);
    smaPath += `${firstSma ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstSma = false;
  }
  smaPath = smaPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const smaAtCross = run.smaValues[c.index];
    const cyOsc = smaAtCross != null ? syOscBase(smaAtCross) : oscBottom;
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
      bias: c.bias,
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
    smaPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineSmaDivergenceCrossChart(
  data: ChartLineSmaDivergenceCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineSmaDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineSmaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PERIOD,
  );
  return (
    `SMA divergence chart over ${cleaned.length} bars (period ` +
    `${period}). Top panel renders the close with bullish ` +
    `(price falling while SMA rising, bullish divergence -- ` +
    `trend reversal warning up) / bearish (price rising while ` +
    `SMA falling, bearish divergence -- trend reversal warning ` +
    `down) chevron overlays at every price-vs-SMA direction- ` +
    `disagreement transition; bottom panel renders the Simple ` +
    `Moving Average with markers coloured by SMA slope bias ` +
    `(rising / falling / flat) at the trigger bar, flagging ` +
    `trend reversal warning events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineSmaDivergenceCrossCrossKind,
  bias: ChartLineSmaDivergenceCrossBias,
  upColor: string,
  downColor: string,
  flatColor: string,
  bullishColor: string,
  bearishColor: string,
): string {
  if (bias === 'up') return upColor;
  if (bias === 'down') return downColor;
  if (bias === 'flat') return flatColor;
  return kind === 'bullish' ? bullishColor : bearishColor;
}

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineSmaDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineSmaDivergenceCrossProps
>(function ChartLineSmaDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_PRICE_COLOR,
    smaColor = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_SMA_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SMA_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSma = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
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
    () => getLineSmaDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSmaDivergenceCrossLayout({
        data: cleaned,
        period,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, period, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSmaDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineSmaDivergenceCrossSeriesId,
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
    seriesId: ChartLineSmaDivergenceCrossSeriesId,
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
        data-section="chart-line-sma-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineSmaDivergenceCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showSmaLine = !hidden.has('sma') && showSma;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'SMA divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-sma-divergence-cross"
      data-period={period}
      data-total-points={cleaned.length}
      data-aligned-bullish-count={layout.run.alignedBullishCount}
      data-aligned-bearish-count={layout.run.alignedBearishCount}
      data-divergent-bullish-count={layout.run.divergentBullishCount}
      data-divergent-bearish-count={layout.run.divergentBearishCount}
      data-none-count={layout.run.noneCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-up-bias-count={layout.run.upBiasCount}
      data-down-bias-count={layout.run.downBiasCount}
      data-flat-bias-count={layout.run.flatBiasCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-sma-divergence-cross-title"
      >
        {ariaLabel ?? 'SMA divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-sma-divergence-cross-aria-desc"
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
        data-section="chart-line-sma-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-sma-divergence-cross-grid">
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
                  data-section="chart-line-sma-divergence-cross-grid-line-price"
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
                  data-section="chart-line-sma-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-sma-divergence-cross-axes">
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
                  data-section="chart-line-sma-divergence-cross-tick-price"
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
                  data-section="chart-line-sma-divergence-cross-tick-osc"
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
            data-section="chart-line-sma-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-sma-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-sma-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSmaLine ? (
          <path
            d={layout.smaPath}
            stroke={smaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-sma-divergence-cross-sma-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-sma-divergence-cross-crosses"
            role="group"
            aria-label="SMA divergence trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={biasFillColor(
                  m.kind,
                  m.bias,
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} SMA divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-sma-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-sma-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay SMA divergence trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={biasFillColor(
                  m.kind,
                  m.bias,
                  upBiasColor,
                  downBiasColor,
                  flatBiasColor,
                  bullishColor,
                  bearishColor,
                )}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-sma-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-sma-divergence-cross-hover-targets">
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
                data-section="chart-line-sma-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-sma-divergence-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={272}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-divergence-cross-tooltip-sma"
                >
                  SMA{' '}
                  {tooltipSample.sma == null
                    ? '--'
                    : formatOsc(tooltipSample.sma)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-sma-divergence-cross-tooltip-biases"
                >
                  up {layout.run.upBiasCount} | down {layout.run.downBiasCount}{' '}
                  | flat {layout.run.flatBiasCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-sma-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-sma-divergence-cross-legend"
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
              { id: 'sma' as const, color: smaColor, label: 'SMA' },
            ] satisfies Array<{
              id: ChartLineSmaDivergenceCrossSeriesId;
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

ChartLineSmaDivergenceCross.displayName = 'ChartLineSmaDivergenceCross';
