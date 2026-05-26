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
 * ChartLineTsf -- pure-SVG single-panel Time Series Forecast chart.
 *
 * For each bar `i` with a filled lookback `period`, an ordinary
 * least-squares linear regression of the window's closes against
 * the local position `j = 0 .. period - 1` is computed:
 *
 *   slope     = (N * sumXY - sumX * sumY) / (N * sumXX - sumX^2)
 *   intercept = (sumY - slope * sumX) / N
 *
 * The Time Series Forecast projects the regression line ONE bar
 * forward (to local position `j = N`):
 *
 *   TSF[i] = intercept + slope * N
 *
 * Equivalently, TSF = LSMA(N) at bar `i` + slope. On a perfect
 * linear ramp `TSF[i] = close[i + 1]`. On a constant series the
 * slope is zero and TSF stays at the constant.
 *
 * The chart shares one panel: the close line plus the TSF line,
 * segment-coloured by its own slope (rising / falling / flat) so
 * the projected trend reads at a glance.
 */

export interface ChartLineTsfPoint {
  x: number;
  value: number;
}

export type ChartLineTsfTrend = 'up' | 'down' | 'flat' | 'none';

export type ChartLineTsfSeriesId = 'price' | 'tsf';

export interface ChartLineTsfRegression {
  slope: number;
  intercept: number;
}

export interface ChartLineTsfSample {
  index: number;
  x: number;
  value: number;
  tsf: number | null;
  slope: number | null;
  trend: ChartLineTsfTrend;
}

export interface ChartLineTsfRun {
  series: ChartLineTsfPoint[];
  period: number;
  tsf: Array<number | null>;
  slope: Array<number | null>;
  samples: ChartLineTsfSample[];
  tsfFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineTsfSegment {
  index: number;
  fromCx: number;
  fromCy: number;
  toCx: number;
  toCy: number;
  trend: ChartLineTsfTrend;
}

export interface ChartLineTsfMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  tsf: number;
  trend: ChartLineTsfTrend;
}

export interface ChartLineTsfDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineTsfLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineTsfDot[];
  segments: ChartLineTsfSegment[];
  markers: ChartLineTsfMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineTsfRun;
}

export interface ChartLineTsfProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTsfPoint[];
  period?: number;
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
  showTsf?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTsfSeriesId[];
  defaultHiddenSeries?: ChartLineTsfSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTsfSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineTsfSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TSF_WIDTH = 720;
export const DEFAULT_CHART_LINE_TSF_HEIGHT = 360;
export const DEFAULT_CHART_LINE_TSF_PADDING = 44;
export const DEFAULT_CHART_LINE_TSF_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TSF_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TSF_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TSF_PERIOD = 14;
export const DEFAULT_CHART_LINE_TSF_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TSF_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TSF_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TSF_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_TSF_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TSF_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TSF_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and value. */
export function getLineTsfFinitePoints(
  data: readonly ChartLineTsfPoint[] | null | undefined,
): ChartLineTsfPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTsfPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the lookback to an integer of at least 2. */
export function normalizeLineTsfPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/**
 * Ordinary least-squares regression of `values` against the local
 * position `j = 0 .. N - 1`. Returns null when the input is too
 * short or the X variance is zero.
 */
export function computeLineTsfRegression(
  values: readonly number[],
): ChartLineTsfRegression | null {
  const n = values.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXX = 0;
  let sumXY = 0;
  for (let j = 0; j < n; j += 1) {
    const y = values[j]!;
    sumX += j;
    sumY += y;
    sumXX += j * j;
    sumXY += j * y;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/**
 * Per-bar Time Series Forecast and slope over the rolling window.
 * The first `period - 1` bars are null on both arrays.
 */
export function computeLineTsf(
  values: readonly number[] | null | undefined,
  period: unknown,
): { tsf: Array<number | null>; slope: Array<number | null> } {
  if (!Array.isArray(values) || values.length === 0) {
    return { tsf: [], slope: [] };
  }
  const p = normalizeLineTsfPeriod(period, DEFAULT_CHART_LINE_TSF_PERIOD);
  const tsf: Array<number | null> = [];
  const slope: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < p - 1) {
      tsf.push(null);
      slope.push(null);
      continue;
    }
    const window: number[] = [];
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const v = values[j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      window.push(v);
    }
    if (!ok) {
      tsf.push(null);
      slope.push(null);
      continue;
    }
    const reg = computeLineTsfRegression(window);
    if (!reg) {
      tsf.push(null);
      slope.push(null);
      continue;
    }
    tsf.push(reg.intercept + reg.slope * p);
    slope.push(reg.slope);
  }
  return { tsf, slope };
}

/** Classify the slope of the regression line. */
export function classifyLineTsfTrend(
  slope: number | null | undefined,
): ChartLineTsfTrend {
  if (!isFiniteNumber(slope)) return 'none';
  if (slope > 0) return 'up';
  if (slope < 0) return 'down';
  return 'flat';
}

export interface ChartLineTsfOptions {
  period?: number;
}

/** Run the full TSF pipeline. */
export function runLineTsf(
  data: readonly ChartLineTsfPoint[] | null | undefined,
  options: ChartLineTsfOptions = {},
): ChartLineTsfRun {
  const series = getLineTsfFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineTsfPeriod(
    options.period,
    DEFAULT_CHART_LINE_TSF_PERIOD,
  );
  const { tsf, slope } = computeLineTsf(
    series.map((p) => p.value),
    period,
  );
  const samples: ChartLineTsfSample[] = series.map((point, index) => ({
    index,
    x: point.x,
    value: point.value,
    tsf: tsf[index] ?? null,
    slope: slope[index] ?? null,
    trend: classifyLineTsfTrend(slope[index] ?? null),
  }));
  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let tsfFinal: number | null = null;
  for (const sample of samples) {
    if (sample.trend === 'up') upCount += 1;
    else if (sample.trend === 'down') downCount += 1;
    else if (sample.trend === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.tsf)) tsfFinal = sample.tsf;
  }
  return {
    series,
    period,
    tsf,
    slope,
    samples,
    tsfFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineTsfLayoutOptions extends ChartLineTsfOptions {
  data: readonly ChartLineTsfPoint[] | null | undefined;
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
export function computeLineTsfLayout(
  options: ChartLineTsfLayoutOptions,
): ChartLineTsfLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TSF_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TSF_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TSF_PADDING;

  const run = runLineTsf(options.data, {
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
  for (const sample of run.samples) {
    if (sample.value < valueMin) valueMin = sample.value;
    if (sample.value > valueMax) valueMax = sample.value;
    if (isFiniteNumber(sample.tsf)) {
      if (sample.tsf < valueMin) valueMin = sample.tsf;
      if (sample.tsf > valueMax) valueMax = sample.tsf;
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
  const priceDots: ChartLineTsfDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, value: sample.value });
  });

  const segments: ChartLineTsfSegment[] = [];
  const markers: ChartLineTsfMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.tsf)) return;
    const cx = xAt(index);
    const cy = yAt(sample.tsf);
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      tsf: sample.tsf,
      trend: sample.trend,
    });
    if (index === 0) return;
    const prev = run.samples[index - 1]!;
    if (!isFiniteNumber(prev.tsf)) return;
    const fromCx = xAt(index - 1);
    const fromCy = yAt(prev.tsf);
    segments.push({
      index,
      fromCx,
      fromCy,
      toCx: cx,
      toCy: cy,
      trend: sample.trend,
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
export function describeLineTsfChart(
  data: readonly ChartLineTsfPoint[] | null | undefined,
  options: ChartLineTsfOptions = {},
): string {
  const run = runLineTsf(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.tsfFinal === null ? 'n/a' : run.tsfFinal.toFixed(3);
  return (
    `Single-panel chart with a Time Series Forecast overlay (period ` +
    `${run.period}): each defined bar carries an ordinary least- ` +
    `squares regression of the last ${run.period} closes; the forecast ` +
    `projects the regression line one bar forward as ` +
    `intercept + slope * period. A perfect linear ramp matches the ` +
    `next bar's close exactly. Across ${total} bars the forecast ` +
    `slope is positive on ${run.upCount}, negative on ${run.downCount}, ` +
    `and zero on ${run.flatCount}. The final forecast is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function trendColorOf(
  trend: ChartLineTsfTrend,
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

function trendLabelOf(trend: ChartLineTsfTrend): string {
  if (trend === 'up') return 'Rising';
  if (trend === 'down') return 'Falling';
  if (trend === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineTsf -- single-panel pure-SVG Time Series Forecast chart.
 */
export const ChartLineTsf = forwardRef<HTMLDivElement, ChartLineTsfProps>(
  function ChartLineTsf(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_TSF_PERIOD,
      width = DEFAULT_CHART_LINE_TSF_WIDTH,
      height = DEFAULT_CHART_LINE_TSF_HEIGHT,
      padding = DEFAULT_CHART_LINE_TSF_PADDING,
      tickCount = DEFAULT_CHART_LINE_TSF_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_TSF_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_TSF_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_TSF_PRICE_COLOR,
      upColor = DEFAULT_CHART_LINE_TSF_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_TSF_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_TSF_FLAT_COLOR,
      noneColor = DEFAULT_CHART_LINE_TSF_NONE_COLOR,
      gridColor = DEFAULT_CHART_LINE_TSF_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_TSF_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showTsf = true,
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
    const baseId = `chart-line-tsf-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineTsfSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineTsfSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineTsfLayout({
          data,
          period,
          width,
          height,
          padding,
        }),
      [data, period, width, height, padding],
    );

    const run = layout.run;
    const description = ariaDescription ?? describeLineTsfChart(data, { period });
    const resolvedLabel =
      ariaLabel ?? `Time Series Forecast chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineTsfSeriesId): void => {
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
        <g data-section="chart-line-tsf-tooltip" pointerEvents="none">
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
            data-section="chart-line-tsf-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-tsf-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-tsf-tooltip-tsf"
            x={tx + 10}
            y={ty + 51}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`TSF: ${hoverSample.tsf === null ? 'n/a' : formatValue(hoverSample.tsf)}`}
          </text>
          <text
            data-section="chart-line-tsf-tooltip-slope"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Slope: ${
              hoverSample.slope === null ? 'n/a' : hoverSample.slope.toFixed(4)
            }`}
          </text>
          <text
            data-section="chart-line-tsf-tooltip-trend"
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
    const tsfHidden = isHidden('tsf') || !showTsf;

    const legendItems: Array<{
      id: ChartLineTsfSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'tsf', label: 'TSF', color: upColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-tsf"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-tsf-final={run.tsfFinal === null ? '' : run.tsfFinal}
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
          data-section="chart-line-tsf-aria-desc"
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
            data-section="chart-line-tsf-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-tsf-empty"
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
            data-section="chart-line-tsf-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-tsf-grid">
                {tickValues.map((t, i) => {
                  const y =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-tsf-grid-line"
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
              <g data-section="chart-line-tsf-axes">
                <line
                  data-section="chart-line-tsf-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-tsf-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-tsf-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-tsf-tick-label"
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
                data-section="chart-line-tsf-price-path"
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
              <g data-section="chart-line-tsf-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-tsf-dot"
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

            {!tsfHidden ? (
              <g data-section="chart-line-tsf-segments">
                {layout.segments.map((seg) => (
                  <line
                    key={`seg-${seg.index}`}
                    data-section="chart-line-tsf-segment"
                    data-trend={seg.trend}
                    x1={seg.fromCx}
                    y1={seg.fromCy}
                    x2={seg.toCx}
                    y2={seg.toCy}
                    stroke={trendColorOf(
                      seg.trend,
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

            {!tsfHidden && showMarkers ? (
              <g data-section="chart-line-tsf-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-tsf-marker"
                    data-trend={marker.trend}
                    data-tsf={marker.tsf}
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
                    aria-label={`Bar ${formatX(marker.x)}, TSF ${formatValue(
                      marker.tsf,
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
              <g data-section="chart-line-tsf-badge">
                <rect
                  data-section="chart-line-tsf-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={72}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-tsf-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`TSF ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-tsf-legend"
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
                  data-section="chart-line-tsf-legend-item"
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
                    data-section="chart-line-tsf-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-tsf-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-tsf-legend-stats"
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

ChartLineTsf.displayName = 'ChartLineTsf';
