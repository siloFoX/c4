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
 * ChartLineStochFast -- pure-SVG dual-panel chart with the close on
 * top and a Fast Stochastic Oscillator on the bottom. The "fast"
 * variant plots the raw `%K` without any SMA smoothing:
 *
 *   highestHigh[i] = max(high[i - length + 1 .. i])
 *   lowestLow[i]   = min(low[i - length + 1 .. i])
 *   percentK[i]    = (highestHigh[i] > lowestLow[i])
 *                      ? (close[i] - lowestLow[i])
 *                        / (highestHigh[i] - lowestLow[i]) * 100
 *                      : null
 *
 * `percentK[i]` is `null` during warmup (`i < length - 1`) and when
 * `highestHigh == lowestLow` (degenerate flat window). The output is
 * bounded in `[0, 100]`.
 *
 * Bit-exact anchor: **CONST high=low=close=K**: `highestHigh =
 * lowestLow = K`, denominator is zero -> `percentK = null` everywhere.
 *
 * Additional bit-exact anchors (all using integer arithmetic):
 * - **LINEAR UP** (`close[i] = i + 1`, `high = low = close`): at any
 *   bar `i >= length - 1` the rolling window is `[i - length + 2 ..
 *   i + 1]`, so `lowestLow = i - length + 2`, `highestHigh = i + 1`,
 *   `close = i + 1`. `(close - lowestLow) / (highestHigh - lowestLow)
 *   = (length - 1) / (length - 1) = 1`, so `percentK = 100`
 *   (bit-exact).
 * - **LINEAR DOWN** (`close[i] = N - i`): mirror case -> `percentK =
 *   0` (bit-exact).
 * - **ALTERNATING** `close[i] = i % 2`: at bar `i >= 1` with even
 *   `length` and ending on a `1` bar, `lowestLow = 0`, `highestHigh
 *   = 1`, `close = 1` -> `percentK = 100`. On `0` bars `percentK =
 *   0`. Alternates exactly `100, 0, 100, 0, ...`.
 */

export interface ChartLineStochFastPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineStochFastZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineStochFastCross = 'up' | 'down' | null;

export type ChartLineStochFastSeriesId = 'price' | 'stoch';

export interface ChartLineStochFastSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  highestHigh: number | null;
  lowestLow: number | null;
  percentK: number | null;
  zone: ChartLineStochFastZone;
  crossed: ChartLineStochFastCross;
}

export interface ChartLineStochFastRun {
  series: ChartLineStochFastPoint[];
  length: number;
  overbought: number;
  oversold: number;
  highestHighValues: Array<number | null>;
  lowestLowValues: Array<number | null>;
  percentKValues: Array<number | null>;
  samples: ChartLineStochFastSample[];
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineStochFastMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  percentK: number;
  crossed: 'up' | 'down';
}

export interface ChartLineStochFastDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochFastLayout {
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
  priceDots: ChartLineStochFastDot[];
  stochPath: string;
  overboughtY: number;
  oversoldY: number;
  midlineY: number;
  markers: ChartLineStochFastMarker[];
  priceMin: number;
  priceMax: number;
  stochMin: number;
  stochMax: number;
  run: ChartLineStochFastRun;
}

export interface ChartLineStochFastProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochFastPoint[];
  length?: number;
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
  hiddenSeries?: ChartLineStochFastSeriesId[];
  defaultHiddenSeries?: ChartLineStochFastSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochFastSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineStochFastSample }) => void;
  formatPrice?: (value: number) => string;
  formatStoch?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STOCH_FAST_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_FAST_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_FAST_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_FAST_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_FAST_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_FAST_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_FAST_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_FAST_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_FAST_OVERBOUGHT = 80;
export const DEFAULT_CHART_LINE_STOCH_FAST_OVERSOLD = 20;
export const DEFAULT_CHART_LINE_STOCH_FAST_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_FAST_STOCH_COLOR = '#4f46e5';
export const DEFAULT_CHART_LINE_STOCH_FAST_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_FAST_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_FAST_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_STOCH_FAST_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_STOCH_FAST_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_FAST_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC fields. */
export function getLineStochFastFinitePoints(
  data: readonly ChartLineStochFastPoint[] | null | undefined,
): ChartLineStochFastPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochFastPoint[] = [];
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
export function normalizeLineStochFastLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a threshold value in `[0, 100]`. */
export function normalizeLineStochFastThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** Rolling max over a window of length bars. */
export function applyLineStochFastRollingMax(
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
export function applyLineStochFastRollingMin(
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

export interface ChartLineStochFastOptions {
  length?: number;
  overbought?: number;
  oversold?: number;
}

export interface ChartLineStochFastChannels {
  highestHigh: Array<number | null>;
  lowestLow: Array<number | null>;
  percentK: Array<number | null>;
}

/** Compute the Fast Stochastic pipeline. */
export function computeLineStochFast(
  series: readonly ChartLineStochFastPoint[] | null | undefined,
  options: ChartLineStochFastOptions = {},
): ChartLineStochFastChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return { highestHigh: [], lowestLow: [], percentK: [] };
  }
  const length = normalizeLineStochFastLength(
    options.length,
    DEFAULT_CHART_LINE_STOCH_FAST_LENGTH,
  );
  const highs = series.map((p) => p.high);
  const lows = series.map((p) => p.low);
  const highestHigh = applyLineStochFastRollingMax(highs, length);
  const lowestLow = applyLineStochFastRollingMin(lows, length);
  const percentK: Array<number | null> = [];
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
      percentK.push(null);
      continue;
    }
    const raw = ((c - ll) / (hh - ll)) * 100;
    percentK.push(raw === 0 ? 0 : raw);
  }
  return { highestHigh, lowestLow, percentK };
}

/** Classify a %K reading. */
export function classifyLineStochFastZone(
  value: number | null,
  overbought: number,
  oversold: number,
): ChartLineStochFastZone {
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
export function detectLineStochFastCrosses(
  values: readonly (number | null)[],
  overbought: number,
  oversold: number,
): Array<ChartLineStochFastCross> {
  const out: Array<ChartLineStochFastCross> = [];
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
export function runLineStochFast(
  data: readonly ChartLineStochFastPoint[] | null | undefined,
  options: ChartLineStochFastOptions = {},
): ChartLineStochFastRun {
  const series = getLineStochFastFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineStochFastLength(
    options.length,
    DEFAULT_CHART_LINE_STOCH_FAST_LENGTH,
  );
  const overbought = normalizeLineStochFastThreshold(
    options.overbought,
    DEFAULT_CHART_LINE_STOCH_FAST_OVERBOUGHT,
  );
  const oversold = normalizeLineStochFastThreshold(
    options.oversold,
    DEFAULT_CHART_LINE_STOCH_FAST_OVERSOLD,
  );
  const channels = computeLineStochFast(series, { length });
  const crosses = detectLineStochFastCrosses(
    channels.percentK,
    overbought,
    oversold,
  );
  const samples: ChartLineStochFastSample[] = series.map((point, index) => {
    const value = channels.percentK[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      highestHigh: channels.highestHigh[index] ?? null,
      lowestLow: channels.lowestLow[index] ?? null,
      percentK: value,
      zone: classifyLineStochFastZone(value, overbought, oversold),
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
    series,
    length,
    overbought,
    oversold,
    highestHighValues: channels.highestHigh,
    lowestLowValues: channels.lowestLow,
    percentKValues: channels.percentK,
    samples,
    overboughtCount,
    oversoldCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length,
  };
}

export interface ChartLineStochFastLayoutOptions
  extends ChartLineStochFastOptions {
  data: readonly ChartLineStochFastPoint[] | null | undefined;
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
export function computeLineStochFastLayout(
  options: ChartLineStochFastLayoutOptions,
): ChartLineStochFastLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_STOCH_FAST_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_STOCH_FAST_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_STOCH_FAST_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_STOCH_FAST_PANEL_GAP;

  const run = runLineStochFast(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
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

  // Stoch axis is fixed [0, 100].
  const stochMin = 0;
  const stochMax = 100;
  const stochY = (value: number): number =>
    stochBottom - ((value - stochMin) / (stochMax - stochMin)) * stochHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineStochFastDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const stochLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineStochFastMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.percentK)) return;
    const cx = xAt(index);
    const yc = stochY(sample.percentK);
    stochLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        percentK: sample.percentK,
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
export function describeLineStochFastChart(
  data: readonly ChartLineStochFastPoint[] | null | undefined,
  options: ChartLineStochFastOptions = {},
): string {
  const run = runLineStochFast(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Fast Stochastic Oscillator (raw %K, no ` +
    `SMA smoothing) on the lower panel (length ${run.length}, ` +
    `overbought ${run.overbought}, oversold ${run.oversold}). Each ` +
    `bar's %K maps the close into [0, 100] within the rolling ` +
    `high-low band across the lookback. Across ${total} bars the %K ` +
    `was overbought on ${run.overboughtCount}, oversold on ` +
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

function zoneLabelOf(zone: ChartLineStochFastZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineStochFastCross): string {
  if (crossed === 'up') return 'Entered overbought';
  if (crossed === 'down') return 'Entered oversold';
  return '-';
}

/** ChartLineStochFast -- dual-panel pure-SVG chart. */
export const ChartLineStochFast = forwardRef<
  HTMLDivElement,
  ChartLineStochFastProps
>(function ChartLineStochFast(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_STOCH_FAST_LENGTH,
    overbought = DEFAULT_CHART_LINE_STOCH_FAST_OVERBOUGHT,
    oversold = DEFAULT_CHART_LINE_STOCH_FAST_OVERSOLD,
    width = DEFAULT_CHART_LINE_STOCH_FAST_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_FAST_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_FAST_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_FAST_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_FAST_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_FAST_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_FAST_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_FAST_PRICE_COLOR,
    stochColor = DEFAULT_CHART_LINE_STOCH_FAST_STOCH_COLOR,
    bullishColor = DEFAULT_CHART_LINE_STOCH_FAST_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_STOCH_FAST_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_STOCH_FAST_THRESHOLD_COLOR,
    midlineColor = DEFAULT_CHART_LINE_STOCH_FAST_MIDLINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_FAST_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_FAST_GRID_COLOR,
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
  const baseId = `chart-line-stoch-fast-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineStochFastSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineStochFastSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineStochFastLayout({
        data,
        length,
        overbought,
        oversold,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, overbought, oversold, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineStochFastChart(data, {
      length,
      overbought,
      oversold,
    });
  const resolvedLabel =
    ariaLabel ?? `Fast Stochastic chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineStochFastSeriesId): void => {
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
        data-section="chart-line-stoch-fast-tooltip"
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
          data-section="chart-line-stoch-fast-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-stoch-fast-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatPrice(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-stoch-fast-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-stoch-fast-tooltip-close"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-stoch-fast-tooltip-hh"
          x={tx + 10}
          y={ty + 83}
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
          data-section="chart-line-stoch-fast-tooltip-ll"
          x={tx + 10}
          y={ty + 99}
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
          data-section="chart-line-stoch-fast-tooltip-k"
          x={tx + 10}
          y={ty + 119}
          fill="#a5b4fc"
          fontSize={11}
          fontWeight={600}
        >
          {`%K: ${
            hoverSample.percentK === null
              ? 'n/a'
              : formatStoch(hoverSample.percentK)
          }`}
        </text>
        <text
          data-section="chart-line-stoch-fast-tooltip-zone"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-stoch-fast-tooltip-cross"
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
  const stochHidden = isHidden('stoch') || !showStoch;

  const legendItems: Array<{
    id: ChartLineStochFastSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'stoch', label: 'Fast %K', color: stochColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-stoch-fast"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
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
        data-section="chart-line-stoch-fast-aria-desc"
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
          data-section="chart-line-stoch-fast-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-stoch-fast-empty"
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
          data-section="chart-line-stoch-fast-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-stoch-fast-grid">
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
                      data-section="chart-line-stoch-fast-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-stoch-fast-grid-line"
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
            <g data-section="chart-line-stoch-fast-axes">
              <line
                data-section="chart-line-stoch-fast-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-fast-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-fast-axis"
                data-panel="stoch"
                x1={layout.innerLeft}
                y1={layout.stochTop}
                x2={layout.innerLeft}
                y2={layout.stochBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-fast-axis"
                data-panel="stoch"
                x1={layout.innerLeft}
                y1={layout.stochBottom}
                x2={layout.innerRight}
                y2={layout.stochBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-stoch-fast-tick-label"
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
                data-section="chart-line-stoch-fast-tick-label"
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
                data-section="chart-line-stoch-fast-tick-label"
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
                data-section="chart-line-stoch-fast-tick-label"
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
            <g data-section="chart-line-stoch-fast-thresholds">
              <line
                data-section="chart-line-stoch-fast-overbought-line"
                x1={layout.innerLeft}
                y1={layout.overboughtY}
                x2={layout.innerRight}
                y2={layout.overboughtY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-stoch-fast-oversold-line"
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
              data-section="chart-line-stoch-fast-midline"
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
              data-section="chart-line-stoch-fast-price-path"
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
            <g data-section="chart-line-stoch-fast-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-stoch-fast-dot"
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
              data-section="chart-line-stoch-fast-line"
              d={layout.stochPath}
              fill="none"
              stroke={stochColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Fast %K line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-stoch-fast-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-stoch-fast-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-percent-k={marker.percentK}
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
                  )}, %K ${formatStoch(marker.percentK)}, ${crossLabelOf(
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
            <g data-section="chart-line-stoch-fast-badge">
              <rect
                data-section="chart-line-stoch-fast-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={220}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-stoch-fast-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Fast %K ${run.length} / OB ${run.overbought} OS ${run.oversold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-stoch-fast-legend"
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
                data-section="chart-line-stoch-fast-legend-item"
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
                  data-section="chart-line-stoch-fast-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-stoch-fast-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-stoch-fast-legend-stats"
            style={{ color: axisColor }}
          >
            {`OB ${run.overboughtCount} / OS ${run.oversoldCount} / neutral ${run.neutralCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineStochFast.displayName = 'ChartLineStochFast';
