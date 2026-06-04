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
 * ChartLineAtrRatio -- pure-SVG dual-panel chart with the close on
 * top and a short-over-long ATR ratio oscillator on the bottom. The
 * ratio captures volatility regime shifts: when short-term ATR
 * exceeds long-term ATR (ratio > 1) volatility is expanding; when
 * short-term lags long-term (ratio < 1) volatility is contracting.
 *
 *   tr[i]       = max(high - low, |high - prevClose|,
 *                     |low - prevClose|)
 *   shortAtr[i] = SMA(tr, shortLength)[i]
 *   longAtr[i]  = SMA(tr, longLength)[i]
 *   ratio[i]    = longAtr[i] > 0 ? shortAtr[i] / longAtr[i] : null
 *
 * `ratio[i]` is `null` during warmup or when the long ATR is zero
 * (divide-by-zero guard).
 *
 * Bit-exact anchor: **CONST high=low=close=K**: `tr = 0` everywhere
 * -> both ATRs = 0 -> divide-by-zero guard -> `ratio = null`.
 * Verified across `K in {0, 1, 5, 100, -3}` and `(shortLength,
 * longLength)` combinations.
 *
 * Additional bit-exact anchor: **LINEAR close=k+1** with
 * `high = low = close`. `tr[0] = 0`, `tr[i >= 1] = 1`. After both ATR
 * warmups (i.e. once `tr[0]` falls out of the longer window),
 * `shortAtr = longAtr = 1` exactly, so `ratio = 1` (bit-exact).
 * Verified for `(shortLength, longLength) in {(3, 5), (5, 8), (5,
 * 10)}`.
 */

export interface ChartLineAtrRatioPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAtrRatioZone =
  | 'expanding'
  | 'normal'
  | 'contracting'
  | 'flat'
  | 'none';

export type ChartLineAtrRatioCross = 'up' | 'down' | null;

export type ChartLineAtrRatioSeriesId = 'price' | 'ratio';

export interface ChartLineAtrRatioSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  shortAtr: number | null;
  longAtr: number | null;
  ratio: number | null;
  zone: ChartLineAtrRatioZone;
  crossed: ChartLineAtrRatioCross;
}

export interface ChartLineAtrRatioRun {
  series: ChartLineAtrRatioPoint[];
  shortLength: number;
  longLength: number;
  highThreshold: number;
  lowThreshold: number;
  shortAtrValues: Array<number | null>;
  longAtrValues: Array<number | null>;
  ratioValues: Array<number | null>;
  samples: ChartLineAtrRatioSample[];
  expandingCount: number;
  normalCount: number;
  contractingCount: number;
  flatCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineAtrRatioMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  ratio: number;
  crossed: 'up' | 'down';
}

export interface ChartLineAtrRatioDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAtrRatioLayout {
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
  priceDots: ChartLineAtrRatioDot[];
  ratioPath: string;
  midlineY: number;
  highThresholdY: number;
  lowThresholdY: number;
  markers: ChartLineAtrRatioMarker[];
  priceMin: number;
  priceMax: number;
  ratioMin: number;
  ratioMax: number;
  run: ChartLineAtrRatioRun;
}

export interface ChartLineAtrRatioProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAtrRatioPoint[];
  shortLength?: number;
  longLength?: number;
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
  midlineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRatio?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAtrRatioSeriesId[];
  defaultHiddenSeries?: ChartLineAtrRatioSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAtrRatioSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAtrRatioSample }) => void;
  formatPrice?: (value: number) => string;
  formatRatio?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ATR_RATIO_WIDTH = 720;
export const DEFAULT_CHART_LINE_ATR_RATIO_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ATR_RATIO_PADDING = 44;
export const DEFAULT_CHART_LINE_ATR_RATIO_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ATR_RATIO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ATR_RATIO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ATR_RATIO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ATR_RATIO_SHORT_LENGTH = 5;
export const DEFAULT_CHART_LINE_ATR_RATIO_LONG_LENGTH = 20;
export const DEFAULT_CHART_LINE_ATR_RATIO_HIGH_THRESHOLD = 1.2;
export const DEFAULT_CHART_LINE_ATR_RATIO_LOW_THRESHOLD = 0.8;
export const DEFAULT_CHART_LINE_ATR_RATIO_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ATR_RATIO_RATIO_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_ATR_RATIO_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ATR_RATIO_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ATR_RATIO_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_ATR_RATIO_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_ATR_RATIO_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ATR_RATIO_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC fields. */
export function getLineAtrRatioFinitePoints(
  data: readonly ChartLineAtrRatioPoint[] | null | undefined,
): ChartLineAtrRatioPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAtrRatioPoint[] = [];
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

/** Coerce a positive integer length (>= 1). */
export function normalizeLineAtrRatioLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite threshold. */
export function normalizeLineAtrRatioThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

/** Per-bar True Range; first bar uses h - l. */
export function applyLineAtrRatioTrueRange(
  series: readonly ChartLineAtrRatioPoint[],
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
export function applyLineAtrRatioAtr(
  trValues: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(trValues) || trValues.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < trValues.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = trValues[i - j];
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

export interface ChartLineAtrRatioOptions {
  shortLength?: number;
  longLength?: number;
  highThreshold?: number;
  lowThreshold?: number;
}

export interface ChartLineAtrRatioChannels {
  shortAtr: Array<number | null>;
  longAtr: Array<number | null>;
  ratio: Array<number | null>;
}

/** Compute the ATR ratio pipeline. */
export function computeLineAtrRatio(
  series: readonly ChartLineAtrRatioPoint[] | null | undefined,
  options: ChartLineAtrRatioOptions = {},
): ChartLineAtrRatioChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return { shortAtr: [], longAtr: [], ratio: [] };
  }
  const shortLength = normalizeLineAtrRatioLength(
    options.shortLength,
    DEFAULT_CHART_LINE_ATR_RATIO_SHORT_LENGTH,
  );
  const longLength = normalizeLineAtrRatioLength(
    options.longLength,
    DEFAULT_CHART_LINE_ATR_RATIO_LONG_LENGTH,
  );
  const tr = applyLineAtrRatioTrueRange(series);
  const shortAtr = applyLineAtrRatioAtr(tr, shortLength);
  const longAtr = applyLineAtrRatioAtr(tr, longLength);
  const ratio: Array<number | null> = [];
  for (let i = 0; i < series.length; i += 1) {
    const s = shortAtr[i];
    const l = longAtr[i];
    if (
      s == null ||
      l == null ||
      !isFiniteNumber(s) ||
      !isFiniteNumber(l) ||
      l <= 0
    ) {
      ratio.push(null);
      continue;
    }
    const raw = s / l;
    ratio.push(raw === 0 ? 0 : raw);
  }
  return { shortAtr, longAtr, ratio };
}

/** Classify a ratio reading. */
export function classifyLineAtrRatioZone(
  value: number | null,
  highThreshold: number,
  lowThreshold: number,
): ChartLineAtrRatioZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value === 0) return 'flat';
  if (value >= highThreshold) return 'expanding';
  if (value < lowThreshold) return 'contracting';
  return 'normal';
}

/**
 * Detect threshold crosses. `'up'` when prev `< highThreshold` and
 * current `>= highThreshold`; `'down'` when prev `>= lowThreshold`
 * and current `< lowThreshold`.
 */
export function detectLineAtrRatioCrosses(
  values: readonly (number | null)[],
  highThreshold: number,
  lowThreshold: number,
): Array<ChartLineAtrRatioCross> {
  const out: Array<ChartLineAtrRatioCross> = [];
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
export function runLineAtrRatio(
  data: readonly ChartLineAtrRatioPoint[] | null | undefined,
  options: ChartLineAtrRatioOptions = {},
): ChartLineAtrRatioRun {
  const series = getLineAtrRatioFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const shortLength = normalizeLineAtrRatioLength(
    options.shortLength,
    DEFAULT_CHART_LINE_ATR_RATIO_SHORT_LENGTH,
  );
  const longLength = normalizeLineAtrRatioLength(
    options.longLength,
    DEFAULT_CHART_LINE_ATR_RATIO_LONG_LENGTH,
  );
  const highThreshold = normalizeLineAtrRatioThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_ATR_RATIO_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineAtrRatioThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_ATR_RATIO_LOW_THRESHOLD,
  );
  const channels = computeLineAtrRatio(series, { shortLength, longLength });
  const crosses = detectLineAtrRatioCrosses(
    channels.ratio,
    highThreshold,
    lowThreshold,
  );
  const samples: ChartLineAtrRatioSample[] = series.map((point, index) => {
    const value = channels.ratio[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      shortAtr: channels.shortAtr[index] ?? null,
      longAtr: channels.longAtr[index] ?? null,
      ratio: value,
      zone: classifyLineAtrRatioZone(value, highThreshold, lowThreshold),
      crossed: crosses[index] ?? null,
    };
  });
  let expandingCount = 0;
  let normalCount = 0;
  let contractingCount = 0;
  let flatCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'expanding') expandingCount += 1;
    else if (sample.zone === 'normal') normalCount += 1;
    else if (sample.zone === 'contracting') contractingCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series,
    shortLength,
    longLength,
    highThreshold,
    lowThreshold,
    shortAtrValues: channels.shortAtr,
    longAtrValues: channels.longAtr,
    ratioValues: channels.ratio,
    samples,
    expandingCount,
    normalCount,
    contractingCount,
    flatCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= longLength,
  };
}

export interface ChartLineAtrRatioLayoutOptions
  extends ChartLineAtrRatioOptions {
  data: readonly ChartLineAtrRatioPoint[] | null | undefined;
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
export function computeLineAtrRatioLayout(
  options: ChartLineAtrRatioLayoutOptions,
): ChartLineAtrRatioLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ATR_RATIO_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ATR_RATIO_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ATR_RATIO_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_ATR_RATIO_PANEL_GAP;

  const run = runLineAtrRatio(options.data, {
    ...(options.shortLength !== undefined
      ? { shortLength: options.shortLength }
      : {}),
    ...(options.longLength !== undefined
      ? { longLength: options.longLength }
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

  // Ratio is non-negative; seed y-axis with 0 to max(observed,
  // highThreshold * 1.25, 1.5 reference).
  let ratioMax = Math.max(run.highThreshold * 1.25, 1.5);
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
  const priceDots: ChartLineAtrRatioDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const ratioLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAtrRatioMarker[] = [];
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

  const midlineY = ratioY(1);
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
    midlineY,
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
export function describeLineAtrRatioChart(
  data: readonly ChartLineAtrRatioPoint[] | null | undefined,
  options: ChartLineAtrRatioOptions = {},
): string {
  const run = runLineAtrRatio(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with an ATR ratio regime indicator on the lower ` +
    `panel (shortLength ${run.shortLength}, longLength ${run.longLength}, ` +
    `highThreshold ${run.highThreshold}, lowThreshold ${run.lowThreshold}). ` +
    `Each bar divides the short ATR by the long ATR. Across ${total} ` +
    `bars the ratio was expanding on ${run.expandingCount}, normal on ` +
    `${run.normalCount}, contracting on ${run.contractingCount}, flat ` +
    `on ${run.flatCount}, and undefined on ${run.noneCount}, with ` +
    `${run.bullishCrossCount} crosses into expansion and ` +
    `${run.bearishCrossCount} crosses into contraction.`
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

function zoneLabelOf(zone: ChartLineAtrRatioZone): string {
  if (zone === 'expanding') return 'Expanding volatility';
  if (zone === 'normal') return 'Normal';
  if (zone === 'contracting') return 'Contracting volatility';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineAtrRatioCross): string {
  if (crossed === 'up') return 'Entered expansion';
  if (crossed === 'down') return 'Entered contraction';
  return '-';
}

/** ChartLineAtrRatio -- dual-panel pure-SVG chart. */
export const ChartLineAtrRatio = forwardRef<
  HTMLDivElement,
  ChartLineAtrRatioProps
>(function ChartLineAtrRatio(props, ref) {
  const {
    data,
    shortLength = DEFAULT_CHART_LINE_ATR_RATIO_SHORT_LENGTH,
    longLength = DEFAULT_CHART_LINE_ATR_RATIO_LONG_LENGTH,
    highThreshold = DEFAULT_CHART_LINE_ATR_RATIO_HIGH_THRESHOLD,
    lowThreshold = DEFAULT_CHART_LINE_ATR_RATIO_LOW_THRESHOLD,
    width = DEFAULT_CHART_LINE_ATR_RATIO_WIDTH,
    height = DEFAULT_CHART_LINE_ATR_RATIO_HEIGHT,
    padding = DEFAULT_CHART_LINE_ATR_RATIO_PADDING,
    panelGap = DEFAULT_CHART_LINE_ATR_RATIO_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ATR_RATIO_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ATR_RATIO_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ATR_RATIO_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ATR_RATIO_PRICE_COLOR,
    ratioColor = DEFAULT_CHART_LINE_ATR_RATIO_RATIO_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ATR_RATIO_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ATR_RATIO_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ATR_RATIO_THRESHOLD_COLOR,
    midlineColor = DEFAULT_CHART_LINE_ATR_RATIO_MIDLINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_ATR_RATIO_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ATR_RATIO_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRatio = true,
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
    formatRatio = defaultFormatRatio,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-atr-ratio-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAtrRatioSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAtrRatioSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAtrRatioLayout({
        data,
        shortLength,
        longLength,
        highThreshold,
        lowThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      shortLength,
      longLength,
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
    describeLineAtrRatioChart(data, {
      shortLength,
      longLength,
      highThreshold,
      lowThreshold,
    });
  const resolvedLabel =
    ariaLabel ??
    `ATR Ratio chart, short ${run.shortLength}, long ${run.longLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAtrRatioSeriesId): void => {
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
        data-section="chart-line-atr-ratio-tooltip"
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
          data-section="chart-line-atr-ratio-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-atr-ratio-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatPrice(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-atr-ratio-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-atr-ratio-tooltip-close"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-atr-ratio-tooltip-short"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Short ATR(${run.shortLength}): ${
            hoverSample.shortAtr === null
              ? 'n/a'
              : formatRatio(hoverSample.shortAtr)
          }`}
        </text>
        <text
          data-section="chart-line-atr-ratio-tooltip-long"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Long ATR(${run.longLength}): ${
            hoverSample.longAtr === null
              ? 'n/a'
              : formatRatio(hoverSample.longAtr)
          }`}
        </text>
        <text
          data-section="chart-line-atr-ratio-tooltip-ratio"
          x={tx + 10}
          y={ty + 119}
          fill="#fdba74"
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
          data-section="chart-line-atr-ratio-tooltip-zone"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-atr-ratio-tooltip-cross"
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
    id: ChartLineAtrRatioSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'ratio', label: 'ATR Ratio', color: ratioColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-atr-ratio"
      data-empty={isEmpty ? 'true' : 'false'}
      data-short-length={run.shortLength}
      data-long-length={run.longLength}
      data-high-threshold={run.highThreshold}
      data-low-threshold={run.lowThreshold}
      data-expanding-count={run.expandingCount}
      data-normal-count={run.normalCount}
      data-contracting-count={run.contractingCount}
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
        data-section="chart-line-atr-ratio-aria-desc"
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
          data-section="chart-line-atr-ratio-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-atr-ratio-empty"
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
          data-section="chart-line-atr-ratio-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-atr-ratio-grid">
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
                      data-section="chart-line-atr-ratio-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-atr-ratio-grid-line"
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
            <g data-section="chart-line-atr-ratio-axes">
              <line
                data-section="chart-line-atr-ratio-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-atr-ratio-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-atr-ratio-axis"
                data-panel="ratio"
                x1={layout.innerLeft}
                y1={layout.ratioTop}
                x2={layout.innerLeft}
                y2={layout.ratioBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-atr-ratio-axis"
                data-panel="ratio"
                x1={layout.innerLeft}
                y1={layout.ratioBottom}
                x2={layout.innerRight}
                y2={layout.ratioBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-atr-ratio-tick-label"
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
                data-section="chart-line-atr-ratio-tick-label"
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
                data-section="chart-line-atr-ratio-tick-label"
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
                data-section="chart-line-atr-ratio-tick-label"
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
            <g data-section="chart-line-atr-ratio-thresholds">
              <line
                data-section="chart-line-atr-ratio-high-threshold-line"
                x1={layout.innerLeft}
                y1={layout.highThresholdY}
                x2={layout.innerRight}
                y2={layout.highThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-atr-ratio-low-threshold-line"
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

          {showMidline ? (
            <line
              data-section="chart-line-atr-ratio-midline"
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
              data-section="chart-line-atr-ratio-price-path"
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
            <g data-section="chart-line-atr-ratio-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-atr-ratio-dot"
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
              data-section="chart-line-atr-ratio-line"
              d={layout.ratioPath}
              fill="none"
              stroke={ratioColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`ATR Ratio line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-atr-ratio-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-atr-ratio-marker"
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
            <g data-section="chart-line-atr-ratio-badge">
              <rect
                data-section="chart-line-atr-ratio-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={240}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-atr-ratio-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ATR Ratio ${run.shortLength}/${run.longLength} H>=${run.highThreshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-atr-ratio-legend"
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
                data-section="chart-line-atr-ratio-legend-item"
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
                  data-section="chart-line-atr-ratio-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-atr-ratio-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-atr-ratio-legend-stats"
            style={{ color: axisColor }}
          >
            {`exp ${run.expandingCount} / norm ${run.normalCount} / con ${run.contractingCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAtrRatio.displayName = 'ChartLineAtrRatio';
