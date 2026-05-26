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
 * ChartLineButterworth -- pure-SVG single-panel Ehlers Butterworth
 * Filter chart.
 *
 * The Ehlers Butterworth Filter is the maximally-flat low-pass IIR
 * filter, written in the time domain as a second- or third-order
 * difference equation. The defining identity is unity DC gain: the
 * coefficients on the input window plus the feedback coefficients sum
 * to one, so a constant input is preserved exactly. The filter is
 * smoother than a moving average and steeper at the cutoff than an
 * EMA, with a tunable cutoff via `period` and a tunable roll-off via
 * the pole order.
 *
 * 2-pole (the default):
 *
 *   a   = exp(-sqrt(2) * pi / period)
 *   b   = 2 * a * cos(sqrt(2) * pi / period)
 *   c2  = b
 *   c3  = -a^2
 *   c1  = (1 - b + a^2) / 4
 *   Filt[i] = c1 * (P[i] + 2*P[i-1] + P[i-2])
 *           + c2 * Filt[i-1] + c3 * Filt[i-2]
 *
 * 3-pole:
 *
 *   a   = exp(-pi / period)
 *   b   = 2 * a * cos(1.738 * pi / period)
 *   c   = a^2
 *   c2  = b + c
 *   c3  = -(c + b * c)
 *   c4  = c^2
 *   c1  = (1 - c2 - c3 - c4) / 8
 *   Filt[i] = c1 * (P[i] + 3*P[i-1] + 3*P[i-2] + P[i-3])
 *           + c2 * Filt[i-1] + c3 * Filt[i-2] + c4 * Filt[i-3]
 *
 * The first `poles` bars are seeded from the price so the filter is
 * defined from bar 0.
 */

export interface ChartLineButterworthPoint {
  x: number;
  value: number;
}

export type ChartLineButterworthSlope = 'up' | 'down' | 'flat' | 'none';

export type ChartLineButterworthSeriesId = 'price' | 'filter';

export type ChartLineButterworthPoles = 2 | 3;

export interface ChartLineButterworthCoefficients {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
  poles: ChartLineButterworthPoles;
}

export interface ChartLineButterworthSample {
  index: number;
  x: number;
  value: number;
  filter: number;
  slope: ChartLineButterworthSlope;
}

export interface ChartLineButterworthRun {
  series: ChartLineButterworthPoint[];
  period: number;
  poles: ChartLineButterworthPoles;
  coefficients: ChartLineButterworthCoefficients;
  filter: number[];
  samples: ChartLineButterworthSample[];
  filterFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineButterworthSegment {
  index: number;
  fromCx: number;
  fromCy: number;
  toCx: number;
  toCy: number;
  slope: ChartLineButterworthSlope;
}

export interface ChartLineButterworthMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  filter: number;
  slope: ChartLineButterworthSlope;
}

export interface ChartLineButterworthDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineButterworthLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineButterworthDot[];
  segments: ChartLineButterworthSegment[];
  markers: ChartLineButterworthMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineButterworthRun;
}

export interface ChartLineButterworthProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineButterworthPoint[];
  period?: number;
  poles?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  upColor?: string;
  downColor?: string;
  flatColor?: string;
  noneColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFilter?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineButterworthSeriesId[];
  defaultHiddenSeries?: ChartLineButterworthSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineButterworthSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineButterworthSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_BUTTERWORTH_WIDTH = 720;
export const DEFAULT_CHART_LINE_BUTTERWORTH_HEIGHT = 360;
export const DEFAULT_CHART_LINE_BUTTERWORTH_PADDING = 44;
export const DEFAULT_CHART_LINE_BUTTERWORTH_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BUTTERWORTH_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_BUTTERWORTH_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BUTTERWORTH_PERIOD = 15;
export const DEFAULT_CHART_LINE_BUTTERWORTH_POLES: ChartLineButterworthPoles = 2;
export const DEFAULT_CHART_LINE_BUTTERWORTH_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BUTTERWORTH_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BUTTERWORTH_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BUTTERWORTH_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_BUTTERWORTH_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_BUTTERWORTH_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BUTTERWORTH_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and value. */
export function getLineButterworthFinitePoints(
  data: readonly ChartLineButterworthPoint[] | null | undefined,
): ChartLineButterworthPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineButterworthPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 2, else fallback. */
export function normalizeLineButterworthPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the pole order to 2 or 3, else fallback. */
export function normalizeLineButterworthPoles(
  poles: unknown,
  fallback: ChartLineButterworthPoles,
): ChartLineButterworthPoles {
  if (poles === 2 || poles === 3) return poles;
  if (isFiniteNumber(poles)) {
    const floored = Math.floor(poles);
    if (floored === 2) return 2;
    if (floored === 3) return 3;
  }
  return fallback;
}

/**
 * The Ehlers Butterworth Filter coefficients for the given `period`
 * and pole order. The coefficient triple (or quadruple) is tuned so
 * the cumulative DC gain is one -- a constant input passes through
 * the filter unchanged.
 */
export function computeLineButterworthCoefficients(
  period: unknown,
  poles: unknown,
): ChartLineButterworthCoefficients {
  const p = normalizeLineButterworthPeriod(
    period,
    DEFAULT_CHART_LINE_BUTTERWORTH_PERIOD,
  );
  const n = normalizeLineButterworthPoles(
    poles,
    DEFAULT_CHART_LINE_BUTTERWORTH_POLES,
  );
  if (n === 2) {
    const a = Math.exp((-Math.sqrt(2) * Math.PI) / p);
    const b = 2 * a * Math.cos((Math.sqrt(2) * Math.PI) / p);
    const c2 = b;
    const c3 = -a * a;
    const c1 = (1 - b + a * a) / 4;
    return { c1, c2, c3, c4: 0, poles: 2 };
  }
  const a = Math.exp(-Math.PI / p);
  const b = 2 * a * Math.cos((1.738 * Math.PI) / p);
  const c = a * a;
  const c2 = b + c;
  const c3 = -(c + b * c);
  const c4 = c * c;
  const c1 = (1 - c2 - c3 - c4) / 8;
  return { c1, c2, c3, c4, poles: 3 };
}

/**
 * Run the Butterworth Filter difference equation over a series. The
 * first `poles` bars are seeded at the input value so the filter is
 * defined from bar 0; the recursion begins at index `poles`.
 */
export function computeLineButterworth(
  values: readonly number[] | null | undefined,
  period: unknown,
  poles: unknown,
): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const coeff = computeLineButterworthCoefficients(period, poles);
  const n = values.length;
  const out: number[] = new Array(n).fill(0);
  const seed = isFiniteNumber(values[0]) ? values[0]! : 0;
  if (coeff.poles === 2) {
    out[0] = seed;
    if (n > 1) {
      out[1] = isFiniteNumber(values[1]) ? values[1]! : seed;
    }
    for (let i = 2; i < n; i += 1) {
      const v = isFiniteNumber(values[i]) ? values[i]! : seed;
      const vm1 = isFiniteNumber(values[i - 1]) ? values[i - 1]! : seed;
      const vm2 = isFiniteNumber(values[i - 2]) ? values[i - 2]! : seed;
      out[i] =
        coeff.c1 * (v + 2 * vm1 + vm2) +
        coeff.c2 * out[i - 1]! +
        coeff.c3 * out[i - 2]!;
    }
    return out;
  }
  out[0] = seed;
  if (n > 1) out[1] = isFiniteNumber(values[1]) ? values[1]! : seed;
  if (n > 2) out[2] = isFiniteNumber(values[2]) ? values[2]! : out[1]!;
  for (let i = 3; i < n; i += 1) {
    const v = isFiniteNumber(values[i]) ? values[i]! : seed;
    const vm1 = isFiniteNumber(values[i - 1]) ? values[i - 1]! : seed;
    const vm2 = isFiniteNumber(values[i - 2]) ? values[i - 2]! : seed;
    const vm3 = isFiniteNumber(values[i - 3]) ? values[i - 3]! : seed;
    out[i] =
      coeff.c1 * (v + 3 * vm1 + 3 * vm2 + vm3) +
      coeff.c2 * out[i - 1]! +
      coeff.c3 * out[i - 2]! +
      coeff.c4 * out[i - 3]!;
  }
  return out;
}

/** Classify the filter slope between two bars. */
export function classifyLineButterworthSlope(
  filter: number | null | undefined,
  prevFilter: number | null | undefined,
): ChartLineButterworthSlope {
  if (!isFiniteNumber(filter) || !isFiniteNumber(prevFilter)) return 'none';
  if (filter > prevFilter) return 'up';
  if (filter < prevFilter) return 'down';
  return 'flat';
}

export interface ChartLineButterworthOptions {
  period?: number;
  poles?: number;
}

/** Run the full Butterworth pipeline. */
export function runLineButterworth(
  data: readonly ChartLineButterworthPoint[] | null | undefined,
  options: ChartLineButterworthOptions = {},
): ChartLineButterworthRun {
  const series = getLineButterworthFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineButterworthPeriod(
    options.period,
    DEFAULT_CHART_LINE_BUTTERWORTH_PERIOD,
  );
  const poles = normalizeLineButterworthPoles(
    options.poles,
    DEFAULT_CHART_LINE_BUTTERWORTH_POLES,
  );
  const coefficients = computeLineButterworthCoefficients(period, poles);
  const filter = computeLineButterworth(
    series.map((p) => p.value),
    period,
    poles,
  );
  const samples: ChartLineButterworthSample[] = series.map((point, index) => {
    const prev = index > 0 ? (filter[index - 1] ?? null) : null;
    const curr = filter[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      filter: curr ?? 0,
      slope: classifyLineButterworthSlope(curr, prev),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let filterFinal: number | null = null;
  for (const sample of samples) {
    if (sample.slope === 'up') upCount += 1;
    else if (sample.slope === 'down') downCount += 1;
    else if (sample.slope === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.filter)) filterFinal = sample.filter;
  }

  return {
    series,
    period,
    poles,
    coefficients,
    filter,
    samples,
    filterFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineButterworthLayoutOptions
  extends ChartLineButterworthOptions {
  data: readonly ChartLineButterworthPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
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

/** Project the run into a single-panel SVG layout. */
export function computeLineButterworthLayout(
  options: ChartLineButterworthLayoutOptions,
): ChartLineButterworthLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_BUTTERWORTH_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_BUTTERWORTH_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_BUTTERWORTH_PADDING;

  const run = runLineButterworth(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.poles !== undefined ? { poles: options.poles } : {}),
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
  for (const sample of run.samples) {
    if (sample.value < valueMin) valueMin = sample.value;
    if (sample.value > valueMax) valueMax = sample.value;
    if (isFiniteNumber(sample.filter)) {
      if (sample.filter < valueMin) valueMin = sample.filter;
      if (sample.filter > valueMax) valueMax = sample.filter;
    }
  }
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
  const priceDots: ChartLineButterworthDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, value: sample.value });
  });

  const segments: ChartLineButterworthSegment[] = [];
  const markers: ChartLineButterworthMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.filter);
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      filter: sample.filter,
      slope: sample.slope,
    });
    if (index === 0) return;
    const prev = run.samples[index - 1]!;
    const fromCx = xAt(index - 1);
    const fromCy = yAt(prev.filter);
    segments.push({
      index,
      fromCx,
      fromCy,
      toCx: cx,
      toCy: cy,
      slope: sample.slope,
    });
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
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    segments,
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineButterworthChart(
  data: readonly ChartLineButterworthPoint[] | null | undefined,
  options: ChartLineButterworthOptions = {},
): string {
  const run = runLineButterworth(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.filterFinal === null ? 'n/a' : run.filterFinal.toFixed(2);
  return (
    `Single-panel chart with an Ehlers Butterworth Filter (period ` +
    `${run.period}, ${run.poles}-pole): the price line is overlaid by ` +
    `a maximally-flat low-pass smoother written as a recursive ` +
    `difference equation. The coefficients on the input window plus ` +
    `the feedback coefficients sum to one, so a constant series ` +
    `passes through unchanged. Across ${total} bars the filter rises ` +
    `on ${run.upCount}, falls on ${run.downCount} and is flat on ` +
    `${run.flatCount}. The final filter value is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function slopeColorOf(
  slope: ChartLineButterworthSlope,
  upColor: string,
  downColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (slope === 'up') return upColor;
  if (slope === 'down') return downColor;
  if (slope === 'flat') return flatColor;
  return noneColor;
}

function slopeLabelOf(slope: ChartLineButterworthSlope): string {
  if (slope === 'up') return 'Rising';
  if (slope === 'down') return 'Falling';
  if (slope === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineButterworth -- single-panel pure-SVG Ehlers Butterworth
 * Filter chart.
 */
export const ChartLineButterworth = forwardRef<
  HTMLDivElement,
  ChartLineButterworthProps
>(function ChartLineButterworth(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_BUTTERWORTH_PERIOD,
    poles = DEFAULT_CHART_LINE_BUTTERWORTH_POLES,
    width = DEFAULT_CHART_LINE_BUTTERWORTH_WIDTH,
    height = DEFAULT_CHART_LINE_BUTTERWORTH_HEIGHT,
    padding = DEFAULT_CHART_LINE_BUTTERWORTH_PADDING,
    tickCount = DEFAULT_CHART_LINE_BUTTERWORTH_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_BUTTERWORTH_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BUTTERWORTH_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_BUTTERWORTH_PRICE_COLOR,
    upColor = DEFAULT_CHART_LINE_BUTTERWORTH_UP_COLOR,
    downColor = DEFAULT_CHART_LINE_BUTTERWORTH_DOWN_COLOR,
    flatColor = DEFAULT_CHART_LINE_BUTTERWORTH_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_BUTTERWORTH_NONE_COLOR,
    gridColor = DEFAULT_CHART_LINE_BUTTERWORTH_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_BUTTERWORTH_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFilter = true,
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
  const baseId = `chart-line-butterworth-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineButterworthSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineButterworthSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineButterworthLayout({
        data,
        period,
        poles,
        width,
        height,
        padding,
      }),
    [data, period, poles, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineButterworthChart(data, { period, poles });
  const resolvedLabel =
    ariaLabel ??
    `Ehlers Butterworth Filter chart, period ${run.period}, ${run.poles}-pole`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineButterworthSeriesId): void => {
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
    const tooltipW = 196;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g data-section="chart-line-butterworth-tooltip" pointerEvents="none">
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
          data-section="chart-line-butterworth-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-butterworth-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-butterworth-tooltip-filter"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Filter: ${formatValue(hoverSample.filter)}`}
        </text>
        <text
          data-section="chart-line-butterworth-tooltip-slope"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Slope: ${slopeLabelOf(hoverSample.slope)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const filterHidden = isHidden('filter') || !showFilter;

  const legendItems: Array<{
    id: ChartLineButterworthSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'filter', label: 'Butterworth Filter', color: upColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-butterworth"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-poles={run.poles}
      data-filter-final={run.filterFinal === null ? '' : run.filterFinal}
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
        data-section="chart-line-butterworth-aria-desc"
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
          data-section="chart-line-butterworth-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-butterworth-empty"
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
          data-section="chart-line-butterworth-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-butterworth-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-butterworth-grid-line"
                    x1={layout.innerLeft}
                    y1={y}
                    x2={layout.innerRight}
                    y2={y}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-butterworth-axes">
              <line
                data-section="chart-line-butterworth-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-butterworth-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-butterworth-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-butterworth-tick-label"
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
            <path
              data-section="chart-line-butterworth-price-path"
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
            <g data-section="chart-line-butterworth-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-butterworth-dot"
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

          {!filterHidden ? (
            <g data-section="chart-line-butterworth-segments">
              {layout.segments.map((seg) => (
                <line
                  key={`seg-${seg.index}`}
                  data-section="chart-line-butterworth-segment"
                  data-slope={seg.slope}
                  x1={seg.fromCx}
                  y1={seg.fromCy}
                  x2={seg.toCx}
                  y2={seg.toCy}
                  stroke={slopeColorOf(
                    seg.slope,
                    upColor,
                    downColor,
                    flatColor,
                    noneColor,
                  )}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </g>
          ) : null}

          {!filterHidden && showMarkers ? (
            <g data-section="chart-line-butterworth-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-butterworth-marker"
                  data-slope={marker.slope}
                  data-filter={marker.filter}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={slopeColorOf(
                    marker.slope,
                    upColor,
                    downColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, filter ${formatValue(
                    marker.filter,
                  )}, ${slopeLabelOf(marker.slope)}`}
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
            <g data-section="chart-line-butterworth-badge">
              <rect
                data-section="chart-line-butterworth-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={100}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-butterworth-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`BWORTH ${run.period}/${run.poles}P`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-butterworth-legend"
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
                data-section="chart-line-butterworth-legend-item"
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
                  data-section="chart-line-butterworth-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-butterworth-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-butterworth-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineButterworth.displayName = 'ChartLineButterworth';
