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
 * ChartLineCoral -- pure-SVG single-panel Coral Trend chart.
 *
 * The Coral Trend indicator is a six-pole Tillson smoothing of the price:
 * the price is run through six cascaded exponential filters, and the third
 * through sixth poles are recombined with the Tillson coefficients (which
 * sum to one), adding a touch of lead to cut the lag a plain moving
 * average carries. The resulting line is coloured by its slope -- rising,
 * falling or flat -- which is the "trend" the indicator names.
 *
 * This primitive overlays the Coral line on the price line in a single
 * panel, drawing the Coral as slope-coloured segments with one coloured
 * marker per bar.
 */

export interface ChartLineCoralPoint {
  x: number;
  value: number;
}

export type ChartLineCoralTrend = 'up' | 'down' | 'flat' | 'none';

export type ChartLineCoralSeriesId = 'price' | 'coral';

export interface ChartLineCoralCoefficients {
  c1: number;
  c2: number;
  c3: number;
  c4: number;
}

export interface ChartLineCoralSample {
  index: number;
  x: number;
  value: number;
  coral: number | null;
  trend: ChartLineCoralTrend;
}

export interface ChartLineCoralRun {
  series: ChartLineCoralPoint[];
  period: number;
  cd: number;
  coral: (number | null)[];
  samples: ChartLineCoralSample[];
  coralFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineCoralSegment {
  index: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  trend: ChartLineCoralTrend;
}

export interface ChartLineCoralMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  coral: number;
  trend: ChartLineCoralTrend;
}

export interface ChartLineCoralDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineCoralLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineCoralDot[];
  segments: ChartLineCoralSegment[];
  markers: ChartLineCoralMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineCoralRun;
}

export interface ChartLineCoralProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCoralPoint[];
  period?: number;
  cd?: number;
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
  showCoral?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCoralSeriesId[];
  defaultHiddenSeries?: ChartLineCoralSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineCoralSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineCoralSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CORAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_CORAL_HEIGHT = 320;
export const DEFAULT_CHART_LINE_CORAL_PADDING = 44;
export const DEFAULT_CHART_LINE_CORAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CORAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CORAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CORAL_PERIOD = 21;
export const DEFAULT_CHART_LINE_CORAL_CD = 0.4;
export const DEFAULT_CHART_LINE_CORAL_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CORAL_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CORAL_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CORAL_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CORAL_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CORAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CORAL_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineCoralFinitePoints(
  data: readonly ChartLineCoralPoint[] | null | undefined,
): ChartLineCoralPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCoralPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLineCoralPeriod(period: unknown, fallback: number): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/**
 * The Tillson coefficients for the constant `cd`. The four coefficients
 * recombine the third through sixth smoothing poles and sum to exactly
 * one, so the Coral of a constant series is that constant.
 */
export function computeLineCoralCoefficients(cd: number): ChartLineCoralCoefficients {
  const d = isFiniteNumber(cd) ? cd : DEFAULT_CHART_LINE_CORAL_CD;
  const d2 = d * d;
  const d3 = d2 * d;
  return {
    c1: -d3,
    c2: 3 * (d2 + d3),
    c3: -3 * (2 * d2 + d + d3),
    c4: 1 + 3 * d + d3 + 3 * d2,
  };
}

/**
 * Coral Trend: a six-pole Tillson smoothing of the values. The price is
 * run through six cascaded exponential filters; the third through sixth
 * poles are recombined with the Tillson coefficients. Seeded from the
 * first finite value, so the line is defined from the first bar.
 */
export function computeLineCoral(
  values: readonly number[] | null | undefined,
  period: number,
  cd: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineCoralPeriod(period, 1);
  const { c1, c2, c3, c4 } = computeLineCoralCoefficients(cd);
  const di = (p - 1) / 2 + 1;
  const alpha = 2 / (di + 1);
  let i1: number | null = null;
  let i2: number | null = null;
  let i3: number | null = null;
  let i4: number | null = null;
  let i5: number | null = null;
  let i6: number | null = null;
  const out: (number | null)[] = [];
  for (const v of values) {
    if (!isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    i1 = i1 === null ? v : i1 + alpha * (v - i1);
    i2 = i2 === null ? i1 : i2 + alpha * (i1 - i2);
    i3 = i3 === null ? i2 : i3 + alpha * (i2 - i3);
    i4 = i4 === null ? i3 : i4 + alpha * (i3 - i4);
    i5 = i5 === null ? i4 : i5 + alpha * (i4 - i5);
    i6 = i6 === null ? i5 : i6 + alpha * (i5 - i6);
    out.push(c1 * i6 + c2 * i5 + c3 * i4 + c4 * i3);
  }
  return out;
}

/** Classify a bar by the slope of the Coral line. */
export function classifyLineCoralTrend(
  coral: number | null,
  prevCoral: number | null,
): ChartLineCoralTrend {
  if (!isFiniteNumber(coral) || !isFiniteNumber(prevCoral)) return 'none';
  if (coral > prevCoral) return 'up';
  if (coral < prevCoral) return 'down';
  return 'flat';
}

export interface ChartLineCoralOptions {
  period?: number;
  cd?: number;
}

/** Run the full Coral Trend pipeline over a set of points. */
export function runLineCoral(
  data: readonly ChartLineCoralPoint[] | null | undefined,
  options: ChartLineCoralOptions = {},
): ChartLineCoralRun {
  const series = getLineCoralFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineCoralPeriod(
    options.period,
    DEFAULT_CHART_LINE_CORAL_PERIOD,
  );
  const cd = isFiniteNumber(options.cd) ? options.cd : DEFAULT_CHART_LINE_CORAL_CD;
  const values = series.map((point) => point.value);
  const coral = computeLineCoral(values, period, cd);

  const samples: ChartLineCoralSample[] = series.map((point, index) => {
    const coralValue = coral[index] ?? null;
    const prevCoral = index > 0 ? coral[index - 1] ?? null : null;
    return {
      index,
      x: point.x,
      value: point.value,
      coral: coralValue,
      trend: classifyLineCoralTrend(coralValue, prevCoral),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let coralFinal: number | null = null;
  for (const sample of samples) {
    if (sample.trend === 'up') upCount += 1;
    else if (sample.trend === 'down') downCount += 1;
    else if (sample.trend === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.coral)) coralFinal = sample.coral;
  }

  return {
    series = [],
    period,
    cd,
    coral,
    samples,
    coralFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineCoralLayoutOptions extends ChartLineCoralOptions {
  data: readonly ChartLineCoralPoint[] | null | undefined;
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
export function computeLineCoralLayout(
  options: ChartLineCoralLayoutOptions,
): ChartLineCoralLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CORAL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CORAL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CORAL_PADDING;

  const run = runLineCoral(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.cd !== undefined ? { cd: options.cd } : {}),
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
    const c = run.coral[index];
    if (isFiniteNumber(c)) {
      if (c < valueMin) valueMin = c;
      if (c > valueMax) valueMax = c;
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
  const priceDots: ChartLineCoralDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = yAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const markers: ChartLineCoralMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.coral)) return;
    markers.push({
      index,
      x: sample.x,
      cx: xAt(index),
      cy: yAt(sample.coral),
      coral: sample.coral,
      trend: sample.trend,
    });
  });

  const segments: ChartLineCoralSegment[] = [];
  for (let i = 1; i < run.samples.length; i += 1) {
    const prev = run.samples[i - 1]!;
    const cur = run.samples[i]!;
    if (!isFiniteNumber(prev.coral) || !isFiniteNumber(cur.coral)) continue;
    segments.push({
      index: i,
      x1: xAt(i - 1),
      y1: yAt(prev.coral),
      x2: xAt(i),
      y2: yAt(cur.coral),
      trend: cur.trend,
    });
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
    segments,
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineCoralChart(
  data: readonly ChartLineCoralPoint[] | null | undefined,
  options: ChartLineCoralOptions = {},
): string {
  const run = runLineCoral(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.coralFinal === null ? 'n/a' : run.coralFinal.toFixed(2);
  return (
    `Line chart with a Coral Trend overlay: the close line with the Coral ` +
    `Trend line -- a six-pole Tillson smoothing of the price -- overlaid, ` +
    `coloured by its slope. The Coral cascades six exponential filters and ` +
    `recombines the third through sixth poles with the Tillson ` +
    `coefficients, adding a touch of lead to cut lag. Across ${total} bars ` +
    `the Coral rises on ${run.upCount}, falls on ${run.downCount} and is ` +
    `flat on ${run.flatCount}. The final Coral value is ${finalText}.`
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
  trend: ChartLineCoralTrend,
  upColor: string,
  downColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (trend === 'up') return upColor;
  if (trend === 'down') return downColor;
  if (trend === 'flat') return flatColor;
  return noneColor;
}

function trendLabelOf(trend: ChartLineCoralTrend): string {
  if (trend === 'up') return 'Rising';
  if (trend === 'down') return 'Falling';
  if (trend === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineCoral -- single-panel pure-SVG Coral Trend chart.
 */
export const ChartLineCoral = forwardRef<HTMLDivElement, ChartLineCoralProps>(
  function ChartLineCoral(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_CORAL_PERIOD,
      cd = DEFAULT_CHART_LINE_CORAL_CD,
      width = DEFAULT_CHART_LINE_CORAL_WIDTH,
      height = DEFAULT_CHART_LINE_CORAL_HEIGHT,
      padding = DEFAULT_CHART_LINE_CORAL_PADDING,
      tickCount = DEFAULT_CHART_LINE_CORAL_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_CORAL_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_CORAL_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_CORAL_PRICE_COLOR,
      upColor = DEFAULT_CHART_LINE_CORAL_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_CORAL_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_CORAL_FLAT_COLOR,
      noneColor = DEFAULT_CHART_LINE_CORAL_NONE_COLOR,
      gridColor = DEFAULT_CHART_LINE_CORAL_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_CORAL_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showCoral = true,
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
    const baseId = `chart-line-coral-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineCoralSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineCoralSeriesId): boolean => hiddenList.includes(id);

    const layout = useMemo(
      () => computeLineCoralLayout({ data, period, cd, width, height, padding }),
      [data, period, cd, width, height, padding],
    );

    const run = layout.run;
    const description = ariaDescription ?? describeLineCoralChart(data, { period, cd });
    const resolvedLabel =
      ariaLabel ?? `Coral Trend chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineCoralSeriesId): void => {
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
        <g data-section="chart-line-coral-tooltip" pointerEvents="none">
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
            data-section="chart-line-coral-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-coral-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-coral-tooltip-coral"
            x={tx + 10}
            y={ty + 51}
            fill="#fbbf24"
            fontSize={11}
            fontWeight={600}
          >
            {`Coral: ${
              hoverSample.coral === null ? 'n/a' : formatValue(hoverSample.coral)
            }`}
          </text>
          <text
            data-section="chart-line-coral-tooltip-trend"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Trend: ${trendLabelOf(hoverSample.trend)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const coralHidden = isHidden('coral') || !showCoral;

    const legendItems: Array<{
      id: ChartLineCoralSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'coral', label: 'Coral Trend', color: upColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-coral"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-cd={run.cd}
        data-coral-final={run.coralFinal === null ? '' : run.coralFinal}
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
          data-section="chart-line-coral-aria-desc"
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
            data-section="chart-line-coral-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-coral-empty"
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
            data-section="chart-line-coral-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-coral-grid">
                {tickValues.map((t, i) => {
                  const gy =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-coral-grid-line"
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
              <g data-section="chart-line-coral-axes">
                <line
                  data-section="chart-line-coral-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-coral-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-coral-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-coral-tick-label"
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
                data-section="chart-line-coral-price-path"
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
              <g data-section="chart-line-coral-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-coral-dot"
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

            {!coralHidden ? (
              <g data-section="chart-line-coral-coral-segments">
                {layout.segments.map((segment) => (
                  <path
                    key={`seg-${segment.index}`}
                    data-section="chart-line-coral-segment"
                    data-trend={segment.trend}
                    d={`M${segment.x1.toFixed(2)},${segment.y1.toFixed(2)} L${segment.x2.toFixed(2)},${segment.y2.toFixed(2)}`}
                    fill="none"
                    stroke={trendColorOf(
                      segment.trend,
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

            {!coralHidden && showMarkers ? (
              <g data-section="chart-line-coral-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-coral-marker"
                    data-trend={marker.trend}
                    data-coral={marker.coral}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={trendColorOf(
                      marker.trend,
                      upColor,
                      downColor,
                      flatColor,
                      noneColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, Coral ${formatValue(
                      marker.coral,
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
              <g data-section="chart-line-coral-badge">
                <rect
                  data-section="chart-line-coral-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={68}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-coral-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`Coral ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-coral-legend"
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
                  data-section="chart-line-coral-legend-item"
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
                    data-section="chart-line-coral-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-coral-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-coral-legend-stats"
              style={{ color: axisColor }}
            >
              {`up ${run.upCount} / down ${run.downCount} / flat ${run.flatCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineCoral.displayName = 'ChartLineCoral';
