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
 * ChartLineErgodic -- pure-SVG two-panel Ergodic Oscillator chart.
 *
 * William Blau's Ergodic Oscillator is a triple-smoothed momentum ratio.
 * The one-bar price change is smoothed by three cascaded exponential
 * averages; the same three averages smooth the absolute change; their
 * ratio, scaled to 100, is the oscillator:
 *
 *   momentum  = price - price[-1]
 *   num       = EMA(EMA(EMA(momentum, p1), p2), p3)
 *   den       = EMA(EMA(EMA(abs(momentum), p1), p2), p3)
 *   ergodic   = 100 * num / den
 *
 * Because every exponential average is a weighted mean with positive
 * weights, `|num| <= den`, so the oscillator is bounded to [-100, 100]:
 * it reads +100 in a pure uptrend, -100 in a pure downtrend and 0 in a
 * flat market. A signal line -- an exponential average of the oscillator
 * -- accompanies it; their crossover is the trade signal.
 *
 * The top panel plots the price; the bottom panel plots the oscillator
 * and its signal inside a fixed [-100, 100] band with a zero line.
 */

export interface ChartLineErgodicPoint {
  x: number;
  value: number;
}

export type ChartLineErgodicZone = 'up' | 'down' | 'flat' | 'none';

export type ChartLineErgodicSeriesId = 'price' | 'ergodic' | 'signal';

export interface ChartLineErgodicComputed {
  momentum: (number | null)[];
  ergodic: (number | null)[];
  signal: (number | null)[];
}

export interface ChartLineErgodicSample {
  index: number;
  x: number;
  value: number;
  ergodic: number | null;
  signal: number | null;
  zone: ChartLineErgodicZone;
}

export interface ChartLineErgodicRun {
  series: ChartLineErgodicPoint[];
  firstPeriod: number;
  secondPeriod: number;
  thirdPeriod: number;
  signalPeriod: number;
  momentum: (number | null)[];
  ergodic: (number | null)[];
  signal: (number | null)[];
  samples: ChartLineErgodicSample[];
  ergodicFinal: number | null;
  signalFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineErgodicMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  ergodic: number;
  zone: ChartLineErgodicZone;
}

export interface ChartLineErgodicDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineErgodicLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  oscPanelTop: number;
  oscPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineErgodicDot[];
  ergodicPath: string;
  signalPath: string;
  markers: ChartLineErgodicMarker[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  run: ChartLineErgodicRun;
}

export interface ChartLineErgodicProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineErgodicPoint[];
  firstPeriod?: number;
  secondPeriod?: number;
  thirdPeriod?: number;
  signalPeriod?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  ergodicColor?: string;
  signalColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showErgodic?: boolean;
  showSignal?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineErgodicSeriesId[];
  defaultHiddenSeries?: ChartLineErgodicSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineErgodicSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineErgodicSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ERGODIC_WIDTH = 720;
export const DEFAULT_CHART_LINE_ERGODIC_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ERGODIC_PADDING = 44;
export const DEFAULT_CHART_LINE_ERGODIC_GAP = 12;
export const DEFAULT_CHART_LINE_ERGODIC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ERGODIC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ERGODIC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ERGODIC_FIRST_PERIOD = 12;
export const DEFAULT_CHART_LINE_ERGODIC_SECOND_PERIOD = 6;
export const DEFAULT_CHART_LINE_ERGODIC_THIRD_PERIOD = 3;
export const DEFAULT_CHART_LINE_ERGODIC_SIGNAL_PERIOD = 3;
export const DEFAULT_CHART_LINE_ERGODIC_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ERGODIC_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ERGODIC_ERGODIC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ERGODIC_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ERGODIC_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ERGODIC_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ERGODIC_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ERGODIC_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ERGODIC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ERGODIC_AXIS_COLOR = '#94a3b8';

/** The oscillator is bounded to this magnitude; the panel pads past it. */
export const CHART_LINE_ERGODIC_BOUND = 100;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineErgodicFinitePoints(
  data: readonly ChartLineErgodicPoint[] | null | undefined,
): ChartLineErgodicPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineErgodicPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a smoothing period to an integer of at least 1, else fallback. */
export function normalizeLineErgodicPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/**
 * The one-bar price momentum. The first bar has no prior, so it is null;
 * each later bar is `price[i] - price[i-1]`.
 */
export function computeLineErgodicMomentum(
  values: readonly number[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const v0 = values[i];
    const v1 = values[i - 1];
    out.push(isFiniteNumber(v0) && isFiniteNumber(v1) ? v0 - v1 : null);
  }
  return out;
}

/**
 * An exponential moving average over a series that may carry leading
 * nulls. Leading nulls pass through; the average seeds from the first
 * finite value with `alpha = 2 / (period + 1)`.
 */
export function computeLineErgodicEma(
  values: readonly (number | null)[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineErgodicPeriod(
    period,
    DEFAULT_CHART_LINE_ERGODIC_THIRD_PERIOD,
  );
  const alpha = 2 / (p + 1);
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

export interface ChartLineErgodicOptions {
  firstPeriod?: number;
  secondPeriod?: number;
  thirdPeriod?: number;
  signalPeriod?: number;
}

/**
 * Compute the Ergodic Oscillator: triple-smooth the momentum and the
 * absolute momentum, take their ratio scaled to 100, and smooth that
 * into the signal line.
 */
export function computeLineErgodic(
  values: readonly number[] | null | undefined,
  options: ChartLineErgodicOptions = {},
): ChartLineErgodicComputed {
  if (!Array.isArray(values)) {
    return { momentum: [], ergodic: [], signal: [] };
  }
  const p1 = normalizeLineErgodicPeriod(
    options.firstPeriod,
    DEFAULT_CHART_LINE_ERGODIC_FIRST_PERIOD,
  );
  const p2 = normalizeLineErgodicPeriod(
    options.secondPeriod,
    DEFAULT_CHART_LINE_ERGODIC_SECOND_PERIOD,
  );
  const p3 = normalizeLineErgodicPeriod(
    options.thirdPeriod,
    DEFAULT_CHART_LINE_ERGODIC_THIRD_PERIOD,
  );
  const sp = normalizeLineErgodicPeriod(
    options.signalPeriod,
    DEFAULT_CHART_LINE_ERGODIC_SIGNAL_PERIOD,
  );
  const momentum = computeLineErgodicMomentum(values);
  const absMomentum: (number | null)[] = momentum.map((m) =>
    m === null ? null : Math.abs(m),
  );
  const num = computeLineErgodicEma(
    computeLineErgodicEma(computeLineErgodicEma(momentum, p1), p2),
    p3,
  );
  const den = computeLineErgodicEma(
    computeLineErgodicEma(computeLineErgodicEma(absMomentum, p1), p2),
    p3,
  );
  const ergodic: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const nu = num[i];
    const de = den[i];
    if (!isFiniteNumber(nu) || !isFiniteNumber(de)) {
      ergodic.push(null);
      continue;
    }
    ergodic.push(de !== 0 ? (100 * nu) / de : 0);
  }
  const signal = computeLineErgodicEma(ergodic, sp);
  return { momentum, ergodic, signal };
}

/** Classify a bar by the oscillator relative to its signal line. */
export function classifyLineErgodicZone(
  ergodic: number | null,
  signal: number | null,
): ChartLineErgodicZone {
  if (!isFiniteNumber(ergodic) || !isFiniteNumber(signal)) return 'none';
  if (ergodic > signal) return 'up';
  if (ergodic < signal) return 'down';
  return 'flat';
}

/** Run the full Ergodic Oscillator pipeline over a set of points. */
export function runLineErgodic(
  data: readonly ChartLineErgodicPoint[] | null | undefined,
  options: ChartLineErgodicOptions = {},
): ChartLineErgodicRun {
  const series = getLineErgodicFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const firstPeriod = normalizeLineErgodicPeriod(
    options.firstPeriod,
    DEFAULT_CHART_LINE_ERGODIC_FIRST_PERIOD,
  );
  const secondPeriod = normalizeLineErgodicPeriod(
    options.secondPeriod,
    DEFAULT_CHART_LINE_ERGODIC_SECOND_PERIOD,
  );
  const thirdPeriod = normalizeLineErgodicPeriod(
    options.thirdPeriod,
    DEFAULT_CHART_LINE_ERGODIC_THIRD_PERIOD,
  );
  const signalPeriod = normalizeLineErgodicPeriod(
    options.signalPeriod,
    DEFAULT_CHART_LINE_ERGODIC_SIGNAL_PERIOD,
  );
  const values = series.map((point) => point.value);
  const { momentum, ergodic, signal } = computeLineErgodic(values, {
    firstPeriod,
    secondPeriod,
    thirdPeriod,
    signalPeriod,
  });

  const samples: ChartLineErgodicSample[] = series.map((point, index) => {
    const ergodicValue = ergodic[index] ?? null;
    const signalValue = signal[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      ergodic: ergodicValue,
      signal: signalValue,
      zone: classifyLineErgodicZone(ergodicValue, signalValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let ergodicFinal: number | null = null;
  let signalFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.ergodic)) ergodicFinal = sample.ergodic;
    if (isFiniteNumber(sample.signal)) signalFinal = sample.signal;
  }

  return {
    series,
    firstPeriod,
    secondPeriod,
    thirdPeriod,
    signalPeriod,
    momentum,
    ergodic,
    signal,
    samples,
    ergodicFinal,
    signalFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineErgodicLayoutOptions extends ChartLineErgodicOptions {
  data: readonly ChartLineErgodicPoint[] | null | undefined;
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
export function computeLineErgodicLayout(
  options: ChartLineErgodicLayoutOptions,
): ChartLineErgodicLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ERGODIC_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ERGODIC_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ERGODIC_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_ERGODIC_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_ERGODIC_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineErgodic(options.data, {
    ...(options.firstPeriod !== undefined
      ? { firstPeriod: options.firstPeriod }
      : {}),
    ...(options.secondPeriod !== undefined
      ? { secondPeriod: options.secondPeriod }
      : {}),
    ...(options.thirdPeriod !== undefined
      ? { thirdPeriod: options.thirdPeriod }
      : {}),
    ...(options.signalPeriod !== undefined
      ? { signalPeriod: options.signalPeriod }
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
  const oscPanelTop = pricePanelBottom + gap;
  const oscPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    oscPanelBottom - oscPanelTop > 0;
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

  const oscMin = -(CHART_LINE_ERGODIC_BOUND + 10);
  const oscMax = CHART_LINE_ERGODIC_BOUND + 10;
  const oscPanelHeight = oscPanelBottom - oscPanelTop;
  const oscYAt = (value: number): number =>
    oscPanelBottom - ((value - oscMin) / (oscMax - oscMin)) * oscPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineErgodicDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const ergodicLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineErgodicMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.ergodic)) return;
    const cx = xAt(index);
    const cy = oscYAt(sample.ergodic);
    ergodicLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      ergodic: sample.ergodic,
      zone: sample.zone,
    });
  });

  const signalLinePoints: Array<{ x: number; y: number }> = [];
  run.signal.forEach((value, index) => {
    if (isFiniteNumber(value)) {
      signalLinePoints.push({ x: xAt(index), y: oscYAt(value) });
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
    oscPanelTop,
    oscPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    ergodicPath: buildLinePath(ergodicLinePoints),
    signalPath: buildLinePath(signalLinePoints),
    markers,
    zeroY: oscYAt(0),
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineErgodicChart(
  data: readonly ChartLineErgodicPoint[] | null | undefined,
  options: ChartLineErgodicOptions = {},
): string {
  const run = runLineErgodic(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.ergodicFinal === null ? 'n/a' : run.ergodicFinal.toFixed(2);
  return (
    `Two-panel chart with the Ergodic Oscillator (periods ` +
    `${run.firstPeriod}/${run.secondPeriod}/${run.thirdPeriod}, signal ` +
    `${run.signalPeriod}): the top panel plots the price, the bottom ` +
    `panel plots the Ergodic Oscillator and its signal line. The Ergodic ` +
    `Oscillator triple-smooths the one-bar price momentum and divides it ` +
    `by the triple-smoothed absolute momentum, scaled to 100 -- a ` +
    `bounded momentum ratio that reads +100 in a pure uptrend, -100 in a ` +
    `pure downtrend and 0 in a flat market. Across ${total} bars the ` +
    `oscillator leads its signal on ${run.upCount}, lags on ` +
    `${run.downCount} and matches on ${run.flatCount}. The final ` +
    `oscillator reading is ${finalText}.`
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
  zone: ChartLineErgodicZone,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return flatColor;
}

function zoneLabelOf(zone: ChartLineErgodicZone): string {
  if (zone === 'up') return 'Above signal';
  if (zone === 'down') return 'Below signal';
  if (zone === 'flat') return 'On signal';
  return 'n/a';
}

/**
 * ChartLineErgodic -- two-panel pure-SVG Ergodic Oscillator chart.
 */
export const ChartLineErgodic = forwardRef<
  HTMLDivElement,
  ChartLineErgodicProps
>(function ChartLineErgodic(props, ref) {
  const {
    data,
    firstPeriod = DEFAULT_CHART_LINE_ERGODIC_FIRST_PERIOD,
    secondPeriod = DEFAULT_CHART_LINE_ERGODIC_SECOND_PERIOD,
    thirdPeriod = DEFAULT_CHART_LINE_ERGODIC_THIRD_PERIOD,
    signalPeriod = DEFAULT_CHART_LINE_ERGODIC_SIGNAL_PERIOD,
    width = DEFAULT_CHART_LINE_ERGODIC_WIDTH,
    height = DEFAULT_CHART_LINE_ERGODIC_HEIGHT,
    padding = DEFAULT_CHART_LINE_ERGODIC_PADDING,
    gap = DEFAULT_CHART_LINE_ERGODIC_GAP,
    tickCount = DEFAULT_CHART_LINE_ERGODIC_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ERGODIC_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_ERGODIC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ERGODIC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ERGODIC_PRICE_COLOR,
    ergodicColor = DEFAULT_CHART_LINE_ERGODIC_ERGODIC_COLOR,
    signalColor = DEFAULT_CHART_LINE_ERGODIC_SIGNAL_COLOR,
    upColor = DEFAULT_CHART_LINE_ERGODIC_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_ERGODIC_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_ERGODIC_FLAT_COLOR,
    zeroColor = DEFAULT_CHART_LINE_ERGODIC_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_ERGODIC_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ERGODIC_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showErgodic = true,
    showSignal = true,
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
  const baseId = `chart-line-ergodic-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineErgodicSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineErgodicSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineErgodicLayout({
        data,
        firstPeriod,
        secondPeriod,
        thirdPeriod,
        signalPeriod,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      firstPeriod,
      secondPeriod,
      thirdPeriod,
      signalPeriod,
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
    describeLineErgodicChart(data, {
      firstPeriod,
      secondPeriod,
      thirdPeriod,
      signalPeriod,
    });
  const resolvedLabel =
    ariaLabel ??
    `Ergodic Oscillator chart, periods ${run.firstPeriod}/${run.secondPeriod}/${run.thirdPeriod}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineErgodicSeriesId): void => {
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
    const tooltipW = 180;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-ergodic-tooltip" pointerEvents="none">
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
          data-section="chart-line-ergodic-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-ergodic-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-ergodic-tooltip-ergodic"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Ergodic: ${
            hoverSample.ergodic === null
              ? 'n/a'
              : formatValue(hoverSample.ergodic)
          }`}
        </text>
        <text
          data-section="chart-line-ergodic-tooltip-signal"
          x={tx + 10}
          y={ty + 67}
          fill="#fcd34d"
          fontSize={11}
        >
          {`Signal: ${
            hoverSample.signal === null
              ? 'n/a'
              : formatValue(hoverSample.signal)
          }`}
        </text>
        <text
          data-section="chart-line-ergodic-tooltip-zone"
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
  const ergodicHidden = isHidden('ergodic') || !showErgodic;
  const signalHidden = isHidden('signal') || !showSignal;

  const legendItems: Array<{
    id: ChartLineErgodicSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'ergodic', label: 'Ergodic', color: ergodicColor },
    { id: 'signal', label: 'Signal', color: signalColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-ergodic"
      data-empty={isEmpty ? 'true' : 'false'}
      data-first-period={run.firstPeriod}
      data-second-period={run.secondPeriod}
      data-third-period={run.thirdPeriod}
      data-signal-period={run.signalPeriod}
      data-ergodic-final={run.ergodicFinal === null ? '' : run.ergodicFinal}
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
        data-section="chart-line-ergodic-aria-desc"
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
          data-section="chart-line-ergodic-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-ergodic-empty"
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
          data-section="chart-line-ergodic-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-ergodic-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-ergodic-grid-line"
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
                const oy =
                  layout.oscPanelBottom -
                  t * (layout.oscPanelBottom - layout.oscPanelTop);
                return (
                  <line
                    key={`og-${i}`}
                    data-section="chart-line-ergodic-grid-line"
                    data-panel="ergodic"
                    x1={layout.innerLeft}
                    y1={oy}
                    x2={layout.innerRight}
                    y2={oy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-ergodic-axes">
              <line
                data-section="chart-line-ergodic-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ergodic-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ergodic-axis"
                data-panel="ergodic"
                x1={layout.innerLeft}
                y1={layout.oscPanelTop}
                x2={layout.innerLeft}
                y2={layout.oscPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ergodic-axis"
                data-panel="ergodic"
                x1={layout.innerLeft}
                y1={layout.oscPanelBottom}
                x2={layout.innerRight}
                y2={layout.oscPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-ergodic-tick-label"
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
                data-section="chart-line-ergodic-tick-label"
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
                data-section="chart-line-ergodic-tick-label"
                data-panel="ergodic"
                x={layout.innerLeft - 6}
                y={layout.oscPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                100
              </text>
              <text
                data-section="chart-line-ergodic-tick-label"
                data-panel="ergodic"
                x={layout.innerLeft - 6}
                y={layout.oscPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                -100
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-ergodic-panel-label"
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
            data-section="chart-line-ergodic-panel-label"
            data-panel="ergodic"
            x={layout.innerRight}
            y={layout.oscPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Ergodic Oscillator
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-ergodic-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-ergodic-price-path"
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
            <g data-section="chart-line-ergodic-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-ergodic-dot"
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

          {!signalHidden ? (
            <path
              data-section="chart-line-ergodic-signal-line"
              d={layout.signalPath}
              fill="none"
              stroke={signalColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="5 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Ergodic signal line"
            />
          ) : null}

          {!ergodicHidden ? (
            <path
              data-section="chart-line-ergodic-ergodic-line"
              d={layout.ergodicPath}
              fill="none"
              stroke={ergodicColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Ergodic Oscillator line, ${layout.markers.length} points`}
            />
          ) : null}

          {!ergodicHidden && showMarkers ? (
            <g data-section="chart-line-ergodic-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-ergodic-marker"
                  data-zone={marker.zone}
                  data-ergodic={marker.ergodic}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, upColor, downColor, flatColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, ergodic ${formatValue(
                    marker.ergodic,
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
            <g data-section="chart-line-ergodic-badge">
              <rect
                data-section="chart-line-ergodic-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={84}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-ergodic-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`ERG ${run.firstPeriod}/${run.secondPeriod}/${run.thirdPeriod}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-ergodic-legend"
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
                data-section="chart-line-ergodic-legend-item"
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
                  data-section="chart-line-ergodic-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-ergodic-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-ergodic-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineErgodic.displayName = 'ChartLineErgodic';
