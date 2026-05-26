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
 * ChartLineCoppockTrigger -- pure-SVG dual-panel chart with the close
 * on top and a Coppock Curve trigger panel on the bottom. The signal
 * is the same as `<ChartLineCoppockSignal />`:
 *
 *   ROC(L)[i]   = (close[i] - close[i - L]) / close[i - L] * 100
 *   sumROC[i]   = ROC(longROC)[i] + ROC(shortROC)[i]
 *   coppock[i]  = WMA(sumROC, wmaPeriod)[i]
 *
 * but the trigger variant emphasises **zero-line crossings** as the
 * actionable output: the lower panel is painted with a hard
 * bullish/bearish split at the zero line, cross events are rendered
 * as upward/downward triangles, and every detected cross is also
 * exposed on the run as `triggers: Array<{ index, x, kind, ... }>`
 * for downstream consumption.
 *
 * Defaults: `longROC = 14`, `shortROC = 11`, `wmaPeriod = 10`. Warmup
 * is `max(longROC, shortROC) + wmaPeriod - 1` bars.
 *
 * Bit-exact anchor: **CONST close** (`close = K`, `K != 0`):
 * `coppock = 0` at every valid bar, so the curve hugs the zero line
 * and no triggers fire. Verified across `K` and parameter
 * combinations.
 *
 * Additional bit-exact anchor: **GEOMETRIC close** (`close[k] = 2^k`):
 * `coppock = 1843000` everywhere with defaults (proven in the
 * coppock-signal primitive). The signal starts positive at the first
 * defined bar and remains positive, so the trigger count is exactly
 * zero (no zero-line crosses).
 */

export interface ChartLineCoppockTriggerPoint {
  x: number;
  close: number;
}

export type ChartLineCoppockTriggerZone =
  | 'positive'
  | 'negative'
  | 'zero'
  | 'none';

export type ChartLineCoppockTriggerKind = 'bullish' | 'bearish';

export type ChartLineCoppockTriggerSeriesId = 'price' | 'coppock';

export interface ChartLineCoppockTriggerSample {
  index: number;
  x: number;
  close: number;
  longROC: number | null;
  shortROC: number | null;
  sumROC: number | null;
  coppock: number | null;
  zone: ChartLineCoppockTriggerZone;
  trigger: ChartLineCoppockTriggerKind | null;
}

export interface ChartLineCoppockTriggerEvent {
  index: number;
  x: number;
  close: number;
  coppock: number;
  kind: ChartLineCoppockTriggerKind;
}

export interface ChartLineCoppockTriggerRun {
  series: ChartLineCoppockTriggerPoint[];
  longROC: number;
  shortROC: number;
  wmaPeriod: number;
  longROCValues: Array<number | null>;
  shortROCValues: Array<number | null>;
  sumROCValues: Array<number | null>;
  coppockValues: Array<number | null>;
  samples: ChartLineCoppockTriggerSample[];
  triggers: ChartLineCoppockTriggerEvent[];
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  noneCount: number;
  bullishTriggerCount: number;
  bearishTriggerCount: number;
  ok: boolean;
}

export interface ChartLineCoppockTriggerMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  coppock: number;
  kind: ChartLineCoppockTriggerKind;
  /** SVG path `d` string for the triangle glyph. */
  d: string;
}

export interface ChartLineCoppockTriggerDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCoppockTriggerLayout {
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
  priceDots: ChartLineCoppockTriggerDot[];
  coppockPath: string;
  /**
   * Closed polygon path that traces the coppock curve and closes
   * back along the zero line. Filled with the bullish/bearish
   * linear-gradient split at the zero offset.
   */
  fillPath: string;
  /**
   * Linear-gradient zero offset in [0, 1] -- the position of the
   * zero line between `coppockTop` (0) and `coppockBottom` (1).
   * Two stop pairs (each color twice at this offset) produce a hard
   * split.
   */
  zeroSplitOffset: number;
  zeroLineY: number;
  markers: ChartLineCoppockTriggerMarker[];
  priceMin: number;
  priceMax: number;
  coppockMin: number;
  coppockMax: number;
  run: ChartLineCoppockTriggerRun;
}

export interface ChartLineCoppockTriggerProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCoppockTriggerPoint[];
  longROC?: number;
  shortROC?: number;
  wmaPeriod?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  triangleSize?: number;
  dotRadius?: number;
  priceColor?: string;
  coppockColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  bullishFillColor?: string;
  bearishFillColor?: string;
  zeroLineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCoppock?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showFill?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCoppockTriggerSeriesId[];
  defaultHiddenSeries?: ChartLineCoppockTriggerSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCoppockTriggerSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineCoppockTriggerSample;
  }) => void;
  onTriggerClick?: (detail: { trigger: ChartLineCoppockTriggerEvent }) => void;
  formatPrice?: (value: number) => string;
  formatCoppock?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WIDTH = 720;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_HEIGHT = 460;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_PADDING = 44;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_TRIANGLE_SIZE = 6;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_LONG_ROC = 14;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_SHORT_ROC = 11;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WMA_PERIOD = 10;
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_COPPOCK_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_BULLISH_FILL_COLOR =
  'rgba(22, 163, 74, 0.15)';
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_BEARISH_FILL_COLOR =
  'rgba(220, 38, 38, 0.15)';
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_ZERO_LINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_COPPOCK_TRIGGER_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineCoppockTriggerFinitePoints(
  data: readonly ChartLineCoppockTriggerPoint[] | null | undefined,
): ChartLineCoppockTriggerPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCoppockTriggerPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer period (>= 1). */
export function normalizeLineCoppockTriggerPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 1) return Math.floor(period);
  return fallback;
}

/** Rate of change in percent over a lookback period. */
export function applyLineCoppockTriggerROC(
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

/** Weighted moving average with linear weights `[1, 2, ..., period]`. */
export function applyLineCoppockTriggerWMA(
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

export interface ChartLineCoppockTriggerOptions {
  longROC?: number;
  shortROC?: number;
  wmaPeriod?: number;
}

export interface ChartLineCoppockTriggerChannels {
  longROC: Array<number | null>;
  shortROC: Array<number | null>;
  sumROC: Array<number | null>;
  coppock: Array<number | null>;
}

/** Compute the Coppock pipeline. */
export function computeLineCoppockTrigger(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineCoppockTriggerOptions = {},
): ChartLineCoppockTriggerChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { longROC: [], shortROC: [], sumROC: [], coppock: [] };
  }
  const longROC = normalizeLineCoppockTriggerPeriod(
    options.longROC,
    DEFAULT_CHART_LINE_COPPOCK_TRIGGER_LONG_ROC,
  );
  const shortROC = normalizeLineCoppockTriggerPeriod(
    options.shortROC,
    DEFAULT_CHART_LINE_COPPOCK_TRIGGER_SHORT_ROC,
  );
  const wmaPeriod = normalizeLineCoppockTriggerPeriod(
    options.wmaPeriod,
    DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WMA_PERIOD,
  );
  const longROCValues = applyLineCoppockTriggerROC(closes, longROC);
  const shortROCValues = applyLineCoppockTriggerROC(closes, shortROC);
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
  const coppock = applyLineCoppockTriggerWMA(sumROCValues, wmaPeriod);
  return {
    longROC: longROCValues,
    shortROC: shortROCValues,
    sumROC: sumROCValues,
    coppock,
  };
}

/** Classify a coppock reading. */
export function classifyLineCoppockTriggerZone(
  value: number | null,
): ChartLineCoppockTriggerZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}

/**
 * Detect zero-line triggers across a coppock sequence. A bar fires
 * `'bullish'` when the previous defined value was `<= 0` and the
 * current is `> 0`; `'bearish'` is the mirror.
 */
export function detectLineCoppockTriggerEvents(
  values: readonly (number | null)[],
): Array<ChartLineCoppockTriggerKind | null> {
  const out: Array<ChartLineCoppockTriggerKind | null> = [];
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
      out.push('bullish');
    } else if (prev >= 0 && v < 0) {
      out.push('bearish');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification and trigger list. */
export function runLineCoppockTrigger(
  data: readonly ChartLineCoppockTriggerPoint[] | null | undefined,
  options: ChartLineCoppockTriggerOptions = {},
): ChartLineCoppockTriggerRun {
  const series = getLineCoppockTriggerFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const longROC = normalizeLineCoppockTriggerPeriod(
    options.longROC,
    DEFAULT_CHART_LINE_COPPOCK_TRIGGER_LONG_ROC,
  );
  const shortROC = normalizeLineCoppockTriggerPeriod(
    options.shortROC,
    DEFAULT_CHART_LINE_COPPOCK_TRIGGER_SHORT_ROC,
  );
  const wmaPeriod = normalizeLineCoppockTriggerPeriod(
    options.wmaPeriod,
    DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WMA_PERIOD,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineCoppockTrigger(closes, {
    longROC,
    shortROC,
    wmaPeriod,
  });
  const triggerKinds = detectLineCoppockTriggerEvents(channels.coppock);
  const samples: ChartLineCoppockTriggerSample[] = series.map(
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
        zone: classifyLineCoppockTriggerZone(value),
        trigger: triggerKinds[index] ?? null,
      };
    },
  );
  const triggers: ChartLineCoppockTriggerEvent[] = [];
  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let noneCount = 0;
  let bullishTriggerCount = 0;
  let bearishTriggerCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'zero') zeroCount += 1;
    else noneCount += 1;
    if (sample.trigger !== null && sample.coppock !== null) {
      triggers.push({
        index: sample.index,
        x: sample.x,
        close: sample.close,
        coppock: sample.coppock,
        kind: sample.trigger,
      });
      if (sample.trigger === 'bullish') bullishTriggerCount += 1;
      else bearishTriggerCount += 1;
    }
  }
  return {
    series,
    longROC,
    shortROC,
    wmaPeriod,
    longROCValues: channels.longROC,
    shortROCValues: channels.shortROC,
    sumROCValues: channels.sumROC,
    coppockValues: channels.coppock,
    samples,
    triggers,
    positiveCount,
    negativeCount,
    zeroCount,
    noneCount,
    bullishTriggerCount,
    bearishTriggerCount,
    ok: series.length >= Math.max(longROC, shortROC) + wmaPeriod,
  };
}

export interface ChartLineCoppockTriggerLayoutOptions
  extends ChartLineCoppockTriggerOptions {
  data: readonly ChartLineCoppockTriggerPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  triangleSize?: number;
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

function buildTrianglePath(
  cx: number,
  cy: number,
  size: number,
  kind: ChartLineCoppockTriggerKind,
): string {
  const r = size;
  if (kind === 'bullish') {
    // Upward triangle anchored above the marker centre.
    const x1 = (cx - r).toFixed(2);
    const x2 = (cx + r).toFixed(2);
    const xT = cx.toFixed(2);
    const yB = (cy + r).toFixed(2);
    const yT = (cy - r).toFixed(2);
    return `M${xT},${yT} L${x2},${yB} L${x1},${yB} Z`;
  }
  // Downward triangle.
  const x1 = (cx - r).toFixed(2);
  const x2 = (cx + r).toFixed(2);
  const xT = cx.toFixed(2);
  const yB = (cy - r).toFixed(2);
  const yT = (cy + r).toFixed(2);
  return `M${xT},${yT} L${x2},${yB} L${x1},${yB} Z`;
}

/** Project the run into a dual-panel SVG layout. */
export function computeLineCoppockTriggerLayout(
  options: ChartLineCoppockTriggerLayoutOptions,
): ChartLineCoppockTriggerLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_COPPOCK_TRIGGER_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_COPPOCK_TRIGGER_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_COPPOCK_TRIGGER_PANEL_GAP;
  const triangleSize = isFiniteNumber(options.triangleSize)
    ? options.triangleSize
    : DEFAULT_CHART_LINE_COPPOCK_TRIGGER_TRIANGLE_SIZE;

  const run = runLineCoppockTrigger(options.data, {
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
  const priceDots: ChartLineCoppockTriggerDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const coppockLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineCoppockTriggerMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.coppock)) return;
    const cx = xAt(index);
    const yc = coppockY(sample.coppock);
    coppockLinePoints.push({ x: cx, y: yc });
    if (sample.trigger === 'bullish' || sample.trigger === 'bearish') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        coppock: sample.coppock,
        kind: sample.trigger,
        d: buildTrianglePath(cx, yc, triangleSize, sample.trigger),
      });
    }
  });

  const zeroLineY = coppockY(0);

  // Closed fill polygon: trace the coppock curve, close along the
  // zero baseline. Only emitted if there is at least one valid bar.
  let fillPath = '';
  if (coppockLinePoints.length > 0) {
    const first = coppockLinePoints[0]!;
    const last = coppockLinePoints[coppockLinePoints.length - 1]!;
    fillPath =
      `M${first.x.toFixed(2)},${zeroLineY.toFixed(2)} ` +
      `L${first.x.toFixed(2)},${first.y.toFixed(2)}`;
    for (let i = 1; i < coppockLinePoints.length; i += 1) {
      const p = coppockLinePoints[i]!;
      fillPath += ` L${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    }
    fillPath += ` L${last.x.toFixed(2)},${zeroLineY.toFixed(2)} Z`;
  }

  const denomY = coppockBottom - coppockTop;
  const zeroSplitOffset =
    denomY > 0 ? (zeroLineY - coppockTop) / denomY : 0.5;

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
    fillPath,
    zeroSplitOffset,
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
export function describeLineCoppockTriggerChart(
  data: readonly ChartLineCoppockTriggerPoint[] | null | undefined,
  options: ChartLineCoppockTriggerOptions = {},
): string {
  const run = runLineCoppockTrigger(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Coppock Curve trigger panel beneath the ` +
    `close (longROC ${run.longROC}, shortROC ${run.shortROC}, ` +
    `wmaPeriod ${run.wmaPeriod}). Coppock = WMA of ` +
    `(ROC(longROC) + ROC(shortROC)). The lower panel is painted with ` +
    `a hard bullish/bearish split at the zero line, and each ` +
    `zero-line crossing fires a triangle marker. Across ${total} bars ` +
    `the detector recorded ${run.bullishTriggerCount} bullish and ` +
    `${run.bearishTriggerCount} bearish triggers ` +
    `(positive ${run.positiveCount}, negative ${run.negativeCount}, ` +
    `zero ${run.zeroCount}, undefined ${run.noneCount}).`
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
  kind: ChartLineCoppockTriggerKind,
  bullishColor: string,
  bearishColor: string,
): string {
  if (kind === 'bullish') return bullishColor;
  return bearishColor;
}

function zoneLabelOf(zone: ChartLineCoppockTriggerZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'zero') return 'Zero';
  return 'n/a';
}

function triggerLabelOf(
  trigger: ChartLineCoppockTriggerKind | null,
): string {
  if (trigger === 'bullish') return 'Bullish trigger';
  if (trigger === 'bearish') return 'Bearish trigger';
  return '-';
}

/** ChartLineCoppockTrigger -- dual-panel pure-SVG chart. */
export const ChartLineCoppockTrigger = forwardRef<
  HTMLDivElement,
  ChartLineCoppockTriggerProps
>(function ChartLineCoppockTrigger(props, ref) {
  const {
    data,
    longROC = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_LONG_ROC,
    shortROC = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_SHORT_ROC,
    wmaPeriod = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WMA_PERIOD,
    width = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_WIDTH,
    height = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_HEIGHT,
    padding = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_PADDING,
    panelGap = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_STROKE_WIDTH,
    triangleSize = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_TRIANGLE_SIZE,
    dotRadius = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_PRICE_COLOR,
    coppockColor = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_COPPOCK_COLOR,
    bullishColor = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_BEARISH_COLOR,
    bullishFillColor = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_BULLISH_FILL_COLOR,
    bearishFillColor = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_BEARISH_FILL_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_ZERO_LINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_COPPOCK_TRIGGER_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCoppock = true,
    showMarkers = true,
    showZeroLine = true,
    showFill = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    onTriggerClick,
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
  const baseId = `chart-line-coppock-trigger-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;
  const gradId = `${baseId}-gradient`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineCoppockTriggerSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineCoppockTriggerSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineCoppockTriggerLayout({
        data,
        longROC,
        shortROC,
        wmaPeriod,
        width,
        height,
        padding,
        panelGap,
        triangleSize,
      }),
    [
      data,
      longROC,
      shortROC,
      wmaPeriod,
      width,
      height,
      padding,
      panelGap,
      triangleSize,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineCoppockTriggerChart(data, {
      longROC,
      shortROC,
      wmaPeriod,
    });
  const resolvedLabel =
    ariaLabel ??
    `Coppock trigger chart, longROC ${run.longROC}, shortROC ${run.shortROC}, wmaPeriod ${run.wmaPeriod}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineCoppockTriggerSeriesId): void => {
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

  const handleMarkerActivate = (sampleIndex: number): void => {
    const sample = run.samples[sampleIndex];
    if (!sample) return;
    if (sample.trigger !== null && sample.coppock !== null) {
      onTriggerClick?.({
        trigger: {
          index: sample.index,
          x: sample.x,
          close: sample.close,
          coppock: sample.coppock,
          kind: sample.trigger,
        },
      });
    }
    onPointClick?.({ point: sample });
  };

  const handleKey = (
    event: KeyboardEvent<SVGElement>,
    sampleIndex: number,
    isMarker: boolean,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isMarker) handleMarkerActivate(sampleIndex);
      else handleActivate(sampleIndex);
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
        data-section="chart-line-coppock-trigger-tooltip"
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
          data-section="chart-line-coppock-trigger-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-coppock-trigger-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-coppock-trigger-tooltip-sum-roc"
          x={tx + 10}
          y={ty + 51}
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
          data-section="chart-line-coppock-trigger-tooltip-coppock"
          x={tx + 10}
          y={ty + 71}
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
          data-section="chart-line-coppock-trigger-tooltip-zone"
          x={tx + 10}
          y={ty + 89}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-coppock-trigger-tooltip-trigger"
          x={tx + 10}
          y={ty + 105}
          fill={
            hoverSample.trigger === 'bullish'
              ? bullishColor
              : hoverSample.trigger === 'bearish'
                ? bearishColor
                : '#cbd5e1'
          }
          fontSize={11}
          fontWeight={hoverSample.trigger !== null ? 600 : 400}
        >
          {`Trigger: ${triggerLabelOf(hoverSample.trigger)}`}
        </text>
        <text
          data-section="chart-line-coppock-trigger-tooltip-counts"
          x={tx + 10}
          y={ty + 123}
          fill="#94a3b8"
          fontSize={10}
        >
          {`Run triggers: bull ${run.bullishTriggerCount} / bear ${run.bearishTriggerCount}`}
        </text>
        <text
          data-section="chart-line-coppock-trigger-tooltip-period"
          x={tx + 10}
          y={ty + 139}
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
    id: ChartLineCoppockTriggerSeriesId;
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
      data-section="chart-line-coppock-trigger"
      data-empty={isEmpty ? 'true' : 'false'}
      data-long-roc={run.longROC}
      data-short-roc={run.shortROC}
      data-wma-period={run.wmaPeriod}
      data-positive-count={run.positiveCount}
      data-negative-count={run.negativeCount}
      data-zero-count={run.zeroCount}
      data-none-count={run.noneCount}
      data-bullish-trigger-count={run.bullishTriggerCount}
      data-bearish-trigger-count={run.bearishTriggerCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-coppock-trigger-aria-desc"
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
          data-section="chart-line-coppock-trigger-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-coppock-trigger-empty"
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
          data-section="chart-line-coppock-trigger-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <defs>
            <linearGradient
              id={gradId}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={layout.coppockTop}
              x2={0}
              y2={layout.coppockBottom}
            >
              <stop offset={0} stopColor={bullishFillColor} />
              <stop offset={layout.zeroSplitOffset} stopColor={bullishFillColor} />
              <stop offset={layout.zeroSplitOffset} stopColor={bearishFillColor} />
              <stop offset={1} stopColor={bearishFillColor} />
            </linearGradient>
          </defs>

          {showGrid ? (
            <g data-section="chart-line-coppock-trigger-grid">
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
                      data-section="chart-line-coppock-trigger-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-coppock-trigger-grid-line"
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
            <g data-section="chart-line-coppock-trigger-axes">
              <line
                data-section="chart-line-coppock-trigger-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-coppock-trigger-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-coppock-trigger-axis"
                data-panel="coppock"
                x1={layout.innerLeft}
                y1={layout.coppockTop}
                x2={layout.innerLeft}
                y2={layout.coppockBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-coppock-trigger-axis"
                data-panel="coppock"
                x1={layout.innerLeft}
                y1={layout.coppockBottom}
                x2={layout.innerRight}
                y2={layout.coppockBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-coppock-trigger-tick-label"
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
                data-section="chart-line-coppock-trigger-tick-label"
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
                data-section="chart-line-coppock-trigger-tick-label"
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
                data-section="chart-line-coppock-trigger-tick-label"
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

          {showFill && layout.fillPath ? (
            <path
              data-section="chart-line-coppock-trigger-fill"
              d={layout.fillPath}
              fill={`url(#${gradId})`}
              stroke="none"
            />
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-coppock-trigger-zero-line"
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
              data-section="chart-line-coppock-trigger-price-path"
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
            <g data-section="chart-line-coppock-trigger-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-coppock-trigger-dot"
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
                  onKeyDown={(e) => handleKey(e, dot.index, false)}
                />
              ))}
            </g>
          ) : null}

          {!coppockHidden ? (
            <path
              data-section="chart-line-coppock-trigger-line"
              d={layout.coppockPath}
              fill="none"
              stroke={coppockColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Coppock trigger line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-coppock-trigger-markers">
              {layout.markers.map((marker) => (
                <path
                  key={`marker-${marker.index}`}
                  data-section="chart-line-coppock-trigger-marker"
                  data-kind={marker.kind}
                  data-close={marker.close}
                  data-coppock={marker.coppock}
                  d={marker.d}
                  fill={markerColorOf(marker.kind, bullishColor, bearishColor)}
                  stroke={markerColorOf(
                    marker.kind,
                    bullishColor,
                    bearishColor,
                  )}
                  strokeWidth={1}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, coppock ${formatCoppock(
                    marker.coppock,
                  )}, ${triggerLabelOf(marker.kind)}`}
                  onMouseEnter={() => setHover(marker.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(marker.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleMarkerActivate(marker.index)}
                  onKeyDown={(e) => handleKey(e, marker.index, true)}
                />
              ))}
            </g>
          ) : null}

          {showConfigBadge ? (
            <g data-section="chart-line-coppock-trigger-badge">
              <rect
                data-section="chart-line-coppock-trigger-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={220}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-coppock-trigger-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Coppock trigger ${run.longROC}/${run.shortROC}/${run.wmaPeriod}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-coppock-trigger-legend"
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
                data-section="chart-line-coppock-trigger-legend-item"
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
                  data-section="chart-line-coppock-trigger-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-coppock-trigger-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-coppock-trigger-legend-stats"
            style={{ color: axisColor }}
          >
            {`bull ${run.bullishTriggerCount} / bear ${run.bearishTriggerCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCoppockTrigger.displayName = 'ChartLineCoppockTrigger';
