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
 * ChartLineSupertrendDivergenceCross -- pure-SVG dual-panel
 * chart with the close in the top panel and the Supertrend
 * line in the bottom panel, marking price vs supertrend
 * direction-disagreement events as trend-stop reversal
 * warnings.
 *
 *   hl2[i]       = (high[i] + low[i]) / 2
 *   tr[i]        = max(high[i] - low[i],
 *                      |high[i] - close[i-1]|,
 *                      |low[i]  - close[i-1]|)
 *   atr[i]       = SMA(tr, period)
 *   upperBand[i] = hl2[i] + multiplier * atr[i]
 *   lowerBand[i] = hl2[i] - multiplier * atr[i]
 *   finalUpper[i] = upperBand[i] when
 *                   upperBand[i] < finalUpper[i-1] OR
 *                   close[i-1]   > finalUpper[i-1]
 *                   else finalUpper[i-1]
 *   finalLower[i] = lowerBand[i] when
 *                   lowerBand[i] > finalLower[i-1] OR
 *                   close[i-1]   < finalLower[i-1]
 *                   else finalLower[i-1]
 *   supertrend[i] = up-trend  -> finalLower[i]
 *                   downtrend -> finalUpper[i]
 *                   (direction flips when close breaches
 *                   the active band)
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   stUp        : supertrend[i] > supertrend[i-1]
 *   stDown      : supertrend[i] < supertrend[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && stUp
 *     'aligned-bearish'   when priceDown && stDown
 *     'divergent-bullish' when priceDown && stUp
 *                          (price falling but supertrend
 *                           rising -- bullish trend-stop
 *                           reversal warning)
 *     'divergent-bearish' when priceUp   && stDown
 *                          (price rising but supertrend
 *                           falling -- bearish trend-stop
 *                           reversal warning)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : supertrend[i] vs supertrend[i-1] ->
 *                 up / down / flat / none
 *
 * Defaults: `period = 10`, `multiplier = 3`. Olivier Seban's
 * Supertrend (2007) is a trailing-stop volatility envelope
 * that "ratchets" -- the supertrend line only moves in the
 * direction of the trend (up in an uptrend, down in a
 * downtrend) and flips bands when close breaches the active
 * band. Compared to MA-based divergence detectors, the
 * supertrend's stair-step behaviour means the divergence
 * detector fires on trend-stop flips (sharp opposite-
 * direction snaps when the band changes).
 *
 * Initial trend direction is detected at `i = period` from
 * `sign(close[period] - close[period - 1])`: positive ->
 * uptrend (supertrend = lowerBand), negative -> downtrend
 * (supertrend = upperBand), zero -> uptrend by convention.
 *
 * Warmup is `period - 1 = 9` for the default tuning: ATR
 * first valid at i = period - 1. Supertrend recurrence
 * starts at i = period. Divergence detection requires the
 * previous supertrend + close, so the first regime
 * classification lands at i = period + 1 = 11.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: hl2 = K, tr = max(2, 1, 1) = 2, atr = 2, mult
 *   * atr = 6. upperBand = K + 6, lowerBand = K - 6.
 *   Initial direction from close[period] - close[period
 *   - 1] = 0 -> uptrend. supertrend = lowerBand = K - 6
 *   flat throughout (no flip, since close = K stays
 *   between bands). Both close and supertrend are flat
 *   -> regime `none` for every bar. 0 divergence crosses.
 *   Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: hl2 = i, tr = max(2, 2, 0) = 2, atr = 2,
 *   bands = i +/- 6. Initial direction at i = period
 *   from close[period] - close[period - 1] = +1 ->
 *   uptrend. supertrend = lowerBand = i - 6, rising at
 *   +1 per bar from i = period onwards. Both close and
 *   supertrend rising -> regime `aligned-bullish`. 0
 *   divergence crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: hl2 = -i, tr = max(2, 0, 2) = 2, atr
 *   = 2, bands = -i +/- 6. Initial direction at i =
 *   period from close[period] - close[period - 1] = -1
 *   -> downtrend. supertrend = upperBand = -i + 6,
 *   falling at -1 per bar. Both close and supertrend
 *   falling -> regime `aligned-bearish`. 0 divergence
 *   crosses.
 */

export interface ChartLineSupertrendDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineSupertrendDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineSupertrendDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineSupertrendDivergenceCrossSeriesId =
  | 'price'
  | 'supertrend';

export type ChartLineSupertrendDivergenceCrossCrossKind =
  | 'bullish'
  | 'bearish';

export type ChartLineSupertrendDivergenceCrossTrend = 'up' | 'down';

export interface ChartLineSupertrendDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineSupertrendDivergenceCrossCrossKind;
  bias: ChartLineSupertrendDivergenceCrossBias;
}

export interface ChartLineSupertrendDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  supertrend: number | null;
  trend: ChartLineSupertrendDivergenceCrossTrend | null;
  regime: ChartLineSupertrendDivergenceCrossRegime;
  bias: ChartLineSupertrendDivergenceCrossBias;
}

export interface ChartLineSupertrendDivergenceCrossRun {
  series: ChartLineSupertrendDivergenceCrossPoint[];
  period: number;
  multiplier: number;
  atrValues: Array<number | null>;
  upperBandValues: Array<number | null>;
  lowerBandValues: Array<number | null>;
  finalUpperValues: Array<number | null>;
  finalLowerValues: Array<number | null>;
  supertrendValues: Array<number | null>;
  trendDirections: Array<ChartLineSupertrendDivergenceCrossTrend | null>;
  samples: ChartLineSupertrendDivergenceCrossSample[];
  crosses: ChartLineSupertrendDivergenceCrossCross[];
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

export interface ChartLineSupertrendDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSupertrendDivergenceCrossLayout {
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
  priceDots: ChartLineSupertrendDivergenceCrossDot[];
  supertrendPath: string;
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
    kind: ChartLineSupertrendDivergenceCrossCrossKind;
    bias: ChartLineSupertrendDivergenceCrossBias;
  }>;
  run: ChartLineSupertrendDivergenceCrossRun;
}

export interface ChartLineSupertrendDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSupertrendDivergenceCrossPoint[];
  period?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  supertrendColor?: string;
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
  showSupertrend?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSupertrendDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineSupertrendDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSupertrendDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PERIOD = 10;
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_MULTIPLIER = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_SUPERTREND_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineSupertrendDivergenceCrossFinitePoints(
  data:
    | readonly ChartLineSupertrendDivergenceCrossPoint[]
    | null
    | undefined,
): ChartLineSupertrendDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSupertrendDivergenceCrossPoint[] = [];
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

export function normalizeLineSupertrendDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineSupertrendDivergenceCrossMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

export interface SupertrendDivergenceCrossChannels {
  atr: Array<number | null>;
  upperBand: Array<number | null>;
  lowerBand: Array<number | null>;
  finalUpper: Array<number | null>;
  finalLower: Array<number | null>;
  supertrend: Array<number | null>;
  trend: Array<ChartLineSupertrendDivergenceCrossTrend | null>;
}

export function computeLineSupertrendDivergenceCross(
  series:
    | readonly ChartLineSupertrendDivergenceCrossPoint[]
    | null
    | undefined,
  options: { period?: number; multiplier?: number } = {},
): SupertrendDivergenceCrossChannels {
  const cleaned = getLineSupertrendDivergenceCrossFinitePoints(series);
  const n = cleaned.length;
  if (n === 0) {
    return {
      atr: [],
      upperBand: [],
      lowerBand: [],
      finalUpper: [],
      finalLower: [],
      supertrend: [],
      trend: [],
    };
  }
  const period = normalizeLineSupertrendDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PERIOD,
  );
  const multiplier = normalizeLineSupertrendDivergenceCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_MULTIPLIER,
  );

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
  // First ATR uses the average of TR values from i=1..period.
  if (n > period) {
    let sum = 0;
    let valid = true;
    for (let j = 1; j <= period; j += 1) {
      const v = tr[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (valid) {
      atr[period] = posZero(sum / period);
      for (let i = period + 1; i < n; i += 1) {
        const prevAtr = atr[i - 1];
        const curTr = tr[i];
        if (prevAtr == null || curTr == null) continue;
        atr[i] = posZero(
          (prevAtr * (period - 1) + curTr) / period,
        );
      }
    }
  }

  const upperBand: Array<number | null> = new Array(n).fill(null);
  const lowerBand: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const a = atr[i];
    if (a == null) continue;
    const p = cleaned[i]!;
    const hl2 = (p.high + p.low) / 2;
    upperBand[i] = posZero(hl2 + multiplier * a);
    lowerBand[i] = posZero(hl2 - multiplier * a);
  }

  const finalUpper: Array<number | null> = new Array(n).fill(null);
  const finalLower: Array<number | null> = new Array(n).fill(null);
  const supertrend: Array<number | null> = new Array(n).fill(null);
  const trend: Array<ChartLineSupertrendDivergenceCrossTrend | null> =
    new Array(n).fill(null);

  if (n > period) {
    finalUpper[period] = upperBand[period] ?? null;
    finalLower[period] = lowerBand[period] ?? null;
    // Initial trend direction from close[period] vs close[period-1].
    const initDelta =
      cleaned[period]!.close - cleaned[period - 1]!.close;
    const initTrend: ChartLineSupertrendDivergenceCrossTrend =
      initDelta < 0 ? 'down' : 'up';
    trend[period] = initTrend;
    supertrend[period] =
      initTrend === 'up' ? finalLower[period] : finalUpper[period];

    for (let i = period + 1; i < n; i += 1) {
      const ub = upperBand[i];
      const lb = lowerBand[i];
      const prevFinalUpper = finalUpper[i - 1];
      const prevFinalLower = finalLower[i - 1];
      const prevClose = cleaned[i - 1]!.close;
      const prevTrend = trend[i - 1]!;
      if (
        ub == null ||
        lb == null ||
        prevFinalUpper == null ||
        prevFinalLower == null
      )
        continue;

      const fu =
        ub < prevFinalUpper || prevClose > prevFinalUpper
          ? ub
          : prevFinalUpper;
      const fl =
        lb > prevFinalLower || prevClose < prevFinalLower
          ? lb
          : prevFinalLower;
      finalUpper[i] = posZero(fu);
      finalLower[i] = posZero(fl);

      const curClose = cleaned[i]!.close;
      let newTrend: ChartLineSupertrendDivergenceCrossTrend = prevTrend;
      if (prevTrend === 'up') {
        if (curClose < fl) newTrend = 'down';
      } else {
        if (curClose > fu) newTrend = 'up';
      }
      trend[i] = newTrend;
      supertrend[i] = posZero(newTrend === 'up' ? fl : fu);
    }
  }

  return {
    atr,
    upperBand,
    lowerBand,
    finalUpper,
    finalLower,
    supertrend,
    trend,
  };
}

export function classifyLineSupertrendDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curSupertrend: number | null,
  prevSupertrend: number | null,
): ChartLineSupertrendDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curSupertrend == null ||
    prevSupertrend == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const stUp = curSupertrend > prevSupertrend;
  const stDown = curSupertrend < prevSupertrend;
  if (priceUp && stUp) return 'aligned-bullish';
  if (priceDown && stDown) return 'aligned-bearish';
  if (priceDown && stUp) return 'divergent-bullish';
  if (priceUp && stDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineSupertrendDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineSupertrendDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineSupertrendDivergenceCrossCrosses(
  series: readonly ChartLineSupertrendDivergenceCrossPoint[],
  regimes: readonly ChartLineSupertrendDivergenceCrossRegime[],
  supertrendValues: readonly (number | null)[],
): ChartLineSupertrendDivergenceCrossCross[] {
  const out: ChartLineSupertrendDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevSt = supertrendValues[i - 1];
    const curSt = supertrendValues[i];
    const bias = classifyLineSupertrendDivergenceCrossBias(
      curSt ?? null,
      prevSt ?? null,
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

export function runLineSupertrendDivergenceCross(
  data: ChartLineSupertrendDivergenceCrossPoint[],
  options: { period?: number; multiplier?: number } = {},
): ChartLineSupertrendDivergenceCrossRun {
  const cleaned = getLineSupertrendDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineSupertrendDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PERIOD,
  );
  const multiplier = normalizeLineSupertrendDivergenceCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_MULTIPLIER,
  );

  const channels = computeLineSupertrendDivergenceCross(series, {
    period,
    multiplier,
  });

  const regimes: ChartLineSupertrendDivergenceCrossRegime[] = series.map(
    (p, i) => {
      if (i === 0) return 'none';
      const prevSample = series[i - 1];
      const curSt = channels.supertrend[i] ?? null;
      const prevSt = channels.supertrend[i - 1] ?? null;
      return classifyLineSupertrendDivergenceCrossRegime(
        p.close,
        prevSample ? prevSample.close : null,
        curSt,
        prevSt,
      );
    },
  );

  const samples: ChartLineSupertrendDivergenceCrossSample[] = series.map(
    (p, i) => {
      const supertrend = channels.supertrend[i] ?? null;
      const prevSt = i > 0 ? (channels.supertrend[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        supertrend,
        trend: channels.trend[i] ?? null,
        regime: regimes[i] ?? 'none',
        bias: classifyLineSupertrendDivergenceCrossBias(supertrend, prevSt),
      };
    },
  );

  const crosses = detectLineSupertrendDivergenceCrossCrosses(
    series,
    regimes,
    channels.supertrend,
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
    multiplier,
    atrValues: channels.atr,
    upperBandValues: channels.upperBand,
    lowerBandValues: channels.lowerBand,
    finalUpperValues: channels.finalUpper,
    finalLowerValues: channels.finalLower,
    supertrendValues: channels.supertrend,
    trendDirections: channels.trend,
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

export interface ComputeLineSupertrendDivergenceCrossLayoutOptions {
  data: ChartLineSupertrendDivergenceCrossPoint[];
  period?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSupertrendDivergenceCrossLayout(
  opts: ComputeLineSupertrendDivergenceCrossLayoutOptions,
): ChartLineSupertrendDivergenceCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ??
    DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineSupertrendDivergenceCross(opts.data, {
    period: opts.period ?? undefined,
    multiplier: opts.multiplier ?? undefined,
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
  for (let i = 0; i < run.supertrendValues.length; i += 1) {
    const s = run.supertrendValues[i];
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
      supertrendPath: '',
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
  const priceDots: ChartLineSupertrendDivergenceCrossDot[] = [];
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

  let supertrendPath = '';
  let firstSt = true;
  for (const s of run.samples) {
    if (s.supertrend == null) {
      firstSt = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.supertrend);
    supertrendPath += `${firstSt ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstSt = false;
  }
  supertrendPath = supertrendPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const stAtCross = run.supertrendValues[c.index];
    const cyOsc = stAtCross != null ? syOscBase(stAtCross) : oscBottom;
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
    supertrendPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineSupertrendDivergenceCrossChart(
  data: ChartLineSupertrendDivergenceCrossPoint[],
  options: { period?: number; multiplier?: number } = {},
): string {
  const cleaned = getLineSupertrendDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineSupertrendDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PERIOD,
  );
  const multiplier = normalizeLineSupertrendDivergenceCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_MULTIPLIER,
  );
  return (
    `Supertrend divergence chart over ${cleaned.length} bars ` +
    `(period ${period}, multiplier ${multiplier}). Top panel ` +
    `renders the close with bullish (price falling while ` +
    `supertrend rising, bullish divergence -- trend stop ` +
    `reversal warning up) / bearish (price rising while ` +
    `supertrend falling, bearish divergence -- trend stop ` +
    `reversal warning down) chevron overlays at every price- ` +
    `vs-supertrend direction-disagreement transition; bottom ` +
    `panel renders the Olivier Seban Supertrend trailing-stop ` +
    `volatility envelope with markers coloured by supertrend ` +
    `slope bias (rising / falling / flat) at the trigger bar, ` +
    `flagging trend stop reversal warning events with bias ` +
    `coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineSupertrendDivergenceCrossCrossKind,
  bias: ChartLineSupertrendDivergenceCrossBias,
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

export const ChartLineSupertrendDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineSupertrendDivergenceCrossProps
>(function ChartLineSupertrendDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PERIOD,
    multiplier = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_MULTIPLIER,
    width = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_PRICE_COLOR,
    supertrendColor = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_SUPERTREND_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SUPERTREND_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSupertrend = true,
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
    () => getLineSupertrendDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSupertrendDivergenceCrossLayout({
        data: cleaned,
        period,
        multiplier,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, period, multiplier, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSupertrendDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineSupertrendDivergenceCrossSeriesId,
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
    seriesId: ChartLineSupertrendDivergenceCrossSeriesId,
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
        data-section="chart-line-supertrend-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSupertrendDivergenceCrossChart(cleaned, {
      period,
      multiplier,
    });

  const showPrice = !hidden.has('price');
  const showSupertrendLine = !hidden.has('supertrend') && showSupertrend;

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
      aria-label={ariaLabel ?? 'Supertrend divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-supertrend-divergence-cross"
      data-period={period}
      data-multiplier={multiplier}
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
        data-section="chart-line-supertrend-divergence-cross-title"
      >
        {ariaLabel ?? 'Supertrend divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-supertrend-divergence-cross-aria-desc"
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
        data-section="chart-line-supertrend-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-supertrend-divergence-cross-grid">
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
                  data-section="chart-line-supertrend-divergence-cross-grid-line-price"
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
                  data-section="chart-line-supertrend-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-supertrend-divergence-cross-axes">
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
                  data-section="chart-line-supertrend-divergence-cross-tick-price"
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
                  data-section="chart-line-supertrend-divergence-cross-tick-osc"
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
            data-section="chart-line-supertrend-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-supertrend-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-supertrend-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSupertrendLine ? (
          <path
            d={layout.supertrendPath}
            stroke={supertrendColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-supertrend-divergence-cross-supertrend-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-supertrend-divergence-cross-crosses"
            role="group"
            aria-label="Supertrend divergence trigger markers"
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
                aria-label={`${m.kind} Supertrend divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-supertrend-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-supertrend-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay Supertrend divergence trigger markers"
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
                data-section={`chart-line-supertrend-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-supertrend-divergence-cross-hover-targets">
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
                data-section="chart-line-supertrend-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-supertrend-divergence-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={272}
                  height={160}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-st"
                >
                  supertrend{' '}
                  {tooltipSample.supertrend == null
                    ? '--'
                    : formatOsc(tooltipSample.supertrend)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-trend"
                >
                  trend {tooltipSample.trend ?? '--'}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-divergence-cross-tooltip-biases"
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
          data-section="chart-line-supertrend-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | mult {multiplier} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-supertrend-divergence-cross-legend"
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
                id: 'supertrend' as const,
                color: supertrendColor,
                label: 'supertrend',
              },
            ] satisfies Array<{
              id: ChartLineSupertrendDivergenceCrossSeriesId;
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

ChartLineSupertrendDivergenceCross.displayName =
  'ChartLineSupertrendDivergenceCross';
