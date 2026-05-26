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
 * ChartLineHilbertCycle -- pure-SVG dual-panel chart with a
 * Hilbert Transform cycle oscillator panel beneath the close.
 *
 * Definition (after John Ehlers' analytic signal pipeline):
 *
 *   detrender[i] = 0.0962 * close[i] + 0.5769 * close[i - 2]
 *                - 0.5769 * close[i - 4] - 0.0962 * close[i - 6]
 *   I[i]         = detrender[i - 3]                  (in-phase)
 *   Q[i]         = 0.0962 * detrender[i] + 0.5769 * detrender[i - 2]
 *                - 0.5769 * detrender[i - 4] - 0.0962 * detrender[i - 6]
 *   smoothedI[i] = SMA(I, smoothLength)
 *   smoothedQ[i] = SMA(Q, smoothLength)
 *   cycle[i]     = smoothedQ[i]
 *
 * The 6-tap Hilbert FIR uses Ehlers' canonical coefficients
 * `(0.0962, 0, 0.5769, 0, -0.5769, 0, -0.0962)`. The cycle is
 * the SMA-smoothed Quadrature component, which is 90 degrees
 * out of phase with the In-Phase component and reveals the
 * oscillatory part of the detrended price.
 *
 * Bit-exact anchor:
 *
 *   * **K = 0 (close == 0)**: the FIR yields exactly 0, so
 *     `I = Q = 0` and `cycle = 0` bit-exact at every bar
 *     past the warmup.
 *
 * Numerical anchor:
 *
 *   * **CONST_FLAT (close == K, K != 0)**: the FIR rounds to
 *     within a few ULPs of zero, so `cycle ~ 0` to numerical
 *     tolerance.
 *
 * Bars before the combined warmup
 * `i = 6 (FIR) + 3 (I delay) + smoothLength - 1` are `null`.
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the cycle with a
 * zero baseline.
 */

export interface ChartLineHilbertCyclePoint {
  x: number;
  close: number;
}

export type ChartLineHilbertCycleZone =
  | 'positive'
  | 'flat'
  | 'negative'
  | 'none';

export type ChartLineHilbertCycleSeriesId = 'price' | 'cycle' | 'inphase';

export interface ChartLineHilbertCycleSample {
  index: number;
  x: number;
  close: number;
  inPhase: number | null;
  cycle: number | null;
  zone: ChartLineHilbertCycleZone;
}

export interface ChartLineHilbertCycleRun {
  series: ChartLineHilbertCyclePoint[];
  smoothLength: number;
  inPhase: Array<number | null>;
  cycle: Array<number | null>;
  samples: ChartLineHilbertCycleSample[];
  cycleFinal: number | null;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineHilbertCycleMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  cycle: number;
  zone: ChartLineHilbertCycleZone;
}

export interface ChartLineHilbertCycleDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHilbertCycleLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  cycleTop: number;
  cycleBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineHilbertCycleDot[];
  cyclePath: string;
  inPhasePath: string;
  markers: ChartLineHilbertCycleMarker[];
  priceMin: number;
  priceMax: number;
  cycleMin: number;
  cycleMax: number;
  zeroLineY: number;
  run: ChartLineHilbertCycleRun;
}

export interface ChartLineHilbertCycleProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHilbertCyclePoint[];
  smoothLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cycleColor?: string;
  inPhaseColor?: string;
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
  showCycle?: boolean;
  showInPhase?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHilbertCycleSeriesId[];
  defaultHiddenSeries?: ChartLineHilbertCycleSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHilbertCycleSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineHilbertCycleSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatCycle?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HILBERT_CYCLE_WIDTH = 720;
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_PADDING = 44;
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_SMOOTH_LENGTH = 4;
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_CYCLE_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_INPHASE_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HILBERT_CYCLE_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const HILBERT_A1 = 0.0962;
const HILBERT_A2 = 0.5769;

/** Keep only points with finite `x` and `close`. */
export function getLineHilbertCycleFinitePoints(
  data: readonly ChartLineHilbertCyclePoint[] | null | undefined,
): ChartLineHilbertCyclePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHilbertCyclePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineHilbertCycleLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/**
 * Apply the 6-tap Hilbert FIR
 * `a1*x[i] + a2*x[i-2] - a2*x[i-4] - a1*x[i-6]`
 * to a series. Indices before `i = 6` (or with non-finite
 * neighbours) are `null`.
 */
export function applyLineHilbertCycleFir(
  values: readonly (number | null)[],
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < 6) {
      out.push(null);
      continue;
    }
    const v0 = values[i];
    const v2 = values[i - 2];
    const v4 = values[i - 4];
    const v6 = values[i - 6];
    if (
      !isFiniteNumber(v0) ||
      !isFiniteNumber(v2) ||
      !isFiniteNumber(v4) ||
      !isFiniteNumber(v6)
    ) {
      out.push(null);
      continue;
    }
    out.push(
      HILBERT_A1 * v0 + HILBERT_A2 * v2 - HILBERT_A2 * v4 - HILBERT_A1 * v6,
    );
  }
  return out;
}

/**
 * Simple Moving Average over `length` bars. Bars before
 * `i = length - 1` (or with non-finite values in the window)
 * are `null`.
 */
export function applyLineHilbertCycleSma(
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

export interface ChartLineHilbertCycleOptions {
  smoothLength?: number;
}

/**
 * Compute the Hilbert cycle per bar. Returns both the smoothed
 * In-Phase and the smoothed Quadrature; `cycle` is the
 * smoothed Quadrature.
 */
export function computeLineHilbertCycle(
  closes: readonly number[] | null | undefined,
  options: ChartLineHilbertCycleOptions = {},
): { inPhase: Array<number | null>; cycle: Array<number | null> } {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { inPhase: [], cycle: [] };
  }
  const smoothLength = normalizeLineHilbertCycleLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_HILBERT_CYCLE_SMOOTH_LENGTH,
  );
  const detrender = applyLineHilbertCycleFir(closes);
  // I = detrender delayed by 3 bars.
  const I: Array<number | null> = closes.map((_, i) => {
    if (i < 3) return null;
    const v = detrender[i - 3];
    return v == null || !isFiniteNumber(v) ? null : v;
  });
  // Q = Hilbert FIR of the detrender.
  const Q = applyLineHilbertCycleFir(detrender);
  const inPhase = applyLineHilbertCycleSma(I, smoothLength);
  const cycle = applyLineHilbertCycleSma(Q, smoothLength);
  return { inPhase, cycle };
}

/** Classify a cycle reading. */
export function classifyLineHilbertCycleZone(
  value: number | null,
): ChartLineHilbertCycleZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'flat';
}

/** Run the full Hilbert cycle pipeline. */
export function runLineHilbertCycle(
  data: readonly ChartLineHilbertCyclePoint[] | null | undefined,
  options: ChartLineHilbertCycleOptions = {},
): ChartLineHilbertCycleRun {
  const series = getLineHilbertCycleFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const smoothLength = normalizeLineHilbertCycleLength(
    options.smoothLength,
    DEFAULT_CHART_LINE_HILBERT_CYCLE_SMOOTH_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const { inPhase, cycle } = computeLineHilbertCycle(closes, {
    smoothLength,
  });
  const samples: ChartLineHilbertCycleSample[] = series.map((point, index) => {
    const c = cycle[index] ?? null;
    const ip = inPhase[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      inPhase: ip,
      cycle: c,
      zone: classifyLineHilbertCycleZone(c),
    };
  });
  let positiveCount = 0;
  let flatCount = 0;
  let negativeCount = 0;
  let cycleFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.cycle)) cycleFinal = sample.cycle;
  }
  // Full warmup: 6 (FIR) + 3 (I delay applied to detrender for
  // I, or the inner FIR for Q which needs 6 more bars of
  // detrender, so 12) + smoothLength - 1 for the SMA. Use the
  // larger of the two paths to determine when the cycle is
  // first defined: 6 + 6 + smoothLength - 1 = 11 + smoothLength.
  const requiredBars = 12 + smoothLength;
  return {
    series,
    smoothLength,
    inPhase,
    cycle,
    samples,
    cycleFinal,
    positiveCount,
    flatCount,
    negativeCount,
    ok: series.length >= requiredBars,
  };
}

export interface ChartLineHilbertCycleLayoutOptions
  extends ChartLineHilbertCycleOptions {
  data: readonly ChartLineHilbertCyclePoint[] | null | undefined;
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
export function computeLineHilbertCycleLayout(
  options: ChartLineHilbertCycleLayoutOptions,
): ChartLineHilbertCycleLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_HILBERT_CYCLE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_HILBERT_CYCLE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_HILBERT_CYCLE_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_HILBERT_CYCLE_PANEL_GAP;

  const run = runLineHilbertCycle(options.data, {
    ...(options.smoothLength !== undefined
      ? { smoothLength: options.smoothLength }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const cycleHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const cycleTop = priceBottom + panelGap;
  const cycleBottom = cycleTop + cycleHeight;

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

  let cycleMin = Infinity;
  let cycleMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.cycle)) {
      if (sample.cycle < cycleMin) cycleMin = sample.cycle;
      if (sample.cycle > cycleMax) cycleMax = sample.cycle;
    }
    if (isFiniteNumber(sample.inPhase)) {
      if (sample.inPhase < cycleMin) cycleMin = sample.inPhase;
      if (sample.inPhase > cycleMax) cycleMax = sample.inPhase;
    }
  }
  if (!Number.isFinite(cycleMin) || !Number.isFinite(cycleMax)) {
    cycleMin = -1;
    cycleMax = 1;
  }
  if (cycleMin === cycleMax) {
    cycleMin -= 1;
    cycleMax += 1;
  }
  if (cycleMin > 0) cycleMin = 0;
  if (cycleMax < 0) cycleMax = 0;
  const cycleY = (value: number): number =>
    cycleBottom -
    ((value - cycleMin) / (cycleMax - cycleMin)) * cycleHeight;
  const zeroLineY = cycleY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineHilbertCycleDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const cycleLinePoints: Array<{ x: number; y: number }> = [];
  const inPhaseLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineHilbertCycleMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (isFiniteNumber(sample.cycle)) {
      const cx = xAt(index);
      const yc = cycleY(sample.cycle);
      cycleLinePoints.push({ x: cx, y: yc });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        cycle: sample.cycle,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.inPhase)) {
      const cx = xAt(index);
      inPhaseLinePoints.push({ x: cx, y: cycleY(sample.inPhase) });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    cycleTop,
    cycleBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    cyclePath: buildLinePath(cycleLinePoints),
    inPhasePath: buildLinePath(inPhaseLinePoints),
    markers,
    priceMin,
    priceMax,
    cycleMin,
    cycleMax,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineHilbertCycleChart(
  data: readonly ChartLineHilbertCyclePoint[] | null | undefined,
  options: ChartLineHilbertCycleOptions = {},
): string {
  const run = runLineHilbertCycle(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.cycleFinal === null ? 'n/a' : run.cycleFinal.toFixed(4);
  return (
    `Dual-panel chart with a Hilbert Transform cycle oscillator ` +
    `panel beneath the close (smooth length ${run.smoothLength}). ` +
    `The cycle is the simple-moving-average smoothed Quadrature ` +
    `component of the analytic signal derived from the detrended ` +
    `close: a 6-tap Hilbert FIR produces the detrender, the ` +
    `In-Phase is the detrender delayed by three bars, and the ` +
    `Quadrature applies the same FIR to the detrender. Across ` +
    `${total} bars the cycle is positive on ${run.positiveCount}, ` +
    `flat on ${run.flatCount}, and negative on ` +
    `${run.negativeCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatCycle(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineHilbertCycleZone,
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

function zoneLabelOf(zone: ChartLineHilbertCycleZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineHilbertCycle -- dual-panel pure-SVG Hilbert
 * Transform cycle chart.
 */
export const ChartLineHilbertCycle = forwardRef<
  HTMLDivElement,
  ChartLineHilbertCycleProps
>(function ChartLineHilbertCycle(props, ref) {
  const {
    data,
    smoothLength = DEFAULT_CHART_LINE_HILBERT_CYCLE_SMOOTH_LENGTH,
    width = DEFAULT_CHART_LINE_HILBERT_CYCLE_WIDTH,
    height = DEFAULT_CHART_LINE_HILBERT_CYCLE_HEIGHT,
    padding = DEFAULT_CHART_LINE_HILBERT_CYCLE_PADDING,
    panelGap = DEFAULT_CHART_LINE_HILBERT_CYCLE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_HILBERT_CYCLE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HILBERT_CYCLE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HILBERT_CYCLE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_PRICE_COLOR,
    cycleColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_CYCLE_COLOR,
    inPhaseColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_INPHASE_COLOR,
    positiveColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_NEGATIVE_COLOR,
    flatColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_HILBERT_CYCLE_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCycle = true,
    showInPhase = false,
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
    formatCycle = defaultFormatCycle,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-hilbert-cycle-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineHilbertCycleSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineHilbertCycleSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineHilbertCycleLayout({
        data,
        smoothLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, smoothLength, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineHilbertCycleChart(data, { smoothLength });
  const resolvedLabel =
    ariaLabel ??
    `Hilbert Transform cycle chart, smooth ${run.smoothLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineHilbertCycleSeriesId): void => {
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
        data-section="chart-line-hilbert-cycle-tooltip"
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
          data-section="chart-line-hilbert-cycle-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-hilbert-cycle-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-hilbert-cycle-tooltip-inphase"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`InPhase: ${
            hoverSample.inPhase === null
              ? 'n/a'
              : formatCycle(hoverSample.inPhase)
          }`}
        </text>
        <text
          data-section="chart-line-hilbert-cycle-tooltip-cycle"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Cycle: ${
            hoverSample.cycle === null
              ? 'n/a'
              : formatCycle(hoverSample.cycle)
          }`}
        </text>
        <text
          data-section="chart-line-hilbert-cycle-tooltip-zone"
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
  const cycleHidden = isHidden('cycle') || !showCycle;
  const inPhaseHidden = isHidden('inphase') || !showInPhase;

  const legendItems: Array<{
    id: ChartLineHilbertCycleSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'cycle', label: 'Cycle (Q)', color: cycleColor },
    { id: 'inphase', label: 'InPhase (I)', color: inPhaseColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-hilbert-cycle"
      data-empty={isEmpty ? 'true' : 'false'}
      data-smooth-length={run.smoothLength}
      data-cycle-final={run.cycleFinal === null ? '' : run.cycleFinal}
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
        data-section="chart-line-hilbert-cycle-aria-desc"
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
          data-section="chart-line-hilbert-cycle-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-hilbert-cycle-empty"
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
          data-section="chart-line-hilbert-cycle-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-hilbert-cycle-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yc =
                  layout.cycleBottom -
                  t * (layout.cycleBottom - layout.cycleTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-hilbert-cycle-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-hilbert-cycle-grid-line"
                      data-panel="cycle"
                      x1={layout.innerLeft}
                      y1={yc}
                      x2={layout.innerRight}
                      y2={yc}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-hilbert-cycle-axes">
              <line
                data-section="chart-line-hilbert-cycle-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hilbert-cycle-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hilbert-cycle-axis"
                data-panel="cycle"
                x1={layout.innerLeft}
                y1={layout.cycleTop}
                x2={layout.innerLeft}
                y2={layout.cycleBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hilbert-cycle-axis"
                data-panel="cycle"
                x1={layout.innerLeft}
                y1={layout.cycleBottom}
                x2={layout.innerRight}
                y2={layout.cycleBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-hilbert-cycle-tick-label"
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
                data-section="chart-line-hilbert-cycle-tick-label"
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
                data-section="chart-line-hilbert-cycle-tick-label"
                data-panel="cycle"
                x={layout.innerLeft - 6}
                y={layout.cycleTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCycle(layout.cycleMax)}
              </text>
              <text
                data-section="chart-line-hilbert-cycle-tick-label"
                data-panel="cycle"
                x={layout.innerLeft - 6}
                y={layout.cycleBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCycle(layout.cycleMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-hilbert-cycle-zero-line"
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
              data-section="chart-line-hilbert-cycle-price-path"
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
            <g data-section="chart-line-hilbert-cycle-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-hilbert-cycle-dot"
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

          {!inPhaseHidden ? (
            <path
              data-section="chart-line-hilbert-cycle-inphase"
              d={layout.inPhasePath}
              fill="none"
              stroke={inPhaseColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="InPhase line"
            />
          ) : null}

          {!cycleHidden ? (
            <path
              data-section="chart-line-hilbert-cycle-line"
              d={layout.cyclePath}
              fill="none"
              stroke={cycleColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Cycle (Quadrature) line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-hilbert-cycle-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-hilbert-cycle-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-cycle={marker.cycle}
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
                  )}, Cycle ${formatCycle(marker.cycle)}, ${zoneLabelOf(
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
            <g data-section="chart-line-hilbert-cycle-badge">
              <rect
                data-section="chart-line-hilbert-cycle-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={150}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-hilbert-cycle-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Hilbert Cycle s=${run.smoothLength}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-hilbert-cycle-legend"
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
                data-section="chart-line-hilbert-cycle-legend-item"
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
                  data-section="chart-line-hilbert-cycle-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-hilbert-cycle-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-hilbert-cycle-legend-stats"
            style={{ color: axisColor }}
          >
            {`positive ${run.positiveCount} / flat ${run.flatCount} / negative ${run.negativeCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHilbertCycle.displayName = 'ChartLineHilbertCycle';
