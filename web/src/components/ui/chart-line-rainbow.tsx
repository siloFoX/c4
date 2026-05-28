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
 * ChartLineRainbow -- pure-SVG single-panel Rainbow Moving Average chart.
 *
 * The Rainbow Moving Average is a fan of recursively smoothed bands: the
 * first band is a simple moving average of the price, and every next band
 * is a simple moving average of the band before it. Each successive band
 * is smoother and lags more, so plotted together they fan out like a
 * rainbow -- wide apart in a strong trend, tightly tangled during
 * consolidation.
 *
 * This primitive overlays the rainbow fan on the price line in a single
 * panel and marks, per bar, whether the price runs above the whole
 * rainbow, below it or tangled inside it.
 */

export interface ChartLineRainbowPoint {
  x: number;
  value: number;
}

export type ChartLineRainbowZone = 'above' | 'below' | 'inside' | 'none';

export type ChartLineRainbowSeriesId = 'price' | 'rainbow';

export interface ChartLineRainbowSample {
  index: number;
  x: number;
  value: number;
  envelopeLow: number | null;
  envelopeHigh: number | null;
  zone: ChartLineRainbowZone;
}

export interface ChartLineRainbowRun {
  series: ChartLineRainbowPoint[];
  period: number;
  bandCount: number;
  bands: (number | null)[][];
  samples: ChartLineRainbowSample[];
  aboveCount: number;
  belowCount: number;
  insideCount: number;
  ok: boolean;
}

export interface ChartLineRainbowBandPath {
  index: number;
  path: string;
  color: string;
}

export interface ChartLineRainbowMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
  zone: ChartLineRainbowZone;
}

export interface ChartLineRainbowLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  bandPaths: ChartLineRainbowBandPath[];
  markers: ChartLineRainbowMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineRainbowRun;
}

export interface ChartLineRainbowProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRainbowPoint[];
  period?: number;
  bandCount?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  bandStrokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  aboveColor?: string;
  belowColor?: string;
  insideColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showRainbow?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRainbowSeriesId[];
  defaultHiddenSeries?: ChartLineRainbowSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineRainbowSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineRainbowSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RAINBOW_WIDTH = 720;
export const DEFAULT_CHART_LINE_RAINBOW_HEIGHT = 320;
export const DEFAULT_CHART_LINE_RAINBOW_PADDING = 44;
export const DEFAULT_CHART_LINE_RAINBOW_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RAINBOW_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RAINBOW_BAND_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_RAINBOW_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RAINBOW_PERIOD = 2;
export const DEFAULT_CHART_LINE_RAINBOW_BAND_COUNT = 6;
export const DEFAULT_CHART_LINE_RAINBOW_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_RAINBOW_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RAINBOW_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RAINBOW_INSIDE_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_RAINBOW_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RAINBOW_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineRainbowFinitePoints(
  data: readonly ChartLineRainbowPoint[] | null | undefined,
): ChartLineRainbowPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRainbowPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a value to an integer >= 1, else the fallback. */
export function normalizeLineRainbowInt(value: unknown, fallback: number): number {
  if (!isFiniteNumber(value)) return fallback;
  const floored = Math.floor(value);
  if (floored < 1) return fallback;
  return floored;
}

/**
 * Simple moving average of an array, treating a null / non-finite slot as a
 * gap (a window touching one yields null). The warm-up window is null.
 */
export function computeLineRainbowSma(
  arr: readonly (number | null | undefined)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(arr)) return [];
  const p = normalizeLineRainbowInt(period, 1);
  const out: (number | null)[] = [];
  for (let i = 0; i < arr.length; i += 1) {
    if (i + 1 < p) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let k = i - p + 1; k <= i; k += 1) {
      const v = arr[k];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / p : null);
  }
  return out;
}

/**
 * The recursively smoothed Rainbow bands: band 0 is the SMA of the prices,
 * and band k is the SMA of band k-1. Returns one array per band.
 */
export function computeLineRainbowBands(
  values: readonly number[] | null | undefined,
  period: number,
  bandCount: number,
): (number | null)[][] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineRainbowInt(period, 1);
  const bc = normalizeLineRainbowInt(bandCount, 1);
  const bands: (number | null)[][] = [];
  let src: (number | null)[] = values.slice();
  for (let k = 0; k < bc; k += 1) {
    const band = computeLineRainbowSma(src, p);
    bands.push(band);
    src = band;
  }
  return bands;
}

/** Classify a bar by where the price sits relative to the rainbow envelope. */
export function classifyLineRainbowZone(
  value: number,
  envelopeLow: number | null,
  envelopeHigh: number | null,
): ChartLineRainbowZone {
  if (!isFiniteNumber(envelopeLow) || !isFiniteNumber(envelopeHigh)) {
    return 'none';
  }
  if (value > envelopeHigh) return 'above';
  if (value < envelopeLow) return 'below';
  return 'inside';
}

export interface ChartLineRainbowOptions {
  period?: number;
  bandCount?: number;
}

/** Run the full Rainbow Moving Average pipeline over a set of points. */
export function runLineRainbow(
  data: readonly ChartLineRainbowPoint[] | null | undefined,
  options: ChartLineRainbowOptions = {},
): ChartLineRainbowRun {
  const series = getLineRainbowFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineRainbowInt(
    options.period,
    DEFAULT_CHART_LINE_RAINBOW_PERIOD,
  );
  const bandCount = normalizeLineRainbowInt(
    options.bandCount,
    DEFAULT_CHART_LINE_RAINBOW_BAND_COUNT,
  );
  const values = series.map((point) => point.value);
  const bands = computeLineRainbowBands(values, period, bandCount);

  const samples: ChartLineRainbowSample[] = series.map((point, index) => {
    let low = Infinity;
    let high = -Infinity;
    let allDefined = true;
    for (let k = 0; k < bandCount; k += 1) {
      const band = bands[k];
      const b = band ? band[index] : null;
      if (!isFiniteNumber(b)) {
        allDefined = false;
        break;
      }
      if (b < low) low = b;
      if (b > high) high = b;
    }
    const envelopeLow = allDefined ? low : null;
    const envelopeHigh = allDefined ? high : null;
    return {
      index,
      x: point.x,
      value: point.value,
      envelopeLow,
      envelopeHigh,
      zone: classifyLineRainbowZone(point.value, envelopeLow, envelopeHigh),
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let insideCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'inside') insideCount += 1;
  }

  return {
    series = [],
    period,
    bandCount,
    bands,
    samples,
    aboveCount,
    belowCount,
    insideCount,
    ok: series.length >= 2,
  };
}

/** Rainbow hue for band `index` of `bandCount`: band 0 red, last violet. */
export function getLineRainbowBandColor(index: number, bandCount: number): string {
  const span = bandCount > 1 ? bandCount - 1 : 1;
  const clamped = Math.min(Math.max(index, 0), span);
  const hue = (clamped / span) * 270;
  return `hsl(${hue.toFixed(0)}, 72%, 52%)`;
}

export interface ChartLineRainbowLayoutOptions extends ChartLineRainbowOptions {
  data: readonly ChartLineRainbowPoint[] | null | undefined;
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
export function computeLineRainbowLayout(
  options: ChartLineRainbowLayoutOptions,
): ChartLineRainbowLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_RAINBOW_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_RAINBOW_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_RAINBOW_PADDING;

  const run = runLineRainbow(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.bandCount !== undefined ? { bandCount: options.bandCount } : {}),
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
  for (const point of run.series) {
    if (point.value < valueMin) valueMin = point.value;
    if (point.value > valueMax) valueMax = point.value;
  }
  for (const band of run.bands) {
    for (const b of band) {
      if (!isFiniteNumber(b)) continue;
      if (b < valueMin) valueMin = b;
      if (b > valueMax) valueMax = b;
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
  run.series.forEach((point, index) => {
    priceLinePoints.push({ x: xAt(index), y: yAt(point.value) });
  });

  const bandPaths: ChartLineRainbowBandPath[] = run.bands.map((band, k) => {
    const pts: Array<{ x: number; y: number }> = [];
    band.forEach((b, index) => {
      if (isFiniteNumber(b)) pts.push({ x: xAt(index), y: yAt(b) });
    });
    return {
      index: k,
      path: buildLinePath(pts),
      color: getLineRainbowBandColor(k, run.bandCount),
    };
  });

  const markers: ChartLineRainbowMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (sample.zone === 'none') return;
    markers.push({
      index,
      x: sample.x,
      cx: xAt(index),
      cy: yAt(sample.value),
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
    bandPaths,
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineRainbowChart(
  data: readonly ChartLineRainbowPoint[] | null | undefined,
  options: ChartLineRainbowOptions = {},
): string {
  const run = runLineRainbow(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Line chart with a Rainbow Moving Average overlay: the price line with ` +
    `${run.bandCount} recursively smoothed average bands -- the first a ` +
    `moving average of the price, each next a moving average of the band ` +
    `before it -- fanned out as a rainbow. The price runs above the whole ` +
    `rainbow on ${run.aboveCount} bars, below it on ${run.belowCount} and ` +
    `tangled inside it on ${run.insideCount}, across ${total} bars.`
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
  zone: ChartLineRainbowZone,
  aboveColor: string,
  belowColor: string,
  insideColor: string,
): string {
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  return insideColor;
}

function zoneLabelOf(zone: ChartLineRainbowZone): string {
  if (zone === 'above') return 'Above the rainbow';
  if (zone === 'below') return 'Below the rainbow';
  if (zone === 'inside') return 'Inside the rainbow';
  return 'n/a';
}

/**
 * ChartLineRainbow -- single-panel pure-SVG Rainbow Moving Average chart.
 */
export const ChartLineRainbow = forwardRef<HTMLDivElement, ChartLineRainbowProps>(
  function ChartLineRainbow(props, ref) {
    const {
      data,
      period = DEFAULT_CHART_LINE_RAINBOW_PERIOD,
      bandCount = DEFAULT_CHART_LINE_RAINBOW_BAND_COUNT,
      width = DEFAULT_CHART_LINE_RAINBOW_WIDTH,
      height = DEFAULT_CHART_LINE_RAINBOW_HEIGHT,
      padding = DEFAULT_CHART_LINE_RAINBOW_PADDING,
      tickCount = DEFAULT_CHART_LINE_RAINBOW_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_RAINBOW_STROKE_WIDTH,
      bandStrokeWidth = DEFAULT_CHART_LINE_RAINBOW_BAND_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_RAINBOW_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_RAINBOW_PRICE_COLOR,
      aboveColor = DEFAULT_CHART_LINE_RAINBOW_ABOVE_COLOR,
      belowColor = DEFAULT_CHART_LINE_RAINBOW_BELOW_COLOR,
      insideColor = DEFAULT_CHART_LINE_RAINBOW_INSIDE_COLOR,
      gridColor = DEFAULT_CHART_LINE_RAINBOW_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_RAINBOW_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showRainbow = true,
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
    const baseId = `chart-line-rainbow-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineRainbowSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineRainbowSeriesId): boolean =>
      hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineRainbowLayout({
          data,
          period,
          bandCount,
          width,
          height,
          padding,
        }),
      [data, period, bandCount, width, height, padding],
    );

    const run = layout.run;
    const description =
      ariaDescription ?? describeLineRainbowChart(data, { period, bandCount });
    const resolvedLabel =
      ariaLabel ??
      `Rainbow Moving Average chart, ${run.bandCount} bands, period ${run.period}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineRainbowSeriesId): void => {
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
      const marker = layout.markers.find((m) => m.index === hoverSample.index);
      const anchorX = marker
        ? marker.cx
        : (layout.innerLeft + layout.innerRight) / 2;
      const tooltipW = 184;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.innerTop + 6;
      const envText =
        hoverSample.envelopeLow === null || hoverSample.envelopeHigh === null
          ? 'n/a'
          : `${formatValue(hoverSample.envelopeLow)} - ${formatValue(
              hoverSample.envelopeHigh,
            )}`;
      tooltip = (
        <g data-section="chart-line-rainbow-tooltip" pointerEvents="none">
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
            data-section="chart-line-rainbow-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-rainbow-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-rainbow-tooltip-envelope"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Rainbow: ${envText}`}
          </text>
          <text
            data-section="chart-line-rainbow-tooltip-zone"
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
    const rainbowHidden = isHidden('rainbow') || !showRainbow;

    const legendItems: Array<{
      id: ChartLineRainbowSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      {
        id: 'rainbow',
        label: `Rainbow ${run.bandCount}`,
        color: getLineRainbowBandColor(
          Math.floor((run.bandCount - 1) / 2),
          run.bandCount,
        ),
      },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-rainbow"
        data-empty={isEmpty ? 'true' : 'false'}
        data-period={run.period}
        data-band-count={run.bandCount}
        data-above-count={run.aboveCount}
        data-below-count={run.belowCount}
        data-inside-count={run.insideCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-rainbow-aria-desc"
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
            data-section="chart-line-rainbow-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-rainbow-empty"
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
            data-section="chart-line-rainbow-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-rainbow-grid">
                {tickValues.map((t, i) => {
                  const gy =
                    layout.innerBottom -
                    t * (layout.innerBottom - layout.innerTop);
                  return (
                    <line
                      key={`g-${i}`}
                      data-section="chart-line-rainbow-grid-line"
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
              <g data-section="chart-line-rainbow-axes">
                <line
                  data-section="chart-line-rainbow-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerTop}
                  x2={layout.innerLeft}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-rainbow-axis"
                  x1={layout.innerLeft}
                  y1={layout.innerBottom}
                  x2={layout.innerRight}
                  y2={layout.innerBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-rainbow-tick-label"
                  x={layout.innerLeft - 6}
                  y={layout.innerTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.valueMax)}
                </text>
                <text
                  data-section="chart-line-rainbow-tick-label"
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

            {!rainbowHidden ? (
              <g data-section="chart-line-rainbow-bands">
                {layout.bandPaths.map((band) => (
                  <path
                    key={`band-${band.index}`}
                    data-section="chart-line-rainbow-band"
                    data-band-index={band.index}
                    d={band.path}
                    fill="none"
                    stroke={band.color}
                    strokeWidth={bandStrokeWidth}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
              </g>
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-rainbow-price-path"
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

            {!priceHidden && showMarkers ? (
              <g data-section="chart-line-rainbow-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-rainbow-marker"
                    data-zone={marker.zone}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      aboveColor,
                      belowColor,
                      insideColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, price ${formatValue(
                      marker.value,
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
              <g data-section="chart-line-rainbow-badge">
                <rect
                  data-section="chart-line-rainbow-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.innerTop + 4}
                  width={64}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-rainbow-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.innerTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`RB ${run.period}/${run.bandCount}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-rainbow-legend"
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
                  data-section="chart-line-rainbow-legend-item"
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
                    data-section="chart-line-rainbow-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-rainbow-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-rainbow-legend-stats"
              style={{ color: axisColor }}
            >
              {`above ${run.aboveCount} / below ${run.belowCount} / inside ${run.insideCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineRainbow.displayName = 'ChartLineRainbow';
