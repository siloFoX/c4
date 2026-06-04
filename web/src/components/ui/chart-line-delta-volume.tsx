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
 * ChartLineDeltaVolume -- pure-SVG dual-panel chart with a
 * Delta Volume oscillator panel beneath the close. Each bar's
 * volume is signed by the direction of the close relative to
 * the prior close:
 *
 *   sign[i]  = sgn(close[i] - close[i - 1])
 *   delta[i] = sign[i] * volume[i]
 *
 * The seed bar `i = 0` has no prior close and is treated as
 * `sign = 0`, `delta = 0`. A non-finite close or volume nulls
 * the bar (the prior reference is preserved so the next finite
 * bar resumes the signing).
 *
 * Bit-exact anchors:
 *
 *   * **CONST_CLOSE (close[i] == close[i - 1])**: `sign = 0`,
 *     `delta = 0` at every bar -- bit-exact.
 *   * **Rising (close[i] > close[i - 1])**: `sign = +1`,
 *     `delta = +volume[i]` -- bit-exact.
 *   * **Falling (close[i] < close[i - 1])**: `sign = -1`,
 *     `delta = -volume[i]` -- bit-exact.
 *   * **Seed bar**: `delta[0] = 0` (no direction yet).
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the delta volume with
 * a zero baseline.
 */

export interface ChartLineDeltaVolumePoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineDeltaVolumeZone =
  | 'positive'
  | 'flat'
  | 'negative'
  | 'none';

export type ChartLineDeltaVolumeSeriesId = 'price' | 'delta';

export interface ChartLineDeltaVolumeSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  sign: number;
  delta: number | null;
  zone: ChartLineDeltaVolumeZone;
}

export interface ChartLineDeltaVolumeRun {
  series: ChartLineDeltaVolumePoint[];
  delta: Array<number | null>;
  samples: ChartLineDeltaVolumeSample[];
  deltaFinal: number | null;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineDeltaVolumeMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  delta: number;
  zone: ChartLineDeltaVolumeZone;
}

export interface ChartLineDeltaVolumeDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDeltaVolumeLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  deltaTop: number;
  deltaBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineDeltaVolumeDot[];
  deltaPath: string;
  markers: ChartLineDeltaVolumeMarker[];
  priceMin: number;
  priceMax: number;
  deltaMin: number;
  deltaMax: number;
  zeroLineY: number;
  run: ChartLineDeltaVolumeRun;
}

export interface ChartLineDeltaVolumeProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDeltaVolumePoint[];
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  deltaColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  flatColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDelta?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDeltaVolumeSeriesId[];
  defaultHiddenSeries?: ChartLineDeltaVolumeSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDeltaVolumeSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineDeltaVolumeSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatDelta?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_DELTA_VOLUME_WIDTH = 720;
export const DEFAULT_CHART_LINE_DELTA_VOLUME_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DELTA_VOLUME_PADDING = 44;
export const DEFAULT_CHART_LINE_DELTA_VOLUME_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DELTA_VOLUME_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DELTA_VOLUME_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DELTA_VOLUME_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DELTA_VOLUME_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DELTA_VOLUME_DELTA_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_DELTA_VOLUME_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DELTA_VOLUME_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DELTA_VOLUME_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_DELTA_VOLUME_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_DELTA_VOLUME_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DELTA_VOLUME_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DELTA_VOLUME_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `close`, and `volume`. */
export function getLineDeltaVolumeFinitePoints(
  data: readonly ChartLineDeltaVolumePoint[] | null | undefined,
): ChartLineDeltaVolumePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDeltaVolumePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({
        x: point.x,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

/** Compute the close-direction sign as +1, 0, or -1. */
export function computeLineDeltaVolumeSign(
  current: number,
  prior: number,
): number {
  if (!isFiniteNumber(current) || !isFiniteNumber(prior)) return 0;
  if (current > prior) return 1;
  if (current < prior) return -1;
  return 0;
}

/**
 * Compute the signed delta volume per bar. The seed bar
 * (`i = 0`) is zero. A bar whose close or volume is non-finite
 * is nulled and the prior reference is preserved so signing
 * resumes on the next finite bar.
 */
export function computeLineDeltaVolume(
  bars: ReadonlyArray<{ close: number; volume: number }> | null | undefined,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out: Array<number | null> = [];
  let prior: number | null = null;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (!bar || !isFiniteNumber(bar.close) || !isFiniteNumber(bar.volume)) {
      out.push(null);
      continue;
    }
    if (prior === null) {
      out.push(0);
      prior = bar.close;
      continue;
    }
    const sign = computeLineDeltaVolumeSign(bar.close, prior);
    out.push(sign * bar.volume);
    prior = bar.close;
  }
  return out;
}

/** Classify a bar's delta volume contribution. */
export function classifyLineDeltaVolumeZone(
  delta: number | null,
): ChartLineDeltaVolumeZone {
  if (!isFiniteNumber(delta)) return 'none';
  if (delta > 0) return 'positive';
  if (delta < 0) return 'negative';
  return 'flat';
}

/** Run the full Delta Volume pipeline plus sample classification. */
export function runLineDeltaVolume(
  data: readonly ChartLineDeltaVolumePoint[] | null | undefined,
): ChartLineDeltaVolumeRun {
  const series = getLineDeltaVolumeFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const delta = computeLineDeltaVolume(series);
  const samples: ChartLineDeltaVolumeSample[] = series.map((point, index) => {
    const value = delta[index] ?? null;
    const sign =
      value === null || point.volume === 0
        ? 0
        : value > 0
          ? 1
          : value < 0
            ? -1
            : 0;
    return {
      index,
      x: point.x,
      close: point.close,
      volume: point.volume,
      sign,
      delta: value,
      zone: classifyLineDeltaVolumeZone(value),
    };
  });
  let positiveCount = 0;
  let flatCount = 0;
  let negativeCount = 0;
  let deltaFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.delta)) deltaFinal = sample.delta;
  }
  return {
    series,
    delta,
    samples,
    deltaFinal,
    positiveCount,
    flatCount,
    negativeCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineDeltaVolumeLayoutOptions {
  data: readonly ChartLineDeltaVolumePoint[] | null | undefined;
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
export function computeLineDeltaVolumeLayout(
  options: ChartLineDeltaVolumeLayoutOptions,
): ChartLineDeltaVolumeLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_DELTA_VOLUME_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_DELTA_VOLUME_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_DELTA_VOLUME_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_DELTA_VOLUME_PANEL_GAP;

  const run = runLineDeltaVolume(options.data);

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const deltaHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const deltaTop = priceBottom + panelGap;
  const deltaBottom = deltaTop + deltaHeight;

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

  let deltaMin = Infinity;
  let deltaMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.delta)) {
      if (sample.delta < deltaMin) deltaMin = sample.delta;
      if (sample.delta > deltaMax) deltaMax = sample.delta;
    }
  }
  if (!Number.isFinite(deltaMin) || !Number.isFinite(deltaMax)) {
    deltaMin = -1;
    deltaMax = 1;
  }
  if (deltaMin === deltaMax) {
    deltaMin -= 1;
    deltaMax += 1;
  }
  if (deltaMin > 0) deltaMin = 0;
  if (deltaMax < 0) deltaMax = 0;
  const deltaY = (value: number): number =>
    deltaBottom -
    ((value - deltaMin) / (deltaMax - deltaMin)) * deltaHeight;
  const zeroLineY = deltaY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineDeltaVolumeDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const deltaLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineDeltaVolumeMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.delta)) return;
    const cx = xAt(index);
    const yc = deltaY(sample.delta);
    deltaLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      delta: sample.delta,
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
    deltaTop,
    deltaBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    deltaPath: buildLinePath(deltaLinePoints),
    markers,
    priceMin,
    priceMax,
    deltaMin,
    deltaMax,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineDeltaVolumeChart(
  data: readonly ChartLineDeltaVolumePoint[] | null | undefined,
): string {
  const run = runLineDeltaVolume(data);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.deltaFinal === null ? 'n/a' : run.deltaFinal.toFixed(2);
  return (
    `Dual-panel chart with a Delta Volume panel beneath the close. ` +
    `Each bar's volume is signed by the direction of the close ` +
    `relative to the prior close: a rising close gives +volume, a ` +
    `falling close gives -volume, and an unchanged close gives ` +
    `zero. The seed bar contributes zero (no prior reference). ` +
    `Across ${total} bars the delta volume is positive on ` +
    `${run.positiveCount}, flat on ${run.flatCount}, and negative ` +
    `on ${run.negativeCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatDelta(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineDeltaVolumeZone,
  positiveColor: string,
  negativeColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'positive') return positiveColor;
  if (zone === 'negative') return negativeColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineDeltaVolumeZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineDeltaVolume -- dual-panel pure-SVG signed volume
 * oscillator chart.
 */
export const ChartLineDeltaVolume = forwardRef<
  HTMLDivElement,
  ChartLineDeltaVolumeProps
>(function ChartLineDeltaVolume(props, ref) {
  const {
    data,
    width = DEFAULT_CHART_LINE_DELTA_VOLUME_WIDTH,
    height = DEFAULT_CHART_LINE_DELTA_VOLUME_HEIGHT,
    padding = DEFAULT_CHART_LINE_DELTA_VOLUME_PADDING,
    panelGap = DEFAULT_CHART_LINE_DELTA_VOLUME_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DELTA_VOLUME_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DELTA_VOLUME_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DELTA_VOLUME_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DELTA_VOLUME_PRICE_COLOR,
    deltaColor = DEFAULT_CHART_LINE_DELTA_VOLUME_DELTA_COLOR,
    positiveColor = DEFAULT_CHART_LINE_DELTA_VOLUME_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_DELTA_VOLUME_NEGATIVE_COLOR,
    flatColor = DEFAULT_CHART_LINE_DELTA_VOLUME_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_DELTA_VOLUME_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_DELTA_VOLUME_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DELTA_VOLUME_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_DELTA_VOLUME_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDelta = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showZeroLine = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatDelta = defaultFormatDelta,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-delta-volume-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineDeltaVolumeSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineDeltaVolumeSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineDeltaVolumeLayout({
        data,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description = ariaDescription ?? describeLineDeltaVolumeChart(data);
  const resolvedLabel = ariaLabel ?? `Delta Volume chart`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineDeltaVolumeSeriesId): void => {
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
        data-section="chart-line-delta-volume-tooltip"
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
          data-section="chart-line-delta-volume-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-delta-volume-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-delta-volume-tooltip-volume"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Volume: ${formatDelta(hoverSample.volume)}`}
        </text>
        <text
          data-section="chart-line-delta-volume-tooltip-delta"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Delta: ${
            hoverSample.delta === null
              ? 'n/a'
              : formatDelta(hoverSample.delta)
          }`}
        </text>
        <text
          data-section="chart-line-delta-volume-tooltip-zone"
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
  const deltaHidden = isHidden('delta') || !showDelta;

  const legendItems: Array<{
    id: ChartLineDeltaVolumeSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'delta', label: 'Delta Volume', color: deltaColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-delta-volume"
      data-empty={isEmpty ? 'true' : 'false'}
      data-delta-final={run.deltaFinal === null ? '' : run.deltaFinal}
      data-positive-count={run.positiveCount}
      data-flat-count={run.flatCount}
      data-negative-count={run.negativeCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-delta-volume-aria-desc"
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
          data-section="chart-line-delta-volume-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-delta-volume-empty"
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
          data-section="chart-line-delta-volume-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-delta-volume-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yd =
                  layout.deltaBottom -
                  t * (layout.deltaBottom - layout.deltaTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-delta-volume-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-delta-volume-grid-line"
                      data-panel="delta"
                      x1={layout.innerLeft}
                      y1={yd}
                      x2={layout.innerRight}
                      y2={yd}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-delta-volume-axes">
              <line
                data-section="chart-line-delta-volume-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-delta-volume-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-delta-volume-axis"
                data-panel="delta"
                x1={layout.innerLeft}
                y1={layout.deltaTop}
                x2={layout.innerLeft}
                y2={layout.deltaBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-delta-volume-axis"
                data-panel="delta"
                x1={layout.innerLeft}
                y1={layout.deltaBottom}
                x2={layout.innerRight}
                y2={layout.deltaBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-delta-volume-tick-label"
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
                data-section="chart-line-delta-volume-tick-label"
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
                data-section="chart-line-delta-volume-tick-label"
                data-panel="delta"
                x={layout.innerLeft - 6}
                y={layout.deltaTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatDelta(layout.deltaMax)}
              </text>
              <text
                data-section="chart-line-delta-volume-tick-label"
                data-panel="delta"
                x={layout.innerLeft - 6}
                y={layout.deltaBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatDelta(layout.deltaMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-delta-volume-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-delta-volume-price-path"
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
            <g data-section="chart-line-delta-volume-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-delta-volume-dot"
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

          {!deltaHidden ? (
            <path
              data-section="chart-line-delta-volume-line"
              d={layout.deltaPath}
              fill="none"
              stroke={deltaColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Delta Volume line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-delta-volume-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-delta-volume-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-delta={marker.delta}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    positiveColor,
                    negativeColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, delta ${formatDelta(marker.delta)}, ${zoneLabelOf(
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
            <g data-section="chart-line-delta-volume-badge">
              <rect
                data-section="chart-line-delta-volume-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={110}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-delta-volume-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Delta Volume`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-delta-volume-legend"
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
                data-section="chart-line-delta-volume-legend-item"
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
                  data-section="chart-line-delta-volume-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-delta-volume-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-delta-volume-legend-stats"
            style={{ color: axisColor }}
          >
            {`positive ${run.positiveCount} / flat ${run.flatCount} / negative ${run.negativeCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDeltaVolume.displayName = 'ChartLineDeltaVolume';
