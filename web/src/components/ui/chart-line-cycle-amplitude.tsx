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
 * ChartLineCycleAmplitude -- pure-SVG dual-panel chart with a
 * Cycle Amplitude oscillator panel beneath the close. The
 * amplitude is the peak-to-trough span of the detrended close
 * (close - rolling SMA) over a lookback window.
 *
 * Definition:
 *
 *   detrended[i]  = close[i] - SMA(close, smoothLength)[i]
 *   amplitude[i]  = max(detrended[i - lookback + 1..i])
 *                 - min(detrended[i - lookback + 1..i])
 *
 * Defaults: `lookback = 30`, `smoothLength = 4`. Bars before
 * `i = lookback + smoothLength - 1` are `null` (warmup).
 *
 * Bit-exact anchors:
 *
 *   * **CONST_FLAT (close == K)**: SMA = K so detrended = 0
 *     everywhere -> `max - min = 0 - 0 = 0` **bit-exact** at
 *     every bar past the warmup. Verified for any K with K
 *     such that the SMA rounds back to K (integer K and many
 *     dyadic K).
 *   * **RISING_BY_S (close[i] = c0 + S * i)**: SMA settles to
 *     `close - S * (n - 1) / 2`, so detrended is a constant
 *     `S * (n - 1) / 2` from bar `smoothLength - 1` onwards.
 *     `max - min = const - const = 0` **bit-exact** past warmup.
 *   * **FALLING_BY_S**: symmetric -> amplitude = 0.
 *   * **Sinusoid of period P, amplitude A**: peak-to-trough of
 *     the detrended sinusoid is approximately `2 * A` after
 *     the warmup.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the amplitude with a
 * zero baseline (the amplitude is non-negative).
 */

export interface ChartLineCycleAmplitudePoint {
  x: number;
  close: number;
}

export type ChartLineCycleAmplitudeZone = 'high' | 'mid' | 'low' | 'none';

export type ChartLineCycleAmplitudeSeriesId = 'price' | 'amplitude';

export interface ChartLineCycleAmplitudeSample {
  index: number;
  x: number;
  close: number;
  amplitude: number | null;
  zone: ChartLineCycleAmplitudeZone;
}

export interface ChartLineCycleAmplitudeRun {
  series: ChartLineCycleAmplitudePoint[];
  lookback: number;
  smoothLength: number;
  highThreshold: number;
  lowThreshold: number;
  amplitude: Array<number | null>;
  samples: ChartLineCycleAmplitudeSample[];
  amplitudeFinal: number | null;
  amplitudeMin: number;
  amplitudeMax: number;
  highCount: number;
  midCount: number;
  lowCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineCycleAmplitudeMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  amplitude: number;
  zone: ChartLineCycleAmplitudeZone;
}

export interface ChartLineCycleAmplitudeDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCycleAmplitudeLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  amplitudeTop: number;
  amplitudeBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineCycleAmplitudeDot[];
  amplitudePath: string;
  markers: ChartLineCycleAmplitudeMarker[];
  priceMin: number;
  priceMax: number;
  ampPanelMin: number;
  ampPanelMax: number;
  highBandY: number;
  lowBandY: number;
  zeroLineY: number;
  run: ChartLineCycleAmplitudeRun;
}

export interface ChartLineCycleAmplitudeProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCycleAmplitudePoint[];
  lookback?: number;
  smoothLength?: number;
  highThreshold?: number;
  lowThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  amplitudeColor?: string;
  highColor?: string;
  midColor?: string;
  lowColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  bandColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAmplitude?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCycleAmplitudeSeriesId[];
  defaultHiddenSeries?: ChartLineCycleAmplitudeSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCycleAmplitudeSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineCycleAmplitudeSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatAmplitude?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_WIDTH = 720;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_PADDING = 44;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOOKBACK = 30;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_SMOOTH_LENGTH = 4;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_HIGH_THRESHOLD = 5;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOW_THRESHOLD = 1;
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_AMP_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_HIGH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_MID_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOW_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_BAND_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineCycleAmplitudeFinitePoints(
  data: readonly ChartLineCycleAmplitudePoint[] | null | undefined,
): ChartLineCycleAmplitudePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCycleAmplitudePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineCycleAmplitudeLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite threshold. */
export function normalizeLineCycleAmplitudeThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

/**
 * Simple Moving Average; nulls inside the window null the bar.
 */
export function applyLineCycleAmplitudeSma(
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
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(sum / length);
  }
  return out;
}

export interface ChartLineCycleAmplitudeOptions {
  lookback?: number;
  smoothLength?: number;
}

/**
 * Compute the cycle amplitude per bar. Bars before
 * `i = lookback + smoothLength - 1` are `null` (warmup).
 */
export function computeLineCycleAmplitude(
  closes: readonly number[] | null | undefined,
  options: ChartLineCycleAmplitudeOptions = {},
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const lookback = normalizeLineCycleAmplitudeLength(
    options.lookback,
    DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOOKBACK,
  );
  const smoothLength = normalizeLineCycleAmplitudeLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_SMOOTH_LENGTH,
  );
  const sma = applyLineCycleAmplitudeSma(closes, smoothLength);
  const detrended: Array<number | null> = closes.map((c, i) => {
    const m = sma[i];
    if (m == null || !isFiniteNumber(c) || !isFiniteNumber(m)) return null;
    return c - m;
  });
  const out: Array<number | null> = [];
  const requiredBars = lookback + smoothLength - 1;
  for (let i = 0; i < closes.length; i += 1) {
    if (i < requiredBars) {
      out.push(null);
      continue;
    }
    let mn = Infinity;
    let mx = -Infinity;
    let ok = true;
    for (let j = 0; j < lookback; j += 1) {
      const v = detrended[i - j];
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(mx - mn);
  }
  return out;
}

/** Classify an amplitude reading. */
export function classifyLineCycleAmplitudeZone(
  value: number | null,
  highThreshold: number,
  lowThreshold: number,
): ChartLineCycleAmplitudeZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= highThreshold) return 'high';
  if (value <= lowThreshold) return 'low';
  return 'mid';
}

/** Run the full Cycle Amplitude pipeline plus sample classification. */
export function runLineCycleAmplitude(
  data: readonly ChartLineCycleAmplitudePoint[] | null | undefined,
  options: ChartLineCycleAmplitudeOptions & {
    highThreshold?: number;
    lowThreshold?: number;
  } = {},
): ChartLineCycleAmplitudeRun {
  const series = getLineCycleAmplitudeFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const lookback = normalizeLineCycleAmplitudeLength(
    options.lookback,
    DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOOKBACK,
  );
  const smoothLength = normalizeLineCycleAmplitudeLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_SMOOTH_LENGTH,
  );
  const highThreshold = normalizeLineCycleAmplitudeThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineCycleAmplitudeThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOW_THRESHOLD,
  );
  const closes = series.map((p) => p.close);
  const amplitude = computeLineCycleAmplitude(closes, {
    lookback,
    smoothLength,
  });
  const samples: ChartLineCycleAmplitudeSample[] = series.map((point, index) => {
    const value = amplitude[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      amplitude: value,
      zone: classifyLineCycleAmplitudeZone(
        value,
        highThreshold,
        lowThreshold,
      ),
    };
  });
  let highCount = 0;
  let midCount = 0;
  let lowCount = 0;
  let noneCount = 0;
  let amplitudeFinal: number | null = null;
  let amplitudeMin = Infinity;
  let amplitudeMax = -Infinity;
  for (const sample of samples) {
    if (sample.zone === 'high') highCount += 1;
    else if (sample.zone === 'mid') midCount += 1;
    else if (sample.zone === 'low') lowCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.amplitude)) {
      amplitudeFinal = sample.amplitude;
      if (sample.amplitude < amplitudeMin) amplitudeMin = sample.amplitude;
      if (sample.amplitude > amplitudeMax) amplitudeMax = sample.amplitude;
    }
  }
  if (!Number.isFinite(amplitudeMin)) amplitudeMin = 0;
  if (!Number.isFinite(amplitudeMax)) amplitudeMax = 0;
  return {
    series = [],
    lookback,
    smoothLength,
    highThreshold,
    lowThreshold,
    amplitude,
    samples,
    amplitudeFinal,
    amplitudeMin,
    amplitudeMax,
    highCount,
    midCount,
    lowCount,
    noneCount,
    ok: series.length >= lookback + smoothLength,
  };
}

export interface ChartLineCycleAmplitudeLayoutOptions
  extends ChartLineCycleAmplitudeOptions {
  data: readonly ChartLineCycleAmplitudePoint[] | null | undefined;
  highThreshold?: number;
  lowThreshold?: number;
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
export function computeLineCycleAmplitudeLayout(
  options: ChartLineCycleAmplitudeLayoutOptions,
): ChartLineCycleAmplitudeLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_PANEL_GAP;

  const run = runLineCycleAmplitude(options.data, {
    ...(options.lookback !== undefined ? { lookback: options.lookback } : {}),
    ...(options.smoothLength !== undefined
      ? { smoothLength: options.smoothLength }
      : {}),
    ...(options.highThreshold !== undefined
      ? { highThreshold: options.highThreshold }
      : {}),
    ...(options.lowThreshold !== undefined
      ? { lowThreshold: options.lowThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const ampHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const amplitudeTop = priceBottom + panelGap;
  const amplitudeBottom = amplitudeTop + ampHeight;

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

  // Amplitude panel: non-negative, spans [0, max(amplitudeMax, highThreshold)].
  let ampPanelMin = 0;
  let ampPanelMax = run.amplitudeMax;
  if (run.highThreshold > ampPanelMax) ampPanelMax = run.highThreshold;
  if (ampPanelMax <= 0) ampPanelMax = 1;
  const amplitudeY = (value: number): number =>
    amplitudeBottom -
    ((value - ampPanelMin) / (ampPanelMax - ampPanelMin)) * ampHeight;
  const highBandY = amplitudeY(run.highThreshold);
  const lowBandY = amplitudeY(run.lowThreshold);
  const zeroLineY = amplitudeY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineCycleAmplitudeDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const ampLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineCycleAmplitudeMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.amplitude)) return;
    const cx = xAt(index);
    const yc = amplitudeY(sample.amplitude);
    ampLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      amplitude: sample.amplitude,
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
    amplitudeTop,
    amplitudeBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    amplitudePath: buildLinePath(ampLinePoints),
    markers,
    priceMin,
    priceMax,
    ampPanelMin,
    ampPanelMax,
    highBandY,
    lowBandY,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineCycleAmplitudeChart(
  data: readonly ChartLineCycleAmplitudePoint[] | null | undefined,
  options: ChartLineCycleAmplitudeOptions & {
    highThreshold?: number;
    lowThreshold?: number;
  } = {},
): string {
  const run = runLineCycleAmplitude(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.amplitudeFinal === null ? 'n/a' : run.amplitudeFinal.toFixed(4);
  return (
    `Dual-panel chart with a Cycle Amplitude oscillator panel ` +
    `beneath the close (lookback ${run.lookback}, smooth ` +
    `${run.smoothLength}, high band ${run.highThreshold}, low ` +
    `band ${run.lowThreshold}). The amplitude is the peak-to- ` +
    `trough span of the detrended close (close minus rolling ` +
    `SMA) over the lookback window. Across ${total} bars the ` +
    `amplitude is high on ${run.highCount}, mid on ` +
    `${run.midCount}, low on ${run.lowCount}, and undefined on ` +
    `${run.noneCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatAmplitude(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineCycleAmplitudeZone,
  highColor: string,
  midColor: string,
  lowColor: string,
  noneColor: string,
): string {
  if (zone === 'high') return highColor;
  if (zone === 'mid') return midColor;
  if (zone === 'low') return lowColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineCycleAmplitudeZone): string {
  if (zone === 'high') return 'High';
  if (zone === 'mid') return 'Mid';
  if (zone === 'low') return 'Low';
  return 'n/a';
}

/**
 * ChartLineCycleAmplitude -- dual-panel pure-SVG cycle
 * amplitude oscillator chart.
 */
export const ChartLineCycleAmplitude = forwardRef<
  HTMLDivElement,
  ChartLineCycleAmplitudeProps
>(function ChartLineCycleAmplitude(props, ref) {
  const {
    data,
    lookback = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOOKBACK,
    smoothLength = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_SMOOTH_LENGTH,
    highThreshold = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_HIGH_THRESHOLD,
    lowThreshold = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOW_THRESHOLD,
    width = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_WIDTH,
    height = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_HEIGHT,
    padding = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_PADDING,
    panelGap = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_PRICE_COLOR,
    amplitudeColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_AMP_COLOR,
    highColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_HIGH_COLOR,
    midColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_MID_COLOR,
    lowColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_LOW_COLOR,
    noneColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_GRID_COLOR,
    bandColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_BAND_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_CYCLE_AMPLITUDE_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAmplitude = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
    showZeroLine = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatAmplitude = defaultFormatAmplitude,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-cycle-amplitude-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineCycleAmplitudeSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineCycleAmplitudeSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineCycleAmplitudeLayout({
        data,
        lookback,
        smoothLength,
        highThreshold,
        lowThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      lookback,
      smoothLength,
      highThreshold,
      lowThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineCycleAmplitudeChart(data, {
      lookback,
      smoothLength,
      highThreshold,
      lowThreshold,
    });
  const resolvedLabel =
    ariaLabel ??
    `Cycle Amplitude chart, lookback ${run.lookback}, smooth ${run.smoothLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineCycleAmplitudeSeriesId): void => {
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
        data-section="chart-line-cycle-amplitude-tooltip"
        pointerEvents="none"
      >
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
          data-section="chart-line-cycle-amplitude-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-cycle-amplitude-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-cycle-amplitude-tooltip-amplitude"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Amplitude: ${
            hoverSample.amplitude === null
              ? 'n/a'
              : formatAmplitude(hoverSample.amplitude)
          }`}
        </text>
        <text
          data-section="chart-line-cycle-amplitude-tooltip-zone"
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

  const priceHidden = isHidden('price');
  const amplitudeHidden = isHidden('amplitude') || !showAmplitude;

  const legendItems: Array<{
    id: ChartLineCycleAmplitudeSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'amplitude', label: 'Cycle Amplitude', color: amplitudeColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-cycle-amplitude"
      data-empty={isEmpty ? 'true' : 'false'}
      data-lookback={run.lookback}
      data-smooth-length={run.smoothLength}
      data-amplitude-final={
        run.amplitudeFinal === null ? '' : run.amplitudeFinal
      }
      data-high-count={run.highCount}
      data-mid-count={run.midCount}
      data-low-count={run.lowCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-cycle-amplitude-aria-desc"
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
          data-section="chart-line-cycle-amplitude-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-cycle-amplitude-empty"
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
          data-section="chart-line-cycle-amplitude-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-cycle-amplitude-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const ya =
                  layout.amplitudeBottom -
                  t * (layout.amplitudeBottom - layout.amplitudeTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-cycle-amplitude-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-cycle-amplitude-grid-line"
                      data-panel="amplitude"
                      x1={layout.innerLeft}
                      y1={ya}
                      x2={layout.innerRight}
                      y2={ya}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-cycle-amplitude-axes">
              <line
                data-section="chart-line-cycle-amplitude-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cycle-amplitude-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cycle-amplitude-axis"
                data-panel="amplitude"
                x1={layout.innerLeft}
                y1={layout.amplitudeTop}
                x2={layout.innerLeft}
                y2={layout.amplitudeBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cycle-amplitude-axis"
                data-panel="amplitude"
                x1={layout.innerLeft}
                y1={layout.amplitudeBottom}
                x2={layout.innerRight}
                y2={layout.amplitudeBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-cycle-amplitude-tick-label"
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
                data-section="chart-line-cycle-amplitude-tick-label"
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
                data-section="chart-line-cycle-amplitude-tick-label"
                data-panel="amplitude"
                x={layout.innerLeft - 6}
                y={layout.amplitudeTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatAmplitude(layout.ampPanelMax)}
              </text>
              <text
                data-section="chart-line-cycle-amplitude-tick-label"
                data-panel="amplitude"
                x={layout.innerLeft - 6}
                y={layout.amplitudeBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatAmplitude(layout.ampPanelMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-cycle-amplitude-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {showBands ? (
            <g data-section="chart-line-cycle-amplitude-bands">
              <line
                data-section="chart-line-cycle-amplitude-high-band"
                x1={layout.innerLeft}
                y1={layout.highBandY}
                x2={layout.innerRight}
                y2={layout.highBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-cycle-amplitude-low-band"
                x1={layout.innerLeft}
                y1={layout.lowBandY}
                x2={layout.innerRight}
                y2={layout.lowBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-cycle-amplitude-price-path"
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
            <g data-section="chart-line-cycle-amplitude-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-cycle-amplitude-dot"
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

          {!amplitudeHidden ? (
            <path
              data-section="chart-line-cycle-amplitude-line"
              d={layout.amplitudePath}
              fill="none"
              stroke={amplitudeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Cycle Amplitude line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-cycle-amplitude-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-cycle-amplitude-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-amplitude={marker.amplitude}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    highColor,
                    midColor,
                    lowColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Amplitude ${formatAmplitude(marker.amplitude)}, ${zoneLabelOf(
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
            <g data-section="chart-line-cycle-amplitude-badge">
              <rect
                data-section="chart-line-cycle-amplitude-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-cycle-amplitude-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Cycle Amplitude ${run.lookback}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-cycle-amplitude-legend"
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
                data-section="chart-line-cycle-amplitude-legend-item"
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
                  data-section="chart-line-cycle-amplitude-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-cycle-amplitude-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-cycle-amplitude-legend-stats"
            style={{ color: axisColor }}
          >
            {`high ${run.highCount} / mid ${run.midCount} / low ${run.lowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCycleAmplitude.displayName = 'ChartLineCycleAmplitude';
