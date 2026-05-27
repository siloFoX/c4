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
 * ChartLineAtrDivergenceCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Average True
 * Range (ATR) in the bottom panel, marking price vs ATR
 * direction-disagreement events as volatility-regime
 * reversal warnings.
 *
 *   tr[i]        = max(high[i] - low[i],
 *                      |high[i] - close[i-1]|,
 *                      |low[i]  - close[i-1]|)
 *   atr[i]       = SMA(tr, period)
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   atrUp       : atr[i]   > atr[i-1]
 *   atrDown     : atr[i]   < atr[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && atrUp
 *                          (price rising on expanding
 *                           volatility -- aligned breakout)
 *     'aligned-bearish'   when priceDown && atrDown
 *                          (price falling on contracting
 *                           volatility -- aligned drift)
 *     'divergent-bullish' when priceDown && atrUp
 *                          (price falling but ATR rising
 *                           -- bullish volatility-regime
 *                           reversal warning; selling
 *                           pressure releases on
 *                           expanding range)
 *     'divergent-bearish' when priceUp   && atrDown
 *                          (price rising but ATR falling
 *                           -- bearish volatility-regime
 *                           reversal warning; rally fades
 *                           on contracting range)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : atr[i] vs atr[i-1] -> up / down / flat /
 *                 none
 *
 * Defaults: `period = 14`. ATR is Wilder's 1978 volatility
 * proxy: the rolling average of the true-range bar
 * magnitude. Unlike directional indicators, ATR is always
 * non-negative and direction-agnostic -- rising ATR means
 * expanding volatility regardless of trend, falling ATR
 * means contracting volatility. The divergence detector
 * here fires when the volatility direction disagrees with
 * the price direction: a bearish regime where price rises
 * but volatility contracts often warns of a fading rally;
 * a bullish regime where price falls but volatility
 * expands often warns of capitulation / reversal.
 *
 * This primitive uses SMA-based ATR (matching
 * chart-line-atr-breakout-cross v1.11.1048's modern
 * trader-friendly variant) rather than Wilder-style ATR
 * (matching chart-line-supertrend-divergence-cross
 * v1.11.1062's canonical 1978 formulation). SMA ATR gives
 * exact integer values on linear input with no
 * convergence transient.
 *
 * Warmup is `period = 14` for the default tuning: TR
 * seeds at i = 1, ATR first valid at i = period = 14.
 * Divergence detection requires the previous ATR + close,
 * so the first regime classification lands at i = period
 * + 1 = 15.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: tr = max(2, 1, 1) = 2. atr = 2 (constant). Both
 *   close and ATR are flat -> regime `none` for every
 *   bar. 0 divergence crosses. Verified across K in {0,
 *   1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: tr = max(2, |(i+1) - (i-1)| = 2, |(i-1) -
 *   (i-1)| = 0) = 2. atr = 2 constant. Price rises at
 *   +1 per bar but ATR is flat -> regime `none`
 *   (volatility is stable through the uptrend). 0
 *   divergence crosses. This is canonical ATR behaviour
 *   -- in a steady linear uptrend, the per-bar range is
 *   constant, so ATR pins at the range magnitude.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: tr = max(2, 0, 2) = 2. atr = 2
 *   constant. Mirror -> regime `none`. 0 divergence
 *   crosses.
 */

export interface ChartLineAtrDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAtrDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineAtrDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineAtrDivergenceCrossSeriesId = 'price' | 'atr';

export type ChartLineAtrDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineAtrDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineAtrDivergenceCrossCrossKind;
  bias: ChartLineAtrDivergenceCrossBias;
}

export interface ChartLineAtrDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  atr: number | null;
  regime: ChartLineAtrDivergenceCrossRegime;
  bias: ChartLineAtrDivergenceCrossBias;
}

export interface ChartLineAtrDivergenceCrossRun {
  series: ChartLineAtrDivergenceCrossPoint[];
  period: number;
  trueRange: Array<number | null>;
  atrValues: Array<number | null>;
  samples: ChartLineAtrDivergenceCrossSample[];
  crosses: ChartLineAtrDivergenceCrossCross[];
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

export interface ChartLineAtrDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAtrDivergenceCrossLayout {
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
  priceDots: ChartLineAtrDivergenceCrossDot[];
  atrPath: string;
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
    kind: ChartLineAtrDivergenceCrossCrossKind;
    bias: ChartLineAtrDivergenceCrossBias;
  }>;
  run: ChartLineAtrDivergenceCrossRun;
}

export interface ChartLineAtrDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAtrDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  atrColor?: string;
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
  showAtr?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAtrDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAtrDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAtrDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_ATR_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineAtrDivergenceCrossFinitePoints(
  data: readonly ChartLineAtrDivergenceCrossPoint[] | null | undefined,
): ChartLineAtrDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAtrDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      point.high >= point.low
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

export function normalizeLineAtrDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface AtrDivergenceCrossChannels {
  trueRange: Array<number | null>;
  atr: Array<number | null>;
}

export function computeLineAtrDivergenceCross(
  series: readonly ChartLineAtrDivergenceCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): AtrDivergenceCrossChannels {
  const cleaned = getLineAtrDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { trueRange: [], atr: [] };
  }
  const period = normalizeLineAtrDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PERIOD,
  );

  const n = cleaned.length;
  const tr: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]!;
    const prev = cleaned[i - 1]!;
    const range = cur.high - cur.low;
    const hToPc = Math.abs(cur.high - prev.close);
    const lToPc = Math.abs(cur.low - prev.close);
    tr[i] = posZero(Math.max(range, hToPc, lToPc));
  }

  const atr: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      const v = tr[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    atr[i] = winMin === winMax ? winMin : posZero(sum / period);
  }

  return { trueRange: tr, atr };
}

export function classifyLineAtrDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curAtr: number | null,
  prevAtr: number | null,
): ChartLineAtrDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curAtr == null ||
    prevAtr == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const atrUp = curAtr > prevAtr;
  const atrDown = curAtr < prevAtr;
  if (priceUp && atrUp) return 'aligned-bullish';
  if (priceDown && atrDown) return 'aligned-bearish';
  if (priceDown && atrUp) return 'divergent-bullish';
  if (priceUp && atrDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineAtrDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineAtrDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineAtrDivergenceCrossCrosses(
  series: readonly ChartLineAtrDivergenceCrossPoint[],
  regimes: readonly ChartLineAtrDivergenceCrossRegime[],
  atrValues: readonly (number | null)[],
): ChartLineAtrDivergenceCrossCross[] {
  const out: ChartLineAtrDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevAtr = atrValues[i - 1];
    const curAtr = atrValues[i];
    const bias = classifyLineAtrDivergenceCrossBias(
      curAtr ?? null,
      prevAtr ?? null,
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

export function runLineAtrDivergenceCross(
  data: ChartLineAtrDivergenceCrossPoint[],
  options: { period?: number } = {},
): ChartLineAtrDivergenceCrossRun {
  const cleaned = getLineAtrDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineAtrDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PERIOD,
  );

  const channels = computeLineAtrDivergenceCross(series, { period });

  const regimes: ChartLineAtrDivergenceCrossRegime[] = series.map(
    (p, i) => {
      if (i === 0) return 'none';
      const prevSample = series[i - 1];
      const curAtr = channels.atr[i] ?? null;
      const prevAtr = channels.atr[i - 1] ?? null;
      return classifyLineAtrDivergenceCrossRegime(
        p.close,
        prevSample ? prevSample.close : null,
        curAtr,
        prevAtr,
      );
    },
  );

  const samples: ChartLineAtrDivergenceCrossSample[] = series.map((p, i) => {
    const atr = channels.atr[i] ?? null;
    const prevAtr = i > 0 ? (channels.atr[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      atr,
      regime: regimes[i] ?? 'none',
      bias: classifyLineAtrDivergenceCrossBias(atr, prevAtr),
    };
  });

  const crosses = detectLineAtrDivergenceCrossCrosses(
    series,
    regimes,
    channels.atr,
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

  const warmup = period;
  const ok = series.length > warmup + 1;

  return {
    series,
    period,
    trueRange: channels.trueRange,
    atrValues: channels.atr,
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

export interface ComputeLineAtrDivergenceCrossLayoutOptions {
  data: ChartLineAtrDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAtrDivergenceCrossLayout(
  opts: ComputeLineAtrDivergenceCrossLayoutOptions,
): ChartLineAtrDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineAtrDivergenceCross(opts.data, {
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
  for (let i = 0; i < run.atrValues.length; i += 1) {
    const a = run.atrValues[i];
    if (a != null) {
      if (a < oscRawMin) oscRawMin = a;
      if (a > oscRawMax) oscRawMax = a;
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
  // Clamp the visible ATR floor to 0 since ATR is non-negative;
  // padded oscMin can otherwise leak below zero.
  if (oscRawMin < 0) oscRawMin = 0;
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
      atrPath: '',
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
  const priceDots: ChartLineAtrDivergenceCrossDot[] = [];
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

  let atrPath = '';
  let firstAtr = true;
  for (const s of run.samples) {
    if (s.atr == null) {
      firstAtr = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.atr);
    atrPath += `${firstAtr ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstAtr = false;
  }
  atrPath = atrPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const atrAtCross = run.atrValues[c.index];
    const cyOsc = atrAtCross != null ? syOscBase(atrAtCross) : oscBottom;
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
    atrPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineAtrDivergenceCrossChart(
  data: ChartLineAtrDivergenceCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineAtrDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineAtrDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PERIOD,
  );
  return (
    `ATR divergence chart over ${cleaned.length} bars (period ` +
    `${period}). Top panel renders the close with bullish ` +
    `(price falling while ATR rising, bullish divergence -- ` +
    `volatility regime reversal warning up; selling pressure ` +
    `releases on expanding range) / bearish (price rising ` +
    `while ATR falling, bearish divergence -- volatility ` +
    `regime reversal warning down; rally fades on contracting ` +
    `range) chevron overlays at every price-vs-ATR direction- ` +
    `disagreement transition; bottom panel renders the Average ` +
    `True Range (Wilder's 1978 volatility proxy, SMA-smoothed) ` +
    `with markers coloured by ATR slope bias (rising / falling ` +
    `/ flat) at the trigger bar, flagging volatility regime ` +
    `reversal warning events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineAtrDivergenceCrossCrossKind,
  bias: ChartLineAtrDivergenceCrossBias,
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

export const ChartLineAtrDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineAtrDivergenceCrossProps
>(function ChartLineAtrDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_PRICE_COLOR,
    atrColor = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_ATR_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ATR_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAtr = true,
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
    () => getLineAtrDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAtrDivergenceCrossLayout({
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
    ChartLineAtrDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineAtrDivergenceCrossSeriesId,
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
    seriesId: ChartLineAtrDivergenceCrossSeriesId,
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
        data-section="chart-line-atr-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineAtrDivergenceCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showAtrLine = !hidden.has('atr') && showAtr;

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
      aria-label={ariaLabel ?? 'ATR divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-atr-divergence-cross"
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
        data-section="chart-line-atr-divergence-cross-title"
      >
        {ariaLabel ?? 'ATR divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-atr-divergence-cross-aria-desc"
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
        data-section="chart-line-atr-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-atr-divergence-cross-grid">
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
                  data-section="chart-line-atr-divergence-cross-grid-line-price"
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
                  data-section="chart-line-atr-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-atr-divergence-cross-axes">
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
                  data-section="chart-line-atr-divergence-cross-tick-price"
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
                  data-section="chart-line-atr-divergence-cross-tick-osc"
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
            data-section="chart-line-atr-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-atr-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-atr-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showAtrLine ? (
          <path
            d={layout.atrPath}
            stroke={atrColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-atr-divergence-cross-atr-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-atr-divergence-cross-crosses"
            role="group"
            aria-label="ATR divergence trigger markers"
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
                aria-label={`${m.kind} ATR divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-atr-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-atr-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay ATR divergence trigger markers"
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
                data-section={`chart-line-atr-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-atr-divergence-cross-hover-targets">
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
                data-section="chart-line-atr-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-atr-divergence-cross-tooltip"
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
                  data-section="chart-line-atr-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-divergence-cross-tooltip-atr"
                >
                  ATR{' '}
                  {tooltipSample.atr == null
                    ? '--'
                    : formatOsc(tooltipSample.atr)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-atr-divergence-cross-tooltip-biases"
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
          data-section="chart-line-atr-divergence-cross-badge"
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
          data-section="chart-line-atr-divergence-cross-legend"
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
              { id: 'atr' as const, color: atrColor, label: 'ATR' },
            ] satisfies Array<{
              id: ChartLineAtrDivergenceCrossSeriesId;
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

ChartLineAtrDivergenceCross.displayName = 'ChartLineAtrDivergenceCross';
