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
 * ChartLineWilliamsDivergenceCross -- pure-SVG dual-panel
 * chart with the close in the top panel and the Williams
 * Percent R (%R) in the bottom panel, marking price vs
 * %R direction-disagreement events as momentum reversal
 * warnings.
 *
 *   HH(period)   = max(high[i - period + 1 .. i])
 *   LL(period)   = min(low[i - period + 1 .. i])
 *   pctR[i]      = (HH - close[i]) / (HH - LL) * -100
 *                  ; null when HH = LL (degenerate range)
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   wUp         : pctR[i] > pctR[i-1]
 *   wDown       : pctR[i] < pctR[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && wUp
 *     'aligned-bearish'   when priceDown && wDown
 *     'divergent-bullish' when priceDown && wUp
 *                          (price falling but %R rising
 *                           -- bullish momentum reversal
 *                           warning, oversold relief)
 *     'divergent-bearish' when priceUp   && wDown
 *                          (price rising but %R falling
 *                           -- bearish momentum reversal
 *                           warning, overbought fade)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : pctR[i] vs pctR[i-1] -> up / down /
 *                 flat / none
 *
 * Defaults: `period = 14`. Larry Williams's Percent R
 * (1973) is the canonical bounded momentum oscillator: it
 * locates the current close within the recent
 * high-to-low range, scaled to `[-100, 0]`. Counter to
 * RSI / Stochastic convention, -100 corresponds to
 * *oversold* (close at the period's low) and 0 to
 * *overbought* (close at the period's high). Divergence
 * between price and %R is the most-cited reversal-warning
 * pattern for this oscillator.
 *
 * Warmup is `period - 1 = 13` for the default tuning: %R
 * first valid at i = 13. Divergence detection requires
 * the previous %R + close, so the first regime
 * classification lands at i = 14 (one bar past warmup).
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: HH = K + 1, LL = K - 1 -> range = 2. HH - close
 *   = 1. %R = 1 / 2 * -100 = `-50` (mid-range). Both
 *   close and %R are flat -> regime `none` for every
 *   bar. 0 divergence crosses. Verified across K in {0,
 *   1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: HH = high[i] = i + 1; LL = low[i - period + 1]
 *   = i - period. HH - close = (i + 1) - i = 1. HH - LL
 *   = (i + 1) - (i - period) = period + 1. %R = 1 /
 *   (period + 1) * -100 = `-100 / 15 ~= -6.667`
 *   (constant, near-overbought). %R is flat across the
 *   uptrend -> regime `none` (price up but %R flat). 0
 *   divergence crosses. The canonical Williams %R
 *   behaviour: in a steady linear uptrend, the
 *   oscillator pins at the overbought boundary rather
 *   than tracking direction.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: HH = high[i - period + 1] = -i +
 *   period; LL = low[i] = -i - 1. HH - close = period.
 *   HH - LL = period + 1. %R = period / (period + 1) *
 *   -100 = `-100 * 14 / 15 ~= -93.333` (constant, near-
 *   oversold). Mirror -> regime `none` for the same
 *   reason. 0 divergence crosses.
 */

export interface ChartLineWilliamsDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineWilliamsDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineWilliamsDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineWilliamsDivergenceCrossSeriesId =
  | 'price'
  | 'williams';

export type ChartLineWilliamsDivergenceCrossCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineWilliamsDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineWilliamsDivergenceCrossCrossKind;
  bias: ChartLineWilliamsDivergenceCrossBias;
}

export interface ChartLineWilliamsDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  williams: number | null;
  regime: ChartLineWilliamsDivergenceCrossRegime;
  bias: ChartLineWilliamsDivergenceCrossBias;
}

export interface ChartLineWilliamsDivergenceCrossRun {
  series: ChartLineWilliamsDivergenceCrossPoint[];
  period: number;
  williamsValues: Array<number | null>;
  samples: ChartLineWilliamsDivergenceCrossSample[];
  crosses: ChartLineWilliamsDivergenceCrossCross[];
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

export interface ChartLineWilliamsDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineWilliamsDivergenceCrossLayout {
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
  priceDots: ChartLineWilliamsDivergenceCrossDot[];
  williamsPath: string;
  overboughtY: number;
  oversoldY: number;
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
    kind: ChartLineWilliamsDivergenceCrossCrossKind;
    bias: ChartLineWilliamsDivergenceCrossBias;
  }>;
  run: ChartLineWilliamsDivergenceCrossRun;
}

export interface ChartLineWilliamsDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineWilliamsDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  williamsColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
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
  showWilliams?: boolean;
  showThresholds?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineWilliamsDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineWilliamsDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineWilliamsDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERBOUGHT = -20;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERSOLD = -80;
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_WILLIAMS_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERBOUGHT_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERSOLD_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineWilliamsDivergenceCrossFinitePoints(
  data:
    | readonly ChartLineWilliamsDivergenceCrossPoint[]
    | null
    | undefined,
): ChartLineWilliamsDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineWilliamsDivergenceCrossPoint[] = [];
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

export function normalizeLineWilliamsDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface WilliamsDivergenceCrossChannels {
  williams: Array<number | null>;
}

export function computeLineWilliamsDivergenceCross(
  series:
    | readonly ChartLineWilliamsDivergenceCrossPoint[]
    | null
    | undefined,
  options: { period?: number } = {},
): WilliamsDivergenceCrossChannels {
  const cleaned = getLineWilliamsDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { williams: [] };
  }
  const period = normalizeLineWilliamsDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PERIOD,
  );

  const n = cleaned.length;
  const williams: Array<number | null> = new Array(n).fill(null);
  for (let i = period - 1; i < n; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      const p = cleaned[j]!;
      if (p.high > hh) hh = p.high;
      if (p.low < ll) ll = p.low;
    }
    const range = hh - ll;
    if (range <= 0) continue;
    const closeVal = cleaned[i]!.close;
    williams[i] = posZero(((hh - closeVal) / range) * -100);
  }
  return { williams };
}

export function classifyLineWilliamsDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curWilliams: number | null,
  prevWilliams: number | null,
): ChartLineWilliamsDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curWilliams == null ||
    prevWilliams == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const wUp = curWilliams > prevWilliams;
  const wDown = curWilliams < prevWilliams;
  if (priceUp && wUp) return 'aligned-bullish';
  if (priceDown && wDown) return 'aligned-bearish';
  if (priceDown && wUp) return 'divergent-bullish';
  if (priceUp && wDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineWilliamsDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineWilliamsDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineWilliamsDivergenceCrossCrosses(
  series: readonly ChartLineWilliamsDivergenceCrossPoint[],
  regimes: readonly ChartLineWilliamsDivergenceCrossRegime[],
  williamsValues: readonly (number | null)[],
): ChartLineWilliamsDivergenceCrossCross[] {
  const out: ChartLineWilliamsDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevW = williamsValues[i - 1];
    const curW = williamsValues[i];
    const bias = classifyLineWilliamsDivergenceCrossBias(
      curW ?? null,
      prevW ?? null,
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

export function runLineWilliamsDivergenceCross(
  data: ChartLineWilliamsDivergenceCrossPoint[],
  options: { period?: number } = {},
): ChartLineWilliamsDivergenceCrossRun {
  const cleaned = getLineWilliamsDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineWilliamsDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PERIOD,
  );

  const channels = computeLineWilliamsDivergenceCross(series, { period });

  const regimes: ChartLineWilliamsDivergenceCrossRegime[] = series.map(
    (p, i) => {
      if (i === 0) return 'none';
      const prevSample = series[i - 1];
      const curW = channels.williams[i] ?? null;
      const prevW = channels.williams[i - 1] ?? null;
      return classifyLineWilliamsDivergenceCrossRegime(
        p.close,
        prevSample ? prevSample.close : null,
        curW,
        prevW,
      );
    },
  );

  const samples: ChartLineWilliamsDivergenceCrossSample[] = series.map(
    (p, i) => {
      const williams = channels.williams[i] ?? null;
      const prevW = i > 0 ? (channels.williams[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        williams,
        regime: regimes[i] ?? 'none',
        bias: classifyLineWilliamsDivergenceCrossBias(williams, prevW),
      };
    },
  );

  const crosses = detectLineWilliamsDivergenceCrossCrosses(
    series,
    regimes,
    channels.williams,
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
    williamsValues: channels.williams,
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

export interface ComputeLineWilliamsDivergenceCrossLayoutOptions {
  data: ChartLineWilliamsDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineWilliamsDivergenceCrossLayout(
  opts: ComputeLineWilliamsDivergenceCrossLayoutOptions,
): ChartLineWilliamsDivergenceCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineWilliamsDivergenceCross(opts.data, {
    period: opts.period ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // %R is bounded [-100, 0]; lock the oscillator range so
  // the overbought / oversold thresholds always render at
  // their fixed fractional heights.
  const oscMin = -100;
  const oscMax = 0;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const overboughtY = syOscBase(
    DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERBOUGHT,
  );
  const oversoldY = syOscBase(
    DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERSOLD,
  );

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
      williamsPath: '',
      overboughtY,
      oversoldY,
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
  const priceDots: ChartLineWilliamsDivergenceCrossDot[] = [];
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

  let williamsPath = '';
  let firstW = true;
  for (const s of run.samples) {
    if (s.williams == null) {
      firstW = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.williams);
    williamsPath += `${firstW ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstW = false;
  }
  williamsPath = williamsPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const wAtCross = run.williamsValues[c.index];
    const cyOsc = wAtCross != null ? syOscBase(wAtCross) : oscBottom;
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
    williamsPath,
    overboughtY,
    oversoldY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineWilliamsDivergenceCrossChart(
  data: ChartLineWilliamsDivergenceCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineWilliamsDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineWilliamsDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PERIOD,
  );
  return (
    `Williams Percent R divergence chart over ${cleaned.length} ` +
    `bars (period ${period}). Top panel renders the close with ` +
    `bullish (price falling while %R rising, bullish divergence ` +
    `-- momentum reversal warning up) / bearish (price rising ` +
    `while %R falling, bearish divergence -- momentum reversal ` +
    `warning down) chevron overlays at every price-vs-%R ` +
    `direction-disagreement transition; bottom panel renders ` +
    `the Williams Percent R bounded in [-100, 0] (where -100 is ` +
    `oversold and 0 is overbought) with markers coloured by %R ` +
    `slope bias (rising / falling / flat) at the trigger bar, ` +
    `flagging momentum reversal warning events with bias ` +
    `coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineWilliamsDivergenceCrossCrossKind,
  bias: ChartLineWilliamsDivergenceCrossBias,
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

export const ChartLineWilliamsDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineWilliamsDivergenceCrossProps
>(function ChartLineWilliamsDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_PRICE_COLOR,
    williamsColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_WILLIAMS_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERSOLD_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWilliams = true,
    showThresholds = true,
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
    () => getLineWilliamsDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineWilliamsDivergenceCrossLayout({
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
    ChartLineWilliamsDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineWilliamsDivergenceCrossSeriesId,
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
    seriesId: ChartLineWilliamsDivergenceCrossSeriesId,
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
        data-section="chart-line-williams-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineWilliamsDivergenceCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showWilliamsLine = !hidden.has('williams') && showWilliams;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [
    layout.oscMin,
    DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERSOLD,
    DEFAULT_CHART_LINE_WILLIAMS_DIVERGENCE_CROSS_OVERBOUGHT,
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
      aria-label={ariaLabel ?? 'Williams %R divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-williams-divergence-cross"
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
        data-section="chart-line-williams-divergence-cross-title"
      >
        {ariaLabel ?? 'Williams %R divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-williams-divergence-cross-aria-desc"
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
        data-section="chart-line-williams-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-williams-divergence-cross-grid">
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
                  data-section="chart-line-williams-divergence-cross-grid-line-price"
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
                  data-section="chart-line-williams-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-williams-divergence-cross-axes">
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
                  data-section="chart-line-williams-divergence-cross-tick-price"
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
                  data-section="chart-line-williams-divergence-cross-tick-osc"
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
            data-section="chart-line-williams-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-williams-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-williams-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showThresholds ? (
          <g data-section="chart-line-williams-divergence-cross-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.overboughtY}
              x2={layout.innerRight}
              y2={layout.overboughtY}
              stroke={overboughtColor}
              strokeDasharray="4 3"
              data-section="chart-line-williams-divergence-cross-overbought-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oversoldY}
              x2={layout.innerRight}
              y2={layout.oversoldY}
              stroke={oversoldColor}
              strokeDasharray="4 3"
              data-section="chart-line-williams-divergence-cross-oversold-line"
            />
          </g>
        ) : null}

        {showWilliamsLine ? (
          <path
            d={layout.williamsPath}
            stroke={williamsColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-williams-divergence-cross-williams-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-williams-divergence-cross-crosses"
            role="group"
            aria-label="Williams %R divergence trigger markers"
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
                aria-label={`${m.kind} Williams %R divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-williams-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-williams-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay Williams %R divergence trigger markers"
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
                data-section={`chart-line-williams-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-williams-divergence-cross-hover-targets">
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
                data-section="chart-line-williams-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-williams-divergence-cross-tooltip"
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
                  data-section="chart-line-williams-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-divergence-cross-tooltip-williams"
                >
                  %R{' '}
                  {tooltipSample.williams == null
                    ? '--'
                    : formatOsc(tooltipSample.williams)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-divergence-cross-tooltip-biases"
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
          data-section="chart-line-williams-divergence-cross-badge"
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
          data-section="chart-line-williams-divergence-cross-legend"
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
              { id: 'williams' as const, color: williamsColor, label: '%R' },
            ] satisfies Array<{
              id: ChartLineWilliamsDivergenceCrossSeriesId;
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

ChartLineWilliamsDivergenceCross.displayName =
  'ChartLineWilliamsDivergenceCross';
