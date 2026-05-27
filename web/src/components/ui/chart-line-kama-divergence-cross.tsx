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
 * ChartLineKamaDivergenceCross -- pure-SVG dual-panel
 * chart with the close in the top panel and the Kaufman
 * Adaptive Moving Average (KAMA) in the bottom panel,
 * marking price vs KAMA direction-disagreement events as
 * volatility-adaptive trend reversal warnings.
 *
 *   change[i]   = |close[i] - close[i - period]|
 *   volat[i]    = sum(|close[j] - close[j-1]|, j = i -
 *                     period + 1 .. i)
 *   er[i]       = change[i] / volat[i]  (0 when volat = 0)
 *   fastSc      = 2 / (fastLength + 1)
 *   slowSc      = 2 / (slowLength + 1)
 *   sc[i]       = (er[i] * (fastSc - slowSc) + slowSc) ^ 2
 *   kama[i-0]   = SMA(close, period)              (seed)
 *   kama[i]     = kama[i-1] + sc[i] * (close[i] -
 *                 kama[i-1])
 *
 *   priceUp     : close[i] > close[i-1]
 *   priceDown   : close[i] < close[i-1]
 *   kamaUp      : kama[i]  > kama[i-1]
 *   kamaDown    : kama[i]  < kama[i-1]
 *
 *   regime ->
 *     'aligned-bullish'   when priceUp   && kamaUp
 *     'aligned-bearish'   when priceDown && kamaDown
 *     'divergent-bullish' when priceDown && kamaUp
 *                          (price falling but KAMA rising
 *                           -- volatility-adaptive bullish
 *                           reversal warning)
 *     'divergent-bearish' when priceUp   && kamaDown
 *                          (price rising but KAMA falling
 *                           -- volatility-adaptive bearish
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
 *   bias        : kama[i] vs kama[i-1] -> up / down /
 *                 flat / none
 *
 * Defaults: `period = 10`, `fastLength = 2`, `slowLength
 * = 30`. KAMA is Perry Kaufman's 1995 adaptive-smoothing
 * moving average. The smoothing constant `sc` adapts each
 * bar based on the efficiency ratio: trending markets
 * (high ER) get fast smoothing close to `(2/3)^2 = 4/9`,
 * ranging markets (low ER) get slow smoothing close to
 * `(2/31)^2 ~= 0.004`. The result is a centerline that
 * tracks fast-moving trends closely but ignores
 * mean-reverting noise.
 *
 * Warmup is `period - 1 = 9` for the default tuning: KAMA
 * is seeded at `i = period - 1` with `SMA(close, period)`,
 * then the adaptive recurrence runs from `i = period`.
 * Divergence detection requires the previous KAMA + close,
 * so the first regime classification lands at i = period
 * = 10. The adaptive recurrence converges asymptotically
 * to its steady-state value -- bit-exact behaviour on
 * LINEAR input holds at the late tail of the series
 * (typically 30+ bars in) where convergence error drops
 * below 1e-9, but the direction-classification regime is
 * correct from `i >= period` onwards because KAMA is
 * monotone in the input direction even before
 * convergence.
 *
 * Bit-exact anchors (close-only):
 *
 * - **CONST close = K**: SMA seed = K, ER undefined (0/0
 *   guard -> 0). sc = slowSc^2. KAMA[i] = K + slowSc^2 *
 *   (K - K) = K for every i. Both close and KAMA are
 *   flat -> regime `none` for every bar. 0 divergence
 *   crosses. Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP close = i**: ER = 1 (numerator and
 *   denominator both equal `period`). sc = (1 * (fastSc
 *   - slowSc) + slowSc)^2 = fastSc^2 = (2/3)^2 = 4/9.
 *   KAMA recurrence on LINEAR input converges
 *   asymptotically to steady-state `i - 1.25` (lag = 1
 *   / sc - 1 = 9/4 - 1 = 5/4 = 1.25). At the late tail
 *   convergence error is below 1e-9. close[i] -
 *   close[i-1] = +1 (up); KAMA monotonically increases
 *   throughout -> regime `aligned-bullish` for every i
 *   >= period. 0 divergence crosses.
 * - **LINEAR DOWN close = -i**: mirror -> KAMA = -i +
 *   1.25 at steady state. Both close and KAMA falling ->
 *   regime `aligned-bearish` for every i >= period.
 *   0 divergence crosses.
 */

export interface ChartLineKamaDivergenceCrossPoint {
  x: number;
  close: number;
}

export type ChartLineKamaDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineKamaDivergenceCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineKamaDivergenceCrossSeriesId = 'price' | 'kama';

export type ChartLineKamaDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineKamaDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineKamaDivergenceCrossCrossKind;
  bias: ChartLineKamaDivergenceCrossBias;
}

export interface ChartLineKamaDivergenceCrossSample {
  index: number;
  x: number;
  close: number;
  kama: number | null;
  regime: ChartLineKamaDivergenceCrossRegime;
  bias: ChartLineKamaDivergenceCrossBias;
}

export interface ChartLineKamaDivergenceCrossRun {
  series: ChartLineKamaDivergenceCrossPoint[];
  period: number;
  fastLength: number;
  slowLength: number;
  kamaValues: Array<number | null>;
  efficiencyValues: Array<number | null>;
  samples: ChartLineKamaDivergenceCrossSample[];
  crosses: ChartLineKamaDivergenceCrossCross[];
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

export interface ChartLineKamaDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKamaDivergenceCrossLayout {
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
  priceDots: ChartLineKamaDivergenceCrossDot[];
  kamaPath: string;
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
    kind: ChartLineKamaDivergenceCrossCrossKind;
    bias: ChartLineKamaDivergenceCrossBias;
  }>;
  run: ChartLineKamaDivergenceCrossRun;
}

export interface ChartLineKamaDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKamaDivergenceCrossPoint[];
  period?: number;
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kamaColor?: string;
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
  showKama?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKamaDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineKamaDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKamaDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PERIOD = 10;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_FAST_LENGTH = 2;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_SLOW_LENGTH = 30;
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_KAMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineKamaDivergenceCrossFinitePoints(
  data: readonly ChartLineKamaDivergenceCrossPoint[] | null | undefined,
): ChartLineKamaDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKamaDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

export function normalizeLineKamaDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export interface KamaDivergenceCrossChannels {
  kama: Array<number | null>;
  efficiency: Array<number | null>;
}

export function computeLineKamaDivergenceCross(
  series: readonly ChartLineKamaDivergenceCrossPoint[] | null | undefined,
  options: {
    period?: number;
    fastLength?: number;
    slowLength?: number;
  } = {},
): KamaDivergenceCrossChannels {
  const cleaned = getLineKamaDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { kama: [], efficiency: [] };
  }
  const period = normalizeLineKamaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PERIOD,
  );
  const fastLength = normalizeLineKamaDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKamaDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  const fastSc = 2 / (fastLength + 1);
  const slowSc = 2 / (slowLength + 1);
  const scRange = fastSc - slowSc;

  const n = cleaned.length;
  const closes = cleaned.map((p) => p.close);
  const kama: Array<number | null> = new Array(n).fill(null);
  const efficiency: Array<number | null> = new Array(n).fill(null);

  if (n < period) return { kama, efficiency };

  // Seed with SMA of first `period` closes at index period - 1.
  let sum = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let j = 0; j < period; j += 1) {
    const v = closes[j]!;
    sum += v;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
  }
  const seed = winMin === winMax ? winMin : posZero(sum / period);
  kama[period - 1] = seed;

  for (let i = period; i < n; i += 1) {
    const change = Math.abs(closes[i]! - closes[i - period]!);
    let volat = 0;
    for (let j = i - period + 1; j <= i; j += 1) {
      volat += Math.abs(closes[j]! - closes[j - 1]!);
    }
    const er = volat === 0 ? 0 : change / volat;
    efficiency[i] = posZero(er);
    const sc = (er * scRange + slowSc) ** 2;
    const prevKama = kama[i - 1] ?? seed;
    kama[i] = posZero(prevKama + sc * (closes[i]! - prevKama));
  }

  return { kama, efficiency };
}

export function classifyLineKamaDivergenceCrossRegime(
  curClose: number | null,
  prevClose: number | null,
  curKama: number | null,
  prevKama: number | null,
): ChartLineKamaDivergenceCrossRegime {
  if (
    curClose == null ||
    prevClose == null ||
    curKama == null ||
    prevKama == null
  )
    return 'none';
  const priceUp = curClose > prevClose;
  const priceDown = curClose < prevClose;
  const kamaUp = curKama > prevKama;
  const kamaDown = curKama < prevKama;
  if (priceUp && kamaUp) return 'aligned-bullish';
  if (priceDown && kamaDown) return 'aligned-bearish';
  if (priceDown && kamaUp) return 'divergent-bullish';
  if (priceUp && kamaDown) return 'divergent-bearish';
  return 'none';
}

export function classifyLineKamaDivergenceCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineKamaDivergenceCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineKamaDivergenceCrossCrosses(
  series: readonly ChartLineKamaDivergenceCrossPoint[],
  regimes: readonly ChartLineKamaDivergenceCrossRegime[],
  kamaValues: readonly (number | null)[],
): ChartLineKamaDivergenceCrossCross[] {
  const out: ChartLineKamaDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = regimes[i - 1];
    const cur = regimes[i];
    const prevKama = kamaValues[i - 1];
    const curKama = kamaValues[i];
    const bias = classifyLineKamaDivergenceCrossBias(
      curKama ?? null,
      prevKama ?? null,
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

export function runLineKamaDivergenceCross(
  data: ChartLineKamaDivergenceCrossPoint[],
  options: {
    period?: number;
    fastLength?: number;
    slowLength?: number;
  } = {},
): ChartLineKamaDivergenceCrossRun {
  const cleaned = getLineKamaDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineKamaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PERIOD,
  );
  const fastLength = normalizeLineKamaDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKamaDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_SLOW_LENGTH,
  );

  const channels = computeLineKamaDivergenceCross(series, {
    period,
    fastLength,
    slowLength,
  });

  const regimes: ChartLineKamaDivergenceCrossRegime[] = series.map(
    (p, i) => {
      if (i === 0) return 'none';
      const prevSample = series[i - 1];
      const curKama = channels.kama[i] ?? null;
      const prevKama = channels.kama[i - 1] ?? null;
      return classifyLineKamaDivergenceCrossRegime(
        p.close,
        prevSample ? prevSample.close : null,
        curKama,
        prevKama,
      );
    },
  );

  const samples: ChartLineKamaDivergenceCrossSample[] = series.map(
    (p, i) => {
      const kama = channels.kama[i] ?? null;
      const prevKama = i > 0 ? (channels.kama[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        kama,
        regime: regimes[i] ?? 'none',
        bias: classifyLineKamaDivergenceCrossBias(kama, prevKama),
      };
    },
  );

  const crosses = detectLineKamaDivergenceCrossCrosses(
    series,
    regimes,
    channels.kama,
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
    fastLength,
    slowLength,
    kamaValues: channels.kama,
    efficiencyValues: channels.efficiency,
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

export interface ComputeLineKamaDivergenceCrossLayoutOptions {
  data: ChartLineKamaDivergenceCrossPoint[];
  period?: number;
  fastLength?: number;
  slowLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineKamaDivergenceCrossLayout(
  opts: ComputeLineKamaDivergenceCrossLayoutOptions,
): ChartLineKamaDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineKamaDivergenceCross(opts.data, {
    period: opts.period ?? undefined,
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
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
  for (let i = 0; i < run.kamaValues.length; i += 1) {
    const k = run.kamaValues[i];
    if (k != null) {
      if (k < oscRawMin) oscRawMin = k;
      if (k > oscRawMax) oscRawMax = k;
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
      kamaPath: '',
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
  const priceDots: ChartLineKamaDivergenceCrossDot[] = [];
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

  let kamaPath = '';
  let firstKama = true;
  for (const s of run.samples) {
    if (s.kama == null) {
      firstKama = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.kama);
    kamaPath += `${firstKama ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstKama = false;
  }
  kamaPath = kamaPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const kamaAtCross = run.kamaValues[c.index];
    const cyOsc = kamaAtCross != null ? syOscBase(kamaAtCross) : oscBottom;
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
    kamaPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineKamaDivergenceCrossChart(
  data: ChartLineKamaDivergenceCrossPoint[],
  options: {
    period?: number;
    fastLength?: number;
    slowLength?: number;
  } = {},
): string {
  const cleaned = getLineKamaDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineKamaDivergenceCrossLength(
    options.period,
    DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PERIOD,
  );
  const fastLength = normalizeLineKamaDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKamaDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  return (
    `KAMA divergence chart over ${cleaned.length} bars (period ` +
    `${period}, fast ${fastLength}, slow ${slowLength}). Top ` +
    `panel renders the close with bullish (price falling while ` +
    `KAMA rising, bullish divergence -- volatility-adaptive ` +
    `trend reversal warning up) / bearish (price rising while ` +
    `KAMA falling, bearish divergence -- volatility-adaptive ` +
    `trend reversal warning down) chevron overlays at every ` +
    `price-vs-KAMA direction-disagreement transition; bottom ` +
    `panel renders the Kaufman Adaptive Moving Average with ` +
    `markers coloured by KAMA slope bias (rising / falling / ` +
    `flat) at the trigger bar, flagging volatility-adaptive ` +
    `trend reversal warning events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineKamaDivergenceCrossCrossKind,
  bias: ChartLineKamaDivergenceCrossBias,
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

export const ChartLineKamaDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineKamaDivergenceCrossProps
>(function ChartLineKamaDivergenceCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PERIOD,
    fastLength = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_SLOW_LENGTH,
    width = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_PRICE_COLOR,
    kamaColor = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_KAMA_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_KAMA_DIVERGENCE_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKama = true,
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
    () => getLineKamaDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineKamaDivergenceCrossLayout({
        data: cleaned,
        period,
        fastLength,
        slowLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      period,
      fastLength,
      slowLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineKamaDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineKamaDivergenceCrossSeriesId,
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
    seriesId: ChartLineKamaDivergenceCrossSeriesId,
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
        data-section="chart-line-kama-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineKamaDivergenceCrossChart(cleaned, {
      period,
      fastLength,
      slowLength,
    });

  const showPrice = !hidden.has('price');
  const showKamaLine = !hidden.has('kama') && showKama;

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
      aria-label={ariaLabel ?? 'KAMA divergence chart'}
      aria-describedby={descId}
      data-section="chart-line-kama-divergence-cross"
      data-period={period}
      data-fast-length={fastLength}
      data-slow-length={slowLength}
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
        data-section="chart-line-kama-divergence-cross-title"
      >
        {ariaLabel ?? 'KAMA divergence chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-kama-divergence-cross-aria-desc"
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
        data-section="chart-line-kama-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-kama-divergence-cross-grid">
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
                  data-section="chart-line-kama-divergence-cross-grid-line-price"
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
                  data-section="chart-line-kama-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-kama-divergence-cross-axes">
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
                  data-section="chart-line-kama-divergence-cross-tick-price"
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
                  data-section="chart-line-kama-divergence-cross-tick-osc"
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
            data-section="chart-line-kama-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-kama-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-kama-divergence-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKamaLine ? (
          <path
            d={layout.kamaPath}
            stroke={kamaColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kama-divergence-cross-kama-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-kama-divergence-cross-crosses"
            role="group"
            aria-label="KAMA divergence trigger markers"
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
                aria-label={`${m.kind} KAMA divergence trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-kama-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-kama-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay KAMA divergence trigger markers"
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
                data-section={`chart-line-kama-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-kama-divergence-cross-hover-targets">
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
                data-section="chart-line-kama-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-kama-divergence-cross-tooltip"
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
                  data-section="chart-line-kama-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-divergence-cross-tooltip-kama"
                >
                  KAMA{' '}
                  {tooltipSample.kama == null
                    ? '--'
                    : formatOsc(tooltipSample.kama)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-divergence-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-divergence-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kama-divergence-cross-tooltip-biases"
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
          data-section="chart-line-kama-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | fast {fastLength} | slow {slowLength} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-kama-divergence-cross-legend"
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
              { id: 'kama' as const, color: kamaColor, label: 'KAMA' },
            ] satisfies Array<{
              id: ChartLineKamaDivergenceCrossSeriesId;
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

ChartLineKamaDivergenceCross.displayName = 'ChartLineKamaDivergenceCross';
