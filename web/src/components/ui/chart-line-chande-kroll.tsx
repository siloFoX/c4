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
 * ChartLineChandeKroll -- pure-SVG single-panel chart with the
 * Chande-Kroll trailing-stop overlay.
 *
 * The Chande-Kroll Stop pairs an ATR-scaled offset with a
 * rolling extreme. For each bar `i`:
 *
 *   TR[i]         = max(high[i] - low[i],
 *                       abs(high[i] - close[i - 1]),
 *                       abs(low[i]  - close[i - 1]))
 *   ATR[i]        = SMA(TR, atrPeriod) at bar i
 *   stopHigh[i]   = high[i] - multiplier * ATR[i]
 *   stopLow[i]    = low[i]  + multiplier * ATR[i]
 *
 *   longStop[i]   = max(stopHigh over [i - stopPeriod + 1, i])
 *   shortStop[i]  = min(stopLow  over [i - stopPeriod + 1, i])
 *
 * The first bar's TR uses `high - low` (no prior close).
 *
 * Two bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (high == low == close == K)` -> `TR == 0`, so
 *     `ATR == 0` and both stops collapse to `K` bit-exact at
 *     every defined bar.
 *   * `STEADY_RANGE (high == K + 1, low == K - 1, close == K)`
 *     with `multiplier = 1` -> `TR == 2` at every bar -> `ATR ==
 *     2` bit-exact -> `stopHigh == K - 1`, `stopLow == K + 1`,
 *     both constant -> the rolling extremes carry the same
 *     values bit-exact.
 *
 * The chart shares one panel: the close line plus two trailing
 * stop lines (long stop below, short stop above) with zone-
 * coloured markers per bar (close above the long stop, between
 * the stops, or below the short stop).
 */

export interface ChartLineChandeKrollPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineChandeKrollZone =
  | 'above-short'
  | 'between'
  | 'below-long'
  | 'none';

export type ChartLineChandeKrollSeriesId = 'price' | 'long' | 'short';

export interface ChartLineChandeKrollLevels {
  longStop: number | null;
  shortStop: number | null;
}

export interface ChartLineChandeKrollSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  atr: number | null;
  levels: ChartLineChandeKrollLevels;
  zone: ChartLineChandeKrollZone;
}

export interface ChartLineChandeKrollRun {
  series: ChartLineChandeKrollPoint[];
  atrPeriod: number;
  stopPeriod: number;
  multiplier: number;
  atr: Array<number | null>;
  levels: ChartLineChandeKrollLevels[];
  samples: ChartLineChandeKrollSample[];
  longFinal: number | null;
  shortFinal: number | null;
  aboveCount: number;
  betweenCount: number;
  belowCount: number;
  ok: boolean;
}

export interface ChartLineChandeKrollSegment {
  index: number;
  seriesId: ChartLineChandeKrollSeriesId;
  fromCx: number;
  toCx: number;
  cy: number;
  value: number;
}

export interface ChartLineChandeKrollMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  zone: ChartLineChandeKrollZone;
}

export interface ChartLineChandeKrollDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineChandeKrollLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineChandeKrollDot[];
  longPath: string;
  shortPath: string;
  segments: ChartLineChandeKrollSegment[];
  markers: ChartLineChandeKrollMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineChandeKrollRun;
}

export interface ChartLineChandeKrollProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineChandeKrollPoint[];
  atrPeriod?: number;
  stopPeriod?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  longColor?: string;
  shortColor?: string;
  aboveColor?: string;
  belowColor?: string;
  betweenColor?: string;
  noneColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLong?: boolean;
  showShort?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineChandeKrollSeriesId[];
  defaultHiddenSeries?: ChartLineChandeKrollSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineChandeKrollSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineChandeKrollSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CHANDE_KROLL_WIDTH = 720;
export const DEFAULT_CHART_LINE_CHANDE_KROLL_HEIGHT = 380;
export const DEFAULT_CHART_LINE_CHANDE_KROLL_PADDING = 44;
export const DEFAULT_CHART_LINE_CHANDE_KROLL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHANDE_KROLL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CHANDE_KROLL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHANDE_KROLL_ATR_PERIOD = 10;
export const DEFAULT_CHART_LINE_CHANDE_KROLL_STOP_PERIOD = 9;
export const DEFAULT_CHART_LINE_CHANDE_KROLL_MULTIPLIER = 1;
export const DEFAULT_CHART_LINE_CHANDE_KROLL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CHANDE_KROLL_LONG_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CHANDE_KROLL_SHORT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHANDE_KROLL_ABOVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHANDE_KROLL_BELOW_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CHANDE_KROLL_BETWEEN_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CHANDE_KROLL_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CHANDE_KROLL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHANDE_KROLL_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineChandeKrollFinitePoints(
  data: readonly ChartLineChandeKrollPoint[] | null | undefined,
): ChartLineChandeKrollPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineChandeKrollPoint[] = [];
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

/** Coerce a period to an integer of at least 1. */
export function normalizeLineChandeKrollPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Coerce the ATR multiplier to a non-negative finite. */
export function normalizeLineChandeKrollMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier >= 0) return multiplier;
  return fallback;
}

/**
 * Per-bar true range. The first bar uses `high - low` (no prior
 * close); subsequent bars take `max(high - low, abs(high -
 * prevClose), abs(low - prevClose))`.
 */
export function computeLineChandeKrollTrueRange(
  bars: readonly ChartLineChandeKrollPoint[] | null | undefined,
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
    const hl = bar.high - bar.low;
    const hc = Math.abs(bar.high - prev.close);
    const lc = Math.abs(bar.low - prev.close);
    let tr = hl;
    if (hc > tr) tr = hc;
    if (lc > tr) tr = lc;
    out.push(tr);
  }
  return out;
}

/**
 * Simple moving average of a nullable series. Output is null until
 * the window has filled with finite values.
 */
export function computeLineChandeKrollSma(
  values: ReadonlyArray<number | null>,
  period: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0 || period < 1) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j += 1) {
      const v = values[j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / period : null);
  }
  return out;
}

/**
 * Full Chande-Kroll Stop pipeline. The first `atrPeriod - 1` bars
 * are null on the ATR; the first `atrPeriod + stopPeriod - 2`
 * bars are null on the trailing stops.
 */
export function computeLineChandeKroll(
  bars: readonly ChartLineChandeKrollPoint[] | null | undefined,
  atrPeriod: unknown,
  stopPeriod: unknown,
  multiplier: unknown,
): {
  atr: Array<number | null>;
  levels: ChartLineChandeKrollLevels[];
} {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { atr: [], levels: [] };
  }
  const ap = normalizeLineChandeKrollPeriod(
    atrPeriod,
    DEFAULT_CHART_LINE_CHANDE_KROLL_ATR_PERIOD,
  );
  const sp = normalizeLineChandeKrollPeriod(
    stopPeriod,
    DEFAULT_CHART_LINE_CHANDE_KROLL_STOP_PERIOD,
  );
  const mult = normalizeLineChandeKrollMultiplier(
    multiplier,
    DEFAULT_CHART_LINE_CHANDE_KROLL_MULTIPLIER,
  );
  const tr = computeLineChandeKrollTrueRange(bars);
  const atr = computeLineChandeKrollSma(tr, ap);
  const stopHighRaw: Array<number | null> = [];
  const stopLowRaw: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const a = atr[i];
    if (!isFiniteNumber(a)) {
      stopHighRaw.push(null);
      stopLowRaw.push(null);
      continue;
    }
    stopHighRaw.push(bar.high - mult * a);
    stopLowRaw.push(bar.low + mult * a);
  }
  const levels: ChartLineChandeKrollLevels[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < ap + sp - 2) {
      levels.push({ longStop: null, shortStop: null });
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let j = i - sp + 1; j <= i; j += 1) {
      const sh = stopHighRaw[j];
      const sl = stopLowRaw[j];
      if (!isFiniteNumber(sh) || !isFiniteNumber(sl)) {
        ok = false;
        break;
      }
      if (sh > hh) hh = sh;
      if (sl < ll) ll = sl;
    }
    if (!ok) {
      levels.push({ longStop: null, shortStop: null });
      continue;
    }
    levels.push({ longStop: hh, shortStop: ll });
  }
  return { atr, levels };
}

/** Classify a close against its bar's stops. */
export function classifyLineChandeKrollZone(
  close: number | null,
  levels: ChartLineChandeKrollLevels,
): ChartLineChandeKrollZone {
  if (
    !isFiniteNumber(close) ||
    !isFiniteNumber(levels.longStop) ||
    !isFiniteNumber(levels.shortStop)
  ) {
    return 'none';
  }
  if (close > levels.shortStop) return 'above-short';
  if (close < levels.longStop) return 'below-long';
  return 'between';
}

export interface ChartLineChandeKrollOptions {
  atrPeriod?: number;
  stopPeriod?: number;
  multiplier?: number;
}

/** Run the full Chande-Kroll Stop pipeline. */
export function runLineChandeKroll(
  data: readonly ChartLineChandeKrollPoint[] | null | undefined,
  options: ChartLineChandeKrollOptions = {},
): ChartLineChandeKrollRun {
  const series = getLineChandeKrollFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const atrPeriod = normalizeLineChandeKrollPeriod(
    options.atrPeriod,
    DEFAULT_CHART_LINE_CHANDE_KROLL_ATR_PERIOD,
  );
  const stopPeriod = normalizeLineChandeKrollPeriod(
    options.stopPeriod,
    DEFAULT_CHART_LINE_CHANDE_KROLL_STOP_PERIOD,
  );
  const multiplier = normalizeLineChandeKrollMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_CHANDE_KROLL_MULTIPLIER,
  );
  const { atr, levels } = computeLineChandeKroll(
    series,
    atrPeriod,
    stopPeriod,
    multiplier,
  );
  const samples: ChartLineChandeKrollSample[] = series.map((point, index) => {
    const lv = levels[index]!;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      atr: atr[index] ?? null,
      levels: lv,
      zone: classifyLineChandeKrollZone(point.close, lv),
    };
  });
  let aboveCount = 0;
  let betweenCount = 0;
  let belowCount = 0;
  let longFinal: number | null = null;
  let shortFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above-short') aboveCount += 1;
    else if (sample.zone === 'between') betweenCount += 1;
    else if (sample.zone === 'below-long') belowCount += 1;
    if (isFiniteNumber(sample.levels.longStop)) longFinal = sample.levels.longStop;
    if (isFiniteNumber(sample.levels.shortStop)) shortFinal = sample.levels.shortStop;
  }
  return {
    series,
    atrPeriod,
    stopPeriod,
    multiplier,
    atr,
    levels,
    samples,
    longFinal,
    shortFinal,
    aboveCount,
    betweenCount,
    belowCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineChandeKrollLayoutOptions
  extends ChartLineChandeKrollOptions {
  data: readonly ChartLineChandeKrollPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
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

/** Project the run into a single-panel SVG layout. */
export function computeLineChandeKrollLayout(
  options: ChartLineChandeKrollLayoutOptions,
): ChartLineChandeKrollLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CHANDE_KROLL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CHANDE_KROLL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CHANDE_KROLL_PADDING;

  const run = runLineChandeKroll(options.data, {
    ...(options.atrPeriod !== undefined ? { atrPeriod: options.atrPeriod } : {}),
    ...(options.stopPeriod !== undefined ? { stopPeriod: options.stopPeriod } : {}),
    ...(options.multiplier !== undefined ? { multiplier: options.multiplier } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;
  const okGeom = innerWidth > 0 && innerHeight > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let valueMin = Infinity;
  let valueMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < valueMin) valueMin = sample.close;
    if (sample.close > valueMax) valueMax = sample.close;
    if (sample.low < valueMin) valueMin = sample.low;
    if (sample.high > valueMax) valueMax = sample.high;
    const ls = sample.levels;
    if (isFiniteNumber(ls.longStop)) {
      if (ls.longStop < valueMin) valueMin = ls.longStop;
      if (ls.longStop > valueMax) valueMax = ls.longStop;
    }
    if (isFiniteNumber(ls.shortStop)) {
      if (ls.shortStop < valueMin) valueMin = ls.shortStop;
      if (ls.shortStop > valueMax) valueMax = ls.shortStop;
    }
  }
  if (!Number.isFinite(valueMin) || !Number.isFinite(valueMax)) {
    valueMin = 0;
    valueMax = 1;
  }
  if (valueMin === valueMax) {
    valueMin -= 1;
    valueMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - valueMin) / (valueMax - valueMin)) * innerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineChandeKrollDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const longLinePoints: Array<{ x: number; y: number }> = [];
  const shortLinePoints: Array<{ x: number; y: number }> = [];
  const segments: ChartLineChandeKrollSegment[] = [];
  const markers: ChartLineChandeKrollMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (sample.zone !== 'none') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yAt(sample.close),
        close: sample.close,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.levels.longStop)) {
      const cy = yAt(sample.levels.longStop);
      longLinePoints.push({ x: cx, y: cy });
      const halfStep = stepX / 2;
      segments.push({
        index,
        seriesId: 'long',
        fromCx: Math.max(innerLeft, cx - halfStep),
        toCx: Math.min(innerRight, cx + halfStep),
        cy,
        value: sample.levels.longStop,
      });
    }
    if (isFiniteNumber(sample.levels.shortStop)) {
      const cy = yAt(sample.levels.shortStop);
      shortLinePoints.push({ x: cx, y: cy });
      const halfStep = stepX / 2;
      segments.push({
        index,
        seriesId: 'short',
        fromCx: Math.max(innerLeft, cx - halfStep),
        toCx: Math.min(innerRight, cx + halfStep),
        cy,
        value: sample.levels.shortStop,
      });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    longPath: buildLinePath(longLinePoints),
    shortPath: buildLinePath(shortLinePoints),
    segments,
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineChandeKrollChart(
  data: readonly ChartLineChandeKrollPoint[] | null | undefined,
  options: ChartLineChandeKrollOptions = {},
): string {
  const run = runLineChandeKroll(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const lText = run.longFinal === null ? 'n/a' : run.longFinal.toFixed(3);
  const sText = run.shortFinal === null ? 'n/a' : run.shortFinal.toFixed(3);
  return (
    `Single-panel chart with Chande-Kroll trailing-stop overlays ` +
    `(ATR period ${run.atrPeriod}, stop period ${run.stopPeriod}, ` +
    `multiplier ${run.multiplier}): the close line is plotted with ` +
    `a long-stop line (running highest of high - multiplier * ATR) ` +
    `and a short-stop line (running lowest of low + multiplier * ` +
    `ATR). A constant series collapses both stops to the close. A ` +
    `steady high/low/close fixture pins ATR to the bar range and ` +
    `keeps both stops at fixed offsets. Across ${total} bars the ` +
    `close sits above the short stop on ${run.aboveCount}, below ` +
    `the long stop on ${run.belowCount}, and between the stops on ` +
    `${run.betweenCount}. The final long / short stops are ${lText} ` +
    `/ ${sText}.`
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
  zone: ChartLineChandeKrollZone,
  aboveColor: string,
  belowColor: string,
  betweenColor: string,
  noneColor: string,
): string {
  if (zone === 'above-short') return aboveColor;
  if (zone === 'below-long') return belowColor;
  if (zone === 'between') return betweenColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineChandeKrollZone): string {
  if (zone === 'above-short') return 'Above short';
  if (zone === 'below-long') return 'Below long';
  if (zone === 'between') return 'Between stops';
  return 'n/a';
}

/**
 * ChartLineChandeKroll -- single-panel pure-SVG Chande-Kroll
 * trailing-stop chart.
 */
export const ChartLineChandeKroll = forwardRef<
  HTMLDivElement,
  ChartLineChandeKrollProps
>(function ChartLineChandeKroll(props, ref) {
  const {
    data,
    atrPeriod = DEFAULT_CHART_LINE_CHANDE_KROLL_ATR_PERIOD,
    stopPeriod = DEFAULT_CHART_LINE_CHANDE_KROLL_STOP_PERIOD,
    multiplier = DEFAULT_CHART_LINE_CHANDE_KROLL_MULTIPLIER,
    width = DEFAULT_CHART_LINE_CHANDE_KROLL_WIDTH,
    height = DEFAULT_CHART_LINE_CHANDE_KROLL_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHANDE_KROLL_PADDING,
    tickCount = DEFAULT_CHART_LINE_CHANDE_KROLL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CHANDE_KROLL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHANDE_KROLL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CHANDE_KROLL_PRICE_COLOR,
    longColor = DEFAULT_CHART_LINE_CHANDE_KROLL_LONG_COLOR,
    shortColor = DEFAULT_CHART_LINE_CHANDE_KROLL_SHORT_COLOR,
    aboveColor = DEFAULT_CHART_LINE_CHANDE_KROLL_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_CHANDE_KROLL_BELOW_COLOR,
    betweenColor = DEFAULT_CHART_LINE_CHANDE_KROLL_BETWEEN_COLOR,
    noneColor = DEFAULT_CHART_LINE_CHANDE_KROLL_NONE_COLOR,
    gridColor = DEFAULT_CHART_LINE_CHANDE_KROLL_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHANDE_KROLL_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLong = true,
    showShort = true,
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
  const baseId = `chart-line-chande-kroll-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineChandeKrollSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineChandeKrollSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineChandeKrollLayout({
        data,
        atrPeriod,
        stopPeriod,
        multiplier,
        width,
        height,
        padding,
      }),
    [data, atrPeriod, stopPeriod, multiplier, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineChandeKrollChart(data, { atrPeriod, stopPeriod, multiplier });
  const resolvedLabel =
    ariaLabel ??
    `Chande-Kroll Stop chart, ATR ${run.atrPeriod}, stop ${run.stopPeriod}, x${run.multiplier}`;

  const isEmpty = !layout.ok;

  const showSeries = (id: ChartLineChandeKrollSeriesId): boolean => {
    if (isHidden(id)) return false;
    if (id === 'long') return showLong;
    if (id === 'short') return showShort;
    return true;
  };

  const toggleSeries = (id: ChartLineChandeKrollSeriesId): void => {
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
    const tooltipW = 220;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    const lvs = hoverSample.levels;
    const fmt = (v: number | null): string => (v === null ? 'n/a' : formatValue(v));
    tooltip = (
      <g data-section="chart-line-chande-kroll-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={124}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-chande-kroll-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-chande-kroll-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-chande-kroll-tooltip-atr"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`ATR: ${fmt(hoverSample.atr)}`}
        </text>
        <text
          data-section="chart-line-chande-kroll-tooltip-long"
          x={tx + 10}
          y={ty + 67}
          fill="#86efac"
          fontSize={11}
          fontWeight={600}
        >
          {`Long stop: ${fmt(lvs.longStop)}`}
        </text>
        <text
          data-section="chart-line-chande-kroll-tooltip-short"
          x={tx + 10}
          y={ty + 83}
          fill="#fca5a5"
          fontSize={11}
          fontWeight={600}
        >
          {`Short stop: ${fmt(lvs.shortStop)}`}
        </text>
        <text
          data-section="chart-line-chande-kroll-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');

  const legendItems: Array<{
    id: ChartLineChandeKrollSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'long', label: 'Long stop', color: longColor },
    { id: 'short', label: 'Short stop', color: shortColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-chande-kroll"
      data-empty={isEmpty ? 'true' : 'false'}
      data-atr-period={run.atrPeriod}
      data-stop-period={run.stopPeriod}
      data-multiplier={run.multiplier}
      data-long-final={run.longFinal === null ? '' : run.longFinal}
      data-short-final={run.shortFinal === null ? '' : run.shortFinal}
      data-above-count={run.aboveCount}
      data-between-count={run.betweenCount}
      data-below-count={run.belowCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-chande-kroll-aria-desc"
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
          data-section="chart-line-chande-kroll-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-chande-kroll-empty"
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
          data-section="chart-line-chande-kroll-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-chande-kroll-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-chande-kroll-grid-line"
                    x1={layout.innerLeft}
                    y1={y}
                    x2={layout.innerRight}
                    y2={y}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-chande-kroll-axes">
              <line
                data-section="chart-line-chande-kroll-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chande-kroll-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-chande-kroll-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-chande-kroll-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMin)}
              </text>
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-chande-kroll-price-path"
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
            <g data-section="chart-line-chande-kroll-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-chande-kroll-dot"
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

          {showLong && !isHidden('long') ? (
            <path
              data-section="chart-line-chande-kroll-long-line"
              d={layout.longPath}
              fill="none"
              stroke={longColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Long stop line, ${run.aboveCount + run.betweenCount + run.belowCount} points`}
            />
          ) : null}

          {showShort && !isHidden('short') ? (
            <path
              data-section="chart-line-chande-kroll-short-line"
              d={layout.shortPath}
              fill="none"
              stroke={shortColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Short stop line, ${run.aboveCount + run.betweenCount + run.belowCount} points`}
            />
          ) : null}

          <g data-section="chart-line-chande-kroll-segments">
            {layout.segments
              .filter((seg) => showSeries(seg.seriesId))
              .map((seg, i) => (
                <line
                  key={`seg-${seg.index}-${seg.seriesId}-${i}`}
                  data-section="chart-line-chande-kroll-segment"
                  data-series-id={seg.seriesId}
                  data-value={seg.value}
                  x1={seg.fromCx}
                  y1={seg.cy}
                  x2={seg.toCx}
                  y2={seg.cy}
                  stroke={seg.seriesId === 'long' ? longColor : shortColor}
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                />
              ))}
          </g>

          {showMarkers ? (
            <g data-section="chart-line-chande-kroll-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-chande-kroll-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    aboveColor,
                    belowColor,
                    betweenColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatValue(
                    marker.close,
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
            <g data-section="chart-line-chande-kroll-badge">
              <rect
                data-section="chart-line-chande-kroll-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={132}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-chande-kroll-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`CK ${run.atrPeriod}/${run.stopPeriod} x${run.multiplier}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-chande-kroll-legend"
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
                data-section="chart-line-chande-kroll-legend-item"
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
                  data-section="chart-line-chande-kroll-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-chande-kroll-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-chande-kroll-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / between ${run.betweenCount} / below ${run.belowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineChandeKroll.displayName = 'ChartLineChandeKroll';
