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
 * ChartLineVolumeOsc -- pure-SVG two-panel Volume Oscillator chart.
 *
 * The Volume Oscillator gauges the momentum of trading volume. It is the
 * PERCENT spread between a fast and a slow simple moving average of the
 * volume: `100 * (fastMA - slowMA) / slowMA`. A positive reading marks
 * EXPANDING volume (the fast average leads the slow); a negative reading
 * marks CONTRACTING volume. The top panel plots the raw volume; the
 * bottom panel plots the oscillator around a zero baseline.
 */

export interface ChartLineVolumeOscPoint {
  x: number;
  volume: number;
}

export type ChartLineVolumeOscZone = 'expanding' | 'contracting' | 'flat' | 'none';

export type ChartLineVolumeOscSeriesId = 'volume' | 'osc';

export interface ChartLineVolumeOscSample {
  index: number;
  x: number;
  volume: number;
  fastMa: number | null;
  slowMa: number | null;
  osc: number | null;
  zone: ChartLineVolumeOscZone;
}

export interface ChartLineVolumeOscRun {
  series: ChartLineVolumeOscPoint[];
  fastPeriod: number;
  slowPeriod: number;
  fastMa: (number | null)[];
  slowMa: (number | null)[];
  osc: (number | null)[];
  samples: ChartLineVolumeOscSample[];
  oscFinal: number | null;
  expandingCount: number;
  contractingCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineVolumeOscMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  osc: number;
  zone: ChartLineVolumeOscZone;
}

export interface ChartLineVolumeOscDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  volume: number;
}

export interface ChartLineVolumeOscLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  volumePanelTop: number;
  volumePanelBottom: number;
  oscPanelTop: number;
  oscPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  volumePath: string;
  volumeDots: ChartLineVolumeOscDot[];
  oscPath: string;
  markers: ChartLineVolumeOscMarker[];
  zeroY: number;
  volumeMin: number;
  volumeMax: number;
  oscMin: number;
  oscMax: number;
  run: ChartLineVolumeOscRun;
}

export interface ChartLineVolumeOscProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVolumeOscPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  volumeColor?: string;
  oscColor?: string;
  expandingColor?: string;
  contractingColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVolumeOscSeriesId[];
  defaultHiddenSeries?: ChartLineVolumeOscSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineVolumeOscSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineVolumeOscSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VOLUME_OSC_WIDTH = 720;
export const DEFAULT_CHART_LINE_VOLUME_OSC_HEIGHT = 400;
export const DEFAULT_CHART_LINE_VOLUME_OSC_PADDING = 44;
export const DEFAULT_CHART_LINE_VOLUME_OSC_GAP = 12;
export const DEFAULT_CHART_LINE_VOLUME_OSC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VOLUME_OSC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VOLUME_OSC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VOLUME_OSC_FAST_PERIOD = 5;
export const DEFAULT_CHART_LINE_VOLUME_OSC_SLOW_PERIOD = 10;
export const DEFAULT_CHART_LINE_VOLUME_OSC_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_VOLUME_OSC_VOLUME_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VOLUME_OSC_OSC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_VOLUME_OSC_EXPANDING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VOLUME_OSC_CONTRACTING_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VOLUME_OSC_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VOLUME_OSC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VOLUME_OSC_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite volume. */
export function getLineVolumeOscFinitePoints(
  data: readonly ChartLineVolumeOscPoint[] | null | undefined,
): ChartLineVolumeOscPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVolumeOscPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.volume)) {
      out.push({ x: point.x, volume: point.volume });
    }
  }
  return out;
}

/** Coerce a moving-average period to an integer >= 1, else the fallback. */
export function normalizeLineVolumeOscPeriod(period: unknown, fallback: number): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/** Simple moving average of the volume series over `period` bars. */
export function computeLineVolumeOscSma(
  volumes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(volumes)) return [];
  const p = normalizeLineVolumeOscPeriod(period, 1);
  const out: (number | null)[] = [];
  for (let i = 0; i < volumes.length; i += 1) {
    if (i + 1 < p) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const v = volumes[j];
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
 * Volume Oscillator: the percent spread of a fast and a slow simple moving
 * average of the volume -- `100 * (fastMA - slowMA) / slowMA`. Defined once
 * both averages exist and the slow average is non-zero.
 */
export function computeLineVolumeOsc(
  volumes: readonly number[] | null | undefined,
  fastPeriod: number,
  slowPeriod: number,
): (number | null)[] {
  if (!Array.isArray(volumes)) return [];
  const fast = computeLineVolumeOscSma(volumes, fastPeriod);
  const slow = computeLineVolumeOscSma(volumes, slowPeriod);
  const out: (number | null)[] = [];
  for (let i = 0; i < volumes.length; i += 1) {
    const f = fast[i];
    const s = slow[i];
    if (isFiniteNumber(f) && isFiniteNumber(s) && s !== 0) {
      out.push((100 * (f - s)) / s);
    } else {
      out.push(null);
    }
  }
  return out;
}

function classifyLineVolumeOscZone(osc: number | null): ChartLineVolumeOscZone {
  if (!isFiniteNumber(osc)) return 'none';
  if (osc > 0) return 'expanding';
  if (osc < 0) return 'contracting';
  return 'flat';
}

export interface ChartLineVolumeOscOptions {
  fastPeriod?: number;
  slowPeriod?: number;
}

/** Run the full Volume Oscillator pipeline over a set of points. */
export function runLineVolumeOsc(
  data: readonly ChartLineVolumeOscPoint[] | null | undefined,
  options: ChartLineVolumeOscOptions = {},
): ChartLineVolumeOscRun {
  const series = getLineVolumeOscFinitePoints(data).slice().sort((a, b) => a.x - b.x);
  const fastPeriod = normalizeLineVolumeOscPeriod(
    options.fastPeriod,
    DEFAULT_CHART_LINE_VOLUME_OSC_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineVolumeOscPeriod(
    options.slowPeriod,
    DEFAULT_CHART_LINE_VOLUME_OSC_SLOW_PERIOD,
  );
  const volumes = series.map((point) => point.volume);
  const fastMa = computeLineVolumeOscSma(volumes, fastPeriod);
  const slowMa = computeLineVolumeOscSma(volumes, slowPeriod);
  const osc = computeLineVolumeOsc(volumes, fastPeriod, slowPeriod);

  const samples: ChartLineVolumeOscSample[] = series.map((point, index) => {
    const oscValue = osc[index] ?? null;
    return {
      index,
      x: point.x,
      volume: point.volume,
      fastMa: fastMa[index] ?? null,
      slowMa: slowMa[index] ?? null,
      osc: oscValue,
      zone: classifyLineVolumeOscZone(oscValue),
    };
  });

  let expandingCount = 0;
  let contractingCount = 0;
  let flatCount = 0;
  let oscFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'expanding') expandingCount += 1;
    else if (sample.zone === 'contracting') contractingCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.osc)) oscFinal = sample.osc;
  }

  return {
    series,
    fastPeriod,
    slowPeriod,
    fastMa,
    slowMa,
    osc,
    samples,
    oscFinal,
    expandingCount,
    contractingCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineVolumeOscLayoutOptions extends ChartLineVolumeOscOptions {
  data: readonly ChartLineVolumeOscPoint[] | null | undefined;
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
export function computeLineVolumeOscLayout(
  options: ChartLineVolumeOscLayoutOptions,
): ChartLineVolumeOscLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_VOLUME_OSC_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_VOLUME_OSC_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_VOLUME_OSC_PADDING;
  const gap = isFiniteNumber(options.gap) ? options.gap : DEFAULT_CHART_LINE_VOLUME_OSC_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_VOLUME_OSC_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineVolumeOsc(options.data, {
    ...(options.fastPeriod !== undefined ? { fastPeriod: options.fastPeriod } : {}),
    ...(options.slowPeriod !== undefined ? { slowPeriod: options.slowPeriod } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const volumePanelTop = innerTop;
  const volumePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const volumePanelBottom = volumePanelTop + volumePanelHeight;
  const oscPanelTop = volumePanelBottom + gap;
  const oscPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && volumePanelHeight > 0 && oscPanelBottom - oscPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let volumeMin = Infinity;
  let volumeMax = -Infinity;
  for (const point of run.series) {
    if (point.volume < volumeMin) volumeMin = point.volume;
    if (point.volume > volumeMax) volumeMax = point.volume;
  }
  if (!Number.isFinite(volumeMin) || !Number.isFinite(volumeMax)) {
    volumeMin = 0;
    volumeMax = 1;
  }
  if (volumeMin === volumeMax) {
    volumeMin -= 1;
    volumeMax += 1;
  }
  const volumeYAt = (value: number): number =>
    volumePanelBottom -
    ((value - volumeMin) / (volumeMax - volumeMin)) * volumePanelHeight;

  let oscMin = 0;
  let oscMax = 0;
  for (const value of run.osc) {
    if (!isFiniteNumber(value)) continue;
    if (value < oscMin) oscMin = value;
    if (value > oscMax) oscMax = value;
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  const oscPanelHeight = oscPanelBottom - oscPanelTop;
  const oscYAt = (value: number): number =>
    oscPanelBottom - ((value - oscMin) / (oscMax - oscMin)) * oscPanelHeight;
  const zeroY = oscYAt(0);

  const volumeLinePoints: Array<{ x: number; y: number }> = [];
  const volumeDots: ChartLineVolumeOscDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = volumeYAt(point.volume);
    volumeLinePoints.push({ x: cx, y: cy });
    volumeDots.push({ index, x: point.x, cx, cy, volume: point.volume });
  });

  const oscLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineVolumeOscMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.osc)) return;
    const cx = xAt(index);
    const cy = oscYAt(sample.osc);
    oscLinePoints.push({ x: cx, y: cy });
    markers.push({ index, x: sample.x, cx, cy, osc: sample.osc, zone: sample.zone });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    volumePanelTop,
    volumePanelBottom,
    oscPanelTop,
    oscPanelBottom,
    innerLeft,
    innerRight,
    volumePath: buildLinePath(volumeLinePoints),
    volumeDots,
    oscPath: buildLinePath(oscLinePoints),
    markers,
    zeroY,
    volumeMin,
    volumeMax,
    oscMin,
    oscMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineVolumeOscChart(
  data: readonly ChartLineVolumeOscPoint[] | null | undefined,
  options: ChartLineVolumeOscOptions = {},
): string {
  const run = runLineVolumeOsc(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.oscFinal === null ? 'n/a' : `${run.oscFinal.toFixed(2)} percent`;
  return (
    `Two-panel chart with the Volume Oscillator (fast SMA ${run.fastPeriod}, ` +
    `slow SMA ${run.slowPeriod}): the top panel plots the volume, the bottom ` +
    `panel plots the oscillator. The Volume Oscillator is the percent spread ` +
    `between a fast and a slow simple moving average of the volume -- positive ` +
    `when the fast average leads, marking expanding volume, negative when it ` +
    `lags, marking contracting volume. Across ${total} bars the oscillator ` +
    `expands on ${run.expandingCount}, contracts on ${run.contractingCount} and ` +
    `is flat on ${run.flatCount}. The final reading is ${finalText}.`
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
  zone: ChartLineVolumeOscZone,
  expandingColor: string,
  contractingColor: string,
  oscColor: string,
): string {
  if (zone === 'expanding') return expandingColor;
  if (zone === 'contracting') return contractingColor;
  return oscColor;
}

function zoneLabelOf(zone: ChartLineVolumeOscZone): string {
  if (zone === 'expanding') return 'Expanding';
  if (zone === 'contracting') return 'Contracting';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

interface HoverState {
  index: number;
  source: 'dot' | 'marker';
}

/**
 * ChartLineVolumeOsc -- two-panel pure-SVG Volume Oscillator chart.
 */
export const ChartLineVolumeOsc = forwardRef<HTMLDivElement, ChartLineVolumeOscProps>(
  function ChartLineVolumeOsc(props, ref) {
    const {
      data,
      fastPeriod = DEFAULT_CHART_LINE_VOLUME_OSC_FAST_PERIOD,
      slowPeriod = DEFAULT_CHART_LINE_VOLUME_OSC_SLOW_PERIOD,
      width = DEFAULT_CHART_LINE_VOLUME_OSC_WIDTH,
      height = DEFAULT_CHART_LINE_VOLUME_OSC_HEIGHT,
      padding = DEFAULT_CHART_LINE_VOLUME_OSC_PADDING,
      gap = DEFAULT_CHART_LINE_VOLUME_OSC_GAP,
      tickCount = DEFAULT_CHART_LINE_VOLUME_OSC_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_VOLUME_OSC_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_VOLUME_OSC_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_VOLUME_OSC_DOT_RADIUS,
      volumeColor = DEFAULT_CHART_LINE_VOLUME_OSC_VOLUME_COLOR,
      oscColor = DEFAULT_CHART_LINE_VOLUME_OSC_OSC_COLOR,
      expandingColor = DEFAULT_CHART_LINE_VOLUME_OSC_EXPANDING_COLOR,
      contractingColor = DEFAULT_CHART_LINE_VOLUME_OSC_CONTRACTING_COLOR,
      zeroColor = DEFAULT_CHART_LINE_VOLUME_OSC_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_VOLUME_OSC_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_VOLUME_OSC_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showZeroLine = true,
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
    const baseId = `chart-line-volume-osc-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<HoverState | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineVolumeOscSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineVolumeOscSeriesId): boolean => hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineVolumeOscLayout({
          data,
          fastPeriod,
          slowPeriod,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
        }),
      [data, fastPeriod, slowPeriod, width, height, padding, gap, pricePanelRatio],
    );

    const run = layout.run;
    const description = ariaDescription ?? describeLineVolumeOscChart(data, {
      fastPeriod,
      slowPeriod,
    });
    const resolvedLabel =
      ariaLabel ??
      `Volume Oscillator chart, fast SMA ${run.fastPeriod}, slow SMA ${run.slowPeriod}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineVolumeOscSeriesId): void => {
      const next = isHidden(id);
      if (hiddenSeries === undefined) {
        setInternalHidden((prev) =>
          prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
        );
      }
      onSeriesToggle?.({ seriesId: id, hidden: !next });
    };

    const handleMarkerActivate = (sampleIndex: number): void => {
      const sample = run.samples[sampleIndex];
      if (sample) onPointClick?.({ point: sample });
    };

    const handleKey = (
      event: KeyboardEvent<SVGElement>,
      sampleIndex: number,
    ): void => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleMarkerActivate(sampleIndex);
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
      hover && run.samples[hover.index] ? run.samples[hover.index]! : null;

    let tooltip: ReactNode = null;
    if (showTooltip && hoverSample && !isEmpty) {
      const dot = layout.volumeDots[hoverSample.index];
      const anchorX = dot ? dot.cx : (layout.innerLeft + layout.innerRight) / 2;
      const tooltipW = 156;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.volumePanelTop + 6;
      tooltip = (
        <g data-section="chart-line-volume-osc-tooltip" pointerEvents="none">
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
            data-section="chart-line-volume-osc-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-volume-osc-tooltip-volume"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Volume: ${formatValue(hoverSample.volume)}`}
          </text>
          <text
            data-section="chart-line-volume-osc-tooltip-osc"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Oscillator: ${
              hoverSample.osc === null ? 'n/a' : `${formatValue(hoverSample.osc)}%`
            }`}
          </text>
          <text
            data-section="chart-line-volume-osc-tooltip-zone"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
          </text>
        </g>
      );
    }

    const volumeHidden = isHidden('volume');
    const oscHidden = isHidden('osc');

    const legendItems: Array<{
      id: ChartLineVolumeOscSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'volume', label: 'Volume', color: volumeColor },
      { id: 'osc', label: 'Oscillator', color: oscColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-volume-osc"
        data-empty={isEmpty ? 'true' : 'false'}
        data-fast-period={run.fastPeriod}
        data-slow-period={run.slowPeriod}
        data-osc-final={run.oscFinal === null ? '' : run.oscFinal}
        data-expanding-count={run.expandingCount}
        data-contracting-count={run.contractingCount}
        data-flat-count={run.flatCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-volume-osc-aria-desc"
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
            data-section="chart-line-volume-osc-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-volume-osc-empty"
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
            data-section="chart-line-volume-osc-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-volume-osc-grid">
                {tickValues.map((t, i) => {
                  const vy =
                    layout.volumePanelBottom -
                    t * (layout.volumePanelBottom - layout.volumePanelTop);
                  return (
                    <line
                      key={`vg-${i}`}
                      data-section="chart-line-volume-osc-grid-line"
                      data-panel="volume"
                      x1={layout.innerLeft}
                      y1={vy}
                      x2={layout.innerRight}
                      y2={vy}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
                {tickValues.map((t, i) => {
                  const oy =
                    layout.oscPanelBottom -
                    t * (layout.oscPanelBottom - layout.oscPanelTop);
                  return (
                    <line
                      key={`og-${i}`}
                      data-section="chart-line-volume-osc-grid-line"
                      data-panel="osc"
                      x1={layout.innerLeft}
                      y1={oy}
                      x2={layout.innerRight}
                      y2={oy}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g data-section="chart-line-volume-osc-axes">
                <line
                  data-section="chart-line-volume-osc-axis"
                  data-panel="volume"
                  x1={layout.innerLeft}
                  y1={layout.volumePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.volumePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-volume-osc-axis"
                  data-panel="volume"
                  x1={layout.innerLeft}
                  y1={layout.volumePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.volumePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-volume-osc-axis"
                  data-panel="osc"
                  x1={layout.innerLeft}
                  y1={layout.oscPanelTop}
                  x2={layout.innerLeft}
                  y2={layout.oscPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-volume-osc-axis"
                  data-panel="osc"
                  x1={layout.innerLeft}
                  y1={layout.oscPanelBottom}
                  x2={layout.innerRight}
                  y2={layout.oscPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-volume-osc-tick-label"
                  data-panel="volume"
                  x={layout.innerLeft - 6}
                  y={layout.volumePanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.volumeMax)}
                </text>
                <text
                  data-section="chart-line-volume-osc-tick-label"
                  data-panel="volume"
                  x={layout.innerLeft - 6}
                  y={layout.volumePanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.volumeMin)}
                </text>
                <text
                  data-section="chart-line-volume-osc-tick-label"
                  data-panel="osc"
                  x={layout.innerLeft - 6}
                  y={layout.oscPanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.oscMax)}
                </text>
                <text
                  data-section="chart-line-volume-osc-tick-label"
                  data-panel="osc"
                  x={layout.innerLeft - 6}
                  y={layout.oscPanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.oscMin)}
                </text>
              </g>
            ) : null}

            <text
              data-section="chart-line-volume-osc-panel-label"
              data-panel="volume"
              x={layout.innerRight}
              y={layout.volumePanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Volume
            </text>
            <text
              data-section="chart-line-volume-osc-panel-label"
              data-panel="osc"
              x={layout.innerRight}
              y={layout.oscPanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Volume Oscillator
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-volume-osc-zero-line"
                x1={layout.innerLeft}
                y1={layout.zeroY}
                x2={layout.innerRight}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {!volumeHidden ? (
              <path
                data-section="chart-line-volume-osc-volume-path"
                d={layout.volumePath}
                fill="none"
                stroke={volumeColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Volume line, ${run.series.length} bars`}
              />
            ) : null}

            {!volumeHidden && showDots ? (
              <g data-section="chart-line-volume-osc-dots">
                {layout.volumeDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-volume-osc-dot"
                    cx={dot.cx}
                    cy={dot.cy}
                    r={dotRadius}
                    fill={volumeColor}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(dot.x)}, volume ${formatValue(
                      dot.volume,
                    )}`}
                    onMouseEnter={() => setHover({ index: dot.index, source: 'dot' })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ index: dot.index, source: 'dot' })}
                    onBlur={() => setHover(null)}
                    onClick={() => handleMarkerActivate(dot.index)}
                    onKeyDown={(e) => handleKey(e, dot.index)}
                  />
                ))}
              </g>
            ) : null}

            {!oscHidden ? (
              <path
                data-section="chart-line-volume-osc-osc-line"
                d={layout.oscPath}
                fill="none"
                stroke={oscColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Volume Oscillator line, ${layout.markers.length} points`}
              />
            ) : null}

            {!oscHidden && showMarkers ? (
              <g data-section="chart-line-volume-osc-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-volume-osc-marker"
                    data-zone={marker.zone}
                    data-osc={marker.osc}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      expandingColor,
                      contractingColor,
                      oscColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, oscillator ${formatValue(
                      marker.osc,
                    )} percent, ${zoneLabelOf(marker.zone)}`}
                    onMouseEnter={() =>
                      setHover({ index: marker.index, source: 'marker' })
                    }
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ index: marker.index, source: 'marker' })}
                    onBlur={() => setHover(null)}
                    onClick={() => handleMarkerActivate(marker.index)}
                    onKeyDown={(e) => handleKey(e, marker.index)}
                  />
                ))}
              </g>
            ) : null}

            {showConfigBadge ? (
              <g data-section="chart-line-volume-osc-badge">
                <rect
                  data-section="chart-line-volume-osc-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.volumePanelTop + 4}
                  width={88}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-volume-osc-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.volumePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`VO ${run.fastPeriod}/${run.slowPeriod}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-volume-osc-legend"
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
                  data-section="chart-line-volume-osc-legend-item"
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
                    data-section="chart-line-volume-osc-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-volume-osc-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-volume-osc-legend-stats"
              style={{ color: axisColor }}
            >
              {`expanding ${run.expandingCount} / contracting ${run.contractingCount} / flat ${run.flatCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineVolumeOsc.displayName = 'ChartLineVolumeOsc';
