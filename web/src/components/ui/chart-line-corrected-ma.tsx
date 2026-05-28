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
 * ChartLineCorrectedMa -- pure-SVG single-panel Corrected Moving Average
 * chart.
 *
 * Andreas Uhl's Corrected Moving Average smooths the price and then
 * "corrects" the result: it starts from the prior corrected value and
 * iterates, pulling it toward the simple moving average until it lands
 * inside the variance band -- one standard deviation around the average:
 *
 *   sma      = average of the last `period` prices
 *   variance = mean squared deviation of that window
 *   loop on cma (seeded from the prior bar's corrected value):
 *     diff = cma - sma
 *     if diff^2 <= variance: stop -- cma is inside the band
 *     cma = (cma + sma) / 2   -- move it halfway toward the average
 *
 * Because the correction stops as soon as the value re-enters the band,
 * a steady stretch of price leaves the line pinned to the average, while
 * a sharp move walks it back in several iterations -- which filters out
 * the small swings a plain moving average passes straight through.
 *
 * This primitive overlays the Corrected Moving Average on the price in a
 * single panel, draws the variance band as a shaded region, and marks
 * each bar by the slope of the corrected line.
 */

export interface ChartLineCorrectedMaPoint {
  x: number;
  value: number;
}

export type ChartLineCorrectedMaTrend = 'up' | 'down' | 'flat' | 'none';

export type ChartLineCorrectedMaSeriesId = 'price' | 'cma' | 'band';

export interface ChartLineCorrectedMaCorrection {
  cma: number;
  iterations: number;
}

export interface ChartLineCorrectedMaComputed {
  sma: (number | null)[];
  variance: (number | null)[];
  cma: (number | null)[];
  iterations: (number | null)[];
}

export interface ChartLineCorrectedMaSample {
  index: number;
  x: number;
  value: number;
  sma: number | null;
  variance: number | null;
  cma: number | null;
  iterations: number | null;
  upper: number | null;
  lower: number | null;
  trend: ChartLineCorrectedMaTrend;
}

export interface ChartLineCorrectedMaRun {
  series: ChartLineCorrectedMaPoint[];
  period: number;
  sma: (number | null)[];
  variance: (number | null)[];
  cma: (number | null)[];
  iterations: (number | null)[];
  samples: ChartLineCorrectedMaSample[];
  cmaFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineCorrectedMaMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  cma: number;
  iterations: number;
  trend: ChartLineCorrectedMaTrend;
}

export interface ChartLineCorrectedMaDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineCorrectedMaLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineCorrectedMaDot[];
  cmaPath: string;
  bandPath: string;
  markers: ChartLineCorrectedMaMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineCorrectedMaRun;
}

export interface ChartLineCorrectedMaProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCorrectedMaPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cmaColor?: string;
  bandColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCma?: boolean;
  showBand?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCorrectedMaSeriesId[];
  defaultHiddenSeries?: ChartLineCorrectedMaSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCorrectedMaSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineCorrectedMaSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CORRECTED_MA_WIDTH = 720;
export const DEFAULT_CHART_LINE_CORRECTED_MA_HEIGHT = 320;
export const DEFAULT_CHART_LINE_CORRECTED_MA_PADDING = 44;
export const DEFAULT_CHART_LINE_CORRECTED_MA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CORRECTED_MA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CORRECTED_MA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CORRECTED_MA_PERIOD = 20;
export const DEFAULT_CHART_LINE_CORRECTED_MA_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CORRECTED_MA_CMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CORRECTED_MA_BAND_COLOR = '#c4b5fd';
export const DEFAULT_CHART_LINE_CORRECTED_MA_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CORRECTED_MA_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CORRECTED_MA_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CORRECTED_MA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CORRECTED_MA_AXIS_COLOR = '#94a3b8';

/** The hard cap on correction iterations per bar. */
export const CHART_LINE_CORRECTED_MA_MAX_ITERATIONS = 100;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineCorrectedMaFinitePoints(
  data: readonly ChartLineCorrectedMaPoint[] | null | undefined,
): ChartLineCorrectedMaPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCorrectedMaPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the window period to an integer of at least 2, else fallback. */
export function normalizeLineCorrectedMaPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** The simple moving average over the window, null in the warm-up. */
export function computeLineCorrectedMaSma(
  values: readonly number[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineCorrectedMaPeriod(
    period,
    DEFAULT_CHART_LINE_CORRECTED_MA_PERIOD,
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

/**
 * The population variance over the window -- the mean squared deviation
 * from the window average -- null in the warm-up.
 */
export function computeLineCorrectedMaVariance(
  values: readonly number[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineCorrectedMaPeriod(
    period,
    DEFAULT_CHART_LINE_CORRECTED_MA_PERIOD,
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
    out.push(sq / p);
  }
  return out;
}

/**
 * Correct one bar: starting from `prevCma`, halve the distance to `sma`
 * each iteration until the value sits inside the variance band
 * `(value - sma)^2 <= variance`. A non-positive variance collapses the
 * band to the average itself.
 */
export function correctLineCorrectedMa(
  prevCma: unknown,
  sma: unknown,
  variance: unknown,
): ChartLineCorrectedMaCorrection {
  if (!isFiniteNumber(sma)) {
    return {
      cma: isFiniteNumber(prevCma) ? prevCma : 0,
      iterations: 0,
    };
  }
  if (!isFiniteNumber(variance) || variance <= 0 || !isFiniteNumber(prevCma)) {
    return { cma: sma, iterations: 0 };
  }
  let cma = prevCma;
  let iterations = 0;
  for (let iter = 0; iter < CHART_LINE_CORRECTED_MA_MAX_ITERATIONS; iter += 1) {
    const diff = cma - sma;
    if (diff * diff <= variance) break;
    cma = (cma + sma) / 2;
    iterations += 1;
  }
  return { cma, iterations };
}

/**
 * Compute the Corrected Moving Average: the moving average, its variance,
 * the corrected line and the per-bar correction iteration count. The
 * corrected line is seeded from the average on its first defined bar and
 * carried forward thereafter.
 */
export function computeLineCorrectedMa(
  values: readonly number[] | null | undefined,
  period: unknown,
): ChartLineCorrectedMaComputed {
  if (!Array.isArray(values)) {
    return { sma: [], variance: [], cma: [], iterations: [] };
  }
  const p = normalizeLineCorrectedMaPeriod(
    period,
    DEFAULT_CHART_LINE_CORRECTED_MA_PERIOD,
  );
  const sma = computeLineCorrectedMaSma(values, p);
  const variance = computeLineCorrectedMaVariance(values, p);
  const cma: (number | null)[] = [];
  const iterations: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const s = sma[i];
    const v = variance[i];
    if (!isFiniteNumber(s) || !isFiniteNumber(v)) {
      cma.push(null);
      iterations.push(null);
      continue;
    }
    if (prev === null) {
      cma.push(s);
      iterations.push(0);
      prev = s;
      continue;
    }
    const corrected = correctLineCorrectedMa(prev, s, v);
    cma.push(corrected.cma);
    iterations.push(corrected.iterations);
    prev = corrected.cma;
  }
  return { sma, variance, cma, iterations };
}

/** Classify a bar by the slope of the corrected line. */
export function classifyLineCorrectedMaTrend(
  cma: number | null,
  prevCma: number | null,
): ChartLineCorrectedMaTrend {
  if (!isFiniteNumber(cma) || !isFiniteNumber(prevCma)) return 'none';
  if (cma > prevCma) return 'up';
  if (cma < prevCma) return 'down';
  return 'flat';
}

export interface ChartLineCorrectedMaOptions {
  period?: number;
}

/** Run the full Corrected Moving Average pipeline over a set of points. */
export function runLineCorrectedMa(
  data: readonly ChartLineCorrectedMaPoint[] | null | undefined,
  options: ChartLineCorrectedMaOptions = {},
): ChartLineCorrectedMaRun {
  const series = getLineCorrectedMaFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineCorrectedMaPeriod(
    options.period,
    DEFAULT_CHART_LINE_CORRECTED_MA_PERIOD,
  );
  const values = series.map((point) => point.value);
  const { sma, variance, cma, iterations } = computeLineCorrectedMa(
    values,
    period,
  );

  const samples: ChartLineCorrectedMaSample[] = series.map((point, index) => {
    const cmaValue = cma[index] ?? null;
    const prevCma = index > 0 ? cma[index - 1] ?? null : null;
    const smaValue = sma[index] ?? null;
    const varianceValue = variance[index] ?? null;
    let upper: number | null = null;
    let lower: number | null = null;
    if (isFiniteNumber(smaValue) && isFiniteNumber(varianceValue)) {
      const band = Math.sqrt(varianceValue);
      upper = smaValue + band;
      lower = smaValue - band;
    }
    return {
      index,
      x: point.x,
      value: point.value,
      sma: smaValue,
      variance: varianceValue,
      cma: cmaValue,
      iterations: iterations[index] ?? null,
      upper,
      lower,
      trend: classifyLineCorrectedMaTrend(cmaValue, prevCma),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let cmaFinal: number | null = null;
  for (const sample of samples) {
    if (sample.trend === 'up') upCount += 1;
    else if (sample.trend === 'down') downCount += 1;
    else if (sample.trend === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.cma)) cmaFinal = sample.cma;
  }

  return {
    series = [],
    period,
    sma,
    variance,
    cma,
    iterations,
    samples,
    cmaFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineCorrectedMaLayoutOptions
  extends ChartLineCorrectedMaOptions {
  data: readonly ChartLineCorrectedMaPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
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

/** Project the run into a single-panel SVG layout. */
export function computeLineCorrectedMaLayout(
  options: ChartLineCorrectedMaLayoutOptions,
): ChartLineCorrectedMaLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CORRECTED_MA_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CORRECTED_MA_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CORRECTED_MA_PADDING;

  const run = runLineCorrectedMa(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const okGeom = innerWidth > 0 && innerHeight > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let valueMin = Infinity;
  let valueMax = -Infinity;
  const consider = (value: number | null): void => {
    if (!isFiniteNumber(value)) return;
    if (value < valueMin) valueMin = value;
    if (value > valueMax) valueMax = value;
  };
  run.samples.forEach((sample) => {
    consider(sample.value);
    consider(sample.cma);
    consider(sample.upper);
    consider(sample.lower);
  });
  if (!Number.isFinite(valueMin) || !Number.isFinite(valueMax)) {
    valueMin = 0;
    valueMax = 1;
  }
  if (valueMin === valueMax) {
    valueMin -= 1;
    valueMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - valueMin) / (valueMax - valueMin)) * innerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineCorrectedMaDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = yAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const cmaLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineCorrectedMaMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.cma)) return;
    const cx = xAt(index);
    const cy = yAt(sample.cma);
    cmaLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      cma: sample.cma,
      iterations: sample.iterations ?? 0,
      trend: sample.trend,
    });
  });

  const upperPoints: Array<{ x: number; y: number }> = [];
  const lowerPoints: Array<{ x: number; y: number }> = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.upper) || !isFiniteNumber(sample.lower)) return;
    const cx = xAt(index);
    upperPoints.push({ x: cx, y: yAt(sample.upper) });
    lowerPoints.push({ x: cx, y: yAt(sample.lower) });
  });
  let bandPath = '';
  if (upperPoints.length > 0) {
    let d = '';
    for (let i = 0; i < upperPoints.length; i += 1) {
      const p = upperPoints[i]!;
      d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
    }
    for (let i = lowerPoints.length - 1; i >= 0; i -= 1) {
      const p = lowerPoints[i]!;
      d += `L${p.x.toFixed(2)},${p.y.toFixed(2)} `;
    }
    bandPath = `${d.trim()} Z`;
  }

  return {
    ok,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    cmaPath: buildLinePath(cmaLinePoints),
    bandPath,
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineCorrectedMaChart(
  data: readonly ChartLineCorrectedMaPoint[] | null | undefined,
  options: ChartLineCorrectedMaOptions = {},
): string {
  const run = runLineCorrectedMa(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.cmaFinal === null ? 'n/a' : run.cmaFinal.toFixed(2);
  return (
    `Line chart with a Corrected Moving Average overlay (period ` +
    `${run.period}): the price with the Corrected Moving Average line ` +
    `overlaid inside its variance band. The Corrected Moving Average ` +
    `starts from the prior corrected value and iterates, pulling it ` +
    `toward the simple moving average until it sits inside the variance ` +
    `band -- one standard deviation around the average -- which filters ` +
    `out the small swings a plain moving average passes through. Across ` +
    `${total} bars the corrected average rises on ${run.upCount}, falls ` +
    `on ${run.downCount} and is flat on ${run.flatCount}. The final ` +
    `corrected value is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function trendColorOf(
  trend: ChartLineCorrectedMaTrend,
  upColor: string,
  downColor: string,
  flatColor: string,
): string {
  if (trend === 'up') return upColor;
  if (trend === 'down') return downColor;
  return flatColor;
}

function trendLabelOf(trend: ChartLineCorrectedMaTrend): string {
  if (trend === 'up') return 'Rising';
  if (trend === 'down') return 'Falling';
  if (trend === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineCorrectedMa -- single-panel pure-SVG Corrected Moving Average
 * chart.
 */
export const ChartLineCorrectedMa = forwardRef<
  HTMLDivElement,
  ChartLineCorrectedMaProps
>(function ChartLineCorrectedMa(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_CORRECTED_MA_PERIOD,
    width = DEFAULT_CHART_LINE_CORRECTED_MA_WIDTH,
    height = DEFAULT_CHART_LINE_CORRECTED_MA_HEIGHT,
    padding = DEFAULT_CHART_LINE_CORRECTED_MA_PADDING,
    tickCount = DEFAULT_CHART_LINE_CORRECTED_MA_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CORRECTED_MA_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CORRECTED_MA_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CORRECTED_MA_PRICE_COLOR,
    cmaColor = DEFAULT_CHART_LINE_CORRECTED_MA_CMA_COLOR,
    bandColor = DEFAULT_CHART_LINE_CORRECTED_MA_BAND_COLOR,
    upColor = DEFAULT_CHART_LINE_CORRECTED_MA_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_CORRECTED_MA_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_CORRECTED_MA_FLAT_COLOR,
    gridColor = DEFAULT_CHART_LINE_CORRECTED_MA_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CORRECTED_MA_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCma = true,
    showBand = true,
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
  const baseId = `chart-line-corrected-ma-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineCorrectedMaSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineCorrectedMaSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineCorrectedMaLayout({ data, period, width, height, padding }),
    [data, period, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineCorrectedMaChart(data, { period });
  const resolvedLabel =
    ariaLabel ?? `Corrected Moving Average chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineCorrectedMaSeriesId): void => {
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
    const tooltipW = 184;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g data-section="chart-line-corrected-ma-tooltip" pointerEvents="none">
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
          data-section="chart-line-corrected-ma-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-corrected-ma-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-corrected-ma-tooltip-cma"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`CMA: ${
            hoverSample.cma === null ? 'n/a' : formatValue(hoverSample.cma)
          }`}
        </text>
        <text
          data-section="chart-line-corrected-ma-tooltip-iterations"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Iterations: ${
            hoverSample.iterations === null ? 'n/a' : hoverSample.iterations
          }`}
        </text>
        <text
          data-section="chart-line-corrected-ma-tooltip-trend"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Trend: ${trendLabelOf(hoverSample.trend)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const cmaHidden = isHidden('cma') || !showCma;
  const bandHidden = isHidden('band') || !showBand;

  const legendItems: Array<{
    id: ChartLineCorrectedMaSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'cma', label: 'Corrected MA', color: cmaColor },
    { id: 'band', label: 'Variance Band', color: bandColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-corrected-ma"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-cma-final={run.cmaFinal === null ? '' : run.cmaFinal}
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
        data-section="chart-line-corrected-ma-aria-desc"
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
          data-section="chart-line-corrected-ma-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-corrected-ma-empty"
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
          data-section="chart-line-corrected-ma-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-corrected-ma-grid">
              {tickValues.map((t, i) => {
                const gy =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-corrected-ma-grid-line"
                    x1={layout.innerLeft}
                    y1={gy}
                    x2={layout.innerRight}
                    y2={gy}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-corrected-ma-axes">
              <line
                data-section="chart-line-corrected-ma-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-corrected-ma-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-corrected-ma-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-corrected-ma-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMin)}
              </text>
            </g>
          ) : null}

          {!bandHidden && layout.bandPath.length > 0 ? (
            <path
              data-section="chart-line-corrected-ma-band"
              d={layout.bandPath}
              fill={bandColor}
              fillOpacity={0.22}
              stroke="none"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-corrected-ma-price-path"
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
            <g data-section="chart-line-corrected-ma-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-corrected-ma-dot"
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

          {!cmaHidden ? (
            <path
              data-section="chart-line-corrected-ma-cma-line"
              d={layout.cmaPath}
              fill="none"
              stroke={cmaColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Corrected Moving Average line, ${layout.markers.length} points`}
            />
          ) : null}

          {!cmaHidden && showMarkers ? (
            <g data-section="chart-line-corrected-ma-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-corrected-ma-marker"
                  data-trend={marker.trend}
                  data-cma={marker.cma}
                  data-iterations={marker.iterations}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={trendColorOf(marker.trend, upColor, downColor, flatColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, corrected average ${formatValue(
                    marker.cma,
                  )}, ${trendLabelOf(marker.trend)}`}
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
            <g data-section="chart-line-corrected-ma-badge">
              <rect
                data-section="chart-line-corrected-ma-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={64}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-corrected-ma-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`CMA ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-corrected-ma-legend"
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
                data-section="chart-line-corrected-ma-legend-item"
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
                  data-section="chart-line-corrected-ma-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-corrected-ma-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-corrected-ma-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCorrectedMa.displayName = 'ChartLineCorrectedMa';
