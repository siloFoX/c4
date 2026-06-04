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
 * ChartLineWavetrend -- pure-SVG two-panel WaveTrend Oscillator chart.
 *
 * The WaveTrend Oscillator measures the smoothed deviation of the price
 * off its own moving average. The price is EMA-smoothed into a baseline,
 * the absolute distance from that baseline is itself EMA-smoothed into an
 * average deviation, and the price's distance is normalized by it into a
 * channel index. That channel index is EMA-smoothed once more into WT1 --
 * the main WaveTrend line -- and a short average of WT1 gives the signal
 * line WT2. The crossover of the two lines, and overbought / oversold
 * threshold crossings, are the signals.
 *
 * The top panel plots the price; the bottom panel plots WT1 and WT2 with
 * a zero line and dashed threshold lines.
 */

export interface ChartLineWavetrendPoint {
  x: number;
  value: number;
}

export type ChartLineWavetrendZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineWavetrendSeriesId = 'price' | 'wt1' | 'wt2';

export interface ChartLineWavetrendSample {
  index: number;
  x: number;
  value: number;
  wt1: number | null;
  wt2: number | null;
  zone: ChartLineWavetrendZone;
}

export interface ChartLineWavetrendRun {
  series: ChartLineWavetrendPoint[];
  channelLength: number;
  averageLength: number;
  upperThreshold: number;
  lowerThreshold: number;
  esa: (number | null)[];
  d: (number | null)[];
  ci: (number | null)[];
  wt1: (number | null)[];
  wt2: (number | null)[];
  samples: ChartLineWavetrendSample[];
  wt1Final: number | null;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineWavetrendMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  wt1: number;
  zone: ChartLineWavetrendZone;
}

export interface ChartLineWavetrendDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineWavetrendLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  wtPanelTop: number;
  wtPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineWavetrendDot[];
  wt1Path: string;
  wt2Path: string;
  markers: ChartLineWavetrendMarker[];
  zeroY: number;
  upperY: number;
  lowerY: number;
  priceMin: number;
  priceMax: number;
  wtMin: number;
  wtMax: number;
  run: ChartLineWavetrendRun;
}

export interface ChartLineWavetrendProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineWavetrendPoint[];
  channelLength?: number;
  averageLength?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  wt1Color?: string;
  wt2Color?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  neutralColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showWt1?: boolean;
  showWt2?: boolean;
  showZeroLine?: boolean;
  showThresholds?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineWavetrendSeriesId[];
  defaultHiddenSeries?: ChartLineWavetrendSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineWavetrendSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineWavetrendSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_WAVETREND_WIDTH = 720;
export const DEFAULT_CHART_LINE_WAVETREND_HEIGHT = 400;
export const DEFAULT_CHART_LINE_WAVETREND_PADDING = 44;
export const DEFAULT_CHART_LINE_WAVETREND_GAP = 12;
export const DEFAULT_CHART_LINE_WAVETREND_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WAVETREND_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WAVETREND_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WAVETREND_CHANNEL_LENGTH = 10;
export const DEFAULT_CHART_LINE_WAVETREND_AVERAGE_LENGTH = 21;
export const DEFAULT_CHART_LINE_WAVETREND_UPPER_THRESHOLD = 60;
export const DEFAULT_CHART_LINE_WAVETREND_LOWER_THRESHOLD = -60;
export const DEFAULT_CHART_LINE_WAVETREND_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_WAVETREND_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WAVETREND_WT1_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_WAVETREND_WT2_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_WAVETREND_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WAVETREND_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WAVETREND_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_WAVETREND_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WAVETREND_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_WAVETREND_AXIS_COLOR = '#94a3b8';

/** The fixed SMA length for the WT2 signal line. */
export const CHART_LINE_WAVETREND_SIGNAL_PERIOD = 4;
const CI_SCALE = 0.015;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineWavetrendFinitePoints(
  data: readonly ChartLineWavetrendPoint[] | null | undefined,
): ChartLineWavetrendPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineWavetrendPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLineWavetrendPeriod(
  period: unknown,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/**
 * EMA seeded from the first finite value, in the incremental form
 * `prev + alpha*(v - prev)` so a constant series stays exactly constant.
 */
export function computeLineWavetrendEma(
  values: readonly (number | null | undefined)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineWavetrendPeriod(period, 1);
  const alpha = 2 / (p + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (const v of values) {
    if (!isFiniteNumber(v)) {
      out.push(prev);
      continue;
    }
    prev = prev === null ? v : prev + alpha * (v - prev);
    out.push(prev);
  }
  return out;
}

/** Simple moving average over the trailing window; warm-up window null. */
export function computeLineWavetrendSma(
  values: readonly (number | null | undefined)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineWavetrendPeriod(period, 1);
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < p) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const v = values[k];
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

export interface ChartLineWavetrendComputed {
  esa: (number | null)[];
  d: (number | null)[];
  ci: (number | null)[];
  wt1: (number | null)[];
  wt2: (number | null)[];
}

export interface ChartLineWavetrendOptions {
  channelLength?: number;
  averageLength?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
}

/**
 * Compute the full WaveTrend pipeline: the EMA baseline (esa), the average
 * deviation (d), the channel index (ci), the WaveTrend line (wt1) and its
 * signal line (wt2).
 */
export function computeLineWavetrend(
  values: readonly number[] | null | undefined,
  options: ChartLineWavetrendOptions = {},
): ChartLineWavetrendComputed {
  if (!Array.isArray(values)) {
    return { esa: [], d: [], ci: [], wt1: [], wt2: [] };
  }
  const channelLength = normalizeLineWavetrendPeriod(
    options.channelLength,
    DEFAULT_CHART_LINE_WAVETREND_CHANNEL_LENGTH,
  );
  const averageLength = normalizeLineWavetrendPeriod(
    options.averageLength,
    DEFAULT_CHART_LINE_WAVETREND_AVERAGE_LENGTH,
  );

  const esa = computeLineWavetrendEma(values, channelLength);
  const absDev: (number | null)[] = values.map((v, i) => {
    const e = esa[i];
    return isFiniteNumber(v) && isFiniteNumber(e) ? Math.abs(v - e) : null;
  });
  const d = computeLineWavetrendEma(absDev, channelLength);
  const ci: (number | null)[] = values.map((v, i) => {
    const e = esa[i];
    const dd = d[i];
    if (!isFiniteNumber(v) || !isFiniteNumber(e) || !isFiniteNumber(dd)) {
      return null;
    }
    const denom = CI_SCALE * dd;
    return denom !== 0 ? (v - e) / denom : 0;
  });
  const wt1 = computeLineWavetrendEma(ci, averageLength);
  const wt2 = computeLineWavetrendSma(wt1, CHART_LINE_WAVETREND_SIGNAL_PERIOD);
  return { esa, d, ci, wt1, wt2 };
}

/** Classify a bar by WT1 against the thresholds. */
export function classifyLineWavetrendZone(
  wt1: number | null,
  upperThreshold: number,
  lowerThreshold: number,
): ChartLineWavetrendZone {
  if (!isFiniteNumber(wt1)) return 'none';
  if (wt1 > upperThreshold) return 'overbought';
  if (wt1 < lowerThreshold) return 'oversold';
  return 'neutral';
}

/** Run the full WaveTrend pipeline over a set of points. */
export function runLineWavetrend(
  data: readonly ChartLineWavetrendPoint[] | null | undefined,
  options: ChartLineWavetrendOptions = {},
): ChartLineWavetrendRun {
  const series = getLineWavetrendFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const channelLength = normalizeLineWavetrendPeriod(
    options.channelLength,
    DEFAULT_CHART_LINE_WAVETREND_CHANNEL_LENGTH,
  );
  const averageLength = normalizeLineWavetrendPeriod(
    options.averageLength,
    DEFAULT_CHART_LINE_WAVETREND_AVERAGE_LENGTH,
  );
  const upperThreshold =
    isFiniteNumber(options.upperThreshold) && options.upperThreshold > 0
      ? options.upperThreshold
      : DEFAULT_CHART_LINE_WAVETREND_UPPER_THRESHOLD;
  const lowerThreshold =
    isFiniteNumber(options.lowerThreshold) && options.lowerThreshold < 0
      ? options.lowerThreshold
      : DEFAULT_CHART_LINE_WAVETREND_LOWER_THRESHOLD;

  const values = series.map((point) => point.value);
  const { esa, d, ci, wt1, wt2 } = computeLineWavetrend(values, {
    channelLength,
    averageLength,
  });

  const samples: ChartLineWavetrendSample[] = series.map((point, index) => {
    const wt1Value = wt1[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      wt1: wt1Value,
      wt2: wt2[index] ?? null,
      zone: classifyLineWavetrendZone(wt1Value, upperThreshold, lowerThreshold),
    };
  });

  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let wt1Final: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    if (isFiniteNumber(sample.wt1)) wt1Final = sample.wt1;
  }

  return {
    series,
    channelLength,
    averageLength,
    upperThreshold,
    lowerThreshold,
    esa,
    d,
    ci,
    wt1,
    wt2,
    samples,
    wt1Final,
    overboughtCount,
    oversoldCount,
    neutralCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineWavetrendLayoutOptions
  extends ChartLineWavetrendOptions {
  data: readonly ChartLineWavetrendPoint[] | null | undefined;
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
export function computeLineWavetrendLayout(
  options: ChartLineWavetrendLayoutOptions,
): ChartLineWavetrendLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_WAVETREND_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_WAVETREND_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_WAVETREND_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_WAVETREND_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_WAVETREND_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineWavetrend(options.data, {
    ...(options.channelLength !== undefined
      ? { channelLength: options.channelLength }
      : {}),
    ...(options.averageLength !== undefined
      ? { averageLength: options.averageLength }
      : {}),
    ...(options.upperThreshold !== undefined
      ? { upperThreshold: options.upperThreshold }
      : {}),
    ...(options.lowerThreshold !== undefined
      ? { lowerThreshold: options.lowerThreshold }
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
  const wtPanelTop = pricePanelBottom + gap;
  const wtPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && wtPanelBottom - wtPanelTop > 0;
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

  let wtMin = Math.min(0, run.lowerThreshold);
  let wtMax = Math.max(0, run.upperThreshold);
  for (const value of run.wt1) {
    if (!isFiniteNumber(value)) continue;
    if (value < wtMin) wtMin = value;
    if (value > wtMax) wtMax = value;
  }
  for (const value of run.wt2) {
    if (!isFiniteNumber(value)) continue;
    if (value < wtMin) wtMin = value;
    if (value > wtMax) wtMax = value;
  }
  if (wtMin === wtMax) {
    wtMin -= 1;
    wtMax += 1;
  }
  const wtPanelHeight = wtPanelBottom - wtPanelTop;
  const wtYAt = (value: number): number =>
    wtPanelBottom - ((value - wtMin) / (wtMax - wtMin)) * wtPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineWavetrendDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const wt1Points: Array<{ x: number; y: number }> = [];
  const markers: ChartLineWavetrendMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.wt1)) return;
    const cx = xAt(index);
    const cy = wtYAt(sample.wt1);
    wt1Points.push({ x: cx, y: cy });
    markers.push({ index, x: sample.x, cx, cy, wt1: sample.wt1, zone: sample.zone });
  });

  const wt2Points: Array<{ x: number; y: number }> = [];
  run.wt2.forEach((value, index) => {
    if (isFiniteNumber(value)) wt2Points.push({ x: xAt(index), y: wtYAt(value) });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    wtPanelTop,
    wtPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    wt1Path: buildLinePath(wt1Points),
    wt2Path: buildLinePath(wt2Points),
    markers,
    zeroY: wtYAt(0),
    upperY: wtYAt(run.upperThreshold),
    lowerY: wtYAt(run.lowerThreshold),
    priceMin,
    priceMax,
    wtMin,
    wtMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineWavetrendChart(
  data: readonly ChartLineWavetrendPoint[] | null | undefined,
  options: ChartLineWavetrendOptions = {},
): string {
  const run = runLineWavetrend(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.wt1Final === null ? 'n/a' : run.wt1Final.toFixed(2);
  return (
    `Two-panel chart with the WaveTrend Oscillator (channel ` +
    `${run.channelLength}, average ${run.averageLength}): the top panel ` +
    `plots the price, the bottom panel plots WT1 and its signal line WT2. ` +
    `The WaveTrend measures the smoothed deviation of the price off its ` +
    `own moving average, normalized by the average deviation. Across ` +
    `${total} bars WT1 is overbought on ${run.overboughtCount}, oversold ` +
    `on ${run.oversoldCount} and neutral on ${run.neutralCount}. The final ` +
    `WT1 reading is ${finalText}.`
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
  zone: ChartLineWavetrendZone,
  overboughtColor: string,
  oversoldColor: string,
  neutralColor: string,
): string {
  if (zone === 'overbought') return overboughtColor;
  if (zone === 'oversold') return oversoldColor;
  return neutralColor;
}

function zoneLabelOf(zone: ChartLineWavetrendZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

/**
 * ChartLineWavetrend -- two-panel pure-SVG WaveTrend Oscillator chart.
 */
export const ChartLineWavetrend = forwardRef<
  HTMLDivElement,
  ChartLineWavetrendProps
>(function ChartLineWavetrend(props, ref) {
  const {
    data,
    channelLength = DEFAULT_CHART_LINE_WAVETREND_CHANNEL_LENGTH,
    averageLength = DEFAULT_CHART_LINE_WAVETREND_AVERAGE_LENGTH,
    upperThreshold = DEFAULT_CHART_LINE_WAVETREND_UPPER_THRESHOLD,
    lowerThreshold = DEFAULT_CHART_LINE_WAVETREND_LOWER_THRESHOLD,
    width = DEFAULT_CHART_LINE_WAVETREND_WIDTH,
    height = DEFAULT_CHART_LINE_WAVETREND_HEIGHT,
    padding = DEFAULT_CHART_LINE_WAVETREND_PADDING,
    gap = DEFAULT_CHART_LINE_WAVETREND_GAP,
    tickCount = DEFAULT_CHART_LINE_WAVETREND_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_WAVETREND_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_WAVETREND_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_WAVETREND_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_WAVETREND_PRICE_COLOR,
    wt1Color = DEFAULT_CHART_LINE_WAVETREND_WT1_COLOR,
    wt2Color = DEFAULT_CHART_LINE_WAVETREND_WT2_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_WAVETREND_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_WAVETREND_OVERSOLD_COLOR,
    neutralColor = DEFAULT_CHART_LINE_WAVETREND_NEUTRAL_COLOR,
    zeroColor = DEFAULT_CHART_LINE_WAVETREND_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_WAVETREND_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_WAVETREND_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWt1 = true,
    showWt2 = true,
    showZeroLine = true,
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
  const baseId = `chart-line-wavetrend-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineWavetrendSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineWavetrendSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineWavetrendLayout({
        data,
        channelLength,
        averageLength,
        upperThreshold,
        lowerThreshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      channelLength,
      averageLength,
      upperThreshold,
      lowerThreshold,
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
    describeLineWavetrendChart(data, {
      channelLength,
      averageLength,
      upperThreshold,
      lowerThreshold,
    });
  const resolvedLabel =
    ariaLabel ??
    `WaveTrend Oscillator chart, channel ${run.channelLength}, average ${run.averageLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineWavetrendSeriesId): void => {
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
    const tooltipW = 172;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-wavetrend-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={96}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-wavetrend-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-wavetrend-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-wavetrend-tooltip-wt1"
          x={tx + 10}
          y={ty + 51}
          fill="#5eead4"
          fontSize={11}
          fontWeight={600}
        >
          {`WT1: ${
            hoverSample.wt1 === null ? 'n/a' : formatValue(hoverSample.wt1)
          }`}
        </text>
        <text
          data-section="chart-line-wavetrend-tooltip-wt2"
          x={tx + 10}
          y={ty + 67}
          fill="#fcd34d"
          fontSize={11}
        >
          {`WT2: ${
            hoverSample.wt2 === null ? 'n/a' : formatValue(hoverSample.wt2)
          }`}
        </text>
        <text
          data-section="chart-line-wavetrend-tooltip-zone"
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
  const wt1Hidden = isHidden('wt1') || !showWt1;
  const wt2Hidden = isHidden('wt2') || !showWt2;

  const legendItems: Array<{
    id: ChartLineWavetrendSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'wt1', label: 'WT1', color: wt1Color },
    { id: 'wt2', label: 'WT2', color: wt2Color },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-wavetrend"
      data-empty={isEmpty ? 'true' : 'false'}
      data-channel-length={run.channelLength}
      data-average-length={run.averageLength}
      data-upper-threshold={run.upperThreshold}
      data-lower-threshold={run.lowerThreshold}
      data-wt1-final={run.wt1Final === null ? '' : run.wt1Final}
      data-overbought-count={run.overboughtCount}
      data-oversold-count={run.oversoldCount}
      data-neutral-count={run.neutralCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-wavetrend-aria-desc"
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
          data-section="chart-line-wavetrend-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-wavetrend-empty"
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
          data-section="chart-line-wavetrend-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-wavetrend-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-wavetrend-grid-line"
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
                const wy =
                  layout.wtPanelBottom -
                  t * (layout.wtPanelBottom - layout.wtPanelTop);
                return (
                  <line
                    key={`wg-${i}`}
                    data-section="chart-line-wavetrend-grid-line"
                    data-panel="wt"
                    x1={layout.innerLeft}
                    y1={wy}
                    x2={layout.innerRight}
                    y2={wy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-wavetrend-axes">
              <line
                data-section="chart-line-wavetrend-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-wavetrend-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-wavetrend-axis"
                data-panel="wt"
                x1={layout.innerLeft}
                y1={layout.wtPanelTop}
                x2={layout.innerLeft}
                y2={layout.wtPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-wavetrend-axis"
                data-panel="wt"
                x1={layout.innerLeft}
                y1={layout.wtPanelBottom}
                x2={layout.innerRight}
                y2={layout.wtPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-wavetrend-tick-label"
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
                data-section="chart-line-wavetrend-tick-label"
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
                data-section="chart-line-wavetrend-tick-label"
                data-panel="wt"
                x={layout.innerLeft - 6}
                y={layout.wtPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.wtMax)}
              </text>
              <text
                data-section="chart-line-wavetrend-tick-label"
                data-panel="wt"
                x={layout.innerLeft - 6}
                y={layout.wtPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.wtMin)}
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-wavetrend-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Price
          </text>
          <text
            data-section="chart-line-wavetrend-panel-label"
            data-panel="wt"
            x={layout.innerRight}
            y={layout.wtPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            WaveTrend Oscillator
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-wavetrend-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholds ? (
            <g data-section="chart-line-wavetrend-thresholds">
              <line
                data-section="chart-line-wavetrend-threshold-line"
                data-level="upper"
                x1={layout.innerLeft}
                y1={layout.upperY}
                x2={layout.innerRight}
                y2={layout.upperY}
                stroke={overboughtColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-wavetrend-threshold-line"
                data-level="lower"
                x1={layout.innerLeft}
                y1={layout.lowerY}
                x2={layout.innerRight}
                y2={layout.lowerY}
                stroke={oversoldColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-wavetrend-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Price line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-wavetrend-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-wavetrend-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, price ${formatValue(
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

          {!wt2Hidden ? (
            <path
              data-section="chart-line-wavetrend-wt2-line"
              d={layout.wt2Path}
              fill="none"
              stroke={wt2Color}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="5 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="WaveTrend signal line WT2"
            />
          ) : null}

          {!wt1Hidden ? (
            <path
              data-section="chart-line-wavetrend-wt1-line"
              d={layout.wt1Path}
              fill="none"
              stroke={wt1Color}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`WaveTrend line WT1, ${layout.markers.length} points`}
            />
          ) : null}

          {!wt1Hidden && showMarkers ? (
            <g data-section="chart-line-wavetrend-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-wavetrend-marker"
                  data-zone={marker.zone}
                  data-wt1={marker.wt1}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    overboughtColor,
                    oversoldColor,
                    neutralColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, WT1 ${formatValue(
                    marker.wt1,
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
            <g data-section="chart-line-wavetrend-badge">
              <rect
                data-section="chart-line-wavetrend-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={72}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-wavetrend-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`WT ${run.channelLength}/${run.averageLength}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-wavetrend-legend"
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
                data-section="chart-line-wavetrend-legend-item"
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
                  data-section="chart-line-wavetrend-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-wavetrend-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-wavetrend-legend-stats"
            style={{ color: axisColor }}
          >
            {`overbought ${run.overboughtCount} / oversold ${run.oversoldCount} / neutral ${run.neutralCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineWavetrend.displayName = 'ChartLineWavetrend';
