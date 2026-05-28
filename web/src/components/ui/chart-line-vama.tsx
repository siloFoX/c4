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
 * ChartLineVama -- pure-SVG single-panel Volume Adjusted Moving
 * Average chart.
 *
 * For each rolling window of `period` bars the mean volume is taken;
 * every bar whose volume sits **above** the window mean is given the
 * weight `volume - volumeMean`, while every bar at or below the mean
 * is given a weight of zero. The Volume Adjusted Moving Average is
 * then the weight-weighted average of the closes:
 *
 *   weight[j] = max(volume[j] - mean(volumes), 0)
 *   VAMA[i]   = sum( close[j] * weight[j] ) / sum( weight[j] )
 *
 * If no bar in the window is above average (every weight is zero --
 * a flat volume regime), the VAMA falls back to a plain simple
 * moving average of the closes. Bars before the lookback fills are
 * null.
 *
 * A high-volume bar therefore pulls the VAMA toward its close; a
 * cluster of low-volume bars pulls the VAMA toward a SMA. The
 * indicator reads price action that comes with conviction.
 */

export interface ChartLineVamaPoint {
  x: number;
  value: number;
  volume: number;
}

export type ChartLineVamaTrend = 'up' | 'down' | 'flat' | 'none';

export type ChartLineVamaSeriesId = 'price' | 'vama';

export interface ChartLineVamaSample {
  index: number;
  x: number;
  value: number;
  volume: number;
  vama: number | null;
  trend: ChartLineVamaTrend;
  weightShare: number | null;
}

export interface ChartLineVamaRun {
  series: ChartLineVamaPoint[];
  period: number;
  vama: Array<number | null>;
  weightShare: Array<number | null>;
  samples: ChartLineVamaSample[];
  vamaFinal: number | null;
  upCount: number;
  downCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineVamaSegment {
  index: number;
  fromCx: number;
  fromCy: number;
  toCx: number;
  toCy: number;
  trend: ChartLineVamaTrend;
}

export interface ChartLineVamaMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  vama: number;
  trend: ChartLineVamaTrend;
}

export interface ChartLineVamaDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineVamaLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineVamaDot[];
  segments: ChartLineVamaSegment[];
  markers: ChartLineVamaMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineVamaRun;
}

export interface ChartLineVamaProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVamaPoint[];
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
  showVama?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVamaSeriesId[];
  defaultHiddenSeries?: ChartLineVamaSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVamaSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineVamaSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VAMA_WIDTH = 720;
export const DEFAULT_CHART_LINE_VAMA_HEIGHT = 360;
export const DEFAULT_CHART_LINE_VAMA_PADDING = 44;
export const DEFAULT_CHART_LINE_VAMA_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VAMA_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VAMA_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VAMA_PERIOD = 14;
export const DEFAULT_CHART_LINE_VAMA_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VAMA_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VAMA_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VAMA_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_VAMA_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_VAMA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VAMA_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite x, value and a non-negative finite volume. */
export function getLineVamaFinitePoints(
  data: readonly ChartLineVamaPoint[] | null | undefined,
): ChartLineVamaPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVamaPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.value) &&
      isFiniteNumber(point.volume) &&
      point.volume >= 0
    ) {
      out.push({ x: point.x, value: point.value, volume: point.volume });
    }
  }
  return out;
}

/** Coerce the lookback to an integer of at least 2. */
export function normalizeLineVamaPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

export interface ChartLineVamaWindowResult {
  vama: number;
  weightSum: number;
  usedFallback: boolean;
}

/**
 * Compute the VAMA for a single window of (price, volume) pairs.
 * Returns `usedFallback = true` and a plain SMA when every weight is
 * zero (a flat-volume regime).
 */
export function computeLineVamaWindow(
  prices: readonly number[],
  volumes: readonly number[],
): ChartLineVamaWindowResult | null {
  const n = prices.length;
  if (n === 0 || volumes.length !== n) return null;
  let sumVol = 0;
  for (const v of volumes) sumVol += v;
  const volMean = sumVol / n;
  let sumW = 0;
  let sumPw = 0;
  for (let i = 0; i < n; i += 1) {
    const w = Math.max(0, volumes[i]! - volMean);
    sumW += w;
    sumPw += prices[i]! * w;
  }
  if (sumW <= 0) {
    let sumP = 0;
    for (const p of prices) sumP += p;
    return { vama: sumP / n, weightSum: 0, usedFallback: true };
  }
  return { vama: sumPw / sumW, weightSum: sumW, usedFallback: false };
}

/** Per-bar rolling VAMA; the first `period - 1` bars are null. */
export function computeLineVama(
  prices: readonly number[] | null | undefined,
  volumes: readonly number[] | null | undefined,
  period: unknown,
): Array<{ vama: number | null; weightShare: number | null }> {
  if (
    !Array.isArray(prices) ||
    !Array.isArray(volumes) ||
    prices.length !== volumes.length
  ) {
    return [];
  }
  const w = normalizeLineVamaPeriod(period, DEFAULT_CHART_LINE_VAMA_PERIOD);
  const out: Array<{ vama: number | null; weightShare: number | null }> = [];
  for (let i = 0; i < prices.length; i += 1) {
    if (i < w - 1) {
      out.push({ vama: null, weightShare: null });
      continue;
    }
    const slicePrices: number[] = [];
    const sliceVolumes: number[] = [];
    let ok = true;
    for (let j = i - w + 1; j <= i; j += 1) {
      const p = prices[j];
      const v = volumes[j];
      if (
        !isFiniteNumber(p) ||
        !isFiniteNumber(v) ||
        v < 0
      ) {
        ok = false;
        break;
      }
      slicePrices.push(p);
      sliceVolumes.push(v);
    }
    if (!ok) {
      out.push({ vama: null, weightShare: null });
      continue;
    }
    const result = computeLineVamaWindow(slicePrices, sliceVolumes);
    if (!result) {
      out.push({ vama: null, weightShare: null });
      continue;
    }
    let sumVol = 0;
    for (const v of sliceVolumes) sumVol += v;
    const share = sumVol > 0 ? result.weightSum / sumVol : 0;
    out.push({ vama: result.vama, weightShare: share });
  }
  return out;
}

/** Classify the VAMA slope. */
export function classifyLineVamaTrend(
  vama: number | null | undefined,
  prevVama: number | null | undefined,
): ChartLineVamaTrend {
  if (!isFiniteNumber(vama) || !isFiniteNumber(prevVama)) return 'none';
  if (vama > prevVama) return 'up';
  if (vama < prevVama) return 'down';
  return 'flat';
}

export interface ChartLineVamaOptions {
  period?: number;
}

/** Run the full VAMA pipeline. */
export function runLineVama(
  data: readonly ChartLineVamaPoint[] | null | undefined,
  options: ChartLineVamaOptions = {},
): ChartLineVamaRun {
  const series = getLineVamaFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineVamaPeriod(
    options.period,
    DEFAULT_CHART_LINE_VAMA_PERIOD,
  );
  const computed = computeLineVama(
    series.map((p) => p.value),
    series.map((p) => p.volume),
    period,
  );
  const vama: Array<number | null> = computed.map((c) => c.vama);
  const weightShare: Array<number | null> = computed.map((c) => c.weightShare);
  const samples: ChartLineVamaSample[] = series.map((point, index) => {
    const prev = index > 0 ? (vama[index - 1] ?? null) : null;
    const curr = vama[index] ?? null;
    return {
      index,
      x: point.x,
      value: point.value,
      volume: point.volume,
      vama: curr,
      trend: classifyLineVamaTrend(curr, prev),
      weightShare: weightShare[index] ?? null,
    };
  });
  let upCount = 0;
  let downCount = 0;
  let flatCount = 0;
  let vamaFinal: number | null = null;
  for (const sample of samples) {
    if (sample.trend === 'up') upCount += 1;
    else if (sample.trend === 'down') downCount += 1;
    else if (sample.trend === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.vama)) vamaFinal = sample.vama;
  }
  return {
    series = [],
    period,
    vama,
    weightShare,
    samples,
    vamaFinal,
    upCount,
    downCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineVamaLayoutOptions extends ChartLineVamaOptions {
  data: readonly ChartLineVamaPoint[] | null | undefined;
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
export function computeLineVamaLayout(
  options: ChartLineVamaLayoutOptions,
): ChartLineVamaLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_VAMA_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_VAMA_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_VAMA_PADDING;

  const run = runLineVama(options.data, {
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
    if (isFiniteNumber(sample.vama)) {
      if (sample.vama < valueMin) valueMin = sample.vama;
      if (sample.vama > valueMax) valueMax = sample.vama;
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
  const priceDots: ChartLineVamaDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, value: sample.value });
  });

  const segments: ChartLineVamaSegment[] = [];
  const markers: ChartLineVamaMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.vama)) return;
    const cx = xAt(index);
    const cy = yAt(sample.vama);
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      vama: sample.vama,
      trend: sample.trend,
    });
    if (index === 0) return;
    const prev = run.samples[index - 1]!;
    if (!isFiniteNumber(prev.vama)) return;
    const fromCx = xAt(index - 1);
    const fromCy = yAt(prev.vama);
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
export function describeLineVamaChart(
  data: readonly ChartLineVamaPoint[] | null | undefined,
  options: ChartLineVamaOptions = {},
): string {
  const run = runLineVama(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.vamaFinal === null ? 'n/a' : run.vamaFinal.toFixed(2);
  return (
    `Single-panel chart with a Volume Adjusted Moving Average ` +
    `(period ${run.period}) overlay: the closes are weighted by the ` +
    `excess volume above the rolling-window average; bars at or below ` +
    `the volume mean contribute nothing, and a flat-volume window ` +
    `falls back to a plain simple moving average. Across ${total} bars ` +
    `the VAMA rises on ${run.upCount}, falls on ${run.downCount} and is ` +
    `flat on ${run.flatCount}. The final VAMA reading is ${finalText}.`
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
  trend: ChartLineVamaTrend,
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

function trendLabelOf(trend: ChartLineVamaTrend): string {
  if (trend === 'up') return 'Rising';
  if (trend === 'down') return 'Falling';
  if (trend === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineVama -- single-panel pure-SVG Volume Adjusted Moving
 * Average chart.
 */
export const ChartLineVama = forwardRef<HTMLDivElement, ChartLineVamaProps>(
  function ChartLineVama(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_VAMA_PERIOD,
      width = DEFAULT_CHART_LINE_VAMA_WIDTH,
      height = DEFAULT_CHART_LINE_VAMA_HEIGHT,
      padding = DEFAULT_CHART_LINE_VAMA_PADDING,
      tickCount = DEFAULT_CHART_LINE_VAMA_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_VAMA_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VAMA_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_VAMA_PRICE_COLOR,
      upColor = DEFAULT_CHART_LINE_VAMA_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_VAMA_DOWN_COLOR,
      flatColor = DEFAULT_CHART_LINE_VAMA_FLAT_COLOR,
      noneColor = DEFAULT_CHART_LINE_VAMA_NONE_COLOR,
      gridColor = DEFAULT_CHART_LINE_VAMA_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VAMA_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showVama = true,
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
    const baseId = `chart-line-vama-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<
      ChartLineVamaSeriesId[]
    >(defaultHiddenSeries ?? []);
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineVamaSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineVamaLayout({
          data,
          period,
          width,
          height,
          padding,
        }),
      [data, period, width, height, padding],
    );

    const run = layout.run;
    const description =
      ariaDescription ?? describeLineVamaChart(data, { period });
    const resolvedLabel =
      ariaLabel ?? `Volume Adjusted Moving Average chart, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineVamaSeriesId): void => {
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
        <g data-section="chart-line-vama-tooltip" pointerEvents="none">
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
            data-section="chart-line-vama-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-vama-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-vama-tooltip-volume"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Volume: ${formatValue(hoverSample.volume)}`}
          </text>
          <text
            data-section="chart-line-vama-tooltip-vama"
            x={tx + 10}
            y={ty + 67}
            fill="#c4b5fd"
            fontSize={11}
            fontWeight={600}
          >
            {`VAMA: ${
              hoverSample.vama === null ? 'n/a' : formatValue(hoverSample.vama)
            }`}
          </text>
          <text
            data-section="chart-line-vama-tooltip-share"
            x={tx + 10}
            y={ty + 83}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Weight share: ${
              hoverSample.weightShare === null
                ? 'n/a'
                : `${(hoverSample.weightShare * 100).toFixed(1)}%`
            }`}
          </text>
          <text
            data-section="chart-line-vama-tooltip-trend"
            x={tx + 10}
            y={ty + 99}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Trend: ${trendLabelOf(hoverSample.trend)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const vamaHidden = isHidden('vama') || !showVama;

    const legendItems: Array<{
      id: ChartLineVamaSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'vama', label: 'VAMA', color: upColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-vama"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-vama-final={run.vamaFinal === null ? '' : run.vamaFinal}
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
          data-section="chart-line-vama-aria-desc"
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
            data-section="chart-line-vama-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-vama-empty"
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
            data-section="chart-line-vama-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-vama-grid">
                {tickValues.map((t, i) => {
                  const y =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-vama-grid-line"
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
              <g data-section="chart-line-vama-axes">
                <line
                  data-section="chart-line-vama-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-vama-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-vama-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-vama-tick-label"
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
                data-section="chart-line-vama-price-path"
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
              <g data-section="chart-line-vama-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-vama-dot"
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

            {!vamaHidden ? (
              <g data-section="chart-line-vama-segments">
                {layout.segments.map((seg) => (
                  <line
                    key={`seg-${seg.index}`}
                    data-section="chart-line-vama-segment"
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

            {!vamaHidden && showMarkers ? (
              <g data-section="chart-line-vama-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-vama-marker"
                    data-trend={marker.trend}
                    data-vama={marker.vama}
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
                    aria-label={`Bar ${formatX(marker.x)}, VAMA ${formatValue(
                      marker.vama,
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
              <g data-section="chart-line-vama-badge">
                <rect
                  data-section="chart-line-vama-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={72}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-vama-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`VAMA ${run.period}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-vama-legend"
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
                  data-section="chart-line-vama-legend-item"
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
                    data-section="chart-line-vama-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-vama-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-vama-legend-stats"
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

ChartLineVama.displayName = 'ChartLineVama';
