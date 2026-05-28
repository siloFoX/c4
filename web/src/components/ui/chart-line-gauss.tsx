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
 * ChartLineGauss -- pure-SVG single-panel Ehlers Gaussian Filter chart.
 *
 * The Ehlers Gaussian Filter is an N-pole cascaded low-pass smoother
 * tuned so the frequency response approximates a Gaussian. For a
 * lookback `period` and a pole count `poles`, the smoothing constant
 * comes from
 *
 *   beta  = (1 - cos(2*pi/period)) / (sqrt(2)^(2/poles) - 1)
 *   alpha = -beta + sqrt(beta^2 + 2*beta)
 *
 * The filter is then N stages of a one-pole EMA cascaded in series:
 *
 *   stage_k[i] = stage_k[i-1] + alpha * (input_k[i] - stage_k[i-1])
 *
 * where the first stage's input is the price and each later stage's
 * input is the previous stage's output. Each one-pole stage has unity
 * DC gain (coefficients sum to one), so the whole cascade passes a
 * constant series through unchanged. Higher pole counts trade more lag
 * for a steeper roll-off and a smoother line.
 *
 * The chart shares one panel: the price line and the Gaussian Filter
 * line are drawn together; the Gaussian Filter line is segment-coloured
 * by its own slope (up / down / flat).
 */

export interface ChartLineGaussPoint {
  x: number;
  value: number;
}

export type ChartLineGaussSlope = 'up' | 'down' | 'flat' | 'none';

export type ChartLineGaussSeriesId = 'price' | 'gauss';

export interface ChartLineGaussSample {
  index: number;
  x: number;
  value: number;
  gauss: number;
  slope: ChartLineGaussSlope;
}

export interface ChartLineGaussRun {
  series: ChartLineGaussPoint[];
  period: number;
  poles: number;
  alpha: number;
  gauss: number[];
  samples: ChartLineGaussSample[];
  gaussFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineGaussSegment {
  index: number;
  fromCx: number;
  fromCy: number;
  toCx: number;
  toCy: number;
  slope: ChartLineGaussSlope;
}

export interface ChartLineGaussMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  gauss: number;
  slope: ChartLineGaussSlope;
}

export interface ChartLineGaussDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineGaussLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineGaussDot[];
  segments: ChartLineGaussSegment[];
  markers: ChartLineGaussMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineGaussRun;
}

export interface ChartLineGaussProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineGaussPoint[];
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
  showGauss?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineGaussSeriesId[];
  defaultHiddenSeries?: ChartLineGaussSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineGaussSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineGaussSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_GAUSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_GAUSS_HEIGHT = 360;
export const DEFAULT_CHART_LINE_GAUSS_PADDING = 44;
export const DEFAULT_CHART_LINE_GAUSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_GAUSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_GAUSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_GAUSS_PERIOD = 14;
export const DEFAULT_CHART_LINE_GAUSS_POLES = 4;
export const DEFAULT_CHART_LINE_GAUSS_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_GAUSS_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_GAUSS_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_GAUSS_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_GAUSS_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_GAUSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_GAUSS_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and value. */
export function getLineGaussFinitePoints(
  data: readonly ChartLineGaussPoint[] | null | undefined,
): ChartLineGaussPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineGaussPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 2, else fallback. */
export function normalizeLineGaussPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the pole count to an integer in [1, 8], else fallback. */
export function normalizeLineGaussPoles(
  poles: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(poles) && poles >= 1) {
    return Math.min(8, Math.max(1, Math.floor(poles)));
  }
  return fallback;
}

/**
 * The Ehlers Gaussian smoothing constant for a given period and pole
 * count:
 *
 *   beta  = (1 - cos(2 * pi / period)) / (sqrt(2)^(2/poles) - 1)
 *   alpha = -beta + sqrt(beta^2 + 2 * beta)
 *
 * Non-finite or out-of-range inputs fall back to the defaults.
 */
export function computeLineGaussAlpha(
  period: unknown,
  poles: unknown,
): number {
  const p = normalizeLineGaussPeriod(period, DEFAULT_CHART_LINE_GAUSS_PERIOD);
  const n = normalizeLineGaussPoles(poles, DEFAULT_CHART_LINE_GAUSS_POLES);
  const cosTerm = Math.cos((2 * Math.PI) / p);
  const denom = Math.pow(Math.sqrt(2), 2 / n) - 1;
  if (!Number.isFinite(denom) || denom === 0) return 0;
  const beta = (1 - cosTerm) / denom;
  const alpha = -beta + Math.sqrt(beta * beta + 2 * beta);
  if (!Number.isFinite(alpha)) return 0;
  return alpha;
}

/**
 * Run the N-pole Gaussian Filter over a series. Each one-pole stage is
 *
 *   stage[i] = stage[i-1] + alpha * (input[i] - stage[i-1])
 *
 * and N stages run in series. Stages are seeded from the first value
 * so the filter is defined from bar 0; non-array input returns `[]`.
 */
export function computeLineGauss(
  values: readonly number[] | null | undefined,
  period: unknown,
  poles: unknown,
): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const n = normalizeLineGaussPoles(poles, DEFAULT_CHART_LINE_GAUSS_POLES);
  const alpha = computeLineGaussAlpha(period, poles);
  const seed = isFiniteNumber(values[0]) ? values[0]! : 0;
  const stages: number[] = Array.from({ length: n }, () => seed);
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const raw = values[i];
    const input = isFiniteNumber(raw) ? raw : seed;
    let carry = input;
    for (let s = 0; s < n; s += 1) {
      const prev = stages[s]!;
      const next = prev + alpha * (carry - prev);
      stages[s] = next;
      carry = next;
    }
    out.push(carry);
  }
  return out;
}

/** Classify the Gaussian Filter slope between two bars. */
export function classifyLineGaussSlope(
  gauss: number | null | undefined,
  prevGauss: number | null | undefined,
): ChartLineGaussSlope {
  if (!isFiniteNumber(gauss) || !isFiniteNumber(prevGauss)) return 'none';
  if (gauss > prevGauss) return 'up';
  if (gauss < prevGauss) return 'down';
  return 'flat';
}

export interface ChartLineGaussOptions {
  period?: number;
  poles?: number;
}

/** Run the full Gaussian Filter pipeline. */
export function runLineGauss(
  data: readonly ChartLineGaussPoint[] | null | undefined,
  options: ChartLineGaussOptions = {},
): ChartLineGaussRun {
  const series = getLineGaussFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineGaussPeriod(
    options.period,
    DEFAULT_CHART_LINE_GAUSS_PERIOD,
  );
  const poles = normalizeLineGaussPoles(
    options.poles,
    DEFAULT_CHART_LINE_GAUSS_POLES,
  );
  const alpha = computeLineGaussAlpha(period, poles);
  const gauss = computeLineGauss(
    series.map((p) => p.value),
    period,
    poles,
  );

  const samples: ChartLineGaussSample[] = series.map((point, index) => {
    const prev = index > 0 ? (gauss[index - 1] ?? null) : null;
    const curr = gauss[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      gauss: curr ?? 0,
      slope: classifyLineGaussSlope(curr, prev),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let gaussFinal: number | null = null;
  for (const sample of samples) {
    if (sample.slope === 'up') upCount += 1;
    else if (sample.slope === 'down') downCount += 1;
    else if (sample.slope === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.gauss)) gaussFinal = sample.gauss;
  }

  return {
    series = [],
    period,
    poles,
    alpha,
    gauss,
    samples,
    gaussFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineGaussLayoutOptions extends ChartLineGaussOptions {
  data: readonly ChartLineGaussPoint[] | null | undefined;
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
export function computeLineGaussLayout(
  options: ChartLineGaussLayoutOptions,
): ChartLineGaussLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_GAUSS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_GAUSS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_GAUSS_PADDING;

  const run = runLineGauss(options.data, {
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
    if (isFiniteNumber(sample.gauss)) {
      if (sample.gauss < valueMin) valueMin = sample.gauss;
      if (sample.gauss > valueMax) valueMax = sample.gauss;
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
  const priceDots: ChartLineGaussDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, value: sample.value });
  });

  const segments: ChartLineGaussSegment[] = [];
  const markers: ChartLineGaussMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.gauss);
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      gauss: sample.gauss,
      slope: sample.slope,
    });
    if (index === 0) return;
    const prev = run.samples[index - 1]!;
    const fromCx = xAt(index - 1);
    const fromCy = yAt(prev.gauss);
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
export function describeLineGaussChart(
  data: readonly ChartLineGaussPoint[] | null | undefined,
  options: ChartLineGaussOptions = {},
): string {
  const run = runLineGauss(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.gaussFinal === null ? 'n/a' : run.gaussFinal.toFixed(2);
  return (
    `Single-panel chart with an Ehlers Gaussian Filter (period ` +
    `${run.period}, poles ${run.poles}): the price line is overlaid by ` +
    `an N-pole cascaded low-pass smoother whose alpha is derived from ` +
    `the Gaussian frequency response. Across ${total} bars the filter ` +
    `rises on ${run.upCount}, falls on ${run.downCount} and is flat ` +
    `on ${run.flatCount}. The final filter value is ${finalText}.`
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
  slope: ChartLineGaussSlope,
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

function slopeLabelOf(slope: ChartLineGaussSlope): string {
  if (slope === 'up') return 'Rising';
  if (slope === 'down') return 'Falling';
  if (slope === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineGauss -- single-panel pure-SVG Ehlers Gaussian Filter chart.
 */
export const ChartLineGauss = forwardRef<HTMLDivElement, ChartLineGaussProps>(
  function ChartLineGauss(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_GAUSS_PERIOD,
      poles = DEFAULT_CHART_LINE_GAUSS_POLES,
      width = DEFAULT_CHART_LINE_GAUSS_WIDTH,
      height = DEFAULT_CHART_LINE_GAUSS_HEIGHT,
      padding = DEFAULT_CHART_LINE_GAUSS_PADDING,
      tickCount = DEFAULT_CHART_LINE_GAUSS_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_GAUSS_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_GAUSS_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_GAUSS_PRICE_COLOR,
      upColor = DEFAULT_CHART_LINE_GAUSS_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_GAUSS_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_GAUSS_FLAT_COLOR,
      noneColor = DEFAULT_CHART_LINE_GAUSS_NONE_COLOR,
      gridColor = DEFAULT_CHART_LINE_GAUSS_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_GAUSS_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showGauss = true,
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
    const baseId = `chart-line-gauss-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<
      ChartLineGaussSeriesId[]
    >(defaultHiddenSeries ?? []);
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineGaussSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineGaussLayout({
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
      describeLineGaussChart(data, { period, poles });
    const resolvedLabel =
      ariaLabel ??
      `Ehlers Gaussian Filter chart, period ${run.period}, poles ${run.poles}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineGaussSeriesId): void => {
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
        <g data-section="chart-line-gauss-tooltip" pointerEvents="none">
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
            data-section="chart-line-gauss-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-gauss-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-gauss-tooltip-gauss"
            x={tx + 10}
            y={ty + 51}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`Filter: ${formatValue(hoverSample.gauss)}`}
          </text>
          <text
            data-section="chart-line-gauss-tooltip-slope"
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
    const gaussHidden = isHidden('gauss') || !showGauss;

    const legendItems: Array<{
      id: ChartLineGaussSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'gauss', label: 'Gaussian Filter', color: upColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-gauss"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-poles={run.poles}
        data-alpha={run.alpha}
        data-gauss-final={run.gaussFinal === null ? '' : run.gaussFinal}
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
          data-section="chart-line-gauss-aria-desc"
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
            data-section="chart-line-gauss-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-gauss-empty"
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
            data-section="chart-line-gauss-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-gauss-grid">
                {tickValues.map((t, i) => {
                  const y =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-gauss-grid-line"
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
              <g data-section="chart-line-gauss-axes">
                <line
                  data-section="chart-line-gauss-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-gauss-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-gauss-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-gauss-tick-label"
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
                data-section="chart-line-gauss-price-path"
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
              <g data-section="chart-line-gauss-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-gauss-dot"
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

            {!gaussHidden ? (
              <g data-section="chart-line-gauss-segments">
                {layout.segments.map((seg) => (
                  <line
                    key={`seg-${seg.index}`}
                    data-section="chart-line-gauss-segment"
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

            {!gaussHidden && showMarkers ? (
              <g data-section="chart-line-gauss-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-gauss-marker"
                    data-slope={marker.slope}
                    data-gauss={marker.gauss}
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
                      marker.gauss,
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
              <g data-section="chart-line-gauss-badge">
                <rect
                  data-section="chart-line-gauss-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={92}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-gauss-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`GAUSS ${run.period}/${run.poles}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-gauss-legend"
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
                  data-section="chart-line-gauss-legend-item"
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
                    data-section="chart-line-gauss-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-gauss-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-gauss-legend-stats"
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

ChartLineGauss.displayName = 'ChartLineGauss';
