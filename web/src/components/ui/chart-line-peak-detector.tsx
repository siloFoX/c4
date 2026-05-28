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
 * ChartLinePeakDetector -- pure-SVG dual-panel chart with the
 * close on the top panel and a Peak Detector oscillator on the
 * bottom panel. The detector flags local maxima of the close
 * that exceed a SMA-plus-stdDev threshold:
 *
 *   mean[i]      = SMA(close, length)[i]
 *   stdDev[i]    = sqrt(sum((close - mean)^2) / length)
 *                  (population)
 *   threshold[i] = mean[i] + threshFactor * stdDev[i]
 *   peak[i]      = 1 if
 *                      i - 1 >= 0,
 *                      i + 1 < n,
 *                      close[i] > close[i - 1],
 *                      close[i] > close[i + 1],
 *                      close[i] > threshold[i]
 *                  else 0
 *
 * Defaults: `length = 14`, `threshFactor = 1`. Bars before
 * `i = length - 1` are warmup nulls. The first and last bars
 * are also `null` because the local-max test needs both
 * neighbours.
 *
 * Bit-exact anchor: **CONST close** (`close = K`): `mean = K`,
 * `stdDev = 0`, `threshold = K + factor * 0 = K`, and
 * `close[i] > K` is `false` because `close[i] = K`. So
 * `peak[i] = 0` at every valid bar regardless of K's sign or
 * magnitude. The integration sweep verifies this across many
 * K and `(length, threshFactor)` combinations.
 *
 * Additional structural anchor: **ALTERNATING close**
 * (`[0, 1, 0, 1, ...]`) with `threshFactor = 0`. Each odd-index
 * bar has `close = 1` and neighbours `= 0`, so it qualifies as
 * a local max. `mean = 0.5`, `stdDev = 0.5`, `threshold = 0.5`,
 * and `1 > 0.5` -> `peak = 1`. Even-index bars are
 * `close = 0` and never local maxes. Verified explicitly in
 * the test.
 */

export interface ChartLinePeakDetectorPoint {
  x: number;
  close: number;
}

export type ChartLinePeakDetectorZone = 'peak' | 'no-peak' | 'none';

export type ChartLinePeakDetectorSeriesId = 'price' | 'peak';

export interface ChartLinePeakDetectorSample {
  index: number;
  x: number;
  close: number;
  mean: number | null;
  stdDev: number | null;
  threshold: number | null;
  peak: number | null;
  zone: ChartLinePeakDetectorZone;
}

export interface ChartLinePeakDetectorRun {
  series: ChartLinePeakDetectorPoint[];
  length: number;
  threshFactor: number;
  mean: Array<number | null>;
  stdDev: Array<number | null>;
  threshold: Array<number | null>;
  peak: Array<number | null>;
  samples: ChartLinePeakDetectorSample[];
  peakCount: number;
  noPeakCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLinePeakDetectorMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  peak: number;
  zone: ChartLinePeakDetectorZone;
}

export interface ChartLinePeakDetectorDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLinePeakDetectorLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  peakTop: number;
  peakBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLinePeakDetectorDot[];
  peakPath: string;
  markers: ChartLinePeakDetectorMarker[];
  priceMin: number;
  priceMax: number;
  peakMin: number;
  peakMax: number;
  run: ChartLinePeakDetectorRun;
}

export interface ChartLinePeakDetectorProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLinePeakDetectorPoint[];
  length?: number;
  threshFactor?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  peakColor?: string;
  peakMarkerColor?: string;
  noPeakColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPeak?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLinePeakDetectorSeriesId[];
  defaultHiddenSeries?: ChartLinePeakDetectorSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLinePeakDetectorSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLinePeakDetectorSample }) => void;
  formatPrice?: (value: number) => string;
  formatPeak?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_PEAK_DETECTOR_WIDTH = 720;
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_HEIGHT = 460;
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_PADDING = 44;
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_LENGTH = 14;
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_THRESH_FACTOR = 1;
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_PEAK_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_PEAK_MARKER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_NO_PEAK_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_PEAK_DETECTOR_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLinePeakDetectorFinitePoints(
  data: readonly ChartLinePeakDetectorPoint[] | null | undefined,
): ChartLinePeakDetectorPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLinePeakDetectorPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLinePeakDetectorLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite threshold factor. */
export function normalizeLinePeakDetectorThreshFactor(
  factor: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(factor) && factor >= 0) return factor;
  return fallback;
}

/** SMA; nulls in the window null the bar. */
export function applyLinePeakDetectorSma(
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
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / length : null);
  }
  return out;
}

/** Population standard deviation over a rolling window. */
export function applyLinePeakDetectorPopulationStdDev(
  values: readonly (number | null)[],
  means: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    const m = means[i];
    if (i < length - 1 || m == null || !isFiniteNumber(m)) {
      out.push(null);
      continue;
    }
    let sumSq = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      const d = v - m;
      sumSq += d * d;
    }
    out.push(ok ? Math.sqrt(sumSq / length) : null);
  }
  return out;
}

export interface ChartLinePeakDetectorOptions {
  length?: number;
  threshFactor?: number;
}

export interface ChartLinePeakDetectorChannels {
  mean: Array<number | null>;
  stdDev: Array<number | null>;
  threshold: Array<number | null>;
  peak: Array<number | null>;
}

/**
 * Compute the Peak Detector pipeline per bar. Peak is `null`
 * during warmup (`i < length - 1`), at the boundaries
 * (`i == 0` or `i == n - 1`), or when a neighbour is non-finite.
 * Otherwise it is `1` if the bar is a strict local maximum that
 * also strictly exceeds the threshold, and `0` otherwise.
 */
export function computeLinePeakDetector(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLinePeakDetectorOptions = {},
): ChartLinePeakDetectorChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { mean: [], stdDev: [], threshold: [], peak: [] };
  }
  const length = normalizeLinePeakDetectorLength(
    options.length,
    DEFAULT_CHART_LINE_PEAK_DETECTOR_LENGTH,
  );
  const threshFactor = normalizeLinePeakDetectorThreshFactor(
    options.threshFactor,
    DEFAULT_CHART_LINE_PEAK_DETECTOR_THRESH_FACTOR,
  );
  const mean = applyLinePeakDetectorSma(closes, length);
  const stdDev = applyLinePeakDetectorPopulationStdDev(
    closes,
    mean,
    length,
  );
  const threshold: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const m = mean[i];
    const s = stdDev[i];
    if (m == null || s == null || !isFiniteNumber(m) || !isFiniteNumber(s)) {
      threshold.push(null);
      continue;
    }
    threshold.push(m + threshFactor * s);
  }
  const peak: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0 || i === closes.length - 1) {
      peak.push(null);
      continue;
    }
    const t = threshold[i];
    const c = closes[i];
    const cPrev = closes[i - 1];
    const cNext = closes[i + 1];
    if (
      t == null ||
      c == null ||
      cPrev == null ||
      cNext == null ||
      !isFiniteNumber(t) ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(cPrev) ||
      !isFiniteNumber(cNext)
    ) {
      peak.push(null);
      continue;
    }
    peak.push(c > cPrev && c > cNext && c > t ? 1 : 0);
  }
  return { mean, stdDev, threshold, peak };
}

/** Classify a peak reading. */
export function classifyLinePeakDetectorZone(
  value: number | null,
): ChartLinePeakDetectorZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value === 1) return 'peak';
  return 'no-peak';
}

/** Run the full pipeline plus sample classification. */
export function runLinePeakDetector(
  data: readonly ChartLinePeakDetectorPoint[] | null | undefined,
  options: ChartLinePeakDetectorOptions = {},
): ChartLinePeakDetectorRun {
  const series = getLinePeakDetectorFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLinePeakDetectorLength(
    options.length,
    DEFAULT_CHART_LINE_PEAK_DETECTOR_LENGTH,
  );
  const threshFactor = normalizeLinePeakDetectorThreshFactor(
    options.threshFactor,
    DEFAULT_CHART_LINE_PEAK_DETECTOR_THRESH_FACTOR,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLinePeakDetector(closes, { length, threshFactor });
  const samples: ChartLinePeakDetectorSample[] = series.map((point, index) => {
    const value = channels.peak[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      mean: channels.mean[index] ?? null,
      stdDev: channels.stdDev[index] ?? null,
      threshold: channels.threshold[index] ?? null,
      peak: value,
      zone: classifyLinePeakDetectorZone(value),
    };
  });
  let peakCount = 0;
  let noPeakCount = 0;
  let noneCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'peak') peakCount += 1;
    else if (sample.zone === 'no-peak') noPeakCount += 1;
    else noneCount += 1;
  }
  return {
    series = [],
    length,
    threshFactor,
    mean: channels.mean,
    stdDev: channels.stdDev,
    threshold: channels.threshold,
    peak: channels.peak,
    samples,
    peakCount,
    noPeakCount,
    noneCount,
    ok: series.length >= length + 2,
  };
}

export interface ChartLinePeakDetectorLayoutOptions
  extends ChartLinePeakDetectorOptions {
  data: readonly ChartLinePeakDetectorPoint[] | null | undefined;
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
export function computeLinePeakDetectorLayout(
  options: ChartLinePeakDetectorLayoutOptions,
): ChartLinePeakDetectorLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_PEAK_DETECTOR_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_PEAK_DETECTOR_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_PEAK_DETECTOR_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_PEAK_DETECTOR_PANEL_GAP;

  const run = runLinePeakDetector(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.threshFactor !== undefined
      ? { threshFactor: options.threshFactor }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const peakHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const peakTop = priceBottom + panelGap;
  const peakBottom = peakTop + peakHeight;

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

  // Peak indicator is binary 0/1.
  const peakMin = 0;
  const peakMax = 1;
  const peakY = (value: number): number =>
    peakBottom - ((value - peakMin) / (peakMax - peakMin)) * peakHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLinePeakDetectorDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const peakLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLinePeakDetectorMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.peak)) return;
    const cx = xAt(index);
    const yc = peakY(sample.peak);
    peakLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      peak: sample.peak,
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
    peakTop,
    peakBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    peakPath: buildLinePath(peakLinePoints),
    markers,
    priceMin,
    priceMax,
    peakMin,
    peakMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLinePeakDetectorChart(
  data: readonly ChartLinePeakDetectorPoint[] | null | undefined,
  options: ChartLinePeakDetectorOptions = {},
): string {
  const run = runLinePeakDetector(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Peak Detector oscillator panel ` +
    `beneath the close (length ${run.length}, threshFactor ` +
    `${run.threshFactor}). A bar fires a peak when it is a ` +
    `strict local maximum (close[i] > close[i - 1] and ` +
    `close[i] > close[i + 1]) AND the close strictly exceeds the ` +
    `threshold (SMA + threshFactor * populationStdDev) across ` +
    `the lookback. Across ${total} bars the detector fired peak ` +
    `on ${run.peakCount}, no-peak on ${run.noPeakCount}, and was ` +
    `undefined on ${run.noneCount}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatPeak(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(0);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLinePeakDetectorZone,
  peakMarkerColor: string,
  noPeakColor: string,
  noneColor: string,
): string {
  if (zone === 'peak') return peakMarkerColor;
  if (zone === 'no-peak') return noPeakColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLinePeakDetectorZone): string {
  if (zone === 'peak') return 'Peak';
  if (zone === 'no-peak') return 'No Peak';
  return 'n/a';
}

/** ChartLinePeakDetector -- dual-panel pure-SVG chart. */
export const ChartLinePeakDetector = forwardRef<
  HTMLDivElement,
  ChartLinePeakDetectorProps
>(function ChartLinePeakDetector(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_PEAK_DETECTOR_LENGTH,
    threshFactor = DEFAULT_CHART_LINE_PEAK_DETECTOR_THRESH_FACTOR,
    width = DEFAULT_CHART_LINE_PEAK_DETECTOR_WIDTH,
    height = DEFAULT_CHART_LINE_PEAK_DETECTOR_HEIGHT,
    padding = DEFAULT_CHART_LINE_PEAK_DETECTOR_PADDING,
    panelGap = DEFAULT_CHART_LINE_PEAK_DETECTOR_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_PEAK_DETECTOR_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_PEAK_DETECTOR_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_PEAK_DETECTOR_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_PEAK_DETECTOR_PRICE_COLOR,
    peakColor = DEFAULT_CHART_LINE_PEAK_DETECTOR_PEAK_COLOR,
    peakMarkerColor = DEFAULT_CHART_LINE_PEAK_DETECTOR_PEAK_MARKER_COLOR,
    noPeakColor = DEFAULT_CHART_LINE_PEAK_DETECTOR_NO_PEAK_COLOR,
    noneColor = DEFAULT_CHART_LINE_PEAK_DETECTOR_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_PEAK_DETECTOR_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_PEAK_DETECTOR_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPeak = true,
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
    formatPeak = defaultFormatPeak,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-peak-detector-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLinePeakDetectorSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLinePeakDetectorSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLinePeakDetectorLayout({
        data,
        length,
        threshFactor,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, threshFactor, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLinePeakDetectorChart(data, { length, threshFactor });
  const resolvedLabel =
    ariaLabel ?? `Peak Detector chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLinePeakDetectorSeriesId): void => {
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
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-peak-detector-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={134}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-peak-detector-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-peak-detector-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-peak-detector-tooltip-mean"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`SMA: ${
            hoverSample.mean === null
              ? 'n/a'
              : formatPrice(hoverSample.mean)
          }`}
        </text>
        <text
          data-section="chart-line-peak-detector-tooltip-stddev"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`StdDev: ${
            hoverSample.stdDev === null
              ? 'n/a'
              : formatPrice(hoverSample.stdDev)
          }`}
        </text>
        <text
          data-section="chart-line-peak-detector-tooltip-threshold"
          x={tx + 10}
          y={ty + 83}
          fill="#fca5a5"
          fontSize={11}
        >
          {`Threshold: ${
            hoverSample.threshold === null
              ? 'n/a'
              : formatPrice(hoverSample.threshold)
          }`}
        </text>
        <text
          data-section="chart-line-peak-detector-tooltip-peak"
          x={tx + 10}
          y={ty + 99}
          fill="#fca5a5"
          fontSize={11}
          fontWeight={600}
        >
          {`Peak: ${
            hoverSample.peak === null
              ? 'n/a'
              : formatPeak(hoverSample.peak)
          }`}
        </text>
        <text
          data-section="chart-line-peak-detector-tooltip-zone"
          x={tx + 10}
          y={ty + 115}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const peakHidden = isHidden('peak') || !showPeak;

  const legendItems: Array<{
    id: ChartLinePeakDetectorSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'peak', label: 'Peak Indicator', color: peakColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-peak-detector"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-thresh-factor={run.threshFactor}
      data-peak-count={run.peakCount}
      data-no-peak-count={run.noPeakCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-peak-detector-aria-desc"
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
          data-section="chart-line-peak-detector-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-peak-detector-empty"
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
          data-section="chart-line-peak-detector-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-peak-detector-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.peakBottom -
                  t * (layout.peakBottom - layout.peakTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-peak-detector-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-peak-detector-grid-line"
                      data-panel="peak"
                      x1={layout.innerLeft}
                      y1={yk}
                      x2={layout.innerRight}
                      y2={yk}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-peak-detector-axes">
              <line
                data-section="chart-line-peak-detector-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-peak-detector-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-peak-detector-axis"
                data-panel="peak"
                x1={layout.innerLeft}
                y1={layout.peakTop}
                x2={layout.innerLeft}
                y2={layout.peakBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-peak-detector-axis"
                data-panel="peak"
                x1={layout.innerLeft}
                y1={layout.peakBottom}
                x2={layout.innerRight}
                y2={layout.peakBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-peak-detector-tick-label"
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
                data-section="chart-line-peak-detector-tick-label"
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
                data-section="chart-line-peak-detector-tick-label"
                data-panel="peak"
                x={layout.innerLeft - 6}
                y={layout.peakTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`1`}
              </text>
              <text
                data-section="chart-line-peak-detector-tick-label"
                data-panel="peak"
                x={layout.innerLeft - 6}
                y={layout.peakBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`0`}
              </text>
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-peak-detector-price-path"
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
            <g data-section="chart-line-peak-detector-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-peak-detector-dot"
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

          {!peakHidden ? (
            <path
              data-section="chart-line-peak-detector-line"
              d={layout.peakPath}
              fill="none"
              stroke={peakColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="miter"
              strokeLinecap="butt"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Peak indicator, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-peak-detector-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-peak-detector-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-peak={marker.peak}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    peakMarkerColor,
                    noPeakColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, peak ${formatPeak(marker.peak)}, ${zoneLabelOf(
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
            <g data-section="chart-line-peak-detector-badge">
              <rect
                data-section="chart-line-peak-detector-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={180}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-peak-detector-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Peak Detector ${run.length}/${run.threshFactor}sd`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-peak-detector-legend"
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
                data-section="chart-line-peak-detector-legend-item"
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
                  data-section="chart-line-peak-detector-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-peak-detector-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-peak-detector-legend-stats"
            style={{ color: axisColor }}
          >
            {`peaks ${run.peakCount} / no-peak ${run.noPeakCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLinePeakDetector.displayName = 'ChartLinePeakDetector';
