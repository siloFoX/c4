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
 * ChartLineAdxPosNegDivergence -- pure-SVG dual-panel chart
 * with the close in the top panel and the Average
 * Directional Index +DI and -DI directional indicators in
 * the bottom panel, marking +DI-vs--DI direction
 * disagreement events as trend strength divergence
 * triggers.
 *
 * Unlike the price-vs-indicator divergence-cross family,
 * this primitive compares the **two directional
 * indicators against each other**: the +DI direction
 * (bullish trend strength) against the -DI direction
 * (bearish trend strength). When the two diverge in
 * direction, the trend-strength balance is shifting --
 * one side is strengthening while the other weakens.
 *
 *   upMove[i]    = high[i] - high[i-1]
 *   downMove[i]  = low[i-1] - low[i]
 *   +DM[i]       = (upMove > downMove && upMove > 0)
 *                  ? upMove : 0
 *   -DM[i]       = (downMove > upMove && downMove > 0)
 *                  ? downMove : 0
 *   tr[i]        = max(high - low,
 *                      |high - close[i-1]|,
 *                      |low  - close[i-1]|)
 *   smPlus[i]    = SMA(+DM, period)
 *   smMinus[i]   = SMA(-DM, period)
 *   smTr[i]      = SMA(tr,  period)
 *   plusDI[i]    = (smTr > 0) ? 100 * smPlus / smTr : 0
 *   minusDI[i]   = (smTr > 0) ? 100 * smMinus / smTr : 0
 *
 *   plusUp      : plusDI[i]  > plusDI[i-1]
 *   plusDown    : plusDI[i]  < plusDI[i-1]
 *   minusUp     : minusDI[i] > minusDI[i-1]
 *   minusDown   : minusDI[i] < minusDI[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when plusUp   && minusUp
 *                          (both strengthening -- indecisive
 *                           market with both sides active)
 *     'aligned-bearish'   when plusDown && minusDown
 *                          (both weakening -- range
 *                           collapse / consolidation)
 *     'divergent-bullish' when plusUp   && minusDown
 *                          (bullish strength rising while
 *                           bearish falls -- canonical
 *                           bull confirmation)
 *     'divergent-bearish' when plusDown && minusUp
 *                          (bullish strength falling while
 *                           bearish rises -- canonical
 *                           bear confirmation)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : (plusDI - minusDI) at the trigger bar vs
 *                 previous bar -> up / down / flat / none
 *
 * Defaults: `period = 14`. J. Welles Wilder Jr's 1978 ADX
 * system uses the +DI and -DI directional indicators to
 * measure the strength of bullish and bearish price
 * pressure. Each indicator is the smoothed directional
 * movement (DM) normalised by smoothed true range (TR);
 * convention bounds them to `[0, 100]`. This primitive's
 * divergence interpretation flags moments where the two
 * strengths move in opposite directions -- the canonical
 * trend-confirmation signal (one side gaining while the
 * other yields).
 *
 * Uses SMA-based smoothing (matching the
 * chart-line-adx-trend-cross v1.11.1047 and adx-* family
 * convention) rather than Wilder's exponential smoothing,
 * for bit-exact integer DI values on linear input. The
 * two ADX smoothing variants are a documented family-
 * level tuning choice.
 *
 * Warmup is `period = 14` for the default tuning: DM/TR
 * smoothing seeds at i = period = 14 (the SMA needs the
 * first `period` valid DM/TR samples, which seed from i =
 * 1), and direction detection needs the previous bar's
 * +DI/-DI, so the first regime classification lands at
 * i = period + 1 = 15.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: upMove = 0, downMove = 0 -> +DM = -DM = 0.
 *   TR = 2. smPlus = smMinus = 0, smTr = 2. plusDI =
 *   minusDI = 0. Both flat -> regime `none` for every
 *   valid bar. 0 crosses. Verified across K in {0, 1,
 *   50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: upMove = +1, downMove = -1. upMove > downMove
 *   AND upMove > 0 -> +DM = 1. -DM = 0. TR = 2. smPlus
 *   = 1, smMinus = 0, smTr = 2. plusDI = 50, minusDI =
 *   0 (constants). Both flat -> regime `none`. 0
 *   crosses. The +DI = 50 reflects the canonical Wilder
 *   reading on a steady linear uptrend: bullish
 *   directional movement is exactly half the true range.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: mirror -> +DM = 0, -DM = 1. plusDI =
 *   0, minusDI = 50 (constants). Both flat -> regime
 *   `none`. 0 crosses.
 */

export interface ChartLineAdxPosNegDivergencePoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAdxPosNegDivergenceRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineAdxPosNegDivergenceBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineAdxPosNegDivergenceSeriesId =
  | 'price'
  | 'plusDI'
  | 'minusDI';

export type ChartLineAdxPosNegDivergenceCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineAdxPosNegDivergenceCross {
  index: number;
  x: number;
  kind: ChartLineAdxPosNegDivergenceCrossKind;
  bias: ChartLineAdxPosNegDivergenceBias;
}

export interface ChartLineAdxPosNegDivergenceSample {
  index: number;
  x: number;
  close: number;
  plusDI: number | null;
  minusDI: number | null;
  diff: number | null;
  regime: ChartLineAdxPosNegDivergenceRegime;
  bias: ChartLineAdxPosNegDivergenceBias;
}

export interface ChartLineAdxPosNegDivergenceRun {
  series: ChartLineAdxPosNegDivergencePoint[];
  period: number;
  plusDIValues: Array<number | null>;
  minusDIValues: Array<number | null>;
  diffValues: Array<number | null>;
  samples: ChartLineAdxPosNegDivergenceSample[];
  crosses: ChartLineAdxPosNegDivergenceCross[];
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

export interface ChartLineAdxPosNegDivergenceDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxPosNegDivergenceLayout {
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
  priceDots: ChartLineAdxPosNegDivergenceDot[];
  plusDIPath: string;
  minusDIPath: string;
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
    kind: ChartLineAdxPosNegDivergenceCrossKind;
    bias: ChartLineAdxPosNegDivergenceBias;
  }>;
  run: ChartLineAdxPosNegDivergenceRun;
}

export interface ChartLineAdxPosNegDivergenceProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxPosNegDivergencePoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  plusDIColor?: string;
  minusDIColor?: string;
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
  showPlusDI?: boolean;
  showMinusDI?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxPosNegDivergenceSeriesId[];
  defaultHiddenSeries?: ChartLineAdxPosNegDivergenceSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxPosNegDivergenceSeriesId;
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

export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PERIOD = 14;
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PLUS_DI_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_MINUS_DI_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineAdxPosNegDivergenceFinitePoints(
  data: readonly ChartLineAdxPosNegDivergencePoint[] | null | undefined,
): ChartLineAdxPosNegDivergencePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxPosNegDivergencePoint[] = [];
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

export function normalizeLineAdxPosNegDivergenceLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface AdxPosNegDivergenceChannels {
  plusDI: Array<number | null>;
  minusDI: Array<number | null>;
}

export function computeLineAdxPosNegDivergence(
  series: readonly ChartLineAdxPosNegDivergencePoint[] | null | undefined,
  options: { period?: number } = {},
): AdxPosNegDivergenceChannels {
  const cleaned = getLineAdxPosNegDivergenceFinitePoints(series);
  if (cleaned.length === 0) {
    return { plusDI: [], minusDI: [] };
  }
  const period = normalizeLineAdxPosNegDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PERIOD,
  );

  const n = cleaned.length;
  const plusDM: Array<number | null> = new Array(n).fill(null);
  const minusDM: Array<number | null> = new Array(n).fill(null);
  const tr: Array<number | null> = new Array(n).fill(null);

  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]!;
    const prev = cleaned[i - 1]!;
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    if (upMove > downMove && upMove > 0) plusDM[i] = posZero(upMove);
    else plusDM[i] = 0;
    if (downMove > upMove && downMove > 0) minusDM[i] = posZero(downMove);
    else minusDM[i] = 0;

    const range = cur.high - cur.low;
    const hToPc = Math.abs(cur.high - prev.close);
    const lToPc = Math.abs(cur.low - prev.close);
    tr[i] = posZero(Math.max(range, hToPc, lToPc));
  }

  const plusDI: Array<number | null> = new Array(n).fill(null);
  const minusDI: Array<number | null> = new Array(n).fill(null);

  for (let i = period; i < n; i += 1) {
    let sumPlus = 0;
    let sumMinus = 0;
    let sumTr = 0;
    let valid = true;
    let plusMin = Infinity;
    let plusMax = -Infinity;
    let minusMin = Infinity;
    let minusMax = -Infinity;
    let trMin = Infinity;
    let trMax = -Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      const p = plusDM[j];
      const m = minusDM[j];
      const t = tr[j];
      if (p == null || m == null || t == null) {
        valid = false;
        break;
      }
      sumPlus += p;
      sumMinus += m;
      sumTr += t;
      if (p < plusMin) plusMin = p;
      if (p > plusMax) plusMax = p;
      if (m < minusMin) minusMin = m;
      if (m > minusMax) minusMax = m;
      if (t < trMin) trMin = t;
      if (t > trMax) trMax = t;
    }
    if (!valid) continue;
    const smPlus = plusMin === plusMax ? plusMin : posZero(sumPlus / period);
    const smMinus =
      minusMin === minusMax ? minusMin : posZero(sumMinus / period);
    const smTr = trMin === trMax ? trMin : posZero(sumTr / period);
    if (smTr > 0) {
      plusDI[i] = posZero((100 * smPlus) / smTr);
      minusDI[i] = posZero((100 * smMinus) / smTr);
    } else {
      plusDI[i] = 0;
      minusDI[i] = 0;
    }
  }

  return { plusDI, minusDI };
}

export function classifyLineAdxPosNegDivergenceRegime(
  curPlus: number | null,
  prevPlus: number | null,
  curMinus: number | null,
  prevMinus: number | null,
): ChartLineAdxPosNegDivergenceRegime {
  if (
    curPlus == null ||
    prevPlus == null ||
    curMinus == null ||
    prevMinus == null
  )
    return 'none';
  const plusUp = curPlus > prevPlus;
  const plusDown = curPlus < prevPlus;
  const minusUp = curMinus > prevMinus;
  const minusDown = curMinus < prevMinus;
  if (plusUp && minusUp) return 'aligned-bullish';
  if (plusDown && minusDown) return 'aligned-bearish';
  if (plusUp && minusDown) return 'divergent-bullish';
  if (plusDown && minusUp) return 'divergent-bearish';
  return 'none';
}

export function classifyLineAdxPosNegDivergenceBias(
  cur: number | null,
  prev: number | null,
): ChartLineAdxPosNegDivergenceBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineAdxPosNegDivergenceCrosses(
  series: readonly ChartLineAdxPosNegDivergencePoint[],
  regimes: readonly ChartLineAdxPosNegDivergenceRegime[],
  diffValues: readonly (number | null)[],
): ChartLineAdxPosNegDivergenceCross[] {
  const out: ChartLineAdxPosNegDivergenceCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevDiff = diffValues[i - 1];
    const curDiff = diffValues[i];
    const bias = classifyLineAdxPosNegDivergenceBias(
      curDiff ?? null,
      prevDiff ?? null,
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

export function runLineAdxPosNegDivergence(
  data: ChartLineAdxPosNegDivergencePoint[],
  options: { period?: number } = {},
): ChartLineAdxPosNegDivergenceRun {
  const cleaned = getLineAdxPosNegDivergenceFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineAdxPosNegDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PERIOD,
  );

  const channels = computeLineAdxPosNegDivergence(series, { period });

  const n = series.length;
  const diffValues: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const p = channels.plusDI[i];
    const m = channels.minusDI[i];
    if (p != null && m != null) {
      diffValues[i] = posZero(p - m);
    }
  }

  const regimes: ChartLineAdxPosNegDivergenceRegime[] = series.map(
    (_, i) => {
      if (i === 0) return 'none';
      return classifyLineAdxPosNegDivergenceRegime(
        channels.plusDI[i] ?? null,
        channels.plusDI[i - 1] ?? null,
        channels.minusDI[i] ?? null,
        channels.minusDI[i - 1] ?? null,
      );
    },
  );

  const samples: ChartLineAdxPosNegDivergenceSample[] = series.map(
    (p, i) => {
      const plus = channels.plusDI[i] ?? null;
      const minus = channels.minusDI[i] ?? null;
      const prevDiff = i > 0 ? (diffValues[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        plusDI: plus,
        minusDI: minus,
        diff: diffValues[i] ?? null,
        regime: regimes[i] ?? 'none',
        bias: classifyLineAdxPosNegDivergenceBias(
          diffValues[i] ?? null,
          prevDiff,
        ),
      };
    },
  );

  const crosses = detectLineAdxPosNegDivergenceCrosses(
    series,
    regimes,
    diffValues,
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
  const ok = n > warmup + 1;

  return {
    series,
    period,
    plusDIValues: channels.plusDI,
    minusDIValues: channels.minusDI,
    diffValues,
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

export interface ComputeLineAdxPosNegDivergenceLayoutOptions {
  data: ChartLineAdxPosNegDivergencePoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAdxPosNegDivergenceLayout(
  opts: ComputeLineAdxPosNegDivergenceLayoutOptions,
): ChartLineAdxPosNegDivergenceLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PANEL_GAP;

  const run = runLineAdxPosNegDivergence(opts.data, {
    period: opts.period ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // +DI/-DI are conventionally bounded to [0, 100]. Hard-lock the panel.
  const oscMin = 0;
  const oscMax = 100;
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
      plusDIPath: '',
      minusDIPath: '',
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
  const priceDots: ChartLineAdxPosNegDivergenceDot[] = [];
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

  const buildPath = (
    accessor: (s: ChartLineAdxPosNegDivergenceSample) => number | null,
  ): string => {
    let path = '';
    let first = true;
    for (const s of run.samples) {
      const v = accessor(s);
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syOscBase(v);
      path += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return path.trim();
  };

  const plusDIPath = buildPath((s) => s.plusDI);
  const minusDIPath = buildPath((s) => s.minusDI);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const plusAt = run.plusDIValues[c.index];
    const cyOsc = plusAt != null ? syOscBase(plusAt) : oscBottom;
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
    plusDIPath,
    minusDIPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineAdxPosNegDivergenceChart(
  data: ChartLineAdxPosNegDivergencePoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineAdxPosNegDivergenceFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineAdxPosNegDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PERIOD,
  );
  return (
    `ADX +DI / -DI divergence chart over ${cleaned.length} bars ` +
    `(period ${period}). Top panel renders the close with bullish ` +
    `(+DI rising while -DI falling -- bullish strength gaining, ` +
    `bearish weakening; trend strength divergence trigger up) / ` +
    `bearish (+DI falling while -DI rising -- bullish weakening, ` +
    `bearish gaining; trend strength divergence trigger down) ` +
    `chevron overlays at every +DI-vs--DI direction-disagreement ` +
    `transition; bottom panel renders J. Welles Wilder Jr's (1978) ` +
    `positive and negative directional indicators (each is 100 * ` +
    `smoothed directional movement divided by smoothed true range) ` +
    `with markers coloured by (+DI - -DI) slope bias (rising / ` +
    `falling / flat) at the trigger bar, flagging trend strength ` +
    `divergence trigger events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineAdxPosNegDivergenceCrossKind,
  bias: ChartLineAdxPosNegDivergenceBias,
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

export const ChartLineAdxPosNegDivergence = forwardRef<
  HTMLDivElement,
  ChartLineAdxPosNegDivergenceProps
>(function ChartLineAdxPosNegDivergence(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PERIOD,
    width = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PRICE_COLOR,
    plusDIColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_PLUS_DI_COLOR,
    minusDIColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_MINUS_DI_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_POS_NEG_DIVERGENCE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPlusDI = true,
    showMinusDI = true,
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
    () => getLineAdxPosNegDivergenceFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAdxPosNegDivergenceLayout({
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
    ChartLineAdxPosNegDivergenceSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineAdxPosNegDivergenceSeriesId,
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
    seriesId: ChartLineAdxPosNegDivergenceSeriesId,
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
        data-section="chart-line-adx-pos-neg-divergence-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAdxPosNegDivergenceChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showPlusDILine = !hidden.has('plusDI') && showPlusDI;
  const showMinusDILine = !hidden.has('minusDI') && showMinusDI;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, 25, 50, 75, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'ADX +DI / -DI divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-adx-pos-neg-divergence"
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
        data-section="chart-line-adx-pos-neg-divergence-title"
      >
        {ariaLabel ?? 'ADX +DI / -DI divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-adx-pos-neg-divergence-aria-desc"
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
        data-section="chart-line-adx-pos-neg-divergence-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-adx-pos-neg-divergence-grid">
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
                  data-section="chart-line-adx-pos-neg-divergence-grid-line-price"
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
                  data-section="chart-line-adx-pos-neg-divergence-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-adx-pos-neg-divergence-axes">
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
                  data-section="chart-line-adx-pos-neg-divergence-tick-price"
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
                  data-section="chart-line-adx-pos-neg-divergence-tick-osc"
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
            data-section="chart-line-adx-pos-neg-divergence-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-adx-pos-neg-divergence-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-adx-pos-neg-divergence-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showPlusDILine ? (
          <path
            d={layout.plusDIPath}
            stroke={plusDIColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-pos-neg-divergence-plus-di-path"
          />
        ) : null}

        {showMinusDILine ? (
          <path
            d={layout.minusDIPath}
            stroke={minusDIColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-pos-neg-divergence-minus-di-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-adx-pos-neg-divergence-crosses"
            role="group"
            aria-label="ADX +DI / -DI divergence trigger markers"
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
                aria-label={`${m.kind} ADX +DI / -DI divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-adx-pos-neg-divergence-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-adx-pos-neg-divergence-overlay-crosses"
            role="group"
            aria-label="overlay ADX +DI / -DI divergence trigger markers"
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
                data-section={`chart-line-adx-pos-neg-divergence-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-adx-pos-neg-divergence-hover-targets">
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
                data-section="chart-line-adx-pos-neg-divergence-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-adx-pos-neg-divergence-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={296}
                  height={160}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-plus-di"
                >
                  +DI{' '}
                  {tooltipSample.plusDI == null
                    ? '--'
                    : formatOsc(tooltipSample.plusDI)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-minus-di"
                >
                  -DI{' '}
                  {tooltipSample.minusDI == null
                    ? '--'
                    : formatOsc(tooltipSample.minusDI)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-diff"
                >
                  diff{' '}
                  {tooltipSample.diff == null
                    ? '--'
                    : formatOsc(tooltipSample.diff)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} |
                  bear {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-neg-divergence-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-adx-pos-neg-divergence-badge"
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
          data-section="chart-line-adx-pos-neg-divergence-legend"
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
              { id: 'plusDI' as const, color: plusDIColor, label: '+DI' },
              {
                id: 'minusDI' as const,
                color: minusDIColor,
                label: '-DI',
              },
            ] satisfies Array<{
              id: ChartLineAdxPosNegDivergenceSeriesId;
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

ChartLineAdxPosNegDivergence.displayName = 'ChartLineAdxPosNegDivergence';
