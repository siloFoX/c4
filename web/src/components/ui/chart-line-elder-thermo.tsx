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
 * ChartLineElderThermo -- pure-SVG two-panel Elder Market Thermometer
 * chart.
 *
 * Alexander Elder's Market Thermometer reads the "temperature" of the
 * market from how far each bar reaches beyond the prior bar. For every
 * bar it takes the LARGER of the two excursions -- the absolute change
 * in the high and the absolute change in the low:
 *
 *   thermometer = max( |high - high[-1]|, |low - low[-1]| )
 *
 * A quiet bar that stays within the prior range reads cold; a bar that
 * pushes well past it reads hot. An exponential moving average of the
 * thermometer is the reference: the bar is calm below the average,
 * warm above it, and hot once it crosses a multiple of the average.
 *
 * The top panel plots the bar midpoint; the bottom panel plots the
 * thermometer and its moving average, with one marker per bar coloured
 * by temperature.
 */

export interface ChartLineElderThermoPoint {
  x: number;
  high: number;
  low: number;
}

export type ChartLineElderThermoZone = 'calm' | 'warm' | 'hot' | 'none';

export type ChartLineElderThermoSeriesId = 'price' | 'thermo' | 'thermoMa';

export interface ChartLineElderThermoComputed {
  thermometer: (number | null)[];
  thermoMa: (number | null)[];
}

export interface ChartLineElderThermoSample {
  index: number;
  x: number;
  high: number;
  low: number;
  midpoint: number;
  thermometer: number | null;
  thermoMa: number | null;
  zone: ChartLineElderThermoZone;
}

export interface ChartLineElderThermoRun {
  series: ChartLineElderThermoPoint[];
  period: number;
  hotFactor: number;
  thermometer: (number | null)[];
  thermoMa: (number | null)[];
  samples: ChartLineElderThermoSample[];
  thermoFinal: number | null;
  calmCount: number;
  warmCount: number;
  hotCount: number;
  ok: boolean;
}

export interface ChartLineElderThermoMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  thermometer: number;
  zone: ChartLineElderThermoZone;
}

export interface ChartLineElderThermoDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  midpoint: number;
}

export interface ChartLineElderThermoLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  thermoPanelTop: number;
  thermoPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineElderThermoDot[];
  thermoPath: string;
  thermoMaPath: string;
  markers: ChartLineElderThermoMarker[];
  priceMin: number;
  priceMax: number;
  thermoMin: number;
  thermoMax: number;
  run: ChartLineElderThermoRun;
}

export interface ChartLineElderThermoProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineElderThermoPoint[];
  period?: number;
  hotFactor?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  thermoColor?: string;
  thermoMaColor?: string;
  calmColor?: string;
  warmColor?: string;
  hotColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showThermo?: boolean;
  showThermoMa?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineElderThermoSeriesId[];
  defaultHiddenSeries?: ChartLineElderThermoSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineElderThermoSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineElderThermoSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ELDER_THERMO_WIDTH = 720;
export const DEFAULT_CHART_LINE_ELDER_THERMO_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ELDER_THERMO_PADDING = 44;
export const DEFAULT_CHART_LINE_ELDER_THERMO_GAP = 12;
export const DEFAULT_CHART_LINE_ELDER_THERMO_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ELDER_THERMO_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ELDER_THERMO_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ELDER_THERMO_PERIOD = 22;
export const DEFAULT_CHART_LINE_ELDER_THERMO_HOT_FACTOR = 2;
export const DEFAULT_CHART_LINE_ELDER_THERMO_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ELDER_THERMO_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ELDER_THERMO_THERMO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ELDER_THERMO_THERMO_MA_COLOR = '#0891b2';
export const DEFAULT_CHART_LINE_ELDER_THERMO_CALM_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ELDER_THERMO_WARM_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_ELDER_THERMO_HOT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ELDER_THERMO_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ELDER_THERMO_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars with a finite x, high and low. */
export function getLineElderThermoFinitePoints(
  data: readonly ChartLineElderThermoPoint[] | null | undefined,
): ChartLineElderThermoPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineElderThermoPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low)
    ) {
      out.push({ x: point.x, high: point.high, low: point.low });
    }
  }
  return out;
}

/** Coerce the moving-average period to an integer of at least 1, else fallback. */
export function normalizeLineElderThermoPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Coerce the hot multiple to a finite number greater than 1, else fallback. */
export function normalizeLineElderThermoHotFactor(
  factor: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(factor) && factor > 1) return factor;
  return fallback;
}

/**
 * The raw Elder Thermometer: for each bar past the first, the larger of
 * the absolute change in the high and the absolute change in the low.
 * The first bar has no prior, so it is null.
 */
export function computeLineElderThermometer(
  bars: readonly ChartLineElderThermoPoint[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const out: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const cur = bars[i];
    const prev = bars[i - 1];
    if (!cur || !prev) {
      out.push(null);
      continue;
    }
    if (
      isFiniteNumber(cur.high) &&
      isFiniteNumber(prev.high) &&
      isFiniteNumber(cur.low) &&
      isFiniteNumber(prev.low)
    ) {
      out.push(
        Math.max(
          Math.abs(cur.high - prev.high),
          Math.abs(cur.low - prev.low),
        ),
      );
    } else {
      out.push(null);
    }
  }
  return out;
}

/**
 * An exponential moving average over a series that may carry leading
 * nulls. Leading nulls pass through; the average seeds from the first
 * finite value with `alpha = 2 / (period + 1)`.
 */
export function computeLineElderThermoEma(
  values: readonly (number | null)[] | null | undefined,
  period: unknown,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineElderThermoPeriod(
    period,
    DEFAULT_CHART_LINE_ELDER_THERMO_PERIOD,
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

/** Classify a bar by the thermometer relative to its moving average. */
export function classifyLineElderThermoZone(
  thermometer: number | null,
  thermoMa: number | null,
  hotFactor: number,
): ChartLineElderThermoZone {
  if (!isFiniteNumber(thermometer) || !isFiniteNumber(thermoMa)) return 'none';
  if (thermometer <= 0) return 'calm';
  if (thermometer < thermoMa) return 'calm';
  if (thermometer >= thermoMa * hotFactor) return 'hot';
  return 'warm';
}

export interface ChartLineElderThermoOptions {
  period?: number;
  hotFactor?: number;
}

/**
 * Compute the Elder Thermometer and its moving average over the bars.
 */
export function computeLineElderThermo(
  bars: readonly ChartLineElderThermoPoint[] | null | undefined,
  options: ChartLineElderThermoOptions = {},
): ChartLineElderThermoComputed {
  if (!Array.isArray(bars)) return { thermometer: [], thermoMa: [] };
  const period = normalizeLineElderThermoPeriod(
    options.period,
    DEFAULT_CHART_LINE_ELDER_THERMO_PERIOD,
  );
  const thermometer = computeLineElderThermometer(bars);
  const thermoMa = computeLineElderThermoEma(thermometer, period);
  return { thermometer, thermoMa };
}

/** Run the full Elder Thermometer pipeline over a set of bars. */
export function runLineElderThermo(
  data: readonly ChartLineElderThermoPoint[] | null | undefined,
  options: ChartLineElderThermoOptions = {},
): ChartLineElderThermoRun {
  const series = getLineElderThermoFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineElderThermoPeriod(
    options.period,
    DEFAULT_CHART_LINE_ELDER_THERMO_PERIOD,
  );
  const hotFactor = normalizeLineElderThermoHotFactor(
    options.hotFactor,
    DEFAULT_CHART_LINE_ELDER_THERMO_HOT_FACTOR,
  );
  const { thermometer, thermoMa } = computeLineElderThermo(series, { period });

  const samples: ChartLineElderThermoSample[] = series.map((bar, index) => {
    const thermoValue = thermometer[index] ?? null;
    const maValue = thermoMa[index] ?? null;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      midpoint: (bar.high + bar.low) / 2,
      thermometer: thermoValue,
      thermoMa: maValue,
      zone: classifyLineElderThermoZone(thermoValue, maValue, hotFactor),
    };
  });

  let calmCount = 0;
  let warmCount = 0;
  let hotCount = 0;
  let thermoFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'calm') calmCount += 1;
    else if (sample.zone === 'warm') warmCount += 1;
    else if (sample.zone === 'hot') hotCount += 1;
    if (isFiniteNumber(sample.thermometer)) thermoFinal = sample.thermometer;
  }

  return {
    series = [],
    period,
    hotFactor,
    thermometer,
    thermoMa,
    samples,
    thermoFinal,
    calmCount,
    warmCount,
    hotCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineElderThermoLayoutOptions
  extends ChartLineElderThermoOptions {
  data: readonly ChartLineElderThermoPoint[] | null | undefined;
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
export function computeLineElderThermoLayout(
  options: ChartLineElderThermoLayoutOptions,
): ChartLineElderThermoLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ELDER_THERMO_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ELDER_THERMO_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ELDER_THERMO_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_ELDER_THERMO_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_ELDER_THERMO_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineElderThermo(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.hotFactor !== undefined
      ? { hotFactor: options.hotFactor }
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
  const thermoPanelTop = pricePanelBottom + gap;
  const thermoPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    thermoPanelBottom - thermoPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.midpoint < priceMin) priceMin = sample.midpoint;
    if (sample.midpoint > priceMax) priceMax = sample.midpoint;
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

  let thermoMax = 0;
  for (const value of run.thermometer) {
    if (isFiniteNumber(value) && value > thermoMax) thermoMax = value;
  }
  for (const value of run.thermoMa) {
    if (isFiniteNumber(value) && value > thermoMax) thermoMax = value;
  }
  thermoMax = thermoMax > 0 ? thermoMax * 1.1 : 1;
  const thermoMin = 0;
  const thermoPanelHeight = thermoPanelBottom - thermoPanelTop;
  const thermoYAt = (value: number): number =>
    thermoPanelBottom -
    ((value - thermoMin) / (thermoMax - thermoMin)) * thermoPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineElderThermoDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.midpoint);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, midpoint: sample.midpoint });
  });

  const thermoLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineElderThermoMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.thermometer)) return;
    const cx = xAt(index);
    const cy = thermoYAt(sample.thermometer);
    thermoLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      thermometer: sample.thermometer,
      zone: sample.zone,
    });
  });

  const thermoMaLinePoints: Array<{ x: number; y: number }> = [];
  run.thermoMa.forEach((value, index) => {
    if (isFiniteNumber(value)) {
      thermoMaLinePoints.push({ x: xAt(index), y: thermoYAt(value) });
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
    thermoPanelTop,
    thermoPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    thermoPath: buildLinePath(thermoLinePoints),
    thermoMaPath: buildLinePath(thermoMaLinePoints),
    markers,
    priceMin,
    priceMax,
    thermoMin,
    thermoMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineElderThermoChart(
  data: readonly ChartLineElderThermoPoint[] | null | undefined,
  options: ChartLineElderThermoOptions = {},
): string {
  const run = runLineElderThermo(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.thermoFinal === null ? 'n/a' : run.thermoFinal.toFixed(2);
  return (
    `Two-panel chart with the Elder Market Thermometer (period ` +
    `${run.period}): the top panel plots the bar midpoint, the bottom ` +
    `panel plots the thermometer and its moving average. The Elder ` +
    `Thermometer reads the market temperature as the larger of the two ` +
    `excursions a bar makes -- the absolute change in the high and the ` +
    `absolute change in the low from the prior bar -- so a quiet bar ` +
    `reads cold and a wide range reads hot. Across ${total} bars the ` +
    `thermometer is calm on ${run.calmCount}, warm on ${run.warmCount} ` +
    `and hot on ${run.hotCount}. The final thermometer reading is ` +
    `${finalText}.`
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
  zone: ChartLineElderThermoZone,
  calmColor: string,
  warmColor: string,
  hotColor: string,
): string {
  if (zone === 'hot') return hotColor;
  if (zone === 'warm') return warmColor;
  return calmColor;
}

function zoneLabelOf(zone: ChartLineElderThermoZone): string {
  if (zone === 'calm') return 'Calm';
  if (zone === 'warm') return 'Warm';
  if (zone === 'hot') return 'Hot';
  return 'n/a';
}

/**
 * ChartLineElderThermo -- two-panel pure-SVG Elder Market Thermometer
 * chart.
 */
export const ChartLineElderThermo = forwardRef<
  HTMLDivElement,
  ChartLineElderThermoProps
>(function ChartLineElderThermo(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_ELDER_THERMO_PERIOD,
    hotFactor = DEFAULT_CHART_LINE_ELDER_THERMO_HOT_FACTOR,
    width = DEFAULT_CHART_LINE_ELDER_THERMO_WIDTH,
    height = DEFAULT_CHART_LINE_ELDER_THERMO_HEIGHT,
    padding = DEFAULT_CHART_LINE_ELDER_THERMO_PADDING,
    gap = DEFAULT_CHART_LINE_ELDER_THERMO_GAP,
    tickCount = DEFAULT_CHART_LINE_ELDER_THERMO_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ELDER_THERMO_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_ELDER_THERMO_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ELDER_THERMO_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ELDER_THERMO_PRICE_COLOR,
    thermoColor = DEFAULT_CHART_LINE_ELDER_THERMO_THERMO_COLOR,
    thermoMaColor = DEFAULT_CHART_LINE_ELDER_THERMO_THERMO_MA_COLOR,
    calmColor = DEFAULT_CHART_LINE_ELDER_THERMO_CALM_COLOR,
    warmColor = DEFAULT_CHART_LINE_ELDER_THERMO_WARM_COLOR,
    hotColor = DEFAULT_CHART_LINE_ELDER_THERMO_HOT_COLOR,
    gridColor = DEFAULT_CHART_LINE_ELDER_THERMO_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ELDER_THERMO_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showThermo = true,
    showThermoMa = true,
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
  const baseId = `chart-line-elder-thermo-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineElderThermoSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineElderThermoSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineElderThermoLayout({
        data,
        period,
        hotFactor,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [data, period, hotFactor, width, height, padding, gap, pricePanelRatio],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineElderThermoChart(data, { period, hotFactor });
  const resolvedLabel =
    ariaLabel ?? `Elder Market Thermometer chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineElderThermoSeriesId): void => {
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
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-elder-thermo-tooltip" pointerEvents="none">
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
          data-section="chart-line-elder-thermo-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-elder-thermo-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatValue(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-elder-thermo-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatValue(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-elder-thermo-tooltip-thermo"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Thermometer: ${
            hoverSample.thermometer === null
              ? 'n/a'
              : formatValue(hoverSample.thermometer)
          }`}
        </text>
        <text
          data-section="chart-line-elder-thermo-tooltip-thermo-ma"
          x={tx + 10}
          y={ty + 83}
          fill="#67e8f9"
          fontSize={11}
        >
          {`Thermo MA: ${
            hoverSample.thermoMa === null
              ? 'n/a'
              : formatValue(hoverSample.thermoMa)
          }`}
        </text>
        <text
          data-section="chart-line-elder-thermo-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Temperature: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const thermoHidden = isHidden('thermo') || !showThermo;
  const thermoMaHidden = isHidden('thermoMa') || !showThermoMa;

  const legendItems: Array<{
    id: ChartLineElderThermoSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Midpoint', color: priceColor },
    { id: 'thermo', label: 'Thermometer', color: thermoColor },
    { id: 'thermoMa', label: 'Thermo MA', color: thermoMaColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-elder-thermo"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-hot-factor={run.hotFactor}
      data-thermo-final={run.thermoFinal === null ? '' : run.thermoFinal}
      data-calm-count={run.calmCount}
      data-warm-count={run.warmCount}
      data-hot-count={run.hotCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-elder-thermo-aria-desc"
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
          data-section="chart-line-elder-thermo-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-elder-thermo-empty"
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
          data-section="chart-line-elder-thermo-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-elder-thermo-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-elder-thermo-grid-line"
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
                const ty =
                  layout.thermoPanelBottom -
                  t * (layout.thermoPanelBottom - layout.thermoPanelTop);
                return (
                  <line
                    key={`tg-${i}`}
                    data-section="chart-line-elder-thermo-grid-line"
                    data-panel="thermo"
                    x1={layout.innerLeft}
                    y1={ty}
                    x2={layout.innerRight}
                    y2={ty}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-elder-thermo-axes">
              <line
                data-section="chart-line-elder-thermo-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-thermo-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-thermo-axis"
                data-panel="thermo"
                x1={layout.innerLeft}
                y1={layout.thermoPanelTop}
                x2={layout.innerLeft}
                y2={layout.thermoPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-thermo-axis"
                data-panel="thermo"
                x1={layout.innerLeft}
                y1={layout.thermoPanelBottom}
                x2={layout.innerRight}
                y2={layout.thermoPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-elder-thermo-tick-label"
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
                data-section="chart-line-elder-thermo-tick-label"
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
                data-section="chart-line-elder-thermo-tick-label"
                data-panel="thermo"
                x={layout.innerLeft - 6}
                y={layout.thermoPanelTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.thermoMax)}
              </text>
              <text
                data-section="chart-line-elder-thermo-tick-label"
                data-panel="thermo"
                x={layout.innerLeft - 6}
                y={layout.thermoPanelBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                0
              </text>
            </g>
          ) : null}

          <text
            data-section="chart-line-elder-thermo-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Midpoint
          </text>
          <text
            data-section="chart-line-elder-thermo-panel-label"
            data-panel="thermo"
            x={layout.innerRight}
            y={layout.thermoPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Elder Thermometer
          </text>

          {!priceHidden ? (
            <path
              data-section="chart-line-elder-thermo-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Bar midpoint line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-elder-thermo-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-elder-thermo-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, midpoint ${formatValue(
                    dot.midpoint,
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

          {!thermoMaHidden ? (
            <path
              data-section="chart-line-elder-thermo-thermo-ma-line"
              d={layout.thermoMaPath}
              fill="none"
              stroke={thermoMaColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="5 3"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Thermometer moving average line"
            />
          ) : null}

          {!thermoHidden ? (
            <path
              data-section="chart-line-elder-thermo-thermo-line"
              d={layout.thermoPath}
              fill="none"
              stroke={thermoColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Thermometer line, ${layout.markers.length} points`}
            />
          ) : null}

          {!thermoHidden && showMarkers ? (
            <g data-section="chart-line-elder-thermo-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-elder-thermo-marker"
                  data-zone={marker.zone}
                  data-thermo={marker.thermometer}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(marker.zone, calmColor, warmColor, hotColor)}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, thermometer ${formatValue(
                    marker.thermometer,
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
            <g data-section="chart-line-elder-thermo-badge">
              <rect
                data-section="chart-line-elder-thermo-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={76}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-elder-thermo-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`THERMO ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-elder-thermo-legend"
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
                data-section="chart-line-elder-thermo-legend-item"
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
                  data-section="chart-line-elder-thermo-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-elder-thermo-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-elder-thermo-legend-stats"
            style={{ color: axisColor }}
          >
            {`calm ${run.calmCount} / warm ${run.warmCount} / hot ${run.hotCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineElderThermo.displayName = 'ChartLineElderThermo';
