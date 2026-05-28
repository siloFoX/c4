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
 * ChartLineDiCrossSig -- pure-SVG dual-panel chart with the
 * close in the top panel and the Average Directional Index
 * +DI and -DI directional indicators in the bottom panel,
 * marking bullish (+DI crosses up through -DI -- bulls
 * overtake bears, trend direction change up) / bearish (+DI
 * crosses down through -DI -- bears overtake bulls, trend
 * direction change down) DI-vs-DI crossover trigger events
 * with bias coloring derived from the (+DI - -DI) slope at
 * the trigger bar.
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
 *   bullish (DI-cross up) :
 *     prev plusDI <= prev minusDI &&
 *     cur plusDI > cur minusDI
 *   bearish (DI-cross down) :
 *     prev plusDI >= prev minusDI &&
 *     cur plusDI < cur minusDI
 *
 *   regime       : 'bullish' when plusDI >= minusDI
 *                  'bearish' when plusDI <  minusDI
 *                  'none'    when either is null
 *   bias         : (plusDI - minusDI)[i] vs prev -> up /
 *                  down / flat / none
 *
 * Defaults: `period = 14`. The DI cross is the **oldest
 * signal** in J. Welles Wilder Jr's 1978 ADX system,
 * predating ADX itself: when the positive directional
 * indicator crosses the negative directional indicator, the
 * dominant directional pressure flips.
 *
 * Sibling family (ADX signal family):
 *   - chart-line-adx-trend-cross v1.11.1047 -- ADX vs
 *     20/25 threshold (trend strength)
 *   - chart-line-adx-pos-neg-divergence v1.11.1075 --
 *     +DI direction vs -DI direction (5-state)
 *   - chart-line-adx-pos-cross v1.11.1083 -- +DI vs zero
 *   - chart-line-adx-neg-cross v1.11.1084 -- -DI vs zero
 *   - this primitive: +DI vs -DI direct cross (3-state)
 *
 * Uses SMA-based smoothing (matching the adx-* family
 * convention) rather than Wilder's exponential smoothing,
 * for bit-exact integer DI values on linear input.
 *
 * Warmup is `period + 1 = 15` for the default tuning:
 * DM and TR seed at i = 1, SMA window-fills at i = period
 * = 14, and cross detection needs the previous bar's +DI
 * and -DI, so the first potential cross lands at i =
 * period + 1 = 15.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: upMove = 0, downMove = 0 -> +DM = -DM = 0. TR =
 *   2. smPlus = smMinus = 0, smTr = 2. plusDI = minusDI =
 *   0. plusDI === minusDI every bar -> no cross. regime
 *   `bullish` (via >=). 0 crosses. Verified across K in
 *   {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: upMove = +1, downMove = -1. +DM = 1, -DM = 0.
 *   TR = 2. plusDI = 50, minusDI = 0 (constants). plusDI
 *   - minusDI = +50 (bulls dominate). No cross. 0 crosses.
 *   regime `bullish`.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: upMove = -1, downMove = +1. +DM = 0,
 *   -DM = 1. plusDI = 0, minusDI = 50 (constants). plusDI
 *   - minusDI = -50 (bears dominate). No cross. 0 crosses.
 *   regime `bearish`.
 */

export interface ChartLineDiCrossSigPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineDiCrossSigRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineDiCrossSigBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineDiCrossSigSeriesId = 'price' | 'plusDI' | 'minusDI';

export type ChartLineDiCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineDiCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineDiCrossSigCrossKind;
  bias: ChartLineDiCrossSigBias;
}

export interface ChartLineDiCrossSigSample {
  index: number;
  x: number;
  close: number;
  plusDI: number | null;
  minusDI: number | null;
  diff: number | null;
  regime: ChartLineDiCrossSigRegime;
  bias: ChartLineDiCrossSigBias;
}

export interface ChartLineDiCrossSigRun {
  series: ChartLineDiCrossSigPoint[];
  period: number;
  plusDIValues: Array<number | null>;
  minusDIValues: Array<number | null>;
  diffValues: Array<number | null>;
  samples: ChartLineDiCrossSigSample[];
  crosses: ChartLineDiCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineDiCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDiCrossSigLayout {
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
  priceDots: ChartLineDiCrossSigDot[];
  plusDIPath: string;
  minusDIPath: string;
  zeroLineY: number;
  midLineY: number;
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
    kind: ChartLineDiCrossSigCrossKind;
    bias: ChartLineDiCrossSigBias;
  }>;
  run: ChartLineDiCrossSigRun;
}

export interface ChartLineDiCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDiCrossSigPoint[];
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
  zeroLineColor?: string;
  midLineColor?: string;
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
  showZeroLine?: boolean;
  showMidLine?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDiCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineDiCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDiCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_DI_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_PERIOD = 14;
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_PLUS_DI_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_MINUS_DI_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_ZERO_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_MID_LINE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DI_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineDiCrossSigFinitePoints(
  data: readonly ChartLineDiCrossSigPoint[] | null | undefined,
): ChartLineDiCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDiCrossSigPoint[] = [];
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

export function normalizeLineDiCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface ComputeLineDiCrossSigResult {
  plusDI: Array<number | null>;
  minusDI: Array<number | null>;
}

export function computeLineDiCrossSig(
  series: readonly ChartLineDiCrossSigPoint[] | null | undefined,
  options: { period?: number } = {},
): ComputeLineDiCrossSigResult {
  const cleaned = getLineDiCrossSigFinitePoints(series);
  if (cleaned.length === 0) return { plusDI: [], minusDI: [] };
  const period = normalizeLineDiCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_DI_CROSS_SIG_PERIOD,
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
    const smPlus =
      plusMin === plusMax ? plusMin : posZero(sumPlus / period);
    const smMinus =
      minusMin === minusMax ? minusMin : posZero(sumMinus / period);
    const smTr = trMin === trMax ? trMin : posZero(sumTr / period);
    plusDI[i] = smTr > 0 ? posZero((100 * smPlus) / smTr) : 0;
    minusDI[i] = smTr > 0 ? posZero((100 * smMinus) / smTr) : 0;
  }

  return { plusDI, minusDI };
}

export function classifyLineDiCrossSigRegime(
  plusDI: number | null,
  minusDI: number | null,
): ChartLineDiCrossSigRegime {
  if (plusDI == null || minusDI == null) return 'none';
  if (plusDI >= minusDI) return 'bullish';
  return 'bearish';
}

export function classifyLineDiCrossSigBias(
  cur: number | null,
  prev: number | null,
): ChartLineDiCrossSigBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineDiCrossSigCrosses(
  series: readonly ChartLineDiCrossSigPoint[],
  plusDIValues: readonly (number | null)[],
  minusDIValues: readonly (number | null)[],
): ChartLineDiCrossSigCross[] {
  const out: ChartLineDiCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pp = plusDIValues[i - 1];
    const pm = minusDIValues[i - 1];
    const cp = plusDIValues[i];
    const cm = minusDIValues[i];
    if (pp == null || pm == null || cp == null || cm == null) continue;
    const prevDiff = pp - pm;
    const curDiff = cp - cm;
    const bias = classifyLineDiCrossSigBias(curDiff, prevDiff);
    // Bullish: +DI crosses up through -DI (bulls overtake bears)
    if (pp <= pm && cp > cm) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pp >= pm && cp < cm) {
      // Bearish: +DI crosses down through -DI (bears overtake bulls)
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineDiCrossSig(
  data: ChartLineDiCrossSigPoint[],
  options: { period?: number } = {},
): ChartLineDiCrossSigRun {
  const cleaned = getLineDiCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineDiCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_DI_CROSS_SIG_PERIOD,
  );

  const { plusDI: plusDIValues, minusDI: minusDIValues } = computeLineDiCrossSig(
    series,
    { period },
  );

  const diffValues: Array<number | null> = series.map((_, i) => {
    const p = plusDIValues[i] ?? null;
    const m = minusDIValues[i] ?? null;
    if (p == null || m == null) return null;
    return posZero(p - m);
  });

  const samples: ChartLineDiCrossSigSample[] = series.map((p, i) => {
    const plusDI = plusDIValues[i] ?? null;
    const minusDI = minusDIValues[i] ?? null;
    const diff = diffValues[i] ?? null;
    const prevDiff = i > 0 ? (diffValues[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      plusDI,
      minusDI,
      diff,
      regime: classifyLineDiCrossSigRegime(plusDI, minusDI),
      bias: classifyLineDiCrossSigBias(diff, prevDiff),
    };
  });

  const crosses = detectLineDiCrossSigCrosses(
    series,
    plusDIValues,
    minusDIValues,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
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
    plusDIValues,
    minusDIValues,
    diffValues,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineDiCrossSigLayoutOptions {
  data: ChartLineDiCrossSigPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineDiCrossSigLayout(
  opts: ComputeLineDiCrossSigLayoutOptions,
): ChartLineDiCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_DI_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_DI_CROSS_SIG_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_DI_CROSS_SIG_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_DI_CROSS_SIG_PANEL_GAP;

  const run = runLineDiCrossSig(opts.data, {
    period: opts.period ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // Both +DI and -DI are conventionally bounded to [0, 100].
  // Hard-lock the panel.
  const oscMin = 0;
  const oscMax = 100;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const zeroLineY = syOscBase(0);
  const midLineY = syOscBase(50);

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
      zeroLineY,
      midLineY,
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
  const priceDots: ChartLineDiCrossSigDot[] = [];
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

  let plusDIPath = '';
  let firstPlus = true;
  for (const s of run.samples) {
    if (s.plusDI == null) {
      firstPlus = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.plusDI);
    plusDIPath += `${firstPlus ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstPlus = false;
  }
  plusDIPath = plusDIPath.trim();

  let minusDIPath = '';
  let firstMinus = true;
  for (const s of run.samples) {
    if (s.minusDI == null) {
      firstMinus = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.minusDI);
    minusDIPath += `${firstMinus ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstMinus = false;
  }
  minusDIPath = minusDIPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const pAt = run.plusDIValues[c.index];
    const cyOsc = pAt != null ? syOscBase(pAt) : oscBottom;
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
    zeroLineY,
    midLineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineDiCrossSigChart(
  data: ChartLineDiCrossSigPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineDiCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineDiCrossSigLength(
    options.period,
    DEFAULT_CHART_LINE_DI_CROSS_SIG_PERIOD,
  );
  return (
    `Directional Indicator +DI vs -DI cross-sig chart over ` +
    `${cleaned.length} bars (period ${period}). Top panel ` +
    `renders the close with bullish (+DI crosses up through ` +
    `-DI, bulls overtake bears) / bearish (+DI crosses down ` +
    `through -DI, bears overtake bulls) chevron overlays at ` +
    `every trend direction change trigger event; bottom panel ` +
    `renders J. Welles Wilder Jr's (1978) +DI (100 * smoothed ` +
    `+DM / smoothed true range) and -DI (100 * smoothed -DM / ` +
    `smoothed true range) directional indicators with markers ` +
    `coloured by (+DI - -DI) slope bias (rising / falling / ` +
    `flat) at the trigger bar, flagging trend direction change ` +
    `events with bias coloring. The oldest signal in the ADX ` +
    `system, predating ADX itself.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineDiCrossSigCrossKind,
  bias: ChartLineDiCrossSigBias,
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

export const ChartLineDiCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineDiCrossSigProps
>(function ChartLineDiCrossSig(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_DI_CROSS_SIG_PERIOD,
    width = DEFAULT_CHART_LINE_DI_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_DI_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_DI_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_DI_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DI_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DI_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DI_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_PRICE_COLOR,
    plusDIColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_PLUS_DI_COLOR,
    minusDIColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_MINUS_DI_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_ZERO_LINE_COLOR,
    midLineColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_MID_LINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DI_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPlusDI = true,
    showMinusDI = true,
    showZeroLine = true,
    showMidLine = true,
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
    () => getLineDiCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineDiCrossSigLayout({
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
    ChartLineDiCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineDiCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineDiCrossSigSeriesId,
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
        data-section="chart-line-di-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ?? describeLineDiCrossSigChart(cleaned, { period });

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
      aria-label={ariaLabel ?? 'Directional Indicator +DI vs -DI cross-sig chart'}
      aria-describedby={descId}
      data-section="chart-line-di-cross-sig"
      data-period={period}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
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
        data-section="chart-line-di-cross-sig-title"
      >
        {ariaLabel ?? 'Directional Indicator +DI vs -DI cross-sig chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-di-cross-sig-aria-desc"
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
        data-section="chart-line-di-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-di-cross-sig-grid">
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
                  data-section="chart-line-di-cross-sig-grid-line-price"
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
                  data-section="chart-line-di-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-di-cross-sig-axes">
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
                  data-section="chart-line-di-cross-sig-tick-price"
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
                  data-section="chart-line-di-cross-sig-tick-osc"
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
            data-section="chart-line-di-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-di-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-di-cross-sig-price-dot"
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
            data-section="chart-line-di-cross-sig-zero-line"
          />
        ) : null}

        {showMidLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.midLineY}
            x2={layout.innerRight}
            y2={layout.midLineY}
            stroke={midLineColor}
            strokeDasharray="2 4"
            data-section="chart-line-di-cross-sig-mid-line"
          />
        ) : null}

        {showPlusDILine ? (
          <path
            d={layout.plusDIPath}
            stroke={plusDIColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-di-cross-sig-plus-di-path"
          />
        ) : null}

        {showMinusDILine ? (
          <path
            d={layout.minusDIPath}
            stroke={minusDIColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-di-cross-sig-minus-di-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-di-cross-sig-crosses"
            role="group"
            aria-label="DI cross trigger markers"
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
                aria-label={`${m.kind} DI cross at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-di-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-di-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay DI cross trigger markers"
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
                data-section={`chart-line-di-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-di-cross-sig-hover-targets">
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
                data-section="chart-line-di-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-di-cross-sig-tooltip"
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
                  data-section="chart-line-di-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-di-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-di-cross-sig-tooltip-plus-di"
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
                  data-section="chart-line-di-cross-sig-tooltip-minus-di"
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
                  data-section="chart-line-di-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-di-cross-sig-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-di-cross-sig-tooltip-counts"
                >
                  bull {layout.run.bullishCount} | bear{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-di-cross-sig-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-di-cross-sig-tooltip-biases"
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
          data-section="chart-line-di-cross-sig-badge"
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
          data-section="chart-line-di-cross-sig-legend"
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
              { id: 'minusDI' as const, color: minusDIColor, label: '-DI' },
            ] satisfies Array<{
              id: ChartLineDiCrossSigSeriesId;
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

ChartLineDiCrossSig.displayName = 'ChartLineDiCrossSig';
