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
 * ChartLineStochSlow -- pure-SVG dual-panel chart with the close on
 * top and a Slow Stochastic Oscillator on the bottom. The "slow"
 * variant plots the SMA-smoothed `%K`:
 *
 *   highestHigh[i] = max(high[i - length + 1 .. i])
 *   lowestLow[i]   = min(low[i - length + 1 .. i])
 *   fastK[i]       = (close[i] - lowestLow[i])
 *                      / (highestHigh[i] - lowestLow[i]) * 100
 *                    or null if the window is flat
 *   slowK[i]       = SMA(fastK, smoothLength)[i]
 *
 * `slowK[i]` is `null` during warmup (`i < length - 1 + smoothLength
 * - 1`) and propagates `null` if any `fastK` in the window is `null`.
 * The output is bounded in `[0, 100]`.
 *
 * Bit-exact anchor: **CONST high=low=close=K**: `fastK = null` (flat
 * window) -> `slowK = null` everywhere. Verified across `K` and
 * parameter combinations.
 *
 * Additional bit-exact anchors (carried from chart-line-stoch-fast):
 * - **LINEAR UP** (`close[i] = i + 1`, `high = low = close`): every
 *   defined `fastK = 100`, so SMA of `100` is `100` -> `slowK = 100`
 *   (bit-exact).
 * - **LINEAR DOWN** (`close[i] = N - i`): every defined `fastK = 0`,
 *   so `slowK = 0` (bit-exact).
 */

export interface ChartLineStochSlowPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineStochSlowZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineStochSlowCross = 'up' | 'down' | null;

export type ChartLineStochSlowSeriesId = 'price' | 'stoch';

export interface ChartLineStochSlowSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  highestHigh: number | null;
  lowestLow: number | null;
  fastK: number | null;
  slowK: number | null;
  zone: ChartLineStochSlowZone;
  crossed: ChartLineStochSlowCross;
}

export interface ChartLineStochSlowRun {
  series: ChartLineStochSlowPoint[];
  length: number;
  smoothLength: number;
  overbought: number;
  oversold: number;
  highestHighValues: Array<number | null>;
  lowestLowValues: Array<number | null>;
  fastKValues: Array<number | null>;
  slowKValues: Array<number | null>;
  samples: ChartLineStochSlowSample[];
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineStochSlowMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  slowK: number;
  crossed: 'up' | 'down';
}

export interface ChartLineStochSlowDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochSlowLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  stochTop: number;
  stochBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineStochSlowDot[];
  stochPath: string;
  overboughtY: number;
  oversoldY: number;
  midlineY: number;
  markers: ChartLineStochSlowMarker[];
  priceMin: number;
  priceMax: number;
  stochMin: number;
  stochMax: number;
  run: ChartLineStochSlowRun;
}

export interface ChartLineStochSlowProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochSlowPoint[];
  length?: number;
  smoothLength?: number;
  overbought?: number;
  oversold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  stochColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  midlineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStoch?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochSlowSeriesId[];
  defaultHiddenSeries?: ChartLineStochSlowSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochSlowSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineStochSlowSample }) => void;
  formatPrice?: (value: number) => string;
  formatStoch?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STOCH_SLOW_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_SLOW_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_SLOW_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_SLOW_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_SLOW_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_SLOW_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_SLOW_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_SLOW_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_SLOW_SMOOTH_LENGTH = 3;
export const DEFAULT_CHART_LINE_STOCH_SLOW_OVERBOUGHT = 80;
export const DEFAULT_CHART_LINE_STOCH_SLOW_OVERSOLD = 20;
export const DEFAULT_CHART_LINE_STOCH_SLOW_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_SLOW_STOCH_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STOCH_SLOW_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_SLOW_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_SLOW_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_STOCH_SLOW_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_STOCH_SLOW_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_SLOW_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC fields. */
export function getLineStochSlowFinitePoints(
  data: readonly ChartLineStochSlowPoint[] | null | undefined,
): ChartLineStochSlowPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochSlowPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
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

/** Coerce a positive integer length (>= 2). */
export function normalizeLineStochSlowLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer smooth length (>= 1). */
export function normalizeLineStochSlowSmoothLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a threshold value in `[0, 100]`. */
export function normalizeLineStochSlowThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** Rolling max over a window of length bars. */
export function applyLineStochSlowRollingMax(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let hi = -Infinity;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v > hi) hi = v;
    }
    out.push(ok && Number.isFinite(hi) ? hi : null);
  }
  return out;
}

/** Rolling min over a window of length bars. */
export function applyLineStochSlowRollingMin(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let lo = Infinity;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v < lo) lo = v;
    }
    out.push(ok && Number.isFinite(lo) ? lo : null);
  }
  return out;
}

/** Rolling SMA (nulls in window short-circuit to null). */
export function applyLineStochSlowSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / length : null);
  }
  return out;
}

export interface ChartLineStochSlowOptions {
  length?: number;
  smoothLength?: number;
  overbought?: number;
  oversold?: number;
}

export interface ChartLineStochSlowChannels {
  highestHigh: Array<number | null>;
  lowestLow: Array<number | null>;
  fastK: Array<number | null>;
  slowK: Array<number | null>;
}

/** Compute the Slow Stochastic pipeline. */
export function computeLineStochSlow(
  series: readonly ChartLineStochSlowPoint[] | null | undefined,
  options: ChartLineStochSlowOptions = {},
): ChartLineStochSlowChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return { highestHigh: [], lowestLow: [], fastK: [], slowK: [] };
  }
  const length = normalizeLineStochSlowLength(
    options.length,
    DEFAULT_CHART_LINE_STOCH_SLOW_LENGTH,
  );
  const smoothLength = normalizeLineStochSlowSmoothLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_STOCH_SLOW_SMOOTH_LENGTH,
  );
  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const highestHigh = applyLineStochSlowRollingMax(highs, length);
  const lowestLow = applyLineStochSlowRollingMin(lows, length);
  const fastK: Array<number | null> = [];
  for (let i = 0; i < series.length; i += 1) {
    const hh = highestHigh[i];
    const ll = lowestLow[i];
    const c = series[i]!.close;
    if (
      hh == null ||
      ll == null ||
      !isFiniteNumber(hh) ||
      !isFiniteNumber(ll) ||
      !isFiniteNumber(c) ||
      hh <= ll
    ) {
      fastK.push(null);
      continue;
    }
    const raw = ((c - ll) / (hh - ll)) * 100;
    fastK.push(raw === 0 ? 0 : raw);
  }
  const slowK = applyLineStochSlowSma(fastK, smoothLength);
  return { highestHigh, lowestLow, fastK, slowK };
}

/** Classify a slowK reading. */
export function classifyLineStochSlowZone(
  value: number | null,
  overbought: number,
  oversold: number,
): ChartLineStochSlowZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= overbought) return 'overbought';
  if (value <= oversold) return 'oversold';
  return 'neutral';
}

/**
 * Detect overbought/oversold crosses. A bar transitions `'up'` when
 * the previous defined value was `< overbought` and the current is
 * `>= overbought`; mirror for `'down'` at the `oversold` threshold.
 */
export function detectLineStochSlowCrosses(
  values: readonly (number | null)[],
  overbought: number,
  oversold: number,
): Array<ChartLineStochSlowCross> {
  const out: Array<ChartLineStochSlowCross> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev < overbought && v >= overbought) {
      out.push('up');
    } else if (prev > oversold && v <= oversold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineStochSlow(
  data: readonly ChartLineStochSlowPoint[] | null | undefined,
  options: ChartLineStochSlowOptions = {},
): ChartLineStochSlowRun {
  const series = getLineStochSlowFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineStochSlowLength(
    options.length,
    DEFAULT_CHART_LINE_STOCH_SLOW_LENGTH,
  );
  const smoothLength = normalizeLineStochSlowSmoothLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_STOCH_SLOW_SMOOTH_LENGTH,
  );
  const overbought = normalizeLineStochSlowThreshold(
    options.overbought,
    DEFAULT_CHART_LINE_STOCH_SLOW_OVERBOUGHT,
  );
  const oversold = normalizeLineStochSlowThreshold(
    options.oversold,
    DEFAULT_CHART_LINE_STOCH_SLOW_OVERSOLD,
  );
  const channels = computeLineStochSlow(series, { length, smoothLength });
  const crosses = detectLineStochSlowCrosses(
    channels.slowK,
    overbought,
    oversold,
  );
  const samples: ChartLineStochSlowSample[] = series.map((point, index) => {
    const value = channels.slowK[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      highestHigh: channels.highestHigh[index] ?? null,
      lowestLow: channels.lowestLow[index] ?? null,
      fastK: channels.fastK[index] ?? null,
      slowK: value,
      zone: classifyLineStochSlowZone(value, overbought, oversold),
      crossed: crosses[index] ?? null,
    };
  });
  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series = [],
    length,
    smoothLength,
    overbought,
    oversold,
    highestHighValues: channels.highestHigh,
    lowestLowValues: channels.lowestLow,
    fastKValues: channels.fastK,
    slowKValues: channels.slowK,
    samples,
    overboughtCount,
    oversoldCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length + smoothLength - 1,
  };
}

export interface ChartLineStochSlowLayoutOptions
  extends ChartLineStochSlowOptions {
  data: readonly ChartLineStochSlowPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
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

/** Project the run into a dual-panel SVG layout. */
export function computeLineStochSlowLayout(
  options: ChartLineStochSlowLayoutOptions,
): ChartLineStochSlowLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_STOCH_SLOW_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_STOCH_SLOW_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_STOCH_SLOW_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_STOCH_SLOW_PANEL_GAP;

  const run = runLineStochSlow(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.smoothLength !== undefined
      ? { smoothLength: options.smoothLength }
      : {}),
    ...(options.overbought !== undefined
      ? { overbought: options.overbought }
      : {}),
    ...(options.oversold !== undefined
      ? { oversold: options.oversold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const stochHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const stochTop = priceBottom + panelGap;
  const stochBottom = stochTop + stochHeight;

  const okGeom = innerWidth > 0 && innerHeight > panelGap;
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
  const priceY = (value: number): number =>
    priceBottom - ((value - priceMin) / (priceMax - priceMin)) * priceHeight;

  // Stoch axis fixed [0, 100].
  const stochMin = 0;
  const stochMax = 100;
  const stochY = (value: number): number =>
    stochBottom - ((value - stochMin) / (stochMax - stochMin)) * stochHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineStochSlowDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const stochLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineStochSlowMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.slowK)) return;
    const cx = xAt(index);
    const yc = stochY(sample.slowK);
    stochLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        slowK: sample.slowK,
        crossed: sample.crossed,
      });
    }
  });

  const overboughtY = stochY(run.overbought);
  const oversoldY = stochY(run.oversold);
  const midlineY = stochY(50);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    stochTop,
    stochBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    stochPath: buildLinePath(stochLinePoints),
    overboughtY,
    oversoldY,
    midlineY,
    markers,
    priceMin,
    priceMax,
    stochMin,
    stochMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineStochSlowChart(
  data: readonly ChartLineStochSlowPoint[] | null | undefined,
  options: ChartLineStochSlowOptions = {},
): string {
  const run = runLineStochSlow(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Slow Stochastic Oscillator on the lower ` +
    `panel (length ${run.length}, smoothLength ${run.smoothLength}, ` +
    `overbought ${run.overbought}, oversold ${run.oversold}). The %K ` +
    `is SMA-smoothed over smoothLength bars. Across ${total} bars the ` +
    `slowK was overbought on ${run.overboughtCount}, oversold on ` +
    `${run.oversoldCount}, neutral on ${run.neutralCount}, and ` +
    `undefined on ${run.noneCount}, with ${run.bullishCrossCount} ` +
    `overbought entries and ${run.bearishCrossCount} oversold entries.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatStoch(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function markerColorOf(
  crossed: 'up' | 'down',
  bullishColor: string,
  bearishColor: string,
): string {
  if (crossed === 'up') return bullishColor;
  return bearishColor;
}

function zoneLabelOf(zone: ChartLineStochSlowZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineStochSlowCross): string {
  if (crossed === 'up') return 'Entered overbought';
  if (crossed === 'down') return 'Entered oversold';
  return '-';
}

/** ChartLineStochSlow -- dual-panel pure-SVG chart. */
export const ChartLineStochSlow = forwardRef<
  HTMLDivElement,
  ChartLineStochSlowProps
>(function ChartLineStochSlow(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_STOCH_SLOW_LENGTH,
    smoothLength = DEFAULT_CHART_LINE_STOCH_SLOW_SMOOTH_LENGTH,
    overbought = DEFAULT_CHART_LINE_STOCH_SLOW_OVERBOUGHT,
    oversold = DEFAULT_CHART_LINE_STOCH_SLOW_OVERSOLD,
    width = DEFAULT_CHART_LINE_STOCH_SLOW_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_SLOW_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_SLOW_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_SLOW_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_SLOW_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_SLOW_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_SLOW_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_SLOW_PRICE_COLOR,
    stochColor = DEFAULT_CHART_LINE_STOCH_SLOW_STOCH_COLOR,
    bullishColor = DEFAULT_CHART_LINE_STOCH_SLOW_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_STOCH_SLOW_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_STOCH_SLOW_THRESHOLD_COLOR,
    midlineColor = DEFAULT_CHART_LINE_STOCH_SLOW_MIDLINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_SLOW_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_SLOW_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStoch = true,
    showMarkers = true,
    showThresholds = true,
    showMidline = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatStoch = defaultFormatStoch,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-stoch-slow-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineStochSlowSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineStochSlowSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineStochSlowLayout({
        data,
        length,
        smoothLength,
        overbought,
        oversold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      length,
      smoothLength,
      overbought,
      oversold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineStochSlowChart(data, {
      length,
      smoothLength,
      overbought,
      oversold,
    });
  const resolvedLabel =
    ariaLabel ?? `Slow Stochastic chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineStochSlowSeriesId): void => {
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
    const tooltipW = 260;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-stoch-slow-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={166}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-stoch-slow-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-stoch-slow-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-stoch-slow-tooltip-hh"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Highest High: ${
            hoverSample.highestHigh === null
              ? 'n/a'
              : formatPrice(hoverSample.highestHigh)
          }`}
        </text>
        <text
          data-section="chart-line-stoch-slow-tooltip-ll"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Lowest Low: ${
            hoverSample.lowestLow === null
              ? 'n/a'
              : formatPrice(hoverSample.lowestLow)
          }`}
        </text>
        <text
          data-section="chart-line-stoch-slow-tooltip-fast"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Fast %K: ${
            hoverSample.fastK === null
              ? 'n/a'
              : formatStoch(hoverSample.fastK)
          }`}
        </text>
        <text
          data-section="chart-line-stoch-slow-tooltip-slow"
          x={tx + 10}
          y={ty + 103}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Slow %K: ${
            hoverSample.slowK === null
              ? 'n/a'
              : formatStoch(hoverSample.slowK)
          }`}
        </text>
        <text
          data-section="chart-line-stoch-slow-tooltip-zone"
          x={tx + 10}
          y={ty + 121}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-stoch-slow-tooltip-cross"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
        <text
          data-section="chart-line-stoch-slow-tooltip-smooth"
          x={tx + 10}
          y={ty + 153}
          fill="#94a3b8"
          fontSize={10}
        >
          {`Smooth: ${run.smoothLength}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const stochHidden = isHidden('stoch') || !showStoch;

  const legendItems: Array<{
    id: ChartLineStochSlowSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'stoch', label: 'Slow %K', color: stochColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-stoch-slow"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-smooth-length={run.smoothLength}
      data-overbought={run.overbought}
      data-oversold={run.oversold}
      data-overbought-count={run.overboughtCount}
      data-oversold-count={run.oversoldCount}
      data-neutral-count={run.neutralCount}
      data-none-count={run.noneCount}
      data-bullish-cross-count={run.bullishCrossCount}
      data-bearish-cross-count={run.bearishCrossCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-stoch-slow-aria-desc"
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
          data-section="chart-line-stoch-slow-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-stoch-slow-empty"
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
          data-section="chart-line-stoch-slow-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-stoch-slow-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.stochBottom -
                  t * (layout.stochBottom - layout.stochTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-stoch-slow-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-stoch-slow-grid-line"
                      data-panel="stoch"
                      x1={layout.innerLeft}
                      y1={yk}
                      x2={layout.innerRight}
                      y2={yk}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-stoch-slow-axes">
              <line
                data-section="chart-line-stoch-slow-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-slow-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-slow-axis"
                data-panel="stoch"
                x1={layout.innerLeft}
                y1={layout.stochTop}
                x2={layout.innerLeft}
                y2={layout.stochBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-slow-axis"
                data-panel="stoch"
                x1={layout.innerLeft}
                y1={layout.stochBottom}
                x2={layout.innerRight}
                y2={layout.stochBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-stoch-slow-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-stoch-slow-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-stoch-slow-tick-label"
                data-panel="stoch"
                x={layout.innerLeft - 6}
                y={layout.stochTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`100`}
              </text>
              <text
                data-section="chart-line-stoch-slow-tick-label"
                data-panel="stoch"
                x={layout.innerLeft - 6}
                y={layout.stochBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`0`}
              </text>
            </g>
          ) : null}

          {showThresholds ? (
            <g data-section="chart-line-stoch-slow-thresholds">
              <line
                data-section="chart-line-stoch-slow-overbought-line"
                x1={layout.innerLeft}
                y1={layout.overboughtY}
                x2={layout.innerRight}
                y2={layout.overboughtY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-stoch-slow-oversold-line"
                x1={layout.innerLeft}
                y1={layout.oversoldY}
                x2={layout.innerRight}
                y2={layout.oversoldY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {showMidline ? (
            <line
              data-section="chart-line-stoch-slow-midline"
              x1={layout.innerLeft}
              y1={layout.midlineY}
              x2={layout.innerRight}
              y2={layout.midlineY}
              stroke={midlineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-stoch-slow-price-path"
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
            <g data-section="chart-line-stoch-slow-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-stoch-slow-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatPrice(
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

          {!stochHidden ? (
            <path
              data-section="chart-line-stoch-slow-line"
              d={layout.stochPath}
              fill="none"
              stroke={stochColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Slow %K line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-stoch-slow-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-stoch-slow-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-slow-k={marker.slowK}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={markerColorOf(
                    marker.crossed,
                    bullishColor,
                    bearishColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Slow %K ${formatStoch(marker.slowK)}, ${crossLabelOf(
                    marker.crossed,
                  )}`}
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
            <g data-section="chart-line-stoch-slow-badge">
              <rect
                data-section="chart-line-stoch-slow-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={240}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-stoch-slow-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Slow %K ${run.length}/${run.smoothLength} OB ${run.overbought} OS ${run.oversold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-stoch-slow-legend"
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
                data-section="chart-line-stoch-slow-legend-item"
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
                  data-section="chart-line-stoch-slow-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-stoch-slow-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-stoch-slow-legend-stats"
            style={{ color: axisColor }}
          >
            {`OB ${run.overboughtCount} / OS ${run.oversoldCount} / neutral ${run.neutralCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineStochSlow.displayName = 'ChartLineStochSlow';
