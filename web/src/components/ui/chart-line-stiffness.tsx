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
 * ChartLineStiffness -- pure-SVG two-panel Katsanos Stiffness chart.
 *
 * Markos Katsanos's Stiffness reads how "stiff" the price has been: at
 * each bar it draws a lower volatility band `sma - factor * stdev`,
 * checks whether the close sits above that band, and counts -- over the
 * same `period` window -- how many of the recent bars passed that test,
 * scaled to a 0..100 percentage:
 *
 *   sma       = average of the last `period` closes
 *   stdev     = standard deviation of those closes
 *   lowerBand = sma - factor * stdev
 *   aboveFlag = (close > lowerBand) ? 1 : 0
 *   stiffness = 100 * sum(aboveFlag, period) / period
 *
 * A long run of bars holding above the band reads near 100 (a "stiff",
 * strong trend); a price that drifts down through the band reads near 0
 * (a "loose", weak phase). The raw count is then passed through an EMA
 * of `smoothPeriod` bars to soften the step changes. Two thresholds --
 * a high one (default 90) and a low one (default 50) -- partition the
 * panel into `stiff` / `mid` / `loose` zones for the per-bar markers.
 *
 * The top panel plots the close; the bottom panel plots the stiffness
 * inside a fixed 0..100 band, with horizontal reference lines at the
 * two thresholds.
 */

export interface ChartLineStiffnessPoint {
  x: number;
  value: number;
}

export type ChartLineStiffnessZone = 'stiff' | 'mid' | 'loose' | 'none';

export type ChartLineStiffnessSeriesId = 'price' | 'stiffness';

export interface ChartLineStiffnessComputed {
  sma: (number | null)[];
  stdev: (number | null)[];
  lowerBand: (number | null)[];
  aboveFlag: (0 | 1 | null)[];
  rawStiffness: (number | null)[];
  stiffness: (number | null)[];
}

export interface ChartLineStiffnessSample {
  index: number;
  x: number;
  value: number;
  sma: number | null;
  lowerBand: number | null;
  rawStiffness: number | null;
  stiffness: number | null;
  zone: ChartLineStiffnessZone;
}

export interface ChartLineStiffnessRun {
  series: ChartLineStiffnessPoint[];
  period: number;
  factor: number;
  smoothPeriod: number;
  highThreshold: number;
  lowThreshold: number;
  sma: (number | null)[];
  stdev: (number | null)[];
  lowerBand: (number | null)[];
  aboveFlag: (0 | 1 | null)[];
  rawStiffness: (number | null)[];
  stiffness: (number | null)[];
  samples: ChartLineStiffnessSample[];
  stiffnessFinal: number | null;
  stiffCount: number;
  midCount: number;
  looseCount: number;
  ok: boolean;
}

export interface ChartLineStiffnessMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  stiffness: number;
  zone: ChartLineStiffnessZone;
}

export interface ChartLineStiffnessDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineStiffnessLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  stiffPanelTop: number;
  stiffPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineStiffnessDot[];
  stiffnessPath: string;
  markers: ChartLineStiffnessMarker[];
  midY: number;
  highY: number;
  priceMin: number;
  priceMax: number;
  stiffMin: number;
  stiffMax: number;
  run: ChartLineStiffnessRun;
}

export interface ChartLineStiffnessProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStiffnessPoint[];
  period?: number;
  factor?: number;
  smoothPeriod?: number;
  highThreshold?: number;
  lowThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  stiffnessColor?: string;
  stiffColor?: string;
  midColor?: string;
  looseColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStiffness?: boolean;
  showThresholds?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStiffnessSeriesId[];
  defaultHiddenSeries?: ChartLineStiffnessSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStiffnessSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineStiffnessSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STIFFNESS_WIDTH = 720;
export const DEFAULT_CHART_LINE_STIFFNESS_HEIGHT = 400;
export const DEFAULT_CHART_LINE_STIFFNESS_PADDING = 44;
export const DEFAULT_CHART_LINE_STIFFNESS_GAP = 12;
export const DEFAULT_CHART_LINE_STIFFNESS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STIFFNESS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STIFFNESS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STIFFNESS_PERIOD = 100;
export const DEFAULT_CHART_LINE_STIFFNESS_FACTOR = 0.2;
export const DEFAULT_CHART_LINE_STIFFNESS_SMOOTH_PERIOD = 3;
export const DEFAULT_CHART_LINE_STIFFNESS_HIGH_THRESHOLD = 90;
export const DEFAULT_CHART_LINE_STIFFNESS_LOW_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_STIFFNESS_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_STIFFNESS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STIFFNESS_STIFFNESS_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STIFFNESS_STIFF_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STIFFNESS_MID_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_STIFFNESS_LOOSE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STIFFNESS_THRESHOLD_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STIFFNESS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STIFFNESS_AXIS_COLOR = '#94a3b8';

/** The stiffness is bounded to 0..100; the panel pads past it. */
export const CHART_LINE_STIFFNESS_BOUND = 100;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineStiffnessFinitePoints(
  data: readonly ChartLineStiffnessPoint[] | null | undefined,
): ChartLineStiffnessPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStiffnessPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer of at least 1, else fallback. */
export function normalizeLineStiffnessPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Coerce the stdev factor to a finite positive number, else fallback. */
export function normalizeLineStiffnessFactor(
  factor: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(factor) && factor > 0) return factor;
  return fallback;
}

/** Coerce a threshold to a finite number inside 0..100, else fallback. */
export function normalizeLineStiffnessThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** The simple moving average over the window, null in the warm-up. */
export function computeLineStiffnessSma(
  values: readonly number[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineStiffnessPeriod(
    period,
    DEFAULT_CHART_LINE_STIFFNESS_PERIOD,
  );
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < p - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < p; j += 1) {
      const v = values[i - j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / p : null);
  }
  return out;
}

/** The population standard deviation over the window, null in the warm-up. */
export function computeLineStiffnessStdev(
  values: readonly number[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineStiffnessPeriod(
    period,
    DEFAULT_CHART_LINE_STIFFNESS_PERIOD,
  );
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < p - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < p; j += 1) {
      const v = values[i - j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const mean = sum / p;
    let sq = 0;
    for (let j = 0; j < p; j += 1) {
      const d = (values[i - j] as number) - mean;
      sq += d * d;
    }
    out.push(Math.sqrt(sq / p));
  }
  return out;
}

/**
 * Classify a bar by the stiffness against the two thresholds:
 * **stiff** at or above the high threshold, **loose** below the low,
 * **mid** in between, **none** for null.
 */
export function classifyLineStiffnessZone(
  stiffness: number | null,
  highThreshold: number,
  lowThreshold: number,
): ChartLineStiffnessZone {
  if (!isFiniteNumber(stiffness)) return 'none';
  if (stiffness >= highThreshold) return 'stiff';
  if (stiffness < lowThreshold) return 'loose';
  return 'mid';
}

/**
 * An exponential moving average over a series that may carry leading
 * nulls. Leading nulls pass through; the average seeds from the first
 * finite value with `alpha = 2 / (period + 1)`.
 */
function smoothStiffness(
  values: readonly (number | null)[],
  period: number,
): (number | null)[] {
  const alpha = 2 / (period + 1);
  const out: (number | null)[] = [];
  let ema: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      out.push(ema);
      continue;
    }
    ema = ema === null ? v : ema + alpha * (v - ema);
    out.push(ema);
  }
  return out;
}

export interface ChartLineStiffnessOptions {
  period?: number;
  factor?: number;
  smoothPeriod?: number;
  highThreshold?: number;
  lowThreshold?: number;
}

/**
 * Compute the full Katsanos Stiffness pipeline: the long moving
 * average, its standard deviation, the lower volatility band, the
 * per-bar above-band flag, the rolling count scaled to 0..100, and the
 * smoothed stiffness line.
 */
export function computeLineStiffness(
  values: readonly number[] | null | undefined,
  options: ChartLineStiffnessOptions = {},
): ChartLineStiffnessComputed {
  if (!Array.isArray(values)) {
    return {
      sma: [],
      stdev: [],
      lowerBand: [],
      aboveFlag: [],
      rawStiffness: [],
      stiffness: [],
    };
  }
  const period = normalizeLineStiffnessPeriod(
    options.period,
    DEFAULT_CHART_LINE_STIFFNESS_PERIOD,
  );
  const factor = normalizeLineStiffnessFactor(
    options.factor,
    DEFAULT_CHART_LINE_STIFFNESS_FACTOR,
  );
  const smoothPeriod = normalizeLineStiffnessPeriod(
    options.smoothPeriod,
    DEFAULT_CHART_LINE_STIFFNESS_SMOOTH_PERIOD,
  );
  const sma = computeLineStiffnessSma(values, period);
  const stdev = computeLineStiffnessStdev(values, period);
  const lowerBand: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const s = sma[i];
    const sd = stdev[i];
    lowerBand.push(
      isFiniteNumber(s) && isFiniteNumber(sd) ? s - factor * sd : null,
    );
  }
  const aboveFlag: (0 | 1 | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    const band = lowerBand[i];
    if (!isFiniteNumber(v) || !isFiniteNumber(band)) {
      aboveFlag.push(null);
      continue;
    }
    aboveFlag.push(v > band ? 1 : 0);
  }
  const rawStiffness: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1 + (period - 1)) {
      rawStiffness.push(null);
      continue;
    }
    let count = 0;
    let ok = true;
    for (let j = 0; j < period; j += 1) {
      const f = aboveFlag[i - j];
      if (f === null || f === undefined) {
        ok = false;
        break;
      }
      count += f;
    }
    rawStiffness.push(ok ? (100 * count) / period : null);
  }
  const stiffness = smoothStiffness(rawStiffness, smoothPeriod);
  return { sma, stdev, lowerBand, aboveFlag, rawStiffness, stiffness };
}

/** Run the full Stiffness pipeline over a set of points. */
export function runLineStiffness(
  data: readonly ChartLineStiffnessPoint[] | null | undefined,
  options: ChartLineStiffnessOptions = {},
): ChartLineStiffnessRun {
  const series = getLineStiffnessFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineStiffnessPeriod(
    options.period,
    DEFAULT_CHART_LINE_STIFFNESS_PERIOD,
  );
  const factor = normalizeLineStiffnessFactor(
    options.factor,
    DEFAULT_CHART_LINE_STIFFNESS_FACTOR,
  );
  const smoothPeriod = normalizeLineStiffnessPeriod(
    options.smoothPeriod,
    DEFAULT_CHART_LINE_STIFFNESS_SMOOTH_PERIOD,
  );
  const highThreshold = normalizeLineStiffnessThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_STIFFNESS_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineStiffnessThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_STIFFNESS_LOW_THRESHOLD,
  );
  const values = series.map((p) => p.value);
  const { sma, stdev, lowerBand, aboveFlag, rawStiffness, stiffness } =
    computeLineStiffness(values, { period, factor, smoothPeriod });

  const samples: ChartLineStiffnessSample[] = series.map((point, index) => {
    const stiffnessValue = stiffness[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      sma: sma[index] ?? null,
      lowerBand: lowerBand[index] ?? null,
      rawStiffness: rawStiffness[index] ?? null,
      stiffness: stiffnessValue,
      zone: classifyLineStiffnessZone(
        stiffnessValue,
        highThreshold,
        lowThreshold,
      ),
    };
  });

  let stiffCount = 0;
  let midCount = 0;
  let looseCount = 0;
  let stiffnessFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'stiff') stiffCount += 1;
    else if (sample.zone === 'mid') midCount += 1;
    else if (sample.zone === 'loose') looseCount += 1;
    if (isFiniteNumber(sample.stiffness)) stiffnessFinal = sample.stiffness;
  }

  return {
    series,
    period,
    factor,
    smoothPeriod,
    highThreshold,
    lowThreshold,
    sma,
    stdev,
    lowerBand,
    aboveFlag,
    rawStiffness,
    stiffness,
    samples,
    stiffnessFinal,
    stiffCount,
    midCount,
    looseCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineStiffnessLayoutOptions
  extends ChartLineStiffnessOptions {
  data: readonly ChartLineStiffnessPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
}

function buildLinePath(points: ReadonlyArray<{ x: number; y: number }>): string {
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
export function computeLineStiffnessLayout(
  options: ChartLineStiffnessLayoutOptions,
): ChartLineStiffnessLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_STIFFNESS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_STIFFNESS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_STIFFNESS_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_STIFFNESS_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_STIFFNESS_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineStiffness(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.factor !== undefined ? { factor: options.factor } : {}),
    ...(options.smoothPeriod !== undefined
      ? { smoothPeriod: options.smoothPeriod }
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
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const stiffPanelTop = pricePanelBottom + gap;
  const stiffPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    stiffPanelBottom - stiffPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const point of run.series) {
    if (point.value < priceMin) priceMin = point.value;
    if (point.value > priceMax) priceMax = point.value;
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

  const stiffMin = -5;
  const stiffMax = CHART_LINE_STIFFNESS_BOUND + 5;
  const stiffPanelHeight = stiffPanelBottom - stiffPanelTop;
  const stiffYAt = (value: number): number =>
    stiffPanelBottom -
    ((value - stiffMin) / (stiffMax - stiffMin)) * stiffPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineStiffnessDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const stiffnessLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineStiffnessMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.stiffness)) return;
    const cx = xAt(index);
    const cy = stiffYAt(sample.stiffness);
    stiffnessLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      stiffness: sample.stiffness,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    stiffPanelTop,
    stiffPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    stiffnessPath: buildLinePath(stiffnessLinePoints),
    markers,
    midY: stiffYAt(run.lowThreshold),
    highY: stiffYAt(run.highThreshold),
    priceMin,
    priceMax,
    stiffMin,
    stiffMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineStiffnessChart(
  data: readonly ChartLineStiffnessPoint[] | null | undefined,
  options: ChartLineStiffnessOptions = {},
): string {
  const run = runLineStiffness(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.stiffnessFinal === null ? 'n/a' : run.stiffnessFinal.toFixed(2);
  return (
    `Two-panel chart with the Katsanos Stiffness indicator (period ` +
    `${run.period}, factor ${run.factor}): the top panel plots the ` +
    `close, the bottom panel plots the stiffness. The Stiffness draws a ` +
    `lower volatility band ` +
    `sma - factor * stdev and counts the bars whose close sat above that ` +
    `band across the lookback, scaled to a 0..100 percentage. A long run ` +
    `of bars holding above the band reads near 100 (a stiff, strong ` +
    `trend); a price that drifts below the band reads near 0. Across ` +
    `${total} bars the indicator is stiff on ${run.stiffCount}, mid on ` +
    `${run.midCount} and loose on ${run.looseCount}. The final ` +
    `stiffness reading is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineStiffnessZone,
  stiffColor: string,
  midColor: string,
  looseColor: string,
): string {
  if (zone === 'stiff') return stiffColor;
  if (zone === 'loose') return looseColor;
  return midColor;
}

function zoneLabelOf(zone: ChartLineStiffnessZone): string {
  if (zone === 'stiff') return 'Stiff';
  if (zone === 'mid') return 'Mid';
  if (zone === 'loose') return 'Loose';
  return 'n/a';
}

/**
 * ChartLineStiffness -- two-panel pure-SVG Katsanos Stiffness chart.
 */
export const ChartLineStiffness = forwardRef<
  HTMLDivElement,
  ChartLineStiffnessProps
>(function ChartLineStiffness(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_STIFFNESS_PERIOD,
    factor = DEFAULT_CHART_LINE_STIFFNESS_FACTOR,
    smoothPeriod = DEFAULT_CHART_LINE_STIFFNESS_SMOOTH_PERIOD,
    highThreshold = DEFAULT_CHART_LINE_STIFFNESS_HIGH_THRESHOLD,
    lowThreshold = DEFAULT_CHART_LINE_STIFFNESS_LOW_THRESHOLD,
    width = DEFAULT_CHART_LINE_STIFFNESS_WIDTH,
    height = DEFAULT_CHART_LINE_STIFFNESS_HEIGHT,
    padding = DEFAULT_CHART_LINE_STIFFNESS_PADDING,
    gap = DEFAULT_CHART_LINE_STIFFNESS_GAP,
    tickCount = DEFAULT_CHART_LINE_STIFFNESS_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_STIFFNESS_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_STIFFNESS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STIFFNESS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STIFFNESS_PRICE_COLOR,
    stiffnessColor = DEFAULT_CHART_LINE_STIFFNESS_STIFFNESS_COLOR,
    stiffColor = DEFAULT_CHART_LINE_STIFFNESS_STIFF_COLOR,
    midColor = DEFAULT_CHART_LINE_STIFFNESS_MID_COLOR,
    looseColor = DEFAULT_CHART_LINE_STIFFNESS_LOOSE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_STIFFNESS_THRESHOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_STIFFNESS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_STIFFNESS_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStiffness = true,
    showThresholds = true,
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
  const baseId = `chart-line-stiffness-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineStiffnessSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineStiffnessSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineStiffnessLayout({
        data,
        period,
        factor,
        smoothPeriod,
        highThreshold,
        lowThreshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      period,
      factor,
      smoothPeriod,
      highThreshold,
      lowThreshold,
      width,
      height,
      padding,
      gap,
      pricePanelRatio,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineStiffnessChart(data, {
      period,
      factor,
      smoothPeriod,
      highThreshold,
      lowThreshold,
    });
  const resolvedLabel =
    ariaLabel ?? `Katsanos Stiffness chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineStiffnessSeriesId): void => {
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
    const tooltipW = 192;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-stiffness-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={112}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-stiffness-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-stiffness-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-stiffness-tooltip-sma"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`SMA: ${
            hoverSample.sma === null ? 'n/a' : formatValue(hoverSample.sma)
          }`}
        </text>
        <text
          data-section="chart-line-stiffness-tooltip-lower-band"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Lower band: ${
            hoverSample.lowerBand === null
              ? 'n/a'
              : formatValue(hoverSample.lowerBand)
          }`}
        </text>
        <text
          data-section="chart-line-stiffness-tooltip-stiffness"
          x={tx + 10}
          y={ty + 83}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Stiffness: ${
            hoverSample.stiffness === null
              ? 'n/a'
              : formatValue(hoverSample.stiffness)
          }`}
        </text>
        <text
          data-section="chart-line-stiffness-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Trend: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const stiffnessHidden = isHidden('stiffness') || !showStiffness;

  const legendItems: Array<{
    id: ChartLineStiffnessSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'stiffness', label: 'Stiffness', color: stiffnessColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-stiffness"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-factor={run.factor}
      data-smooth-period={run.smoothPeriod}
      data-high-threshold={run.highThreshold}
      data-low-threshold={run.lowThreshold}
      data-stiffness-final={
        run.stiffnessFinal === null ? '' : run.stiffnessFinal
      }
      data-stiff-count={run.stiffCount}
      data-mid-count={run.midCount}
      data-loose-count={run.looseCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-stiffness-aria-desc"
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
          data-section="chart-line-stiffness-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-stiffness-empty"
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
          data-section="chart-line-stiffness-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-stiffness-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-stiffness-grid-line"
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
                const sy =
                  layout.stiffPanelBottom -
                  t * (layout.stiffPanelBottom - layout.stiffPanelTop);
                return (
                  <line
                    key={`sg-${i}`}
                    data-section="chart-line-stiffness-grid-line"
                    data-panel="stiffness"
                    x1={layout.innerLeft}
                    y1={sy}
                    x2={layout.innerRight}
                    y2={sy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-stiffness-axes">
              <line
                data-section="chart-line-stiffness-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stiffness-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stiffness-axis"
                data-panel="stiffness"
                x1={layout.innerLeft}
                y1={layout.stiffPanelTop}
                x2={layout.innerLeft}
                y2={layout.stiffPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stiffness-axis"
                data-panel="stiffness"
                x1={layout.innerLeft}
                y1={layout.stiffPanelBottom}
                x2={layout.innerRight}
                y2={layout.stiffPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-stiffness-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.pricePanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-stiffness-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.pricePanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-stiffness-tick-label"
                data-panel="stiffness"
                x={layout.innerLeft - 6}
                y={layout.stiffPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                100
              </text>
              <text
                data-section="chart-line-stiffness-tick-label"
                data-panel="stiffness"
                x={layout.innerLeft - 6}
                y={layout.stiffPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                0
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-stiffness-panel-label"
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
            data-section="chart-line-stiffness-panel-label"
            data-panel="stiffness"
            x={layout.innerRight}
            y={layout.stiffPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Katsanos Stiffness
          </text>

          {showThresholds ? (
            <g data-section="chart-line-stiffness-thresholds">
              <line
                data-section="chart-line-stiffness-threshold"
                data-threshold="high"
                x1={layout.innerLeft}
                y1={layout.highY}
                x2={layout.innerRight}
                y2={layout.highY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-stiffness-threshold"
                data-threshold="low"
                x1={layout.innerLeft}
                y1={layout.midY}
                x2={layout.innerRight}
                y2={layout.midY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-stiffness-price-path"
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
            <g data-section="chart-line-stiffness-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-stiffness-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatValue(
                    dot.value,
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

          {!stiffnessHidden ? (
            <path
              data-section="chart-line-stiffness-stiffness-line"
              d={layout.stiffnessPath}
              fill="none"
              stroke={stiffnessColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Stiffness line, ${layout.markers.length} points`}
            />
          ) : null}

          {!stiffnessHidden && showMarkers ? (
            <g data-section="chart-line-stiffness-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-stiffness-marker"
                  data-zone={marker.zone}
                  data-stiffness={marker.stiffness}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, stiffColor, midColor, looseColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, stiffness ${formatValue(
                    marker.stiffness,
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
            <g data-section="chart-line-stiffness-badge">
              <rect
                data-section="chart-line-stiffness-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={92}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-stiffness-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`STIFF ${run.period}/${run.factor}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-stiffness-legend"
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
                data-section="chart-line-stiffness-legend-item"
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
                  data-section="chart-line-stiffness-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-stiffness-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-stiffness-legend-stats"
            style={{ color: axisColor }}
          >
            {`stiff ${run.stiffCount} / mid ${run.midCount} / loose ${run.looseCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineStiffness.displayName = 'ChartLineStiffness';
