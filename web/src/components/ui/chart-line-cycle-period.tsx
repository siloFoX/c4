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
 * ChartLineCyclePeriod -- pure-SVG dual-panel chart with a
 * Cycle Period oscillator panel beneath the close. The period
 * is measured by counting zero crossings of the detrended close
 * over the lookback window.
 *
 * Definition:
 *
 *   detrended[i] = close[i] - SMA(close, smoothLength)[i]
 *   crossings[i] = number of sign changes in
 *                  detrended[i - lookback + 1..i]
 *   period[i]    = (crossings > 0)
 *                  ? clamp(2 * lookback / crossings, minP, maxP)
 *                  : maxPeriod
 *
 * Defaults: `lookback = 30`, `smoothLength = 4`,
 * `minPeriod = 2`, `maxPeriod = 50`. Bars before
 * `i = lookback + smoothLength - 1` are `null` (warmup).
 *
 * Bit-exact anchor:
 *
 *   * **CONST_FLAT (close == K)**: SMA(K) = K (bit-exact when
 *     K * smoothLength is exact, otherwise within a few ULPs);
 *     detrended = close - SMA. For K = 0 the SMA is exactly 0
 *     and detrended is exactly 0, so there are zero crossings
 *     and the period clamps to `maxPeriod` bit-exact at every
 *     bar past the warmup. For K != 0 we still expect
 *     `detrended[i] = 0` to within ULPs and the zero-crossing
 *     detector treats only strict sign changes as crossings,
 *     so the period still clamps to maxPeriod.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the cycle period.
 */

export interface ChartLineCyclePeriodPoint {
  x: number;
  close: number;
}

export type ChartLineCyclePeriodZone =
  | 'short'
  | 'mid'
  | 'long'
  | 'none';

export type ChartLineCyclePeriodSeriesId = 'price' | 'period';

export interface ChartLineCyclePeriodSample {
  index: number;
  x: number;
  close: number;
  period: number | null;
  zone: ChartLineCyclePeriodZone;
}

export interface ChartLineCyclePeriodRun {
  series: ChartLineCyclePeriodPoint[];
  lookback: number;
  smoothLength: number;
  minPeriod: number;
  maxPeriod: number;
  shortBand: number;
  longBand: number;
  period: Array<number | null>;
  samples: ChartLineCyclePeriodSample[];
  periodFinal: number | null;
  shortCount: number;
  midCount: number;
  longCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineCyclePeriodMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  period: number;
  zone: ChartLineCyclePeriodZone;
}

export interface ChartLineCyclePeriodDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCyclePeriodLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  periodTop: number;
  periodBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineCyclePeriodDot[];
  periodPath: string;
  markers: ChartLineCyclePeriodMarker[];
  priceMin: number;
  priceMax: number;
  periodMin: number;
  periodMax: number;
  shortBandY: number;
  longBandY: number;
  run: ChartLineCyclePeriodRun;
}

export interface ChartLineCyclePeriodProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCyclePeriodPoint[];
  lookback?: number;
  smoothLength?: number;
  minPeriod?: number;
  maxPeriod?: number;
  shortBand?: number;
  longBand?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  periodColor?: string;
  shortColor?: string;
  midColor?: string;
  longColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  bandColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPeriod?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCyclePeriodSeriesId[];
  defaultHiddenSeries?: ChartLineCyclePeriodSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCyclePeriodSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineCyclePeriodSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatPeriod?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CYCLE_PERIOD_WIDTH = 720;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_PADDING = 44;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_LOOKBACK = 30;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_SMOOTH_LENGTH = 4;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_MIN_PERIOD = 2;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_MAX_PERIOD = 50;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_SHORT_BAND = 10;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_LONG_BAND = 25;
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_PERIOD_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_SHORT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_MID_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_LONG_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CYCLE_PERIOD_BAND_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineCyclePeriodFinitePoints(
  data: readonly ChartLineCyclePeriodPoint[] | null | undefined,
): ChartLineCyclePeriodPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCyclePeriodPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer (>= 2). */
export function normalizeLineCyclePeriodLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Count strict zero crossings in a numeric series. A "crossing"
 * is a transition from positive to negative or vice versa
 * between consecutive values. Zeros and non-finite values do
 * not contribute to a crossing.
 */
export function countLineCyclePeriodZeroCrossings(
  values: readonly (number | null)[],
): number {
  if (!Array.isArray(values) || values.length < 2) return 0;
  let count = 0;
  for (let i = 1; i < values.length; i += 1) {
    const a = values[i - 1];
    const b = values[i];
    if (
      a === null ||
      a === undefined ||
      b === null ||
      b === undefined ||
      !isFiniteNumber(a) ||
      !isFiniteNumber(b)
    ) {
      continue;
    }
    if ((a > 0 && b < 0) || (a < 0 && b > 0)) count += 1;
  }
  return count;
}

/**
 * Simple Moving Average over `length` bars. Bars before
 * `i = length - 1` (or with non-finite values in the window)
 * are `null`.
 */
export function applyLineCyclePeriodSma(
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

export interface ChartLineCyclePeriodOptions {
  lookback?: number;
  smoothLength?: number;
  minPeriod?: number;
  maxPeriod?: number;
}

/**
 * Compute the cycle period per bar. Bars before
 * `i = lookback + smoothLength - 1` are `null` (warmup).
 * When no zero crossing is detected in the window the period
 * is clamped to `maxPeriod`.
 */
export function computeLineCyclePeriod(
  closes: readonly number[] | null | undefined,
  options: ChartLineCyclePeriodOptions = {},
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const lookback = normalizeLineCyclePeriodLength(
    options.lookback,
    DEFAULT_CHART_LINE_CYCLE_PERIOD_LOOKBACK,
  );
  const smoothLength = normalizeLineCyclePeriodLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_CYCLE_PERIOD_SMOOTH_LENGTH,
  );
  const minPeriod = normalizeLineCyclePeriodLength(
    options.minPeriod,
    DEFAULT_CHART_LINE_CYCLE_PERIOD_MIN_PERIOD,
  );
  const maxPeriod = Math.max(
    minPeriod + 1,
    normalizeLineCyclePeriodLength(
      options.maxPeriod,
      DEFAULT_CHART_LINE_CYCLE_PERIOD_MAX_PERIOD,
    ),
  );
  const sma = applyLineCyclePeriodSma(closes, smoothLength);
  const detrended: Array<number | null> = closes.map((c, i) => {
    const m = sma[i];
    if (m == null || !isFiniteNumber(c) || !isFiniteNumber(m)) return null;
    return c - m;
  });
  const out: Array<number | null> = [];
  const requiredBars = lookback + smoothLength - 1;
  for (let i = 0; i < closes.length; i += 1) {
    if (i < requiredBars) {
      out.push(null);
      continue;
    }
    const start = i - lookback + 1;
    const window = detrended.slice(start, i + 1);
    const crossings = countLineCyclePeriodZeroCrossings(window);
    if (crossings <= 0) {
      out.push(maxPeriod);
      continue;
    }
    let period = (2 * lookback) / crossings;
    if (period < minPeriod) period = minPeriod;
    if (period > maxPeriod) period = maxPeriod;
    out.push(period);
  }
  return out;
}

/** Classify a cycle period reading. */
export function classifyLineCyclePeriodZone(
  value: number | null,
  shortBand: number,
  longBand: number,
): ChartLineCyclePeriodZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value < shortBand) return 'short';
  if (value > longBand) return 'long';
  return 'mid';
}

/** Run the full cycle period pipeline. */
export function runLineCyclePeriod(
  data: readonly ChartLineCyclePeriodPoint[] | null | undefined,
  options: ChartLineCyclePeriodOptions & {
    shortBand?: number;
    longBand?: number;
  } = {},
): ChartLineCyclePeriodRun {
  const series = getLineCyclePeriodFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const lookback = normalizeLineCyclePeriodLength(
    options.lookback,
    DEFAULT_CHART_LINE_CYCLE_PERIOD_LOOKBACK,
  );
  const smoothLength = normalizeLineCyclePeriodLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_CYCLE_PERIOD_SMOOTH_LENGTH,
  );
  const minPeriod = normalizeLineCyclePeriodLength(
    options.minPeriod,
    DEFAULT_CHART_LINE_CYCLE_PERIOD_MIN_PERIOD,
  );
  const maxPeriod = Math.max(
    minPeriod + 1,
    normalizeLineCyclePeriodLength(
      options.maxPeriod,
      DEFAULT_CHART_LINE_CYCLE_PERIOD_MAX_PERIOD,
    ),
  );
  const shortBand = isFiniteNumber(options.shortBand)
    ? options.shortBand
    : DEFAULT_CHART_LINE_CYCLE_PERIOD_SHORT_BAND;
  const longBand = isFiniteNumber(options.longBand)
    ? options.longBand
    : DEFAULT_CHART_LINE_CYCLE_PERIOD_LONG_BAND;
  const closes = series.map((p) => p.close);
  const period = computeLineCyclePeriod(closes, {
    lookback,
    smoothLength,
    minPeriod,
    maxPeriod,
  });
  const samples: ChartLineCyclePeriodSample[] = series.map((point, index) => {
    const value = period[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      period: value,
      zone: classifyLineCyclePeriodZone(value, shortBand, longBand),
    };
  });
  let shortCount = 0;
  let midCount = 0;
  let longCount = 0;
  let noneCount = 0;
  let periodFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'short') shortCount += 1;
    else if (sample.zone === 'mid') midCount += 1;
    else if (sample.zone === 'long') longCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.period)) periodFinal = sample.period;
  }
  return {
    series,
    lookback,
    smoothLength,
    minPeriod,
    maxPeriod,
    shortBand,
    longBand,
    period,
    samples,
    periodFinal,
    shortCount,
    midCount,
    longCount,
    noneCount,
    ok: series.length >= lookback + smoothLength,
  };
}

export interface ChartLineCyclePeriodLayoutOptions
  extends ChartLineCyclePeriodOptions {
  data: readonly ChartLineCyclePeriodPoint[] | null | undefined;
  shortBand?: number;
  longBand?: number;
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
export function computeLineCyclePeriodLayout(
  options: ChartLineCyclePeriodLayoutOptions,
): ChartLineCyclePeriodLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CYCLE_PERIOD_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CYCLE_PERIOD_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CYCLE_PERIOD_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_CYCLE_PERIOD_PANEL_GAP;

  const run = runLineCyclePeriod(options.data, {
    ...(options.lookback !== undefined ? { lookback: options.lookback } : {}),
    ...(options.smoothLength !== undefined
      ? { smoothLength: options.smoothLength }
      : {}),
    ...(options.minPeriod !== undefined ? { minPeriod: options.minPeriod } : {}),
    ...(options.maxPeriod !== undefined ? { maxPeriod: options.maxPeriod } : {}),
    ...(options.shortBand !== undefined ? { shortBand: options.shortBand } : {}),
    ...(options.longBand !== undefined ? { longBand: options.longBand } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const periodHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const periodTop = priceBottom + panelGap;
  const periodBottom = periodTop + periodHeight;

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

  // Period panel always spans [minPeriod, maxPeriod].
  const periodMin = run.minPeriod;
  const periodMax = run.maxPeriod;
  const periodY = (value: number): number =>
    periodBottom -
    ((value - periodMin) / (periodMax - periodMin)) * periodHeight;
  const shortBandY = periodY(run.shortBand);
  const longBandY = periodY(run.longBand);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineCyclePeriodDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const periodLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineCyclePeriodMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.period)) return;
    const cx = xAt(index);
    const yc = periodY(sample.period);
    periodLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      period: sample.period,
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
    periodTop,
    periodBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    periodPath: buildLinePath(periodLinePoints),
    markers,
    priceMin,
    priceMax,
    periodMin,
    periodMax,
    shortBandY,
    longBandY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineCyclePeriodChart(
  data: readonly ChartLineCyclePeriodPoint[] | null | undefined,
  options: ChartLineCyclePeriodOptions & {
    shortBand?: number;
    longBand?: number;
  } = {},
): string {
  const run = runLineCyclePeriod(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.periodFinal === null ? 'n/a' : run.periodFinal.toFixed(4);
  return (
    `Dual-panel chart with a Cycle Period oscillator panel ` +
    `beneath the close (lookback ${run.lookback}, smooth ` +
    `${run.smoothLength}, range [${run.minPeriod}, ` +
    `${run.maxPeriod}]). The period is derived from the dominant ` +
    `oscillation frequency of the close, measured by counting ` +
    `zero crossings of the detrended close (close minus its ` +
    `simple moving average) over the lookback window: period = ` +
    `2 * lookback / crossings, clamped to the period range. ` +
    `Across ${total} bars the cycle period is short on ` +
    `${run.shortCount}, mid on ${run.midCount}, long on ` +
    `${run.longCount}, and undefined on ${run.noneCount}. The ` +
    `final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatPeriod(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineCyclePeriodZone,
  shortColor: string,
  midColor: string,
  longColor: string,
  noneColor: string,
): string {
  if (zone === 'short') return shortColor;
  if (zone === 'mid') return midColor;
  if (zone === 'long') return longColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineCyclePeriodZone): string {
  if (zone === 'short') return 'Short';
  if (zone === 'mid') return 'Mid';
  if (zone === 'long') return 'Long';
  return 'n/a';
}

/**
 * ChartLineCyclePeriod -- dual-panel pure-SVG Cycle Period
 * chart.
 */
export const ChartLineCyclePeriod = forwardRef<
  HTMLDivElement,
  ChartLineCyclePeriodProps
>(function ChartLineCyclePeriod(props, ref) {
  const {
    data,
    lookback = DEFAULT_CHART_LINE_CYCLE_PERIOD_LOOKBACK,
    smoothLength = DEFAULT_CHART_LINE_CYCLE_PERIOD_SMOOTH_LENGTH,
    minPeriod = DEFAULT_CHART_LINE_CYCLE_PERIOD_MIN_PERIOD,
    maxPeriod = DEFAULT_CHART_LINE_CYCLE_PERIOD_MAX_PERIOD,
    shortBand = DEFAULT_CHART_LINE_CYCLE_PERIOD_SHORT_BAND,
    longBand = DEFAULT_CHART_LINE_CYCLE_PERIOD_LONG_BAND,
    width = DEFAULT_CHART_LINE_CYCLE_PERIOD_WIDTH,
    height = DEFAULT_CHART_LINE_CYCLE_PERIOD_HEIGHT,
    padding = DEFAULT_CHART_LINE_CYCLE_PERIOD_PADDING,
    panelGap = DEFAULT_CHART_LINE_CYCLE_PERIOD_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CYCLE_PERIOD_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CYCLE_PERIOD_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CYCLE_PERIOD_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CYCLE_PERIOD_PRICE_COLOR,
    periodColor = DEFAULT_CHART_LINE_CYCLE_PERIOD_PERIOD_COLOR,
    shortColor = DEFAULT_CHART_LINE_CYCLE_PERIOD_SHORT_COLOR,
    midColor = DEFAULT_CHART_LINE_CYCLE_PERIOD_MID_COLOR,
    longColor = DEFAULT_CHART_LINE_CYCLE_PERIOD_LONG_COLOR,
    noneColor = DEFAULT_CHART_LINE_CYCLE_PERIOD_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_CYCLE_PERIOD_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CYCLE_PERIOD_GRID_COLOR,
    bandColor = DEFAULT_CHART_LINE_CYCLE_PERIOD_BAND_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPeriod = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatPeriod = defaultFormatPeriod,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-cycle-period-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineCyclePeriodSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineCyclePeriodSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineCyclePeriodLayout({
        data,
        lookback,
        smoothLength,
        minPeriod,
        maxPeriod,
        shortBand,
        longBand,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      lookback,
      smoothLength,
      minPeriod,
      maxPeriod,
      shortBand,
      longBand,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineCyclePeriodChart(data, {
      lookback,
      smoothLength,
      minPeriod,
      maxPeriod,
      shortBand,
      longBand,
    });
  const resolvedLabel =
    ariaLabel ??
    `Cycle Period chart, lookback ${run.lookback}, range [${run.minPeriod}, ${run.maxPeriod}]`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineCyclePeriodSeriesId): void => {
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
        data-section="chart-line-cycle-period-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={88}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-cycle-period-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-cycle-period-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-cycle-period-tooltip-period"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Period: ${
            hoverSample.period === null
              ? 'n/a'
              : formatPeriod(hoverSample.period)
          }`}
        </text>
        <text
          data-section="chart-line-cycle-period-tooltip-zone"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const periodHidden = isHidden('period') || !showPeriod;

  const legendItems: Array<{
    id: ChartLineCyclePeriodSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'period', label: 'Cycle Period', color: periodColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-cycle-period"
      data-empty={isEmpty ? 'true' : 'false'}
      data-lookback={run.lookback}
      data-smooth-length={run.smoothLength}
      data-min-period={run.minPeriod}
      data-max-period={run.maxPeriod}
      data-period-final={
        run.periodFinal === null ? '' : run.periodFinal
      }
      data-short-count={run.shortCount}
      data-mid-count={run.midCount}
      data-long-count={run.longCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-cycle-period-aria-desc"
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
          data-section="chart-line-cycle-period-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-cycle-period-empty"
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
          data-section="chart-line-cycle-period-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-cycle-period-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yc =
                  layout.periodBottom -
                  t * (layout.periodBottom - layout.periodTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-cycle-period-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-cycle-period-grid-line"
                      data-panel="period"
                      x1={layout.innerLeft}
                      y1={yc}
                      x2={layout.innerRight}
                      y2={yc}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-cycle-period-axes">
              <line
                data-section="chart-line-cycle-period-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cycle-period-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cycle-period-axis"
                data-panel="period"
                x1={layout.innerLeft}
                y1={layout.periodTop}
                x2={layout.innerLeft}
                y2={layout.periodBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cycle-period-axis"
                data-panel="period"
                x1={layout.innerLeft}
                y1={layout.periodBottom}
                x2={layout.innerRight}
                y2={layout.periodBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-cycle-period-tick-label"
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
                data-section="chart-line-cycle-period-tick-label"
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
                data-section="chart-line-cycle-period-tick-label"
                data-panel="period"
                x={layout.innerLeft - 6}
                y={layout.periodTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPeriod(layout.periodMax)}
              </text>
              <text
                data-section="chart-line-cycle-period-tick-label"
                data-panel="period"
                x={layout.innerLeft - 6}
                y={layout.periodBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPeriod(layout.periodMin)}
              </text>
            </g>
          ) : null}

          {showBands ? (
            <g data-section="chart-line-cycle-period-bands">
              <line
                data-section="chart-line-cycle-period-short-band"
                x1={layout.innerLeft}
                y1={layout.shortBandY}
                x2={layout.innerRight}
                y2={layout.shortBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-cycle-period-long-band"
                x1={layout.innerLeft}
                y1={layout.longBandY}
                x2={layout.innerRight}
                y2={layout.longBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-cycle-period-price-path"
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
            <g data-section="chart-line-cycle-period-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-cycle-period-dot"
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

          {!periodHidden ? (
            <path
              data-section="chart-line-cycle-period-line"
              d={layout.periodPath}
              fill="none"
              stroke={periodColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Cycle Period line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-cycle-period-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-cycle-period-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-period={marker.period}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    shortColor,
                    midColor,
                    longColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Period ${formatPeriod(marker.period)}, ${zoneLabelOf(
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
            <g data-section="chart-line-cycle-period-badge">
              <rect
                data-section="chart-line-cycle-period-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={150}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-cycle-period-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Cycle Period ${run.lookback}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-cycle-period-legend"
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
                data-section="chart-line-cycle-period-legend-item"
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
                  data-section="chart-line-cycle-period-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-cycle-period-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-cycle-period-legend-stats"
            style={{ color: axisColor }}
          >
            {`short ${run.shortCount} / mid ${run.midCount} / long ${run.longCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCyclePeriod.displayName = 'ChartLineCyclePeriod';
