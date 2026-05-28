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
 * ChartLineAdxPosCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the Average Directional Index
 * +DI directional indicator in the bottom panel, marking
 * bullish (+DI crosses up through zero -- uptrend strength
 * trigger up; directional pressure emerging from
 * indecision) / bearish (+DI crosses down through zero --
 * uptrend strength fading back to indecision) +DI-vs-zero
 * crossover trigger events with bias coloring derived from
 * the +DI slope at the trigger bar.
 *
 *   upMove[i]    = high[i] - high[i-1]
 *   downMove[i]  = low[i-1] - low[i]
 *   +DM[i]       = (upMove > downMove && upMove > 0)
 *                  ? upMove : 0
 *   tr[i]        = max(high - low,
 *                      |high - close[i-1]|,
 *                      |low  - close[i-1]|)
 *   smPlus[i]    = SMA(+DM, period)
 *   smTr[i]      = SMA(tr,  period)
 *   plusDI[i]    = (smTr > 0) ? 100 * smPlus / smTr : 0
 *
 *   bullish (uptrend-emerging trigger) :
 *     prev plusDI <= 0 && cur plusDI > 0
 *   bearish (uptrend-fading trigger) :
 *     prev plusDI >= 0 && cur plusDI < 0
 *     (effectively never fires since plusDI >= 0 always;
 *      retained for family-shape symmetry)
 *
 *   regime       : 'bullish' when plusDI > 0
 *                  'bearish' when plusDI < 0 (never fires)
 *                  'none'    when plusDI === 0 or null
 *   bias         : plusDI[i] vs plusDI[i-1] -> up / down /
 *                  flat / none
 *
 * Defaults: `period = 14`. J. Welles Wilder Jr's 1978 ADX
 * +DI directional indicator measures the strength of
 * bullish price pressure: the smoothed positive
 * directional movement (DM) normalised by smoothed true
 * range (TR). Convention bounds it to `[0, 100]`. This
 * primitive flags transitions from `+DI === 0` (no
 * uptrend pressure) to `+DI > 0` (uptrend strength
 * emerging) as the canonical "uptrend-emerging" trigger.
 *
 * Note: since +DI is canonically bounded to `[0, 100]`,
 * the bearish (downward zero-cross) case never fires in
 * practice; the regime classifier and detector retain
 * symmetric shape with the other cross-sig family members
 * but the bearish path is effectively dead code on real
 * inputs.
 *
 * Sibling family:
 *   - chart-line-adx-pos-neg-divergence v1.11.1075 --
 *     compares +DI direction vs -DI direction
 *   - chart-line-adx-trend-cross v1.11.1047 -- ADX itself
 *     vs the 20/25 threshold
 *   - this primitive -- +DI alone vs zero
 *
 * Uses SMA-based smoothing (matching the adx-* family
 * convention) rather than Wilder's exponential smoothing,
 * for bit-exact integer DI values on linear input. The
 * two ADX smoothing variants are a documented family-
 * level tuning choice.
 *
 * Warmup is `period + 1 = 15` for the default tuning:
 * DM and TR seed at i = 1, SMA window-fills at i = period
 * = 14, and cross detection needs the previous bar's +DI,
 * so the first potential cross lands at i = period + 1 =
 * 15.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: upMove = 0, downMove = 0 -> +DM = 0 (upMove > 0
 *   check fails). TR = 2. smPlus = 0, smTr = 2. plusDI =
 *   100 * 0 / 2 = 0. plusDI stays at 0 -> no transition
 *   above 0. 0 crosses. regime `none` (plusDI === 0).
 *   Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: upMove = +1, downMove = -1. upMove > downMove
 *   AND upMove > 0 -> +DM = 1. TR = 2. smPlus = 1, smTr
 *   = 2. plusDI = 100 * 1 / 2 = 50 (constant from i =
 *   period). prev plusDI at i = period - 1 is null
 *   (warmup), so the cross detector skips i = period.
 *   From i = period + 1 onwards plusDI === 50 (constant),
 *   no transition. 0 crosses. regime `bullish` (plusDI >
 *   0).
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: upMove = -1, downMove = +1. +DM = 0
 *   (upMove > 0 fails). plusDI = 0 (constant). 0 crosses.
 *   regime `none`.
 */

export interface ChartLineAdxPosCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAdxPosCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineAdxPosCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineAdxPosCrossSeriesId = 'price' | 'plusDI';

export type ChartLineAdxPosCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineAdxPosCrossCross {
  index: number;
  x: number;
  kind: ChartLineAdxPosCrossCrossKind;
  bias: ChartLineAdxPosCrossBias;
}

export interface ChartLineAdxPosCrossSample {
  index: number;
  x: number;
  close: number;
  plusDI: number | null;
  regime: ChartLineAdxPosCrossRegime;
  bias: ChartLineAdxPosCrossBias;
}

export interface ChartLineAdxPosCrossRun {
  series: ChartLineAdxPosCrossPoint[];
  period: number;
  plusDIValues: Array<number | null>;
  samples: ChartLineAdxPosCrossSample[];
  crosses: ChartLineAdxPosCrossCross[];
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

export interface ChartLineAdxPosCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxPosCrossLayout {
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
  priceDots: ChartLineAdxPosCrossDot[];
  plusDIPath: string;
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
    kind: ChartLineAdxPosCrossCrossKind;
    bias: ChartLineAdxPosCrossBias;
  }>;
  run: ChartLineAdxPosCrossRun;
}

export interface ChartLineAdxPosCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxPosCrossPoint[];
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
  showPlusDI?: boolean;
  showZeroLine?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxPosCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAdxPosCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxPosCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ADX_POS_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_PLUS_DI_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_ZERO_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_POS_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineAdxPosCrossFinitePoints(
  data: readonly ChartLineAdxPosCrossPoint[] | null | undefined,
): ChartLineAdxPosCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxPosCrossPoint[] = [];
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

export function normalizeLineAdxPosCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function computeLineAdxPosCross(
  series: readonly ChartLineAdxPosCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): Array<number | null> {
  const cleaned = getLineAdxPosCrossFinitePoints(series);
  if (cleaned.length === 0) return [];
  const period = normalizeLineAdxPosCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ADX_POS_CROSS_PERIOD,
  );

  const n = cleaned.length;
  const plusDM: Array<number | null> = new Array(n).fill(null);
  const tr: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]!;
    const prev = cleaned[i - 1]!;
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    if (upMove > downMove && upMove > 0) plusDM[i] = posZero(upMove);
    else plusDM[i] = 0;

    const range = cur.high - cur.low;
    const hToPc = Math.abs(cur.high - prev.close);
    const lToPc = Math.abs(cur.low - prev.close);
    tr[i] = posZero(Math.max(range, hToPc, lToPc));
  }

  const plusDI: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    let sumPlus = 0;
    let sumTr = 0;
    let valid = true;
    let plusMin = Infinity;
    let plusMax = -Infinity;
    let trMin = Infinity;
    let trMax = -Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      const p = plusDM[j];
      const t = tr[j];
      if (p == null || t == null) {
        valid = false;
        break;
      }
      sumPlus += p;
      sumTr += t;
      if (p < plusMin) plusMin = p;
      if (p > plusMax) plusMax = p;
      if (t < trMin) trMin = t;
      if (t > trMax) trMax = t;
    }
    if (!valid) continue;
    const smPlus = plusMin === plusMax ? plusMin : posZero(sumPlus / period);
    const smTr = trMin === trMax ? trMin : posZero(sumTr / period);
    plusDI[i] = smTr > 0 ? posZero((100 * smPlus) / smTr) : 0;
  }

  return plusDI;
}

export function classifyLineAdxPosCrossRegime(
  plusDI: number | null,
): ChartLineAdxPosCrossRegime {
  if (plusDI == null) return 'none';
  if (plusDI > 0) return 'bullish';
  if (plusDI < 0) return 'bearish';
  return 'none';
}

export function classifyLineAdxPosCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineAdxPosCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineAdxPosCrossCrosses(
  series: readonly ChartLineAdxPosCrossPoint[],
  plusDIValues: readonly (number | null)[],
): ChartLineAdxPosCrossCross[] {
  const out: ChartLineAdxPosCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pp = plusDIValues[i - 1];
    const cp = plusDIValues[i];
    if (pp == null || cp == null) continue;
    const bias = classifyLineAdxPosCrossBias(cp, pp);
    if (pp <= 0 && cp > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pp >= 0 && cp < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineAdxPosCross(
  data: ChartLineAdxPosCrossPoint[],
  options: { period?: number } = {},
): ChartLineAdxPosCrossRun {
  const cleaned = getLineAdxPosCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineAdxPosCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ADX_POS_CROSS_PERIOD,
  );

  const plusDIValues = computeLineAdxPosCross(series, { period });

  const samples: ChartLineAdxPosCrossSample[] = series.map((p, i) => {
    const plusDI = plusDIValues[i] ?? null;
    const prev = i > 0 ? (plusDIValues[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      plusDI,
      regime: classifyLineAdxPosCrossRegime(plusDI),
      bias: classifyLineAdxPosCrossBias(plusDI, prev),
    };
  });

  const crosses = detectLineAdxPosCrossCrosses(series, plusDIValues);

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
    series = [],
    period,
    plusDIValues,
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

export interface ComputeLineAdxPosCrossLayoutOptions {
  data: ChartLineAdxPosCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAdxPosCrossLayout(
  opts: ComputeLineAdxPosCrossLayoutOptions,
): ChartLineAdxPosCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ADX_POS_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ADX_POS_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_ADX_POS_CROSS_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_ADX_POS_CROSS_PANEL_GAP;

  const run = runLineAdxPosCross(opts.data, {
    period: opts.period ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // +DI is conventionally bounded to [0, 100]. Hard-lock the panel.
  const oscMin = 0;
  const oscMax = 100;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const zeroLineY = syOscBase(0);

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
      zeroLineY,
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
  const priceDots: ChartLineAdxPosCrossDot[] = [];
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
  let firstP = true;
  for (const s of run.samples) {
    if (s.plusDI == null) {
      firstP = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.plusDI);
    plusDIPath += `${firstP ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstP = false;
  }
  plusDIPath = plusDIPath.trim();

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
    zeroLineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineAdxPosCrossChart(
  data: ChartLineAdxPosCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineAdxPosCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineAdxPosCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ADX_POS_CROSS_PERIOD,
  );
  return (
    `ADX +DI zero-cross chart over ${cleaned.length} bars (period ` +
    `${period}). Top panel renders the close with bullish (+DI ` +
    `crosses up through zero, uptrend strength trigger up; ` +
    `directional pressure emerging from indecision) chevron overlays ` +
    `at every zero-crossing trigger event; bottom panel renders ` +
    `J. Welles Wilder Jr's (1978) positive directional indicator ` +
    `(100 * smoothed +DM divided by smoothed true range) with the ` +
    `zero reference line, markers coloured by +DI slope bias (rising ` +
    `/ falling / flat) at the trigger bar, flagging uptrend strength ` +
    `trigger events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineAdxPosCrossCrossKind,
  bias: ChartLineAdxPosCrossBias,
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

export const ChartLineAdxPosCross = forwardRef<
  HTMLDivElement,
  ChartLineAdxPosCrossProps
>(function ChartLineAdxPosCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_ADX_POS_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_ADX_POS_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_POS_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_POS_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADX_POS_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_POS_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADX_POS_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_POS_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_PRICE_COLOR,
    plusDIColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_PLUS_DI_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_ZERO_LINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_POS_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPlusDI = true,
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
    () => getLineAdxPosCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAdxPosCrossLayout({
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
    ChartLineAdxPosCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAdxPosCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAdxPosCrossSeriesId,
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
        data-section="chart-line-adx-pos-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAdxPosCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showPlusDILine = !hidden.has('plusDI') && showPlusDI;

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
      aria-label={ariaLabel ?? 'ADX +DI zero-cross chart'}
      aria-describedby={descId}
      data-section="chart-line-adx-pos-cross"
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
        data-section="chart-line-adx-pos-cross-title"
      >
        {ariaLabel ?? 'ADX +DI zero-cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-adx-pos-cross-aria-desc"
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
        data-section="chart-line-adx-pos-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-adx-pos-cross-grid">
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
                  data-section="chart-line-adx-pos-cross-grid-line-price"
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
                  data-section="chart-line-adx-pos-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-adx-pos-cross-axes">
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
                  data-section="chart-line-adx-pos-cross-tick-price"
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
                  data-section="chart-line-adx-pos-cross-tick-osc"
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
            data-section="chart-line-adx-pos-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-adx-pos-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-adx-pos-cross-price-dot"
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
            data-section="chart-line-adx-pos-cross-zero-line"
          />
        ) : null}

        {showPlusDILine ? (
          <path
            d={layout.plusDIPath}
            stroke={plusDIColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-pos-cross-plus-di-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-adx-pos-cross-crosses"
            role="group"
            aria-label="ADX +DI zero-cross trigger markers"
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
                aria-label={`${m.kind} ADX +DI zero-cross at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-adx-pos-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-adx-pos-cross-overlay-crosses"
            role="group"
            aria-label="overlay ADX +DI zero-cross trigger markers"
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
                data-section={`chart-line-adx-pos-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-adx-pos-cross-hover-targets">
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
                data-section="chart-line-adx-pos-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-adx-pos-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={272}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-cross-tooltip-plus-di"
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
                  data-section="chart-line-adx-pos-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-pos-cross-tooltip-biases"
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
          data-section="chart-line-adx-pos-cross-badge"
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
          data-section="chart-line-adx-pos-cross-legend"
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
            ] satisfies Array<{
              id: ChartLineAdxPosCrossSeriesId;
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

ChartLineAdxPosCross.displayName = 'ChartLineAdxPosCross';
