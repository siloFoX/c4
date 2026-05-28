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
 * ChartLineWilliamsOverboughtDivergence -- pure-SVG
 * dual-panel chart with the close in the top panel and
 * Larry Williams' Percent R (%R) in the bottom panel,
 * marking bullish (price down while %R up at overbought
 * levels -- contrarian dip-buy warning, less common) /
 * bearish (price up while %R down at overbought levels
 * -- **top reversal warning**) price-vs-%R direction
 * disagreement (divergence) trigger events with bias
 * coloring derived from the %R slope at the
 * divergence-entry bar. **Crosses are gated to the
 * overbought zone**: only fire when %R >=
 * overboughtLevel (default -20).
 *
 *   HH[i]  = max(high[i-period+1..i])
 *   LL[i]  = min(low[i-period+1..i])
 *   %R[i]  = (HH[i] - close[i]) / (HH[i] - LL[i]) * -100
 *
 *   (returns null when HH === LL to avoid div-by-zero)
 *
 *   Williams %R is bounded to [-100, 0] and INVERTED
 *   relative to typical oscillators: values near 0 mean
 *   the close is at the period high (overbought / top),
 *   values near -100 mean the close is at the period low
 *   (oversold / bottom).
 *
 *   priceUp     = close[i] > close[i-1]
 *   priceDown   = close[i] < close[i-1]
 *   wrUp        = %R[i]    > %R[i-1]
 *   wrDown      = %R[i]    < %R[i-1]
 *
 *   regime :
 *     'aligned-bullish'   when priceUp   && wrUp
 *     'aligned-bearish'   when priceDown && wrDown
 *     'divergent-bullish' when priceDown && wrUp
 *     'divergent-bearish' when priceUp   && wrDown
 *                         (PRIMARY: top reversal warning
 *                          when %R is in overbought zone)
 *     'none'              otherwise (null / any flat)
 *
 *   bullish cross (at overbought) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish' &&
 *     cur %R >= overboughtLevel
 *   bearish cross (at overbought) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish' &&
 *     cur %R >= overboughtLevel
 *
 *   bias : %R[i] vs %R[i-1] -> up/down/flat/none
 *
 * Defaults: `period = 14`, `overboughtLevel = -20` --
 * canonical Larry Williams (1973) %R tuning + classical
 * overbought threshold. Williams %R overbought zone is
 * -20..0 (close near the high); oversold zone is
 * -100..-80 (close near the low); the -50 line is the
 * midpoint. Divergences at overbought levels are the
 * strongest top reversal warning signals -- the
 * underlying momentum has reversed while the price still
 * shows elevated %R, indicating the recent advance is
 * losing steam at a stretched level. Same zone-gated
 * divergence mechanic as the CCI overbought/oversold
 * pair (chart-line-cci-overbought-divergence v1.11.1092,
 * chart-line-cci-oversold-divergence v1.11.1093), now
 * applied to the bounded [-100, 0] Williams %R oscillator.
 *
 * Sibling family:
 *   - chart-line-cci-overbought-divergence v1.11.1092 /
 *     chart-line-cci-oversold-divergence v1.11.1093 --
 *     the CCI zone-gated divergence pair this primitive
 *     generalises to Williams %R
 *   - chart-line-williams-r -- raw %R oscillator
 *   - chart-line-williams-r-cross / williams-r-cross-sig
 *     -- %R level / signal crosses
 *   - chart-line-williams-mid-cross-sig -- %R vs -50 mid
 *   - chart-line-williams-divergence-cross -- ungated %R
 *     divergence
 *   - this primitive: %R divergence gated to overbought
 *     zone (top reversal warning specialisation)
 *
 * Distinct from chart-line-williams-divergence-cross (the
 * ungated sibling): this primitive filters crosses to
 * only those that occur while %R is in the overbought
 * zone (>= -20). Fewer false positives, narrower
 * coverage -- specifically targets the classical "top
 * reversal warning" use case where divergence at elevated
 * levels is the strongest reversal indicator.
 *
 * Warmup is `period = 14` for the first %R value. Cross
 * detection needs the previous bar's regime, so the
 * first potential cross lands at i = period + 1 = 15.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`,
 *   `close = K`: HH = K + 1, LL = K - 1, close = K.
 *   %R = ((K+1) - K) / ((K+1) - (K-1)) * -100 = 1/2 *
 *   -100 = **-50** (constant midpoint). NOT in the
 *   overbought zone (-50 < -20). priceFlat, wrFlat ->
 *   regime `none`. 0 crosses. Verified across K in
 *   {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`,
 *   `close = i`: HH = i + 1 (at j = i), LL = i - period
 *   (at j = i-period+1), close = i. %R = ((i+1) - i) /
 *   ((i+1) - (i-period)) * -100 = 1 / (period + 1) *
 *   -100. For period = 14: **-6.667** (constant). IN
 *   the overbought zone (-6.667 >= -20; close near the
 *   period high). priceUp, wrFlat -> regime `none`. The
 *   gate passes but the flat %R produces no divergent
 *   state. 0 crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: HH = -i + period (at j = i-period+1),
 *   LL = -i - 1 (at j = i), close = -i. %R = period /
 *   (period + 1) * -100. For period = 14: **-93.333**
 *   (constant). NOT in the overbought zone (-93.333 <
 *   -20; close near the period low, i.e. oversold).
 *   priceDown, wrFlat -> regime `none`. The gate filters
 *   any divergent crosses. 0 crosses.
 *
 * The bounded [-100, 0] range lets the chart panel
 * hard-lock to that span with no auto-scaling, and the
 * CONST/LINEAR anchors all produce clean constant %R
 * values that exercise the overbought-zone gate from
 * both sides (LINEAR UP inside the zone, LINEAR DOWN and
 * CONST outside it).
 */

export interface ChartLineWilliamsOverboughtDivergencePoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineWilliamsOverboughtDivergenceRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineWilliamsOverboughtDivergenceBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineWilliamsOverboughtDivergenceSeriesId = 'price' | 'wr';

export type ChartLineWilliamsOverboughtDivergenceCrossKind = 'bullish' | 'bearish';

export interface ChartLineWilliamsOverboughtDivergenceCross {
  index: number;
  x: number;
  kind: ChartLineWilliamsOverboughtDivergenceCrossKind;
  bias: ChartLineWilliamsOverboughtDivergenceBias;
}

export interface ChartLineWilliamsOverboughtDivergenceSample {
  index: number;
  x: number;
  close: number;
  wr: number | null;
  regime: ChartLineWilliamsOverboughtDivergenceRegime;
  bias: ChartLineWilliamsOverboughtDivergenceBias;
  overbought: boolean;
}

export interface ChartLineWilliamsOverboughtDivergenceRun {
  series: ChartLineWilliamsOverboughtDivergencePoint[];
  period: number;
  overboughtLevel: number;
  wrValues: Array<number | null>;
  regimes: ChartLineWilliamsOverboughtDivergenceRegime[];
  samples: ChartLineWilliamsOverboughtDivergenceSample[];
  crosses: ChartLineWilliamsOverboughtDivergenceCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  overboughtCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineWilliamsOverboughtDivergenceDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineWilliamsOverboughtDivergenceLayout {
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
  priceDots: ChartLineWilliamsOverboughtDivergenceDot[];
  wrPath: string;
  overboughtLineY: number;
  oversoldLineY: number;
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
    kind: ChartLineWilliamsOverboughtDivergenceCrossKind;
    bias: ChartLineWilliamsOverboughtDivergenceBias;
  }>;
  run: ChartLineWilliamsOverboughtDivergenceRun;
}

export interface ChartLineWilliamsOverboughtDivergenceProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineWilliamsOverboughtDivergencePoint[];
  period?: number;
  overboughtLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  wrColor?: string;
  overboughtLineColor?: string;
  oversoldLineColor?: string;
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
  showWr?: boolean;
  showOverboughtLine?: boolean;
  showOversoldLine?: boolean;
  showZeroLine?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineWilliamsOverboughtDivergenceSeriesId[];
  defaultHiddenSeries?: ChartLineWilliamsOverboughtDivergenceSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineWilliamsOverboughtDivergenceSeriesId;
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

export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_WIDTH = 720;
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PADDING = 44;
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PERIOD = 14;
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LEVEL = -20;
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_WR_COLOR = '#a855f7';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LINE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERSOLD_LINE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_ZERO_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineWilliamsOverboughtDivergenceFinitePoints(
  data: readonly ChartLineWilliamsOverboughtDivergencePoint[] | null | undefined,
): ChartLineWilliamsOverboughtDivergencePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineWilliamsOverboughtDivergencePoint[] = [];
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

export function normalizeLineWilliamsOverboughtDivergenceLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineWilliamsOverboughtDivergenceLevel(
  level: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(level)) return level;
  return fallback;
}

export function computeLineWilliamsOverboughtDivergence(
  series: readonly ChartLineWilliamsOverboughtDivergencePoint[] | null | undefined,
  options: { period?: number } = {},
): Array<number | null> {
  const cleaned = getLineWilliamsOverboughtDivergenceFinitePoints(series);
  if (cleaned.length === 0) return [];
  const period = normalizeLineWilliamsOverboughtDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PERIOD,
  );
  const n = cleaned.length;
  const wr: Array<number | null> = new Array(n).fill(null);
  for (let i = period - 1; i < n; i += 1) {
    let highestHigh = -Infinity;
    let lowestLow = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      if (cleaned[j]!.high > highestHigh) highestHigh = cleaned[j]!.high;
      if (cleaned[j]!.low < lowestLow) lowestLow = cleaned[j]!.low;
    }
    const range = highestHigh - lowestLow;
    // Williams %R = (HighestHigh - Close) / (HH - LL) * -100.
    // Bounded to [-100, 0]: values near 0 = overbought (close at
    // the period high), values near -100 = oversold (close at the
    // period low). Guard against a zero range (flat window).
    if (range === 0) continue;
    wr[i] = posZero(((highestHigh - cleaned[i]!.close) / range) * -100);
  }
  return wr;
}

export function classifyLineWilliamsOverboughtDivergenceRegime(
  curClose: number | null,
  prevClose: number | null,
  curWr: number | null,
  prevWr: number | null,
): ChartLineWilliamsOverboughtDivergenceRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curWr == null ||
    prevWr == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const wrUp = curWr > prevWr;
  const wrDown = curWr < prevWr;
  if (priceUp && wrUp) return 'aligned-bullish';
  if (priceDown && wrDown) return 'aligned-bearish';
  if (priceDown && wrUp) return 'divergent-bullish';
  if (priceUp && wrDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineWilliamsOverboughtDivergenceBias(
  cur: number | null,
  prev: number | null,
): ChartLineWilliamsOverboughtDivergenceBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineWilliamsOverboughtDivergenceCrosses(
  series: readonly ChartLineWilliamsOverboughtDivergencePoint[],
  regimes: readonly ChartLineWilliamsOverboughtDivergenceRegime[],
  wrValues: readonly (number | null)[],
  overboughtLevel: number,
): ChartLineWilliamsOverboughtDivergenceCross[] {
  const out: ChartLineWilliamsOverboughtDivergenceCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevWr = wrValues[i - 1];
    const curWr = wrValues[i];
    if (curWr == null) continue;
    // Overbought-zone gate (current bar must be at/above level).
    if (curWr < overboughtLevel) continue;
    const bias = classifyLineWilliamsOverboughtDivergenceBias(
      curWr ?? null,
      prevWr ?? null,
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

export function runLineWilliamsOverboughtDivergence(
  data: ChartLineWilliamsOverboughtDivergencePoint[],
  options: { period?: number; overboughtLevel?: number } = {},
): ChartLineWilliamsOverboughtDivergenceRun {
  const cleaned = getLineWilliamsOverboughtDivergenceFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineWilliamsOverboughtDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PERIOD,
  );
  const overboughtLevel = normalizeLineWilliamsOverboughtDivergenceLevel(
    options.overboughtLevel,
    DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LEVEL,
  );

  const wrValues = computeLineWilliamsOverboughtDivergence(series, { period });

  const regimes: ChartLineWilliamsOverboughtDivergenceRegime[] = series.map(
    (_, i) => {
      if (i === 0) return 'none';
      return classifyLineWilliamsOverboughtDivergenceRegime(
        series[i]!.close,
        series[i - 1]!.close,
        wrValues[i] ?? null,
        wrValues[i - 1] ?? null,
      );
    },
  );

  const samples: ChartLineWilliamsOverboughtDivergenceSample[] = series.map(
    (p, i) => {
      const wr = wrValues[i] ?? null;
      const prevWr = i > 0 ? (wrValues[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        wr,
        regime: regimes[i] ?? 'none',
        bias: classifyLineWilliamsOverboughtDivergenceBias(wr, prevWr),
        overbought: wr != null && wr >= overboughtLevel,
      };
    },
  );

  const crosses = detectLineWilliamsOverboughtDivergenceCrosses(
    series,
    regimes,
    wrValues,
    overboughtLevel,
  );

  let alignedBullishCount = 0;
  let alignedBearishCount = 0;
  let divergentBullishCount = 0;
  let divergentBearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  let overboughtCount = 0;
  for (const s of samples) {
    if (s.regime === 'aligned-bullish') alignedBullishCount += 1;
    else if (s.regime === 'aligned-bearish') alignedBearishCount += 1;
    else if (s.regime === 'divergent-bullish') divergentBullishCount += 1;
    else if (s.regime === 'divergent-bearish') divergentBearishCount += 1;
    else noneCount += 1;
    if (s.bias === 'up') upBiasCount += 1;
    else if (s.bias === 'down') downBiasCount += 1;
    else if (s.bias === 'flat') flatBiasCount += 1;
    if (s.overbought) overboughtCount += 1;
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
    overboughtLevel,
    wrValues,
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
    overboughtCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineWilliamsOverboughtDivergenceLayoutOptions {
  data: ChartLineWilliamsOverboughtDivergencePoint[];
  period?: number;
  overboughtLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineWilliamsOverboughtDivergenceLayout(
  opts: ComputeLineWilliamsOverboughtDivergenceLayoutOptions,
): ChartLineWilliamsOverboughtDivergenceLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PANEL_GAP;

  const run = runLineWilliamsOverboughtDivergence(opts.data, {
    period: opts.period ?? undefined,
    overboughtLevel: opts.overboughtLevel ?? undefined,
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
      wrPath: '',
      overboughtLineY: oscTop,
      oversoldLineY: oscBottom,
      zeroLineY: (oscTop + oscBottom) / 2,
      priceMin: 0,
      priceMax: 0,
      oscMin: -100,
      oscMax: 0,
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

  // Williams %R is mathematically bounded to [-100, 0]. Hard-lock
  // the panel to this range -- no auto-scaling needed.
  const oscMin = -100;
  const oscMax = 0;

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

  // Williams %R reference lines: overbought at overboughtLevel
  // (default -20), oversold at -80, and the -50 midline (the
  // `zeroLineY` field repurposed as the Williams midline).
  const overboughtLineY = syOsc(run.overboughtLevel);
  const oversoldLineY = syOsc(-80);
  const zeroLineY = syOsc(-50);

  let pricePath = '';
  const priceDots: ChartLineWilliamsOverboughtDivergenceDot[] = [];
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

  let wrPath = '';
  let firstWr = true;
  for (const s of run.samples) {
    if (s.wr == null) {
      firstWr = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOsc(s.wr);
    wrPath += `${firstWr ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstWr = false;
  }
  wrPath = wrPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const wrAt = run.wrValues[c.index];
    const cyOsc = wrAt != null ? syOsc(wrAt) : oscBottom;
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
    wrPath,
    overboughtLineY,
    oversoldLineY,
    zeroLineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineWilliamsOverboughtDivergenceChart(
  data: ChartLineWilliamsOverboughtDivergencePoint[],
  options: { period?: number; overboughtLevel?: number } = {},
): string {
  const cleaned = getLineWilliamsOverboughtDivergenceFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineWilliamsOverboughtDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PERIOD,
  );
  const overboughtLevel = normalizeLineWilliamsOverboughtDivergenceLevel(
    options.overboughtLevel,
    DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LEVEL,
  );
  return (
    `Williams Percent R overbought-zone divergence chart ` +
    `over ${cleaned.length} bars (period ${period}, ` +
    `overbought ${overboughtLevel}). Top panel renders the ` +
    `close with bullish (price down while %R up at ` +
    `overbought levels) / bearish (price up while %R ` +
    `down at overbought levels, top reversal warning) ` +
    `chevron overlays at every divergence-entry event ` +
    `while %R is at or above the overbought threshold; ` +
    `bottom panel renders Larry Williams' (1973) Percent ` +
    `R ((highest high - close) / (highest high - lowest ` +
    `low) * -100, bounded to [-100, 0]) with the ` +
    `overbought (-20) / oversold (-80) reference lines ` +
    `and -50 midline, markers coloured by %R slope bias ` +
    `(rising / falling / flat) at the divergence-entry ` +
    `bar, flagging price versus %R direction ` +
    `disagreement at elevated levels for top reversal ` +
    `warning.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineWilliamsOverboughtDivergenceCrossKind,
  bias: ChartLineWilliamsOverboughtDivergenceBias,
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

export const ChartLineWilliamsOverboughtDivergence = forwardRef<
  HTMLDivElement,
  ChartLineWilliamsOverboughtDivergenceProps
>(function ChartLineWilliamsOverboughtDivergence(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PERIOD,
    overboughtLevel = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LEVEL,
    width = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_WIDTH,
    height = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_HEIGHT,
    padding = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PADDING,
    panelGap = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_PRICE_COLOR,
    wrColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_WR_COLOR,
    overboughtLineColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERBOUGHT_LINE_COLOR,
    oversoldLineColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_OVERSOLD_LINE_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_ZERO_LINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_WILLIAMS_OVERBOUGHT_DIVERGENCE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWr = true,
    showOverboughtLine = true,
    showOversoldLine = true,
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
    () => getLineWilliamsOverboughtDivergenceFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineWilliamsOverboughtDivergenceLayout({
        data: cleaned,
        period,
        overboughtLevel,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      period,
      overboughtLevel,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineWilliamsOverboughtDivergenceSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineWilliamsOverboughtDivergenceSeriesId,
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
    seriesId: ChartLineWilliamsOverboughtDivergenceSeriesId,
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
        data-section="chart-line-williams-overbought-divergence-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineWilliamsOverboughtDivergenceChart(cleaned, {
      period,
      overboughtLevel,
    });

  const showPrice = !hidden.has('price');
  const showWrLine = !hidden.has('wr') && showWr;

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
        ariaLabel ?? 'Williams %R overbought-zone divergence chart'
      }
      aria-describedby={descId}
      data-section="chart-line-williams-overbought-divergence"
      data-period={period}
      data-overbought-level={overboughtLevel}
      data-total-points={cleaned.length}
      data-aligned-bullish-count={layout.run.alignedBullishCount}
      data-aligned-bearish-count={layout.run.alignedBearishCount}
      data-divergent-bullish-count={layout.run.divergentBullishCount}
      data-divergent-bearish-count={layout.run.divergentBearishCount}
      data-none-count={layout.run.noneCount}
      data-overbought-count={layout.run.overboughtCount}
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
        data-section="chart-line-williams-overbought-divergence-title"
      >
        {ariaLabel ?? 'Williams %R overbought-zone divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-williams-overbought-divergence-aria-desc"
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
        data-section="chart-line-williams-overbought-divergence-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-williams-overbought-divergence-grid">
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
                  data-section="chart-line-williams-overbought-divergence-grid-line-price"
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
                  data-section="chart-line-williams-overbought-divergence-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-williams-overbought-divergence-axes">
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
                  data-section="chart-line-williams-overbought-divergence-tick-price"
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
                  data-section="chart-line-williams-overbought-divergence-tick-osc"
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
            data-section="chart-line-williams-overbought-divergence-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-williams-overbought-divergence-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-williams-overbought-divergence-price-dot"
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
            data-section="chart-line-williams-overbought-divergence-zero-line"
          />
        ) : null}

        {showOverboughtLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.overboughtLineY}
            x2={layout.innerRight}
            y2={layout.overboughtLineY}
            stroke={overboughtLineColor}
            strokeDasharray="3 2"
            data-section="chart-line-williams-overbought-divergence-overbought-line"
          />
        ) : null}

        {showOversoldLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.oversoldLineY}
            x2={layout.innerRight}
            y2={layout.oversoldLineY}
            stroke={oversoldLineColor}
            strokeDasharray="3 2"
            data-section="chart-line-williams-overbought-divergence-oversold-line"
          />
        ) : null}

        {showWrLine ? (
          <path
            d={layout.wrPath}
            stroke={wrColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-williams-overbought-divergence-wr-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-williams-overbought-divergence-crosses"
            role="group"
            aria-label="Williams %R overbought-divergence trigger markers"
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
                aria-label={`${m.kind} Williams %R overbought divergence at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-williams-overbought-divergence-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-williams-overbought-divergence-overlay-crosses"
            role="group"
            aria-label="overlay Williams %R overbought-divergence trigger markers"
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
                data-section={`chart-line-williams-overbought-divergence-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-williams-overbought-divergence-hover-targets">
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
                data-section="chart-line-williams-overbought-divergence-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-williams-overbought-divergence-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={288}
                  height={160}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-wr"
                >
                  %R{' '}
                  {tooltipSample.wr == null
                    ? '--'
                    : formatOsc(tooltipSample.wr)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-overbought"
                >
                  overbought {tooltipSample.overbought ? 'yes' : 'no'}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-overbought-divergence-tooltip-overbought-count"
                >
                  bars overbought {layout.run.overboughtCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-williams-overbought-divergence-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | overbought {overboughtLevel} | divergences{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-williams-overbought-divergence-legend"
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
              { id: 'wr' as const, color: wrColor, label: '%R' },
            ] satisfies Array<{
              id: ChartLineWilliamsOverboughtDivergenceSeriesId;
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

ChartLineWilliamsOverboughtDivergence.displayName =
  'ChartLineWilliamsOverboughtDivergence';
