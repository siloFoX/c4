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
 * ChartLineTrixSignal -- pure-SVG two-panel TRIX + signal chart
 * (Jack Hutson, log-close variant).
 *
 * The TRIX is the bar-over-bar rate of change of a triple
 * exponential smoothing of the log close, multiplied by 10000:
 *
 *   ema1[i] = EMA(log(close), period)
 *   ema2[i] = EMA(ema1, period)
 *   ema3[i] = EMA(ema2, period)
 *   TRIX[i] = 10000 * (ema3[i] - ema3[i - 1])
 *
 *   Signal[i] = EMA(TRIX, signalPeriod)
 *
 * EMAs seed at the first defined input (`EMA[0] = input[0]`) and
 * use `alpha = 2 / (length + 1)`. The first bar is null on the
 * TRIX (no prior `ema3`); the signal needs one more bar.
 *
 * Bit-exact anchors on integer fixtures:
 *
 *   * `CONST_FLAT (close == K)` with `K > 0` -> `log(K)` is a
 *     constant, so the EMA-of-constant lemma forces `ema1 = ema2
 *     = ema3 = log(K)` at every bar. `TRIX = 10000 * 0 = 0`
 *     bit-exact at every defined bar; `Signal = EMA(0) = 0`
 *     bit-exact at every defined bar.
 *   * `CONST_FLAT_HIGH (close == 1000)` -> same identity, `TRIX
 *     = 0`, `Signal = 0` bit-exact.
 *
 * Non-trivial close paths run through `log`, so RISING / FALLING
 * are not bit-exact; tests use `toBeCloseTo` for those.
 *
 * The top panel plots the close; the bottom panel plots the
 * TRIX, the signal line, a zero reference line, and dashed
 * `+/- threshold` reference lines.
 */

export interface ChartLineTrixSignalPoint {
  x: number;
  close: number;
}

export type ChartLineTrixSignalZone =
  | 'strong-bull'
  | 'bull'
  | 'flat'
  | 'bear'
  | 'strong-bear'
  | 'none';

export type ChartLineTrixSignalSeriesId = 'price' | 'trix' | 'signal';

export interface ChartLineTrixSignalSample {
  index: number;
  x: number;
  close: number;
  trix: number | null;
  signal: number | null;
  zone: ChartLineTrixSignalZone;
}

export interface ChartLineTrixSignalRun {
  series: ChartLineTrixSignalPoint[];
  period: number;
  signalPeriod: number;
  threshold: number;
  trix: Array<number | null>;
  signal: Array<number | null>;
  samples: ChartLineTrixSignalSample[];
  trixFinal: number | null;
  signalFinal: number | null;
  strongBullCount: number;
  bullCount: number;
  bearCount: number;
  strongBearCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineTrixSignalMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  trix: number;
  zone: ChartLineTrixSignalZone;
}

export interface ChartLineTrixSignalDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrixSignalLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  trixPanelTop: number;
  trixPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineTrixSignalDot[];
  trixPath: string;
  signalPath: string;
  markers: ChartLineTrixSignalMarker[];
  zeroY: number;
  upperThresholdY: number;
  lowerThresholdY: number;
  priceMin: number;
  priceMax: number;
  trixMin: number;
  trixMax: number;
  run: ChartLineTrixSignalRun;
}

export interface ChartLineTrixSignalProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrixSignalPoint[];
  period?: number;
  signalPeriod?: number;
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
  trixColor?: string;
  signalColor?: string;
  strongBullColor?: string;
  bullColor?: string;
  bearColor?: string;
  strongBearColor?: string;
  flatColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrix?: boolean;
  showSignal?: boolean;
  showThresholdLines?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrixSignalSeriesId[];
  defaultHiddenSeries?: ChartLineTrixSignalSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrixSignalSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineTrixSignalSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TRIX_SIGNAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_HEIGHT = 400;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_PADDING = 44;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_GAP = 12;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD = 14;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_SIGNAL_PERIOD = 9;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_TRIX_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_STRONG_BULL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_BULL_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_BEAR_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_STRONG_BEAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TRIX_SIGNAL_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and a positive finite `close`. */
export function getLineTrixSignalFinitePoints(
  data: readonly ChartLineTrixSignalPoint[] | null | undefined,
): ChartLineTrixSignalPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrixSignalPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      point.close > 0
    ) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a length to an integer of at least 2. */
export function normalizeLineTrixSignalLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce the +/- threshold to a positive finite. */
export function normalizeLineTrixSignalThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

/**
 * Standard EMA over a nullable series. The first finite value
 * seeds the EMA. Null inputs propagate.
 */
export function computeLineTrixSignalEma(
  values: ReadonlyArray<number | null> | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(values)) return [];
  const n = normalizeLineTrixSignalLength(length, 2);
  const alpha = 2 / (n + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      prev = v;
    } else {
      prev = prev + alpha * (v - prev);
    }
    out.push(prev);
  }
  return out;
}

/**
 * Run the full TRIX pipeline. Returns `{ trix, signal }`. TRIX is
 * 10000 * (ema3[i] - ema3[i - 1]); signal is the EMA of TRIX
 * over `signalPeriod`. Closes are passed through `log` before the
 * triple EMA cascade.
 */
export function computeLineTrixSignal(
  closes: readonly number[] | null | undefined,
  period: unknown,
  signalPeriod: unknown,
): {
  trix: Array<number | null>;
  signal: Array<number | null>;
} {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { trix: [], signal: [] };
  }
  const p = normalizeLineTrixSignalLength(
    period,
    DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD,
  );
  const sp = normalizeLineTrixSignalLength(
    signalPeriod,
    DEFAULT_CHART_LINE_TRIX_SIGNAL_SIGNAL_PERIOD,
  );
  const logCloses: Array<number | null> = closes.map((c) =>
    isFiniteNumber(c) && c > 0 ? Math.log(c) : null,
  );
  const ema1 = computeLineTrixSignalEma(logCloses, p);
  const ema2 = computeLineTrixSignalEma(ema1, p);
  const ema3 = computeLineTrixSignalEma(ema2, p);
  const trix: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      trix.push(null);
      continue;
    }
    const cur = ema3[i];
    const prev = ema3[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) {
      trix.push(null);
      continue;
    }
    trix.push(10000 * (cur - prev));
  }
  const signal = computeLineTrixSignalEma(trix, sp);
  return { trix, signal };
}

/** Classify a TRIX reading against the threshold ladder. */
export function classifyLineTrixSignalZone(
  value: number | null,
  threshold: number,
): ChartLineTrixSignalZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'strong-bull';
  if (value > 0) return 'bull';
  if (value <= -threshold) return 'strong-bear';
  if (value < 0) return 'bear';
  return 'flat';
}

export interface ChartLineTrixSignalOptions {
  period?: number;
  signalPeriod?: number;
  threshold?: number;
}

/** Run the full TRIX pipeline plus sample classification. */
export function runLineTrixSignal(
  data: readonly ChartLineTrixSignalPoint[] | null | undefined,
  options: ChartLineTrixSignalOptions = {},
): ChartLineTrixSignalRun {
  const series = getLineTrixSignalFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineTrixSignalLength(
    options.period,
    DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD,
  );
  const signalPeriod = normalizeLineTrixSignalLength(
    options.signalPeriod,
    DEFAULT_CHART_LINE_TRIX_SIGNAL_SIGNAL_PERIOD,
  );
  const threshold = normalizeLineTrixSignalThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_TRIX_SIGNAL_THRESHOLD,
  );
  const closes = series.map((p) => p.close);
  const { trix, signal } = computeLineTrixSignal(closes, period, signalPeriod);
  const samples: ChartLineTrixSignalSample[] = series.map((point, index) => {
    const value = trix[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      trix: value,
      signal: signal[index] ?? null,
      zone: classifyLineTrixSignalZone(value, threshold),
    };
  });
  let strongBullCount = 0;
  let bullCount = 0;
  let bearCount = 0;
  let strongBearCount = 0;
  let flatCount = 0;
  let trixFinal: number | null = null;
  let signalFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong-bull') strongBullCount += 1;
    else if (sample.zone === 'bull') bullCount += 1;
    else if (sample.zone === 'bear') bearCount += 1;
    else if (sample.zone === 'strong-bear') strongBearCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.trix)) trixFinal = sample.trix;
    if (isFiniteNumber(sample.signal)) signalFinal = sample.signal;
  }
  return {
    series = [],
    period,
    signalPeriod,
    threshold,
    trix,
    signal,
    samples,
    trixFinal,
    signalFinal,
    strongBullCount,
    bullCount,
    bearCount,
    strongBearCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineTrixSignalLayoutOptions
  extends ChartLineTrixSignalOptions {
  data: readonly ChartLineTrixSignalPoint[] | null | undefined;
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
export function computeLineTrixSignalLayout(
  options: ChartLineTrixSignalLayoutOptions,
): ChartLineTrixSignalLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TRIX_SIGNAL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TRIX_SIGNAL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TRIX_SIGNAL_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_TRIX_SIGNAL_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_TRIX_SIGNAL_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineTrixSignal(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.signalPeriod !== undefined
      ? { signalPeriod: options.signalPeriod }
      : {}),
    ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
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
  const trixPanelTop = pricePanelBottom + gap;
  const trixPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    trixPanelBottom - trixPanelTop > 0;
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

  let trixAbsMax = run.threshold * 2;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.trix)) {
      const v = Math.abs(sample.trix);
      if (v > trixAbsMax) trixAbsMax = v;
    }
    if (isFiniteNumber(sample.signal)) {
      const v = Math.abs(sample.signal);
      if (v > trixAbsMax) trixAbsMax = v;
    }
  }
  if (trixAbsMax === 0) trixAbsMax = run.threshold * 2 || 1;
  const trixMin = -trixAbsMax * 1.05;
  const trixMax = trixAbsMax * 1.05;
  const trixPanelHeight = trixPanelBottom - trixPanelTop;
  const trixYAt = (value: number): number =>
    trixPanelBottom -
    ((value - trixMin) / (trixMax - trixMin)) * trixPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineTrixSignalDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const trixLinePoints: Array<{ x: number; y: number }> = [];
  const signalLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineTrixSignalMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (isFiniteNumber(sample.trix)) {
      const cy = trixYAt(sample.trix);
      trixLinePoints.push({ x: cx, y: cy });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy,
        trix: sample.trix,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.signal)) {
      signalLinePoints.push({ x: cx, y: trixYAt(sample.signal) });
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
    trixPanelTop,
    trixPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    trixPath: buildLinePath(trixLinePoints),
    signalPath: buildLinePath(signalLinePoints),
    markers,
    zeroY: trixYAt(0),
    upperThresholdY: trixYAt(run.threshold),
    lowerThresholdY: trixYAt(-run.threshold),
    priceMin,
    priceMax,
    trixMin,
    trixMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineTrixSignalChart(
  data: readonly ChartLineTrixSignalPoint[] | null | undefined,
  options: ChartLineTrixSignalOptions = {},
): string {
  const run = runLineTrixSignal(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.trixFinal === null ? 'n/a' : run.trixFinal.toFixed(3);
  return (
    `Two-panel chart with a Jack Hutson TRIX + signal panel ` +
    `(period ${run.period}, signal ${run.signalPeriod}, threshold ` +
    `+/- ${run.threshold}): the top panel plots the close, the ` +
    `bottom panel plots the TRIX as 10000 * (ema3[i] - ema3[i - 1]) ` +
    `where ema3 is the triple EMA of log(close). The signal line ` +
    `is an EMA of the TRIX. A constant close path reads exactly ` +
    `zero on both the TRIX and the signal (the EMA-of-constant ` +
    `identity). Across ${total} bars the TRIX reads strong-bull ` +
    `(>= ${run.threshold}) on ${run.strongBullCount}, bull on ` +
    `${run.bullCount}, bear on ${run.bearCount}, strong-bear ` +
    `(<= -${run.threshold}) on ${run.strongBearCount}, and flat ` +
    `on ${run.flatCount}. The final TRIX is ${finalText}.`
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
  zone: ChartLineTrixSignalZone,
  strongBullColor: string,
  bullColor: string,
  bearColor: string,
  strongBearColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'strong-bull') return strongBullColor;
  if (zone === 'bull') return bullColor;
  if (zone === 'bear') return bearColor;
  if (zone === 'strong-bear') return strongBearColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineTrixSignalZone): string {
  if (zone === 'strong-bull') return 'Strong bull';
  if (zone === 'bull') return 'Bull';
  if (zone === 'bear') return 'Bear';
  if (zone === 'strong-bear') return 'Strong bear';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineTrixSignal -- two-panel pure-SVG Jack Hutson TRIX +
 * signal chart.
 */
export const ChartLineTrixSignal = forwardRef<
  HTMLDivElement,
  ChartLineTrixSignalProps
>(function ChartLineTrixSignal(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_TRIX_SIGNAL_PERIOD,
    signalPeriod = DEFAULT_CHART_LINE_TRIX_SIGNAL_SIGNAL_PERIOD,
    threshold = DEFAULT_CHART_LINE_TRIX_SIGNAL_THRESHOLD,
    width = DEFAULT_CHART_LINE_TRIX_SIGNAL_WIDTH,
    height = DEFAULT_CHART_LINE_TRIX_SIGNAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_TRIX_SIGNAL_PADDING,
    gap = DEFAULT_CHART_LINE_TRIX_SIGNAL_GAP,
    tickCount = DEFAULT_CHART_LINE_TRIX_SIGNAL_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_TRIX_SIGNAL_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_TRIX_SIGNAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TRIX_SIGNAL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_PRICE_COLOR,
    trixColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_TRIX_COLOR,
    signalColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_SIGNAL_COLOR,
    strongBullColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_STRONG_BULL_COLOR,
    bullColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_BULL_COLOR,
    bearColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_BEAR_COLOR,
    strongBearColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_STRONG_BEAR_COLOR,
    flatColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_TRIX_SIGNAL_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTrix = true,
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
  const baseId = `chart-line-trix-signal-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineTrixSignalSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineTrixSignalSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineTrixSignalLayout({
        data,
        period,
        signalPeriod,
        threshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [data, period, signalPeriod, threshold, width, height, padding, gap, pricePanelRatio],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineTrixSignalChart(data, { period, signalPeriod, threshold });
  const resolvedLabel =
    ariaLabel ??
    `TRIX + signal chart, period ${run.period}, signal ${run.signalPeriod}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineTrixSignalSeriesId): void => {
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
    const tooltipW = 216;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-trix-signal-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={104}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-trix-signal-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-trix-signal-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-trix-signal-tooltip-trix"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`TRIX: ${
            hoverSample.trix === null ? 'n/a' : hoverSample.trix.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-trix-signal-tooltip-signal"
          x={tx + 10}
          y={ty + 67}
          fill="#fcd34d"
          fontSize={11}
        >
          {`Signal: ${
            hoverSample.signal === null
              ? 'n/a'
              : hoverSample.signal.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-trix-signal-tooltip-zone"
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
  const trixHidden = isHidden('trix') || !showTrix;
  const signalHidden = isHidden('signal') || !showSignal;

  const legendItems: Array<{
    id: ChartLineTrixSignalSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'trix', label: 'TRIX', color: trixColor },
    { id: 'signal', label: 'Signal', color: signalColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-trix-signal"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-signal-period={run.signalPeriod}
      data-threshold={run.threshold}
      data-trix-final={run.trixFinal === null ? '' : run.trixFinal}
      data-signal-final={run.signalFinal === null ? '' : run.signalFinal}
      data-strong-bull-count={run.strongBullCount}
      data-bull-count={run.bullCount}
      data-bear-count={run.bearCount}
      data-strong-bear-count={run.strongBearCount}
      data-flat-count={run.flatCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-trix-signal-aria-desc"
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
          data-section="chart-line-trix-signal-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-trix-signal-empty"
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
          data-section="chart-line-trix-signal-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-trix-signal-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-trix-signal-grid-line"
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
                  layout.trixPanelBottom -
                  t * (layout.trixPanelBottom - layout.trixPanelTop);
                return (
                  <line
                    key={`tg-${i}`}
                    data-section="chart-line-trix-signal-grid-line"
                    data-panel="trix"
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
            <g data-section="chart-line-trix-signal-axes">
              <line
                data-section="chart-line-trix-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trix-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trix-signal-axis"
                data-panel="trix"
                x1={layout.innerLeft}
                y1={layout.trixPanelTop}
                x2={layout.innerLeft}
                y2={layout.trixPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trix-signal-axis"
                data-panel="trix"
                x1={layout.innerLeft}
                y1={layout.trixPanelBottom}
                x2={layout.innerRight}
                y2={layout.trixPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-trix-signal-panel-label"
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
            data-section="chart-line-trix-signal-panel-label"
            data-panel="trix"
            x={layout.innerRight}
            y={layout.trixPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            TRIX
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-trix-signal-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-trix-signal-threshold-lines">
              <line
                data-section="chart-line-trix-signal-threshold-line"
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
                data-section="chart-line-trix-signal-threshold-line"
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
              data-section="chart-line-trix-signal-price-path"
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
            <g data-section="chart-line-trix-signal-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-trix-signal-dot"
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

          {!signalHidden ? (
            <path
              data-section="chart-line-trix-signal-signal-line"
              d={layout.signalPath}
              fill="none"
              stroke={signalColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 2"
            />
          ) : null}

          {!trixHidden ? (
            <path
              data-section="chart-line-trix-signal-line"
              d={layout.trixPath}
              fill="none"
              stroke={trixColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`TRIX line, ${layout.markers.length} points`}
            />
          ) : null}

          {!trixHidden && showMarkers ? (
            <g data-section="chart-line-trix-signal-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-trix-signal-marker"
                  data-zone={marker.zone}
                  data-trix={marker.trix}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongBullColor,
                    bullColor,
                    bearColor,
                    strongBearColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, TRIX ${formatValue(
                    marker.trix,
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
            <g data-section="chart-line-trix-signal-badge">
              <rect
                data-section="chart-line-trix-signal-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={140}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-trix-signal-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`TRIX ${run.period}/${run.signalPeriod} +/- ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-trix-signal-legend"
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
                data-section="chart-line-trix-signal-legend-item"
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
                  data-section="chart-line-trix-signal-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-trix-signal-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-trix-signal-legend-stats"
            style={{ color: axisColor }}
          >
            {`++ ${run.strongBullCount} / + ${run.bullCount} / - ${run.bearCount} / -- ${run.strongBearCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTrixSignal.displayName = 'ChartLineTrixSignal';
