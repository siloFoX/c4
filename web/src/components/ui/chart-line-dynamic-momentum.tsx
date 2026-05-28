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
 * ChartLineDynamicMomentum -- pure-SVG dual-panel chart with the close
 * on the top panel and a Dynamic Momentum Index (DMI) oscillator on
 * the bottom panel. The lookback is *adaptive*: it shrinks when
 * recent short-window volatility outpaces the long-window average,
 * and grows when volatility cools off:
 *
 *   shortStd[i]   = stdev(close, shortVolLength)[i]  (population)
 *   longStd[i]    = SMA(shortStd, longVolLength)[i]
 *   ratio[i]      = longStd[i] > 0 ? shortStd[i] / longStd[i] : 1
 *   dynLength[i]  = clamp(round(baseLength / ratio[i]),
 *                         minLength, maxLength)
 *   dmi[i]        = (close[i] - close[i - dynLength[i]])
 *                   / close[i - dynLength[i]] * 100
 *
 * `dmi[i]` is `null` during warmup (when shortStd/longStd are still
 * `null`, or when `i - dynLength[i] < 0`), or when
 * `close[i - dynLength[i]] === 0` (divide-by-zero guard).
 *
 * Bit-exact anchor: **CONST close** (`close = K`, `K != 0`):
 * `shortStd = 0`, `longStd = 0`, `ratio` falls back to `1`,
 * `dynLength = baseLength` (clamped), `momentum = (K - K) / K * 100 =
 * 0` -> `dmi = 0` (bit-exact). Verified across `K` and parameter
 * combinations in the integration sweep.
 *
 * Degenerate **CONST close=0** -> `close[i - dynLength] = 0` -> `dmi =
 * null` everywhere via the divide-by-zero guard.
 */

export interface ChartLineDynamicMomentumPoint {
  x: number;
  close: number;
}

export type ChartLineDynamicMomentumZone =
  | 'positive'
  | 'negative'
  | 'zero'
  | 'none';

export type ChartLineDynamicMomentumCross = 'up' | 'down' | null;

export type ChartLineDynamicMomentumSeriesId = 'price' | 'dmi';

export interface ChartLineDynamicMomentumSample {
  index: number;
  x: number;
  close: number;
  shortStd: number | null;
  longStd: number | null;
  ratio: number | null;
  dynLength: number | null;
  dmi: number | null;
  zone: ChartLineDynamicMomentumZone;
  crossed: ChartLineDynamicMomentumCross;
}

export interface ChartLineDynamicMomentumRun {
  series: ChartLineDynamicMomentumPoint[];
  baseLength: number;
  shortVolLength: number;
  longVolLength: number;
  minLength: number;
  maxLength: number;
  shortStdValues: Array<number | null>;
  longStdValues: Array<number | null>;
  ratioValues: Array<number | null>;
  dynLengthValues: Array<number | null>;
  dmiValues: Array<number | null>;
  samples: ChartLineDynamicMomentumSample[];
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineDynamicMomentumMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  dmi: number;
  crossed: 'up' | 'down';
}

export interface ChartLineDynamicMomentumDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDynamicMomentumLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  dmiTop: number;
  dmiBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineDynamicMomentumDot[];
  dmiPath: string;
  zeroLineY: number;
  markers: ChartLineDynamicMomentumMarker[];
  priceMin: number;
  priceMax: number;
  dmiMin: number;
  dmiMax: number;
  run: ChartLineDynamicMomentumRun;
}

export interface ChartLineDynamicMomentumProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDynamicMomentumPoint[];
  baseLength?: number;
  shortVolLength?: number;
  longVolLength?: number;
  minLength?: number;
  maxLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  dmiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroLineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDmi?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDynamicMomentumSeriesId[];
  defaultHiddenSeries?: ChartLineDynamicMomentumSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDynamicMomentumSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineDynamicMomentumSample }) => void;
  formatPrice?: (value: number) => string;
  formatDmi?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_WIDTH = 720;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_PADDING = 44;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BASE_LENGTH = 14;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_SHORT_VOL_LENGTH = 5;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_LONG_VOL_LENGTH = 10;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_MIN_LENGTH = 5;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_MAX_LENGTH = 30;
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_DMI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_ZERO_LINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineDynamicMomentumFinitePoints(
  data: readonly ChartLineDynamicMomentumPoint[] | null | undefined,
): ChartLineDynamicMomentumPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDynamicMomentumPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer period (>= 1). */
export function normalizeLineDynamicMomentumPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Rolling SMA over an array of numbers (null short-circuit). */
export function applyLineDynamicMomentumSma(
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

/** Rolling population standard deviation. */
export function applyLineDynamicMomentumPopStdDev(
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
    if (!ok) {
      out.push(null);
      continue;
    }
    const mean = sum / length;
    let sumSq = 0;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null) continue;
      const d = v - mean;
      sumSq += d * d;
    }
    out.push(Math.sqrt(sumSq / length));
  }
  return out;
}

export interface ChartLineDynamicMomentumOptions {
  baseLength?: number;
  shortVolLength?: number;
  longVolLength?: number;
  minLength?: number;
  maxLength?: number;
}

export interface ChartLineDynamicMomentumChannels {
  shortStd: Array<number | null>;
  longStd: Array<number | null>;
  ratio: Array<number | null>;
  dynLength: Array<number | null>;
  dmi: Array<number | null>;
}

/** Compute the Dynamic Momentum Index pipeline. */
export function computeLineDynamicMomentum(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineDynamicMomentumOptions = {},
): ChartLineDynamicMomentumChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return {
      shortStd: [],
      longStd: [],
      ratio: [],
      dynLength: [],
      dmi: [],
    };
  }
  const baseLength = normalizeLineDynamicMomentumPeriod(
    options.baseLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BASE_LENGTH,
  );
  const shortVolLength = normalizeLineDynamicMomentumPeriod(
    options.shortVolLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_SHORT_VOL_LENGTH,
  );
  const longVolLength = normalizeLineDynamicMomentumPeriod(
    options.longVolLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_LONG_VOL_LENGTH,
  );
  const minLength = normalizeLineDynamicMomentumPeriod(
    options.minLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_MIN_LENGTH,
  );
  const maxLength = normalizeLineDynamicMomentumPeriod(
    options.maxLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_MAX_LENGTH,
  );
  const shortStd = applyLineDynamicMomentumPopStdDev(closes, shortVolLength);
  const longStd = applyLineDynamicMomentumSma(shortStd, longVolLength);
  const ratio: Array<number | null> = [];
  const dynLength: Array<number | null> = [];
  const dmi: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const ss = shortStd[i];
    const ls = longStd[i];
    let r: number | null;
    if (ss == null || ls == null || !isFiniteNumber(ss) || !isFiniteNumber(ls)) {
      r = null;
    } else if (ls === 0) {
      r = 1;
    } else {
      r = ss / ls;
    }
    ratio.push(r);
    if (r == null || !isFiniteNumber(r) || r <= 0) {
      dynLength.push(null);
      dmi.push(null);
      continue;
    }
    let dyn = Math.round(baseLength / r);
    if (dyn < minLength) dyn = minLength;
    if (dyn > maxLength) dyn = maxLength;
    dynLength.push(dyn);
    if (i < dyn) {
      dmi.push(null);
      continue;
    }
    const c = closes[i];
    const cPast = closes[i - dyn];
    if (
      c == null ||
      cPast == null ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(cPast) ||
      cPast === 0
    ) {
      dmi.push(null);
      continue;
    }
    const raw = ((c - cPast) / cPast) * 100;
    dmi.push(raw === 0 ? 0 : raw);
  }
  return { shortStd, longStd, ratio, dynLength, dmi };
}

/** Classify a DMI reading. */
export function classifyLineDynamicMomentumZone(
  value: number | null,
): ChartLineDynamicMomentumZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}

/**
 * Detect zero-line crosses. A bar transitions `'up'` when the
 * previous defined value was `<= 0` and the current is `> 0`; mirror
 * for `'down'`.
 */
export function detectLineDynamicMomentumCrosses(
  values: readonly (number | null)[],
): Array<ChartLineDynamicMomentumCross> {
  const out: Array<ChartLineDynamicMomentumCross> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev <= 0 && v > 0) {
      out.push('up');
    } else if (prev >= 0 && v < 0) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineDynamicMomentum(
  data: readonly ChartLineDynamicMomentumPoint[] | null | undefined,
  options: ChartLineDynamicMomentumOptions = {},
): ChartLineDynamicMomentumRun {
  const series = getLineDynamicMomentumFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const baseLength = normalizeLineDynamicMomentumPeriod(
    options.baseLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BASE_LENGTH,
  );
  const shortVolLength = normalizeLineDynamicMomentumPeriod(
    options.shortVolLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_SHORT_VOL_LENGTH,
  );
  const longVolLength = normalizeLineDynamicMomentumPeriod(
    options.longVolLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_LONG_VOL_LENGTH,
  );
  const minLength = normalizeLineDynamicMomentumPeriod(
    options.minLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_MIN_LENGTH,
  );
  const maxLength = normalizeLineDynamicMomentumPeriod(
    options.maxLength,
    DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_MAX_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineDynamicMomentum(closes, {
    baseLength,
    shortVolLength,
    longVolLength,
    minLength,
    maxLength,
  });
  const crosses = detectLineDynamicMomentumCrosses(channels.dmi);
  const samples: ChartLineDynamicMomentumSample[] = series.map(
    (point, index) => {
      const value = channels.dmi[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        shortStd: channels.shortStd[index] ?? null,
        longStd: channels.longStd[index] ?? null,
        ratio: channels.ratio[index] ?? null,
        dynLength: channels.dynLength[index] ?? null,
        dmi: value,
        zone: classifyLineDynamicMomentumZone(value),
        crossed: crosses[index] ?? null,
      };
    },
  );
  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'zero') zeroCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series = [],
    baseLength,
    shortVolLength,
    longVolLength,
    minLength,
    maxLength,
    shortStdValues: channels.shortStd,
    longStdValues: channels.longStd,
    ratioValues: channels.ratio,
    dynLengthValues: channels.dynLength,
    dmiValues: channels.dmi,
    samples,
    positiveCount,
    negativeCount,
    zeroCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok:
      series.length >=
      Math.max(shortVolLength + longVolLength - 1, baseLength + 1),
  };
}

export interface ChartLineDynamicMomentumLayoutOptions
  extends ChartLineDynamicMomentumOptions {
  data: readonly ChartLineDynamicMomentumPoint[] | null | undefined;
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
export function computeLineDynamicMomentumLayout(
  options: ChartLineDynamicMomentumLayoutOptions,
): ChartLineDynamicMomentumLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_PANEL_GAP;

  const run = runLineDynamicMomentum(options.data, {
    ...(options.baseLength !== undefined
      ? { baseLength: options.baseLength }
      : {}),
    ...(options.shortVolLength !== undefined
      ? { shortVolLength: options.shortVolLength }
      : {}),
    ...(options.longVolLength !== undefined
      ? { longVolLength: options.longVolLength }
      : {}),
    ...(options.minLength !== undefined
      ? { minLength: options.minLength }
      : {}),
    ...(options.maxLength !== undefined
      ? { maxLength: options.maxLength }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const dmiHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const dmiTop = priceBottom + panelGap;
  const dmiBottom = dmiTop + dmiHeight;

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

  let dmiMin = Infinity;
  let dmiMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.dmi)) {
      if (sample.dmi < dmiMin) dmiMin = sample.dmi;
      if (sample.dmi > dmiMax) dmiMax = sample.dmi;
    }
  }
  if (!Number.isFinite(dmiMin) || !Number.isFinite(dmiMax)) {
    dmiMin = -1;
    dmiMax = 1;
  }
  if (dmiMin > 0) dmiMin = 0;
  if (dmiMax < 0) dmiMax = 0;
  if (dmiMin === dmiMax) {
    dmiMin -= 1;
    dmiMax += 1;
  }
  const dmiY = (value: number): number =>
    dmiBottom - ((value - dmiMin) / (dmiMax - dmiMin)) * dmiHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineDynamicMomentumDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const dmiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineDynamicMomentumMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.dmi)) return;
    const cx = xAt(index);
    const yc = dmiY(sample.dmi);
    dmiLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        dmi: sample.dmi,
        crossed: sample.crossed,
      });
    }
  });

  const zeroLineY = dmiY(0);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    dmiTop,
    dmiBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    dmiPath: buildLinePath(dmiLinePoints),
    zeroLineY,
    markers,
    priceMin,
    priceMax,
    dmiMin,
    dmiMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineDynamicMomentumChart(
  data: readonly ChartLineDynamicMomentumPoint[] | null | undefined,
  options: ChartLineDynamicMomentumOptions = {},
): string {
  const run = runLineDynamicMomentum(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Dynamic Momentum Index oscillator on ` +
    `the lower panel (baseLength ${run.baseLength}, shortVolLength ` +
    `${run.shortVolLength}, longVolLength ${run.longVolLength}, ` +
    `minLength ${run.minLength}, maxLength ${run.maxLength}). The ` +
    `lookback adapts each bar to round(baseLength / volatilityRatio) ` +
    `clamped to [minLength, maxLength]. Across ${total} bars the ` +
    `oscillator was positive on ${run.positiveCount}, negative on ` +
    `${run.negativeCount}, zero on ${run.zeroCount}, and undefined on ` +
    `${run.noneCount}, with ${run.bullishCrossCount} bullish and ` +
    `${run.bearishCrossCount} bearish zero-line crosses.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatDmi(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  if (Math.abs(value) >= 1e6) return value.toExponential(2);
  if (Math.abs(value) >= 100) return value.toFixed(2);
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

function zoneLabelOf(zone: ChartLineDynamicMomentumZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'zero') return 'Zero';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineDynamicMomentumCross): string {
  if (crossed === 'up') return 'Bullish cross';
  if (crossed === 'down') return 'Bearish cross';
  return '-';
}

/** ChartLineDynamicMomentum -- dual-panel pure-SVG chart. */
export const ChartLineDynamicMomentum = forwardRef<
  HTMLDivElement,
  ChartLineDynamicMomentumProps
>(function ChartLineDynamicMomentum(props, ref) {
  const {
    data,
    baseLength = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BASE_LENGTH,
    shortVolLength = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_SHORT_VOL_LENGTH,
    longVolLength = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_LONG_VOL_LENGTH,
    minLength = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_MIN_LENGTH,
    maxLength = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_MAX_LENGTH,
    width = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_WIDTH,
    height = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_HEIGHT,
    padding = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_PADDING,
    panelGap = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_PRICE_COLOR,
    dmiColor = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_DMI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_BEARISH_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_ZERO_LINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DYNAMIC_MOMENTUM_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDmi = true,
    showMarkers = true,
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
    formatDmi = defaultFormatDmi,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-dynamic-momentum-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineDynamicMomentumSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineDynamicMomentumSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineDynamicMomentumLayout({
        data,
        baseLength,
        shortVolLength,
        longVolLength,
        minLength,
        maxLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      baseLength,
      shortVolLength,
      longVolLength,
      minLength,
      maxLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineDynamicMomentumChart(data, {
      baseLength,
      shortVolLength,
      longVolLength,
      minLength,
      maxLength,
    });
  const resolvedLabel =
    ariaLabel ??
    `Dynamic Momentum Index chart, baseLength ${run.baseLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineDynamicMomentumSeriesId): void => {
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
        data-section="chart-line-dynamic-momentum-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={166}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-dynamic-momentum-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-dynamic-momentum-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-dynamic-momentum-tooltip-short"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Short Vol: ${
            hoverSample.shortStd === null
              ? 'n/a'
              : formatDmi(hoverSample.shortStd)
          }`}
        </text>
        <text
          data-section="chart-line-dynamic-momentum-tooltip-long"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Long Vol: ${
            hoverSample.longStd === null
              ? 'n/a'
              : formatDmi(hoverSample.longStd)
          }`}
        </text>
        <text
          data-section="chart-line-dynamic-momentum-tooltip-ratio"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Ratio: ${
            hoverSample.ratio === null
              ? 'n/a'
              : formatDmi(hoverSample.ratio)
          }`}
        </text>
        <text
          data-section="chart-line-dynamic-momentum-tooltip-dyn"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Dyn Length: ${hoverSample.dynLength ?? 'n/a'}`}
        </text>
        <text
          data-section="chart-line-dynamic-momentum-tooltip-dmi"
          x={tx + 10}
          y={ty + 119}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`DMI: ${
            hoverSample.dmi === null ? 'n/a' : formatDmi(hoverSample.dmi)
          }`}
        </text>
        <text
          data-section="chart-line-dynamic-momentum-tooltip-zone"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-dynamic-momentum-tooltip-cross"
          x={tx + 10}
          y={ty + 153}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const dmiHidden = isHidden('dmi') || !showDmi;

  const legendItems: Array<{
    id: ChartLineDynamicMomentumSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'dmi', label: 'Dynamic DMI', color: dmiColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-dynamic-momentum"
      data-empty={isEmpty ? 'true' : 'false'}
      data-base-length={run.baseLength}
      data-short-vol-length={run.shortVolLength}
      data-long-vol-length={run.longVolLength}
      data-positive-count={run.positiveCount}
      data-negative-count={run.negativeCount}
      data-zero-count={run.zeroCount}
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
        data-section="chart-line-dynamic-momentum-aria-desc"
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
          data-section="chart-line-dynamic-momentum-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-dynamic-momentum-empty"
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
          data-section="chart-line-dynamic-momentum-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-dynamic-momentum-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.dmiBottom - t * (layout.dmiBottom - layout.dmiTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-dynamic-momentum-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-dynamic-momentum-grid-line"
                      data-panel="dmi"
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
            <g data-section="chart-line-dynamic-momentum-axes">
              <line
                data-section="chart-line-dynamic-momentum-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-dynamic-momentum-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-dynamic-momentum-axis"
                data-panel="dmi"
                x1={layout.innerLeft}
                y1={layout.dmiTop}
                x2={layout.innerLeft}
                y2={layout.dmiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-dynamic-momentum-axis"
                data-panel="dmi"
                x1={layout.innerLeft}
                y1={layout.dmiBottom}
                x2={layout.innerRight}
                y2={layout.dmiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-dynamic-momentum-tick-label"
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
                data-section="chart-line-dynamic-momentum-tick-label"
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
                data-section="chart-line-dynamic-momentum-tick-label"
                data-panel="dmi"
                x={layout.innerLeft - 6}
                y={layout.dmiTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatDmi(layout.dmiMax)}
              </text>
              <text
                data-section="chart-line-dynamic-momentum-tick-label"
                data-panel="dmi"
                x={layout.innerLeft - 6}
                y={layout.dmiBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatDmi(layout.dmiMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-dynamic-momentum-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-dynamic-momentum-price-path"
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
            <g data-section="chart-line-dynamic-momentum-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-dynamic-momentum-dot"
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

          {!dmiHidden ? (
            <path
              data-section="chart-line-dynamic-momentum-line"
              d={layout.dmiPath}
              fill="none"
              stroke={dmiColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Dynamic Momentum line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-dynamic-momentum-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-dynamic-momentum-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-dmi={marker.dmi}
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
                  )}, DMI ${formatDmi(marker.dmi)}, ${crossLabelOf(
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
            <g data-section="chart-line-dynamic-momentum-badge">
              <rect
                data-section="chart-line-dynamic-momentum-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={240}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-dynamic-momentum-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Dyn DMI base ${run.baseLength} / vol ${run.shortVolLength}/${run.longVolLength}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-dynamic-momentum-legend"
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
                data-section="chart-line-dynamic-momentum-legend-item"
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
                  data-section="chart-line-dynamic-momentum-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-dynamic-momentum-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-dynamic-momentum-legend-stats"
            style={{ color: axisColor }}
          >
            {`pos ${run.positiveCount} / neg ${run.negativeCount} / crosses ${run.bullishCrossCount + run.bearishCrossCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDynamicMomentum.displayName = 'ChartLineDynamicMomentum';
