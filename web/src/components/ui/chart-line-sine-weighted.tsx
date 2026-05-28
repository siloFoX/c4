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
 * ChartLineSineWeighted -- pure-SVG single-panel Sine Weighted Moving
 * Average chart.
 *
 * The Sine Weighted Moving Average (SWMA) weights its lookback window by a
 * half sine cycle: the weight for window slot k is `sin((k + 1) * pi /
 * (period + 1))`, so the weights climb from a small value at the oldest
 * slot to a peak in the MIDDLE of the window and taper back down at the
 * newest slot. The weighting is symmetric, so the SWMA emphasizes the
 * center of the window and de-emphasizes both the oldest and the newest
 * values -- distinct from a linear WMA (newest-heavy) or a flat SMA.
 *
 * This primitive overlays the SWMA line on the price line in a single
 * panel and marks, per bar, whether the SWMA sits above, below or level
 * with the price.
 */

export interface ChartLineSineWeightedPoint {
  x: number;
  value: number;
}

export type ChartLineSineWeightedZone = 'above' | 'below' | 'equal' | 'none';

export type ChartLineSineWeightedSeriesId = 'price' | 'swma';

export interface ChartLineSineWeightedSample {
  index: number;
  x: number;
  value: number;
  swma: number | null;
  zone: ChartLineSineWeightedZone;
}

export interface ChartLineSineWeightedRun {
  series: ChartLineSineWeightedPoint[];
  period: number;
  weights: number[];
  swma: (number | null)[];
  samples: ChartLineSineWeightedSample[];
  swmaFinal: number | null;
  aboveCount: number;
  belowCount: number;
  equalCount: number;
  ok: boolean;
}

export interface ChartLineSineWeightedMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  swma: number;
  value: number;
  zone: ChartLineSineWeightedZone;
}

export interface ChartLineSineWeightedDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineSineWeightedLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineSineWeightedDot[];
  swmaPath: string;
  markers: ChartLineSineWeightedMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineSineWeightedRun;
}

export interface ChartLineSineWeightedProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSineWeightedPoint[];
  period?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  swmaColor?: string;
  aboveColor?: string;
  belowColor?: string;
  equalColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSwma?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSineWeightedSeriesId[];
  defaultHiddenSeries?: ChartLineSineWeightedSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSineWeightedSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineSineWeightedSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SINE_WEIGHTED_WIDTH = 720;
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_PADDING = 44;
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_PERIOD = 14;
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_SWMA_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_ABOVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_BELOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_EQUAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SINE_WEIGHTED_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineSineWeightedFinitePoints(
  data: readonly ChartLineSineWeightedPoint[] | null | undefined,
): ChartLineSineWeightedPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSineWeightedPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLineSineWeightedPeriod(
  period: unknown,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/**
 * The raw half-sine weights for a window of `period` slots:
 * `weight[k] = sin((k + 1) * pi / (period + 1))`, k = 0..period-1. The
 * weights are positive and symmetric, peaking at the middle of the window.
 */
export function computeLineSineWeightedWeights(period: number): number[] {
  const p = normalizeLineSineWeightedPeriod(period, 1);
  const weights: number[] = [];
  for (let k = 0; k < p; k += 1) {
    weights.push(Math.sin(((k + 1) * Math.PI) / (p + 1)));
  }
  return weights;
}

/**
 * Sine Weighted Moving Average: for each window of `period` values the
 * half-sine weighted average. Defined once a full window is available; a
 * window with a non-finite value yields null.
 */
export function computeLineSineWeighted(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineSineWeightedPeriod(period, 1);
  const weights = computeLineSineWeightedWeights(p);
  let weightSum = 0;
  for (const w of weights) weightSum += w;
  const out: (number | null)[] = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i + 1 < p || weightSum <= 0) {
      out.push(null);
      continue;
    }
    let acc = 0;
    let ok = true;
    for (let k = 0; k < p; k += 1) {
      const v = values[i - p + 1 + k];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      acc += weights[k]! * v;
    }
    out.push(ok ? acc / weightSum : null);
  }
  return out;
}

/** Classify a bar by where the SWMA sits relative to the price. */
export function classifyLineSineWeightedZone(
  swma: number | null,
  value: number,
): ChartLineSineWeightedZone {
  if (!isFiniteNumber(swma)) return 'none';
  if (swma > value) return 'above';
  if (swma < value) return 'below';
  return 'equal';
}

export interface ChartLineSineWeightedOptions {
  period?: number;
}

/** Run the full Sine Weighted Moving Average pipeline over a set of points. */
export function runLineSineWeighted(
  data: readonly ChartLineSineWeightedPoint[] | null | undefined,
  options: ChartLineSineWeightedOptions = {},
): ChartLineSineWeightedRun {
  const series = getLineSineWeightedFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineSineWeightedPeriod(
    options.period,
    DEFAULT_CHART_LINE_SINE_WEIGHTED_PERIOD,
  );
  const weights = computeLineSineWeightedWeights(period);
  const values = series.map((point) => point.value);
  const swma = computeLineSineWeighted(values, period);

  const samples: ChartLineSineWeightedSample[] = series.map((point, index) => {
    const swmaValue = swma[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      swma: swmaValue,
      zone: classifyLineSineWeightedZone(swmaValue, point.value),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let equalCount = 0;
  let swmaFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'equal') equalCount += 1;
    if (isFiniteNumber(sample.swma)) swmaFinal = sample.swma;
  }

  return {
    series = [],
    period,
    weights,
    swma,
    samples,
    swmaFinal,
    aboveCount,
    belowCount,
    equalCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineSineWeightedLayoutOptions
  extends ChartLineSineWeightedOptions {
  data: readonly ChartLineSineWeightedPoint[] | null | undefined;
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
export function computeLineSineWeightedLayout(
  options: ChartLineSineWeightedLayoutOptions,
): ChartLineSineWeightedLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_SINE_WEIGHTED_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_SINE_WEIGHTED_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_SINE_WEIGHTED_PADDING;

  const run = runLineSineWeighted(options.data, {
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
  run.series.forEach((point, index) => {
    if (point.value < valueMin) valueMin = point.value;
    if (point.value > valueMax) valueMax = point.value;
    const s = run.swma[index];
    if (isFiniteNumber(s)) {
      if (s < valueMin) valueMin = s;
      if (s > valueMax) valueMax = s;
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

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineSineWeightedDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = yAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const swmaLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineSineWeightedMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.swma)) return;
    const cx = xAt(index);
    const cy = yAt(sample.swma);
    swmaLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      swma: sample.swma,
      value: sample.value,
      zone: sample.zone,
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
    swmaPath: buildLinePath(swmaLinePoints),
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineSineWeightedChart(
  data: readonly ChartLineSineWeightedPoint[] | null | undefined,
  options: ChartLineSineWeightedOptions = {},
): string {
  const run = runLineSineWeighted(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.swmaFinal === null ? 'n/a' : run.swmaFinal.toFixed(2);
  return (
    `Line chart with a Sine Weighted Moving Average overlay: the price line ` +
    `with a ${run.period}-period SWMA -- a moving average that weights its ` +
    `lookback window by a half sine cycle, giving the most weight to the ` +
    `middle of the window and tapering the oldest and newest values -- ` +
    `overlaid. The SWMA sits above the price on ${run.aboveCount} bars, ` +
    `below on ${run.belowCount} and level on ${run.equalCount}, across ` +
    `${total} bars. The final SWMA is ${finalText}.`
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
  zone: ChartLineSineWeightedZone,
  aboveColor: string,
  belowColor: string,
  equalColor: string,
): string {
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  return equalColor;
}

function zoneLabelOf(zone: ChartLineSineWeightedZone): string {
  if (zone === 'above') return 'SWMA above price';
  if (zone === 'below') return 'SWMA below price';
  if (zone === 'equal') return 'SWMA level with price';
  return 'n/a';
}

/**
 * ChartLineSineWeighted -- single-panel pure-SVG Sine Weighted Moving
 * Average chart.
 */
export const ChartLineSineWeighted = forwardRef<
  HTMLDivElement,
  ChartLineSineWeightedProps
>(function ChartLineSineWeighted(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_SINE_WEIGHTED_PERIOD,
    width = DEFAULT_CHART_LINE_SINE_WEIGHTED_WIDTH,
    height = DEFAULT_CHART_LINE_SINE_WEIGHTED_HEIGHT,
    padding = DEFAULT_CHART_LINE_SINE_WEIGHTED_PADDING,
    tickCount = DEFAULT_CHART_LINE_SINE_WEIGHTED_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SINE_WEIGHTED_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SINE_WEIGHTED_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SINE_WEIGHTED_PRICE_COLOR,
    swmaColor = DEFAULT_CHART_LINE_SINE_WEIGHTED_SWMA_COLOR,
    aboveColor = DEFAULT_CHART_LINE_SINE_WEIGHTED_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_SINE_WEIGHTED_BELOW_COLOR,
    equalColor = DEFAULT_CHART_LINE_SINE_WEIGHTED_EQUAL_COLOR,
    gridColor = DEFAULT_CHART_LINE_SINE_WEIGHTED_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SINE_WEIGHTED_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSwma = true,
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
  const baseId = `chart-line-sine-weighted-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineSineWeightedSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineSineWeightedSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () => computeLineSineWeightedLayout({ data, period, width, height, padding }),
    [data, period, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineSineWeightedChart(data, { period });
  const resolvedLabel =
    ariaLabel ??
    `Sine Weighted Moving Average chart, period ${run.period}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineSineWeightedSeriesId): void => {
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
    const tooltipW = 168;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g data-section="chart-line-sine-weighted-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={80}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-sine-weighted-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-sine-weighted-tooltip-value"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Price: ${formatValue(hoverSample.value)}`}
        </text>
        <text
          data-section="chart-line-sine-weighted-tooltip-swma"
          x={tx + 10}
          y={ty + 51}
          fill="#fdba74"
          fontSize={11}
          fontWeight={600}
        >
          {`SWMA: ${
            hoverSample.swma === null ? 'n/a' : formatValue(hoverSample.swma)
          }`}
        </text>
        <text
          data-section="chart-line-sine-weighted-tooltip-zone"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {zoneLabelOf(hoverSample.zone)}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const swmaHidden = isHidden('swma') || !showSwma;

  const legendItems: Array<{
    id: ChartLineSineWeightedSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'swma', label: `SWMA ${run.period}`, color: swmaColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-sine-weighted"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-swma-final={run.swmaFinal === null ? '' : run.swmaFinal}
      data-above-count={run.aboveCount}
      data-below-count={run.belowCount}
      data-equal-count={run.equalCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-sine-weighted-aria-desc"
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
          data-section="chart-line-sine-weighted-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-sine-weighted-empty"
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
          data-section="chart-line-sine-weighted-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-sine-weighted-grid">
              {tickValues.map((t, i) => {
                const gy =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-sine-weighted-grid-line"
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
            <g data-section="chart-line-sine-weighted-axes">
              <line
                data-section="chart-line-sine-weighted-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-sine-weighted-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-sine-weighted-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-sine-weighted-tick-label"
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
              data-section="chart-line-sine-weighted-price-path"
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
            <g data-section="chart-line-sine-weighted-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-sine-weighted-dot"
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

          {!swmaHidden ? (
            <path
              data-section="chart-line-sine-weighted-swma-path"
              d={layout.swmaPath}
              fill="none"
              stroke={swmaColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Sine Weighted Moving Average line, ${layout.markers.length} bars`}
            />
          ) : null}

          {!swmaHidden && showMarkers ? (
            <g data-section="chart-line-sine-weighted-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-sine-weighted-marker"
                  data-zone={marker.zone}
                  data-swma={marker.swma}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    aboveColor,
                    belowColor,
                    equalColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, SWMA ${formatValue(
                    marker.swma,
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
            <g data-section="chart-line-sine-weighted-badge">
              <rect
                data-section="chart-line-sine-weighted-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={76}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-sine-weighted-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`SWMA ${run.period}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-sine-weighted-legend"
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
                data-section="chart-line-sine-weighted-legend-item"
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
                  data-section="chart-line-sine-weighted-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-sine-weighted-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-sine-weighted-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / below ${run.belowCount} / level ${run.equalCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSineWeighted.displayName = 'ChartLineSineWeighted';
