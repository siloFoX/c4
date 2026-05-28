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
 * ChartLineMomentumDivergenceCross -- pure-SVG dual-panel
 * chart with the close in the top panel and the Momentum
 * oscillator in the bottom panel, marking bullish (price
 * down while momentum up -- bullish reversal warning;
 * downward price exhaustion while momentum recovers) /
 * bearish (price up while momentum down -- bearish
 * reversal warning; upward price exhaustion while
 * momentum decays) price-vs-momentum direction
 * disagreement (divergence) trigger events with bias
 * coloring derived from the momentum slope at the
 * divergence-entry bar.
 *
 *   M[i]  = close[i] - close[i - period]   (Momentum)
 *
 *   priceUp     = close[i]  > close[i-1]
 *   priceDown   = close[i]  < close[i-1]
 *   momUp       = M[i]      > M[i-1]
 *   momDown     = M[i]      < M[i-1]
 *
 *   regime :
 *     'aligned-bullish'   when priceUp   && momUp
 *                         (price + momentum confirm
 *                          uptrend together)
 *     'aligned-bearish'   when priceDown && momDown
 *                         (price + momentum confirm
 *                          downtrend together)
 *     'divergent-bullish' when priceDown && momUp
 *                         (price falling but momentum
 *                          recovering -- bullish reversal
 *                          warning)
 *     'divergent-bearish' when priceUp   && momDown
 *                         (price rising but momentum
 *                          decaying -- bearish reversal
 *                          warning)
 *     'none'              otherwise (null or flat in any
 *                          direction)
 *
 *   bullish cross (entry into bullish divergence) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish cross (entry into bearish divergence) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias : M[i] vs M[i-1] -> up / down / flat / none
 *
 * Defaults: `period = 10`. The canonical Momentum
 * oscillator measures the absolute price change over the
 * lookback period: M[i] = close[i] - close[i-period]. When
 * price and momentum disagree on direction, the most
 * recent bar(s) have either decelerated the trend
 * (divergent-bearish: price still rising but at slower
 * pace, momentum already falling) or accelerated against
 * it (divergent-bullish: price still falling but momentum
 * already turning up). These divergences are classical
 * reversal warning signals -- the price has not reversed
 * yet but the underlying momentum has.
 *
 * Sibling family (divergence-cross family):
 *   - chart-line-atr-divergence-cross v1.11.1046 --
 *     price vs ATR (volatility divergence)
 *   - chart-line-keltner-divergence-cross v1.11.1054 --
 *     price vs Keltner mid
 *   - chart-line-bollinger-divergence-cross v1.11.1055 --
 *     price vs Bollinger mid
 *   - chart-line-donchian-divergence-cross v1.11.1059 --
 *     price vs Donchian mid
 *   - this primitive: price vs Momentum oscillator
 *     (the classical reversal warning signal)
 *
 * Warmup is i = period (first momentum value at i =
 * period: M[period] = close[period] - close[0]). Cross
 * detection needs the previous bar's regime, so the first
 * potential cross lands at i = period + 1.
 *
 * Bit-exact anchors (single-close input):
 *
 * - **CONST** `close = K`: M[i] = K - K = 0 (constant
 *   from i = period). Price delta = 0 (flat),
 *   momentum delta = 0 (flat). Both priceUp/Down and
 *   momUp/Down are false at every bar. regime `none`
 *   throughout. 0 crosses. Verified across K in {0, 1,
 *   50, 200, 1234}.
 * - **LINEAR UP** `close = i`: M[i] = i - (i-period) =
 *   period (constant from i = period). Price delta = +1
 *   (priceUp). Momentum delta = 0 (flat -- M is
 *   constant). momUp = false. regime `none`. 0 crosses.
 * - **LINEAR DOWN** `close = -i`: M[i] = -i - (-(i-period))
 *   = -period (constant from i = period). Price delta =
 *   -1 (priceDown). Momentum delta = 0. regime `none`.
 *   0 crosses.
 * - **QUADRATIC UP** `close = i * i`: M[i] = period*(2*i
 *   - period) -- monotonically increasing. Price delta
 *   = 2*i - 1 (always > 0, priceUp). Momentum delta =
 *   period*2 (constant, momUp). regime
 *   `aligned-bullish` throughout the post-warmup window.
 *   0 crosses (no transition into divergent state).
 *
 * All three steady-state linear/const anchors produce 0
 * crosses because the regime never enters a divergent
 * state. Real crosses fire when price and momentum
 * directions actually disagree -- the classical
 * divergence reversal warning.
 */

export interface ChartLineMomentumDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineMomentumDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineMomentumDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineMomentumDivergenceCrossSeriesId = 'price' | 'momentum';

export type ChartLineMomentumDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineMomentumDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineMomentumDivergenceCrossCrossKind;
  bias: ChartLineMomentumDivergenceCrossBias;
}

export interface ChartLineMomentumDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  momentum: number | null;
  regime: ChartLineMomentumDivergenceCrossRegime;
  bias: ChartLineMomentumDivergenceCrossBias;
}

export interface ChartLineMomentumDivergenceCrossRun {
  series: ChartLineMomentumDivergenceCrossPoint[];
  period: number;
  momentumValues: Array<number | null>;
  regimes: ChartLineMomentumDivergenceCrossRegime[];
  samples: ChartLineMomentumDivergenceCrossSample[];
  crosses: ChartLineMomentumDivergenceCrossCross[];
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

export interface ChartLineMomentumDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMomentumDivergenceCrossLayout {
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
  priceDots: ChartLineMomentumDivergenceCrossDot[];
  momentumPath: string;
  zeroLineY: number;
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
    kind: ChartLineMomentumDivergenceCrossCrossKind;
    bias: ChartLineMomentumDivergenceCrossBias;
  }>;
  run: ChartLineMomentumDivergenceCrossRun;
}

export interface ChartLineMomentumDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMomentumDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  momentumColor?: string;
  zeroLineColor?: string;
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
  showMomentum?: boolean;
  showZeroLine?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMomentumDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineMomentumDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMomentumDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PERIOD = 10;
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_MOMENTUM_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_ZERO_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineMomentumDivergenceCrossFinitePoints(
  data: readonly ChartLineMomentumDivergenceCrossPoint[] | null | undefined,
): ChartLineMomentumDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMomentumDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineMomentumDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function computeLineMomentumDivergenceCross(
  series: readonly ChartLineMomentumDivergenceCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): Array<number | null> {
  const cleaned = getLineMomentumDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) return [];
  const period = normalizeLineMomentumDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PERIOD,
  );
  const n = cleaned.length;
  const out: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    out[i] = posZero(cleaned[i]!.close - cleaned[i - period]!.close);
  }
  return out;
}

export function classifyLineMomentumDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curMom: number | null,
  prevMom: number | null,
): ChartLineMomentumDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curMom == null ||
    prevMom == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const momUp = curMom > prevMom;
  const momDown = curMom < prevMom;
  if (priceUp && momUp) return 'aligned-bullish';
  if (priceDown && momDown) return 'aligned-bearish';
  if (priceDown && momUp) return 'divergent-bullish';
  if (priceUp && momDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineMomentumDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineMomentumDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineMomentumDivergenceCrossCrosses(
  series: readonly ChartLineMomentumDivergenceCrossPoint[],
  regimes: readonly ChartLineMomentumDivergenceCrossRegime[],
  momentumValues: readonly (number | null)[],
): ChartLineMomentumDivergenceCrossCross[] {
  const out: ChartLineMomentumDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevMom = momentumValues[i - 1];
    const curMom = momentumValues[i];
    const bias = classifyLineMomentumDivergenceCrossBias(
      curMom ?? null,
      prevMom ?? null,
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

export function runLineMomentumDivergenceCross(
  data: ChartLineMomentumDivergenceCrossPoint[],
  options: { period?: number } = {},
): ChartLineMomentumDivergenceCrossRun {
  const cleaned = getLineMomentumDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineMomentumDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PERIOD,
  );

  const momentumValues = computeLineMomentumDivergenceCross(series, {
    period,
  });

  const regimes: ChartLineMomentumDivergenceCrossRegime[] = series.map(
    (_, i) => {
      if (i === 0) return 'none';
      return classifyLineMomentumDivergenceCrossRegime(
        series[i]!.close,
        series[i - 1]!.close,
        momentumValues[i] ?? null,
        momentumValues[i - 1] ?? null,
      );
    },
  );

  const samples: ChartLineMomentumDivergenceCrossSample[] = series.map(
    (p, i) => {
      const mom = momentumValues[i] ?? null;
      const prevMom = i > 0 ? (momentumValues[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        momentum: mom,
        regime: regimes[i] ?? 'none',
        bias: classifyLineMomentumDivergenceCrossBias(mom, prevMom),
      };
    },
  );

  const crosses = detectLineMomentumDivergenceCrossCrosses(
    series,
    regimes,
    momentumValues,
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

  const warmup = period + 1;
  const ok = series.length > warmup;

  return {
    series,
    period,
    momentumValues,
    regimes,
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

export interface ComputeLineMomentumDivergenceCrossLayoutOptions {
  data: ChartLineMomentumDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineMomentumDivergenceCrossLayout(
  opts: ComputeLineMomentumDivergenceCrossLayoutOptions,
): ChartLineMomentumDivergenceCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineMomentumDivergenceCross(opts.data, {
    period: opts.period ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

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
      momentumPath: '',
      zeroLineY: oscBottom,
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.momentum != null) {
      if (s.momentum < oscMin) oscMin = s.momentum;
      if (s.momentum > oscMax) oscMax = s.momentum;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  // Ensure zero is visible in the momentum panel
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  const zeroLineY = syOsc(0);

  let pricePath = '';
  const priceDots: ChartLineMomentumDivergenceCrossDot[] = [];
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

  let momentumPath = '';
  let firstMom = true;
  for (const s of run.samples) {
    if (s.momentum == null) {
      firstMom = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.momentum);
    momentumPath += `${firstMom ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstMom = false;
  }
  momentumPath = momentumPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const mAt = run.momentumValues[c.index];
    const cyOsc = mAt != null ? syOsc(mAt) : oscBottom;
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
    momentumPath,
    zeroLineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineMomentumDivergenceCrossChart(
  data: ChartLineMomentumDivergenceCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineMomentumDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineMomentumDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PERIOD,
  );
  return (
    `Momentum oscillator divergence-cross chart over ` +
    `${cleaned.length} bars (period ${period}). Top panel ` +
    `renders the close with bullish (price down while ` +
    `momentum up, bullish reversal warning) / bearish ` +
    `(price up while momentum down, bearish reversal ` +
    `warning) chevron overlays at every divergence-entry ` +
    `event; bottom panel renders the Momentum oscillator ` +
    `(close[i] - close[i-period]) with the zero reference ` +
    `line, markers coloured by momentum slope bias ` +
    `(rising / falling / flat) at the divergence-entry ` +
    `bar, flagging price versus momentum direction ` +
    `disagreement events for reversal warning.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineMomentumDivergenceCrossCrossKind,
  bias: ChartLineMomentumDivergenceCrossBias,
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

export const ChartLineMomentumDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineMomentumDivergenceCrossProps
>(function ChartLineMomentumDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_PRICE_COLOR,
    momentumColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_MOMENTUM_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_ZERO_LINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MOMENTUM_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMomentum = true,
    showZeroLine = true,
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
    () => getLineMomentumDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMomentumDivergenceCrossLayout({
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
    ChartLineMomentumDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineMomentumDivergenceCrossSeriesId,
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
    seriesId: ChartLineMomentumDivergenceCrossSeriesId,
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
        data-section="chart-line-momentum-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMomentumDivergenceCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showMomentumLine = !hidden.has('momentum') && showMomentum;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={
        ariaLabel ?? 'Momentum oscillator divergence-cross chart'
      }
      aria-describedby={descId}
      data-section="chart-line-momentum-divergence-cross"
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
        data-section="chart-line-momentum-divergence-cross-title"
      >
        {ariaLabel ?? 'Momentum oscillator divergence-cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-momentum-divergence-cross-aria-desc"
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
        data-section="chart-line-momentum-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-momentum-divergence-cross-grid">
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
                  data-section="chart-line-momentum-divergence-cross-grid-line-price"
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
                  data-section="chart-line-momentum-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-momentum-divergence-cross-axes">
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
                  data-section="chart-line-momentum-divergence-cross-tick-price"
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
                  data-section="chart-line-momentum-divergence-cross-tick-osc"
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
            data-section="chart-line-momentum-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-momentum-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-momentum-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroLineY}
            x2={layout.innerRight}
            y2={layout.zeroLineY}
            stroke={zeroLineColor}
            strokeDasharray="4 3"
            data-section="chart-line-momentum-divergence-cross-zero-line"
          />
        ) : null}

        {showMomentumLine ? (
          <path
            d={layout.momentumPath}
            stroke={momentumColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-momentum-divergence-cross-momentum-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-momentum-divergence-cross-crosses"
            role="group"
            aria-label="Momentum divergence trigger markers"
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
                aria-label={`${m.kind} momentum divergence at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-momentum-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-momentum-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay Momentum divergence trigger markers"
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
                data-section={`chart-line-momentum-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-momentum-divergence-cross-hover-targets">
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
                data-section="chart-line-momentum-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-momentum-divergence-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={288}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-divergence-cross-tooltip-momentum"
                >
                  M{' '}
                  {tooltipSample.momentum == null
                    ? '--'
                    : formatOsc(tooltipSample.momentum)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-momentum-divergence-cross-tooltip-biases"
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
          data-section="chart-line-momentum-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | divergences {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-momentum-divergence-cross-legend"
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
              {
                id: 'momentum' as const,
                color: momentumColor,
                label: 'Momentum',
              },
            ] satisfies Array<{
              id: ChartLineMomentumDivergenceCrossSeriesId;
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

ChartLineMomentumDivergenceCross.displayName =
  'ChartLineMomentumDivergenceCross';
