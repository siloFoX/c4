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
 * ChartLineKcPercentK -- pure-SVG dual-panel chart with a
 * Keltner Channel %K oscillator beneath the close. %K locates
 * the close within the Keltner channel envelope.
 *
 * Definition:
 *
 *   middle[i] = EMA(close, length)[i]
 *   TR[i]     = max(high - low,
 *                   |high - prevClose|,
 *                   |low - prevClose|)
 *   ATR[i]    = SMA(TR, length)[i]
 *   upper[i]  = middle[i] + multiplier * ATR[i]
 *   lower[i]  = middle[i] - multiplier * ATR[i]
 *   %K[i]     = (close[i] - lower[i]) / (upper[i] - lower[i])
 *
 * Defaults: `length = 20`, `multiplier = 2`. The first bar's
 * `TR` is `high - low` (no prior close). When `ATR == 0`
 * (singular: completely flat bars) `%K = null`.
 *
 * Bit-exact anchors:
 *
 *   * **CONST_BAR with close at midpoint** (high = K + r,
 *     low = K - r, close = K, all bars, r > 0): TR = 2r at
 *     every bar, ATR = 2r, middle = K, upper = K + 4r,
 *     lower = K - 4r, `%K = (K - (K - 4r)) / ((K + 4r) -
 *     (K - 4r)) = 4r / 8r = 0.5` **bit-exact** past the
 *     warmup.
 *   * **CONST_FLAT (high == low == close == K)**: TR = 0,
 *     ATR = 0 -> upper = lower -> `%K = null` at every bar.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots %K with reference
 * lines at 0, 0.5, and 1.
 */

export interface ChartLineKcPercentKPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineKcPercentKZone =
  | 'above-upper'
  | 'above-mid'
  | 'below-mid'
  | 'below-lower'
  | 'none';

export type ChartLineKcPercentKSeriesId = 'price' | 'percentK';

export interface ChartLineKcPercentKSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  percentK: number | null;
  zone: ChartLineKcPercentKZone;
}

export interface ChartLineKcPercentKRun {
  series: ChartLineKcPercentKPoint[];
  length: number;
  multiplier: number;
  percentK: Array<number | null>;
  samples: ChartLineKcPercentKSample[];
  percentKFinal: number | null;
  aboveUpperCount: number;
  aboveMidCount: number;
  belowMidCount: number;
  belowLowerCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineKcPercentKMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  percentK: number;
  zone: ChartLineKcPercentKZone;
}

export interface ChartLineKcPercentKDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKcPercentKLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  pkTop: number;
  pkBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineKcPercentKDot[];
  percentKPath: string;
  markers: ChartLineKcPercentKMarker[];
  priceMin: number;
  priceMax: number;
  upperBandY: number;
  midBandY: number;
  lowerBandY: number;
  pkMin: number;
  pkMax: number;
  run: ChartLineKcPercentKRun;
}

export interface ChartLineKcPercentKProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKcPercentKPoint[];
  length?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  percentKColor?: string;
  aboveUpperColor?: string;
  aboveMidColor?: string;
  belowMidColor?: string;
  belowLowerColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  bandColor?: string;
  midLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPercentK?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  showMidLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKcPercentKSeriesId[];
  defaultHiddenSeries?: ChartLineKcPercentKSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKcPercentKSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineKcPercentKSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatPercentK?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_KC_PERCENT_K_WIDTH = 720;
export const DEFAULT_CHART_LINE_KC_PERCENT_K_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KC_PERCENT_K_PADDING = 44;
export const DEFAULT_CHART_LINE_KC_PERCENT_K_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KC_PERCENT_K_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KC_PERCENT_K_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KC_PERCENT_K_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KC_PERCENT_K_LENGTH = 20;
export const DEFAULT_CHART_LINE_KC_PERCENT_K_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_KC_PERCENT_K_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_PERCENT_K_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_ABOVE_UPPER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_ABOVE_MID_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_BELOW_MID_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_BELOW_LOWER_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_BAND_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KC_PERCENT_K_MID_LINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineKcPercentKFinitePoints(
  data: readonly ChartLineKcPercentKPoint[] | null | undefined,
): ChartLineKcPercentKPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKcPercentKPoint[] = [];
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
export function normalizeLineKcPercentKLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite multiplier. */
export function normalizeLineKcPercentKMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

/**
 * Single-pass EMA seeded at the first finite value.
 *
 *   alpha = 2 / (length + 1)
 *   ema[0] = x[0]
 *   ema[i] = alpha * x[i] + (1 - alpha) * ema[i - 1]
 */
export function applyLineKcPercentKEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const alpha = 2 / (length + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev === null) {
      out.push(v);
      prev = v;
      continue;
    }
    const e: number = alpha * v + (1 - alpha) * prev;
    out.push(e);
    prev = e;
  }
  return out;
}

/** SMA; nulls inside the window null the bar. */
export function applyLineKcPercentKSma(
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
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(sum / length);
  }
  return out;
}

export interface ChartLineKcPercentKOptions {
  length?: number;
  multiplier?: number;
}

/**
 * Compute %K per bar. Bars before `i = length - 1` are `null`
 * (warmup; the ATR SMA needs `length` TR samples). When
 * `ATR == 0` (singular: completely flat bars) %K is `null`.
 */
export function computeLineKcPercentK(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineKcPercentKOptions = {},
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const length = normalizeLineKcPercentKLength(
    options.length,
    DEFAULT_CHART_LINE_KC_PERCENT_K_LENGTH,
  );
  const multiplier = normalizeLineKcPercentKMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_KC_PERCENT_K_MULTIPLIER,
  );
  // True range per bar. Bar 0 has no prior close -> TR = high - low.
  const tr: Array<number | null> = bars.map((bar, i) => {
    if (
      !bar ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low) ||
      !isFiniteNumber(bar.close)
    ) {
      return null;
    }
    if (i === 0) return bar.high - bar.low;
    const prev = bars[i - 1];
    if (!prev || !isFiniteNumber(prev.close)) return bar.high - bar.low;
    const a = bar.high - bar.low;
    const b = Math.abs(bar.high - prev.close);
    const c = Math.abs(bar.low - prev.close);
    return Math.max(a, b, c);
  });
  const closes: Array<number | null> = bars.map((bar) =>
    !bar || !isFiniteNumber(bar.close) ? null : bar.close,
  );
  const middle = applyLineKcPercentKEma(closes, length);
  const atr = applyLineKcPercentKSma(tr, length);
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const m = middle[i];
    const a = atr[i];
    const bar = bars[i];
    if (
      m == null ||
      a == null ||
      !bar ||
      !isFiniteNumber(m) ||
      !isFiniteNumber(a) ||
      !isFiniteNumber(bar.close) ||
      a === 0
    ) {
      out.push(null);
      continue;
    }
    const upper = m + multiplier * a;
    const lower = m - multiplier * a;
    out.push((bar.close - lower) / (upper - lower));
  }
  return out;
}

/** Classify a %K reading. */
export function classifyLineKcPercentKZone(
  value: number | null,
): ChartLineKcPercentKZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= 1) return 'above-upper';
  if (value > 0.5) return 'above-mid';
  if (value > 0) return 'below-mid';
  return 'below-lower';
}

/** Run the full %K pipeline plus sample classification. */
export function runLineKcPercentK(
  data: readonly ChartLineKcPercentKPoint[] | null | undefined,
  options: ChartLineKcPercentKOptions = {},
): ChartLineKcPercentKRun {
  const series = getLineKcPercentKFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineKcPercentKLength(
    options.length,
    DEFAULT_CHART_LINE_KC_PERCENT_K_LENGTH,
  );
  const multiplier = normalizeLineKcPercentKMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_KC_PERCENT_K_MULTIPLIER,
  );
  const percentK = computeLineKcPercentK(series, { length, multiplier });
  const samples: ChartLineKcPercentKSample[] = series.map((point, index) => {
    const value = percentK[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      percentK: value,
      zone: classifyLineKcPercentKZone(value),
    };
  });
  let aboveUpperCount = 0;
  let aboveMidCount = 0;
  let belowMidCount = 0;
  let belowLowerCount = 0;
  let noneCount = 0;
  let percentKFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above-upper') aboveUpperCount += 1;
    else if (sample.zone === 'above-mid') aboveMidCount += 1;
    else if (sample.zone === 'below-mid') belowMidCount += 1;
    else if (sample.zone === 'below-lower') belowLowerCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.percentK)) percentKFinal = sample.percentK;
  }
  return {
    series = [],
    length,
    multiplier,
    percentK,
    samples,
    percentKFinal,
    aboveUpperCount,
    aboveMidCount,
    belowMidCount,
    belowLowerCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineKcPercentKLayoutOptions
  extends ChartLineKcPercentKOptions {
  data: readonly ChartLineKcPercentKPoint[] | null | undefined;
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
export function computeLineKcPercentKLayout(
  options: ChartLineKcPercentKLayoutOptions,
): ChartLineKcPercentKLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_KC_PERCENT_K_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_KC_PERCENT_K_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_KC_PERCENT_K_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_KC_PERCENT_K_PANEL_GAP;

  const run = runLineKcPercentK(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.multiplier !== undefined
      ? { multiplier: options.multiplier }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const pkHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const pkTop = priceBottom + panelGap;
  const pkBottom = pkTop + pkHeight;

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

  // %K is naturally bounded in roughly [0, 1] but can excursion
  // outside; pad the panel range to fit observed values while
  // maintaining at least [-0.2, 1.2] for visual context.
  let pkMin = -0.2;
  let pkMax = 1.2;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.percentK)) {
      if (sample.percentK < pkMin) pkMin = sample.percentK;
      if (sample.percentK > pkMax) pkMax = sample.percentK;
    }
  }
  if (pkMin === pkMax) {
    pkMin -= 1;
    pkMax += 1;
  }
  const pkY = (value: number): number =>
    pkBottom - ((value - pkMin) / (pkMax - pkMin)) * pkHeight;
  const upperBandY = pkY(1);
  const midBandY = pkY(0.5);
  const lowerBandY = pkY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineKcPercentKDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const pkLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineKcPercentKMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.percentK)) return;
    const cx = xAt(index);
    const yc = pkY(sample.percentK);
    pkLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      percentK: sample.percentK,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    pkTop,
    pkBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    percentKPath: buildLinePath(pkLinePoints),
    markers,
    priceMin,
    priceMax,
    upperBandY,
    midBandY,
    lowerBandY,
    pkMin,
    pkMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineKcPercentKChart(
  data: readonly ChartLineKcPercentKPoint[] | null | undefined,
  options: ChartLineKcPercentKOptions = {},
): string {
  const run = runLineKcPercentK(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.percentKFinal === null ? 'n/a' : run.percentKFinal.toFixed(4);
  return (
    `Dual-panel chart with a Keltner Channel %K oscillator panel ` +
    `beneath the close (length ${run.length}, multiplier ` +
    `${run.multiplier}). %K = (close - lowerChannel) / ` +
    `(upperChannel - lowerChannel), where the channel midline is ` +
    `an EMA of the close and the bands are offset by multiplier * ` +
    `ATR over the lookback. Across ${total} bars %K is above the ` +
    `upper channel on ${run.aboveUpperCount}, between the middle ` +
    `and upper channels on ${run.aboveMidCount}, between the lower ` +
    `and middle channels on ${run.belowMidCount}, below the lower ` +
    `channel on ${run.belowLowerCount}, and undefined on ` +
    `${run.noneCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatPercentK(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineKcPercentKZone,
  aboveUpperColor: string,
  aboveMidColor: string,
  belowMidColor: string,
  belowLowerColor: string,
  noneColor: string,
): string {
  if (zone === 'above-upper') return aboveUpperColor;
  if (zone === 'above-mid') return aboveMidColor;
  if (zone === 'below-mid') return belowMidColor;
  if (zone === 'below-lower') return belowLowerColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineKcPercentKZone): string {
  if (zone === 'above-upper') return 'Above Upper';
  if (zone === 'above-mid') return 'Above Mid';
  if (zone === 'below-mid') return 'Below Mid';
  if (zone === 'below-lower') return 'Below Lower';
  return 'n/a';
}

/**
 * ChartLineKcPercentK -- dual-panel pure-SVG Keltner Channel
 * %K chart.
 */
export const ChartLineKcPercentK = forwardRef<
  HTMLDivElement,
  ChartLineKcPercentKProps
>(function ChartLineKcPercentK(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_KC_PERCENT_K_LENGTH,
    multiplier = DEFAULT_CHART_LINE_KC_PERCENT_K_MULTIPLIER,
    width = DEFAULT_CHART_LINE_KC_PERCENT_K_WIDTH,
    height = DEFAULT_CHART_LINE_KC_PERCENT_K_HEIGHT,
    padding = DEFAULT_CHART_LINE_KC_PERCENT_K_PADDING,
    panelGap = DEFAULT_CHART_LINE_KC_PERCENT_K_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_KC_PERCENT_K_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KC_PERCENT_K_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KC_PERCENT_K_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KC_PERCENT_K_PRICE_COLOR,
    percentKColor = DEFAULT_CHART_LINE_KC_PERCENT_K_PERCENT_K_COLOR,
    aboveUpperColor = DEFAULT_CHART_LINE_KC_PERCENT_K_ABOVE_UPPER_COLOR,
    aboveMidColor = DEFAULT_CHART_LINE_KC_PERCENT_K_ABOVE_MID_COLOR,
    belowMidColor = DEFAULT_CHART_LINE_KC_PERCENT_K_BELOW_MID_COLOR,
    belowLowerColor = DEFAULT_CHART_LINE_KC_PERCENT_K_BELOW_LOWER_COLOR,
    noneColor = DEFAULT_CHART_LINE_KC_PERCENT_K_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_KC_PERCENT_K_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_KC_PERCENT_K_GRID_COLOR,
    bandColor = DEFAULT_CHART_LINE_KC_PERCENT_K_BAND_COLOR,
    midLineColor = DEFAULT_CHART_LINE_KC_PERCENT_K_MID_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPercentK = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
    showMidLine = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatPercentK = defaultFormatPercentK,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-kc-percent-k-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineKcPercentKSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineKcPercentKSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineKcPercentKLayout({
        data,
        length,
        multiplier,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, multiplier, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineKcPercentKChart(data, { length, multiplier });
  const resolvedLabel =
    ariaLabel ??
    `Keltner Channel %K chart, length ${run.length}, multiplier ${run.multiplier}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineKcPercentKSeriesId): void => {
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
    const tooltipW = 240;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-kc-percent-k-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={102}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-kc-percent-k-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-kc-percent-k-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-kc-percent-k-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-kc-percent-k-tooltip-percent-k"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`%K: ${
            hoverSample.percentK === null
              ? 'n/a'
              : formatPercentK(hoverSample.percentK)
          }`}
        </text>
        <text
          data-section="chart-line-kc-percent-k-tooltip-zone"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const percentKHidden = isHidden('percentK') || !showPercentK;

  const legendItems: Array<{
    id: ChartLineKcPercentKSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'percentK', label: '%K (Keltner)', color: percentKColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-kc-percent-k"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-multiplier={run.multiplier}
      data-percent-k-final={
        run.percentKFinal === null ? '' : run.percentKFinal
      }
      data-above-upper-count={run.aboveUpperCount}
      data-above-mid-count={run.aboveMidCount}
      data-below-mid-count={run.belowMidCount}
      data-below-lower-count={run.belowLowerCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-kc-percent-k-aria-desc"
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
          data-section="chart-line-kc-percent-k-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-kc-percent-k-empty"
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
          data-section="chart-line-kc-percent-k-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-kc-percent-k-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.pkBottom - t * (layout.pkBottom - layout.pkTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-kc-percent-k-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-kc-percent-k-grid-line"
                      data-panel="percent-k"
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
            <g data-section="chart-line-kc-percent-k-axes">
              <line
                data-section="chart-line-kc-percent-k-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-kc-percent-k-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-kc-percent-k-axis"
                data-panel="percent-k"
                x1={layout.innerLeft}
                y1={layout.pkTop}
                x2={layout.innerLeft}
                y2={layout.pkBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-kc-percent-k-axis"
                data-panel="percent-k"
                x1={layout.innerLeft}
                y1={layout.pkBottom}
                x2={layout.innerRight}
                y2={layout.pkBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-kc-percent-k-tick-label"
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
                data-section="chart-line-kc-percent-k-tick-label"
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
                data-section="chart-line-kc-percent-k-tick-label"
                data-panel="percent-k"
                x={layout.innerLeft - 6}
                y={layout.pkTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPercentK(layout.pkMax)}
              </text>
              <text
                data-section="chart-line-kc-percent-k-tick-label"
                data-panel="percent-k"
                x={layout.innerLeft - 6}
                y={layout.pkBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPercentK(layout.pkMin)}
              </text>
            </g>
          ) : null}

          {showBands ? (
            <g data-section="chart-line-kc-percent-k-bands">
              <line
                data-section="chart-line-kc-percent-k-upper-band"
                x1={layout.innerLeft}
                y1={layout.upperBandY}
                x2={layout.innerRight}
                y2={layout.upperBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-kc-percent-k-lower-band"
                x1={layout.innerLeft}
                y1={layout.lowerBandY}
                x2={layout.innerRight}
                y2={layout.lowerBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {showMidLine ? (
            <line
              data-section="chart-line-kc-percent-k-mid-line"
              x1={layout.innerLeft}
              y1={layout.midBandY}
              x2={layout.innerRight}
              y2={layout.midBandY}
              stroke={midLineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-kc-percent-k-price-path"
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
            <g data-section="chart-line-kc-percent-k-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-kc-percent-k-dot"
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

          {!percentKHidden ? (
            <path
              data-section="chart-line-kc-percent-k-line"
              d={layout.percentKPath}
              fill="none"
              stroke={percentKColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`%K line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-kc-percent-k-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-kc-percent-k-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-percent-k={marker.percentK}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    aboveUpperColor,
                    aboveMidColor,
                    belowMidColor,
                    belowLowerColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, %K ${formatPercentK(marker.percentK)}, ${zoneLabelOf(
                    marker.zone,
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
            <g data-section="chart-line-kc-percent-k-badge">
              <rect
                data-section="chart-line-kc-percent-k-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-kc-percent-k-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Keltner %K ${run.length}/${run.multiplier}x`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-kc-percent-k-legend"
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
                data-section="chart-line-kc-percent-k-legend-item"
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
                  data-section="chart-line-kc-percent-k-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-kc-percent-k-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-kc-percent-k-legend-stats"
            style={{ color: axisColor }}
          >
            {`>=upper ${run.aboveUpperCount} / above-mid ${run.aboveMidCount} / below-mid ${run.belowMidCount} / <=lower ${run.belowLowerCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineKcPercentK.displayName = 'ChartLineKcPercentK';
