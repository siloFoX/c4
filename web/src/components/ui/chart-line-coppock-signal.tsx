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
 * ChartLineCoppockSignal -- pure-SVG dual-panel chart with the close
 * on the top panel and a Coppock Curve signal line on the bottom panel.
 * Coppock is the WMA of the sum of long and short rate-of-change values
 * across the lookback:
 *
 *   ROC(L)[i]   = (close[i] - close[i - L]) / close[i - L] * 100
 *   sumROC[i]   = ROC(longROC)[i] + ROC(shortROC)[i]
 *   coppock[i]  = WMA(sumROC, wmaPeriod)[i]
 *
 * The WMA uses linear weights `[1, 2, ..., wmaPeriod]` so recent bars
 * carry more influence; the denominator is `wmaPeriod * (wmaPeriod + 1) / 2`.
 *
 * Defaults: `longROC = 14`, `shortROC = 11`, `wmaPeriod = 10` (Coppock's
 * original monthly settings). Bars before `i = longROC + wmaPeriod - 1`
 * are warmup nulls. `close[i - L] === 0` causes the corresponding ROC
 * (and downstream coppock) to be `null`.
 *
 * Bit-exact anchor: **CONST close** (`close = K`, `K != 0`):
 * `ROC = 0` at every valid bar, so `sumROC = 0` and the WMA of zeros is
 * `coppock = 0`. Verified across the integration sweep over `K` and
 * `(longROC, shortROC, wmaPeriod)` combinations.
 *
 * Additional bit-exact anchor: **GEOMETRIC close** (`close[k] = 2^k`).
 * For every `L`,
 *   ROC(L)[i] = (2^i - 2^(i - L)) / 2^(i - L) * 100
 *             = (2^L - 1) * 100
 * which is a positive integer that is exact in IEEE 754 as long as
 * `(2^L - 1) * 100` stays within Number.MAX_SAFE_INTEGER. For L=14
 * this is 1638300 and for L=11 this is 204700; `sumROC = 1843000` and
 * the WMA of constants is the constant itself. The test verifies this
 * exact equality for the canonical (14, 11, 10) preset and for a small
 * (4, 2, 3) preset (1500 + 300 = 1800).
 */

export interface ChartLineCoppockSignalPoint {
  x: number;
  close: number;
}

export type ChartLineCoppockSignalZone =
  | 'positive'
  | 'negative'
  | 'zero'
  | 'none';

export type ChartLineCoppockSignalCross = 'up' | 'down' | null;

export type ChartLineCoppockSignalSeriesId = 'price' | 'coppock';

export interface ChartLineCoppockSignalSample {
  index: number;
  x: number;
  close: number;
  longROC: number | null;
  shortROC: number | null;
  sumROC: number | null;
  coppock: number | null;
  zone: ChartLineCoppockSignalZone;
  crossed: ChartLineCoppockSignalCross;
}

export interface ChartLineCoppockSignalRun {
  series: ChartLineCoppockSignalPoint[];
  longROC: number;
  shortROC: number;
  wmaPeriod: number;
  longROCValues: Array<number | null>;
  shortROCValues: Array<number | null>;
  sumROCValues: Array<number | null>;
  coppockValues: Array<number | null>;
  samples: ChartLineCoppockSignalSample[];
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineCoppockSignalMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  coppock: number;
  crossed: 'up' | 'down';
}

export interface ChartLineCoppockSignalDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCoppockSignalLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  coppockTop: number;
  coppockBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineCoppockSignalDot[];
  coppockPath: string;
  zeroLineY: number;
  markers: ChartLineCoppockSignalMarker[];
  priceMin: number;
  priceMax: number;
  coppockMin: number;
  coppockMax: number;
  run: ChartLineCoppockSignalRun;
}

export interface ChartLineCoppockSignalProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCoppockSignalPoint[];
  longROC?: number;
  shortROC?: number;
  wmaPeriod?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  coppockColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroLineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCoppock?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCoppockSignalSeriesId[];
  defaultHiddenSeries?: ChartLineCoppockSignalSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCoppockSignalSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineCoppockSignalSample }) => void;
  formatPrice?: (value: number) => string;
  formatCoppock?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_HEIGHT = 460;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_PADDING = 44;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_LONG_ROC = 14;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_SHORT_ROC = 11;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WMA_PERIOD = 10;
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_COPPOCK_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_ZERO_LINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_COPPOCK_SIGNAL_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineCoppockSignalFinitePoints(
  data: readonly ChartLineCoppockSignalPoint[] | null | undefined,
): ChartLineCoppockSignalPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCoppockSignalPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer period (>= 1). */
export function normalizeLineCoppockSignalPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Rate of change in percent over a lookback period. */
export function applyLineCoppockSignalROC(
  closes: readonly (number | null)[],
  period: number,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < period) {
      out.push(null);
      continue;
    }
    const c = closes[i];
    const cPast = closes[i - period];
    if (
      c == null ||
      cPast == null ||
      !isFiniteNumber(c) ||
      !isFiniteNumber(cPast) ||
      cPast === 0
    ) {
      out.push(null);
      continue;
    }
    const raw = ((c - cPast) / cPast) * 100;
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

/**
 * Weighted moving average with linear weights `[1, 2, ..., period]`.
 * Nulls (or non-finite values) in the window short-circuit to null.
 */
export function applyLineCoppockSignalWMA(
  values: readonly (number | null)[],
  period: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  const denom = (period * (period + 1)) / 2;
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let k = 0; k < period; k += 1) {
      const v = values[i - period + 1 + k];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v * (k + 1);
    }
    out.push(ok ? sum / denom : null);
  }
  return out;
}

export interface ChartLineCoppockSignalOptions {
  longROC?: number;
  shortROC?: number;
  wmaPeriod?: number;
}

export interface ChartLineCoppockSignalChannels {
  longROC: Array<number | null>;
  shortROC: Array<number | null>;
  sumROC: Array<number | null>;
  coppock: Array<number | null>;
}

/** Compute the Coppock signal pipeline. */
export function computeLineCoppockSignal(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineCoppockSignalOptions = {},
): ChartLineCoppockSignalChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { longROC: [], shortROC: [], sumROC: [], coppock: [] };
  }
  const longROC = normalizeLineCoppockSignalPeriod(
    options.longROC,
    DEFAULT_CHART_LINE_COPPOCK_SIGNAL_LONG_ROC,
  );
  const shortROC = normalizeLineCoppockSignalPeriod(
    options.shortROC,
    DEFAULT_CHART_LINE_COPPOCK_SIGNAL_SHORT_ROC,
  );
  const wmaPeriod = normalizeLineCoppockSignalPeriod(
    options.wmaPeriod,
    DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WMA_PERIOD,
  );
  const longROCValues = applyLineCoppockSignalROC(closes, longROC);
  const shortROCValues = applyLineCoppockSignalROC(closes, shortROC);
  const sumROCValues: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const a = longROCValues[i];
    const b = shortROCValues[i];
    if (a == null || b == null || !isFiniteNumber(a) || !isFiniteNumber(b)) {
      sumROCValues.push(null);
    } else {
      sumROCValues.push(a + b);
    }
  }
  const coppock = applyLineCoppockSignalWMA(sumROCValues, wmaPeriod);
  return {
    longROC: longROCValues,
    shortROC: shortROCValues,
    sumROC: sumROCValues,
    coppock,
  };
}

/** Classify a coppock reading. */
export function classifyLineCoppockSignalZone(
  value: number | null,
): ChartLineCoppockSignalZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}

/**
 * Detect zero-line crosses across a coppock sequence. A bar transitions
 * `up` when its coppock is strictly positive and the previous defined
 * coppock was zero or negative; `down` is the mirror.
 */
export function detectLineCoppockSignalCrosses(
  values: readonly (number | null)[],
): Array<ChartLineCoppockSignalCross> {
  const out: Array<ChartLineCoppockSignalCross> = [];
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
export function runLineCoppockSignal(
  data: readonly ChartLineCoppockSignalPoint[] | null | undefined,
  options: ChartLineCoppockSignalOptions = {},
): ChartLineCoppockSignalRun {
  const series = getLineCoppockSignalFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const longROC = normalizeLineCoppockSignalPeriod(
    options.longROC,
    DEFAULT_CHART_LINE_COPPOCK_SIGNAL_LONG_ROC,
  );
  const shortROC = normalizeLineCoppockSignalPeriod(
    options.shortROC,
    DEFAULT_CHART_LINE_COPPOCK_SIGNAL_SHORT_ROC,
  );
  const wmaPeriod = normalizeLineCoppockSignalPeriod(
    options.wmaPeriod,
    DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WMA_PERIOD,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineCoppockSignal(closes, {
    longROC,
    shortROC,
    wmaPeriod,
  });
  const crosses = detectLineCoppockSignalCrosses(channels.coppock);
  const samples: ChartLineCoppockSignalSample[] = series.map(
    (point, index) => {
      const value = channels.coppock[index] ?? null;
      return {
        index,
        x: point.x,
        close: point.close,
        longROC: channels.longROC[index] ?? null,
        shortROC: channels.shortROC[index] ?? null,
        sumROC: channels.sumROC[index] ?? null,
        coppock: value,
        zone: classifyLineCoppockSignalZone(value),
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
    longROC,
    shortROC,
    wmaPeriod,
    longROCValues: channels.longROC,
    shortROCValues: channels.shortROC,
    sumROCValues: channels.sumROC,
    coppockValues: channels.coppock,
    samples,
    positiveCount,
    negativeCount,
    zeroCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= Math.max(longROC, shortROC) + wmaPeriod,
  };
}

export interface ChartLineCoppockSignalLayoutOptions
  extends ChartLineCoppockSignalOptions {
  data: readonly ChartLineCoppockSignalPoint[] | null | undefined;
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
export function computeLineCoppockSignalLayout(
  options: ChartLineCoppockSignalLayoutOptions,
): ChartLineCoppockSignalLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_COPPOCK_SIGNAL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_COPPOCK_SIGNAL_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_COPPOCK_SIGNAL_PANEL_GAP;

  const run = runLineCoppockSignal(options.data, {
    ...(options.longROC !== undefined ? { longROC: options.longROC } : {}),
    ...(options.shortROC !== undefined ? { shortROC: options.shortROC } : {}),
    ...(options.wmaPeriod !== undefined
      ? { wmaPeriod: options.wmaPeriod }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const coppockHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const coppockTop = priceBottom + panelGap;
  const coppockBottom = coppockTop + coppockHeight;

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

  let coppockMin = Infinity;
  let coppockMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.coppock)) {
      if (sample.coppock < coppockMin) coppockMin = sample.coppock;
      if (sample.coppock > coppockMax) coppockMax = sample.coppock;
    }
  }
  if (!Number.isFinite(coppockMin) || !Number.isFinite(coppockMax)) {
    coppockMin = -1;
    coppockMax = 1;
  }
  // Always include the zero line in the visible y-range.
  if (coppockMin > 0) coppockMin = 0;
  if (coppockMax < 0) coppockMax = 0;
  if (coppockMin === coppockMax) {
    coppockMin -= 1;
    coppockMax += 1;
  }
  const coppockY = (value: number): number =>
    coppockBottom -
    ((value - coppockMin) / (coppockMax - coppockMin)) * coppockHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineCoppockSignalDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const coppockLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineCoppockSignalMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.coppock)) return;
    const cx = xAt(index);
    const yc = coppockY(sample.coppock);
    coppockLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        coppock: sample.coppock,
        crossed: sample.crossed,
      });
    }
  });

  const zeroLineY = coppockY(0);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    coppockTop,
    coppockBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    coppockPath: buildLinePath(coppockLinePoints),
    zeroLineY,
    markers,
    priceMin,
    priceMax,
    coppockMin,
    coppockMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineCoppockSignalChart(
  data: readonly ChartLineCoppockSignalPoint[] | null | undefined,
  options: ChartLineCoppockSignalOptions = {},
): string {
  const run = runLineCoppockSignal(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Coppock Curve signal beneath the close ` +
    `(longROC ${run.longROC}, shortROC ${run.shortROC}, wmaPeriod ` +
    `${run.wmaPeriod}). Coppock is the WMA of the sum of long and ` +
    `short rate-of-change values (sumROC = ROC(longROC) + ROC(shortROC)). ` +
    `Across ${total} bars the signal was positive on ${run.positiveCount} ` +
    `bars, negative on ${run.negativeCount}, zero on ${run.zeroCount}, ` +
    `and undefined on ${run.noneCount}, with ${run.bullishCrossCount} ` +
    `bullish and ${run.bearishCrossCount} bearish zero-line crosses.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatCoppock(value: number): string {
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

function zoneLabelOf(zone: ChartLineCoppockSignalZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'zero') return 'Zero';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineCoppockSignalCross): string {
  if (crossed === 'up') return 'Bullish cross';
  if (crossed === 'down') return 'Bearish cross';
  return '-';
}

/** ChartLineCoppockSignal -- dual-panel pure-SVG chart. */
export const ChartLineCoppockSignal = forwardRef<
  HTMLDivElement,
  ChartLineCoppockSignalProps
>(function ChartLineCoppockSignal(props, ref) {
  const {
    data,
    longROC = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_LONG_ROC,
    shortROC = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_SHORT_ROC,
    wmaPeriod = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WMA_PERIOD,
    width = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_WIDTH,
    height = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_PADDING,
    panelGap = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_PRICE_COLOR,
    coppockColor = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_COPPOCK_COLOR,
    bullishColor = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_BEARISH_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_ZERO_LINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_COPPOCK_SIGNAL_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCoppock = true,
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
    formatCoppock = defaultFormatCoppock,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-coppock-signal-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineCoppockSignalSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineCoppockSignalSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineCoppockSignalLayout({
        data,
        longROC,
        shortROC,
        wmaPeriod,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, longROC, shortROC, wmaPeriod, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineCoppockSignalChart(data, {
      longROC,
      shortROC,
      wmaPeriod,
    });
  const resolvedLabel =
    ariaLabel ??
    `Coppock signal chart, longROC ${run.longROC}, shortROC ${run.shortROC}, wmaPeriod ${run.wmaPeriod}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineCoppockSignalSeriesId): void => {
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
        data-section="chart-line-coppock-signal-tooltip"
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
          data-section="chart-line-coppock-signal-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-coppock-signal-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-coppock-signal-tooltip-long-roc"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`ROC(${run.longROC}): ${
            hoverSample.longROC === null
              ? 'n/a'
              : formatCoppock(hoverSample.longROC)
          }`}
        </text>
        <text
          data-section="chart-line-coppock-signal-tooltip-short-roc"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`ROC(${run.shortROC}): ${
            hoverSample.shortROC === null
              ? 'n/a'
              : formatCoppock(hoverSample.shortROC)
          }`}
        </text>
        <text
          data-section="chart-line-coppock-signal-tooltip-sum-roc"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`sumROC: ${
            hoverSample.sumROC === null
              ? 'n/a'
              : formatCoppock(hoverSample.sumROC)
          }`}
        </text>
        <text
          data-section="chart-line-coppock-signal-tooltip-coppock"
          x={tx + 10}
          y={ty + 103}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Coppock: ${
            hoverSample.coppock === null
              ? 'n/a'
              : formatCoppock(hoverSample.coppock)
          }`}
        </text>
        <text
          data-section="chart-line-coppock-signal-tooltip-zone"
          x={tx + 10}
          y={ty + 121}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-coppock-signal-tooltip-cross"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
        <text
          data-section="chart-line-coppock-signal-tooltip-period"
          x={tx + 10}
          y={ty + 153}
          fill="#94a3b8"
          fontSize={10}
        >
          {`WMA period ${run.wmaPeriod}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const coppockHidden = isHidden('coppock') || !showCoppock;

  const legendItems: Array<{
    id: ChartLineCoppockSignalSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'coppock', label: 'Coppock', color: coppockColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-coppock-signal"
      data-empty={isEmpty ? 'true' : 'false'}
      data-long-roc={run.longROC}
      data-short-roc={run.shortROC}
      data-wma-period={run.wmaPeriod}
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
        data-section="chart-line-coppock-signal-aria-desc"
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
          data-section="chart-line-coppock-signal-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-coppock-signal-empty"
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
          data-section="chart-line-coppock-signal-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-coppock-signal-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.coppockBottom -
                  t * (layout.coppockBottom - layout.coppockTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-coppock-signal-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-coppock-signal-grid-line"
                      data-panel="coppock"
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
            <g data-section="chart-line-coppock-signal-axes">
              <line
                data-section="chart-line-coppock-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-coppock-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-coppock-signal-axis"
                data-panel="coppock"
                x1={layout.innerLeft}
                y1={layout.coppockTop}
                x2={layout.innerLeft}
                y2={layout.coppockBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-coppock-signal-axis"
                data-panel="coppock"
                x1={layout.innerLeft}
                y1={layout.coppockBottom}
                x2={layout.innerRight}
                y2={layout.coppockBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-coppock-signal-tick-label"
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
                data-section="chart-line-coppock-signal-tick-label"
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
                data-section="chart-line-coppock-signal-tick-label"
                data-panel="coppock"
                x={layout.innerLeft - 6}
                y={layout.coppockTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCoppock(layout.coppockMax)}
              </text>
              <text
                data-section="chart-line-coppock-signal-tick-label"
                data-panel="coppock"
                x={layout.innerLeft - 6}
                y={layout.coppockBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCoppock(layout.coppockMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-coppock-signal-zero-line"
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
              data-section="chart-line-coppock-signal-price-path"
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
            <g data-section="chart-line-coppock-signal-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-coppock-signal-dot"
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

          {!coppockHidden ? (
            <path
              data-section="chart-line-coppock-signal-line"
              d={layout.coppockPath}
              fill="none"
              stroke={coppockColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Coppock signal line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-coppock-signal-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-coppock-signal-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-coppock={marker.coppock}
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
                  )}, coppock ${formatCoppock(marker.coppock)}, ${crossLabelOf(
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
            <g data-section="chart-line-coppock-signal-badge">
              <rect
                data-section="chart-line-coppock-signal-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={220}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-coppock-signal-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Coppock ${run.longROC}/${run.shortROC}/${run.wmaPeriod}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-coppock-signal-legend"
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
                data-section="chart-line-coppock-signal-legend-item"
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
                  data-section="chart-line-coppock-signal-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-coppock-signal-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-coppock-signal-legend-stats"
            style={{ color: axisColor }}
          >
            {`pos ${run.positiveCount} / neg ${run.negativeCount} / crosses ${run.bullishCrossCount + run.bearishCrossCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCoppockSignal.displayName = 'ChartLineCoppockSignal';
