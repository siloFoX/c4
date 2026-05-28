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
 * ChartLineSupertrendFlipCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the Supertrend
 * trailing-stop line in the bottom panel, marking bullish
 * (trend flips downtrend -> uptrend -- trend stop reversal
 * flip up) / bearish (trend flips uptrend -> downtrend --
 * trend stop reversal flip down) Supertrend flip events
 * with bias coloring derived from the supertrend slope at
 * the flip bar.
 *
 * This primitive watches the **trend state** transitions
 * rather than the supertrend line crossing a signal line.
 * A flip event is the canonical Supertrend trading signal:
 * the close has broken through the active trailing stop,
 * triggering a trend reversal.
 *
 *   tr[i]        = max(high - low,
 *                      |high - close[i-1]|,
 *                      |low  - close[i-1]|)
 *   atr[i]       = SMA(tr, period)
 *   hl2[i]       = (high[i] + low[i]) / 2
 *   upperBand[i] = hl2[i] + multiplier * atr[i]
 *   lowerBand[i] = hl2[i] - multiplier * atr[i]
 *
 *   finalUpper[i] = (upperBand[i] < finalUpper[i-1] ||
 *                    close[i-1] > finalUpper[i-1])
 *                   ? upperBand[i]
 *                   : finalUpper[i-1]
 *   finalLower[i] = (lowerBand[i] > finalLower[i-1] ||
 *                    close[i-1] < finalLower[i-1])
 *                   ? lowerBand[i]
 *                   : finalLower[i-1]
 *
 *   Initial trend seeded by sign(close[period] -
 *   close[period-1]) (positive or zero -> uptrend,
 *   negative -> downtrend) to keep canonical LINEAR
 *   anchors flip-free.
 *
 *   trend[i]     = +1 (uptrend) if close > prev finalUpper
 *                  -1 (downtrend) if close < prev finalLower
 *                  prev trend otherwise
 *   supertrend[i] = uptrend ? finalLower[i] :
 *                              finalUpper[i]
 *
 *   bullish (flip-up trigger) :
 *     prev trend === -1 && cur trend === +1
 *   bearish (flip-down trigger) :
 *     prev trend === +1 && cur trend === -1
 *
 *   bias        : supertrend[i] vs supertrend[i-1] -> up
 *                 / down / flat / none
 *
 * Defaults: `period = 10`, `multiplier = 3`. Olivier
 * Seban's Supertrend is a volatility-aware trailing stop
 * indicator: it brackets price by an ATR-scaled band
 * around HL2 and follows the lower band in an uptrend
 * (or upper band in a downtrend) as a dynamic stop. When
 * the close breaks through the active band, the trend
 * flips and the supertrend line jumps to the opposite
 * band. This primitive surfaces those flip events.
 *
 * Sibling family:
 *   - chart-line-supertrend-mid-cross-sig v1.11.1068
 *     (supertrend vs SMA signal cross)
 *   - chart-line-supertrend-divergence-cross v1.11.1062
 *     (price-vs-supertrend direction divergence)
 *   - this primitive: raw trend flip events
 *
 * Each of the three surfaces a different Supertrend
 * signal niche. The flip-cross variant is the canonical
 * Supertrend trading signal -- the moment when the
 * trailing stop is breached.
 *
 * Uses SMA-based ATR (matching the chart-line-atr-
 * breakout-cross v1.11.1048 / atr-divergence-cross
 * v1.11.1064 / supertrend-mid-cross-sig v1.11.1068
 * siblings) for bit-exact integer ATR values on linear
 * input. The Wilder ATR variant is used by
 * chart-line-supertrend-divergence-cross v1.11.1062.
 *
 * Warmup is `period = 10` for the default tuning: ATR
 * and supertrend both seed at i = period = 10. Flip
 * detection requires the previous bar's trend, so the
 * first potential flip lands at i = period + 1 = 11.
 *
 * Bit-exact anchors (HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close
 *   = K`: tr = 2, atr = 2. hl2 = K. upperBand = K + 6,
 *   lowerBand = K - 6. close[period] - close[period-1]
 *   = 0 -> init uptrend. supertrend = finalLower = K - 6
 *   (constant). close = K always > prev finalLower
 *   (K - 6) -> trend stays uptrend. 0 flips. Verified
 *   across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: tr = 2, atr = 2. close[period] -
 *   close[period-1] = +1 -> init uptrend. close = i >
 *   prev finalLower = i - 7 -> stays uptrend. supertrend
 *   = finalLower = i - 6 (slope +1). 0 flips.
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: tr = 2, atr = 2. close[period] -
 *   close[period-1] = -1 -> init downtrend. close = -i
 *   < prev finalUpper = -i + 7 -> stays downtrend.
 *   supertrend = finalUpper = -i + 6 (slope -1). 0
 *   flips.
 */

export interface ChartLineSupertrendFlipCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineSupertrendFlipCrossBias =
  | 'up'
  | 'down'
  | 'flat'
  | 'none';

export type ChartLineSupertrendFlipCrossSeriesId =
  | 'price'
  | 'supertrend';

export type ChartLineSupertrendFlipCrossCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineSupertrendFlipCrossCross {
  index: number;
  x: number;
  kind: ChartLineSupertrendFlipCrossCrossKind;
  bias: ChartLineSupertrendFlipCrossBias;
}

export interface ChartLineSupertrendFlipCrossSample {
  index: number;
  x: number;
  close: number;
  supertrend: number | null;
  trend: 1 | -1 | null;
  bias: ChartLineSupertrendFlipCrossBias;
}

export interface ChartLineSupertrendFlipCrossRun {
  series: ChartLineSupertrendFlipCrossPoint[];
  period: number;
  multiplier: number;
  atrValues: Array<number | null>;
  supertrendValues: Array<number | null>;
  trendValues: Array<1 | -1 | null>;
  samples: ChartLineSupertrendFlipCrossSample[];
  crosses: ChartLineSupertrendFlipCrossCross[];
  uptrendCount: number;
  downtrendCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineSupertrendFlipCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSupertrendFlipCrossLayout {
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
  priceDots: ChartLineSupertrendFlipCrossDot[];
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
    kind: ChartLineSupertrendFlipCrossCrossKind;
    bias: ChartLineSupertrendFlipCrossBias;
  }>;
  run: ChartLineSupertrendFlipCrossRun;
}

export interface ChartLineSupertrendFlipCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSupertrendFlipCrossPoint[];
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
  hiddenSeries?: ChartLineSupertrendFlipCrossSeriesId[];
  defaultHiddenSeries?: ChartLineSupertrendFlipCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSupertrendFlipCrossSeriesId;
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

export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PERIOD = 10;
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_MULTIPLIER = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_SUPERTREND_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_UP_BIAS_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_DOWN_BIAS_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_FLAT_BIAS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_GRID_COLOR =
  '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineSupertrendFlipCrossFinitePoints(
  data: readonly ChartLineSupertrendFlipCrossPoint[] | null | undefined,
): ChartLineSupertrendFlipCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSupertrendFlipCrossPoint[] = [];
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

export function normalizeLineSupertrendFlipCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineSupertrendFlipCrossMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

export interface SupertrendFlipCrossChannels {
  atr: Array<number | null>;
  supertrend: Array<number | null>;
  trend: Array<1 | -1 | null>;
}

export function computeLineSupertrendFlipCross(
  series: readonly ChartLineSupertrendFlipCrossPoint[] | null | undefined,
  options: { period?: number; multiplier?: number } = {},
): SupertrendFlipCrossChannels {
  const cleaned = getLineSupertrendFlipCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { atr: [], supertrend: [], trend: [] };
  }
  const period = normalizeLineSupertrendFlipCrossLength(
    options.period,
    DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PERIOD,
  );
  const multiplier = normalizeLineSupertrendFlipCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_MULTIPLIER,
  );

  const n = cleaned.length;
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
  for (let i = period; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - period + 1; j <= i; j += 1) {
      const v = tr[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    atr[i] = winMin === winMax ? winMin : posZero(sum / period);
  }

  const supertrend: Array<number | null> = new Array(n).fill(null);
  const trend: Array<1 | -1 | null> = new Array(n).fill(null);

  if (n > period) {
    let prevFinalUpper: number | null = null;
    let prevFinalLower: number | null = null;
    let prevTrend: 1 | -1 = 1;

    const seedDiff =
      cleaned[period]!.close - cleaned[period - 1]!.close;
    prevTrend = seedDiff < 0 ? -1 : 1;

    for (let i = period; i < n; i += 1) {
      const cur = cleaned[i]!;
      const a = atr[i];
      if (a == null) continue;
      const hl2 = (cur.high + cur.low) / 2;
      const basicUpper = hl2 + multiplier * a;
      const basicLower = hl2 - multiplier * a;

      const finalUpper =
        prevFinalUpper == null ||
        basicUpper < prevFinalUpper ||
        (i > 0 && cleaned[i - 1]!.close > prevFinalUpper)
          ? basicUpper
          : prevFinalUpper;
      const finalLower =
        prevFinalLower == null ||
        basicLower > prevFinalLower ||
        (i > 0 && cleaned[i - 1]!.close < prevFinalLower)
          ? basicLower
          : prevFinalLower;

      let curTrend: 1 | -1 = prevTrend;
      if (prevFinalUpper != null && cur.close > prevFinalUpper) {
        curTrend = 1;
      } else if (prevFinalLower != null && cur.close < prevFinalLower) {
        curTrend = -1;
      }

      trend[i] = curTrend;
      supertrend[i] = posZero(curTrend === 1 ? finalLower : finalUpper);

      prevFinalUpper = finalUpper;
      prevFinalLower = finalLower;
      prevTrend = curTrend;
    }
  }

  return { atr, supertrend, trend };
}

export function classifyLineSupertrendFlipCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineSupertrendFlipCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineSupertrendFlipCrossCrosses(
  series: readonly ChartLineSupertrendFlipCrossPoint[],
  trendValues: readonly (1 | -1 | null)[],
  supertrendValues: readonly (number | null)[],
): ChartLineSupertrendFlipCrossCross[] {
  const out: ChartLineSupertrendFlipCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pt = trendValues[i - 1];
    const ct = trendValues[i];
    if (pt == null || ct == null) continue;
    const prevSt = supertrendValues[i - 1] ?? null;
    const curSt = supertrendValues[i] ?? null;
    const bias = classifyLineSupertrendFlipCrossBias(curSt, prevSt);
    if (pt === -1 && ct === 1) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish', bias });
    } else if (pt === 1 && ct === -1) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish', bias });
    }
  }
  return out;
}

export function runLineSupertrendFlipCross(
  data: ChartLineSupertrendFlipCrossPoint[],
  options: { period?: number; multiplier?: number } = {},
): ChartLineSupertrendFlipCrossRun {
  const cleaned = getLineSupertrendFlipCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineSupertrendFlipCrossLength(
    options.period,
    DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PERIOD,
  );
  const multiplier = normalizeLineSupertrendFlipCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_MULTIPLIER,
  );

  const channels = computeLineSupertrendFlipCross(series, {
    period,
    multiplier,
  });

  const samples: ChartLineSupertrendFlipCrossSample[] = series.map(
    (p, i) => {
      const st = channels.supertrend[i] ?? null;
      const prev = i > 0 ? (channels.supertrend[i - 1] ?? null) : null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        supertrend: st,
        trend: channels.trend[i] ?? null,
        bias: classifyLineSupertrendFlipCrossBias(st, prev),
      };
    },
  );

  const crosses = detectLineSupertrendFlipCrossCrosses(
    series,
    channels.trend,
    channels.supertrend,
  );

  let uptrendCount = 0;
  let downtrendCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  for (const s of samples) {
    if (s.trend === 1) uptrendCount += 1;
    else if (s.trend === -1) downtrendCount += 1;
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
    supertrendValues: channels.supertrend,
    trendValues: channels.trend,
    samples,
    crosses,
    uptrendCount,
    downtrendCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineSupertrendFlipCrossLayoutOptions {
  data: ChartLineSupertrendFlipCrossPoint[];
  period?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSupertrendFlipCrossLayout(
  opts: ComputeLineSupertrendFlipCrossLayoutOptions,
): ChartLineSupertrendFlipCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PANEL_GAP;

  const run = runLineSupertrendFlipCross(opts.data, {
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
    const v = run.supertrendValues[i];
    if (v != null) {
      if (v < oscRawMin) oscRawMin = v;
      if (v > oscRawMax) oscRawMax = v;
    }
  }
  if (!Number.isFinite(oscRawMin) || !Number.isFinite(oscRawMax)) {
    oscRawMin = -1;
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
  const priceDots: ChartLineSupertrendFlipCrossDot[] = [];
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
    const stAt = run.supertrendValues[c.index];
    const cyOsc = stAt != null ? syOscBase(stAt) : oscBottom;
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

export function describeLineSupertrendFlipCrossChart(
  data: ChartLineSupertrendFlipCrossPoint[],
  options: { period?: number; multiplier?: number } = {},
): string {
  const cleaned = getLineSupertrendFlipCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineSupertrendFlipCrossLength(
    options.period,
    DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PERIOD,
  );
  const multiplier = normalizeLineSupertrendFlipCrossMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_MULTIPLIER,
  );
  return (
    `Supertrend flip-cross chart over ${cleaned.length} bars ` +
    `(period ${period}, multiplier ${multiplier}). Top panel renders ` +
    `the close with bullish (trend flips downtrend to uptrend, trend ` +
    `stop reversal flip up; close just broke above the trailing ` +
    `stop) / bearish (trend flips uptrend to downtrend, trend stop ` +
    `reversal flip down; close just broke below the trailing stop) ` +
    `chevron overlays at every trend flip event; bottom panel ` +
    `renders Olivier Seban's Supertrend trailing-stop line ` +
    `(volatility-aware ATR-scaled band around HL2 that follows the ` +
    `lower band in uptrends and upper band in downtrends), marker- ` +
    `coloured by supertrend slope bias (rising / falling / flat) at ` +
    `the flip bar, flagging canonical trend stop reversal flip ` +
    `events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineSupertrendFlipCrossCrossKind,
  bias: ChartLineSupertrendFlipCrossBias,
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

export const ChartLineSupertrendFlipCross = forwardRef<
  HTMLDivElement,
  ChartLineSupertrendFlipCrossProps
>(function ChartLineSupertrendFlipCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PERIOD,
    multiplier = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_MULTIPLIER,
    width = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_PRICE_COLOR,
    supertrendColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_SUPERTREND_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_CROSS_GRID_COLOR,
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
    () => getLineSupertrendFlipCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSupertrendFlipCrossLayout({
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
    ChartLineSupertrendFlipCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineSupertrendFlipCrossSeriesId,
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
    seriesId: ChartLineSupertrendFlipCrossSeriesId,
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
        data-section="chart-line-supertrend-flip-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSupertrendFlipCrossChart(cleaned, {
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
      aria-label={ariaLabel ?? 'Supertrend flip-cross chart'}
      aria-describedby={descId}
      data-section="chart-line-supertrend-flip-cross"
      data-period={period}
      data-multiplier={multiplier}
      data-total-points={cleaned.length}
      data-uptrend-count={layout.run.uptrendCount}
      data-downtrend-count={layout.run.downtrendCount}
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
        data-section="chart-line-supertrend-flip-cross-title"
      >
        {ariaLabel ?? 'Supertrend flip-cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-supertrend-flip-cross-aria-desc"
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
        data-section="chart-line-supertrend-flip-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-supertrend-flip-cross-grid">
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
                  data-section="chart-line-supertrend-flip-cross-grid-line-price"
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
                  data-section="chart-line-supertrend-flip-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-supertrend-flip-cross-axes">
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
                  data-section="chart-line-supertrend-flip-cross-tick-price"
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
                  data-section="chart-line-supertrend-flip-cross-tick-osc"
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
            data-section="chart-line-supertrend-flip-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-supertrend-flip-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-supertrend-flip-cross-price-dot"
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
            data-section="chart-line-supertrend-flip-cross-supertrend-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-supertrend-flip-cross-crosses"
            role="group"
            aria-label="Supertrend flip trigger markers"
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
                aria-label={`${m.kind} Supertrend flip at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-section={`chart-line-supertrend-flip-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-supertrend-flip-cross-overlay-crosses"
            role="group"
            aria-label="overlay Supertrend flip trigger markers"
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
                data-section={`chart-line-supertrend-flip-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-supertrend-flip-cross-hover-targets">
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
                data-section="chart-line-supertrend-flip-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-supertrend-flip-cross-tooltip"
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
                  data-section="chart-line-supertrend-flip-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-flip-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-flip-cross-tooltip-supertrend"
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
                  data-section="chart-line-supertrend-flip-cross-tooltip-trend"
                >
                  trend{' '}
                  {tooltipSample.trend == null
                    ? '--'
                    : tooltipSample.trend === 1
                      ? 'up'
                      : 'down'}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-flip-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-flip-cross-tooltip-counts"
                >
                  uptrend {layout.run.uptrendCount} | downtrend{' '}
                  {layout.run.downtrendCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-flip-cross-tooltip-crosses"
                >
                  bull flips {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-supertrend-flip-cross-tooltip-biases"
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
          data-section="chart-line-supertrend-flip-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | mult {multiplier} | flips{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-supertrend-flip-cross-legend"
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
              id: ChartLineSupertrendFlipCrossSeriesId;
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

ChartLineSupertrendFlipCross.displayName = 'ChartLineSupertrendFlipCross';
