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
 * ChartLineRelativeVigor -- pure-SVG two-panel Relative Vigor Index
 * chart (John Ehlers).
 *
 * The RVI compares the smoothed close-minus-open (the "body") with
 * the smoothed high-minus-low (the bar range). Each pass uses a
 * 4-bar symmetric weighted moving average (SWMA, weights 1/2/2/1
 * normalised by 6) before a final SMA over the lookback:
 *
 *   num_raw[i] = close[i] - open[i]
 *   den_raw[i] = high[i]  - low[i]
 *
 *   SWMA(x, i) = (x[i] + 2 * x[i - 1] + 2 * x[i - 2] + x[i - 3]) / 6
 *
 *   num_smooth[i] = SWMA(num_raw, i)
 *   den_smooth[i] = SWMA(den_raw, i)
 *
 *   RVI[i]    = SMA(num_smooth, period) / SMA(den_smooth, period)
 *   Signal[i] = SWMA(RVI, i)
 *
 * Three bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT` (`open == high == low == close == K`) leaves
 *     both numerator and denominator at zero, so the bar is null
 *     (no scale to divide by).
 *   * `CONSTANT_UP` (`open = 10, close = 20, high = 20, low = 10`
 *     at every bar) gives a constant `num_raw = 10` and constant
 *     `den_raw = 10`. The SWMA of a constant `c` is exactly `c`
 *     (integer 1/2/2/1 weights sum to 6 with no rounding loss),
 *     so the SMA pass also returns `10`. `RVI = 10 / 10 = 1`
 *     bit-exact at every defined bar.
 *   * `CONSTANT_DOWN` (`open = 20, close = 10, high = 20, low =
 *     10`) gives `num_raw = -10` and `den_raw = 10`, so `RVI = -1`
 *     bit-exact at every defined bar.
 *
 * The top panel plots the close; the bottom panel plots the RVI in
 * a fixed `[-1, +1]` band with a zero line plus a Signal line.
 */

export interface ChartLineRelativeVigorPoint {
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineRelativeVigorZone =
  | 'strong-up'
  | 'up'
  | 'down'
  | 'strong-down'
  | 'flat'
  | 'none';

export type ChartLineRelativeVigorSeriesId = 'price' | 'rvi' | 'signal';

export interface ChartLineRelativeVigorSample {
  index: number;
  x: number;
  open: number;
  high: number;
  low: number;
  close: number;
  rvi: number | null;
  signal: number | null;
  zone: ChartLineRelativeVigorZone;
}

export interface ChartLineRelativeVigorRun {
  series: ChartLineRelativeVigorPoint[];
  period: number;
  threshold: number;
  rvi: Array<number | null>;
  signal: Array<number | null>;
  samples: ChartLineRelativeVigorSample[];
  rviFinal: number | null;
  signalFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineRelativeVigorMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  rvi: number;
  zone: ChartLineRelativeVigorZone;
}

export interface ChartLineRelativeVigorDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRelativeVigorLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  rviPanelTop: number;
  rviPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineRelativeVigorDot[];
  rviPath: string;
  signalPath: string;
  markers: ChartLineRelativeVigorMarker[];
  zeroY: number;
  upperThresholdY: number;
  lowerThresholdY: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineRelativeVigorRun;
}

export interface ChartLineRelativeVigorProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRelativeVigorPoint[];
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
  rviColor?: string;
  signalColor?: string;
  strongUpColor?: string;
  upColor?: string;
  downColor?: string;
  strongDownColor?: string;
  flatColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRvi?: boolean;
  showSignal?: boolean;
  showThresholdLines?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRelativeVigorSeriesId[];
  defaultHiddenSeries?: ChartLineRelativeVigorSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRelativeVigorSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineRelativeVigorSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_WIDTH = 720;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_HEIGHT = 400;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_PADDING = 44;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_GAP = 12;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_PERIOD = 10;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_THRESHOLD = 0.5;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_RVI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_STRONG_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_UP_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_DOWN_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_STRONG_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RELATIVE_VIGOR_AXIS_COLOR = '#94a3b8';

/** Denominator guard: anything below this is treated as zero. */
export const CHART_LINE_RELATIVE_VIGOR_EPSILON = 1e-12;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineRelativeVigorFinitePoints(
  data: readonly ChartLineRelativeVigorPoint[] | null | undefined,
): ChartLineRelativeVigorPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRelativeVigorPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.open) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      point.high >= point.low
    ) {
      out.push({
        x: point.x,
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 2. */
export function normalizeLineRelativeVigorPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the +/- threshold to a positive finite. */
export function normalizeLineRelativeVigorThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

/**
 * 4-bar symmetric weighted moving average over a nullable series.
 * Weights are `1 / 2 / 2 / 1` normalised by 6. The output at bar `i`
 * is null when `i < 3` or any of the four bars in the window is null.
 */
export function computeLineRelativeVigorSwma(
  values: ReadonlyArray<number | null> | null | undefined,
): Array<number | null> {
  if (!Array.isArray(values)) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < 3) {
      out.push(null);
      continue;
    }
    const a = values[i];
    const b = values[i - 1];
    const c = values[i - 2];
    const d = values[i - 3];
    if (
      !isFiniteNumber(a) ||
      !isFiniteNumber(b) ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(d)
    ) {
      out.push(null);
      continue;
    }
    out.push((a + 2 * b + 2 * c + d) / 6);
  }
  return out;
}

/**
 * Simple moving average of length `period` over a nullable series.
 * The output is null until the window has filled with finite values.
 */
export function computeLineRelativeVigorSma(
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
 * Run the full RVI pipeline. Returns `{ rvi, signal }` arrays the
 * same length as `bars`. A zero smoothed denominator nulls the bar
 * on the RVI track; the signal track is the SWMA of the RVI.
 */
export function computeLineRelativeVigor(
  bars: readonly ChartLineRelativeVigorPoint[] | null | undefined,
  period: unknown,
): {
  rvi: Array<number | null>;
  signal: Array<number | null>;
} {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { rvi: [], signal: [] };
  }
  const p = normalizeLineRelativeVigorPeriod(
    period,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_PERIOD,
  );
  const numRaw: Array<number | null> = [];
  const denRaw: Array<number | null> = [];
  for (const bar of bars) {
    if (
      !isFiniteNumber(bar.open) ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low) ||
      !isFiniteNumber(bar.close)
    ) {
      numRaw.push(null);
      denRaw.push(null);
      continue;
    }
    numRaw.push(bar.close - bar.open);
    denRaw.push(bar.high - bar.low);
  }
  const numSwma = computeLineRelativeVigorSwma(numRaw);
  const denSwma = computeLineRelativeVigorSwma(denRaw);
  const numSma = computeLineRelativeVigorSma(numSwma, p);
  const denSma = computeLineRelativeVigorSma(denSwma, p);
  const rvi: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const n = numSma[i];
    const d = denSma[i];
    if (
      !isFiniteNumber(n) ||
      !isFiniteNumber(d) ||
      Math.abs(d) < CHART_LINE_RELATIVE_VIGOR_EPSILON
    ) {
      rvi.push(null);
      continue;
    }
    rvi.push(n / d);
  }
  const signal = computeLineRelativeVigorSwma(rvi);
  return { rvi, signal };
}

/** Classify an RVI reading against the threshold ladder. */
export function classifyLineRelativeVigorZone(
  value: number | null,
  threshold: number,
): ChartLineRelativeVigorZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'strong-up';
  if (value > 0) return 'up';
  if (value <= -threshold) return 'strong-down';
  if (value < 0) return 'down';
  return 'flat';
}

export interface ChartLineRelativeVigorOptions {
  period?: number;
  threshold?: number;
}

/** Run the full RVI pipeline plus sample classification. */
export function runLineRelativeVigor(
  data: readonly ChartLineRelativeVigorPoint[] | null | undefined,
  options: ChartLineRelativeVigorOptions = {},
): ChartLineRelativeVigorRun {
  const series = getLineRelativeVigorFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineRelativeVigorPeriod(
    options.period,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_PERIOD,
  );
  const threshold = normalizeLineRelativeVigorThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_RELATIVE_VIGOR_THRESHOLD,
  );
  const { rvi, signal } = computeLineRelativeVigor(series, period);
  const samples: ChartLineRelativeVigorSample[] = series.map((point, index) => {
    const value = rvi[index] ?? null;
    return {
      index,
      x: point.x,
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      rvi: value,
      signal: signal[index] ?? null,
      zone: classifyLineRelativeVigorZone(value, threshold),
    };
  });
  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let rviFinal: number | null = null;
  let signalFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong-up' || sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'strong-down' || sample.zone === 'down') {
      downCount += 1;
    } else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.rvi)) rviFinal = sample.rvi;
    if (isFiniteNumber(sample.signal)) signalFinal = sample.signal;
  }
  return {
    series = [],
    period,
    threshold,
    rvi,
    signal,
    samples,
    rviFinal,
    signalFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineRelativeVigorLayoutOptions
  extends ChartLineRelativeVigorOptions {
  data: readonly ChartLineRelativeVigorPoint[] | null | undefined;
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
export function computeLineRelativeVigorLayout(
  options: ChartLineRelativeVigorLayoutOptions,
): ChartLineRelativeVigorLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_RELATIVE_VIGOR_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_RELATIVE_VIGOR_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_RELATIVE_VIGOR_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_RELATIVE_VIGOR_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_RELATIVE_VIGOR_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineRelativeVigor(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.threshold !== undefined
      ? { threshold: options.threshold }
      : {}),
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
  const rviPanelTop = pricePanelBottom + gap;
  const rviPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    rviPanelBottom - rviPanelTop > 0;
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

  const rviMin = -1.1;
  const rviMax = 1.1;
  const rviPanelHeight = rviPanelBottom - rviPanelTop;
  const rviYAt = (value: number): number =>
    rviPanelBottom - ((value - rviMin) / (rviMax - rviMin)) * rviPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineRelativeVigorDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const rviLinePoints: Array<{ x: number; y: number }> = [];
  const signalLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineRelativeVigorMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (isFiniteNumber(sample.rvi)) {
      const cy = rviYAt(sample.rvi);
      rviLinePoints.push({ x: cx, y: cy });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy,
        rvi: sample.rvi,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.signal)) {
      signalLinePoints.push({ x: cx, y: rviYAt(sample.signal) });
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
    rviPanelTop,
    rviPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    rviPath: buildLinePath(rviLinePoints),
    signalPath: buildLinePath(signalLinePoints),
    markers,
    zeroY: rviYAt(0),
    upperThresholdY: rviYAt(run.threshold),
    lowerThresholdY: rviYAt(-run.threshold),
    priceMin,
    priceMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineRelativeVigorChart(
  data: readonly ChartLineRelativeVigorPoint[] | null | undefined,
  options: ChartLineRelativeVigorOptions = {},
): string {
  const run = runLineRelativeVigor(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.rviFinal === null ? 'n/a' : run.rviFinal.toFixed(4);
  return (
    `Two-panel chart with a John Ehlers Relative Vigor Index panel ` +
    `(period ${run.period}, threshold +/- ${run.threshold}): the ` +
    `top panel plots the close, the bottom panel plots the RVI and ` +
    `its 4-bar SWMA signal line. The RVI is the ratio of the ` +
    `smoothed close-minus-open to the smoothed high-minus-low, ` +
    `where the smoothing pass is a 1 / 2 / 2 / 1 weighted average ` +
    `divided by 6. A constant up bar (close - open = high - low = ` +
    `c) collapses both passes to the constant, so the RVI is ` +
    `exactly +1 (and exactly -1 on a constant down bar). Across ` +
    `${total} bars the RVI reads up on ${run.upCount}, down on ` +
    `${run.downCount}, and flat on ${run.flatCount}. The final ` +
    `reading is ${finalText}.`
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
  zone: ChartLineRelativeVigorZone,
  strongUpColor: string,
  upColor: string,
  downColor: string,
  strongDownColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'strong-up') return strongUpColor;
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  if (zone === 'strong-down') return strongDownColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineRelativeVigorZone): string {
  if (zone === 'strong-up') return 'Strong up';
  if (zone === 'up') return 'Up';
  if (zone === 'down') return 'Down';
  if (zone === 'strong-down') return 'Strong down';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineRelativeVigor -- two-panel pure-SVG Ehlers Relative
 * Vigor Index chart.
 */
export const ChartLineRelativeVigor = forwardRef<
  HTMLDivElement,
  ChartLineRelativeVigorProps
>(function ChartLineRelativeVigor(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_RELATIVE_VIGOR_PERIOD,
    threshold = DEFAULT_CHART_LINE_RELATIVE_VIGOR_THRESHOLD,
    width = DEFAULT_CHART_LINE_RELATIVE_VIGOR_WIDTH,
    height = DEFAULT_CHART_LINE_RELATIVE_VIGOR_HEIGHT,
    padding = DEFAULT_CHART_LINE_RELATIVE_VIGOR_PADDING,
    gap = DEFAULT_CHART_LINE_RELATIVE_VIGOR_GAP,
    tickCount = DEFAULT_CHART_LINE_RELATIVE_VIGOR_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_RELATIVE_VIGOR_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_RELATIVE_VIGOR_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RELATIVE_VIGOR_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_PRICE_COLOR,
    rviColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_RVI_COLOR,
    signalColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_SIGNAL_COLOR,
    strongUpColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_STRONG_UP_COLOR,
    upColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_DOWN_COLOR,
    strongDownColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_STRONG_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_RELATIVE_VIGOR_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRvi = true,
    showSignal = true,
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
  const baseId = `chart-line-relative-vigor-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineRelativeVigorSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineRelativeVigorSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineRelativeVigorLayout({
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
    ariaDescription ??
    describeLineRelativeVigorChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `Relative Vigor Index chart, period ${run.period}, threshold +/- ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineRelativeVigorSeriesId): void => {
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
    tooltip = (
      <g
        data-section="chart-line-relative-vigor-tooltip"
        pointerEvents="none"
      >
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
          data-section="chart-line-relative-vigor-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-relative-vigor-tooltip-oc"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`O/C: ${formatValue(hoverSample.open)} / ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-relative-vigor-tooltip-hl"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatValue(hoverSample.high)} / ${formatValue(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-relative-vigor-tooltip-rvi"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`RVI: ${
            hoverSample.rvi === null ? 'n/a' : hoverSample.rvi.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-relative-vigor-tooltip-signal"
          x={tx + 10}
          y={ty + 83}
          fill="#fcd34d"
          fontSize={11}
        >
          {`Signal: ${
            hoverSample.signal === null ? 'n/a' : hoverSample.signal.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-relative-vigor-tooltip-zone"
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
  const rviHidden = isHidden('rvi') || !showRvi;
  const signalHidden = isHidden('signal') || !showSignal;

  const legendItems: Array<{
    id: ChartLineRelativeVigorSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'rvi', label: 'RVI', color: rviColor },
    { id: 'signal', label: 'Signal', color: signalColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-relative-vigor"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-rvi-final={run.rviFinal === null ? '' : run.rviFinal}
      data-signal-final={run.signalFinal === null ? '' : run.signalFinal}
      data-up-count={run.upCount}
      data-down-count={run.downCount}
      data-flat-count={run.flatCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-relative-vigor-aria-desc"
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
          data-section="chart-line-relative-vigor-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-relative-vigor-empty"
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
          data-section="chart-line-relative-vigor-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-relative-vigor-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-relative-vigor-grid-line"
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
                  layout.rviPanelBottom -
                  t * (layout.rviPanelBottom - layout.rviPanelTop);
                return (
                  <line
                    key={`rg-${i}`}
                    data-section="chart-line-relative-vigor-grid-line"
                    data-panel="rvi"
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
            <g data-section="chart-line-relative-vigor-axes">
              <line
                data-section="chart-line-relative-vigor-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-relative-vigor-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-relative-vigor-axis"
                data-panel="rvi"
                x1={layout.innerLeft}
                y1={layout.rviPanelTop}
                x2={layout.innerLeft}
                y2={layout.rviPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-relative-vigor-axis"
                data-panel="rvi"
                x1={layout.innerLeft}
                y1={layout.rviPanelBottom}
                x2={layout.innerRight}
                y2={layout.rviPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-relative-vigor-panel-label"
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
            data-section="chart-line-relative-vigor-panel-label"
            data-panel="rvi"
            x={layout.innerRight}
            y={layout.rviPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            RVI
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-relative-vigor-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-relative-vigor-threshold-lines">
              <line
                data-section="chart-line-relative-vigor-threshold-line"
                data-direction="upper"
                x1={layout.innerLeft}
                y1={layout.upperThresholdY}
                x2={layout.innerRight}
                y2={layout.upperThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-relative-vigor-threshold-line"
                data-direction="lower"
                x1={layout.innerLeft}
                y1={layout.lowerThresholdY}
                x2={layout.innerRight}
                y2={layout.lowerThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-relative-vigor-price-path"
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
            <g data-section="chart-line-relative-vigor-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-relative-vigor-dot"
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

          {!rviHidden ? (
            <path
              data-section="chart-line-relative-vigor-rvi-line"
              d={layout.rviPath}
              fill="none"
              stroke={rviColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`RVI line, ${layout.markers.length} points`}
            />
          ) : null}

          {!signalHidden ? (
            <path
              data-section="chart-line-relative-vigor-signal-line"
              d={layout.signalPath}
              fill="none"
              stroke={signalColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 2"
            />
          ) : null}

          {!rviHidden && showMarkers ? (
            <g data-section="chart-line-relative-vigor-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-relative-vigor-marker"
                  data-zone={marker.zone}
                  data-rvi={marker.rvi}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongUpColor,
                    upColor,
                    downColor,
                    strongDownColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, RVI ${formatValue(
                    marker.rvi,
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
            <g data-section="chart-line-relative-vigor-badge">
              <rect
                data-section="chart-line-relative-vigor-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-relative-vigor-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`RVI ${run.period} +/- ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-relative-vigor-legend"
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
                data-section="chart-line-relative-vigor-legend-item"
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
                  data-section="chart-line-relative-vigor-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-relative-vigor-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-relative-vigor-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineRelativeVigor.displayName = 'ChartLineRelativeVigor';
