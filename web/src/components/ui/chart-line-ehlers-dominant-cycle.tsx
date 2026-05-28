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
 * ChartLineEhlersDominantCycle -- pure-SVG dual-panel chart
 * with an Ehlers Dominant Cycle period panel beneath the close.
 *
 * Definition (after John Ehlers, Cybernetic Analysis for
 * Stocks and Futures, simplified):
 *
 *   detrender[i] = (a1 * close[i] + a2 * close[i - 2]
 *                  - a2 * close[i - 4] - a1 * close[i - 6])
 *   I[i]         = detrender[i - 3]                      (in-phase)
 *   Q[i]         = (a1 * detrender[i] + a2 * detrender[i - 2]
 *                  - a2 * detrender[i - 4] - a1 * detrender[i - 6])
 *   phase[i]     = atan2(Q[i], I[i])
 *   dPhase[i]    = unwrap(phase[i] - phase[i - 1])  (in (0, 2*pi])
 *   period[i]    = 2 * pi / dPhase[i]
 *
 * Constants: `a1 = 0.0962`, `a2 = 0.5769` are Ehlers' canonical
 * Hilbert FIR coefficients. The instantaneous period is clamped
 * to `[minPeriod, maxPeriod]` (defaults 6 and 50).
 *
 * Bit-exact anchor:
 *
 *   * **CONST_FLAT (close == K)**: the Hilbert FIR
 *     `a1*K + a2*K - a2*K - a1*K = 0` collapses to zero
 *     exactly, so detrender, I, Q are all 0. The phase is
 *     undefined; phase difference is `0`, and the period is
 *     clamped to `maxPeriod` at every bar. `period =
 *     maxPeriod` bit-exact past the warmup.
 *
 * Bars before `i = 10` (FIR warmup) are `null`. The phase
 * difference is unwrapped: when the raw difference is
 * `<= 0` it is shifted by `2 * pi`, so the period is always
 * positive.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the dominant cycle
 * period.
 */

export interface ChartLineEhlersDominantCyclePoint {
  x: number;
  close: number;
}

export type ChartLineEhlersDominantCycleZone =
  | 'short'
  | 'mid'
  | 'long'
  | 'none';

export type ChartLineEhlersDominantCycleSeriesId = 'price' | 'period';

export interface ChartLineEhlersDominantCycleSample {
  index: number;
  x: number;
  close: number;
  period: number | null;
  zone: ChartLineEhlersDominantCycleZone;
}

export interface ChartLineEhlersDominantCycleRun {
  series: ChartLineEhlersDominantCyclePoint[];
  minPeriod: number;
  maxPeriod: number;
  shortBand: number;
  longBand: number;
  period: Array<number | null>;
  samples: ChartLineEhlersDominantCycleSample[];
  periodFinal: number | null;
  shortCount: number;
  midCount: number;
  longCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineEhlersDominantCycleMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  period: number;
  zone: ChartLineEhlersDominantCycleZone;
}

export interface ChartLineEhlersDominantCycleDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineEhlersDominantCycleLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  periodTop: number;
  periodBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineEhlersDominantCycleDot[];
  periodPath: string;
  markers: ChartLineEhlersDominantCycleMarker[];
  priceMin: number;
  priceMax: number;
  periodMin: number;
  periodMax: number;
  shortBandY: number;
  longBandY: number;
  run: ChartLineEhlersDominantCycleRun;
}

export interface ChartLineEhlersDominantCycleProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineEhlersDominantCyclePoint[];
  minPeriod?: number;
  maxPeriod?: number;
  shortBand?: number;
  longBand?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  periodColor?: string;
  shortColor?: string;
  midColor?: string;
  longColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  bandColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPeriod?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineEhlersDominantCycleSeriesId[];
  defaultHiddenSeries?: ChartLineEhlersDominantCycleSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineEhlersDominantCycleSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineEhlersDominantCycleSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatPeriod?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_WIDTH = 720;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PADDING = 44;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MIN_PERIOD = 6;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MAX_PERIOD = 50;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_SHORT_BAND = 12;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_LONG_BAND = 30;
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PERIOD_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_SHORT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MID_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_LONG_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_BAND_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const HILBERT_A1 = 0.0962;
const HILBERT_A2 = 0.5769;
const FIR_WARMUP = 10; // 6-tap Hilbert + 3-tap delay + 1 prior phase
const PHASE_EPSILON = 1e-10; // |I|, |Q| below this -> treat as singular

/** Keep only points with finite `x` and `close`. */
export function getLineEhlersDominantCycleFinitePoints(
  data: readonly ChartLineEhlersDominantCyclePoint[] | null | undefined,
): ChartLineEhlersDominantCyclePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineEhlersDominantCyclePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer period (>= 2). */
export function normalizeLineEhlersDominantCyclePeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/**
 * Apply the 6-tap Hilbert FIR
 * `a1*x[i] + a2*x[i-2] - a2*x[i-4] - a1*x[i-6]`
 * to a series. Indices before `i = 6` are `null`.
 */
export function applyLineEhlersDominantCycleHilbert(
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
    out.push(HILBERT_A1 * v0 + HILBERT_A2 * v2 - HILBERT_A2 * v4 - HILBERT_A1 * v6);
  }
  return out;
}

/**
 * Compute the Ehlers Dominant Cycle period per bar. Bars before
 * `i = FIR_WARMUP` are `null`. The period is clamped to
 * `[minPeriod, maxPeriod]`.
 */
export function computeLineEhlersDominantCycle(
  closes: readonly number[] | null | undefined,
  options: { minPeriod?: number; maxPeriod?: number } = {},
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const minP = normalizeLineEhlersDominantCyclePeriod(
    options.minPeriod,
    DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MIN_PERIOD,
  );
  const maxP = Math.max(
    minP + 1,
    normalizeLineEhlersDominantCyclePeriod(
      options.maxPeriod,
      DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MAX_PERIOD,
    ),
  );
  const detrender = applyLineEhlersDominantCycleHilbert(closes);
  // I is detrender delayed by 3 bars; Q is Hilbert FIR of the
  // detrender itself.
  const I: Array<number | null> = closes.map((_, i) => {
    if (i < 3) return null;
    const v = detrender[i - 3];
    return v == null || !isFiniteNumber(v) ? null : v;
  });
  const Q = applyLineEhlersDominantCycleHilbert(detrender);
  // Instantaneous phase via atan2; phase difference, unwrap to
  // (0, 2*pi]; period = 2*pi / dPhase clamped to [minP, maxP].
  const phase: Array<number | null> = closes.map((_, i) => {
    const Ii = I[i];
    const Qi = Q[i];
    if (
      Ii == null ||
      Qi == null ||
      !isFiniteNumber(Ii) ||
      !isFiniteNumber(Qi)
    ) {
      return null;
    }
    if (Math.abs(Ii) < PHASE_EPSILON && Math.abs(Qi) < PHASE_EPSILON) {
      return null;
    }
    return Math.atan2(Qi, Ii);
  });
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < FIR_WARMUP) {
      out.push(null);
      continue;
    }
    const pCur = phase[i];
    const pPrev = phase[i - 1];
    if (
      pCur == null ||
      pPrev == null ||
      !isFiniteNumber(pCur) ||
      !isFiniteNumber(pPrev)
    ) {
      out.push(maxP);
      continue;
    }
    let dPhase = pPrev - pCur;
    // Unwrap: phase generally decreases with time for forward
    // rotation (Q leads I); shift negative differences by
    // 2 * pi so dPhase is positive.
    while (dPhase <= 0) dPhase += 2 * Math.PI;
    while (dPhase > 2 * Math.PI) dPhase -= 2 * Math.PI;
    if (dPhase === 0) {
      out.push(maxP);
      continue;
    }
    let period = (2 * Math.PI) / dPhase;
    if (period < minP) period = minP;
    if (period > maxP) period = maxP;
    out.push(period);
  }
  return out;
}

/** Classify a dominant-cycle period reading. */
export function classifyLineEhlersDominantCycleZone(
  value: number | null,
  shortBand: number,
  longBand: number,
): ChartLineEhlersDominantCycleZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value < shortBand) return 'short';
  if (value > longBand) return 'long';
  return 'mid';
}

export interface ChartLineEhlersDominantCycleOptions {
  minPeriod?: number;
  maxPeriod?: number;
  shortBand?: number;
  longBand?: number;
}

/** Run the full Ehlers dominant cycle pipeline. */
export function runLineEhlersDominantCycle(
  data: readonly ChartLineEhlersDominantCyclePoint[] | null | undefined,
  options: ChartLineEhlersDominantCycleOptions = {},
): ChartLineEhlersDominantCycleRun {
  const series = getLineEhlersDominantCycleFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const minPeriod = normalizeLineEhlersDominantCyclePeriod(
    options.minPeriod,
    DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MIN_PERIOD,
  );
  const maxPeriod = Math.max(
    minPeriod + 1,
    normalizeLineEhlersDominantCyclePeriod(
      options.maxPeriod,
      DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MAX_PERIOD,
    ),
  );
  const shortBand = isFiniteNumber(options.shortBand)
    ? options.shortBand
    : DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_SHORT_BAND;
  const longBand = isFiniteNumber(options.longBand)
    ? options.longBand
    : DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_LONG_BAND;
  const closes = series.map((p) => p.close);
  const period = computeLineEhlersDominantCycle(closes, {
    minPeriod,
    maxPeriod,
  });
  const samples: ChartLineEhlersDominantCycleSample[] = series.map(
    (point, index) => {
      const value = period[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        period: value,
        zone: classifyLineEhlersDominantCycleZone(value, shortBand, longBand),
      };
    },
  );
  let shortCount = 0;
  let midCount = 0;
  let longCount = 0;
  let noneCount = 0;
  let periodFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'short') shortCount += 1;
    else if (sample.zone === 'mid') midCount += 1;
    else if (sample.zone === 'long') longCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.period)) periodFinal = sample.period;
  }
  return {
    series = [],
    minPeriod,
    maxPeriod,
    shortBand,
    longBand,
    period,
    samples,
    periodFinal,
    shortCount,
    midCount,
    longCount,
    noneCount,
    ok: series.length >= FIR_WARMUP + 1,
  };
}

export interface ChartLineEhlersDominantCycleLayoutOptions
  extends ChartLineEhlersDominantCycleOptions {
  data: readonly ChartLineEhlersDominantCyclePoint[] | null | undefined;
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
export function computeLineEhlersDominantCycleLayout(
  options: ChartLineEhlersDominantCycleLayoutOptions,
): ChartLineEhlersDominantCycleLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PANEL_GAP;

  const run = runLineEhlersDominantCycle(options.data, {
    ...(options.minPeriod !== undefined ? { minPeriod: options.minPeriod } : {}),
    ...(options.maxPeriod !== undefined ? { maxPeriod: options.maxPeriod } : {}),
    ...(options.shortBand !== undefined ? { shortBand: options.shortBand } : {}),
    ...(options.longBand !== undefined ? { longBand: options.longBand } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const periodHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const periodTop = priceBottom + panelGap;
  const periodBottom = periodTop + periodHeight;

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

  // The period panel always spans [minPeriod, maxPeriod].
  const periodMin = run.minPeriod;
  const periodMax = run.maxPeriod;
  const periodY = (value: number): number =>
    periodBottom -
    ((value - periodMin) / (periodMax - periodMin)) * periodHeight;
  const shortBandY = periodY(run.shortBand);
  const longBandY = periodY(run.longBand);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineEhlersDominantCycleDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const periodLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineEhlersDominantCycleMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.period)) return;
    const cx = xAt(index);
    const yc = periodY(sample.period);
    periodLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      period: sample.period,
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
    periodTop,
    periodBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    periodPath: buildLinePath(periodLinePoints),
    markers,
    priceMin,
    priceMax,
    periodMin,
    periodMax,
    shortBandY,
    longBandY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineEhlersDominantCycleChart(
  data: readonly ChartLineEhlersDominantCyclePoint[] | null | undefined,
  options: ChartLineEhlersDominantCycleOptions = {},
): string {
  const run = runLineEhlersDominantCycle(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.periodFinal === null ? 'n/a' : run.periodFinal.toFixed(4);
  return (
    `Dual-panel chart with an Ehlers Dominant Cycle period panel ` +
    `beneath the close (range [${run.minPeriod}, ${run.maxPeriod}], ` +
    `short band ${run.shortBand}, long band ${run.longBand}). The ` +
    `period is derived from the Hilbert transform phase ` +
    `difference of the detrended close: a 6-tap FIR estimates ` +
    `the in-phase and quadrature components, and the ` +
    `instantaneous period is 2 * pi over the unwrapped phase ` +
    `difference, clamped to the period range. Across ${total} ` +
    `bars the dominant cycle is short on ${run.shortCount}, mid ` +
    `on ${run.midCount}, long on ${run.longCount}, and undefined ` +
    `on ${run.noneCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatPeriod(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineEhlersDominantCycleZone,
  shortColor: string,
  midColor: string,
  longColor: string,
  noneColor: string,
): string {
  if (zone === 'short') return shortColor;
  if (zone === 'mid') return midColor;
  if (zone === 'long') return longColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineEhlersDominantCycleZone): string {
  if (zone === 'short') return 'Short';
  if (zone === 'mid') return 'Mid';
  if (zone === 'long') return 'Long';
  return 'n/a';
}

/**
 * ChartLineEhlersDominantCycle -- dual-panel pure-SVG Ehlers
 * Dominant Cycle chart.
 */
export const ChartLineEhlersDominantCycle = forwardRef<
  HTMLDivElement,
  ChartLineEhlersDominantCycleProps
>(function ChartLineEhlersDominantCycle(props, ref) {
  const {
    data,
    minPeriod = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MIN_PERIOD,
    maxPeriod = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MAX_PERIOD,
    shortBand = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_SHORT_BAND,
    longBand = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_LONG_BAND,
    width = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_WIDTH,
    height = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_HEIGHT,
    padding = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PADDING,
    panelGap = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PRICE_COLOR,
    periodColor = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_PERIOD_COLOR,
    shortColor = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_SHORT_COLOR,
    midColor = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_MID_COLOR,
    longColor = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_LONG_COLOR,
    noneColor = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_GRID_COLOR,
    bandColor = DEFAULT_CHART_LINE_EHLERS_DOMINANT_CYCLE_BAND_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPeriod = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatPeriod = defaultFormatPeriod,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-ehlers-dominant-cycle-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineEhlersDominantCycleSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineEhlersDominantCycleSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineEhlersDominantCycleLayout({
        data,
        minPeriod,
        maxPeriod,
        shortBand,
        longBand,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      minPeriod,
      maxPeriod,
      shortBand,
      longBand,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineEhlersDominantCycleChart(data, {
      minPeriod,
      maxPeriod,
      shortBand,
      longBand,
    });
  const resolvedLabel =
    ariaLabel ??
    `Ehlers Dominant Cycle chart, range [${run.minPeriod}, ${run.maxPeriod}]`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineEhlersDominantCycleSeriesId): void => {
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
        data-section="chart-line-ehlers-dominant-cycle-tooltip"
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
          data-section="chart-line-ehlers-dominant-cycle-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-ehlers-dominant-cycle-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-ehlers-dominant-cycle-tooltip-period"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Period: ${
            hoverSample.period === null
              ? 'n/a'
              : formatPeriod(hoverSample.period)
          }`}
        </text>
        <text
          data-section="chart-line-ehlers-dominant-cycle-tooltip-zone"
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
  const periodHidden = isHidden('period') || !showPeriod;

  const legendItems: Array<{
    id: ChartLineEhlersDominantCycleSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'period', label: 'Dominant Cycle', color: periodColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-ehlers-dominant-cycle"
      data-empty={isEmpty ? 'true' : 'false'}
      data-min-period={run.minPeriod}
      data-max-period={run.maxPeriod}
      data-period-final={
        run.periodFinal === null ? '' : run.periodFinal
      }
      data-short-count={run.shortCount}
      data-mid-count={run.midCount}
      data-long-count={run.longCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-ehlers-dominant-cycle-aria-desc"
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
          data-section="chart-line-ehlers-dominant-cycle-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-ehlers-dominant-cycle-empty"
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
          data-section="chart-line-ehlers-dominant-cycle-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-ehlers-dominant-cycle-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yc =
                  layout.periodBottom -
                  t * (layout.periodBottom - layout.periodTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-ehlers-dominant-cycle-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-ehlers-dominant-cycle-grid-line"
                      data-panel="period"
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
            <g data-section="chart-line-ehlers-dominant-cycle-axes">
              <line
                data-section="chart-line-ehlers-dominant-cycle-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ehlers-dominant-cycle-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ehlers-dominant-cycle-axis"
                data-panel="period"
                x1={layout.innerLeft}
                y1={layout.periodTop}
                x2={layout.innerLeft}
                y2={layout.periodBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ehlers-dominant-cycle-axis"
                data-panel="period"
                x1={layout.innerLeft}
                y1={layout.periodBottom}
                x2={layout.innerRight}
                y2={layout.periodBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-ehlers-dominant-cycle-tick-label"
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
                data-section="chart-line-ehlers-dominant-cycle-tick-label"
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
                data-section="chart-line-ehlers-dominant-cycle-tick-label"
                data-panel="period"
                x={layout.innerLeft - 6}
                y={layout.periodTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPeriod(layout.periodMax)}
              </text>
              <text
                data-section="chart-line-ehlers-dominant-cycle-tick-label"
                data-panel="period"
                x={layout.innerLeft - 6}
                y={layout.periodBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPeriod(layout.periodMin)}
              </text>
            </g>
          ) : null}

          {showBands ? (
            <g data-section="chart-line-ehlers-dominant-cycle-bands">
              <line
                data-section="chart-line-ehlers-dominant-cycle-short-band"
                x1={layout.innerLeft}
                y1={layout.shortBandY}
                x2={layout.innerRight}
                y2={layout.shortBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-ehlers-dominant-cycle-long-band"
                x1={layout.innerLeft}
                y1={layout.longBandY}
                x2={layout.innerRight}
                y2={layout.longBandY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-ehlers-dominant-cycle-price-path"
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
            <g data-section="chart-line-ehlers-dominant-cycle-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-ehlers-dominant-cycle-dot"
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

          {!periodHidden ? (
            <path
              data-section="chart-line-ehlers-dominant-cycle-line"
              d={layout.periodPath}
              fill="none"
              stroke={periodColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Dominant Cycle line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-ehlers-dominant-cycle-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-ehlers-dominant-cycle-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-period={marker.period}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    shortColor,
                    midColor,
                    longColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Period ${formatPeriod(marker.period)}, ${zoneLabelOf(
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
            <g data-section="chart-line-ehlers-dominant-cycle-badge">
              <rect
                data-section="chart-line-ehlers-dominant-cycle-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-ehlers-dominant-cycle-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Dominant Cycle [${run.minPeriod},${run.maxPeriod}]`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-ehlers-dominant-cycle-legend"
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
                data-section="chart-line-ehlers-dominant-cycle-legend-item"
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
                  data-section="chart-line-ehlers-dominant-cycle-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-ehlers-dominant-cycle-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-ehlers-dominant-cycle-legend-stats"
            style={{ color: axisColor }}
          >
            {`short ${run.shortCount} / mid ${run.midCount} / long ${run.longCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineEhlersDominantCycle.displayName = 'ChartLineEhlersDominantCycle';
