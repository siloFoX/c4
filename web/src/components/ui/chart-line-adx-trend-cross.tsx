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
 * ChartLineAdxTrendCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the Average Directional
 * Index (ADX) plus the two fixed trend-strength thresholds
 * (`lower = 20`, `upper = 25`) in the bottom panel, marking
 * ADX crosses up through a threshold (trend emerging /
 * trend confirmed) and ADX crosses down through a threshold
 * (trend weakening / trend dissolved) with bias coloring
 * derived from the ADX slope at the trigger bar.
 *
 *   +DM[i]    = max(high[i] - high[i-1], 0) if greater
 *               than the matching downMove, else 0
 *   -DM[i]    = max(low[i-1] - low[i],   0) if greater
 *               than the matching upMove,   else 0
 *   TR[i]     = max(high[i] - low[i],
 *                   |high[i] - close[i-1]|,
 *                   |low[i]  - close[i-1]|)
 *   ATR[i]    = Wilder(TR,  period)        ; i >= period
 *   +DMs[i]   = Wilder(+DM, period)
 *   -DMs[i]   = Wilder(-DM, period)
 *   +DI[i]    = 100 * +DMs / ATR
 *   -DI[i]    = 100 * -DMs / ATR
 *   DX[i]     = 100 * |+DI - -DI| / (+DI + -DI)
 *               (0 when +DI + -DI = 0)
 *   ADX[i]    = SMA-init Wilder smooth of DX, period
 *               ; first valid at i = 2*period - 1
 *   regime    = 'weak'    when ADX < lower
 *               'forming' when lower <= ADX < upper
 *               'strong'  when ADX >= upper
 *               'none'    when ADX is null
 *   bias      = ADX[i] vs ADX[i-1] -> up / down / flat / none
 *   bullish   : ADX crossing UP   through lower OR upper
 *               (trend emerging / trend confirmed)
 *   bearish   : ADX crossing DOWN through upper OR lower
 *               (trend weakening / trend dissolved)
 *
 * Defaults: `period = 14`, `lower = 20`, `upper = 25`.
 * Wilder's standard ADX warm-up is `2 * period - 1 = 27`
 * because +DM, -DM, TR each need `period` bars to seed the
 * first smoothed value, then ADX needs another `period` DX
 * values to seed itself (initialised with SMA so it stays
 * bounded in `[0, 100]`).
 *
 * Bit-exact anchors (all use HLC input):
 *
 * - **CONST band** `high = K + 1`, `low = K - 1`, `close =
 *   K`: +DM = -DM = 0 everywhere -> +DI = -DI = 0 -> DX
 *   = 0 (the +DI + -DI = 0 guard) -> ADX = 0 from `i =
 *   2*period - 1`. ADX < lower -> regime `weak`. 0
 *   crosses. Verified across K in {0, 1, 50, 200, 1234}.
 * - **LINEAR UP** `high = i + 1`, `low = i - 1`, `close
 *   = i`: +DM = 1, -DM = 0, TR = 2 -> +DMs = 14, -DMs =
 *   0, ATR = 28 -> +DI = 50, -DI = 0 -> DX = 100 -> ADX
 *   = 100. ADX >= upper -> regime `strong`. 0 crosses
 *   (first valid ADX is already above both thresholds;
 *   there is no prev valid ADX to compare against).
 * - **LINEAR DOWN** `high = -i + 1`, `low = -i - 1`,
 *   `close = -i`: +DM = 0, -DM = 1, TR = 2 -> -DMs = 14
 *   etc. -> -DI = 50, +DI = 0 -> DX = 100 -> ADX = 100.
 *   Mirror of LINEAR UP. Regime `strong`. 0 crosses.
 */

export interface ChartLineAdxTrendCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAdxTrendCrossRegime =
  | 'weak'
  | 'forming'
  | 'strong'
  | 'none';

export type ChartLineAdxTrendCrossBias = 'up' | 'down' | 'flat' | 'none';

export type ChartLineAdxTrendCrossSeriesId = 'price' | 'adx';

export type ChartLineAdxTrendCrossCrossKind = 'bullish' | 'bearish';

export type ChartLineAdxTrendCrossThreshold = 'lower' | 'upper';

export interface ChartLineAdxTrendCrossCross {
  index: number;
  x: number;
  kind: ChartLineAdxTrendCrossCrossKind;
  threshold: ChartLineAdxTrendCrossThreshold;
  bias: ChartLineAdxTrendCrossBias;
}

export interface ChartLineAdxTrendCrossSample {
  index: number;
  x: number;
  close: number;
  adx: number | null;
  regime: ChartLineAdxTrendCrossRegime;
  bias: ChartLineAdxTrendCrossBias;
}

export interface ChartLineAdxTrendCrossRun {
  series: ChartLineAdxTrendCrossPoint[];
  period: number;
  lower: number;
  upper: number;
  vmPlus: Array<number | null>;
  vmMinus: Array<number | null>;
  trueRange: Array<number | null>;
  adxValues: Array<number | null>;
  diPlus: Array<number | null>;
  diMinus: Array<number | null>;
  samples: ChartLineAdxTrendCrossSample[];
  crosses: ChartLineAdxTrendCrossCross[];
  weakCount: number;
  formingCount: number;
  strongCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  lowerCrossCount: number;
  upperCrossCount: number;
  upBiasCount: number;
  downBiasCount: number;
  flatBiasCount: number;
  ok: boolean;
}

export interface ChartLineAdxTrendCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxTrendCrossLayout {
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
  priceDots: ChartLineAdxTrendCrossDot[];
  adxPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  lowerY: number;
  upperY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineAdxTrendCrossCrossKind;
    threshold: ChartLineAdxTrendCrossThreshold;
    bias: ChartLineAdxTrendCrossBias;
  }>;
  run: ChartLineAdxTrendCrossRun;
}

export interface ChartLineAdxTrendCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxTrendCrossPoint[];
  period?: number;
  lower?: number;
  upper?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  adxColor?: string;
  lowerThresholdColor?: string;
  upperThresholdColor?: string;
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
  showAdx?: boolean;
  showThresholds?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxTrendCrossSeriesId[];
  defaultHiddenSeries?: ChartLineAdxTrendCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxTrendCrossSeriesId;
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

export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_LOWER = 20;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_UPPER = 25;
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_ADX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_LOWER_THRESHOLD_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_UPPER_THRESHOLD_COLOR =
  '#475569';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_UP_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_DOWN_BIAS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_FLAT_BIAS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_TREND_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineAdxTrendCrossFinitePoints(
  data: readonly ChartLineAdxTrendCrossPoint[] | null | undefined,
): ChartLineAdxTrendCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxTrendCrossPoint[] = [];
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

export function normalizeLineAdxTrendCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineAdxTrendCrossThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

export interface AdxTrendCrossChannels {
  vmPlus: Array<number | null>;
  vmMinus: Array<number | null>;
  trueRange: Array<number | null>;
  plusDmSmoothed: Array<number | null>;
  minusDmSmoothed: Array<number | null>;
  atr: Array<number | null>;
  diPlus: Array<number | null>;
  diMinus: Array<number | null>;
  dx: Array<number | null>;
  adx: Array<number | null>;
}

export function computeLineAdxTrendCross(
  series: readonly ChartLineAdxTrendCrossPoint[] | null | undefined,
  options: { period?: number } = {},
): AdxTrendCrossChannels {
  const cleaned = getLineAdxTrendCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      vmPlus: [],
      vmMinus: [],
      trueRange: [],
      plusDmSmoothed: [],
      minusDmSmoothed: [],
      atr: [],
      diPlus: [],
      diMinus: [],
      dx: [],
      adx: [],
    };
  }
  const period = normalizeLineAdxTrendCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ADX_TREND_CROSS_PERIOD,
  );

  const n = cleaned.length;
  const vmPlus: Array<number | null> = new Array(n).fill(null);
  const vmMinus: Array<number | null> = new Array(n).fill(null);
  const trueRange: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]!;
    const prev = cleaned[i - 1]!;
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    let plusDm = 0;
    let minusDm = 0;
    if (upMove > downMove && upMove > 0) plusDm = upMove;
    if (downMove > upMove && downMove > 0) minusDm = downMove;
    vmPlus[i] = posZero(plusDm);
    vmMinus[i] = posZero(minusDm);
    const range = cur.high - cur.low;
    const highToPrevClose = Math.abs(cur.high - prev.close);
    const lowToPrevClose = Math.abs(cur.low - prev.close);
    trueRange[i] = posZero(
      Math.max(range, highToPrevClose, lowToPrevClose),
    );
  }

  const plusDmSmoothed: Array<number | null> = new Array(n).fill(null);
  const minusDmSmoothed: Array<number | null> = new Array(n).fill(null);
  const atr: Array<number | null> = new Array(n).fill(null);
  if (n > period) {
    let sumPlus = 0;
    let sumMinus = 0;
    let sumTr = 0;
    for (let j = 1; j <= period; j += 1) {
      sumPlus += vmPlus[j] ?? 0;
      sumMinus += vmMinus[j] ?? 0;
      sumTr += trueRange[j] ?? 0;
    }
    plusDmSmoothed[period] = posZero(sumPlus);
    minusDmSmoothed[period] = posZero(sumMinus);
    atr[period] = posZero(sumTr);
    for (let i = period + 1; i < n; i += 1) {
      const prevPlus = plusDmSmoothed[i - 1] ?? 0;
      const prevMinus = minusDmSmoothed[i - 1] ?? 0;
      const prevTr = atr[i - 1] ?? 0;
      plusDmSmoothed[i] = posZero(
        prevPlus - prevPlus / period + (vmPlus[i] ?? 0),
      );
      minusDmSmoothed[i] = posZero(
        prevMinus - prevMinus / period + (vmMinus[i] ?? 0),
      );
      atr[i] = posZero(prevTr - prevTr / period + (trueRange[i] ?? 0));
    }
  }

  const diPlus: Array<number | null> = new Array(n).fill(null);
  const diMinus: Array<number | null> = new Array(n).fill(null);
  const dx: Array<number | null> = new Array(n).fill(null);
  for (let i = period; i < n; i += 1) {
    const plus = plusDmSmoothed[i];
    const minus = minusDmSmoothed[i];
    const tr = atr[i];
    if (plus == null || minus == null || tr == null || tr === 0) continue;
    const dp = posZero((100 * plus) / tr);
    const dm = posZero((100 * minus) / tr);
    diPlus[i] = dp;
    diMinus[i] = dm;
    const denom = dp + dm;
    if (denom === 0) {
      dx[i] = 0;
    } else {
      dx[i] = posZero((100 * Math.abs(dp - dm)) / denom);
    }
  }

  const adx: Array<number | null> = new Array(n).fill(null);
  const adxInitIndex = 2 * period - 1;
  if (n > adxInitIndex) {
    let sumDx = 0;
    let valid = true;
    for (let j = period; j <= adxInitIndex; j += 1) {
      const v = dx[j];
      if (v == null) {
        valid = false;
        break;
      }
      sumDx += v;
    }
    if (valid) {
      adx[adxInitIndex] = posZero(sumDx / period);
      for (let i = adxInitIndex + 1; i < n; i += 1) {
        const prevAdx = adx[i - 1];
        const curDx = dx[i];
        if (prevAdx == null || curDx == null) continue;
        adx[i] = posZero((prevAdx * (period - 1) + curDx) / period);
      }
    }
  }

  return {
    vmPlus,
    vmMinus,
    trueRange,
    plusDmSmoothed,
    minusDmSmoothed,
    atr,
    diPlus,
    diMinus,
    dx,
    adx,
  };
}

export function classifyLineAdxTrendCrossRegime(
  adx: number | null,
  lower: number,
  upper: number,
): ChartLineAdxTrendCrossRegime {
  if (adx == null) return 'none';
  if (adx < lower) return 'weak';
  if (adx < upper) return 'forming';
  return 'strong';
}

export function classifyLineAdxTrendCrossBias(
  cur: number | null,
  prev: number | null,
): ChartLineAdxTrendCrossBias {
  if (cur == null || prev == null) return 'none';
  if (cur > prev) return 'up';
  if (cur < prev) return 'down';
  return 'flat';
}

export function detectLineAdxTrendCrossCrosses(
  series: readonly ChartLineAdxTrendCrossPoint[],
  adxValues: readonly (number | null)[],
  lower: number,
  upper: number,
): ChartLineAdxTrendCrossCross[] {
  const out: ChartLineAdxTrendCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const pa = adxValues[i - 1];
    const ca = adxValues[i];
    if (pa == null || ca == null) continue;
    const bias = classifyLineAdxTrendCrossBias(ca, pa);
    if (pa <= lower && ca > lower) {
      out.push({
        index: i,
        x: series[i]!.x,
        kind: 'bullish',
        threshold: 'lower',
        bias,
      });
    } else if (pa >= lower && ca < lower) {
      out.push({
        index: i,
        x: series[i]!.x,
        kind: 'bearish',
        threshold: 'lower',
        bias,
      });
    }
    if (pa <= upper && ca > upper) {
      out.push({
        index: i,
        x: series[i]!.x,
        kind: 'bullish',
        threshold: 'upper',
        bias,
      });
    } else if (pa >= upper && ca < upper) {
      out.push({
        index: i,
        x: series[i]!.x,
        kind: 'bearish',
        threshold: 'upper',
        bias,
      });
    }
  }
  return out;
}

export function runLineAdxTrendCross(
  data: ChartLineAdxTrendCrossPoint[],
  options: { period?: number; lower?: number; upper?: number } = {},
): ChartLineAdxTrendCrossRun {
  const cleaned = getLineAdxTrendCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const period = normalizeLineAdxTrendCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ADX_TREND_CROSS_PERIOD,
  );
  const lower = normalizeLineAdxTrendCrossThreshold(
    options.lower,
    DEFAULT_CHART_LINE_ADX_TREND_CROSS_LOWER,
  );
  const upper = normalizeLineAdxTrendCrossThreshold(
    options.upper,
    DEFAULT_CHART_LINE_ADX_TREND_CROSS_UPPER,
  );

  const channels = computeLineAdxTrendCross(series, { period });

  const samples: ChartLineAdxTrendCrossSample[] = series.map((p, i) => {
    const adx = channels.adx[i] ?? null;
    const prevAdx = i > 0 ? (channels.adx[i - 1] ?? null) : null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      adx,
      regime: classifyLineAdxTrendCrossRegime(adx, lower, upper),
      bias: classifyLineAdxTrendCrossBias(adx, prevAdx),
    };
  });

  const crosses = detectLineAdxTrendCrossCrosses(
    series,
    channels.adx,
    lower,
    upper,
  );

  let weakCount = 0;
  let formingCount = 0;
  let strongCount = 0;
  let noneCount = 0;
  let upBiasCount = 0;
  let downBiasCount = 0;
  let flatBiasCount = 0;
  for (const s of samples) {
    if (s.regime === 'weak') weakCount += 1;
    else if (s.regime === 'forming') formingCount += 1;
    else if (s.regime === 'strong') strongCount += 1;
    else noneCount += 1;
    if (s.bias === 'up') upBiasCount += 1;
    else if (s.bias === 'down') downBiasCount += 1;
    else if (s.bias === 'flat') flatBiasCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  let lowerCrossCount = 0;
  let upperCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
    if (c.threshold === 'lower') lowerCrossCount += 1;
    else upperCrossCount += 1;
  }

  const warmup = 2 * period - 1;
  const ok = series.length > warmup;

  return {
    series,
    period,
    lower,
    upper,
    vmPlus: channels.vmPlus,
    vmMinus: channels.vmMinus,
    trueRange: channels.trueRange,
    adxValues: channels.adx,
    diPlus: channels.diPlus,
    diMinus: channels.diMinus,
    samples,
    crosses,
    weakCount,
    formingCount,
    strongCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    lowerCrossCount,
    upperCrossCount,
    upBiasCount,
    downBiasCount,
    flatBiasCount,
    ok,
  };
}

export interface ComputeLineAdxTrendCrossLayoutOptions {
  data: ChartLineAdxTrendCrossPoint[];
  period?: number;
  lower?: number;
  upper?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineAdxTrendCrossLayout(
  opts: ComputeLineAdxTrendCrossLayoutOptions,
): ChartLineAdxTrendCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_ADX_TREND_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_ADX_TREND_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_ADX_TREND_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_ADX_TREND_CROSS_PANEL_GAP;

  const run = runLineAdxTrendCross(opts.data, {
    period: opts.period ?? undefined,
    lower: opts.lower ?? undefined,
    upper: opts.upper ?? undefined,
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
  for (let i = 0; i < run.adxValues.length; i += 1) {
    const v = run.adxValues[i];
    if (v != null) {
      if (v < oscRawMin) oscRawMin = v;
      if (v > oscRawMax) oscRawMax = v;
    }
  }
  if (!Number.isFinite(oscRawMin) || !Number.isFinite(oscRawMax)) {
    oscRawMin = 0;
    oscRawMax = 50;
  }
  oscRawMin = Math.min(oscRawMin, run.lower);
  oscRawMax = Math.max(oscRawMax, run.upper);
  if (oscRawMin === oscRawMax) {
    oscRawMin -= 1;
    oscRawMax += 1;
  }
  const oscMin = oscRawMin;
  const oscMax = oscRawMax;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const lowerY = syOscBase(run.lower);
  const upperY = syOscBase(run.upper);

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
      adxPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      lowerY,
      upperY,
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
  const priceDots: ChartLineAdxTrendCrossDot[] = [];
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

  let adxPath = '';
  let firstAdx = true;
  for (const s of run.samples) {
    if (s.adx == null) {
      firstAdx = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.adx);
    adxPath += `${firstAdx ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstAdx = false;
  }
  adxPath = adxPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const adxAtCross = run.adxValues[c.index];
    const cyOsc = adxAtCross != null ? syOscBase(adxAtCross) : oscBottom;
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
      threshold: c.threshold,
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
    adxPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    lowerY,
    upperY,
    crossMarkers,
    run,
  };
}

export function describeLineAdxTrendCrossChart(
  data: ChartLineAdxTrendCrossPoint[],
  options: { period?: number; lower?: number; upper?: number } = {},
): string {
  const cleaned = getLineAdxTrendCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const period = normalizeLineAdxTrendCrossLength(
    options.period,
    DEFAULT_CHART_LINE_ADX_TREND_CROSS_PERIOD,
  );
  const lower = normalizeLineAdxTrendCrossThreshold(
    options.lower,
    DEFAULT_CHART_LINE_ADX_TREND_CROSS_LOWER,
  );
  const upper = normalizeLineAdxTrendCrossThreshold(
    options.upper,
    DEFAULT_CHART_LINE_ADX_TREND_CROSS_UPPER,
  );
  return (
    `ADX trend-strength chart over ${cleaned.length} bars ` +
    `(period ${period}, lower ${lower}, upper ${upper}). Top ` +
    `panel renders the close with bullish (ADX crosses up ` +
    `through lower or upper, trend emerging confirmation up) ` +
    `/ bearish (ADX crosses down through upper or lower, trend ` +
    `weakening) chevron overlays at every ADX threshold ` +
    `trigger event; bottom panel renders the ADX line and ` +
    `the two fixed trend-strength thresholds (lower and ` +
    `upper) with markers coloured by ADX slope bias (rising ` +
    `/ falling / flat) at the trigger bar, flagging trend ` +
    `emerging confirmation events with bias coloring.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

function biasFillColor(
  kind: ChartLineAdxTrendCrossCrossKind,
  bias: ChartLineAdxTrendCrossBias,
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
const defaultOscFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineAdxTrendCross = forwardRef<
  HTMLDivElement,
  ChartLineAdxTrendCrossProps
>(function ChartLineAdxTrendCross(props, ref): ReactNode {
  const {
    data,
    period = DEFAULT_CHART_LINE_ADX_TREND_CROSS_PERIOD,
    lower = DEFAULT_CHART_LINE_ADX_TREND_CROSS_LOWER,
    upper = DEFAULT_CHART_LINE_ADX_TREND_CROSS_UPPER,
    width = DEFAULT_CHART_LINE_ADX_TREND_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_TREND_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_TREND_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADX_TREND_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_TREND_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADX_TREND_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_TREND_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_PRICE_COLOR,
    adxColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_ADX_COLOR,
    lowerThresholdColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_LOWER_THRESHOLD_COLOR,
    upperThresholdColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_UPPER_THRESHOLD_COLOR,
    upBiasColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_UP_BIAS_COLOR,
    downBiasColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_DOWN_BIAS_COLOR,
    flatBiasColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_FLAT_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_TREND_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAdx = true,
    showThresholds = true,
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
    () => getLineAdxTrendCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineAdxTrendCrossLayout({
        data: cleaned,
        period,
        lower,
        upper,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, period, lower, upper, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineAdxTrendCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineAdxTrendCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineAdxTrendCrossSeriesId,
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
        data-section="chart-line-adx-trend-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineAdxTrendCrossChart(cleaned, { period, lower, upper });

  const showPrice = !hidden.has('price');
  const showAdxLine = !hidden.has('adx') && showAdx;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, lower, upper, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'ADX trend-strength chart'}
      aria-describedby={descId}
      data-section="chart-line-adx-trend-cross"
      data-period={period}
      data-lower={lower}
      data-upper={upper}
      data-total-points={cleaned.length}
      data-weak-count={layout.run.weakCount}
      data-forming-count={layout.run.formingCount}
      data-strong-count={layout.run.strongCount}
      data-none-count={layout.run.noneCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-lower-cross-count={layout.run.lowerCrossCount}
      data-upper-cross-count={layout.run.upperCrossCount}
      data-up-bias-count={layout.run.upBiasCount}
      data-down-bias-count={layout.run.downBiasCount}
      data-flat-bias-count={layout.run.flatBiasCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-adx-trend-cross-title"
      >
        {ariaLabel ?? 'ADX trend-strength chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-adx-trend-cross-aria-desc"
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
        data-section="chart-line-adx-trend-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-adx-trend-cross-grid">
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
                  data-section="chart-line-adx-trend-cross-grid-line-price"
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
                  data-section="chart-line-adx-trend-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-adx-trend-cross-axes">
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
                  data-section="chart-line-adx-trend-cross-tick-price"
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
                  data-section="chart-line-adx-trend-cross-tick-osc"
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
            data-section="chart-line-adx-trend-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-adx-trend-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-adx-trend-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showThresholds ? (
          <g data-section="chart-line-adx-trend-cross-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.lowerY}
              x2={layout.innerRight}
              y2={layout.lowerY}
              stroke={lowerThresholdColor}
              strokeDasharray="4 3"
              data-section="chart-line-adx-trend-cross-threshold-lower"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.upperY}
              x2={layout.innerRight}
              y2={layout.upperY}
              stroke={upperThresholdColor}
              strokeDasharray="6 3"
              data-section="chart-line-adx-trend-cross-threshold-upper"
            />
          </g>
        ) : null}

        {showAdxLine ? (
          <path
            d={layout.adxPath}
            stroke={adxColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-adx-trend-cross-adx-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-adx-trend-cross-crosses"
            role="group"
            aria-label="ADX threshold trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}-${m.threshold}`}
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
                aria-label={`${m.kind} ADX ${m.threshold} threshold trigger at ${formatX(m.x)} bias ${m.bias}`}
                data-bias={m.bias}
                data-threshold={m.threshold}
                data-section={`chart-line-adx-trend-cross-cross-${m.kind}-${m.threshold}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-adx-trend-cross-overlay-crosses"
            role="group"
            aria-label="overlay ADX threshold trigger markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}-${m.threshold}`}
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
                aria-label={`${m.kind} overlay at ${formatX(m.x)} bias ${m.bias} threshold ${m.threshold}`}
                data-bias={m.bias}
                data-threshold={m.threshold}
                data-section={`chart-line-adx-trend-cross-overlay-${m.kind}-${m.threshold}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-adx-trend-cross-hover-targets">
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
                data-section="chart-line-adx-trend-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-adx-trend-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-trend-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-trend-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-trend-cross-tooltip-adx"
                >
                  ADX{' '}
                  {tooltipSample.adx == null
                    ? '--'
                    : formatOsc(tooltipSample.adx)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-trend-cross-tooltip-thresholds"
                >
                  lower {lower} | upper {upper}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-trend-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-trend-cross-tooltip-bias"
                >
                  bias {tooltipSample.bias}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-trend-cross-tooltip-counts"
                >
                  weak {layout.run.weakCount} | forming{' '}
                  {layout.run.formingCount} | strong {layout.run.strongCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-trend-cross-tooltip-crosses"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-adx-trend-cross-tooltip-biases"
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
          data-section="chart-line-adx-trend-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          period {period} | lower {lower} | upper {upper} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-adx-trend-cross-legend"
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
              { id: 'adx' as const, color: adxColor, label: 'ADX' },
            ] satisfies Array<{
              id: ChartLineAdxTrendCrossSeriesId;
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

ChartLineAdxTrendCross.displayName = 'ChartLineAdxTrendCross';
