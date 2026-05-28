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
 * ChartLineTrixDoubleSmoothed -- pure-SVG dual-panel chart with the
 * close on top and a doubly smoothed TRIX oscillator on the bottom.
 *
 *   logClose[i]    = ln(close[i])  (null when close <= 0)
 *   ema1[i]        = EMA(logClose, length)[i]
 *   ema2[i]        = EMA(ema1,     length)[i]
 *   ema3[i]        = EMA(ema2,     length)[i]
 *   trix[i]        = (ema3[i] - ema3[i - 1]) * 10000   (basis points)
 *   double[i]      = EMA(trix, signalLength)[i]
 *
 * Standard TRIX is the rate of change of the triple-EMA-smoothed
 * series; "doubly smoothed" appends one more EMA pass on the TRIX
 * output (the conventional signal line). The log transform on close
 * turns the multiplicative price ratio into an additive difference,
 * so `ema3[i] - ema3[i-1]` is the natural log-return of the smoothed
 * series in basis points.
 *
 * `double[i]` is `null` during the combined warmup
 * (`3*(length - 1) + 1 + signalLength - 1`) and propagates `null` if
 * `close[i] <= 0` anywhere in the prefix.
 *
 * Bit-exact anchor: **CONST close = K > 0**: `logClose = ln(K)`
 * constant, the EMA CONST short-circuit
 * (`next = v === prev ? v : alpha*v + (1-alpha)*prev`) keeps all
 * three smoothing passes at `ln(K)`, the difference of consecutive
 * `ema3` values is exactly 0, and the final EMA of zeros remains 0.
 * Verified across `K > 0` and parameter sweeps.
 */

export interface ChartLineTrixDoubleSmoothedPoint {
  x: number;
  close: number;
}

export type ChartLineTrixDoubleSmoothedZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineTrixDoubleSmoothedCross = 'up' | 'down' | null;

export type ChartLineTrixDoubleSmoothedSeriesId = 'price' | 'trix';

export interface ChartLineTrixDoubleSmoothedSample {
  index: number;
  x: number;
  close: number;
  logClose: number | null;
  ema1: number | null;
  ema2: number | null;
  ema3: number | null;
  trix: number | null;
  doubleSmoothed: number | null;
  zone: ChartLineTrixDoubleSmoothedZone;
  crossed: ChartLineTrixDoubleSmoothedCross;
}

export interface ChartLineTrixDoubleSmoothedRun {
  series: ChartLineTrixDoubleSmoothedPoint[];
  length: number;
  signalLength: number;
  bullishThreshold: number;
  bearishThreshold: number;
  logCloseValues: Array<number | null>;
  ema1Values: Array<number | null>;
  ema2Values: Array<number | null>;
  ema3Values: Array<number | null>;
  trixValues: Array<number | null>;
  doubleSmoothedValues: Array<number | null>;
  samples: ChartLineTrixDoubleSmoothedSample[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineTrixDoubleSmoothedMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  doubleSmoothed: number;
  crossed: 'up' | 'down';
}

export interface ChartLineTrixDoubleSmoothedDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTrixDoubleSmoothedLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  trixTop: number;
  trixBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineTrixDoubleSmoothedDot[];
  trixPath: string;
  bullishY: number;
  bearishY: number;
  zeroY: number;
  markers: ChartLineTrixDoubleSmoothedMarker[];
  priceMin: number;
  priceMax: number;
  trixMin: number;
  trixMax: number;
  run: ChartLineTrixDoubleSmoothedRun;
}

export interface ChartLineTrixDoubleSmoothedProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTrixDoubleSmoothedPoint[];
  length?: number;
  signalLength?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  trixColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTrix?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTrixDoubleSmoothedSeriesId[];
  defaultHiddenSeries?: ChartLineTrixDoubleSmoothedSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTrixDoubleSmoothedSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineTrixDoubleSmoothedSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatTrix?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_WIDTH = 720;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_PADDING = 44;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_LENGTH = 15;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BULLISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BEARISH_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_TRIX_COLOR = '#6366f1';
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x and finite close. */
export function getLineTrixDoubleSmoothedFinitePoints(
  data:
    | readonly ChartLineTrixDoubleSmoothedPoint[]
    | null
    | undefined,
): ChartLineTrixDoubleSmoothedPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTrixDoubleSmoothedPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineTrixDoubleSmoothedLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer signal length (>= 1). */
export function normalizeLineTrixDoubleSmoothedSignalLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a numeric threshold (any finite real). */
export function normalizeLineTrixDoubleSmoothedThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold)) return threshold;
  return fallback;
}

/** ln(close[i]) where close > 0, else null. */
export function applyLineTrixDoubleSmoothedLog(
  closes: readonly number[],
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i];
    if (!isFiniteNumber(c) || c <= 0) {
      out.push(null);
      continue;
    }
    const v = Math.log(c);
    out.push(Number.isFinite(v) ? posZero(v) : null);
  }
  return out;
}

/**
 * SMA-seeded EMA with CONST short-circuit. Null inputs reset the
 * seed (a fresh SMA accumulation must complete before EMA resumes).
 * If all seed-window values are identical (min === max), the seed
 * uses that exact value to avoid 1-ULP drift from non-dyadic SMA
 * arithmetic such as ln(K) for non-dyadic K and length not a power
 * of 2.
 */
export function applyLineTrixDoubleSmoothedEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
  let ema: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      ema = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (ema == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        ema = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(ema);
      }
    } else {
      const next = v === ema ? v : alpha * v + (1 - alpha) * ema;
      ema = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

/** Difference of consecutive defined values, scaled. */
export function applyLineTrixDoubleSmoothedDifference(
  values: readonly (number | null)[],
  scale: number,
): Array<number | null> {
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = v;
      continue;
    }
    out.push(posZero((v - prev) * scale));
    prev = v;
  }
  return out;
}

export interface LineTrixDoubleSmoothedChannels {
  logClose: Array<number | null>;
  ema1: Array<number | null>;
  ema2: Array<number | null>;
  ema3: Array<number | null>;
  trix: Array<number | null>;
  doubleSmoothed: Array<number | null>;
}

/** Compute the full TRIX (triple-EMA + ROC + signal EMA) pipeline. */
export function computeLineTrixDoubleSmoothed(
  series:
    | readonly ChartLineTrixDoubleSmoothedPoint[]
    | null
    | undefined,
  options: {
    length?: number;
    signalLength?: number;
  } = {},
): LineTrixDoubleSmoothedChannels {
  const cleaned = getLineTrixDoubleSmoothedFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      logClose: [],
      ema1: [],
      ema2: [],
      ema3: [],
      trix: [],
      doubleSmoothed: [],
    };
  }
  const length = normalizeLineTrixDoubleSmoothedLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_LENGTH,
  );
  const signalLength = normalizeLineTrixDoubleSmoothedSignalLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_SIGNAL_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const logClose = applyLineTrixDoubleSmoothedLog(closes);
  const ema1 = applyLineTrixDoubleSmoothedEma(logClose, length);
  const ema2 = applyLineTrixDoubleSmoothedEma(ema1, length);
  const ema3 = applyLineTrixDoubleSmoothedEma(ema2, length);
  const trix = applyLineTrixDoubleSmoothedDifference(ema3, 10000);
  const doubleSmoothed = applyLineTrixDoubleSmoothedEma(
    trix,
    signalLength,
  );

  return { logClose, ema1, ema2, ema3, trix, doubleSmoothed };
}

export function classifyLineTrixDoubleSmoothedZone(
  value: number | null,
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineTrixDoubleSmoothedZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > bullishThreshold) return 'bullish';
  if (value < bearishThreshold) return 'bearish';
  return 'neutral';
}

export function detectLineTrixDoubleSmoothedCrosses(
  values: readonly (number | null)[],
  bullishThreshold: number,
  bearishThreshold: number,
): ChartLineTrixDoubleSmoothedCross[] {
  const out: ChartLineTrixDoubleSmoothedCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev <= bullishThreshold && v > bullishThreshold) {
      out.push('up');
    } else if (prev >= bearishThreshold && v < bearishThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineTrixDoubleSmoothed(
  data: ChartLineTrixDoubleSmoothedPoint[],
  options: {
    length?: number;
    signalLength?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): ChartLineTrixDoubleSmoothedRun {
  const cleaned = getLineTrixDoubleSmoothedFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineTrixDoubleSmoothedLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_LENGTH,
  );
  const signalLength = normalizeLineTrixDoubleSmoothedSignalLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_SIGNAL_LENGTH,
  );
  const bullishThreshold = normalizeLineTrixDoubleSmoothedThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineTrixDoubleSmoothedThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BEARISH_THRESHOLD,
  );

  const channels = computeLineTrixDoubleSmoothed(series, {
    length,
    signalLength,
  });
  const crosses = detectLineTrixDoubleSmoothedCrosses(
    channels.doubleSmoothed,
    bullishThreshold,
    bearishThreshold,
  );

  const samples: ChartLineTrixDoubleSmoothedSample[] = series.map(
    (p, i) => {
      const logClose = channels.logClose[i] ?? null;
      const ema1 = channels.ema1[i] ?? null;
      const ema2 = channels.ema2[i] ?? null;
      const ema3 = channels.ema3[i] ?? null;
      const trix = channels.trix[i] ?? null;
      const doubleSmoothed = channels.doubleSmoothed[i] ?? null;
      const zone = classifyLineTrixDoubleSmoothedZone(
        doubleSmoothed,
        bullishThreshold,
        bearishThreshold,
      );
      const crossed = crosses[i] ?? null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        logClose,
        ema1,
        ema2,
        ema3,
        trix,
        doubleSmoothed,
        zone,
        crossed,
      };
    },
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'bullish') bullishCount += 1;
    else if (s.zone === 'bearish') bearishCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const warmup = 3 * (length - 1) + 1 + signalLength - 1;
  const ok = series.length > warmup;

  return {
    series = [],
    length,
    signalLength,
    bullishThreshold,
    bearishThreshold,
    logCloseValues: channels.logClose,
    ema1Values: channels.ema1,
    ema2Values: channels.ema2,
    ema3Values: channels.ema3,
    trixValues: channels.trix,
    doubleSmoothedValues: channels.doubleSmoothed,
    samples,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineTrixDoubleSmoothedLayoutOptions {
  data: ChartLineTrixDoubleSmoothedPoint[];
  length?: number;
  signalLength?: number;
  bullishThreshold?: number;
  bearishThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTrixDoubleSmoothedLayout(
  opts: ComputeLineTrixDoubleSmoothedLayoutOptions,
): ChartLineTrixDoubleSmoothedLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_PANEL_GAP;

  const run = runLineTrixDoubleSmoothed(opts.data, {
    length: opts.length ?? undefined,
    signalLength: opts.signalLength ?? undefined,
    bullishThreshold: opts.bullishThreshold ?? undefined,
    bearishThreshold: opts.bearishThreshold ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const trixTop = priceBottom + panelGap;
  const trixBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      trixTop,
      trixBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      trixPath: '',
      bullishY: trixTop,
      bearishY: trixBottom,
      zeroY: (trixTop + trixBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      trixMin: -1,
      trixMax: 1,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let trixMin = Infinity;
  let trixMax = -Infinity;
  for (const s of run.samples) {
    if (s.doubleSmoothed == null) continue;
    if (s.doubleSmoothed < trixMin) trixMin = s.doubleSmoothed;
    if (s.doubleSmoothed > trixMax) trixMax = s.doubleSmoothed;
  }
  if (!Number.isFinite(trixMin) || !Number.isFinite(trixMax)) {
    trixMin = -1;
    trixMax = 1;
  }
  if (trixMin > 0) trixMin = 0;
  if (trixMax < 0) trixMax = 0;
  if (trixMin === trixMax) {
    trixMin -= 1;
    trixMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syTrix = (y: number): number =>
    trixBottom -
    ((y - trixMin) / (trixMax - trixMin)) * (trixBottom - trixTop);

  let pricePath = '';
  const priceDots: ChartLineTrixDoubleSmoothedDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = syPrice(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  let trixPath = '';
  let firstT = true;
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s || s.doubleSmoothed == null) {
      firstT = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syTrix(s.doubleSmoothed);
    trixPath += `${firstT ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstT = false;
  }

  const markers: ChartLineTrixDoubleSmoothedMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.doubleSmoothed == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syTrix(s.doubleSmoothed),
      close: s.close,
      doubleSmoothed: s.doubleSmoothed,
      crossed: s.crossed,
    });
  }

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    trixTop,
    trixBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    trixPath: trixPath.trim(),
    bullishY: syTrix(run.bullishThreshold),
    bearishY: syTrix(run.bearishThreshold),
    zeroY: syTrix(0),
    markers,
    priceMin,
    priceMax,
    trixMin,
    trixMax,
    run,
  };
}

export function describeLineTrixDoubleSmoothedChart(
  data: ChartLineTrixDoubleSmoothedPoint[],
  options: {
    length?: number;
    signalLength?: number;
    bullishThreshold?: number;
    bearishThreshold?: number;
  } = {},
): string {
  const cleaned = getLineTrixDoubleSmoothedFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineTrixDoubleSmoothedLength(
    options.length,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_LENGTH,
  );
  const signalLength = normalizeLineTrixDoubleSmoothedSignalLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_SIGNAL_LENGTH,
  );
  const bullishThreshold = normalizeLineTrixDoubleSmoothedThreshold(
    options.bullishThreshold,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BULLISH_THRESHOLD,
  );
  const bearishThreshold = normalizeLineTrixDoubleSmoothedThreshold(
    options.bearishThreshold,
    DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BEARISH_THRESHOLD,
  );
  return (
    `Double-smoothed TRIX chart over ${cleaned.length} bars ` +
    `(length ${length}, signalLength ${signalLength}, ` +
    `bullishThreshold ${bullishThreshold}, ` +
    `bearishThreshold ${bearishThreshold}). Top panel renders the close; ` +
    `bottom panel renders an additional EMA of the log close ` +
    `triple-smoothed rate of change in basis points.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultTrixFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineTrixDoubleSmoothed = forwardRef<
  HTMLDivElement,
  ChartLineTrixDoubleSmoothedProps
>(function ChartLineTrixDoubleSmoothed(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_LENGTH,
    signalLength = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_SIGNAL_LENGTH,
    bullishThreshold = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BULLISH_THRESHOLD,
    bearishThreshold = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BEARISH_THRESHOLD,
    width = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_WIDTH,
    height = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_HEIGHT,
    padding = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_PADDING,
    panelGap = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_PRICE_COLOR,
    trixColor = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_TRIX_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TRIX_DOUBLE_SMOOTHED_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTrix = true,
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
    formatPrice = defaultPriceFormatter,
    formatTrix = defaultTrixFormatter,
    formatX = defaultXFormatter,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...rest
  } = props;

  const reactId = useId();
  const titleId = `${reactId}-title`;
  const descId = `${reactId}-desc`;

  const cleaned = useMemo(
    () => getLineTrixDoubleSmoothedFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTrixDoubleSmoothedLayout({
        data: cleaned,
        length,
        signalLength,
        bullishThreshold,
        bearishThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      signalLength,
      bullishThreshold,
      bearishThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineTrixDoubleSmoothedSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineTrixDoubleSmoothedSeriesId,
  ) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineTrixDoubleSmoothedSeriesId,
  ): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLegendClick(seriesId);
    }
  };

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (cleaned.length === 0) {
    return (
      <div
        ref={ref}
        className={className}
        style={style}
        data-section="chart-line-trix-double-smoothed-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTrixDoubleSmoothedChart(cleaned, {
      length,
      signalLength,
      bullishThreshold,
      bearishThreshold,
    });

  const showPrice = !hidden.has('price');
  const showTrixLine = !hidden.has('trix') && showTrix;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickTrixValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickTrixValues.push(
      layout.trixMin + ((layout.trixMax - layout.trixMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Double-smoothed TRIX chart'}
      aria-describedby={descId}
      data-section="chart-line-trix-double-smoothed"
      data-length={length}
      data-signal-length={signalLength}
      data-bullish-threshold={bullishThreshold}
      data-bearish-threshold={bearishThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-trix-double-smoothed-title"
      >
        {ariaLabel ?? 'Double-smoothed TRIX chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-trix-double-smoothed-aria-desc"
      >
        {desc}
      </span>
      <svg
        role="img"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={0}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className={animate ? 'motion-safe:animate-fade-in' : undefined}
        data-section="chart-line-trix-double-smoothed-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-trix-double-smoothed-grid">
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <line
                  key={`grid-price-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-trix-double-smoothed-grid-line-price"
                />
              );
            })}
            {tickTrixValues.map((v, i) => {
              const y =
                layout.trixBottom -
                ((v - layout.trixMin) /
                  (layout.trixMax - layout.trixMin)) *
                  (layout.trixBottom - layout.trixTop);
              return (
                <line
                  key={`grid-trix-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-trix-double-smoothed-grid-line-trix"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-trix-double-smoothed-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.priceTop}
              x2={layout.innerLeft}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.priceBottom}
              x2={layout.innerRight}
              y2={layout.priceBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.trixTop}
              x2={layout.innerLeft}
              y2={layout.trixBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.trixBottom}
              x2={layout.innerRight}
              y2={layout.trixBottom}
              stroke={axisColor}
            />
            {tickPriceValues.map((v, i) => {
              const y =
                layout.priceBottom -
                ((v - layout.priceMin) /
                  (layout.priceMax - layout.priceMin)) *
                  (layout.priceBottom - layout.priceTop);
              return (
                <text
                  key={`tick-price-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-trix-double-smoothed-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickTrixValues.map((v, i) => {
              const y =
                layout.trixBottom -
                ((v - layout.trixMin) /
                  (layout.trixMax - layout.trixMin)) *
                  (layout.trixBottom - layout.trixTop);
              return (
                <text
                  key={`tick-trix-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-trix-double-smoothed-tick-trix"
                >
                  {formatTrix(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-trix-double-smoothed-zero-line"
          />
        ) : null}

        {showThresholds &&
        (bullishThreshold !== 0 || bearishThreshold !== 0) ? (
          <g data-section="chart-line-trix-double-smoothed-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.bullishY}
              x2={layout.innerRight}
              y2={layout.bullishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-trix-double-smoothed-bullish-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.bearishY}
              x2={layout.innerRight}
              y2={layout.bearishY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-trix-double-smoothed-bearish-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-double-smoothed-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-trix-double-smoothed-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-trix-double-smoothed-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showTrixLine ? (
          <path
            d={layout.trixPath}
            stroke={trixColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-trix-double-smoothed-line"
          />
        ) : null}

        {showMarkers && showTrixLine ? (
          <g data-section="chart-line-trix-double-smoothed-markers">
            {layout.markers.map((m) => (
              <circle
                key={`trix-marker-${m.index}`}
                cx={m.cx}
                cy={m.cy}
                r={dotRadius + 2}
                fill={m.crossed === 'up' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onPointClick?.({ point: sample });
                }}
                data-section="chart-line-trix-double-smoothed-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-trix-double-smoothed-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.trixBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-trix-double-smoothed-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-trix-double-smoothed-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={190}
                  height={136}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-double-smoothed-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-double-smoothed-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-double-smoothed-tooltip-log"
                >
                  logClose{' '}
                  {tooltipSample.logClose == null
                    ? '--'
                    : formatTrix(tooltipSample.logClose)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-double-smoothed-tooltip-ema3"
                >
                  ema3{' '}
                  {tooltipSample.ema3 == null
                    ? '--'
                    : formatTrix(tooltipSample.ema3)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-double-smoothed-tooltip-trix"
                >
                  trix{' '}
                  {tooltipSample.trix == null
                    ? '--'
                    : formatTrix(tooltipSample.trix)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-double-smoothed-tooltip-double"
                >
                  double{' '}
                  {tooltipSample.doubleSmoothed == null
                    ? '--'
                    : formatTrix(tooltipSample.doubleSmoothed)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-double-smoothed-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-trix-double-smoothed-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-trix-double-smoothed-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | signal {signalLength} | bull{' '}
          {bullishThreshold} | bear {bearishThreshold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-trix-double-smoothed-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            data-series-id="price"
            aria-pressed={!hidden.has('price')}
            onClick={() => handleLegendClick('price')}
            onKeyDown={(e) => handleLegendKey(e, 'price')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('price') ? 0.4 : 1,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: priceColor,
                borderRadius: 2,
              }}
            />
            close
          </button>
          <button
            type="button"
            data-series-id="trix"
            aria-pressed={!hidden.has('trix')}
            onClick={() => handleLegendClick('trix')}
            onKeyDown={(e) => handleLegendKey(e, 'trix')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('trix') ? 0.4 : 1,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 10,
                height: 10,
                background: trixColor,
                borderRadius: 2,
              }}
            />
            double trix
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTrixDoubleSmoothed.displayName = 'ChartLineTrixDoubleSmoothed';
