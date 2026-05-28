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
 * ChartLineElderThermometer -- pure-SVG dual-panel chart with
 * Alexander Elder's Market Thermometer oscillator panel beneath
 * the close.
 *
 * Definition (Alexander Elder):
 *
 *   highGap[i] = |high[i] - high[i - 1]|
 *   lowGap[i]  = |low[i]  - low[i - 1]|
 *   thermo[i]  = max(highGap[i], lowGap[i])
 *
 * The seed bar (`i = 0`) has no prior reference and is `null`.
 * A bar with non-finite high or low is also `null`; the prior
 * reference is preserved so the next finite bar resumes.
 *
 * Bit-exact anchors:
 *
 *   * **CONST_HL (high and low constant)**: both gaps are 0,
 *     `thermo = 0` bit-exact at every bar past the seed.
 *   * **Rising-by-S (high[i] = h0 + S*i, low[i] = l0 + S*i)**:
 *     highGap = lowGap = S, `thermo = S` bit-exact at every
 *     bar past the seed.
 *   * **Falling-by-S**: same `thermo = S` (absolute gap).
 *   * **Asymmetric gap**: thermo equals the larger of the two
 *     absolute gaps exactly.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the thermometer with
 * a zero baseline (thermometer is non-negative by construction).
 */

export interface ChartLineElderThermometerPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineElderThermometerZone =
  | 'hot'
  | 'cold'
  | 'none';

export type ChartLineElderThermometerSeriesId = 'price' | 'thermo';

export interface ChartLineElderThermometerSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  thermo: number | null;
  zone: ChartLineElderThermometerZone;
}

export interface ChartLineElderThermometerRun {
  series: ChartLineElderThermometerPoint[];
  hotThreshold: number;
  thermo: Array<number | null>;
  samples: ChartLineElderThermometerSample[];
  thermoFinal: number | null;
  hotCount: number;
  coldCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineElderThermometerMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  thermo: number;
  zone: ChartLineElderThermometerZone;
}

export interface ChartLineElderThermometerDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineElderThermometerLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  thermoTop: number;
  thermoBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineElderThermometerDot[];
  thermoPath: string;
  markers: ChartLineElderThermometerMarker[];
  priceMin: number;
  priceMax: number;
  thermoMin: number;
  thermoMax: number;
  thresholdY: number;
  zeroLineY: number;
  run: ChartLineElderThermometerRun;
}

export interface ChartLineElderThermometerProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineElderThermometerPoint[];
  hotThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  thermoColor?: string;
  hotColor?: string;
  coldColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  thresholdColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showThermo?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showThreshold?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineElderThermometerSeriesId[];
  defaultHiddenSeries?: ChartLineElderThermometerSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineElderThermometerSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineElderThermometerSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatThermo?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_WIDTH = 720;
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_PADDING = 44;
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_HOT_THRESHOLD = 2;
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_THERMO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_HOT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_COLD_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_THRESHOLD_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ELDER_THERMOMETER_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineElderThermometerFinitePoints(
  data: readonly ChartLineElderThermometerPoint[] | null | undefined,
): ChartLineElderThermometerPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineElderThermometerPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce a non-negative finite hot-threshold. */
export function normalizeLineElderThermometerThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

/**
 * Compute the Elder Market Thermometer per bar. The seed bar
 * yields `null` (no prior reference). When a bar's high or low
 * is non-finite, the bar yields `null` but the prior reference
 * is preserved so the next finite bar resumes.
 */
export function computeLineElderThermometer(
  bars: ReadonlyArray<{ high: number; low: number }> | null | undefined,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out: Array<number | null> = [];
  let priorHigh: number | null = null;
  let priorLow: number | null = null;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (
      !bar ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low)
    ) {
      out.push(null);
      continue;
    }
    if (priorHigh === null || priorLow === null) {
      out.push(null);
      priorHigh = bar.high;
      priorLow = bar.low;
      continue;
    }
    const highGap = Math.abs(bar.high - priorHigh);
    const lowGap = Math.abs(bar.low - priorLow);
    out.push(highGap > lowGap ? highGap : lowGap);
    priorHigh = bar.high;
    priorLow = bar.low;
  }
  return out;
}

/** Classify a thermometer reading against the hot threshold. */
export function classifyLineElderThermometerZone(
  value: number | null,
  threshold: number,
): ChartLineElderThermometerZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'hot';
  return 'cold';
}

export interface ChartLineElderThermometerOptions {
  hotThreshold?: number;
}

/** Run the full Elder Thermometer pipeline plus sample classification. */
export function runLineElderThermometer(
  data: readonly ChartLineElderThermometerPoint[] | null | undefined,
  options: ChartLineElderThermometerOptions = {},
): ChartLineElderThermometerRun {
  const series = getLineElderThermometerFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const hotThreshold = normalizeLineElderThermometerThreshold(
    options.hotThreshold,
    DEFAULT_CHART_LINE_ELDER_THERMOMETER_HOT_THRESHOLD,
  );
  const thermo = computeLineElderThermometer(series);
  const samples: ChartLineElderThermometerSample[] = series.map(
    (point, index) => {
      const value = thermo[index] ?? null;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        thermo: value,
        zone: classifyLineElderThermometerZone(value, hotThreshold),
      };
    },
  );
  let hotCount = 0;
  let coldCount = 0;
  let noneCount = 0;
  let thermoFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'hot') hotCount += 1;
    else if (sample.zone === 'cold') coldCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.thermo)) thermoFinal = sample.thermo;
  }
  return {
    series = [],
    hotThreshold,
    thermo,
    samples,
    thermoFinal,
    hotCount,
    coldCount,
    noneCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineElderThermometerLayoutOptions
  extends ChartLineElderThermometerOptions {
  data: readonly ChartLineElderThermometerPoint[] | null | undefined;
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
export function computeLineElderThermometerLayout(
  options: ChartLineElderThermometerLayoutOptions,
): ChartLineElderThermometerLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ELDER_THERMOMETER_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ELDER_THERMOMETER_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ELDER_THERMOMETER_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_ELDER_THERMOMETER_PANEL_GAP;

  const run = runLineElderThermometer(options.data, {
    ...(options.hotThreshold !== undefined
      ? { hotThreshold: options.hotThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const thermoHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const thermoTop = priceBottom + panelGap;
  const thermoBottom = thermoTop + thermoHeight;

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

  let thermoMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.thermo)) {
      if (sample.thermo > thermoMax) thermoMax = sample.thermo;
    }
  }
  if (!Number.isFinite(thermoMax)) {
    thermoMax = 1;
  }
  // The thermometer is non-negative; clamp min to 0 and include
  // the threshold and a positive max.
  let thermoMin = 0;
  if (run.hotThreshold > thermoMax) thermoMax = run.hotThreshold;
  if (thermoMin === thermoMax) {
    thermoMax += 1;
  }
  const thermoY = (value: number): number =>
    thermoBottom -
    ((value - thermoMin) / (thermoMax - thermoMin)) * thermoHeight;
  const thresholdY = thermoY(run.hotThreshold);
  const zeroLineY = thermoY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineElderThermometerDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const thermoLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineElderThermometerMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.thermo)) return;
    const cx = xAt(index);
    const yc = thermoY(sample.thermo);
    thermoLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      thermo: sample.thermo,
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
    thermoTop,
    thermoBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    thermoPath: buildLinePath(thermoLinePoints),
    markers,
    priceMin,
    priceMax,
    thermoMin,
    thermoMax,
    thresholdY,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineElderThermometerChart(
  data: readonly ChartLineElderThermometerPoint[] | null | undefined,
  options: ChartLineElderThermometerOptions = {},
): string {
  const run = runLineElderThermometer(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.thermoFinal === null ? 'n/a' : run.thermoFinal.toFixed(4);
  return (
    `Dual-panel chart with an Elder Market Thermometer oscillator ` +
    `panel beneath the close (hot threshold ${run.hotThreshold}). ` +
    `The thermometer is the larger of the high-gap and low-gap ` +
    `magnitudes relative to the prior bar: thermo = max(|high - ` +
    `priorHigh|, |low - priorLow|). The series is non-negative ` +
    `by construction. Across ${total} bars the thermometer is ` +
    `hot on ${run.hotCount}, cold on ${run.coldCount}, and ` +
    `undefined on ${run.noneCount}. The final reading is ` +
    `${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatThermo(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineElderThermometerZone,
  hotColor: string,
  coldColor: string,
  noneColor: string,
): string {
  if (zone === 'hot') return hotColor;
  if (zone === 'cold') return coldColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineElderThermometerZone): string {
  if (zone === 'hot') return 'Hot';
  if (zone === 'cold') return 'Cold';
  return 'n/a';
}

/**
 * ChartLineElderThermometer -- dual-panel pure-SVG Elder Market
 * Thermometer chart.
 */
export const ChartLineElderThermometer = forwardRef<
  HTMLDivElement,
  ChartLineElderThermometerProps
>(function ChartLineElderThermometer(props, ref) {
  const {
    data,
    hotThreshold = DEFAULT_CHART_LINE_ELDER_THERMOMETER_HOT_THRESHOLD,
    width = DEFAULT_CHART_LINE_ELDER_THERMOMETER_WIDTH,
    height = DEFAULT_CHART_LINE_ELDER_THERMOMETER_HEIGHT,
    padding = DEFAULT_CHART_LINE_ELDER_THERMOMETER_PADDING,
    panelGap = DEFAULT_CHART_LINE_ELDER_THERMOMETER_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ELDER_THERMOMETER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ELDER_THERMOMETER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ELDER_THERMOMETER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ELDER_THERMOMETER_PRICE_COLOR,
    thermoColor = DEFAULT_CHART_LINE_ELDER_THERMOMETER_THERMO_COLOR,
    hotColor = DEFAULT_CHART_LINE_ELDER_THERMOMETER_HOT_COLOR,
    coldColor = DEFAULT_CHART_LINE_ELDER_THERMOMETER_COLD_COLOR,
    noneColor = DEFAULT_CHART_LINE_ELDER_THERMOMETER_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_ELDER_THERMOMETER_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ELDER_THERMOMETER_GRID_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ELDER_THERMOMETER_THRESHOLD_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_ELDER_THERMOMETER_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showThermo = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showThreshold = true,
    showZeroLine = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatThermo = defaultFormatThermo,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-elder-thermometer-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineElderThermometerSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineElderThermometerSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineElderThermometerLayout({
        data,
        hotThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, hotThreshold, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineElderThermometerChart(data, { hotThreshold });
  const resolvedLabel =
    ariaLabel ??
    `Elder Market Thermometer chart, threshold ${run.hotThreshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineElderThermometerSeriesId): void => {
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
        data-section="chart-line-elder-thermometer-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={102}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-elder-thermometer-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-elder-thermometer-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-elder-thermometer-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-elder-thermometer-tooltip-thermo"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Thermo: ${
            hoverSample.thermo === null
              ? 'n/a'
              : formatThermo(hoverSample.thermo)
          }`}
        </text>
        <text
          data-section="chart-line-elder-thermometer-tooltip-zone"
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
  const thermoHidden = isHidden('thermo') || !showThermo;

  const legendItems: Array<{
    id: ChartLineElderThermometerSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'thermo', label: 'Elder Thermometer', color: thermoColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-elder-thermometer"
      data-empty={isEmpty ? 'true' : 'false'}
      data-hot-threshold={run.hotThreshold}
      data-thermo-final={
        run.thermoFinal === null ? '' : run.thermoFinal
      }
      data-hot-count={run.hotCount}
      data-cold-count={run.coldCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-elder-thermometer-aria-desc"
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
          data-section="chart-line-elder-thermometer-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-elder-thermometer-empty"
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
          data-section="chart-line-elder-thermometer-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-elder-thermometer-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yt =
                  layout.thermoBottom -
                  t * (layout.thermoBottom - layout.thermoTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-elder-thermometer-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-elder-thermometer-grid-line"
                      data-panel="thermo"
                      x1={layout.innerLeft}
                      y1={yt}
                      x2={layout.innerRight}
                      y2={yt}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-elder-thermometer-axes">
              <line
                data-section="chart-line-elder-thermometer-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-thermometer-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-thermometer-axis"
                data-panel="thermo"
                x1={layout.innerLeft}
                y1={layout.thermoTop}
                x2={layout.innerLeft}
                y2={layout.thermoBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-elder-thermometer-axis"
                data-panel="thermo"
                x1={layout.innerLeft}
                y1={layout.thermoBottom}
                x2={layout.innerRight}
                y2={layout.thermoBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-elder-thermometer-tick-label"
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
                data-section="chart-line-elder-thermometer-tick-label"
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
                data-section="chart-line-elder-thermometer-tick-label"
                data-panel="thermo"
                x={layout.innerLeft - 6}
                y={layout.thermoTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatThermo(layout.thermoMax)}
              </text>
              <text
                data-section="chart-line-elder-thermometer-tick-label"
                data-panel="thermo"
                x={layout.innerLeft - 6}
                y={layout.thermoBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatThermo(layout.thermoMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-elder-thermometer-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {showThreshold ? (
            <line
              data-section="chart-line-elder-thermometer-threshold"
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={thresholdColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-elder-thermometer-price-path"
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
            <g data-section="chart-line-elder-thermometer-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-elder-thermometer-dot"
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

          {!thermoHidden ? (
            <path
              data-section="chart-line-elder-thermometer-line"
              d={layout.thermoPath}
              fill="none"
              stroke={thermoColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Elder Thermometer line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-elder-thermometer-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-elder-thermometer-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-thermo={marker.thermo}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    hotColor,
                    coldColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Thermo ${formatThermo(marker.thermo)}, ${zoneLabelOf(
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
            <g data-section="chart-line-elder-thermometer-badge">
              <rect
                data-section="chart-line-elder-thermometer-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-elder-thermometer-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Elder Thermometer T=${run.hotThreshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-elder-thermometer-legend"
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
                data-section="chart-line-elder-thermometer-legend-item"
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
                  data-section="chart-line-elder-thermometer-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-elder-thermometer-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-elder-thermometer-legend-stats"
            style={{ color: axisColor }}
          >
            {`hot ${run.hotCount} / cold ${run.coldCount} / undefined ${run.noneCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineElderThermometer.displayName = 'ChartLineElderThermometer';
