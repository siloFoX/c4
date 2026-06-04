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
 * ChartLineRangeOsc -- pure-SVG dual-panel chart with the close
 * on the top panel and a Range Oscillator on the bottom panel.
 * Range Osc subtracts a long-term EMA of true range from a
 * short-term EMA:
 *
 *   TR[i]      = max(high - low, |high - prevClose|,
 *                    |low - prevClose|)        // TR[0] = high - low
 *   shortEMA[i] = EMA(TR, shortLength)[i]
 *   longEMA[i]  = EMA(TR, longLength)[i]
 *   rangeOsc[i] = shortEMA[i] - longEMA[i]
 *
 * Defaults: `shortLength = 14`, `longLength = 28`. Both EMAs
 * seed at the first finite TR (bar 0), so the oscillator is
 * defined from bar 0 onward in principle. We mark bars before
 * `i = longLength - 1` as warmup nulls so the long-term EMA has
 * actually seen enough samples to stabilise; the short EMA is
 * always defined alongside.
 *
 * Bit-exact anchors:
 *
 *   * **CONST_FLAT** (`high = low = close = K`): every TR is
 *     zero, both EMAs collapse to zero, and `rangeOsc = 0`
 *     bit-exact past warmup.
 *   * **CONST_BAR with dyadic TR** (`high = K + r`, `low = K -
 *     r`, `close = C` with `L <= C <= H` and `2r` a power of
 *     2): every TR is `2r`, both EMAs of constant `2r` equal
 *     `2r` bit-exact in IEEE 754 (the alpha*K + (1 - alpha)*K
 *     identity holds for dyadic K), and `rangeOsc = 2r - 2r =
 *     0` bit-exact past warmup. The test sweeps several dyadic
 *     anchors.
 *
 * For non-dyadic TR each EMA drifts by at most 1 ULP, but the
 * two EMAs drift by different ULPs (different alphas) so the
 * difference is close to but not exactly zero; integration tests
 * for that case use `toBeCloseTo(0, 9)`.
 */

export interface ChartLineRangeOscPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineRangeOscZone =
  | 'expanding'
  | 'above'
  | 'below'
  | 'contracting'
  | 'at'
  | 'none';

export type ChartLineRangeOscSeriesId = 'price' | 'rangeOsc';

export interface ChartLineRangeOscSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  shortEma: number | null;
  longEma: number | null;
  rangeOsc: number | null;
  zone: ChartLineRangeOscZone;
}

export interface ChartLineRangeOscRun {
  series: ChartLineRangeOscPoint[];
  shortLength: number;
  longLength: number;
  tr: Array<number | null>;
  shortEma: Array<number | null>;
  longEma: Array<number | null>;
  rangeOsc: Array<number | null>;
  samples: ChartLineRangeOscSample[];
  rangeOscFinal: number | null;
  rangeOscAbsMaxSeen: number;
  expandingCount: number;
  aboveCount: number;
  belowCount: number;
  contractingCount: number;
  atCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineRangeOscMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  rangeOsc: number;
  zone: ChartLineRangeOscZone;
}

export interface ChartLineRangeOscDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRangeOscLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  oscTop: number;
  oscBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineRangeOscDot[];
  oscPath: string;
  markers: ChartLineRangeOscMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroBaselineY: number;
  run: ChartLineRangeOscRun;
}

export interface ChartLineRangeOscProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRangeOscPoint[];
  shortLength?: number;
  longLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rangeOscColor?: string;
  expandingColor?: string;
  aboveColor?: string;
  belowColor?: string;
  contractingColor?: string;
  atColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  baselineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRangeOsc?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBaseline?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRangeOscSeriesId[];
  defaultHiddenSeries?: ChartLineRangeOscSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRangeOscSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineRangeOscSample }) => void;
  formatPrice?: (value: number) => string;
  formatRangeOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RANGE_OSC_WIDTH = 720;
export const DEFAULT_CHART_LINE_RANGE_OSC_HEIGHT = 460;
export const DEFAULT_CHART_LINE_RANGE_OSC_PADDING = 44;
export const DEFAULT_CHART_LINE_RANGE_OSC_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_RANGE_OSC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RANGE_OSC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RANGE_OSC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RANGE_OSC_SHORT_LENGTH = 14;
export const DEFAULT_CHART_LINE_RANGE_OSC_LONG_LENGTH = 28;
export const DEFAULT_CHART_LINE_RANGE_OSC_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RANGE_OSC_RANGE_OSC_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_RANGE_OSC_EXPANDING_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RANGE_OSC_ABOVE_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_RANGE_OSC_BELOW_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_RANGE_OSC_CONTRACTING_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RANGE_OSC_AT_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_RANGE_OSC_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_RANGE_OSC_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RANGE_OSC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_RANGE_OSC_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineRangeOscFinitePoints(
  data: readonly ChartLineRangeOscPoint[] | null | undefined,
): ChartLineRangeOscPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRangeOscPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
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

/** Coerce a positive integer length (>= 2). */
export function normalizeLineRangeOscLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Single-pass EMA seeded at the first finite value. */
export function applyLineRangeOscEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const alpha = 2 / (length + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev === null) {
      out.push(v);
      prev = v;
      continue;
    }
    const e: number = alpha * v + (1 - alpha) * prev;
    out.push(e);
    prev = e;
  }
  return out;
}

/** True range per bar; bar 0 falls back to `high - low`. */
export function computeLineRangeOscTrueRange(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i];
    if (
      !bar ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low) ||
      !isFiniteNumber(bar.close)
    ) {
      out.push(null);
      continue;
    }
    if (i === 0) {
      out.push(bar.high - bar.low);
      continue;
    }
    const prev = bars[i - 1];
    if (!prev || !isFiniteNumber(prev.close)) {
      out.push(bar.high - bar.low);
      continue;
    }
    const a = bar.high - bar.low;
    const b = Math.abs(bar.high - prev.close);
    const c = Math.abs(bar.low - prev.close);
    out.push(Math.max(a, b, c));
  }
  return out;
}

export interface ChartLineRangeOscOptions {
  shortLength?: number;
  longLength?: number;
}

export interface ChartLineRangeOscChannels {
  tr: Array<number | null>;
  shortEma: Array<number | null>;
  longEma: Array<number | null>;
  rangeOsc: Array<number | null>;
}

/**
 * Compute the Range Oscillator pipeline per bar. Bars before
 * `i = longLength - 1` are `null` so the long EMA has at least
 * `longLength` samples in its history.
 */
export function computeLineRangeOsc(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineRangeOscOptions = {},
): ChartLineRangeOscChannels {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { tr: [], shortEma: [], longEma: [], rangeOsc: [] };
  }
  const shortLength = normalizeLineRangeOscLength(
    options.shortLength,
    DEFAULT_CHART_LINE_RANGE_OSC_SHORT_LENGTH,
  );
  const longLength = normalizeLineRangeOscLength(
    options.longLength,
    DEFAULT_CHART_LINE_RANGE_OSC_LONG_LENGTH,
  );
  const tr = computeLineRangeOscTrueRange(bars);
  const shortEma = applyLineRangeOscEma(tr, shortLength);
  const longEma = applyLineRangeOscEma(tr, longLength);
  const rangeOsc: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < longLength - 1) {
      rangeOsc.push(null);
      continue;
    }
    const s = shortEma[i];
    const l = longEma[i];
    if (s == null || l == null || !isFiniteNumber(s) || !isFiniteNumber(l)) {
      rangeOsc.push(null);
      continue;
    }
    const diff = s - l;
    // Normalize -0 (which can arise from EMA equality at a near-
    // zero value) to +0.
    rangeOsc.push(diff === 0 ? 0 : diff);
  }
  return { tr, shortEma, longEma, rangeOsc };
}

/** Classify a Range Oscillator reading by ratio to abs max. */
export function classifyLineRangeOscZone(
  value: number | null,
  rangeOscAbsMaxSeen: number,
): ChartLineRangeOscZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value === 0) return 'at';
  if (!isFiniteNumber(rangeOscAbsMaxSeen) || rangeOscAbsMaxSeen <= 0) {
    return value > 0 ? 'above' : 'below';
  }
  const ratio = value / rangeOscAbsMaxSeen;
  if (ratio >= 0.5) return 'expanding';
  if (ratio > 0) return 'above';
  if (ratio > -0.5) return 'below';
  return 'contracting';
}

/** Run the full pipeline plus sample classification. */
export function runLineRangeOsc(
  data: readonly ChartLineRangeOscPoint[] | null | undefined,
  options: ChartLineRangeOscOptions = {},
): ChartLineRangeOscRun {
  const series = getLineRangeOscFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const shortLength = normalizeLineRangeOscLength(
    options.shortLength,
    DEFAULT_CHART_LINE_RANGE_OSC_SHORT_LENGTH,
  );
  const longLength = normalizeLineRangeOscLength(
    options.longLength,
    DEFAULT_CHART_LINE_RANGE_OSC_LONG_LENGTH,
  );
  const channels = computeLineRangeOsc(series, { shortLength, longLength });
  let rangeOscAbsMaxSeen = 0;
  for (const v of channels.rangeOsc) {
    if (v != null && isFiniteNumber(v)) {
      const abs = Math.abs(v);
      if (abs > rangeOscAbsMaxSeen) rangeOscAbsMaxSeen = abs;
    }
  }
  const samples: ChartLineRangeOscSample[] = series.map((point, index) => {
    const value = channels.rangeOsc[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      shortEma: channels.shortEma[index] ?? null,
      longEma: channels.longEma[index] ?? null,
      rangeOsc: value,
      zone: classifyLineRangeOscZone(value, rangeOscAbsMaxSeen),
    };
  });
  let expandingCount = 0;
  let aboveCount = 0;
  let belowCount = 0;
  let contractingCount = 0;
  let atCount = 0;
  let noneCount = 0;
  let rangeOscFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'expanding') expandingCount += 1;
    else if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else if (sample.zone === 'contracting') contractingCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.rangeOsc)) rangeOscFinal = sample.rangeOsc;
  }
  return {
    series,
    shortLength,
    longLength,
    tr: channels.tr,
    shortEma: channels.shortEma,
    longEma: channels.longEma,
    rangeOsc: channels.rangeOsc,
    samples,
    rangeOscFinal,
    rangeOscAbsMaxSeen,
    expandingCount,
    aboveCount,
    belowCount,
    contractingCount,
    atCount,
    noneCount,
    ok: series.length >= longLength,
  };
}

export interface ChartLineRangeOscLayoutOptions
  extends ChartLineRangeOscOptions {
  data: readonly ChartLineRangeOscPoint[] | null | undefined;
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
export function computeLineRangeOscLayout(
  options: ChartLineRangeOscLayoutOptions,
): ChartLineRangeOscLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_RANGE_OSC_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_RANGE_OSC_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_RANGE_OSC_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_RANGE_OSC_PANEL_GAP;

  const run = runLineRangeOsc(options.data, {
    ...(options.shortLength !== undefined
      ? { shortLength: options.shortLength }
      : {}),
    ...(options.longLength !== undefined
      ? { longLength: options.longLength }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const oscHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const oscTop = priceBottom + panelGap;
  const oscBottom = oscTop + oscHeight;

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

  // Range Osc can take any sign; pad symmetrically.
  let oscMin = -1;
  let oscMax = 1;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.rangeOsc)) {
      if (sample.rangeOsc < oscMin) oscMin = sample.rangeOsc;
      if (sample.rangeOsc > oscMax) oscMax = sample.rangeOsc;
    }
  }
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }
  const oscY = (value: number): number =>
    oscBottom - ((value - oscMin) / (oscMax - oscMin)) * oscHeight;
  const zeroBaselineY = oscY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineRangeOscDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const oscLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineRangeOscMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.rangeOsc)) return;
    const cx = xAt(index);
    const yc = oscY(sample.rangeOsc);
    oscLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      rangeOsc: sample.rangeOsc,
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
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    oscPath: buildLinePath(oscLinePoints),
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroBaselineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineRangeOscChart(
  data: readonly ChartLineRangeOscPoint[] | null | undefined,
  options: ChartLineRangeOscOptions = {},
): string {
  const run = runLineRangeOsc(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.rangeOscFinal === null ? 'n/a' : run.rangeOscFinal.toFixed(4);
  return (
    `Dual-panel chart with a Range Oscillator panel beneath the ` +
    `close (shortLength ${run.shortLength}, longLength ` +
    `${run.longLength}). Range Osc = EMA(trueRange, shortLength) ` +
    `- EMA(trueRange, longLength). Across ${total} bars the ` +
    `oscillator reads expanding (>= 50% of abs max) on ` +
    `${run.expandingCount}, mildly up on ${run.aboveCount}, at ` +
    `zero on ${run.atCount}, mildly down on ${run.belowCount}, ` +
    `contracting (<= -50% of abs max) on ${run.contractingCount}, ` +
    `and undefined on ${run.noneCount}. The final reading is ` +
    `${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatRangeOsc(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineRangeOscZone,
  expandingColor: string,
  aboveColor: string,
  belowColor: string,
  contractingColor: string,
  atColor: string,
  noneColor: string,
): string {
  if (zone === 'expanding') return expandingColor;
  if (zone === 'above') return aboveColor;
  if (zone === 'below') return belowColor;
  if (zone === 'contracting') return contractingColor;
  if (zone === 'at') return atColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineRangeOscZone): string {
  if (zone === 'expanding') return 'Expanding';
  if (zone === 'above') return 'Above Zero';
  if (zone === 'below') return 'Below Zero';
  if (zone === 'contracting') return 'Contracting';
  if (zone === 'at') return 'At Zero';
  return 'n/a';
}

/** ChartLineRangeOsc -- dual-panel pure-SVG Range Osc chart. */
export const ChartLineRangeOsc = forwardRef<
  HTMLDivElement,
  ChartLineRangeOscProps
>(function ChartLineRangeOsc(props, ref) {
  const {
    data,
    shortLength = DEFAULT_CHART_LINE_RANGE_OSC_SHORT_LENGTH,
    longLength = DEFAULT_CHART_LINE_RANGE_OSC_LONG_LENGTH,
    width = DEFAULT_CHART_LINE_RANGE_OSC_WIDTH,
    height = DEFAULT_CHART_LINE_RANGE_OSC_HEIGHT,
    padding = DEFAULT_CHART_LINE_RANGE_OSC_PADDING,
    panelGap = DEFAULT_CHART_LINE_RANGE_OSC_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_RANGE_OSC_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RANGE_OSC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RANGE_OSC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RANGE_OSC_PRICE_COLOR,
    rangeOscColor = DEFAULT_CHART_LINE_RANGE_OSC_RANGE_OSC_COLOR,
    expandingColor = DEFAULT_CHART_LINE_RANGE_OSC_EXPANDING_COLOR,
    aboveColor = DEFAULT_CHART_LINE_RANGE_OSC_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_RANGE_OSC_BELOW_COLOR,
    contractingColor = DEFAULT_CHART_LINE_RANGE_OSC_CONTRACTING_COLOR,
    atColor = DEFAULT_CHART_LINE_RANGE_OSC_AT_COLOR,
    noneColor = DEFAULT_CHART_LINE_RANGE_OSC_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_RANGE_OSC_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RANGE_OSC_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_RANGE_OSC_BASELINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRangeOsc = true,
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
    formatRangeOsc = defaultFormatRangeOsc,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-range-osc-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineRangeOscSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineRangeOscSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineRangeOscLayout({
        data,
        shortLength,
        longLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, shortLength, longLength, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineRangeOscChart(data, { shortLength, longLength });
  const resolvedLabel =
    ariaLabel ??
    `Range Oscillator chart, shortLength ${run.shortLength}, longLength ${run.longLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineRangeOscSeriesId): void => {
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
        data-section="chart-line-range-osc-tooltip"
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
          data-section="chart-line-range-osc-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-range-osc-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-range-osc-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-range-osc-tooltip-short"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`short EMA: ${
            hoverSample.shortEma === null
              ? 'n/a'
              : formatRangeOsc(hoverSample.shortEma)
          }`}
        </text>
        <text
          data-section="chart-line-range-osc-tooltip-long"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`long EMA: ${
            hoverSample.longEma === null
              ? 'n/a'
              : formatRangeOsc(hoverSample.longEma)
          }`}
        </text>
        <text
          data-section="chart-line-range-osc-tooltip-osc"
          x={tx + 10}
          y={ty + 99}
          fill="#d8b4fe"
          fontSize={11}
          fontWeight={600}
        >
          {`Range Osc: ${
            hoverSample.rangeOsc === null
              ? 'n/a'
              : formatRangeOsc(hoverSample.rangeOsc)
          }`}
        </text>
        <text
          data-section="chart-line-range-osc-tooltip-zone"
          x={tx + 10}
          y={ty + 115}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const rangeOscHidden = isHidden('rangeOsc') || !showRangeOsc;

  const legendItems: Array<{
    id: ChartLineRangeOscSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'rangeOsc', label: 'Range Osc', color: rangeOscColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-range-osc"
      data-empty={isEmpty ? 'true' : 'false'}
      data-short-length={run.shortLength}
      data-long-length={run.longLength}
      data-range-osc-final={
        run.rangeOscFinal === null ? '' : run.rangeOscFinal
      }
      data-range-osc-abs-max-seen={run.rangeOscAbsMaxSeen}
      data-expanding-count={run.expandingCount}
      data-above-count={run.aboveCount}
      data-at-count={run.atCount}
      data-below-count={run.belowCount}
      data-contracting-count={run.contractingCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-range-osc-aria-desc"
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
          data-section="chart-line-range-osc-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-range-osc-empty"
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
          data-section="chart-line-range-osc-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-range-osc-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.oscBottom -
                  t * (layout.oscBottom - layout.oscTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-range-osc-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-range-osc-grid-line"
                      data-panel="osc"
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
            <g data-section="chart-line-range-osc-axes">
              <line
                data-section="chart-line-range-osc-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-range-osc-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-range-osc-axis"
                data-panel="osc"
                x1={layout.innerLeft}
                y1={layout.oscTop}
                x2={layout.innerLeft}
                y2={layout.oscBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-range-osc-axis"
                data-panel="osc"
                x1={layout.innerLeft}
                y1={layout.oscBottom}
                x2={layout.innerRight}
                y2={layout.oscBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-range-osc-tick-label"
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
                data-section="chart-line-range-osc-tick-label"
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
                data-section="chart-line-range-osc-tick-label"
                data-panel="osc"
                x={layout.innerLeft - 6}
                y={layout.oscTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatRangeOsc(layout.oscMax)}
              </text>
              <text
                data-section="chart-line-range-osc-tick-label"
                data-panel="osc"
                x={layout.innerLeft - 6}
                y={layout.oscBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatRangeOsc(layout.oscMin)}
              </text>
            </g>
          ) : null}

          {showBaseline ? (
            <line
              data-section="chart-line-range-osc-baseline"
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
              data-section="chart-line-range-osc-price-path"
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
            <g data-section="chart-line-range-osc-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-range-osc-dot"
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

          {!rangeOscHidden ? (
            <path
              data-section="chart-line-range-osc-line"
              d={layout.oscPath}
              fill="none"
              stroke={rangeOscColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Range Oscillator line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-range-osc-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-range-osc-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-range-osc={marker.rangeOsc}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    expandingColor,
                    aboveColor,
                    belowColor,
                    contractingColor,
                    atColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, Range Osc ${formatRangeOsc(marker.rangeOsc)}, ${zoneLabelOf(
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
            <g data-section="chart-line-range-osc-badge">
              <rect
                data-section="chart-line-range-osc-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-range-osc-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Range Osc ${run.shortLength}/${run.longLength}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-range-osc-legend"
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
                data-section="chart-line-range-osc-legend-item"
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
                  data-section="chart-line-range-osc-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-range-osc-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-range-osc-legend-stats"
            style={{ color: axisColor }}
          >
            {`expanding ${run.expandingCount} / above ${run.aboveCount} / below ${run.belowCount} / contracting ${run.contractingCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineRangeOsc.displayName = 'ChartLineRangeOsc';
