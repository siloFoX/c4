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
 * ChartLineStochCrossDivergence -- pure-SVG dual-panel
 * chart with the close in the top panel and the slow
 * Stochastic oscillator (smoothed %K and SMA %D signal)
 * in the bottom panel, marking bullish / bearish
 * Stochastic-cross-with-divergence events.
 *
 * A "cross-divergence" trigger fires only when **both**:
 *
 * 1. %K crosses %D (the canonical smoothed-momentum
 *    crossover signal), AND
 * 2. the price-vs-%K regime at the cross bar is
 *    divergent (priceDown + %K-up for bullish, or
 *    priceUp + %K-down for bearish).
 *
 * This compound filter rejects "aligned" crossovers
 * (where price and %K move in the same direction at the
 * cross bar) which often represent late-stage trend
 * continuation rather than reversals. Filtering to
 * divergent crosses tends to surface higher-quality
 * reversal signals.
 *
 *   hh[i]        = max(high[j], j in [i - period + 1, i])
 *   ll[i]        = min(low[j],  j in [i - period + 1, i])
 *   rawK[i]      = (hh[i] === ll[i])
 *                  ? 50   (flat-window guard -> midline)
 *                  : 100 * (close[i] - ll[i]) /
 *                          (hh[i] - ll[i])
 *   smoothK[i]   = SMA(rawK,    smoothK)
 *   d[i]         = SMA(smoothK, smoothD)
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   kUp         : smoothK[i] > smoothK[i-1]
 *   kDown       : smoothK[i] < smoothK[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && kUp
 *     'aligned-bearish'   when priceDown && kDown
 *     'divergent-bullish' when priceDown && kUp
 *     'divergent-bearish' when priceUp   && kDown
 *     'none'              when either side flat or null
 *
 *   k-over-d cross  :
 *     prevK <= prevD && curK > curD   -> raw bullish
 *     prevK >= prevD && curK < curD   -> raw bearish
 *
 *   bullish (cross-divergence trigger up) :
 *     raw bullish cross && regime === 'divergent-bullish'
 *   bearish (cross-divergence trigger down) :
 *     raw bearish cross && regime === 'divergent-bearish'
 *
 *   bias        : smoothK[i] vs smoothK[i-1] -> up /
 *                 down / flat / none
 *
 * Defaults: `period = 14`, `smoothK = 3`, `smoothD = 3`
 * -- canonical "slow stochastic" tuning. George Lane's
 * 1950s Stochastic oscillator locates the close within
 * the rolling [HH, LL] high-low range as a 0..100
 * percentage. The slow stochastic smooths %K with an SMA
 * (giving "smoothed %K") and then takes another SMA over
 * that to form the %D signal line. 50 is the natural
 * centerline; > 80 / < 20 are conventional overbought /
 * oversold zones.
 *
 * Warmup is `period + smoothK + smoothD - 2 = 18` for
 * the default tuning: rawK valid from i = period - 1 =
 * 13, smoothK valid from i = 13 + smoothK - 1 = 15, %D
 * valid from i = 15 + smoothD - 1 = 17. The cross
 * detector needs prev %K and prev %D, so the first
 * potential cross lands at i = 18.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: hh = K + 1, ll = K - 1. range = 2. rawK = 100
 *   * (K - (K - 1)) / 2 = 50 (midline). smoothK = 50,
 *   %D = 50. %K === %D every bar -> no cross. price flat
 *   -> regime `none` -> no divergence. 0 crosses.
 *   Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: hh = i + 1, ll = i - 14. range = 15. rawK =
 *   100 * (i - (i - 14)) / 15 = 1400 / 15 = 280 / 3
 *   ~= 93.33 (deep overbought). smoothK = %D = same.
 *   No cross (K === D). priceUp + Kflat -> regime none
 *   (flat-direction guard). 0 crosses.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: hh = -i + 14, ll = -i - 1. range = 15.
 *   rawK = 100 * (-i - (-i - 1)) / 15 = 100 / 15 = 20
 *   / 3 ~= 6.67 (deep oversold). No cross. priceDown +
 *   Kflat -> regime none. 0 crosses.
 */

export interface ChartLineStochCrossDivergencePoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineStochCrossDivergenceRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineStochCrossDivergenceBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineStochCrossDivergenceSeriesId =
  | 'price'
  | 'k'
  | 'd';

export type ChartLineStochCrossDivergenceCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineStochCrossDivergenceCross {
  index: number;
  x: number;
  kind: ChartLineStochCrossDivergenceCrossKind;
  bias: ChartLineStochCrossDivergenceBias;
}

export interface ChartLineStochCrossDivergenceSample {
  index: number;
  x: number;
  close: number;
  rawK: number | null;
  smoothK: number | null;
  d: number | null;
  regime: ChartLineStochCrossDivergenceRegime;
  bias: ChartLineStochCrossDivergenceBias;
}

export interface ChartLineStochCrossDivergenceRun {
  series: ChartLineStochCrossDivergencePoint[];
  period: number;
  smoothK: number;
  smoothD: number;
  rawKValues: Array<number | null>;
  smoothKValues: Array<number | null>;
  dValues: Array<number | null>;
  samples: ChartLineStochCrossDivergenceSample[];
  crosses: ChartLineStochCrossDivergenceCross[];
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

export interface ChartLineStochCrossDivergenceDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochCrossDivergenceLayout {
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
  priceDots: ChartLineStochCrossDivergenceDot[];
  kPath: string;
  dPath: string;
  centerlineY: number;
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
    kind: ChartLineStochCrossDivergenceCrossKind;
    bias: ChartLineStochCrossDivergenceBias;
  }>;
  run: ChartLineStochCrossDivergenceRun;
}

export interface ChartLineStochCrossDivergenceProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochCrossDivergencePoint[];
  period?: number;
  smoothK?: number;
  smoothD?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kColor?: string;
  dColor?: string;
  centerlineColor?: string;
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
  showK?: boolean;
  showD?: boolean;
  showCenterline?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochCrossDivergenceSeriesId[];
  defaultHiddenSeries?: ChartLineStochCrossDivergenceSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochCrossDivergenceSeriesId;
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

export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PERIOD = 14;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_K = 3;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_D = 3;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_CENTERLINE = 50;
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_K_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_D_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_CENTERLINE_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineStochCrossDivergenceFinitePoints(
  data:
    | readonly ChartLineStochCrossDivergencePoint[]
    | null
    | undefined,
): ChartLineStochCrossDivergencePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochCrossDivergencePoint[] = [];
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

export function normalizeLineStochCrossDivergenceLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Simple moving average with min===max short-circuit for CONST bit-exactness. */
export function applyLineStochCrossDivergenceSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(sum / length);
  }
  return out;
}

export interface StochCrossDivergenceChannels {
  rawK: Array<number | null>;
  smoothK: Array<number | null>;
  d: Array<number | null>;
}

export function computeLineStochCrossDivergence(
  series:
    | readonly ChartLineStochCrossDivergencePoint[]
    | null
    | undefined,
  options: { period?: number; smoothK?: number; smoothD?: number } = {},
): StochCrossDivergenceChannels {
  const cleaned = getLineStochCrossDivergenceFinitePoints(series);
  if (cleaned.length === 0) {
    return { rawK: [], smoothK: [], d: [] };
  }
  const period = normalizeLineStochCrossDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PERIOD,
  );
  const smoothK = normalizeLineStochCrossDivergenceLength(
    options.smoothK,
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_K,
  );
  const smoothD = normalizeLineStochCrossDivergenceLength(
    options.smoothD,
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_D,
  );

  const n = cleaned.length;
  const rawK: Array<number | null> = new Array(n).fill(null);
  for (let i = period - 1; i < n; i += 1) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      const p = cleaned[j]!;
      if (p.high > hh) hh = p.high;
      if (p.low < ll) ll = p.low;
    }
    const range = hh - ll;
    if (range === 0) {
      rawK[i] = 50;
    } else {
      rawK[i] = posZero((100 * (cleaned[i]!.close - ll)) / range);
    }
  }

  const smoothKValues = applyLineStochCrossDivergenceSma(rawK, smoothK);
  const dValues = applyLineStochCrossDivergenceSma(smoothKValues, smoothD);
  return { rawK, smoothK: smoothKValues, d: dValues };
}

export function classifyLineStochCrossDivergenceRegime(
  curClose: number | null,
  prevClose: number | null,
  curK: number | null,
  prevK: number | null,
): ChartLineStochCrossDivergenceRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curK == null ||
    prevK == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const kUp = curK > prevK;
  const kDown = curK < prevK;
  if (priceUp && kUp) return 'aligned-bullish';
  if (priceDown && kDown) return 'aligned-bearish';
  if (priceDown && kUp) return 'divergent-bullish';
  if (priceUp && kDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineStochCrossDivergenceBias(
  cur: number | null,
  prev: number | null,
): ChartLineStochCrossDivergenceBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineStochCrossDivergenceCrosses(
  series: readonly ChartLineStochCrossDivergencePoint[],
  regimes: readonly ChartLineStochCrossDivergenceRegime[],
  smoothKValues: readonly (number | null)[],
  dValues: readonly (number | null)[],
): ChartLineStochCrossDivergenceCross[] {
  const out: ChartLineStochCrossDivergenceCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pk = smoothKValues[i - 1];
    const pd = dValues[i - 1];
    const ck = smoothKValues[i];
    const cd = dValues[i];
    if (pk == null || pd == null || ck == null || cd == null) continue;
    const bias = classifyLineStochCrossDivergenceBias(ck, pk);
    const rawBullish = pk <= pd && ck > cd;
    const rawBearish = pk >= pd && ck < cd;
    if (rawBullish && regimes[i] === 'divergent-bullish') {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (rawBearish && regimes[i] === 'divergent-bearish') {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineStochCrossDivergence(
  data: ChartLineStochCrossDivergencePoint[],
  options: { period?: number; smoothK?: number; smoothD?: number } = {},
): ChartLineStochCrossDivergenceRun {
  const cleaned = getLineStochCrossDivergenceFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineStochCrossDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PERIOD,
  );
  const smoothK = normalizeLineStochCrossDivergenceLength(
    options.smoothK,
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_K,
  );
  const smoothD = normalizeLineStochCrossDivergenceLength(
    options.smoothD,
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_D,
  );

  const channels = computeLineStochCrossDivergence(series, {
    period,
    smoothK,
    smoothD,
  });

  const regimes: ChartLineStochCrossDivergenceRegime[] = series.map(
    (p, i) => {
      if (i === 0) return 'none';
      const prevSample = series[i - 1];
      const curK = channels.smoothK[i] ?? null;
      const prevK = channels.smoothK[i - 1] ?? null;
      return classifyLineStochCrossDivergenceRegime(
        p.close,
        prevSample ? prevSample.close : null,
        curK,
        prevK,
      );
    },
  );

  const samples: ChartLineStochCrossDivergenceSample[] = series.map(
    (p, i) => {
      const k = channels.smoothK[i] ?? null;
      const prevK = i > 0 ? (channels.smoothK[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        rawK: channels.rawK[i] ?? null,
        smoothK: k,
        d: channels.d[i] ?? null,
        regime: regimes[i] ?? 'none',
        bias: classifyLineStochCrossDivergenceBias(k, prevK),
      };
    },
  );

  const crosses = detectLineStochCrossDivergenceCrosses(
    series,
    regimes,
    channels.smoothK,
    channels.d,
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

  const warmup = period + smoothK + smoothD - 2;
  const ok = series.length > warmup;

  return {
    series,
    period,
    smoothK,
    smoothD,
    rawKValues: channels.rawK,
    smoothKValues: channels.smoothK,
    dValues: channels.d,
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

export interface ComputeLineStochCrossDivergenceLayoutOptions {
  data: ChartLineStochCrossDivergencePoint[];
  period?: number;
  smoothK?: number;
  smoothD?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStochCrossDivergenceLayout(
  opts: ComputeLineStochCrossDivergenceLayoutOptions,
): ChartLineStochCrossDivergenceLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PANEL_GAP;

  const run = runLineStochCrossDivergence(opts.data, {
    period: opts.period ?? undefined,
    smoothK: opts.smoothK ?? undefined,
    smoothD: opts.smoothD ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // Stochastic is hard-bounded to [0, 100].
  const oscMin = 0;
  const oscMax = 100;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const centerlineY = syOscBase(
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_CENTERLINE,
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
      kPath: '',
      dPath: '',
      centerlineY,
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
  const priceDots: ChartLineStochCrossDivergenceDot[] = [];
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
    accessor: (s: ChartLineStochCrossDivergenceSample) => number | null,
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

  const kPath = buildPath((s) => s.smoothK);
  const dPath = buildPath((s) => s.d);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const kAt = run.smoothKValues[c.index];
    const cyOsc = kAt != null ? syOscBase(kAt) : oscBottom;
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
    kPath,
    dPath,
    centerlineY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineStochCrossDivergenceChart(
  data: ChartLineStochCrossDivergencePoint[],
  options: { period?: number; smoothK?: number; smoothD?: number } = {},
): string {
  const cleaned = getLineStochCrossDivergenceFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineStochCrossDivergenceLength(
    options.period,
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PERIOD,
  );
  const smoothK = normalizeLineStochCrossDivergenceLength(
    options.smoothK,
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_K,
  );
  const smoothD = normalizeLineStochCrossDivergenceLength(
    options.smoothD,
    DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_D,
  );
  return (
    `Stochastic K/D cross-divergence chart over ${cleaned.length} ` +
    `bars (period ${period}, smoothK ${smoothK}, smoothD ${smoothD}). ` +
    `Top panel renders the close with bullish (K crosses up through ` +
    `D AND regime is divergent-bullish -- price falling but K still ` +
    `rising; smoothed momentum crossover divergence trigger up) / ` +
    `bearish (K crosses down through D AND regime is divergent- ` +
    `bearish -- price rising but K falling; smoothed momentum ` +
    `crossover divergence trigger down) chevron overlays at every ` +
    `qualified cross event; bottom panel renders George Lane's ` +
    `(1950s) Stochastic %K (smoothed) and %D signal line with the ` +
    `conventional momentum centerline at 50, marker-coloured by %K ` +
    `slope bias (rising / falling / flat) at the trigger bar, ` +
    `flagging smoothed momentum crossover divergence trigger events ` +
    `with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineStochCrossDivergenceCrossKind,
  bias: ChartLineStochCrossDivergenceBias,
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

export const ChartLineStochCrossDivergence = forwardRef<
  HTMLDivElement,
  ChartLineStochCrossDivergenceProps
>(function ChartLineStochCrossDivergence(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PERIOD,
    smoothK = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_K,
    smoothD = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_SMOOTH_D,
    width = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_PRICE_COLOR,
    kColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_K_COLOR,
    dColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_D_COLOR,
    centerlineColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_CENTERLINE_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_CROSS_DIVERGENCE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showK = true,
    showD = true,
    showCenterline = true,
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
    () => getLineStochCrossDivergenceFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStochCrossDivergenceLayout({
        data: cleaned,
        period,
        smoothK,
        smoothD,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, period, smoothK, smoothD, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStochCrossDivergenceSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineStochCrossDivergenceSeriesId,
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
    seriesId: ChartLineStochCrossDivergenceSeriesId,
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
        data-section="chart-line-stoch-cross-divergence-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStochCrossDivergenceChart(cleaned, {
      period,
      smoothK,
      smoothD,
    });

  const showPrice = !hidden.has('price');
  const showKLine = !hidden.has('k') && showK;
  const showDLine = !hidden.has('d') && showD;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, 20, 50, 80, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Stochastic K/D cross-divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-stoch-cross-divergence"
      data-period={period}
      data-smooth-k={smoothK}
      data-smooth-d={smoothD}
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
        data-section="chart-line-stoch-cross-divergence-title"
      >
        {ariaLabel ?? 'Stochastic K/D cross-divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stoch-cross-divergence-aria-desc"
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
        data-section="chart-line-stoch-cross-divergence-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stoch-cross-divergence-grid">
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
                  data-section="chart-line-stoch-cross-divergence-grid-line-price"
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
                  data-section="chart-line-stoch-cross-divergence-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stoch-cross-divergence-axes">
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
                  data-section="chart-line-stoch-cross-divergence-tick-price"
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
                  data-section="chart-line-stoch-cross-divergence-tick-osc"
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
            data-section="chart-line-stoch-cross-divergence-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stoch-cross-divergence-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stoch-cross-divergence-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCenterline ? (
          <line
            x1={layout.innerLeft}
            y1={layout.centerlineY}
            x2={layout.innerRight}
            y2={layout.centerlineY}
            stroke={centerlineColor}
            strokeDasharray="4 3"
            data-section="chart-line-stoch-cross-divergence-centerline"
          />
        ) : null}

        {showKLine ? (
          <path
            d={layout.kPath}
            stroke={kColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-cross-divergence-k-path"
          />
        ) : null}

        {showDLine ? (
          <path
            d={layout.dPath}
            stroke={dColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-cross-divergence-d-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-stoch-cross-divergence-crosses"
            role="group"
            aria-label="Stochastic cross-divergence trigger markers"
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
                aria-label={`${m.kind} Stochastic cross-divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-stoch-cross-divergence-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-stoch-cross-divergence-overlay-crosses"
            role="group"
            aria-label="overlay Stochastic cross-divergence trigger markers"
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
                data-section={`chart-line-stoch-cross-divergence-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stoch-cross-divergence-hover-targets">
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
                data-section="chart-line-stoch-cross-divergence-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stoch-cross-divergence-tooltip"
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
                  data-section="chart-line-stoch-cross-divergence-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-divergence-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-divergence-tooltip-k"
                >
                  K{' '}
                  {tooltipSample.smoothK == null
                    ? '--'
                    : formatOsc(tooltipSample.smoothK)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-divergence-tooltip-d"
                >
                  D{' '}
                  {tooltipSample.d == null
                    ? '--'
                    : formatOsc(tooltipSample.d)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-divergence-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-divergence-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-divergence-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-divergence-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} |
                  bear {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-cross-divergence-tooltip-crosses"
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
          data-section="chart-line-stoch-cross-divergence-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | smoothK {smoothK} | smoothD {smoothD} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stoch-cross-divergence-legend"
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
              { id: 'k' as const, color: kColor, label: '%K' },
              { id: 'd' as const, color: dColor, label: '%D' },
            ] satisfies Array<{
              id: ChartLineStochCrossDivergenceSeriesId;
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

ChartLineStochCrossDivergence.displayName = 'ChartLineStochCrossDivergence';
