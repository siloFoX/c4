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
 * ChartLineStochMomentumIndex -- pure-SVG two-panel Stochastic
 * Momentum Index chart.
 *
 * The SMI (William Blau) replaces the standard Stochastic's
 * close-versus-range ratio with the close-versus-MIDPOINT distance
 * scaled by the half-range, each leg double-smoothed. For each bar i
 * with a filled lookback `period`:
 *
 *   HH         = max(high over [i-period+1 .. i])
 *   LL         = min(low  over [i-period+1 .. i])
 *   midpoint   = (HH + LL) / 2
 *   halfRange  = (HH - LL) / 2
 *   distance   = close - midpoint
 *
 * The distance and the halfRange are then smoothed twice with EMAs of
 * lengths `smooth1` and `smooth2`. The SMI is
 *
 *   SMI = 100 * smoothed(distance) / smoothed(halfRange)
 *
 * A zero smoothed halfRange (a constant series) leaves the bar null.
 * Bounded `[-100, 100]`: a close at the highest high reads +100, a
 * close at the lowest low reads -100, a close at the midpoint reads 0.
 *
 * The top panel plots the close; the bottom panel plots the SMI in a
 * fixed `[-100, 100]` band with a zero line and `+/-threshold`
 * overbought / oversold reference lines.
 */

export interface ChartLineStochMomentumIndexPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineStochMomentumIndexZone =
  | 'overbought'
  | 'neutral'
  | 'oversold'
  | 'none';

export type ChartLineStochMomentumIndexSeriesId = 'price' | 'smi';

export interface ChartLineStochMomentumIndexSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  smi: number | null;
  zone: ChartLineStochMomentumIndexZone;
}

export interface ChartLineStochMomentumIndexRun {
  series: ChartLineStochMomentumIndexPoint[];
  period: number;
  smooth1: number;
  smooth2: number;
  threshold: number;
  smi: Array<number | null>;
  samples: ChartLineStochMomentumIndexSample[];
  smiFinal: number | null;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineStochMomentumIndexMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  smi: number;
  zone: ChartLineStochMomentumIndexZone;
}

export interface ChartLineStochMomentumIndexDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochMomentumIndexLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  smiPanelTop: number;
  smiPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineStochMomentumIndexDot[];
  smiPath: string;
  markers: ChartLineStochMomentumIndexMarker[];
  zeroY: number;
  upperThresholdY: number;
  lowerThresholdY: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineStochMomentumIndexRun;
}

export interface ChartLineStochMomentumIndexProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochMomentumIndexPoint[];
  period?: number;
  smooth1?: number;
  smooth2?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  smiColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  neutralColor?: string;
  noneColor?: string;
  zeroColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSmi?: boolean;
  showZeroLine?: boolean;
  showThresholdLines?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochMomentumIndexSeriesId[];
  defaultHiddenSeries?: ChartLineStochMomentumIndexSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochMomentumIndexSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineStochMomentumIndexSample;
  }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_HEIGHT = 400;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PERIOD = 10;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH1 = 3;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH2 = 3;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_THRESHOLD = 40;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_AXIS_COLOR = '#94a3b8';

/** Smoothed-halfRange guard: anything below this is treated as zero. */
export const CHART_LINE_STOCH_MOMENTUM_INDEX_EPSILON = 1e-12;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineStochMomentumIndexFinitePoints(
  data: readonly ChartLineStochMomentumIndexPoint[] | null | undefined,
): ChartLineStochMomentumIndexPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochMomentumIndexPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      point.high >= point.low
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

/** Coerce the lookback period to an integer of at least 1. */
export function normalizeLineStochMomentumIndexPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Coerce a smoothing length to an integer of at least 1. */
export function normalizeLineStochMomentumIndexSmooth(
  smooth: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(smooth) && smooth >= 1) return Math.floor(smooth);
  return fallback;
}

/** Coerce the overbought / oversold threshold to a positive finite. */
export function normalizeLineStochMomentumIndexThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/**
 * Standard EMA over a nullable series. The first defined value seeds
 * the EMA; subsequent values use `alpha = 2 / (length + 1)`. Null
 * inputs propagate (they are skipped without advancing the EMA).
 */
export function computeLineStochMomentumIndexEma(
  values: ReadonlyArray<number | null> | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(values)) return [];
  const n = normalizeLineStochMomentumIndexSmooth(length, 1);
  const alpha = 2 / (n + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      prev = v;
    } else {
      prev = prev + alpha * (v - prev);
    }
    out.push(prev);
  }
  return out;
}

/** Per-bar `{distance, halfRange}` over the lookback. Warm-up bars are null. */
export function computeLineStochMomentumIndexLegs(
  bars: readonly ChartLineStochMomentumIndexPoint[] | null | undefined,
  period: unknown,
): {
  distance: Array<number | null>;
  halfRange: Array<number | null>;
} {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { distance: [], halfRange: [] };
  }
  const p = normalizeLineStochMomentumIndexPeriod(
    period,
    DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PERIOD,
  );
  const distance: Array<number | null> = [];
  const halfRange: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p - 1) {
      distance.push(null);
      halfRange.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const bar = bars[j];
      if (!bar || !isFiniteNumber(bar.high) || !isFiniteNumber(bar.low)) {
        ok = false;
        break;
      }
      if (bar.high > hh) hh = bar.high;
      if (bar.low < ll) ll = bar.low;
    }
    const bar = bars[i]!;
    if (!ok || !isFiniteNumber(bar.close)) {
      distance.push(null);
      halfRange.push(null);
      continue;
    }
    const mid = (hh + ll) / 2;
    distance.push(bar.close - mid);
    halfRange.push((hh - ll) / 2);
  }
  return { distance, halfRange };
}

/**
 * The double-smoothed SMI per bar. A zero smoothed halfRange leaves
 * the bar null (no scale to divide by).
 */
export function computeLineStochMomentumIndex(
  bars: readonly ChartLineStochMomentumIndexPoint[] | null | undefined,
  period: unknown,
  smooth1: unknown,
  smooth2: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const { distance, halfRange } = computeLineStochMomentumIndexLegs(
    bars,
    period,
  );
  const s1 = normalizeLineStochMomentumIndexSmooth(
    smooth1,
    DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH1,
  );
  const s2 = normalizeLineStochMomentumIndexSmooth(
    smooth2,
    DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH2,
  );
  const distSmooth1 = computeLineStochMomentumIndexEma(distance, s1);
  const distSmooth2 = computeLineStochMomentumIndexEma(distSmooth1, s2);
  const halfSmooth1 = computeLineStochMomentumIndexEma(halfRange, s1);
  const halfSmooth2 = computeLineStochMomentumIndexEma(halfSmooth1, s2);
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const num = distSmooth2[i];
    const den = halfSmooth2[i];
    if (
      !isFiniteNumber(num) ||
      !isFiniteNumber(den) ||
      Math.abs(den) < CHART_LINE_STOCH_MOMENTUM_INDEX_EPSILON
    ) {
      out.push(null);
      continue;
    }
    out.push((100 * num) / den);
  }
  return out;
}

/** Classify an SMI reading against the threshold band. */
export function classifyLineStochMomentumIndexZone(
  value: number | null,
  threshold: number,
): ChartLineStochMomentumIndexZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'overbought';
  if (value <= -threshold) return 'oversold';
  return 'neutral';
}

export interface ChartLineStochMomentumIndexOptions {
  period?: number;
  smooth1?: number;
  smooth2?: number;
  threshold?: number;
}

/** Run the full SMI pipeline. */
export function runLineStochMomentumIndex(
  data: readonly ChartLineStochMomentumIndexPoint[] | null | undefined,
  options: ChartLineStochMomentumIndexOptions = {},
): ChartLineStochMomentumIndexRun {
  const series = getLineStochMomentumIndexFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineStochMomentumIndexPeriod(
    options.period,
    DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PERIOD,
  );
  const smooth1 = normalizeLineStochMomentumIndexSmooth(
    options.smooth1,
    DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH1,
  );
  const smooth2 = normalizeLineStochMomentumIndexSmooth(
    options.smooth2,
    DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH2,
  );
  const threshold = normalizeLineStochMomentumIndexThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_THRESHOLD,
  );
  const smi = computeLineStochMomentumIndex(series, period, smooth1, smooth2);
  const samples: ChartLineStochMomentumIndexSample[] = series.map(
    (point, index) => {
      const value = smi[index] ?? null;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        smi: value,
        zone: classifyLineStochMomentumIndexZone(value, threshold),
      };
    },
  );
  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let smiFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    if (isFiniteNumber(sample.smi)) smiFinal = sample.smi;
  }
  return {
    series = [],
    period,
    smooth1,
    smooth2,
    threshold,
    smi,
    samples,
    smiFinal,
    overboughtCount,
    oversoldCount,
    neutralCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineStochMomentumIndexLayoutOptions
  extends ChartLineStochMomentumIndexOptions {
  data: readonly ChartLineStochMomentumIndexPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
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

/** Project the run into a two-panel SVG layout. */
export function computeLineStochMomentumIndexLayout(
  options: ChartLineStochMomentumIndexLayoutOptions,
): ChartLineStochMomentumIndexLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineStochMomentumIndex(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.smooth1 !== undefined ? { smooth1: options.smooth1 } : {}),
    ...(options.smooth2 !== undefined ? { smooth2: options.smooth2 } : {}),
    ...(options.threshold !== undefined
      ? { threshold: options.threshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;
  const innerWidth = innerRight - innerLeft;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const smiPanelTop = pricePanelBottom + gap;
  const smiPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    smiPanelBottom - smiPanelTop > 0;
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
  const priceYAt = (value: number): number =>
    pricePanelBottom -
    ((value - priceMin) / (priceMax - priceMin)) * pricePanelHeight;

  const smiMin = -110;
  const smiMax = 110;
  const smiPanelHeight = smiPanelBottom - smiPanelTop;
  const smiYAt = (value: number): number =>
    smiPanelBottom - ((value - smiMin) / (smiMax - smiMin)) * smiPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineStochMomentumIndexDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const smiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineStochMomentumIndexMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.smi)) return;
    const cx = xAt(index);
    const cy = smiYAt(sample.smi);
    smiLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      smi: sample.smi,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    smiPanelTop,
    smiPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    smiPath: buildLinePath(smiLinePoints),
    markers,
    zeroY: smiYAt(0),
    upperThresholdY: smiYAt(run.threshold),
    lowerThresholdY: smiYAt(-run.threshold),
    priceMin,
    priceMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineStochMomentumIndexChart(
  data: readonly ChartLineStochMomentumIndexPoint[] | null | undefined,
  options: ChartLineStochMomentumIndexOptions = {},
): string {
  const run = runLineStochMomentumIndex(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.smiFinal === null ? 'n/a' : run.smiFinal.toFixed(2);
  return (
    `Two-panel chart with a Stochastic Momentum Index panel (period ` +
    `${run.period}, smoothing ${run.smooth1}/${run.smooth2}, threshold ` +
    `+/- ${run.threshold}): the top panel plots the close, the bottom ` +
    `panel plots the SMI, double-smoothed from the close-to-midpoint ` +
    `distance scaled by the half-range. The SMI is bounded to ` +
    `[-100, 100]: +100 at a new high, -100 at a new low, 0 at the ` +
    `midpoint. Across ${total} bars the reading is overbought ` +
    `(>= ${run.threshold}) on ${run.overboughtCount}, oversold ` +
    `(<= -${run.threshold}) on ${run.oversoldCount}, and neutral on ` +
    `${run.neutralCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineStochMomentumIndexZone,
  overboughtColor: string,
  oversoldColor: string,
  neutralColor: string,
  noneColor: string,
): string {
  if (zone === 'overbought') return overboughtColor;
  if (zone === 'oversold') return oversoldColor;
  if (zone === 'neutral') return neutralColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineStochMomentumIndexZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

/**
 * ChartLineStochMomentumIndex -- two-panel pure-SVG Stochastic
 * Momentum Index chart.
 */
export const ChartLineStochMomentumIndex = forwardRef<
  HTMLDivElement,
  ChartLineStochMomentumIndexProps
>(function ChartLineStochMomentumIndex(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PERIOD,
    smooth1 = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH1,
    smooth2 = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMOOTH2,
    threshold = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_THRESHOLD,
    width = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PADDING,
    gap = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_PRICE_COLOR,
    smiColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_SMI_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_OVERSOLD_COLOR,
    neutralColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_NEUTRAL_COLOR,
    noneColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_NONE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_ZERO_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_THRESHOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_MOMENTUM_INDEX_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSmi = true,
    showZeroLine = true,
    showThresholdLines = true,
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
  const baseId = `chart-line-stoch-momentum-index-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineStochMomentumIndexSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineStochMomentumIndexSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineStochMomentumIndexLayout({
        data,
        period,
        smooth1,
        smooth2,
        threshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      period,
      smooth1,
      smooth2,
      threshold,
      width,
      height,
      padding,
      gap,
      pricePanelRatio,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineStochMomentumIndexChart(data, {
      period,
      smooth1,
      smooth2,
      threshold,
    });
  const resolvedLabel =
    ariaLabel ??
    `Stochastic Momentum Index chart, period ${run.period}, smoothing ${run.smooth1}/${run.smooth2}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineStochMomentumIndexSeriesId): void => {
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
    const tooltipW = 196;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g
        data-section="chart-line-stoch-momentum-index-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={104}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-stoch-momentum-index-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-stoch-momentum-index-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-stoch-momentum-index-tooltip-hl"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatValue(hoverSample.high)} / ${formatValue(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-stoch-momentum-index-tooltip-smi"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`SMI: ${
            hoverSample.smi === null ? 'n/a' : hoverSample.smi.toFixed(2)
          }`}
        </text>
        <text
          data-section="chart-line-stoch-momentum-index-tooltip-zone"
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
  const smiHidden = isHidden('smi') || !showSmi;

  const legendItems: Array<{
    id: ChartLineStochMomentumIndexSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'smi', label: 'SMI', color: smiColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-stoch-momentum-index"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-smooth1={run.smooth1}
      data-smooth2={run.smooth2}
      data-threshold={run.threshold}
      data-smi-final={run.smiFinal === null ? '' : run.smiFinal}
      data-overbought-count={run.overboughtCount}
      data-oversold-count={run.oversoldCount}
      data-neutral-count={run.neutralCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-stoch-momentum-index-aria-desc"
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
          data-section="chart-line-stoch-momentum-index-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-stoch-momentum-index-empty"
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
          data-section="chart-line-stoch-momentum-index-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-stoch-momentum-index-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-stoch-momentum-index-grid-line"
                    data-panel="price"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
              {tickValues.map((t, i) => {
                const py =
                  layout.smiPanelBottom -
                  t * (layout.smiPanelBottom - layout.smiPanelTop);
                return (
                  <line
                    key={`sg-${i}`}
                    data-section="chart-line-stoch-momentum-index-grid-line"
                    data-panel="smi"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-stoch-momentum-index-axes">
              <line
                data-section="chart-line-stoch-momentum-index-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-momentum-index-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-momentum-index-axis"
                data-panel="smi"
                x1={layout.innerLeft}
                y1={layout.smiPanelTop}
                x2={layout.innerLeft}
                y2={layout.smiPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-stoch-momentum-index-axis"
                data-panel="smi"
                x1={layout.innerLeft}
                y1={layout.smiPanelBottom}
                x2={layout.innerRight}
                y2={layout.smiPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-stoch-momentum-index-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Close
          </text>
          <text
            data-section="chart-line-stoch-momentum-index-panel-label"
            data-panel="smi"
            x={layout.innerRight}
            y={layout.smiPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            SMI
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-stoch-momentum-index-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-stoch-momentum-index-threshold-lines">
              <line
                data-section="chart-line-stoch-momentum-index-threshold-line"
                data-direction="upper"
                x1={layout.innerLeft}
                y1={layout.upperThresholdY}
                x2={layout.innerRight}
                y2={layout.upperThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-stoch-momentum-index-threshold-line"
                data-direction="lower"
                x1={layout.innerLeft}
                y1={layout.lowerThresholdY}
                x2={layout.innerRight}
                y2={layout.lowerThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-stoch-momentum-index-price-path"
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
            <g data-section="chart-line-stoch-momentum-index-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-stoch-momentum-index-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatValue(
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

          {!smiHidden ? (
            <path
              data-section="chart-line-stoch-momentum-index-smi-line"
              d={layout.smiPath}
              fill="none"
              stroke={smiColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`SMI line, ${layout.markers.length} points`}
            />
          ) : null}

          {!smiHidden && showMarkers ? (
            <g data-section="chart-line-stoch-momentum-index-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-stoch-momentum-index-marker"
                  data-zone={marker.zone}
                  data-smi={marker.smi}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    overboughtColor,
                    oversoldColor,
                    neutralColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, SMI ${formatValue(
                    marker.smi,
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
            <g data-section="chart-line-stoch-momentum-index-badge">
              <rect
                data-section="chart-line-stoch-momentum-index-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-stoch-momentum-index-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`SMI ${run.period}/${run.smooth1}/${run.smooth2}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-stoch-momentum-index-legend"
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
                data-section="chart-line-stoch-momentum-index-legend-item"
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
                  data-section="chart-line-stoch-momentum-index-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-stoch-momentum-index-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-stoch-momentum-index-legend-stats"
            style={{ color: axisColor }}
          >
            {`overbought ${run.overboughtCount} / oversold ${run.oversoldCount} / neutral ${run.neutralCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineStochMomentumIndex.displayName = 'ChartLineStochMomentumIndex';
