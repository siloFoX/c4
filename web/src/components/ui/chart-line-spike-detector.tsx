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
 * ChartLineSpikeDetector -- pure-SVG dual-panel chart with the
 * close on the top panel and a Price Spike Detector on the
 * bottom panel. The detector is the Z-score of the bar-to-bar
 * change relative to its rolling mean and standard deviation:
 *
 *   delta[i]    = close[i] - close[i - 1]    (i >= 1)
 *   mean[i]     = SMA(delta, length)[i]
 *   stdDev[i]   = sqrt(sum((delta - mean)^2) / length)
 *                  (population)
 *   spike[i]    = (delta[i] - mean[i]) / stdDev[i]
 *
 * Defaults: `length = 14`. Bars before `i = length` are warmup
 * (`spike = null`) because the rolling stats need `length`
 * valid `delta` samples in the window `[i - length + 1, i]`,
 * and `delta` is undefined at bar 0. When `stdDev == 0`
 * (singular: every delta in the window is identical) the spike
 * is `null`.
 *
 * Bit-exact anchors:
 *
 *   * **CONST close** (`close = K`): every `delta = 0`,
 *     `stdDev = 0`, and the spike is `null` at every bar
 *     (singular case).
 *   * **ALTERNATING close** (`close = [0, 1, 0, 1, ...]`) with
 *     even `length`: deltas alternate `[+1, -1, +1, -1, ...]`.
 *     The rolling sum over `length` (even) is `0`, so
 *     `mean = 0`, every squared residual is `1`, sum of squares
 *     is `length`, `stdDev = sqrt(length / length) = 1`. So:
 *
 *         spike[i] = (delta[i] - 0) / 1 = +/- 1     (bit-exact)
 *
 *     The integration sweep verifies this across even lengths
 *     in `{4, 6, 10, 14, 20}`.
 */

export interface ChartLineSpikeDetectorPoint {
  x: number;
  close: number;
}

export type ChartLineSpikeDetectorZone =
  | 'extreme-up'
  | 'spike-up'
  | 'normal'
  | 'spike-down'
  | 'extreme-down'
  | 'at'
  | 'none';

export type ChartLineSpikeDetectorSeriesId = 'price' | 'spike';

export interface ChartLineSpikeDetectorSample {
  index: number;
  x: number;
  close: number;
  delta: number | null;
  spike: number | null;
  zone: ChartLineSpikeDetectorZone;
}

export interface ChartLineSpikeDetectorRun {
  series: ChartLineSpikeDetectorPoint[];
  length: number;
  delta: Array<number | null>;
  spike: Array<number | null>;
  samples: ChartLineSpikeDetectorSample[];
  spikeFinal: number | null;
  extremeUpCount: number;
  spikeUpCount: number;
  normalCount: number;
  spikeDownCount: number;
  extremeDownCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineSpikeDetectorMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  spike: number;
  zone: ChartLineSpikeDetectorZone;
}

export interface ChartLineSpikeDetectorDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSpikeDetectorLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  spikeTop: number;
  spikeBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineSpikeDetectorDot[];
  spikePath: string;
  markers: ChartLineSpikeDetectorMarker[];
  priceMin: number;
  priceMax: number;
  spikeMin: number;
  spikeMax: number;
  zeroBaselineY: number;
  run: ChartLineSpikeDetectorRun;
}

export interface ChartLineSpikeDetectorProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSpikeDetectorPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  spikeColor?: string;
  extremeUpColor?: string;
  spikeUpColor?: string;
  normalColor?: string;
  spikeDownColor?: string;
  extremeDownColor?: string;
  atColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  baselineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSpike?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBaseline?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSpikeDetectorSeriesId[];
  defaultHiddenSeries?: ChartLineSpikeDetectorSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSpikeDetectorSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineSpikeDetectorSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatSpike?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_WIDTH = 720;
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_PADDING = 44;
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_LENGTH = 14;
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_SPIKE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_EXTREME_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_SPIKE_UP_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_NORMAL_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_SPIKE_DOWN_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_EXTREME_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_AT_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SPIKE_DETECTOR_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineSpikeDetectorFinitePoints(
  data: readonly ChartLineSpikeDetectorPoint[] | null | undefined,
): ChartLineSpikeDetectorPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSpikeDetectorPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineSpikeDetectorLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** First difference of the close: `close[i] - close[i - 1]`. */
export function computeLineSpikeDetectorDelta(
  closes: readonly (number | null)[] | null | undefined,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const curr = closes[i];
    const past = closes[i - 1];
    if (
      curr == null ||
      past == null ||
      !isFiniteNumber(curr) ||
      !isFiniteNumber(past)
    ) {
      out.push(null);
      continue;
    }
    out.push(curr - past);
  }
  return out;
}

export interface ChartLineSpikeDetectorOptions {
  length?: number;
}

/**
 * Compute the Spike Detector pipeline per bar. Bars before
 * `i = length` are `null` (`delta` is undefined at bar 0, so
 * the rolling window must start at bar 1, requiring `i >=
 * length`). When `stdDev == 0` (every delta in the window is
 * identical) the spike is `null`.
 */
export function computeLineSpikeDetector(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineSpikeDetectorOptions = {},
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const length = normalizeLineSpikeDetectorLength(
    options.length,
    DEFAULT_CHART_LINE_SPIKE_DETECTOR_LENGTH,
  );
  const delta = computeLineSpikeDetectorDelta(closes);
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < length) {
      out.push(null);
      continue;
    }
    // Compute mean of delta over [i - length + 1, i].
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const d = delta[i - j];
      if (d == null || !isFiniteNumber(d)) {
        ok = false;
        break;
      }
      sum += d;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const mean = sum / length;
    // Compute population standard deviation.
    let sumSq = 0;
    for (let j = 0; j < length; j += 1) {
      const d = delta[i - j]!;
      const diff = d - mean;
      sumSq += diff * diff;
    }
    const stdDev = Math.sqrt(sumSq / length);
    if (stdDev === 0) {
      out.push(null);
      continue;
    }
    const currDelta = delta[i]!;
    const raw = (currDelta - mean) / stdDev;
    // Normalize -0 to +0 defensively.
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

/** Classify a spike reading by Z-score thresholds. */
export function classifyLineSpikeDetectorZone(
  value: number | null,
): ChartLineSpikeDetectorZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= 3) return 'extreme-up';
  if (value >= 1.5) return 'spike-up';
  if (value > 0) return 'normal';
  if (value === 0) return 'at';
  if (value > -1.5) return 'normal';
  if (value > -3) return 'spike-down';
  return 'extreme-down';
}

/** Run the full pipeline plus sample classification. */
export function runLineSpikeDetector(
  data: readonly ChartLineSpikeDetectorPoint[] | null | undefined,
  options: ChartLineSpikeDetectorOptions = {},
): ChartLineSpikeDetectorRun {
  const series = getLineSpikeDetectorFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineSpikeDetectorLength(
    options.length,
    DEFAULT_CHART_LINE_SPIKE_DETECTOR_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const delta = computeLineSpikeDetectorDelta(closes);
  const spike = computeLineSpikeDetector(closes, { length });
  const samples: ChartLineSpikeDetectorSample[] = series.map((point, index) => {
    const value = spike[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      delta: delta[index] ?? null,
      spike: value,
      zone: classifyLineSpikeDetectorZone(value),
    };
  });
  let extremeUpCount = 0;
  let spikeUpCount = 0;
  let normalCount = 0;
  let spikeDownCount = 0;
  let extremeDownCount = 0;
  let atCount = 0;
  let noneCount = 0;
  let spikeFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'extreme-up') extremeUpCount += 1;
    else if (sample.zone === 'spike-up') spikeUpCount += 1;
    else if (sample.zone === 'normal') normalCount += 1;
    else if (sample.zone === 'spike-down') spikeDownCount += 1;
    else if (sample.zone === 'extreme-down') extremeDownCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.spike)) spikeFinal = sample.spike;
  }
  return {
    series,
    length,
    delta,
    spike,
    samples,
    spikeFinal,
    extremeUpCount,
    spikeUpCount,
    normalCount,
    spikeDownCount,
    extremeDownCount,
    atCount,
    noneCount,
    ok: series.length > length,
  };
}

export interface ChartLineSpikeDetectorLayoutOptions
  extends ChartLineSpikeDetectorOptions {
  data: readonly ChartLineSpikeDetectorPoint[] | null | undefined;
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
export function computeLineSpikeDetectorLayout(
  options: ChartLineSpikeDetectorLayoutOptions,
): ChartLineSpikeDetectorLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_SPIKE_DETECTOR_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_SPIKE_DETECTOR_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_SPIKE_DETECTOR_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_SPIKE_DETECTOR_PANEL_GAP;

  const run = runLineSpikeDetector(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const spikeHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const spikeTop = priceBottom + panelGap;
  const spikeBottom = spikeTop + spikeHeight;

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

  // Spike Z-score is centered at 0; pad symmetrically.
  let spikeMin = -3;
  let spikeMax = 3;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.spike)) {
      if (sample.spike < spikeMin) spikeMin = sample.spike;
      if (sample.spike > spikeMax) spikeMax = sample.spike;
    }
  }
  if (spikeMin === spikeMax) {
    spikeMin -= 1;
    spikeMax += 1;
  }
  const spikeY = (value: number): number =>
    spikeBottom - ((value - spikeMin) / (spikeMax - spikeMin)) * spikeHeight;
  const zeroBaselineY = spikeY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineSpikeDetectorDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const spikeLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineSpikeDetectorMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.spike)) return;
    const cx = xAt(index);
    const yc = spikeY(sample.spike);
    spikeLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      spike: sample.spike,
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
    spikeTop,
    spikeBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    spikePath: buildLinePath(spikeLinePoints),
    markers,
    priceMin,
    priceMax,
    spikeMin,
    spikeMax,
    zeroBaselineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineSpikeDetectorChart(
  data: readonly ChartLineSpikeDetectorPoint[] | null | undefined,
  options: ChartLineSpikeDetectorOptions = {},
): string {
  const run = runLineSpikeDetector(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.spikeFinal === null ? 'n/a' : run.spikeFinal.toFixed(4);
  return (
    `Dual-panel chart with a Price Spike Detector panel beneath ` +
    `the close (length ${run.length}). Spike = (delta - meanDelta) ` +
    `/ stdDevDelta, where delta = close - prevClose and the ` +
    `rolling stats span the lookback. Across ${total} bars the ` +
    `detector reads extreme-up (>= 3) on ${run.extremeUpCount}, ` +
    `spike-up (1.5..3) on ${run.spikeUpCount}, normal on ` +
    `${run.normalCount}, at zero on ${run.atCount}, spike-down ` +
    `(-1.5..-3) on ${run.spikeDownCount}, extreme-down (<= -3) ` +
    `on ${run.extremeDownCount}, and undefined on ` +
    `${run.noneCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatSpike(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineSpikeDetectorZone,
  extremeUpColor: string,
  spikeUpColor: string,
  normalColor: string,
  spikeDownColor: string,
  extremeDownColor: string,
  atColor: string,
  noneColor: string,
): string {
  if (zone === 'extreme-up') return extremeUpColor;
  if (zone === 'spike-up') return spikeUpColor;
  if (zone === 'normal') return normalColor;
  if (zone === 'spike-down') return spikeDownColor;
  if (zone === 'extreme-down') return extremeDownColor;
  if (zone === 'at') return atColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineSpikeDetectorZone): string {
  if (zone === 'extreme-up') return 'Extreme Up';
  if (zone === 'spike-up') return 'Spike Up';
  if (zone === 'normal') return 'Normal';
  if (zone === 'spike-down') return 'Spike Down';
  if (zone === 'extreme-down') return 'Extreme Down';
  if (zone === 'at') return 'At Zero';
  return 'n/a';
}

/** ChartLineSpikeDetector -- dual-panel pure-SVG chart. */
export const ChartLineSpikeDetector = forwardRef<
  HTMLDivElement,
  ChartLineSpikeDetectorProps
>(function ChartLineSpikeDetector(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_SPIKE_DETECTOR_LENGTH,
    width = DEFAULT_CHART_LINE_SPIKE_DETECTOR_WIDTH,
    height = DEFAULT_CHART_LINE_SPIKE_DETECTOR_HEIGHT,
    padding = DEFAULT_CHART_LINE_SPIKE_DETECTOR_PADDING,
    panelGap = DEFAULT_CHART_LINE_SPIKE_DETECTOR_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SPIKE_DETECTOR_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SPIKE_DETECTOR_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SPIKE_DETECTOR_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_PRICE_COLOR,
    spikeColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_SPIKE_COLOR,
    extremeUpColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_EXTREME_UP_COLOR,
    spikeUpColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_SPIKE_UP_COLOR,
    normalColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_NORMAL_COLOR,
    spikeDownColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_SPIKE_DOWN_COLOR,
    extremeDownColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_EXTREME_DOWN_COLOR,
    atColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_SPIKE_DETECTOR_BASELINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSpike = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBaseline = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatSpike = defaultFormatSpike,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-spike-detector-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineSpikeDetectorSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineSpikeDetectorSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineSpikeDetectorLayout({
        data,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineSpikeDetectorChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Price Spike Detector chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineSpikeDetectorSeriesId): void => {
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
        data-section="chart-line-spike-detector-tooltip"
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
          data-section="chart-line-spike-detector-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-spike-detector-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-spike-detector-tooltip-delta"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Delta: ${
            hoverSample.delta === null
              ? 'n/a'
              : formatSpike(hoverSample.delta)
          }`}
        </text>
        <text
          data-section="chart-line-spike-detector-tooltip-spike"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Z-score: ${
            hoverSample.spike === null
              ? 'n/a'
              : formatSpike(hoverSample.spike)
          }`}
        </text>
        <text
          data-section="chart-line-spike-detector-tooltip-zone"
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
  const spikeHidden = isHidden('spike') || !showSpike;

  const legendItems: Array<{
    id: ChartLineSpikeDetectorSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'spike', label: 'Spike Z', color: spikeColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-spike-detector"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-spike-final={run.spikeFinal === null ? '' : run.spikeFinal}
      data-extreme-up-count={run.extremeUpCount}
      data-spike-up-count={run.spikeUpCount}
      data-normal-count={run.normalCount}
      data-at-count={run.atCount}
      data-spike-down-count={run.spikeDownCount}
      data-extreme-down-count={run.extremeDownCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-spike-detector-aria-desc"
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
          data-section="chart-line-spike-detector-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-spike-detector-empty"
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
          data-section="chart-line-spike-detector-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-spike-detector-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.spikeBottom -
                  t * (layout.spikeBottom - layout.spikeTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-spike-detector-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-spike-detector-grid-line"
                      data-panel="spike"
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
            <g data-section="chart-line-spike-detector-axes">
              <line
                data-section="chart-line-spike-detector-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-spike-detector-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-spike-detector-axis"
                data-panel="spike"
                x1={layout.innerLeft}
                y1={layout.spikeTop}
                x2={layout.innerLeft}
                y2={layout.spikeBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-spike-detector-axis"
                data-panel="spike"
                x1={layout.innerLeft}
                y1={layout.spikeBottom}
                x2={layout.innerRight}
                y2={layout.spikeBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-spike-detector-tick-label"
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
                data-section="chart-line-spike-detector-tick-label"
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
                data-section="chart-line-spike-detector-tick-label"
                data-panel="spike"
                x={layout.innerLeft - 6}
                y={layout.spikeTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSpike(layout.spikeMax)}
              </text>
              <text
                data-section="chart-line-spike-detector-tick-label"
                data-panel="spike"
                x={layout.innerLeft - 6}
                y={layout.spikeBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSpike(layout.spikeMin)}
              </text>
            </g>
          ) : null}

          {showBaseline ? (
            <line
              data-section="chart-line-spike-detector-baseline"
              x1={layout.innerLeft}
              y1={layout.zeroBaselineY}
              x2={layout.innerRight}
              y2={layout.zeroBaselineY}
              stroke={baselineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-spike-detector-price-path"
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
            <g data-section="chart-line-spike-detector-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-spike-detector-dot"
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

          {!spikeHidden ? (
            <path
              data-section="chart-line-spike-detector-line"
              d={layout.spikePath}
              fill="none"
              stroke={spikeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Spike Z-score line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-spike-detector-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-spike-detector-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-spike={marker.spike}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    extremeUpColor,
                    spikeUpColor,
                    normalColor,
                    spikeDownColor,
                    extremeDownColor,
                    atColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Z-score ${formatSpike(marker.spike)}, ${zoneLabelOf(
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
            <g data-section="chart-line-spike-detector-badge">
              <rect
                data-section="chart-line-spike-detector-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-spike-detector-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Spike Detector ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-spike-detector-legend"
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
                data-section="chart-line-spike-detector-legend-item"
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
                  data-section="chart-line-spike-detector-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-spike-detector-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-spike-detector-legend-stats"
            style={{ color: axisColor }}
          >
            {`extreme ${run.extremeUpCount + run.extremeDownCount} / spike ${run.spikeUpCount + run.spikeDownCount} / normal ${run.normalCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSpikeDetector.displayName = 'ChartLineSpikeDetector';
