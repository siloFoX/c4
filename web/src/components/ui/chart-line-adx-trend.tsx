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
 * ChartLineAdxTrend -- pure-SVG two-panel ADX trend-filter chart
 * (Wilder, SMA-smoothed variant).
 *
 * For each bar `i >= 1`:
 *
 *   upMove   = high[i] - high[i - 1]
 *   downMove = low[i - 1] - low[i]
 *   plusDM   = (upMove   > downMove && upMove   > 0) ? upMove   : 0
 *   minusDM  = (downMove > upMove   && downMove > 0) ? downMove : 0
 *   TR       = max(high - low, abs(high - prevClose),
 *                  abs(low - prevClose))
 *
 *   plusS, minusS, trS = SMA(plusDM, period), SMA(minusDM, period),
 *                        SMA(TR, period)
 *
 *   +DI = 100 * plusS  / trS
 *   -DI = 100 * minusS / trS
 *   DX  = 100 * abs(+DI - -DI) / (+DI + -DI)
 *   ADX = SMA(DX, period)
 *
 * A bar is null when `trS == 0` (no movement) or `+DI + -DI == 0`.
 *
 * Three bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (high == low == close == K)` -> `TR = 0` and
 *     all DMs are zero, so `+DI`, `-DI`, `DX`, and `ADX` are all
 *     null at every bar.
 *   * `RISING (high == low == close == i + 10)` with period 4 ->
 *     `plusDM = 1, minusDM = 0, TR = 1` at every bar after bar 0.
 *     `+DI = 100, -DI = 0, DX = 100` bit-exact, `ADX = 100`
 *     bit-exact once the second SMA is warm.
 *   * `FALLING (high == low == close == 19 - i)` -> mirror: `+DI
 *     = 0, -DI = 100, DX = 100, ADX = 100` bit-exact.
 *
 * The top panel plots the close; the bottom panel plots the
 * ADX in a fixed `[0, 100]` band with a dashed `threshold`
 * reference line and a dashed `2 * threshold` strong line.
 */

export interface ChartLineAdxTrendPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAdxTrendZone =
  | 'strong'
  | 'trend'
  | 'weak'
  | 'none';

export type ChartLineAdxTrendSeriesId = 'price' | 'adx' | 'plusDi' | 'minusDi';

export interface ChartLineAdxTrendSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  plusDi: number | null;
  minusDi: number | null;
  dx: number | null;
  adx: number | null;
  zone: ChartLineAdxTrendZone;
}

export interface ChartLineAdxTrendRun {
  series: ChartLineAdxTrendPoint[];
  period: number;
  threshold: number;
  plusDi: Array<number | null>;
  minusDi: Array<number | null>;
  dx: Array<number | null>;
  adx: Array<number | null>;
  samples: ChartLineAdxTrendSample[];
  adxFinal: number | null;
  strongCount: number;
  trendCount: number;
  weakCount: number;
  ok: boolean;
}

export interface ChartLineAdxTrendMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  adx: number;
  zone: ChartLineAdxTrendZone;
}

export interface ChartLineAdxTrendDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxTrendLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  adxPanelTop: number;
  adxPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAdxTrendDot[];
  adxPath: string;
  plusDiPath: string;
  minusDiPath: string;
  markers: ChartLineAdxTrendMarker[];
  thresholdY: number;
  strongY: number;
  zeroY: number;
  priceMin: number;
  priceMax: number;
  adxMin: number;
  adxMax: number;
  run: ChartLineAdxTrendRun;
}

export interface ChartLineAdxTrendProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxTrendPoint[];
  period?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  adxColor?: string;
  plusDiColor?: string;
  minusDiColor?: string;
  strongColor?: string;
  trendColor?: string;
  weakColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdx?: boolean;
  showPlusDi?: boolean;
  showMinusDi?: boolean;
  showThresholdLines?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxTrendSeriesId[];
  defaultHiddenSeries?: ChartLineAdxTrendSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxTrendSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAdxTrendSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ADX_TREND_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_TREND_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ADX_TREND_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_TREND_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_TREND_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_TREND_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_TREND_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_TREND_PERIOD = 14;
export const DEFAULT_CHART_LINE_ADX_TREND_THRESHOLD = 25;
export const DEFAULT_CHART_LINE_ADX_TREND_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ADX_TREND_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_TREND_ADX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ADX_TREND_PLUS_DI_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_TREND_MINUS_DI_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_TREND_STRONG_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_TREND_TREND_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ADX_TREND_WEAK_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ADX_TREND_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ADX_TREND_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ADX_TREND_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_TREND_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineAdxTrendFinitePoints(
  data: readonly ChartLineAdxTrendPoint[] | null | undefined,
): ChartLineAdxTrendPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxTrendPoint[] = [];
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

/** Coerce the lookback period to an integer of at least 2. */
export function normalizeLineAdxTrendPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the threshold to a positive finite in `(0, 100]`. */
export function normalizeLineAdxTrendThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** Simple moving average of a nullable series. */
export function computeLineAdxTrendSma(
  values: ReadonlyArray<number | null>,
  period: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0 || period < 1) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j += 1) {
      const v = values[j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / period : null);
  }
  return out;
}

/**
 * Run the full ADX pipeline. Returns `{ plusDi, minusDi, dx, adx
 * }` arrays the same length as `bars`.
 */
export function computeLineAdxTrend(
  bars: readonly ChartLineAdxTrendPoint[] | null | undefined,
  period: unknown,
): {
  plusDi: Array<number | null>;
  minusDi: Array<number | null>;
  dx: Array<number | null>;
  adx: Array<number | null>;
} {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { plusDi: [], minusDi: [], dx: [], adx: [] };
  }
  const p = normalizeLineAdxTrendPeriod(
    period,
    DEFAULT_CHART_LINE_ADX_TREND_PERIOD,
  );
  const plusDm: Array<number | null> = [null];
  const minusDm: Array<number | null> = [null];
  const tr: Array<number | null> = [null];
  for (let i = 1; i < bars.length; i += 1) {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (
      !cur ||
      !prev ||
      !isFiniteNumber(cur.high) ||
      !isFiniteNumber(cur.low) ||
      !isFiniteNumber(cur.close) ||
      !isFiniteNumber(prev.high) ||
      !isFiniteNumber(prev.low) ||
      !isFiniteNumber(prev.close)
    ) {
      plusDm.push(null);
      minusDm.push(null);
      tr.push(null);
      continue;
    }
    const up = cur.high - prev.high;
    const down = prev.low - cur.low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    const hl = cur.high - cur.low;
    const hc = Math.abs(cur.high - prev.close);
    const lc = Math.abs(cur.low - prev.close);
    let trV = hl;
    if (hc > trV) trV = hc;
    if (lc > trV) trV = lc;
    tr.push(trV);
  }
  const plusS = computeLineAdxTrendSma(plusDm, p);
  const minusS = computeLineAdxTrendSma(minusDm, p);
  const trS = computeLineAdxTrendSma(tr, p);
  const plusDi: Array<number | null> = [];
  const minusDi: Array<number | null> = [];
  const dx: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const pp = plusS[i];
    const mm = minusS[i];
    const tt = trS[i];
    if (
      !isFiniteNumber(pp) ||
      !isFiniteNumber(mm) ||
      !isFiniteNumber(tt) ||
      tt === 0
    ) {
      plusDi.push(null);
      minusDi.push(null);
      dx.push(null);
      continue;
    }
    const pd = (100 * pp) / tt;
    const md = (100 * mm) / tt;
    plusDi.push(pd);
    minusDi.push(md);
    const sumDi = pd + md;
    if (sumDi === 0) {
      dx.push(null);
      continue;
    }
    dx.push((100 * Math.abs(pd - md)) / sumDi);
  }
  const adx = computeLineAdxTrendSma(dx, p);
  return { plusDi, minusDi, dx, adx };
}

/** Classify an ADX reading against the threshold ladder. */
export function classifyLineAdxTrendZone(
  value: number | null,
  threshold: number,
): ChartLineAdxTrendZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold * 2) return 'strong';
  if (value >= threshold) return 'trend';
  return 'weak';
}

export interface ChartLineAdxTrendOptions {
  period?: number;
  threshold?: number;
}

/** Run the full ADX pipeline plus sample classification. */
export function runLineAdxTrend(
  data: readonly ChartLineAdxTrendPoint[] | null | undefined,
  options: ChartLineAdxTrendOptions = {},
): ChartLineAdxTrendRun {
  const series = getLineAdxTrendFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineAdxTrendPeriod(
    options.period,
    DEFAULT_CHART_LINE_ADX_TREND_PERIOD,
  );
  const threshold = normalizeLineAdxTrendThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_ADX_TREND_THRESHOLD,
  );
  const { plusDi, minusDi, dx, adx } = computeLineAdxTrend(series, period);
  const samples: ChartLineAdxTrendSample[] = series.map((point, index) => {
    const value = adx[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      plusDi: plusDi[index] ?? null,
      minusDi: minusDi[index] ?? null,
      dx: dx[index] ?? null,
      adx: value,
      zone: classifyLineAdxTrendZone(value, threshold),
    };
  });
  let strongCount = 0;
  let trendCount = 0;
  let weakCount = 0;
  let adxFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong') strongCount += 1;
    else if (sample.zone === 'trend') trendCount += 1;
    else if (sample.zone === 'weak') weakCount += 1;
    if (isFiniteNumber(sample.adx)) adxFinal = sample.adx;
  }
  return {
    series = [],
    period,
    threshold,
    plusDi,
    minusDi,
    dx,
    adx,
    samples,
    adxFinal,
    strongCount,
    trendCount,
    weakCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineAdxTrendLayoutOptions
  extends ChartLineAdxTrendOptions {
  data: readonly ChartLineAdxTrendPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
}

function buildLinePath(
  points: ReadonlyArray<{ x: number; y: number }>,
): string {
  if (points.length === 0) return '';
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (i < points.length - 1) d += ' ';
  }
  return d;
}

/** Project the run into a two-panel SVG layout. */
export function computeLineAdxTrendLayout(
  options: ChartLineAdxTrendLayoutOptions,
): ChartLineAdxTrendLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ADX_TREND_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ADX_TREND_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ADX_TREND_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_ADX_TREND_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_ADX_TREND_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineAdxTrend(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;
  const innerWidth = innerRight - innerLeft;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const adxPanelTop = pricePanelBottom + gap;
  const adxPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    adxPanelBottom - adxPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < priceMin) priceMin = sample.close;
    if (sample.close > priceMax) priceMax = sample.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }
  const priceYAt = (value: number): number =>
    pricePanelBottom -
    ((value - priceMin) / (priceMax - priceMin)) * pricePanelHeight;

  const adxMin = 0;
  const adxMax = 105;
  const adxPanelHeight = adxPanelBottom - adxPanelTop;
  const adxYAt = (value: number): number =>
    adxPanelBottom - ((value - adxMin) / (adxMax - adxMin)) * adxPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineAdxTrendDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const adxLinePoints: Array<{ x: number; y: number }> = [];
  const plusDiLinePoints: Array<{ x: number; y: number }> = [];
  const minusDiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAdxTrendMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (isFiniteNumber(sample.adx)) {
      const cy = adxYAt(sample.adx);
      adxLinePoints.push({ x: cx, y: cy });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy,
        adx: sample.adx,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.plusDi)) {
      plusDiLinePoints.push({ x: cx, y: adxYAt(sample.plusDi) });
    }
    if (isFiniteNumber(sample.minusDi)) {
      minusDiLinePoints.push({ x: cx, y: adxYAt(sample.minusDi) });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    adxPanelTop,
    adxPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    adxPath: buildLinePath(adxLinePoints),
    plusDiPath: buildLinePath(plusDiLinePoints),
    minusDiPath: buildLinePath(minusDiLinePoints),
    markers,
    thresholdY: adxYAt(run.threshold),
    strongY: adxYAt(Math.min(100, run.threshold * 2)),
    zeroY: adxYAt(0),
    priceMin,
    priceMax,
    adxMin,
    adxMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAdxTrendChart(
  data: readonly ChartLineAdxTrendPoint[] | null | undefined,
  options: ChartLineAdxTrendOptions = {},
): string {
  const run = runLineAdxTrend(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.adxFinal === null ? 'n/a' : run.adxFinal.toFixed(3);
  return (
    `Two-panel chart with a Wilder ADX trend-filter panel (period ` +
    `${run.period}, threshold ${run.threshold}): the top panel ` +
    `plots the close, the bottom panel plots the ADX as the SMA ` +
    `of DX = 100 * abs(+DI - -DI) / (+DI + -DI), where the ` +
    `directional indicators come from SMA-smoothed +DM, -DM, and ` +
    `TR. A pure trend (high == low == close monotonic) reads ` +
    `ADX = 100 bit-exact; a perfectly choppy series with +DI == ` +
    `-DI reads ADX = 0 bit-exact; a constant series leaves the ` +
    `bar null. Across ${total} bars the ADX reads strong ` +
    `(>= ${Math.min(100, run.threshold * 2)}) on ${run.strongCount}, ` +
    `trend (>= ${run.threshold}) on ${run.trendCount}, and weak ` +
    `on ${run.weakCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineAdxTrendZone,
  strongColor: string,
  trendColor: string,
  weakColor: string,
  noneColor: string,
): string {
  if (zone === 'strong') return strongColor;
  if (zone === 'trend') return trendColor;
  if (zone === 'weak') return weakColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineAdxTrendZone): string {
  if (zone === 'strong') return 'Strong';
  if (zone === 'trend') return 'Trend';
  if (zone === 'weak') return 'Weak';
  return 'n/a';
}

/**
 * ChartLineAdxTrend -- two-panel pure-SVG Wilder ADX trend
 * filter chart.
 */
export const ChartLineAdxTrend = forwardRef<
  HTMLDivElement,
  ChartLineAdxTrendProps
>(function ChartLineAdxTrend(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_ADX_TREND_PERIOD,
    threshold = DEFAULT_CHART_LINE_ADX_TREND_THRESHOLD,
    width = DEFAULT_CHART_LINE_ADX_TREND_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_TREND_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_TREND_PADDING,
    gap = DEFAULT_CHART_LINE_ADX_TREND_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_TREND_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ADX_TREND_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_ADX_TREND_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_TREND_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_TREND_PRICE_COLOR,
    adxColor = DEFAULT_CHART_LINE_ADX_TREND_ADX_COLOR,
    plusDiColor = DEFAULT_CHART_LINE_ADX_TREND_PLUS_DI_COLOR,
    minusDiColor = DEFAULT_CHART_LINE_ADX_TREND_MINUS_DI_COLOR,
    strongColor = DEFAULT_CHART_LINE_ADX_TREND_STRONG_COLOR,
    trendColor = DEFAULT_CHART_LINE_ADX_TREND_TREND_COLOR,
    weakColor = DEFAULT_CHART_LINE_ADX_TREND_WEAK_COLOR,
    noneColor = DEFAULT_CHART_LINE_ADX_TREND_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ADX_TREND_THRESHOLD_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_TREND_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_TREND_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAdx = true,
    showPlusDi = false,
    showMinusDi = false,
    showThresholdLines = true,
    showZeroLine = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatValue = defaultFormatValue,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-adx-trend-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAdxTrendSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAdxTrendSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAdxTrendLayout({
        data,
        period,
        threshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [data, period, threshold, width, height, padding, gap, pricePanelRatio],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineAdxTrendChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `ADX trend chart, period ${run.period}, threshold ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAdxTrendSeriesId): void => {
    const next = isHidden(id);
    if (hiddenSeries === undefined) {
      setInternalHidden((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
    }
    onSeriesToggle?.({ seriesId: id, hidden: !next });
  };

  const handleActivate = (sampleIndex: number): void => {
    const sample = run.samples[sampleIndex];
    if (sample) onPointClick?.({ point: sample });
  };

  const handleKey = (
    event: KeyboardEvent<SVGElement>,
    sampleIndex: number,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate(sampleIndex);
    }
  };

  const tickValues: number[] = [];
  if (tickCount > 1) {
    for (let i = 0; i < tickCount; i += 1) {
      tickValues.push(i / (tickCount - 1));
    }
  }

  const containerStyle: CSSProperties = {
    display: 'inline-block',
    fontFamily:
      'var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif)',
    ...style,
  };

  const hoverSample =
    hover !== null && run.samples[hover] ? run.samples[hover]! : null;

  let tooltip: ReactNode = null;
  if (showTooltip && hoverSample && !isEmpty) {
    const dot = layout.priceDots[hoverSample.index];
    const anchorX = dot ? dot.cx : (layout.innerLeft + layout.innerRight) / 2;
    const tooltipW = 220;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    const fmt = (v: number | null): string =>
      v === null ? 'n/a' : v.toFixed(2);
    tooltip = (
      <g data-section="chart-line-adx-trend-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={120}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-adx-trend-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-adx-trend-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-adx-trend-tooltip-plus-di"
          x={tx + 10}
          y={ty + 51}
          fill="#86efac"
          fontSize={11}
        >
          {`+DI: ${fmt(hoverSample.plusDi)}`}
        </text>
        <text
          data-section="chart-line-adx-trend-tooltip-minus-di"
          x={tx + 10}
          y={ty + 67}
          fill="#fca5a5"
          fontSize={11}
        >
          {`-DI: ${fmt(hoverSample.minusDi)}`}
        </text>
        <text
          data-section="chart-line-adx-trend-tooltip-adx"
          x={tx + 10}
          y={ty + 83}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`ADX: ${fmt(hoverSample.adx)}`}
        </text>
        <text
          data-section="chart-line-adx-trend-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const adxHidden = isHidden('adx') || !showAdx;
  const plusDiHidden = isHidden('plusDi') || !showPlusDi;
  const minusDiHidden = isHidden('minusDi') || !showMinusDi;

  const legendItems: Array<{
    id: ChartLineAdxTrendSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'adx', label: 'ADX', color: adxColor },
    { id: 'plusDi', label: '+DI', color: plusDiColor },
    { id: 'minusDi', label: '-DI', color: minusDiColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-adx-trend"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-adx-final={run.adxFinal === null ? '' : run.adxFinal}
      data-strong-count={run.strongCount}
      data-trend-count={run.trendCount}
      data-weak-count={run.weakCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-adx-trend-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {description}
      </span>

      {isEmpty ? (
        <svg
          data-section="chart-line-adx-trend-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-adx-trend-empty"
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill={axisColor}
            fontSize={13}
          >
            No data
          </text>
        </svg>
      ) : (
        <svg
          data-section="chart-line-adx-trend-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-adx-trend-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-adx-trend-grid-line"
                    data-panel="price"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
              {tickValues.map((t, i) => {
                const py =
                  layout.adxPanelBottom -
                  t * (layout.adxPanelBottom - layout.adxPanelTop);
                return (
                  <line
                    key={`ag-${i}`}
                    data-section="chart-line-adx-trend-grid-line"
                    data-panel="adx"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-adx-trend-axes">
              <line
                data-section="chart-line-adx-trend-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adx-trend-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adx-trend-axis"
                data-panel="adx"
                x1={layout.innerLeft}
                y1={layout.adxPanelTop}
                x2={layout.innerLeft}
                y2={layout.adxPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adx-trend-axis"
                data-panel="adx"
                x1={layout.innerLeft}
                y1={layout.adxPanelBottom}
                x2={layout.innerRight}
                y2={layout.adxPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-adx-trend-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Close
          </text>
          <text
            data-section="chart-line-adx-trend-panel-label"
            data-panel="adx"
            x={layout.innerRight}
            y={layout.adxPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            ADX
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-adx-trend-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={axisColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-adx-trend-threshold-lines">
              <line
                data-section="chart-line-adx-trend-threshold-line"
                data-direction="trend"
                x1={layout.innerLeft}
                y1={layout.thresholdY}
                x2={layout.innerRight}
                y2={layout.thresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-adx-trend-threshold-line"
                data-direction="strong"
                x1={layout.innerLeft}
                y1={layout.strongY}
                x2={layout.innerRight}
                y2={layout.strongY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-adx-trend-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Close line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-adx-trend-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-adx-trend-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatValue(
                    dot.close,
                  )}`}
                  onMouseEnter={() => setHover(dot.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(dot.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(dot.index)}
                  onKeyDown={(e) => handleKey(e, dot.index)}
                />
              ))}
            </g>
          ) : null}

          {!plusDiHidden ? (
            <path
              data-section="chart-line-adx-trend-plus-di-line"
              d={layout.plusDiPath}
              fill="none"
              stroke={plusDiColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 2"
            />
          ) : null}

          {!minusDiHidden ? (
            <path
              data-section="chart-line-adx-trend-minus-di-line"
              d={layout.minusDiPath}
              fill="none"
              stroke={minusDiColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 2"
            />
          ) : null}

          {!adxHidden ? (
            <path
              data-section="chart-line-adx-trend-line"
              d={layout.adxPath}
              fill="none"
              stroke={adxColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`ADX line, ${layout.markers.length} points`}
            />
          ) : null}

          {!adxHidden && showMarkers ? (
            <g data-section="chart-line-adx-trend-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-adx-trend-marker"
                  data-zone={marker.zone}
                  data-adx={marker.adx}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongColor,
                    trendColor,
                    weakColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, ADX ${formatValue(
                    marker.adx,
                  )}, ${zoneLabelOf(marker.zone)}`}
                  onMouseEnter={() => setHover(marker.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(marker.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(marker.index)}
                  onKeyDown={(e) => handleKey(e, marker.index)}
                />
              ))}
            </g>
          ) : null}

          {showConfigBadge ? (
            <g data-section="chart-line-adx-trend-badge">
              <rect
                data-section="chart-line-adx-trend-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={120}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-adx-trend-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ADX ${run.period} thr ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-adx-trend-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 12,
          }}
        >
          {legendItems.map((item) => {
            const hidden = isHidden(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-adx-trend-legend-item"
                data-series-id={item.id}
                data-hidden={hidden ? 'true' : 'false'}
                onClick={() => toggleSeries(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  opacity: hidden ? 0.4 : 1,
                  color: 'inherit',
                  font: 'inherit',
                }}
                aria-pressed={!hidden}
              >
                <span
                  data-section="chart-line-adx-trend-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-adx-trend-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-adx-trend-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong ${run.strongCount} / trend ${run.trendCount} / weak ${run.weakCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAdxTrend.displayName = 'ChartLineAdxTrend';
