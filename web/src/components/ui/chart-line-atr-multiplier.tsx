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
 * ChartLineAtrMultiplier -- pure-SVG dual-panel chart with the close
 * on top and a normalized volatility-ratio oscillator on the bottom.
 * Each bar divides the rolling close-to-close range by the ATR over
 * the lookback, giving a unitless measure of how much of the typical
 * bar-by-bar movement is being absorbed into directional travel:
 *
 *   closeRange[i] = max(close[i - length + 1 .. i])
 *                   - min(close[i - length + 1 .. i])
 *   tr[i]         = max(high - low, |high - prevClose|,
 *                       |low - prevClose|)
 *   atr[i]        = SMA(tr, atrLength)[i]
 *   ratio[i]      = atr[i] > 0 ? closeRange[i] / atr[i] : null
 *
 * High ratios (>= highThreshold) indicate a trending regime where
 * each bar contributes to directional travel. Low ratios (< lowThreshold)
 * indicate a choppy regime where bar-by-bar movement cancels.
 *
 * Bit-exact anchor: **CONST high=low=close=K**: `closeRange = 0`,
 * `tr = 0`, `atr = 0` -> divide-by-zero guard -> `ratio = null`
 * everywhere. Verified across `K in {0, 1, 5, 100, -3}` and `length
 * in {3, 4, 7, 10}`.
 *
 * Additional bit-exact anchor: **LINEAR close=k+1** with
 * `high = low = close`. Each bar's `tr = |close[i] - close[i - 1]| =
 * 1` (with `tr[0] = high - low = 0`). After ATR warmup (i.e. once
 * `tr[0]` falls out of the window), `atr = 1` exactly. The rolling
 * `closeRange` over a unit-step sequence of `length` bars is exactly
 * `length - 1`. So `ratio = (length - 1) / 1 = length - 1`
 * (integer-exact). Verified across `length in {4, 5, 7, 10}`.
 */

export interface ChartLineAtrMultiplierPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAtrMultiplierZone =
  | 'high'
  | 'normal'
  | 'low'
  | 'flat'
  | 'none';

export type ChartLineAtrMultiplierCross = 'up' | 'down' | null;

export type ChartLineAtrMultiplierSeriesId = 'price' | 'ratio';

export interface ChartLineAtrMultiplierSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  closeRange: number | null;
  atr: number | null;
  ratio: number | null;
  zone: ChartLineAtrMultiplierZone;
  crossed: ChartLineAtrMultiplierCross;
}

export interface ChartLineAtrMultiplierRun {
  series: ChartLineAtrMultiplierPoint[];
  length: number;
  atrLength: number;
  highThreshold: number;
  lowThreshold: number;
  closeRangeValues: Array<number | null>;
  atrValues: Array<number | null>;
  ratioValues: Array<number | null>;
  samples: ChartLineAtrMultiplierSample[];
  highCount: number;
  normalCount: number;
  lowCount: number;
  flatCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineAtrMultiplierMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  ratio: number;
  crossed: 'up' | 'down';
}

export interface ChartLineAtrMultiplierDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAtrMultiplierLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  ratioTop: number;
  ratioBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAtrMultiplierDot[];
  ratioPath: string;
  highThresholdY: number;
  lowThresholdY: number;
  markers: ChartLineAtrMultiplierMarker[];
  priceMin: number;
  priceMax: number;
  ratioMin: number;
  ratioMax: number;
  run: ChartLineAtrMultiplierRun;
}

export interface ChartLineAtrMultiplierProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAtrMultiplierPoint[];
  length?: number;
  atrLength?: number;
  highThreshold?: number;
  lowThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  ratioColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRatio?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAtrMultiplierSeriesId[];
  defaultHiddenSeries?: ChartLineAtrMultiplierSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAtrMultiplierSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAtrMultiplierSample }) => void;
  formatPrice?: (value: number) => string;
  formatRatio?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_WIDTH = 720;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_PADDING = 44;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_LENGTH = 14;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_ATR_LENGTH = 14;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_HIGH_THRESHOLD = 1.5;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_LOW_THRESHOLD = 0.5;
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_RATIO_COLOR = '#0e7490';
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_MULTIPLIER_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC fields. */
export function getLineAtrMultiplierFinitePoints(
  data: readonly ChartLineAtrMultiplierPoint[] | null | undefined,
): ChartLineAtrMultiplierPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAtrMultiplierPoint[] = [];
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
export function normalizeLineAtrMultiplierLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer ATR length (>= 1). */
export function normalizeLineAtrMultiplierAtrLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite threshold. */
export function normalizeLineAtrMultiplierThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

/** Rolling max(close) - min(close) over a window of length bars. */
export function applyLineAtrMultiplierCloseRange(
  closes: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let lo = Infinity;
    let hi = -Infinity;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = closes[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!ok || !Number.isFinite(lo) || !Number.isFinite(hi)) {
      out.push(null);
      continue;
    }
    const raw = hi - lo;
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

/** Per-bar True Range; first bar uses h - l (no prev close). */
export function applyLineAtrMultiplierTrueRange(
  series: readonly ChartLineAtrMultiplierPoint[],
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < series.length; i += 1) {
    const point = series[i]!;
    if (
      !isFiniteNumber(point.high) ||
      !isFiniteNumber(point.low) ||
      !isFiniteNumber(point.close)
    ) {
      out.push(null);
      continue;
    }
    if (i === 0) {
      out.push(point.high - point.low);
      continue;
    }
    const prev = series[i - 1]!;
    if (!isFiniteNumber(prev.close)) {
      out.push(point.high - point.low);
      continue;
    }
    const r1 = point.high - point.low;
    const r2 = Math.abs(point.high - prev.close);
    const r3 = Math.abs(point.low - prev.close);
    out.push(Math.max(r1, r2, r3));
  }
  return out;
}

/** Rolling SMA of TR. */
export function applyLineAtrMultiplierAtr(
  trValues: readonly (number | null)[],
  atrLength: number,
): Array<number | null> {
  if (!Array.isArray(trValues) || trValues.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < trValues.length; i += 1) {
    if (i < atrLength - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < atrLength; j += 1) {
      const v = trValues[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / atrLength : null);
  }
  return out;
}

export interface ChartLineAtrMultiplierOptions {
  length?: number;
  atrLength?: number;
  highThreshold?: number;
  lowThreshold?: number;
}

export interface ChartLineAtrMultiplierChannels {
  closeRange: Array<number | null>;
  atr: Array<number | null>;
  ratio: Array<number | null>;
}

/** Compute the ATR multiplier pipeline. */
export function computeLineAtrMultiplier(
  series: readonly ChartLineAtrMultiplierPoint[] | null | undefined,
  options: ChartLineAtrMultiplierOptions = {},
): ChartLineAtrMultiplierChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return { closeRange: [], atr: [], ratio: [] };
  }
  const length = normalizeLineAtrMultiplierLength(
    options.length,
    DEFAULT_CHART_LINE_ATR_MULTIPLIER_LENGTH,
  );
  const atrLength = normalizeLineAtrMultiplierAtrLength(
    options.atrLength,
    DEFAULT_CHART_LINE_ATR_MULTIPLIER_ATR_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const closeRange = applyLineAtrMultiplierCloseRange(closes, length);
  const tr = applyLineAtrMultiplierTrueRange(series);
  const atr = applyLineAtrMultiplierAtr(tr, atrLength);
  const ratio: Array<number | null> = [];
  for (let i = 0; i < series.length; i += 1) {
    const cr = closeRange[i];
    const a = atr[i];
    if (
      cr == null ||
      a == null ||
      !isFiniteNumber(cr) ||
      !isFiniteNumber(a) ||
      a <= 0
    ) {
      ratio.push(null);
      continue;
    }
    const raw = cr / a;
    ratio.push(raw === 0 ? 0 : raw);
  }
  return { closeRange, atr, ratio };
}

/** Classify a ratio reading. */
export function classifyLineAtrMultiplierZone(
  value: number | null,
  highThreshold: number,
  lowThreshold: number,
): ChartLineAtrMultiplierZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value === 0) return 'flat';
  if (value >= highThreshold) return 'high';
  if (value < lowThreshold) return 'low';
  return 'normal';
}

/**
 * Detect threshold crosses: `'up'` when prev `< highThreshold` and
 * current `>= highThreshold`; `'down'` when prev `>= lowThreshold`
 * and current `< lowThreshold`.
 */
export function detectLineAtrMultiplierCrosses(
  values: readonly (number | null)[],
  highThreshold: number,
  lowThreshold: number,
): Array<ChartLineAtrMultiplierCross> {
  const out: Array<ChartLineAtrMultiplierCross> = [];
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
    if (prev < highThreshold && v >= highThreshold) {
      out.push('up');
    } else if (prev >= lowThreshold && v < lowThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineAtrMultiplier(
  data: readonly ChartLineAtrMultiplierPoint[] | null | undefined,
  options: ChartLineAtrMultiplierOptions = {},
): ChartLineAtrMultiplierRun {
  const series = getLineAtrMultiplierFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineAtrMultiplierLength(
    options.length,
    DEFAULT_CHART_LINE_ATR_MULTIPLIER_LENGTH,
  );
  const atrLength = normalizeLineAtrMultiplierAtrLength(
    options.atrLength,
    DEFAULT_CHART_LINE_ATR_MULTIPLIER_ATR_LENGTH,
  );
  const highThreshold = normalizeLineAtrMultiplierThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_ATR_MULTIPLIER_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineAtrMultiplierThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_ATR_MULTIPLIER_LOW_THRESHOLD,
  );
  const channels = computeLineAtrMultiplier(series, { length, atrLength });
  const crosses = detectLineAtrMultiplierCrosses(
    channels.ratio,
    highThreshold,
    lowThreshold,
  );
  const samples: ChartLineAtrMultiplierSample[] = series.map(
    (point, index) => {
      const value = channels.ratio[index] ?? null;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        closeRange: channels.closeRange[index] ?? null,
        atr: channels.atr[index] ?? null,
        ratio: value,
        zone: classifyLineAtrMultiplierZone(
          value,
          highThreshold,
          lowThreshold,
        ),
        crossed: crosses[index] ?? null,
      };
    },
  );
  let highCount = 0;
  let normalCount = 0;
  let lowCount = 0;
  let flatCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'high') highCount += 1;
    else if (sample.zone === 'normal') normalCount += 1;
    else if (sample.zone === 'low') lowCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series,
    length,
    atrLength,
    highThreshold,
    lowThreshold,
    closeRangeValues: channels.closeRange,
    atrValues: channels.atr,
    ratioValues: channels.ratio,
    samples,
    highCount,
    normalCount,
    lowCount,
    flatCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= Math.max(length, atrLength),
  };
}

export interface ChartLineAtrMultiplierLayoutOptions
  extends ChartLineAtrMultiplierOptions {
  data: readonly ChartLineAtrMultiplierPoint[] | null | undefined;
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
export function computeLineAtrMultiplierLayout(
  options: ChartLineAtrMultiplierLayoutOptions,
): ChartLineAtrMultiplierLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ATR_MULTIPLIER_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ATR_MULTIPLIER_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ATR_MULTIPLIER_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_ATR_MULTIPLIER_PANEL_GAP;

  const run = runLineAtrMultiplier(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.atrLength !== undefined
      ? { atrLength: options.atrLength }
      : {}),
    ...(options.highThreshold !== undefined
      ? { highThreshold: options.highThreshold }
      : {}),
    ...(options.lowThreshold !== undefined
      ? { lowThreshold: options.lowThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const ratioHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const ratioTop = priceBottom + panelGap;
  const ratioBottom = ratioTop + ratioHeight;

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

  // Ratio is non-negative by construction. Seed y-axis with thresholds
  // in view; expand to observed max if higher.
  let ratioMax = Math.max(run.highThreshold * 1.25, 1);
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.ratio) && sample.ratio > ratioMax) {
      ratioMax = sample.ratio;
    }
  }
  if (ratioMax === 0) ratioMax = 1;
  const ratioMin = 0;
  const ratioY = (value: number): number =>
    ratioBottom -
    ((value - ratioMin) / (ratioMax - ratioMin)) * ratioHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineAtrMultiplierDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const ratioLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAtrMultiplierMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.ratio)) return;
    const cx = xAt(index);
    const yc = ratioY(sample.ratio);
    ratioLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        ratio: sample.ratio,
        crossed: sample.crossed,
      });
    }
  });

  const highThresholdY = ratioY(run.highThreshold);
  const lowThresholdY = ratioY(run.lowThreshold);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    ratioTop,
    ratioBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    ratioPath: buildLinePath(ratioLinePoints),
    highThresholdY,
    lowThresholdY,
    markers,
    priceMin,
    priceMax,
    ratioMin,
    ratioMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAtrMultiplierChart(
  data: readonly ChartLineAtrMultiplierPoint[] | null | undefined,
  options: ChartLineAtrMultiplierOptions = {},
): string {
  const run = runLineAtrMultiplier(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a normalized volatility ratio on the lower ` +
    `panel (length ${run.length}, atrLength ${run.atrLength}, ` +
    `highThreshold ${run.highThreshold}, lowThreshold ${run.lowThreshold}). ` +
    `Each bar divides the rolling close range by the ATR. Across ` +
    `${total} bars the ratio was high on ${run.highCount}, normal on ` +
    `${run.normalCount}, low on ${run.lowCount}, flat on ` +
    `${run.flatCount}, and undefined on ${run.noneCount}, with ` +
    `${run.bullishCrossCount} crosses into the high zone and ` +
    `${run.bearishCrossCount} crosses into the low zone.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatRatio(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return value.toFixed(3);
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

function zoneLabelOf(zone: ChartLineAtrMultiplierZone): string {
  if (zone === 'high') return 'High volatility';
  if (zone === 'normal') return 'Normal';
  if (zone === 'low') return 'Low volatility';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineAtrMultiplierCross): string {
  if (crossed === 'up') return 'Entered high';
  if (crossed === 'down') return 'Entered low';
  return '-';
}

/** ChartLineAtrMultiplier -- dual-panel pure-SVG chart. */
export const ChartLineAtrMultiplier = forwardRef<
  HTMLDivElement,
  ChartLineAtrMultiplierProps
>(function ChartLineAtrMultiplier(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_ATR_MULTIPLIER_LENGTH,
    atrLength = DEFAULT_CHART_LINE_ATR_MULTIPLIER_ATR_LENGTH,
    highThreshold = DEFAULT_CHART_LINE_ATR_MULTIPLIER_HIGH_THRESHOLD,
    lowThreshold = DEFAULT_CHART_LINE_ATR_MULTIPLIER_LOW_THRESHOLD,
    width = DEFAULT_CHART_LINE_ATR_MULTIPLIER_WIDTH,
    height = DEFAULT_CHART_LINE_ATR_MULTIPLIER_HEIGHT,
    padding = DEFAULT_CHART_LINE_ATR_MULTIPLIER_PADDING,
    panelGap = DEFAULT_CHART_LINE_ATR_MULTIPLIER_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ATR_MULTIPLIER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ATR_MULTIPLIER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ATR_MULTIPLIER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ATR_MULTIPLIER_PRICE_COLOR,
    ratioColor = DEFAULT_CHART_LINE_ATR_MULTIPLIER_RATIO_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ATR_MULTIPLIER_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ATR_MULTIPLIER_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ATR_MULTIPLIER_THRESHOLD_COLOR,
    axisColor = DEFAULT_CHART_LINE_ATR_MULTIPLIER_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ATR_MULTIPLIER_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRatio = true,
    showMarkers = true,
    showThresholds = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatRatio = defaultFormatRatio,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-atr-multiplier-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAtrMultiplierSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAtrMultiplierSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAtrMultiplierLayout({
        data,
        length,
        atrLength,
        highThreshold,
        lowThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      length,
      atrLength,
      highThreshold,
      lowThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineAtrMultiplierChart(data, {
      length,
      atrLength,
      highThreshold,
      lowThreshold,
    });
  const resolvedLabel =
    ariaLabel ??
    `ATR Multiplier chart, length ${run.length}, atrLength ${run.atrLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAtrMultiplierSeriesId): void => {
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
        data-section="chart-line-atr-multiplier-tooltip"
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
          data-section="chart-line-atr-multiplier-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-atr-multiplier-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatPrice(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-atr-multiplier-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-atr-multiplier-tooltip-close"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-atr-multiplier-tooltip-range"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`CloseRange: ${
            hoverSample.closeRange === null
              ? 'n/a'
              : formatRatio(hoverSample.closeRange)
          }`}
        </text>
        <text
          data-section="chart-line-atr-multiplier-tooltip-atr"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`ATR: ${
            hoverSample.atr === null
              ? 'n/a'
              : formatRatio(hoverSample.atr)
          }`}
        </text>
        <text
          data-section="chart-line-atr-multiplier-tooltip-ratio"
          x={tx + 10}
          y={ty + 119}
          fill="#67e8f9"
          fontSize={11}
          fontWeight={600}
        >
          {`Ratio: ${
            hoverSample.ratio === null
              ? 'n/a'
              : formatRatio(hoverSample.ratio)
          }`}
        </text>
        <text
          data-section="chart-line-atr-multiplier-tooltip-zone"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-atr-multiplier-tooltip-cross"
          x={tx + 10}
          y={ty + 153}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const ratioHidden = isHidden('ratio') || !showRatio;

  const legendItems: Array<{
    id: ChartLineAtrMultiplierSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'ratio', label: 'ATR Multiplier', color: ratioColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-atr-multiplier"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-atr-length={run.atrLength}
      data-high-threshold={run.highThreshold}
      data-low-threshold={run.lowThreshold}
      data-high-count={run.highCount}
      data-normal-count={run.normalCount}
      data-low-count={run.lowCount}
      data-flat-count={run.flatCount}
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
        data-section="chart-line-atr-multiplier-aria-desc"
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
          data-section="chart-line-atr-multiplier-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-atr-multiplier-empty"
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
          data-section="chart-line-atr-multiplier-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-atr-multiplier-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.ratioBottom -
                  t * (layout.ratioBottom - layout.ratioTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-atr-multiplier-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-atr-multiplier-grid-line"
                      data-panel="ratio"
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
            <g data-section="chart-line-atr-multiplier-axes">
              <line
                data-section="chart-line-atr-multiplier-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-atr-multiplier-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-atr-multiplier-axis"
                data-panel="ratio"
                x1={layout.innerLeft}
                y1={layout.ratioTop}
                x2={layout.innerLeft}
                y2={layout.ratioBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-atr-multiplier-axis"
                data-panel="ratio"
                x1={layout.innerLeft}
                y1={layout.ratioBottom}
                x2={layout.innerRight}
                y2={layout.ratioBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-atr-multiplier-tick-label"
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
                data-section="chart-line-atr-multiplier-tick-label"
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
                data-section="chart-line-atr-multiplier-tick-label"
                data-panel="ratio"
                x={layout.innerLeft - 6}
                y={layout.ratioTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatRatio(layout.ratioMax)}
              </text>
              <text
                data-section="chart-line-atr-multiplier-tick-label"
                data-panel="ratio"
                x={layout.innerLeft - 6}
                y={layout.ratioBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`0`}
              </text>
            </g>
          ) : null}

          {showThresholds ? (
            <g data-section="chart-line-atr-multiplier-thresholds">
              <line
                data-section="chart-line-atr-multiplier-high-threshold-line"
                x1={layout.innerLeft}
                y1={layout.highThresholdY}
                x2={layout.innerRight}
                y2={layout.highThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-atr-multiplier-low-threshold-line"
                x1={layout.innerLeft}
                y1={layout.lowThresholdY}
                x2={layout.innerRight}
                y2={layout.lowThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-atr-multiplier-price-path"
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
            <g data-section="chart-line-atr-multiplier-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-atr-multiplier-dot"
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

          {!ratioHidden ? (
            <path
              data-section="chart-line-atr-multiplier-line"
              d={layout.ratioPath}
              fill="none"
              stroke={ratioColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`ATR Multiplier line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-atr-multiplier-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-atr-multiplier-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-ratio={marker.ratio}
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
                  )}, ratio ${formatRatio(marker.ratio)}, ${crossLabelOf(
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
            <g data-section="chart-line-atr-multiplier-badge">
              <rect
                data-section="chart-line-atr-multiplier-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={240}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-atr-multiplier-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ATR Mult ${run.length}/ATR${run.atrLength} H>=${run.highThreshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-atr-multiplier-legend"
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
                data-section="chart-line-atr-multiplier-legend-item"
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
                  data-section="chart-line-atr-multiplier-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-atr-multiplier-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-atr-multiplier-legend-stats"
            style={{ color: axisColor }}
          >
            {`H ${run.highCount} / N ${run.normalCount} / L ${run.lowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAtrMultiplier.displayName = 'ChartLineAtrMultiplier';
