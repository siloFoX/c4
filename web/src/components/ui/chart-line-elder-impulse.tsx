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
 * ChartLineElderImpulse -- pure-SVG single-panel Elder Impulse chart.
 *
 * Alexander Elder's Impulse System colours each bar from two momentum
 * readings: the slope of an EMA of the close, and the slope of the MACD
 * histogram. A bar is GREEN when both the EMA and the histogram are rising
 * (momentum and trend agree, up), RED when both are falling (agree, down)
 * and BLUE when they disagree. The price line is drawn as impulse-coloured
 * segments with one coloured marker per bar; the impulse EMA is overlaid.
 *
 * The EMA is seeded from the first value (`EMA[0] = value[0]`), so the EMA
 * and the MACD pipeline are defined from the first bar and the impulse
 * class is defined from the second bar onward.
 */

export interface ChartLineElderImpulsePoint {
  x: number;
  value: number;
}

export type ChartLineElderImpulseClass = 'green' | 'red' | 'blue' | 'none';

export type ChartLineElderImpulseSeriesId = 'price' | 'ema';

export interface ChartLineElderImpulseSample {
  index: number;
  x: number;
  value: number;
  ema: number | null;
  hist: number | null;
  emaSlope: number | null;
  histSlope: number | null;
  impulse: ChartLineElderImpulseClass;
}

export interface ChartLineElderImpulseRun {
  series: ChartLineElderImpulsePoint[];
  emaPeriod: number;
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
  ema: (number | null)[];
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
  impulse: ChartLineElderImpulseClass[];
  samples: ChartLineElderImpulseSample[];
  impulseFinal: ChartLineElderImpulseClass;
  greenCount: number;
  redCount: number;
  blueCount: number;
  ok: boolean;
}

export interface ChartLineElderImpulseSegment {
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  impulse: ChartLineElderImpulseClass;
}

export interface ChartLineElderImpulseMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
  impulse: ChartLineElderImpulseClass;
}

export interface ChartLineElderImpulseLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  segments: ChartLineElderImpulseSegment[];
  markers: ChartLineElderImpulseMarker[];
  emaPath: string;
  valueMin: number;
  valueMax: number;
  run: ChartLineElderImpulseRun;
}

export interface ChartLineElderImpulseProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineElderImpulsePoint[];
  emaPeriod?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  greenColor?: string;
  redColor?: string;
  blueColor?: string;
  noneColor?: string;
  emaColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showEma?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineElderImpulseSeriesId[];
  defaultHiddenSeries?: ChartLineElderImpulseSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineElderImpulseSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineElderImpulseSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ELDER_IMPULSE_WIDTH = 720;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_PADDING = 44;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_EMA_PERIOD = 13;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_FAST_PERIOD = 12;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_SLOW_PERIOD = 26;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_SIGNAL_PERIOD = 9;
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_GREEN_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_RED_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_BLUE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_NONE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_EMA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ELDER_IMPULSE_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineElderImpulseFinitePoints(
  data: readonly ChartLineElderImpulsePoint[] | null | undefined,
): ChartLineElderImpulsePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineElderImpulsePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLineElderImpulsePeriod(
  period: unknown,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/**
 * Exponential moving average, seeded from the first finite value. A
 * non-finite slot carries the previous EMA forward (null until the first
 * finite value is seen).
 */
export function computeLineElderImpulseEma(
  values: readonly (number | null | undefined)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineElderImpulsePeriod(period, 1);
  const alpha = 2 / (p + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (const v of values) {
    if (!isFiniteNumber(v)) {
      out.push(prev);
      continue;
    }
    prev = prev === null ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/**
 * Classify a bar from the sign of the EMA slope and the MACD histogram
 * slope: GREEN when both rise, RED when both fall, BLUE when they disagree
 * (or either is flat). A null slope yields 'none'.
 */
export function classifyLineElderImpulse(
  emaSlope: number | null,
  histSlope: number | null,
): ChartLineElderImpulseClass {
  if (!isFiniteNumber(emaSlope) || !isFiniteNumber(histSlope)) return 'none';
  if (emaSlope > 0 && histSlope > 0) return 'green';
  if (emaSlope < 0 && histSlope < 0) return 'red';
  return 'blue';
}

export interface ChartLineElderImpulseOptions {
  emaPeriod?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
}

export interface ChartLineElderImpulseComputed {
  ema: (number | null)[];
  macd: (number | null)[];
  signal: (number | null)[];
  hist: (number | null)[];
  impulse: ChartLineElderImpulseClass[];
}

/**
 * Compute the impulse EMA, the MACD line / signal / histogram and the
 * per-bar impulse class for a close series.
 */
export function computeLineElderImpulse(
  values: readonly number[] | null | undefined,
  options: ChartLineElderImpulseOptions = {},
): ChartLineElderImpulseComputed {
  if (!Array.isArray(values)) {
    return { ema: [], macd: [], signal: [], hist: [], impulse: [] };
  }
  const emaPeriod = normalizeLineElderImpulsePeriod(
    options.emaPeriod,
    DEFAULT_CHART_LINE_ELDER_IMPULSE_EMA_PERIOD,
  );
  const fastPeriod = normalizeLineElderImpulsePeriod(
    options.fastPeriod,
    DEFAULT_CHART_LINE_ELDER_IMPULSE_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineElderImpulsePeriod(
    options.slowPeriod,
    DEFAULT_CHART_LINE_ELDER_IMPULSE_SLOW_PERIOD,
  );
  const signalPeriod = normalizeLineElderImpulsePeriod(
    options.signalPeriod,
    DEFAULT_CHART_LINE_ELDER_IMPULSE_SIGNAL_PERIOD,
  );

  const ema = computeLineElderImpulseEma(values, emaPeriod);
  const fast = computeLineElderImpulseEma(values, fastPeriod);
  const slow = computeLineElderImpulseEma(values, slowPeriod);

  const macd: (number | null)[] = values.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return isFiniteNumber(f) && isFiniteNumber(s) ? f - s : null;
  });
  const signal = computeLineElderImpulseEma(macd, signalPeriod);
  const hist: (number | null)[] = values.map((_, i) => {
    const m = macd[i];
    const g = signal[i];
    return isFiniteNumber(m) && isFiniteNumber(g) ? m - g : null;
  });

  const impulse: ChartLineElderImpulseClass[] = values.map((_, i) => {
    if (i === 0) return 'none';
    const emaCur = ema[i];
    const emaPrev = ema[i - 1];
    const histCur = hist[i];
    const histPrev = hist[i - 1];
    const emaSlope =
      isFiniteNumber(emaCur) && isFiniteNumber(emaPrev)
        ? emaCur - emaPrev
        : null;
    const histSlope =
      isFiniteNumber(histCur) && isFiniteNumber(histPrev)
        ? histCur - histPrev
        : null;
    return classifyLineElderImpulse(emaSlope, histSlope);
  });

  return { ema, macd, signal, hist, impulse };
}

/** Run the full Elder Impulse pipeline over a set of points. */
export function runLineElderImpulse(
  data: readonly ChartLineElderImpulsePoint[] | null | undefined,
  options: ChartLineElderImpulseOptions = {},
): ChartLineElderImpulseRun {
  const series = getLineElderImpulseFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const emaPeriod = normalizeLineElderImpulsePeriod(
    options.emaPeriod,
    DEFAULT_CHART_LINE_ELDER_IMPULSE_EMA_PERIOD,
  );
  const fastPeriod = normalizeLineElderImpulsePeriod(
    options.fastPeriod,
    DEFAULT_CHART_LINE_ELDER_IMPULSE_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineElderImpulsePeriod(
    options.slowPeriod,
    DEFAULT_CHART_LINE_ELDER_IMPULSE_SLOW_PERIOD,
  );
  const signalPeriod = normalizeLineElderImpulsePeriod(
    options.signalPeriod,
    DEFAULT_CHART_LINE_ELDER_IMPULSE_SIGNAL_PERIOD,
  );

  const values = series.map((point) => point.value);
  const { ema, macd, signal, hist, impulse } = computeLineElderImpulse(values, {
    emaPeriod,
    fastPeriod,
    slowPeriod,
    signalPeriod,
  });

  const samples: ChartLineElderImpulseSample[] = series.map((point, index) => {
    const emaCur = ema[index] ?? null;
    const emaPrev = index > 0 ? ema[index - 1] ?? null : null;
    const histCur = hist[index] ?? null;
    const histPrev = index > 0 ? hist[index - 1] ?? null : null;
    const emaSlope =
      isFiniteNumber(emaCur) && isFiniteNumber(emaPrev)
        ? emaCur - emaPrev
        : null;
    const histSlope =
      isFiniteNumber(histCur) && isFiniteNumber(histPrev)
        ? histCur - histPrev
        : null;
    return {
      index,
      x: point.x,
      value: point.value,
      ema: emaCur,
      hist: histCur,
      emaSlope,
      histSlope,
      impulse: impulse[index] ?? 'none',
    };
  });

  let greenCount = 0;
  let redCount = 0;
  let blueCount = 0;
  for (const sample of samples) {
    if (sample.impulse === 'green') greenCount += 1;
    else if (sample.impulse === 'red') redCount += 1;
    else if (sample.impulse === 'blue') blueCount += 1;
  }
  const impulseFinal =
    samples.length > 0 ? samples[samples.length - 1]!.impulse : 'none';

  return {
    series = [],
    emaPeriod,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    ema,
    macd,
    signal,
    hist,
    impulse,
    samples,
    impulseFinal,
    greenCount,
    redCount,
    blueCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineElderImpulseLayoutOptions
  extends ChartLineElderImpulseOptions {
  data: readonly ChartLineElderImpulsePoint[] | null | undefined;
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
export function computeLineElderImpulseLayout(
  options: ChartLineElderImpulseLayoutOptions,
): ChartLineElderImpulseLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ELDER_IMPULSE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ELDER_IMPULSE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ELDER_IMPULSE_PADDING;

  const run = runLineElderImpulse(options.data, {
    ...(options.emaPeriod !== undefined ? { emaPeriod: options.emaPeriod } : {}),
    ...(options.fastPeriod !== undefined
      ? { fastPeriod: options.fastPeriod }
      : {}),
    ...(options.slowPeriod !== undefined
      ? { slowPeriod: options.slowPeriod }
      : {}),
    ...(options.signalPeriod !== undefined
      ? { signalPeriod: options.signalPeriod }
      : {}),
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
  run.series.forEach((point, index) => {
    if (point.value < valueMin) valueMin = point.value;
    if (point.value > valueMax) valueMax = point.value;
    const e = run.ema[index];
    if (isFiniteNumber(e)) {
      if (e < valueMin) valueMin = e;
      if (e > valueMax) valueMax = e;
    }
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

  const markers: ChartLineElderImpulseMarker[] = run.samples.map((sample) => ({
    index: sample.index,
    x: sample.x,
    cx: xAt(sample.index),
    cy: yAt(sample.value),
    value: sample.value,
    impulse: sample.impulse,
  }));

  const segments: ChartLineElderImpulseSegment[] = [];
  for (let i = 1; i < markers.length; i += 1) {
    const prev = markers[i - 1]!;
    const cur = markers[i]!;
    segments.push({
      index: i,
      x1: prev.cx,
      y1: prev.cy,
      x2: cur.cx,
      y2: cur.cy,
      impulse: cur.impulse,
    });
  }

  const emaPoints: Array<{ x: number; y: number }> = [];
  run.ema.forEach((e, index) => {
    if (isFiniteNumber(e)) emaPoints.push({ x: xAt(index), y: yAt(e) });
  });

  return {
    ok,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    segments,
    markers,
    emaPath: buildLinePath(emaPoints),
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineElderImpulseChart(
  data: readonly ChartLineElderImpulsePoint[] | null | undefined,
  options: ChartLineElderImpulseOptions = {},
): string {
  const run = runLineElderImpulse(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Line chart with an Elder Impulse overlay: each bar is coloured from ` +
    `the slope of a ${run.emaPeriod}-period EMA of the close and the slope ` +
    `of the MACD histogram (${run.fastPeriod}/${run.slowPeriod}/` +
    `${run.signalPeriod}). A green bar marks both the EMA and the histogram ` +
    `rising, a red bar marks both falling, a blue bar marks a disagreement. ` +
    `Across ${total} bars the impulse is green on ${run.greenCount}, red on ` +
    `${run.redCount} and blue on ${run.blueCount}. The final bar is ` +
    `${run.impulseFinal}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function impulseColorOf(
  impulse: ChartLineElderImpulseClass,
  greenColor: string,
  redColor: string,
  blueColor: string,
  noneColor: string,
): string {
  if (impulse === 'green') return greenColor;
  if (impulse === 'red') return redColor;
  if (impulse === 'blue') return blueColor;
  return noneColor;
}

function impulseLabelOf(impulse: ChartLineElderImpulseClass): string {
  if (impulse === 'green') return 'Green (both rising)';
  if (impulse === 'red') return 'Red (both falling)';
  if (impulse === 'blue') return 'Blue (mixed)';
  return 'n/a';
}

/**
 * ChartLineElderImpulse -- single-panel pure-SVG Elder Impulse chart.
 */
export const ChartLineElderImpulse = forwardRef<
  HTMLDivElement,
  ChartLineElderImpulseProps
>(function ChartLineElderImpulse(props, ref) {
  const {
    data,
    emaPeriod = DEFAULT_CHART_LINE_ELDER_IMPULSE_EMA_PERIOD,
    fastPeriod = DEFAULT_CHART_LINE_ELDER_IMPULSE_FAST_PERIOD,
    slowPeriod = DEFAULT_CHART_LINE_ELDER_IMPULSE_SLOW_PERIOD,
    signalPeriod = DEFAULT_CHART_LINE_ELDER_IMPULSE_SIGNAL_PERIOD,
    width = DEFAULT_CHART_LINE_ELDER_IMPULSE_WIDTH,
    height = DEFAULT_CHART_LINE_ELDER_IMPULSE_HEIGHT,
    padding = DEFAULT_CHART_LINE_ELDER_IMPULSE_PADDING,
    tickCount = DEFAULT_CHART_LINE_ELDER_IMPULSE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ELDER_IMPULSE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ELDER_IMPULSE_DOT_RADIUS,
    greenColor = DEFAULT_CHART_LINE_ELDER_IMPULSE_GREEN_COLOR,
    redColor = DEFAULT_CHART_LINE_ELDER_IMPULSE_RED_COLOR,
    blueColor = DEFAULT_CHART_LINE_ELDER_IMPULSE_BLUE_COLOR,
    noneColor = DEFAULT_CHART_LINE_ELDER_IMPULSE_NONE_COLOR,
    emaColor = DEFAULT_CHART_LINE_ELDER_IMPULSE_EMA_COLOR,
    gridColor = DEFAULT_CHART_LINE_ELDER_IMPULSE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ELDER_IMPULSE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showEma = true,
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
  const baseId = `chart-line-elder-impulse-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineElderImpulseSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineElderImpulseSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineElderImpulseLayout({
        data,
        emaPeriod,
        fastPeriod,
        slowPeriod,
        signalPeriod,
        width,
        height,
        padding,
      }),
    [data, emaPeriod, fastPeriod, slowPeriod, signalPeriod, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineElderImpulseChart(data, {
      emaPeriod,
      fastPeriod,
      slowPeriod,
      signalPeriod,
    });
  const resolvedLabel =
    ariaLabel ??
    `Elder Impulse chart, EMA ${run.emaPeriod}, MACD ${run.fastPeriod}/${run.slowPeriod}/${run.signalPeriod}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineElderImpulseSeriesId): void => {
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
    const marker = layout.markers[hoverSample.index];
    const anchorX = marker ? marker.cx : (layout.innerLeft + layout.innerRight) / 2;
    const tooltipW = 184;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g data-section="chart-line-elder-impulse-tooltip" pointerEvents="none">
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
          data-section="chart-line-elder-impulse-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-elder-impulse-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-elder-impulse-tooltip-ema"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`EMA: ${
            hoverSample.ema === null ? 'n/a' : formatValue(hoverSample.ema)
          }`}
        </text>
        <text
          data-section="chart-line-elder-impulse-tooltip-hist"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`MACD hist: ${
            hoverSample.hist === null ? 'n/a' : formatValue(hoverSample.hist)
          }`}
        </text>
        <text
          data-section="chart-line-elder-impulse-tooltip-impulse"
          x={tx + 10}
          y={ty + 83}
          fill={impulseColorOf(
            hoverSample.impulse,
            '#4ade80',
            '#f87171',
            '#60a5fa',
            '#cbd5e1',
          )}
          fontSize={11}
          fontWeight={600}
        >
          {`Impulse: ${impulseLabelOf(hoverSample.impulse)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const emaHidden = isHidden('ema') || !showEma;

  const legendItems: Array<{
    id: ChartLineElderImpulseSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: '#475569' },
    { id: 'ema', label: `EMA ${run.emaPeriod}`, color: emaColor },
  ];

  const impulseKey: Array<{ impulse: ChartLineElderImpulseClass; label: string }> =
    [
      { impulse: 'green', label: 'Green' },
      { impulse: 'red', label: 'Red' },
      { impulse: 'blue', label: 'Blue' },
    ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-elder-impulse"
      data-empty={isEmpty ? 'true' : 'false'}
      data-ema-period={run.emaPeriod}
      data-fast-period={run.fastPeriod}
      data-slow-period={run.slowPeriod}
      data-signal-period={run.signalPeriod}
      data-green-count={run.greenCount}
      data-red-count={run.redCount}
      data-blue-count={run.blueCount}
      data-total-points={run.series.length}
      data-impulse-final={run.impulseFinal}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-elder-impulse-aria-desc"
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
          data-section="chart-line-elder-impulse-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-elder-impulse-empty"
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
          data-section="chart-line-elder-impulse-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-elder-impulse-grid">
              {tickValues.map((t, i) => {
                const gy =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-elder-impulse-grid-line"
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
            <g data-section="chart-line-elder-impulse-axes">
              <line
                data-section="chart-line-elder-impulse-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-impulse-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-elder-impulse-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-elder-impulse-tick-label"
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

          {!priceHidden ? (
            <g data-section="chart-line-elder-impulse-price-segments">
              {layout.segments.map((segment) => (
                <path
                  key={`seg-${segment.index}`}
                  data-section="chart-line-elder-impulse-segment"
                  data-impulse={segment.impulse}
                  d={`M${segment.x1.toFixed(2)},${segment.y1.toFixed(2)} L${segment.x2.toFixed(2)},${segment.y2.toFixed(2)}`}
                  fill="none"
                  stroke={impulseColorOf(
                    segment.impulse,
                    greenColor,
                    redColor,
                    blueColor,
                    noneColor,
                  )}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </g>
          ) : null}

          {!emaHidden ? (
            <path
              data-section="chart-line-elder-impulse-ema-path"
              d={layout.emaPath}
              fill="none"
              stroke={emaColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="5 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Impulse EMA line, period ${run.emaPeriod}`}
            />
          ) : null}

          {!priceHidden && showMarkers ? (
            <g data-section="chart-line-elder-impulse-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-elder-impulse-marker"
                  data-impulse={marker.impulse}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={impulseColorOf(
                    marker.impulse,
                    greenColor,
                    redColor,
                    blueColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, price ${formatValue(
                    marker.value,
                  )}, ${impulseLabelOf(marker.impulse)}`}
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
            <g data-section="chart-line-elder-impulse-badge">
              <rect
                data-section="chart-line-elder-impulse-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={52}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-elder-impulse-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`EI ${run.emaPeriod}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-elder-impulse-legend"
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
                data-section="chart-line-elder-impulse-legend-item"
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
                  data-section="chart-line-elder-impulse-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-elder-impulse-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-elder-impulse-impulse-key"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}
          >
            {impulseKey.map((entry) => (
              <span
                key={entry.impulse}
                data-section="chart-line-elder-impulse-impulse-key-item"
                data-impulse={entry.impulse}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  data-section="chart-line-elder-impulse-impulse-key-swatch"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: impulseColorOf(
                      entry.impulse,
                      greenColor,
                      redColor,
                      blueColor,
                      noneColor,
                    ),
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-elder-impulse-impulse-key-label">
                  {entry.label}
                </span>
              </span>
            ))}
          </span>
          <span
            data-section="chart-line-elder-impulse-legend-stats"
            style={{ color: axisColor }}
          >
            {`green ${run.greenCount} / red ${run.redCount} / blue ${run.blueCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineElderImpulse.displayName = 'ChartLineElderImpulse';
