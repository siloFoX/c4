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
 * ChartLineHlMean -- pure-SVG single-panel chart with the close
 * overlaid by a "High Low Mean" line, which is the rolling SMA of
 * the bar midpoint `(high + low) / 2` across the lookback:
 *
 *   midpoint[i] = (high[i] + low[i]) / 2
 *   hlMean[i]   = SMA(midpoint, length)[i]
 *
 * Bars before `i = length - 1` are warmup nulls. A bar is also
 * `null` when any of `high`, `low`, or `close` is non-finite.
 *
 * Bit-exact anchor: **CONST high=low=close=K**. Every midpoint is K,
 * the SMA of `K` is `K`, and the close equals the mean exactly so the
 * zone is `'at'` and no crosses are detected. Verified for `K in
 * {0, 1, 5, 100, -3}` and `length in {3, 4, 7, 10}` in the integration
 * sweep.
 *
 * Additional bit-exact anchor: **ASYMMETRIC CONST high=H, low=L,
 * close=C** with constant H, L, C. The midpoint is `(H+L)/2` at every
 * bar, the SMA collapses to `(H+L)/2`, and the zone is determined by
 * `C` versus `(H+L)/2`. For H=10, L=2, C=8 -> mean=6, close=8 -> zone
 * `'above'` on every valid bar (bit-exact).
 */

export interface ChartLineHlMeanPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineHlMeanZone = 'above' | 'below' | 'at' | 'none';

export type ChartLineHlMeanCross = 'up' | 'down' | null;

export type ChartLineHlMeanSeriesId = 'price' | 'mean';

export interface ChartLineHlMeanSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  midpoint: number | null;
  hlMean: number | null;
  zone: ChartLineHlMeanZone;
  crossed: ChartLineHlMeanCross;
}

export interface ChartLineHlMeanRun {
  series: ChartLineHlMeanPoint[];
  length: number;
  midpointValues: Array<number | null>;
  hlMeanValues: Array<number | null>;
  samples: ChartLineHlMeanSample[];
  aboveCount: number;
  belowCount: number;
  atCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineHlMeanMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  hlMean: number;
  crossed: 'up' | 'down';
}

export interface ChartLineHlMeanDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHlMeanLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineHlMeanDot[];
  meanPath: string;
  markers: ChartLineHlMeanMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineHlMeanRun;
}

export interface ChartLineHlMeanProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHlMeanPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  meanStrokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  meanColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMean?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHlMeanSeriesId[];
  defaultHiddenSeries?: ChartLineHlMeanSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHlMeanSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineHlMeanSample }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HL_MEAN_WIDTH = 720;
export const DEFAULT_CHART_LINE_HL_MEAN_HEIGHT = 380;
export const DEFAULT_CHART_LINE_HL_MEAN_PADDING = 44;
export const DEFAULT_CHART_LINE_HL_MEAN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HL_MEAN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HL_MEAN_MEAN_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HL_MEAN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HL_MEAN_LENGTH = 14;
export const DEFAULT_CHART_LINE_HL_MEAN_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HL_MEAN_MEAN_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_HL_MEAN_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HL_MEAN_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HL_MEAN_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HL_MEAN_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineHlMeanFinitePoints(
  data: readonly ChartLineHlMeanPoint[] | null | undefined,
): ChartLineHlMeanPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHlMeanPoint[] = [];
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

/** Coerce a positive integer length (>= 1). */
export function normalizeLineHlMeanLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Midpoint of the bar `(high + low) / 2`. */
export function computeLineHlMeanMidpoints(
  series: readonly ChartLineHlMeanPoint[],
): Array<number | null> {
  const out: Array<number | null> = [];
  for (const point of series) {
    if (!isFiniteNumber(point.high) || !isFiniteNumber(point.low)) {
      out.push(null);
      continue;
    }
    out.push((point.high + point.low) / 2);
  }
  return out;
}

/** SMA over the midpoint series (nulls in the window short-circuit). */
export function applyLineHlMeanSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / length : null);
  }
  return out;
}

export interface ChartLineHlMeanOptions {
  length?: number;
}

export interface ChartLineHlMeanChannels {
  midpoint: Array<number | null>;
  hlMean: Array<number | null>;
}

/** Compute the High Low Mean pipeline. */
export function computeLineHlMean(
  series: readonly ChartLineHlMeanPoint[] | null | undefined,
  options: ChartLineHlMeanOptions = {},
): ChartLineHlMeanChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return { midpoint: [], hlMean: [] };
  }
  const length = normalizeLineHlMeanLength(
    options.length,
    DEFAULT_CHART_LINE_HL_MEAN_LENGTH,
  );
  const midpoint = computeLineHlMeanMidpoints(series);
  const hlMean = applyLineHlMeanSma(midpoint, length);
  return { midpoint, hlMean };
}

/** Classify a (close, hlMean) pair. */
export function classifyLineHlMeanZone(
  close: number,
  hlMean: number | null,
): ChartLineHlMeanZone {
  if (hlMean == null || !isFiniteNumber(hlMean)) return 'none';
  if (!isFiniteNumber(close)) return 'none';
  if (close > hlMean) return 'above';
  if (close < hlMean) return 'below';
  return 'at';
}

/**
 * Detect close-vs-mean crosses. `'up'` when the previous defined zone
 * was `below`/`at` and the current is `above`; `'down'` is the mirror.
 */
export function detectLineHlMeanCrosses(
  zones: readonly ChartLineHlMeanZone[],
): Array<ChartLineHlMeanCross> {
  const out: Array<ChartLineHlMeanCross> = [];
  let prev: ChartLineHlMeanZone | null = null;
  for (let i = 0; i < zones.length; i += 1) {
    const zone = zones[i] ?? 'none';
    if (zone === 'none') {
      out.push(null);
      continue;
    }
    if (prev === null) {
      out.push(null);
      prev = zone;
      continue;
    }
    if ((prev === 'below' || prev === 'at') && zone === 'above') {
      out.push('up');
    } else if ((prev === 'above' || prev === 'at') && zone === 'below') {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = zone;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineHlMean(
  data: readonly ChartLineHlMeanPoint[] | null | undefined,
  options: ChartLineHlMeanOptions = {},
): ChartLineHlMeanRun {
  const series = getLineHlMeanFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineHlMeanLength(
    options.length,
    DEFAULT_CHART_LINE_HL_MEAN_LENGTH,
  );
  const channels = computeLineHlMean(series, { length });
  const zones: ChartLineHlMeanZone[] = series.map((point, index) =>
    classifyLineHlMeanZone(point.close, channels.hlMean[index] ?? null),
  );
  const crosses = detectLineHlMeanCrosses(zones);
  const samples: ChartLineHlMeanSample[] = series.map((point, index) => ({
    index,
    x: point.x,
    high: point.high,
    low: point.low,
    close: point.close,
    midpoint: channels.midpoint[index] ?? null,
    hlMean: channels.hlMean[index] ?? null,
    zone: zones[index] ?? 'none',
    crossed: crosses[index] ?? null,
  }));
  let aboveCount = 0;
  let belowCount = 0;
  let atCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series,
    length,
    midpointValues: channels.midpoint,
    hlMeanValues: channels.hlMean,
    samples,
    aboveCount,
    belowCount,
    atCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length,
  };
}

export interface ChartLineHlMeanLayoutOptions extends ChartLineHlMeanOptions {
  data: readonly ChartLineHlMeanPoint[] | null | undefined;
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
export function computeLineHlMeanLayout(
  options: ChartLineHlMeanLayoutOptions,
): ChartLineHlMeanLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_HL_MEAN_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_HL_MEAN_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_HL_MEAN_PADDING;

  const run = runLineHlMean(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
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

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < yMin) yMin = sample.close;
    if (sample.close > yMax) yMax = sample.close;
    if (isFiniteNumber(sample.hlMean)) {
      if (sample.hlMean < yMin) yMin = sample.hlMean;
      if (sample.hlMean > yMax) yMax = sample.hlMean;
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - yMin) / (yMax - yMin)) * innerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineHlMeanDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const meanLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineHlMeanMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.hlMean)) return;
    const cx = xAt(index);
    const yc = yAt(sample.hlMean);
    meanLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yAt(sample.close),
        close: sample.close,
        hlMean: sample.hlMean,
        crossed: sample.crossed,
      });
    }
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
    meanPath: buildLinePath(meanLinePoints),
    markers,
    yMin,
    yMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineHlMeanChart(
  data: readonly ChartLineHlMeanPoint[] | null | undefined,
  options: ChartLineHlMeanOptions = {},
): string {
  const run = runLineHlMean(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Single-panel chart with the close overlaid by the High Low Mean ` +
    `line, computed as the SMA of the bar midpoint ` +
    `(high + low) / 2 across length ${run.length}. Across ${total} ` +
    `bars the close was above the mean on ${run.aboveCount}, below on ` +
    `${run.belowCount}, exactly at on ${run.atCount}, and undefined on ` +
    `${run.noneCount}, with ${run.bullishCrossCount} bullish and ` +
    `${run.bearishCrossCount} bearish crosses.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function markerColorOf(
  crossed: 'up' | 'down',
  bullishColor: string,
  bearishColor: string,
): string {
  if (crossed === 'up') return bullishColor;
  return bearishColor;
}

function zoneLabelOf(zone: ChartLineHlMeanZone): string {
  if (zone === 'above') return 'Above';
  if (zone === 'below') return 'Below';
  if (zone === 'at') return 'At';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineHlMeanCross): string {
  if (crossed === 'up') return 'Bullish cross';
  if (crossed === 'down') return 'Bearish cross';
  return '-';
}

/** ChartLineHlMean -- single-panel pure-SVG chart. */
export const ChartLineHlMean = forwardRef<
  HTMLDivElement,
  ChartLineHlMeanProps
>(function ChartLineHlMean(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_HL_MEAN_LENGTH,
    width = DEFAULT_CHART_LINE_HL_MEAN_WIDTH,
    height = DEFAULT_CHART_LINE_HL_MEAN_HEIGHT,
    padding = DEFAULT_CHART_LINE_HL_MEAN_PADDING,
    tickCount = DEFAULT_CHART_LINE_HL_MEAN_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HL_MEAN_STROKE_WIDTH,
    meanStrokeWidth = DEFAULT_CHART_LINE_HL_MEAN_MEAN_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HL_MEAN_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HL_MEAN_PRICE_COLOR,
    meanColor = DEFAULT_CHART_LINE_HL_MEAN_MEAN_COLOR,
    bullishColor = DEFAULT_CHART_LINE_HL_MEAN_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_HL_MEAN_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_HL_MEAN_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HL_MEAN_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMean = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-hl-mean-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineHlMeanSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineHlMeanSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineHlMeanLayout({
        data,
        length,
        width,
        height,
        padding,
      }),
    [data, length, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineHlMeanChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `High Low Mean chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineHlMeanSeriesId): void => {
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
    const tooltipW = 250;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g data-section="chart-line-hl-mean-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={150}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-hl-mean-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-hl-mean-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatPrice(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-hl-mean-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-hl-mean-tooltip-close"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-hl-mean-tooltip-mid"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Midpoint: ${
            hoverSample.midpoint === null
              ? 'n/a'
              : formatPrice(hoverSample.midpoint)
          }`}
        </text>
        <text
          data-section="chart-line-hl-mean-tooltip-mean"
          x={tx + 10}
          y={ty + 103}
          fill="#fdba74"
          fontSize={11}
          fontWeight={600}
        >
          {`HL Mean: ${
            hoverSample.hlMean === null
              ? 'n/a'
              : formatPrice(hoverSample.hlMean)
          }`}
        </text>
        <text
          data-section="chart-line-hl-mean-tooltip-zone"
          x={tx + 10}
          y={ty + 121}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-hl-mean-tooltip-cross"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const meanHidden = isHidden('mean') || !showMean;

  const legendItems: Array<{
    id: ChartLineHlMeanSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'mean', label: 'HL Mean', color: meanColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-hl-mean"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-above-count={run.aboveCount}
      data-below-count={run.belowCount}
      data-at-count={run.atCount}
      data-none-count={run.noneCount}
      data-bullish-cross-count={run.bullishCrossCount}
      data-bearish-cross-count={run.bearishCrossCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-hl-mean-aria-desc"
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
          data-section="chart-line-hl-mean-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-hl-mean-empty"
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
          data-section="chart-line-hl-mean-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-hl-mean-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-hl-mean-grid-line"
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
            <g data-section="chart-line-hl-mean-axes">
              <line
                data-section="chart-line-hl-mean-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hl-mean-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-hl-mean-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMax)}
              </text>
              <text
                data-section="chart-line-hl-mean-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMin)}
              </text>
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-hl-mean-price-path"
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
            <g data-section="chart-line-hl-mean-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-hl-mean-dot"
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

          {!meanHidden ? (
            <path
              data-section="chart-line-hl-mean-line"
              d={layout.meanPath}
              fill="none"
              stroke={meanColor}
              strokeWidth={meanStrokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`High Low Mean line, length ${run.length}`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-hl-mean-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-hl-mean-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-hl-mean={marker.hlMean}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={markerColorOf(
                    marker.crossed,
                    bullishColor,
                    bearishColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, HL mean ${formatPrice(marker.hlMean)}, ${crossLabelOf(
                    marker.crossed,
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
            <g data-section="chart-line-hl-mean-badge">
              <rect
                data-section="chart-line-hl-mean-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={180}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-hl-mean-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`HL Mean SMA ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-hl-mean-legend"
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
                data-section="chart-line-hl-mean-legend-item"
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
                  data-section="chart-line-hl-mean-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-hl-mean-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-hl-mean-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / below ${run.belowCount} / crosses ${run.bullishCrossCount + run.bearishCrossCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHlMean.displayName = 'ChartLineHlMean';
