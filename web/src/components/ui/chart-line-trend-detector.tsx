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
 * ChartLineTrendDetector -- pure-SVG dual-panel chart with the close
 * on top and a Trend Detector panel on the bottom. Each bar computes
 * the per-bar slope of the SMA over the lookback and flags the bar
 * as uptrend / downtrend / ranging based on the slope magnitude:
 *
 *   mean[i]   = SMA(close, length)[i]
 *   slope[i]  = (mean[i] - mean[i - slopeLookback]) / slopeLookback
 *   regime[i] = slope[i] >=  threshold ?  1 (uptrend)
 *             : slope[i] <= -threshold ? -1 (downtrend)
 *             : 0 (ranging)
 *
 * `slope[i]` and `regime[i]` are `null` during warmup (`i < length -
 * 1 + slopeLookback`) or when any input is non-finite.
 *
 * Bit-exact anchor: **CONST close=K**: `mean = K`, `slope = 0`,
 * `regime = 0` everywhere across `K in {0, 1, 5, 100, -3}` and
 * `length in {3, 4, 7, 10}`.
 *
 * Additional bit-exact anchors:
 * - **LINEAR UP** (`close[i] = i + 1`): SMA of consecutive integers
 *   over a window of `length` bars equals `i + 1 - (length - 1) / 2`.
 *   The slope between two such means separated by `slopeLookback`
 *   bars is exactly `slopeLookback / slopeLookback = 1` --
 *   integer-exact in IEEE 754.
 * - **LINEAR DOWN** (`close[i] = N - i`): mirror -> `slope = -1`,
 *   `regime = -1`.
 */

export interface ChartLineTrendDetectorPoint {
  x: number;
  close: number;
}

export type ChartLineTrendDetectorZone =
  | 'uptrend'
  | 'downtrend'
  | 'ranging'
  | 'none';

export type ChartLineTrendDetectorCross = 'up' | 'down' | null;

export type ChartLineTrendDetectorSeriesId = 'price' | 'slope';

export interface ChartLineTrendDetectorSample {
  index: number;
  x: number;
  close: number;
  mean: number | null;
  slope: number | null;
  regime: number | null;
  zone: ChartLineTrendDetectorZone;
  crossed: ChartLineTrendDetectorCross;
}

export interface ChartLineTrendDetectorRun {
  series: ChartLineTrendDetectorPoint[];
  length: number;
  slopeLookback: number;
  threshold: number;
  meanValues: Array<number | null>;
  slopeValues: Array<number | null>;
  regimeValues: Array<number | null>;
  samples: ChartLineTrendDetectorSample[];
  uptrendCount: number;
  downtrendCount: number;
  rangingCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineTrendDetectorMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  slope: number;
  crossed: 'up' | 'down';
}

export interface ChartLineTrendDetectorDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrendDetectorLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  slopeTop: number;
  slopeBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineTrendDetectorDot[];
  slopePath: string;
  highThresholdY: number;
  lowThresholdY: number;
  zeroLineY: number;
  markers: ChartLineTrendDetectorMarker[];
  priceMin: number;
  priceMax: number;
  slopeMin: number;
  slopeMax: number;
  run: ChartLineTrendDetectorRun;
}

export interface ChartLineTrendDetectorProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrendDetectorPoint[];
  length?: number;
  slopeLookback?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  slopeColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroLineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSlope?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrendDetectorSeriesId[];
  defaultHiddenSeries?: ChartLineTrendDetectorSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrendDetectorSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineTrendDetectorSample }) => void;
  formatPrice?: (value: number) => string;
  formatSlope?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TREND_DETECTOR_WIDTH = 720;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_PADDING = 44;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_LENGTH = 14;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_SLOPE_LOOKBACK = 5;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_THRESHOLD = 0.1;
export const DEFAULT_CHART_LINE_TREND_DETECTOR_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TREND_DETECTOR_SLOPE_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_TREND_DETECTOR_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TREND_DETECTOR_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TREND_DETECTOR_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_TREND_DETECTOR_ZERO_LINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_TREND_DETECTOR_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TREND_DETECTOR_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineTrendDetectorFinitePoints(
  data: readonly ChartLineTrendDetectorPoint[] | null | undefined,
): ChartLineTrendDetectorPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrendDetectorPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineTrendDetectorLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer slope lookback (>= 1). */
export function normalizeLineTrendDetectorSlopeLookback(
  lookback: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(lookback) && lookback >= 1) return Math.floor(lookback);
  return fallback;
}

/** Coerce a non-negative finite threshold. */
export function normalizeLineTrendDetectorThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

/** Rolling SMA. */
export function applyLineTrendDetectorSma(
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

export interface ChartLineTrendDetectorOptions {
  length?: number;
  slopeLookback?: number;
  threshold?: number;
}

export interface ChartLineTrendDetectorChannels {
  mean: Array<number | null>;
  slope: Array<number | null>;
  regime: Array<number | null>;
}

/** Compute the trend detector pipeline. */
export function computeLineTrendDetector(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineTrendDetectorOptions = {},
): ChartLineTrendDetectorChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { mean: [], slope: [], regime: [] };
  }
  const length = normalizeLineTrendDetectorLength(
    options.length,
    DEFAULT_CHART_LINE_TREND_DETECTOR_LENGTH,
  );
  const slopeLookback = normalizeLineTrendDetectorSlopeLookback(
    options.slopeLookback,
    DEFAULT_CHART_LINE_TREND_DETECTOR_SLOPE_LOOKBACK,
  );
  const threshold = normalizeLineTrendDetectorThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_TREND_DETECTOR_THRESHOLD,
  );
  const mean = applyLineTrendDetectorSma(closes, length);
  const slope: Array<number | null> = [];
  const regime: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const m = mean[i];
    if (m == null || !isFiniteNumber(m) || i < slopeLookback) {
      slope.push(null);
      regime.push(null);
      continue;
    }
    const past = mean[i - slopeLookback];
    if (past == null || !isFiniteNumber(past)) {
      slope.push(null);
      regime.push(null);
      continue;
    }
    const s = (m - past) / slopeLookback;
    const normalized = s === 0 ? 0 : s;
    slope.push(normalized);
    let r: number;
    if (normalized >= threshold) r = 1;
    else if (normalized <= -threshold) r = -1;
    else r = 0;
    regime.push(r);
  }
  return { mean, slope, regime };
}

/** Classify a regime reading. */
export function classifyLineTrendDetectorZone(
  value: number | null,
): ChartLineTrendDetectorZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > 0) return 'uptrend';
  if (value < 0) return 'downtrend';
  return 'ranging';
}

/**
 * Detect regime transitions. `'up'` when prev regime was not 1 and
 * current is 1 (entering uptrend); `'down'` when prev was not -1 and
 * current is -1 (entering downtrend).
 */
export function detectLineTrendDetectorCrosses(
  regimes: readonly (number | null)[],
): Array<ChartLineTrendDetectorCross> {
  const out: Array<ChartLineTrendDetectorCross> = [];
  let prev: number | null = null;
  for (let i = 0; i < regimes.length; i += 1) {
    const v = regimes[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (v === 1 && prev !== 1) {
      out.push('up');
    } else if (v === -1 && prev !== -1) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineTrendDetector(
  data: readonly ChartLineTrendDetectorPoint[] | null | undefined,
  options: ChartLineTrendDetectorOptions = {},
): ChartLineTrendDetectorRun {
  const series = getLineTrendDetectorFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineTrendDetectorLength(
    options.length,
    DEFAULT_CHART_LINE_TREND_DETECTOR_LENGTH,
  );
  const slopeLookback = normalizeLineTrendDetectorSlopeLookback(
    options.slopeLookback,
    DEFAULT_CHART_LINE_TREND_DETECTOR_SLOPE_LOOKBACK,
  );
  const threshold = normalizeLineTrendDetectorThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_TREND_DETECTOR_THRESHOLD,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineTrendDetector(closes, {
    length,
    slopeLookback,
    threshold,
  });
  const crosses = detectLineTrendDetectorCrosses(channels.regime);
  const samples: ChartLineTrendDetectorSample[] = series.map(
    (point, index) => {
      const regimeValue = channels.regime[index] ?? null;
      const slopeValue = channels.slope[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        mean: channels.mean[index] ?? null,
        slope: slopeValue,
        regime: regimeValue,
        zone: classifyLineTrendDetectorZone(regimeValue),
        crossed: crosses[index] ?? null,
      };
    },
  );
  let uptrendCount = 0;
  let downtrendCount = 0;
  let rangingCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'uptrend') uptrendCount += 1;
    else if (sample.zone === 'downtrend') downtrendCount += 1;
    else if (sample.zone === 'ranging') rangingCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series = [],
    length,
    slopeLookback,
    threshold,
    meanValues: channels.mean,
    slopeValues: channels.slope,
    regimeValues: channels.regime,
    samples,
    uptrendCount,
    downtrendCount,
    rangingCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length + slopeLookback,
  };
}

export interface ChartLineTrendDetectorLayoutOptions
  extends ChartLineTrendDetectorOptions {
  data: readonly ChartLineTrendDetectorPoint[] | null | undefined;
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
export function computeLineTrendDetectorLayout(
  options: ChartLineTrendDetectorLayoutOptions,
): ChartLineTrendDetectorLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TREND_DETECTOR_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TREND_DETECTOR_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TREND_DETECTOR_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_TREND_DETECTOR_PANEL_GAP;

  const run = runLineTrendDetector(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.slopeLookback !== undefined
      ? { slopeLookback: options.slopeLookback }
      : {}),
    ...(options.threshold !== undefined
      ? { threshold: options.threshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const slopeHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const slopeTop = priceBottom + panelGap;
  const slopeBottom = slopeTop + slopeHeight;

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

  // Slope axis: include both thresholds with cushion, expand to data.
  let slopeMax = Math.max(run.threshold * 1.5, 0.5);
  let slopeMin = -slopeMax;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.slope)) {
      if (sample.slope > slopeMax) slopeMax = sample.slope;
      if (sample.slope < slopeMin) slopeMin = sample.slope;
    }
  }
  if (slopeMin === slopeMax) {
    slopeMin -= 1;
    slopeMax += 1;
  }
  const slopeY = (value: number): number =>
    slopeBottom - ((value - slopeMin) / (slopeMax - slopeMin)) * slopeHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineTrendDetectorDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const slopeLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineTrendDetectorMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.slope)) return;
    const cx = xAt(index);
    const yc = slopeY(sample.slope);
    slopeLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        slope: sample.slope,
        crossed: sample.crossed,
      });
    }
  });

  const highThresholdY = slopeY(run.threshold);
  const lowThresholdY = slopeY(-run.threshold);
  const zeroLineY = slopeY(0);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    slopeTop,
    slopeBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    slopePath: buildLinePath(slopeLinePoints),
    highThresholdY,
    lowThresholdY,
    zeroLineY,
    markers,
    priceMin,
    priceMax,
    slopeMin,
    slopeMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineTrendDetectorChart(
  data: readonly ChartLineTrendDetectorPoint[] | null | undefined,
  options: ChartLineTrendDetectorOptions = {},
): string {
  const run = runLineTrendDetector(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Trend Detector on the lower panel ` +
    `(length ${run.length}, slopeLookback ${run.slopeLookback}, ` +
    `threshold ${run.threshold}). The SMA slope is compared against ` +
    `+/- threshold to classify each bar as uptrend / downtrend / ` +
    `ranging. Across ${total} bars the detector saw ${run.uptrendCount} ` +
    `uptrend, ${run.downtrendCount} downtrend, ${run.rangingCount} ` +
    `ranging, and ${run.noneCount} undefined readings, with ` +
    `${run.bullishCrossCount} uptrend entries and ` +
    `${run.bearishCrossCount} downtrend entries.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatSlope(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return value.toFixed(4);
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

function zoneLabelOf(zone: ChartLineTrendDetectorZone): string {
  if (zone === 'uptrend') return 'Uptrend';
  if (zone === 'downtrend') return 'Downtrend';
  if (zone === 'ranging') return 'Ranging';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineTrendDetectorCross): string {
  if (crossed === 'up') return 'Entered uptrend';
  if (crossed === 'down') return 'Entered downtrend';
  return '-';
}

/** ChartLineTrendDetector -- dual-panel pure-SVG chart. */
export const ChartLineTrendDetector = forwardRef<
  HTMLDivElement,
  ChartLineTrendDetectorProps
>(function ChartLineTrendDetector(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_TREND_DETECTOR_LENGTH,
    slopeLookback = DEFAULT_CHART_LINE_TREND_DETECTOR_SLOPE_LOOKBACK,
    threshold = DEFAULT_CHART_LINE_TREND_DETECTOR_THRESHOLD,
    width = DEFAULT_CHART_LINE_TREND_DETECTOR_WIDTH,
    height = DEFAULT_CHART_LINE_TREND_DETECTOR_HEIGHT,
    padding = DEFAULT_CHART_LINE_TREND_DETECTOR_PADDING,
    panelGap = DEFAULT_CHART_LINE_TREND_DETECTOR_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TREND_DETECTOR_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TREND_DETECTOR_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TREND_DETECTOR_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TREND_DETECTOR_PRICE_COLOR,
    slopeColor = DEFAULT_CHART_LINE_TREND_DETECTOR_SLOPE_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TREND_DETECTOR_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TREND_DETECTOR_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_TREND_DETECTOR_THRESHOLD_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_TREND_DETECTOR_ZERO_LINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_TREND_DETECTOR_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TREND_DETECTOR_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSlope = true,
    showMarkers = true,
    showThresholds = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatSlope = defaultFormatSlope,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-trend-detector-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineTrendDetectorSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineTrendDetectorSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineTrendDetectorLayout({
        data,
        length,
        slopeLookback,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      length,
      slopeLookback,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineTrendDetectorChart(data, {
      length,
      slopeLookback,
      threshold,
    });
  const resolvedLabel =
    ariaLabel ?? `Trend Detector chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineTrendDetectorSeriesId): void => {
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
    const tooltipW = 260;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-trend-detector-tooltip"
        pointerEvents="none"
      >
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
          data-section="chart-line-trend-detector-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-trend-detector-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-trend-detector-tooltip-mean"
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
          data-section="chart-line-trend-detector-tooltip-slope"
          x={tx + 10}
          y={ty + 71}
          fill="#7dd3fc"
          fontSize={11}
          fontWeight={600}
        >
          {`Slope: ${
            hoverSample.slope === null
              ? 'n/a'
              : formatSlope(hoverSample.slope)
          }`}
        </text>
        <text
          data-section="chart-line-trend-detector-tooltip-regime"
          x={tx + 10}
          y={ty + 89}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Regime: ${
            hoverSample.regime === null ? 'n/a' : hoverSample.regime
          }`}
        </text>
        <text
          data-section="chart-line-trend-detector-tooltip-zone"
          x={tx + 10}
          y={ty + 105}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-trend-detector-tooltip-cross"
          x={tx + 10}
          y={ty + 121}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
        <text
          data-section="chart-line-trend-detector-tooltip-threshold"
          x={tx + 10}
          y={ty + 137}
          fill="#94a3b8"
          fontSize={10}
        >
          {`Threshold: +/-${formatSlope(run.threshold)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const slopeHidden = isHidden('slope') || !showSlope;

  const legendItems: Array<{
    id: ChartLineTrendDetectorSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'slope', label: 'SMA Slope', color: slopeColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-trend-detector"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-slope-lookback={run.slopeLookback}
      data-threshold={run.threshold}
      data-uptrend-count={run.uptrendCount}
      data-downtrend-count={run.downtrendCount}
      data-ranging-count={run.rangingCount}
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
        data-section="chart-line-trend-detector-aria-desc"
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
          data-section="chart-line-trend-detector-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-trend-detector-empty"
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
          data-section="chart-line-trend-detector-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-trend-detector-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.slopeBottom -
                  t * (layout.slopeBottom - layout.slopeTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-trend-detector-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-trend-detector-grid-line"
                      data-panel="slope"
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
            <g data-section="chart-line-trend-detector-axes">
              <line
                data-section="chart-line-trend-detector-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-detector-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-detector-axis"
                data-panel="slope"
                x1={layout.innerLeft}
                y1={layout.slopeTop}
                x2={layout.innerLeft}
                y2={layout.slopeBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-trend-detector-axis"
                data-panel="slope"
                x1={layout.innerLeft}
                y1={layout.slopeBottom}
                x2={layout.innerRight}
                y2={layout.slopeBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-trend-detector-tick-label"
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
                data-section="chart-line-trend-detector-tick-label"
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
                data-section="chart-line-trend-detector-tick-label"
                data-panel="slope"
                x={layout.innerLeft - 6}
                y={layout.slopeTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSlope(layout.slopeMax)}
              </text>
              <text
                data-section="chart-line-trend-detector-tick-label"
                data-panel="slope"
                x={layout.innerLeft - 6}
                y={layout.slopeBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSlope(layout.slopeMin)}
              </text>
            </g>
          ) : null}

          {showThresholds ? (
            <g data-section="chart-line-trend-detector-thresholds">
              <line
                data-section="chart-line-trend-detector-high-threshold-line"
                x1={layout.innerLeft}
                y1={layout.highThresholdY}
                x2={layout.innerRight}
                y2={layout.highThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-trend-detector-low-threshold-line"
                x1={layout.innerLeft}
                y1={layout.lowThresholdY}
                x2={layout.innerRight}
                y2={layout.lowThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-trend-detector-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-trend-detector-price-path"
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
            <g data-section="chart-line-trend-detector-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-trend-detector-dot"
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

          {!slopeHidden ? (
            <path
              data-section="chart-line-trend-detector-line"
              d={layout.slopePath}
              fill="none"
              stroke={slopeColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`SMA Slope line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-trend-detector-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-trend-detector-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-slope={marker.slope}
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
                  )}, slope ${formatSlope(marker.slope)}, ${crossLabelOf(
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
            <g data-section="chart-line-trend-detector-badge">
              <rect
                data-section="chart-line-trend-detector-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={240}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-trend-detector-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Trend Detect ${run.length}/${run.slopeLookback} T>=${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-trend-detector-legend"
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
                data-section="chart-line-trend-detector-legend-item"
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
                  data-section="chart-line-trend-detector-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-trend-detector-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-trend-detector-legend-stats"
            style={{ color: axisColor }}
          >
            {`up ${run.uptrendCount} / down ${run.downtrendCount} / range ${run.rangingCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTrendDetector.displayName = 'ChartLineTrendDetector';
