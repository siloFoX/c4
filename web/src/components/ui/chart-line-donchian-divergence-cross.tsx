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
 * ChartLineDonchianDivergenceCross -- pure-SVG dual-panel
 * chart with the close in the top panel and the Donchian
 * Channel (rolling HH / LL with midline) in the bottom
 * panel, marking price-vs-channel direction disagreement
 * events as range-break-reversal warnings with bias
 * coloring derived from the Donchian midline slope at the
 * trigger bar.
 *
 *   upperBand[i] = max(high[j], j in [i - period + 1, i])
 *   lowerBand[i] = min(low[j],  j in [i - period + 1, i])
 *   midline[i]   = (upperBand[i] + lowerBand[i]) / 2
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   midlineUp   : midline[i] > midline[i-1]
 *   midlineDown : midline[i] < midline[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && midlineUp
 *     'aligned-bearish'   when priceDown && midlineDown
 *     'divergent-bullish' when priceDown && midlineUp
 *                          (selling pressure but the
 *                           Donchian range is still
 *                           ratcheting up -- bullish
 *                           range-break-reversal warning)
 *     'divergent-bearish' when priceUp   && midlineDown
 *                          (rally but the Donchian range
 *                           is ratcheting down -- bearish
 *                           range-break-reversal warning)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : midline[i] vs midline[i-1] -> up /
 *                 down / flat / none
 *
 * Defaults: `period = 20`. Richard Donchian's 1950s
 * Donchian Channel locates price within the rolling
 * `[HH, LL]` high-low range as a literal range envelope
 * (the upper and lower bands are the all-time-high and
 * all-time-low of the last `period` bars). The midline is
 * the geometric centre of the channel and behaves as a
 * range-following centerline. This primitive compares the
 * midline slope against price direction to surface
 * range-break-reversal warnings: when price falls but the
 * Donchian range is still ratcheting up (the channel HH
 * has just expanded), the regime flags a bullish reversal
 * warning; the inverse flags a bearish reversal warning.
 *
 * Unlike EMA / SMA midline siblings, the Donchian midline
 * is a *range* indicator -- it follows the HH/LL extremes,
 * not a smoothed average. This makes it especially
 * sensitive to volatility regime changes (new highs / new
 * lows immediately shift the midline) but more rigid in
 * congestion zones (when no new HH/LL prints, the midline
 * is exactly flat).
 *
 * Sibling to chart-line-keltner-divergence-cross
 * v1.11.1072 (EMA + ATR envelope) and
 * chart-line-bollinger-divergence-cross v1.11.1073 (SMA +
 * stdev envelope) -- three midline-plus-volatility-bands
 * variants with different envelope semantics.
 *
 * Warmup is `period = 20` for the default tuning: HH /
 * LL seed at i = period - 1 = 19, midline valid from i =
 * 19, direction detection needs the previous bar's
 * midline, so the first regime classification lands at
 * i = period = 20.
 *
 * Bit-exact anchors (HL input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`,
 *   `close = K`: HH = K + 1, LL = K - 1, midline = K
 *   (constant). Both price and midline are flat ->
 *   regime `none` for every valid bar. 0 crosses.
 *   Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: HH = i + 1 (latest). LL = i - 20 (oldest at
 *   j = i - 19: (i - 19) - 1 = i - 20). midline =
 *   ((i + 1) + (i - 20)) / 2 = (2i - 19) / 2 = i - 9.5
 *   (slope +1, matches the canonical Donchian centroid).
 *   upperBand = i + 1, lowerBand = i - 20 (width = 21).
 *   priceUp + midlineUp -> aligned-bullish for every
 *   valid bar. 0 crosses (no transition into divergent
 *   regime).
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: HH = -i + 20 (oldest at j = i - 19:
 *   -(i - 19) + 1 = -i + 20). LL = -i - 1 (latest).
 *   midline = ((-i + 20) + (-i - 1)) / 2 = -i + 9.5
 *   (slope -1, mirror). priceDown + midlineDown ->
 *   aligned-bearish. 0 crosses.
 */

export interface ChartLineDonchianDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineDonchianDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineDonchianDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineDonchianDivergenceCrossSeriesId =
  | 'price'
  | 'midline'
  | 'upperBand'
  | 'lowerBand';

export type ChartLineDonchianDivergenceCrossCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineDonchianDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineDonchianDivergenceCrossCrossKind;
  bias: ChartLineDonchianDivergenceCrossBias;
}

export interface ChartLineDonchianDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  midline: number | null;
  upperBand: number | null;
  lowerBand: number | null;
  regime: ChartLineDonchianDivergenceCrossRegime;
  bias: ChartLineDonchianDivergenceCrossBias;
}

export interface ChartLineDonchianDivergenceCrossRun {
  series: ChartLineDonchianDivergenceCrossPoint[];
  period: number;
  midlineValues: Array<number | null>;
  upperBandValues: Array<number | null>;
  lowerBandValues: Array<number | null>;
  samples: ChartLineDonchianDivergenceCrossSample[];
  crosses: ChartLineDonchianDivergenceCrossCross[];
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

export interface ChartLineDonchianDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDonchianDivergenceCrossLayout {
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
  priceDots: ChartLineDonchianDivergenceCrossDot[];
  midlinePath: string;
  upperBandPath: string;
  lowerBandPath: string;
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
    kind: ChartLineDonchianDivergenceCrossCrossKind;
    bias: ChartLineDonchianDivergenceCrossBias;
  }>;
  run: ChartLineDonchianDivergenceCrossRun;
}

export interface ChartLineDonchianDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDonchianDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  midlineColor?: string;
  upperBandColor?: string;
  lowerBandColor?: string;
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
  showMidline?: boolean;
  showBands?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDonchianDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineDonchianDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDonchianDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PERIOD = 20;
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_MIDLINE_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_UPPER_BAND_COLOR =
  '#f59e0b';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_LOWER_BAND_COLOR =
  '#f59e0b';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineDonchianDivergenceCrossFinitePoints(
  data:
    | readonly ChartLineDonchianDivergenceCrossPoint[]
    | null
    | undefined,
): ChartLineDonchianDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDonchianDivergenceCrossPoint[] = [];
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

export function normalizeLineDonchianDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface DonchianDivergenceCrossChannels {
  midline: Array<number | null>;
  upperBand: Array<number | null>;
  lowerBand: Array<number | null>;
}

export function computeLineDonchianDivergenceCross(
  series:
    | readonly ChartLineDonchianDivergenceCrossPoint[]
    | null
    | undefined,
  options: { period?: number } = {},
): DonchianDivergenceCrossChannels {
  const cleaned = getLineDonchianDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { midline: [], upperBand: [], lowerBand: [] };
  }
  const period = normalizeLineDonchianDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PERIOD,
  );

  const n = cleaned.length;
  const midline: Array<number | null> = new Array(n).fill(null);
  const upperBand: Array<number | null> = new Array(n).fill(null);
  const lowerBand: Array<number | null> = new Array(n).fill(null);

  for (let i = period - 1; i < n; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      const p = cleaned[j]!;
      if (p.high > hh) hh = p.high;
      if (p.low < ll) ll = p.low;
    }
    upperBand[i] = posZero(hh);
    lowerBand[i] = posZero(ll);
    midline[i] = posZero((hh + ll) / 2);
  }

  return { midline, upperBand, lowerBand };
}

export function classifyLineDonchianDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curMidline: number | null,
  prevMidline: number | null,
): ChartLineDonchianDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curMidline == null ||
    prevMidline == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const midUp = curMidline > prevMidline;
  const midDown = curMidline < prevMidline;
  if (priceUp && midUp) return 'aligned-bullish';
  if (priceDown && midDown) return 'aligned-bearish';
  if (priceDown && midUp) return 'divergent-bullish';
  if (priceUp && midDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineDonchianDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineDonchianDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineDonchianDivergenceCrossCrosses(
  series: readonly ChartLineDonchianDivergenceCrossPoint[],
  regimes: readonly ChartLineDonchianDivergenceCrossRegime[],
  midlineValues: readonly (number | null)[],
): ChartLineDonchianDivergenceCrossCross[] {
  const out: ChartLineDonchianDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevMid = midlineValues[i - 1];
    const curMid = midlineValues[i];
    const bias = classifyLineDonchianDivergenceCrossBias(
      curMid ?? null,
      prevMid ?? null,
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

export function runLineDonchianDivergenceCross(
  data: ChartLineDonchianDivergenceCrossPoint[],
  options: { period?: number } = {},
): ChartLineDonchianDivergenceCrossRun {
  const cleaned = getLineDonchianDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineDonchianDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PERIOD,
  );

  const channels = computeLineDonchianDivergenceCross(series, { period });

  const regimes: ChartLineDonchianDivergenceCrossRegime[] = series.map(
    (p, i) => {
      if (i === 0) return 'none';
      const prevSample = series[i - 1];
      const curMid = channels.midline[i] ?? null;
      const prevMid = channels.midline[i - 1] ?? null;
      return classifyLineDonchianDivergenceCrossRegime(
        p.close,
        prevSample ? prevSample.close : null,
        curMid,
        prevMid,
      );
    },
  );

  const samples: ChartLineDonchianDivergenceCrossSample[] = series.map(
    (p, i) => {
      const mid = channels.midline[i] ?? null;
      const prevMid = i > 0 ? (channels.midline[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        midline: mid,
        upperBand: channels.upperBand[i] ?? null,
        lowerBand: channels.lowerBand[i] ?? null,
        regime: regimes[i] ?? 'none',
        bias: classifyLineDonchianDivergenceCrossBias(mid, prevMid),
      };
    },
  );

  const crosses = detectLineDonchianDivergenceCrossCrosses(
    series,
    regimes,
    channels.midline,
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
  const ok = series.length > warmup;

  return {
    series,
    period,
    midlineValues: channels.midline,
    upperBandValues: channels.upperBand,
    lowerBandValues: channels.lowerBand,
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

export interface ComputeLineDonchianDivergenceCrossLayoutOptions {
  data: ChartLineDonchianDivergenceCrossPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineDonchianDivergenceCrossLayout(
  opts: ComputeLineDonchianDivergenceCrossLayoutOptions,
): ChartLineDonchianDivergenceCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ??
    DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineDonchianDivergenceCross(opts.data, {
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
  for (let i = 0; i < run.midlineValues.length; i += 1) {
    const m = run.midlineValues[i];
    const u = run.upperBandValues[i];
    const l = run.lowerBandValues[i];
    if (m != null) {
      if (m < oscRawMin) oscRawMin = m;
      if (m > oscRawMax) oscRawMax = m;
    }
    if (u != null) {
      if (u < oscRawMin) oscRawMin = u;
      if (u > oscRawMax) oscRawMax = u;
    }
    if (l != null) {
      if (l < oscRawMin) oscRawMin = l;
      if (l > oscRawMax) oscRawMax = l;
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
      midlinePath: '',
      upperBandPath: '',
      lowerBandPath: '',
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
  const priceDots: ChartLineDonchianDivergenceCrossDot[] = [];
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
    accessor: (s: ChartLineDonchianDivergenceCrossSample) => number | null,
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

  const midlinePath = buildPath((s) => s.midline);
  const upperBandPath = buildPath((s) => s.upperBand);
  const lowerBandPath = buildPath((s) => s.lowerBand);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const midAt = run.midlineValues[c.index];
    const cyOsc = midAt != null ? syOscBase(midAt) : oscBottom;
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
    midlinePath,
    upperBandPath,
    lowerBandPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineDonchianDivergenceCrossChart(
  data: ChartLineDonchianDivergenceCrossPoint[],
  options: { period?: number } = {},
): string {
  const cleaned = getLineDonchianDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineDonchianDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PERIOD,
  );
  return (
    `Donchian divergence chart over ${cleaned.length} bars (period ` +
    `${period}). Top panel renders the close with bullish (price ` +
    `falling while Donchian midline rising, bullish divergence -- ` +
    `range-break-reversal warning up; selling pressure but the ` +
    `Donchian range still ratcheting up) / bearish (price rising ` +
    `while Donchian midline falling, bearish divergence -- range-` +
    `break-reversal warning down; rally but the Donchian range ` +
    `ratcheting down) chevron overlays at every price-vs-midline ` +
    `direction-disagreement transition; bottom panel renders ` +
    `Richard Donchian's rolling [HH, LL] channel envelope with the ` +
    `geometric midline, markers coloured by midline slope bias ` +
    `(rising / falling / flat) at the trigger bar, flagging range-` +
    `break-reversal warning events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineDonchianDivergenceCrossCrossKind,
  bias: ChartLineDonchianDivergenceCrossBias,
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

export const ChartLineDonchianDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineDonchianDivergenceCrossProps
>(function ChartLineDonchianDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PERIOD,
    width = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_PRICE_COLOR,
    midlineColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_MIDLINE_COLOR,
    upperBandColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_UPPER_BAND_COLOR,
    lowerBandColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_LOWER_BAND_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DONCHIAN_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMidline = true,
    showBands = true,
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
    () => getLineDonchianDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineDonchianDivergenceCrossLayout({
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
    ChartLineDonchianDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineDonchianDivergenceCrossSeriesId,
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
    seriesId: ChartLineDonchianDivergenceCrossSeriesId,
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
        data-section="chart-line-donchian-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineDonchianDivergenceCrossChart(cleaned, { period });

  const showPrice = !hidden.has('price');
  const showMidlineLine = !hidden.has('midline') && showMidline;
  const showUpperBandLine = !hidden.has('upperBand') && showBands;
  const showLowerBandLine = !hidden.has('lowerBand') && showBands;

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
      aria-label={ariaLabel ?? 'Donchian divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-donchian-divergence-cross"
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
        data-section="chart-line-donchian-divergence-cross-title"
      >
        {ariaLabel ?? 'Donchian divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-donchian-divergence-cross-aria-desc"
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
        data-section="chart-line-donchian-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-donchian-divergence-cross-grid">
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
                  data-section="chart-line-donchian-divergence-cross-grid-line-price"
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
                  data-section="chart-line-donchian-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-donchian-divergence-cross-axes">
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
                  data-section="chart-line-donchian-divergence-cross-tick-price"
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
                  data-section="chart-line-donchian-divergence-cross-tick-osc"
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
            data-section="chart-line-donchian-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-donchian-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-donchian-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showUpperBandLine ? (
          <path
            d={layout.upperBandPath}
            stroke={upperBandColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray="4 3"
            data-section="chart-line-donchian-divergence-cross-upper-band-path"
          />
        ) : null}

        {showLowerBandLine ? (
          <path
            d={layout.lowerBandPath}
            stroke={lowerBandColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray="4 3"
            data-section="chart-line-donchian-divergence-cross-lower-band-path"
          />
        ) : null}

        {showMidlineLine ? (
          <path
            d={layout.midlinePath}
            stroke={midlineColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-donchian-divergence-cross-midline-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-donchian-divergence-cross-crosses"
            role="group"
            aria-label="Donchian divergence trigger markers"
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
                aria-label={`${m.kind} Donchian divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-donchian-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-donchian-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay Donchian divergence trigger markers"
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
                data-section={`chart-line-donchian-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-donchian-divergence-cross-hover-targets">
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
                data-section="chart-line-donchian-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-donchian-divergence-cross-tooltip"
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
                  data-section="chart-line-donchian-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-divergence-cross-tooltip-midline"
                >
                  midline{' '}
                  {tooltipSample.midline == null
                    ? '--'
                    : formatOsc(tooltipSample.midline)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-divergence-cross-tooltip-bands"
                >
                  bands{' '}
                  {tooltipSample.lowerBand == null
                    ? '--'
                    : formatOsc(tooltipSample.lowerBand)}
                  {' / '}
                  {tooltipSample.upperBand == null
                    ? '--'
                    : formatOsc(tooltipSample.upperBand)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} |
                  bear {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-donchian-divergence-cross-tooltip-crosses"
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
          data-section="chart-line-donchian-divergence-cross-badge"
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
          data-section="chart-line-donchian-divergence-cross-legend"
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
                id: 'midline' as const,
                color: midlineColor,
                label: 'midline',
              },
              {
                id: 'upperBand' as const,
                color: upperBandColor,
                label: 'upper',
              },
              {
                id: 'lowerBand' as const,
                color: lowerBandColor,
                label: 'lower',
              },
            ] satisfies Array<{
              id: ChartLineDonchianDivergenceCrossSeriesId;
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

ChartLineDonchianDivergenceCross.displayName =
  'ChartLineDonchianDivergenceCross';
