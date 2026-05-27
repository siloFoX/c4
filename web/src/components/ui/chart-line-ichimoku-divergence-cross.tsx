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
 * ChartLineIchimokuDivergenceCross -- pure-SVG dual-panel
 * chart with the close in the top panel and the Ichimoku
 * Cloud (kumo) midpoint line in the bottom panel, marking
 * price vs kumo-midpoint direction-disagreement events as
 * cloud reversal warnings.
 *
 *   tenkan[i]   = (HH(high, tenkanLength) +
 *                  LL(low,  tenkanLength)) / 2
 *   kijun[i]    = (HH(high, kijunLength) +
 *                  LL(low,  kijunLength))  / 2
 *   senkouA[i]  = (tenkan + kijun) / 2
 *   senkouB[i]  = (HH(high, senkouBLength) +
 *                  LL(low,  senkouBLength)) / 2
 *   midpoint[i] = (senkouA + senkouB) / 2
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   kumoUp      : midpoint[i] > midpoint[i-1]
 *   kumoDown    : midpoint[i] < midpoint[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && kumoUp
 *     'aligned-bearish'   when priceDown && kumoDown
 *     'divergent-bullish' when priceDown && kumoUp
 *                          (price falling but kumo midpoint
 *                           rising -- bullish cloud reversal
 *                           warning)
 *     'divergent-bearish' when priceUp   && kumoDown
 *                          (price rising but kumo midpoint
 *                           falling -- bearish cloud reversal
 *                           warning)
 *     'none'              when either side flat or null
 *
 *   bullish (divergence trigger up) :
 *     prev regime !== 'divergent-bullish' &&
 *     cur regime === 'divergent-bullish'
 *   bearish (divergence trigger down) :
 *     prev regime !== 'divergent-bearish' &&
 *     cur regime === 'divergent-bearish'
 *
 *   bias        : midpoint[i] vs midpoint[i-1] -> up /
 *                 down / flat / none
 *
 * Defaults: `tenkanLength = 9`, `kijunLength = 26`,
 * `senkouBLength = 52`. The kumo midpoint condenses the
 * Senkou Span A / Senkou Span B cloud into a single
 * direction-indicating line: it tracks the long-range
 * mean of the rolling HH / LL range, so direction
 * changes correspond to the cloud "flipping" colour in
 * the full Ichimoku visualisation.
 *
 * This primitive uses current-bar reads (no 26-bar forward
 * displacement). The canonical Ichimoku formulation
 * forward-shifts Senkou A and Senkou B by 26 bars, but
 * for divergence detection we want the kumo's *current*
 * direction, not its future-projected position -- so we
 * align the spans to the current bar.
 *
 * Warmup is `max(tenkanLength, kijunLength, senkouBLength)
 * - 1 = 51` for the default tuning: midpoint first valid
 * at i = 51. Divergence detection requires the previous
 * midpoint + close, so the first regime classification
 * lands at i = 52 (one bar past warmup).
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: every HH/LL window yields HH = K + 1, LL = K -
 *   1 -> tenkan = kijun = senkouA = senkouB = K.
 *   midpoint = K. Both close and midpoint are flat ->
 *   regime `none`. 0 divergence crosses. Verified across
 *   K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: HH over window [i - L + 1, i] = high[i] = i +
 *   1; LL over same window = low[i - L + 1] = i - L.
 *   tenkan = (i + 1 + i - 9) / 2 = i - 4. kijun = (i +
 *   1 + i - 26) / 2 = i - 12.5. senkouA = i - 8.25.
 *   senkouB = (i + 1 + i - 52) / 2 = i - 25.5. midpoint
 *   = (i - 8.25 + i - 25.5) / 2 = `i - 16.875`. close[i]
 *   - close[i-1] = +1 (up); midpoint[i] - midpoint[i-1]
 *   = +1 (up). Both up -> regime `aligned-bullish`. 0
 *   divergence crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: mirror -> midpoint = `-i + 16.875`.
 *   Both close and midpoint falling -> regime
 *   `aligned-bearish`. 0 divergence crosses.
 */

export interface ChartLineIchimokuDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineIchimokuDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineIchimokuDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineIchimokuDivergenceCrossSeriesId = 'price' | 'kumo';

export type ChartLineIchimokuDivergenceCrossCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineIchimokuDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineIchimokuDivergenceCrossCrossKind;
  bias: ChartLineIchimokuDivergenceCrossBias;
}

export interface ChartLineIchimokuDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  midpoint: number | null;
  regime: ChartLineIchimokuDivergenceCrossRegime;
  bias: ChartLineIchimokuDivergenceCrossBias;
}

export interface ChartLineIchimokuDivergenceCrossRun {
  series: ChartLineIchimokuDivergenceCrossPoint[];
  tenkanLength: number;
  kijunLength: number;
  senkouBLength: number;
  tenkanValues: Array<number | null>;
  kijunValues: Array<number | null>;
  senkouAValues: Array<number | null>;
  senkouBValues: Array<number | null>;
  midpointValues: Array<number | null>;
  samples: ChartLineIchimokuDivergenceCrossSample[];
  crosses: ChartLineIchimokuDivergenceCrossCross[];
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

export interface ChartLineIchimokuDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineIchimokuDivergenceCrossLayout {
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
  priceDots: ChartLineIchimokuDivergenceCrossDot[];
  kumoPath: string;
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
    kind: ChartLineIchimokuDivergenceCrossCrossKind;
    bias: ChartLineIchimokuDivergenceCrossBias;
  }>;
  run: ChartLineIchimokuDivergenceCrossRun;
}

export interface ChartLineIchimokuDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineIchimokuDivergenceCrossPoint[];
  tenkanLength?: number;
  kijunLength?: number;
  senkouBLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kumoColor?: string;
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
  showKumo?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineIchimokuDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineIchimokuDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineIchimokuDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_TENKAN_LENGTH = 9;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_KIJUN_LENGTH = 26;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_SENKOU_B_LENGTH =
  52;
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_KUMO_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineIchimokuDivergenceCrossFinitePoints(
  data:
    | readonly ChartLineIchimokuDivergenceCrossPoint[]
    | null
    | undefined,
): ChartLineIchimokuDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineIchimokuDivergenceCrossPoint[] = [];
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

export function normalizeLineIchimokuDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Midpoint of the rolling (HH, LL) range over `length` bars. */
export function applyLineIchimokuDivergenceCrossRangeMidpoint(
  highs: readonly number[],
  lows: readonly number[],
  length: number,
): Array<number | null> {
  const n = Math.min(highs.length, lows.length);
  const out: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || n === 0) return out;
  for (let i = length - 1; i < n; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const h = highs[j]!;
      const l = lows[j]!;
      if (h > hh) hh = h;
      if (l < ll) ll = l;
    }
    out[i] = posZero((hh + ll) / 2);
  }
  return out;
}

export interface IchimokuDivergenceCrossChannels {
  tenkan: Array<number | null>;
  kijun: Array<number | null>;
  senkouA: Array<number | null>;
  senkouB: Array<number | null>;
  midpoint: Array<number | null>;
}

export function computeLineIchimokuDivergenceCross(
  series:
    | readonly ChartLineIchimokuDivergenceCrossPoint[]
    | null
    | undefined,
  options: {
    tenkanLength?: number;
    kijunLength?: number;
    senkouBLength?: number;
  } = {},
): IchimokuDivergenceCrossChannels {
  const cleaned = getLineIchimokuDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      tenkan: [],
      kijun: [],
      senkouA: [],
      senkouB: [],
      midpoint: [],
    };
  }
  const tenkanLength = normalizeLineIchimokuDivergenceCrossLength(
    options.tenkanLength,
    DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_TENKAN_LENGTH,
  );
  const kijunLength = normalizeLineIchimokuDivergenceCrossLength(
    options.kijunLength,
    DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_KIJUN_LENGTH,
  );
  const senkouBLength = normalizeLineIchimokuDivergenceCrossLength(
    options.senkouBLength,
    DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_SENKOU_B_LENGTH,
  );

  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);

  const tenkan = applyLineIchimokuDivergenceCrossRangeMidpoint(
    highs,
    lows,
    tenkanLength,
  );
  const kijun = applyLineIchimokuDivergenceCrossRangeMidpoint(
    highs,
    lows,
    kijunLength,
  );
  const senkouB = applyLineIchimokuDivergenceCrossRangeMidpoint(
    highs,
    lows,
    senkouBLength,
  );

  const senkouA: Array<number | null> = new Array(cleaned.length).fill(null);
  const midpoint: Array<number | null> = new Array(cleaned.length).fill(null);
  for (let i = 0; i < cleaned.length; i += 1) {
    const t = tenkan[i];
    const k = kijun[i];
    if (t != null && k != null) senkouA[i] = posZero((t + k) / 2);
    const a = senkouA[i];
    const b = senkouB[i];
    if (a != null && b != null) midpoint[i] = posZero((a + b) / 2);
  }

  return { tenkan, kijun, senkouA, senkouB, midpoint };
}

export function classifyLineIchimokuDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curMidpoint: number | null,
  prevMidpoint: number | null,
): ChartLineIchimokuDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curMidpoint == null ||
    prevMidpoint == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const kumoUp = curMidpoint > prevMidpoint;
  const kumoDown = curMidpoint < prevMidpoint;
  if (priceUp && kumoUp) return 'aligned-bullish';
  if (priceDown && kumoDown) return 'aligned-bearish';
  if (priceDown && kumoUp) return 'divergent-bullish';
  if (priceUp && kumoDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineIchimokuDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineIchimokuDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineIchimokuDivergenceCrossCrosses(
  series: readonly ChartLineIchimokuDivergenceCrossPoint[],
  regimes: readonly ChartLineIchimokuDivergenceCrossRegime[],
  midpointValues: readonly (number | null)[],
): ChartLineIchimokuDivergenceCrossCross[] {
  const out: ChartLineIchimokuDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevMid = midpointValues[i - 1];
    const curMid = midpointValues[i];
    const bias = classifyLineIchimokuDivergenceCrossBias(
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

export function runLineIchimokuDivergenceCross(
  data: ChartLineIchimokuDivergenceCrossPoint[],
  options: {
    tenkanLength?: number;
    kijunLength?: number;
    senkouBLength?: number;
  } = {},
): ChartLineIchimokuDivergenceCrossRun {
  const cleaned = getLineIchimokuDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const tenkanLength = normalizeLineIchimokuDivergenceCrossLength(
    options.tenkanLength,
    DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_TENKAN_LENGTH,
  );
  const kijunLength = normalizeLineIchimokuDivergenceCrossLength(
    options.kijunLength,
    DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_KIJUN_LENGTH,
  );
  const senkouBLength = normalizeLineIchimokuDivergenceCrossLength(
    options.senkouBLength,
    DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_SENKOU_B_LENGTH,
  );

  const channels = computeLineIchimokuDivergenceCross(series, {
    tenkanLength,
    kijunLength,
    senkouBLength,
  });

  const regimes: ChartLineIchimokuDivergenceCrossRegime[] = series.map(
    (p, i) => {
      if (i === 0) return 'none';
      const prevSample = series[i - 1];
      const curMid = channels.midpoint[i] ?? null;
      const prevMid = channels.midpoint[i - 1] ?? null;
      return classifyLineIchimokuDivergenceCrossRegime(
        p.close,
        prevSample ? prevSample.close : null,
        curMid,
        prevMid,
      );
    },
  );

  const samples: ChartLineIchimokuDivergenceCrossSample[] = series.map(
    (p, i) => {
      const midpoint = channels.midpoint[i] ?? null;
      const prevMid = i > 0 ? (channels.midpoint[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        midpoint,
        regime: regimes[i] ?? 'none',
        bias: classifyLineIchimokuDivergenceCrossBias(midpoint, prevMid),
      };
    },
  );

  const crosses = detectLineIchimokuDivergenceCrossCrosses(
    series,
    regimes,
    channels.midpoint,
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

  const warmup =
    Math.max(tenkanLength, kijunLength, senkouBLength) - 1;
  const ok = series.length > warmup + 1;

  return {
    series,
    tenkanLength,
    kijunLength,
    senkouBLength,
    tenkanValues: channels.tenkan,
    kijunValues: channels.kijun,
    senkouAValues: channels.senkouA,
    senkouBValues: channels.senkouB,
    midpointValues: channels.midpoint,
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

export interface ComputeLineIchimokuDivergenceCrossLayoutOptions {
  data: ChartLineIchimokuDivergenceCrossPoint[];
  tenkanLength?: number;
  kijunLength?: number;
  senkouBLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineIchimokuDivergenceCrossLayout(
  opts: ComputeLineIchimokuDivergenceCrossLayoutOptions,
): ChartLineIchimokuDivergenceCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineIchimokuDivergenceCross(opts.data, {
    tenkanLength: opts.tenkanLength ?? undefined,
    kijunLength: opts.kijunLength ?? undefined,
    senkouBLength: opts.senkouBLength ?? undefined,
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
  for (let i = 0; i < run.midpointValues.length; i += 1) {
    const m = run.midpointValues[i];
    if (m != null) {
      if (m < oscRawMin) oscRawMin = m;
      if (m > oscRawMax) oscRawMax = m;
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
      kumoPath: '',
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
  const priceDots: ChartLineIchimokuDivergenceCrossDot[] = [];
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

  let kumoPath = '';
  let firstKumo = true;
  for (const s of run.samples) {
    if (s.midpoint == null) {
      firstKumo = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.midpoint);
    kumoPath += `${firstKumo ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstKumo = false;
  }
  kumoPath = kumoPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const midAtCross = run.midpointValues[c.index];
    const cyOsc = midAtCross != null ? syOscBase(midAtCross) : oscBottom;
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
    kumoPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineIchimokuDivergenceCrossChart(
  data: ChartLineIchimokuDivergenceCrossPoint[],
  options: {
    tenkanLength?: number;
    kijunLength?: number;
    senkouBLength?: number;
  } = {},
): string {
  const cleaned = getLineIchimokuDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const tenkanLength = normalizeLineIchimokuDivergenceCrossLength(
    options.tenkanLength,
    DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_TENKAN_LENGTH,
  );
  const kijunLength = normalizeLineIchimokuDivergenceCrossLength(
    options.kijunLength,
    DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_KIJUN_LENGTH,
  );
  const senkouBLength = normalizeLineIchimokuDivergenceCrossLength(
    options.senkouBLength,
    DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_SENKOU_B_LENGTH,
  );
  return (
    `Ichimoku cloud divergence chart over ${cleaned.length} bars ` +
    `(tenkan ${tenkanLength}, kijun ${kijunLength}, senkouB ` +
    `${senkouBLength}). Top panel renders the close with bullish ` +
    `(price falling while kumo midpoint rising, bullish ` +
    `divergence -- cloud reversal warning up) / bearish (price ` +
    `rising while kumo midpoint falling, bearish divergence -- ` +
    `cloud reversal warning down) chevron overlays at every ` +
    `price-vs-kumo direction-disagreement transition; bottom ` +
    `panel renders the Ichimoku kumo midpoint (average of Senkou ` +
    `Span A and Senkou Span B) with markers coloured by midpoint ` +
    `slope bias (rising / falling / flat) at the trigger bar, ` +
    `flagging cloud reversal warning events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineIchimokuDivergenceCrossCrossKind,
  bias: ChartLineIchimokuDivergenceCrossBias,
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

export const ChartLineIchimokuDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineIchimokuDivergenceCrossProps
>(function ChartLineIchimokuDivergenceCross(props, ref): ReactNode {
  const {
    data,
    tenkanLength = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_TENKAN_LENGTH,
    kijunLength = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_KIJUN_LENGTH,
    senkouBLength = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_SENKOU_B_LENGTH,
    width = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_PRICE_COLOR,
    kumoColor = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_KUMO_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ICHIMOKU_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKumo = true,
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
    () => getLineIchimokuDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineIchimokuDivergenceCrossLayout({
        data: cleaned,
        tenkanLength,
        kijunLength,
        senkouBLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      tenkanLength,
      kijunLength,
      senkouBLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineIchimokuDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineIchimokuDivergenceCrossSeriesId,
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
    seriesId: ChartLineIchimokuDivergenceCrossSeriesId,
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
        data-section="chart-line-ichimoku-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineIchimokuDivergenceCrossChart(cleaned, {
      tenkanLength,
      kijunLength,
      senkouBLength,
    });

  const showPrice = !hidden.has('price');
  const showKumoLine = !hidden.has('kumo') && showKumo;

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
      aria-label={ariaLabel ?? 'Ichimoku cloud divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-ichimoku-divergence-cross"
      data-tenkan-length={tenkanLength}
      data-kijun-length={kijunLength}
      data-senkou-b-length={senkouBLength}
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
        data-section="chart-line-ichimoku-divergence-cross-title"
      >
        {ariaLabel ?? 'Ichimoku cloud divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-ichimoku-divergence-cross-aria-desc"
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
        data-section="chart-line-ichimoku-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-ichimoku-divergence-cross-grid">
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
                  data-section="chart-line-ichimoku-divergence-cross-grid-line-price"
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
                  data-section="chart-line-ichimoku-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-ichimoku-divergence-cross-axes">
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
                  data-section="chart-line-ichimoku-divergence-cross-tick-price"
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
                  data-section="chart-line-ichimoku-divergence-cross-tick-osc"
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
            data-section="chart-line-ichimoku-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-ichimoku-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-ichimoku-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKumoLine ? (
          <path
            d={layout.kumoPath}
            stroke={kumoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-ichimoku-divergence-cross-kumo-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-ichimoku-divergence-cross-crosses"
            role="group"
            aria-label="Ichimoku kumo divergence trigger markers"
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
                aria-label={`${m.kind} Ichimoku kumo divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-ichimoku-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-ichimoku-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay Ichimoku kumo divergence trigger markers"
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
                data-section={`chart-line-ichimoku-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-ichimoku-divergence-cross-hover-targets">
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
                data-section="chart-line-ichimoku-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-ichimoku-divergence-cross-tooltip"
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
                  data-section="chart-line-ichimoku-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-divergence-cross-tooltip-kumo"
                >
                  kumo{' '}
                  {tooltipSample.midpoint == null
                    ? '--'
                    : formatOsc(tooltipSample.midpoint)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-ichimoku-divergence-cross-tooltip-biases"
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
          data-section="chart-line-ichimoku-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          tenkan {tenkanLength} | kijun {kijunLength} | senkouB{' '}
          {senkouBLength} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-ichimoku-divergence-cross-legend"
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
              { id: 'kumo' as const, color: kumoColor, label: 'kumo' },
            ] satisfies Array<{
              id: ChartLineIchimokuDivergenceCrossSeriesId;
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

ChartLineIchimokuDivergenceCross.displayName =
  'ChartLineIchimokuDivergenceCross';
