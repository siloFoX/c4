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
 * ChartLineFractalKc -- pure-SVG single-panel chart with a price
 * line and a Keltner Channel envelope anchored to the most recently
 * confirmed Bill Williams fractal pivots. Wilder's ATR provides the
 * channel half-width:
 *
 *   isUpperFractal[i]   = high[i] is strict max of high[i-2 .. i+2]
 *   isLowerFractal[i]   = low[i]  is strict min of low [i-2 .. i+2]
 *   (a fractal at index i is "confirmed" two bars later, at i + 2)
 *
 *   lastUF[i] = high of last confirmed upper fractal at index <= i
 *   lastLF[i] = low  of last confirmed lower fractal at index <= i
 *
 *   trueRange[i] = max(high[i] - low[i],
 *                      |high[i] - close[i-1]|,
 *                      |low[i]  - close[i-1]|)
 *   atr[i]       = Wilder-smoothed TR over `atrLength` bars
 *
 *   fractalMid[i] = (lastUF == null && lastLF == null) ? close[i]
 *                 : (lastUF != null && lastLF != null) ? (lastUF + lastLF) / 2
 *                 : (lastUF ?? lastLF)
 *   upper[i]      = fractalMid[i] + multiplier * atr[i]
 *   lower[i]      = fractalMid[i] - multiplier * atr[i]
 *
 * Until both fractals exist the channel "reseeds" off the close;
 * once a pivot lands, the mid snaps to the fractal value (or the
 * midpoint when both directions are available).
 *
 * Bit-exact anchors (monotonic data does not trigger any fractal,
 * so the close fallback is exercised):
 * - **CONST h=l=close=K**: TR = 0 -> ATR = 0; fractalMid = K;
 *   upper = lower = K bit-exact post-warmup.
 * - **LINEAR UP h=l=close=i+1**: TR = 1 for i >= 1 (`|h - prevC| = 1`);
 *   Wilder seed = SMA(1) = 1; iteration `(n-1)/n + 1/n = 1`
 *   bit-exact; fractalMid = close = i+1; upper = i+1 + m,
 *   lower = i+1 - m bit-exact.
 * - **LINEAR DOWN h=l=close=N-i**: symmetric -> upper = N-i + m,
 *   lower = N-i - m bit-exact.
 */

export interface ChartLineFractalKcPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineFractalKcZone =
  | 'above'
  | 'below'
  | 'inside'
  | 'none';

export type ChartLineFractalKcCross = 'up' | 'down' | null;

export type ChartLineFractalKcSeriesId =
  | 'price'
  | 'upper'
  | 'lower'
  | 'mid';

export interface ChartLineFractalKcSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  isUpperFractal: boolean;
  isLowerFractal: boolean;
  lastUpperFractal: number | null;
  lastLowerFractal: number | null;
  atr: number | null;
  mid: number | null;
  upper: number | null;
  lower: number | null;
  zone: ChartLineFractalKcZone;
  crossed: ChartLineFractalKcCross;
}

export interface ChartLineFractalKcRun {
  series: ChartLineFractalKcPoint[];
  atrLength: number;
  fractalLookback: number;
  multiplier: number;
  upperFractalValues: Array<number | null>;
  lowerFractalValues: Array<number | null>;
  lastUpperFractalValues: Array<number | null>;
  lastLowerFractalValues: Array<number | null>;
  atrValues: Array<number | null>;
  midValues: Array<number | null>;
  upperValues: Array<number | null>;
  lowerValues: Array<number | null>;
  samples: ChartLineFractalKcSample[];
  aboveCount: number;
  belowCount: number;
  insideCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  upperFractalCount: number;
  lowerFractalCount: number;
  ok: boolean;
}

export interface ChartLineFractalKcDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineFractalKcMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  kind: 'upper-fractal' | 'lower-fractal';
}

export interface ChartLineFractalKcLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineFractalKcDot[];
  upperPath: string;
  lowerPath: string;
  midPath: string;
  markers: ChartLineFractalKcMarker[];
  yMin: number;
  yMax: number;
  run: ChartLineFractalKcRun;
}

export interface ChartLineFractalKcProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFractalKcPoint[];
  atrLength?: number;
  fractalLookback?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  upperColor?: string;
  lowerColor?: string;
  midColor?: string;
  upperFractalColor?: string;
  lowerFractalColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showUpper?: boolean;
  showLower?: boolean;
  showMid?: boolean;
  showFractalMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFractalKcSeriesId[];
  defaultHiddenSeries?: ChartLineFractalKcSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineFractalKcSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineFractalKcSample }) => void;
  formatPrice?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_FRACTAL_KC_WIDTH = 720;
export const DEFAULT_CHART_LINE_FRACTAL_KC_HEIGHT = 360;
export const DEFAULT_CHART_LINE_FRACTAL_KC_PADDING = 44;
export const DEFAULT_CHART_LINE_FRACTAL_KC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FRACTAL_KC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FRACTAL_KC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FRACTAL_KC_ATR_LENGTH = 14;
export const DEFAULT_CHART_LINE_FRACTAL_KC_FRACTAL_LOOKBACK = 2;
export const DEFAULT_CHART_LINE_FRACTAL_KC_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_FRACTAL_KC_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_FRACTAL_KC_UPPER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FRACTAL_KC_LOWER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_FRACTAL_KC_MID_COLOR = '#475569';
export const DEFAULT_CHART_LINE_FRACTAL_KC_UPPER_FRACTAL_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_FRACTAL_KC_LOWER_FRACTAL_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_FRACTAL_KC_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FRACTAL_KC_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite OHLC fields. */
export function getLineFractalKcFinitePoints(
  data: readonly ChartLineFractalKcPoint[] | null | undefined,
): ChartLineFractalKcPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFractalKcPoint[] = [];
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
export function normalizeLineFractalKcAtrLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer fractal lookback (>= 1). */
export function normalizeLineFractalKcFractalLookback(
  lookback: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(lookback) && lookback >= 1) return Math.floor(lookback);
  return fallback;
}

/** Coerce a non-negative multiplier. */
export function normalizeLineFractalKcMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier >= 0) return multiplier;
  return fallback;
}

/** TR[i] = max(h-l, |h-prevC|, |l-prevC|). TR[0] = h-l. */
export function applyLineFractalKcTrueRange(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
): Array<number | null> {
  const n = Math.min(highs.length, lows.length, closes.length);
  const out: Array<number | null> = [];
  for (let i = 0; i < n; i += 1) {
    const h = highs[i];
    const l = lows[i];
    if (!isFiniteNumber(h) || !isFiniteNumber(l)) {
      out.push(null);
      continue;
    }
    if (i === 0) {
      out.push(posZero(h - l));
      continue;
    }
    const prevC = closes[i - 1];
    if (!isFiniteNumber(prevC)) {
      out.push(posZero(h - l));
      continue;
    }
    const range = h - l;
    const gapUp = Math.abs(h - prevC);
    const gapDown = Math.abs(l - prevC);
    let tr = range;
    if (gapUp > tr) tr = gapUp;
    if (gapDown > tr) tr = gapDown;
    out.push(posZero(tr));
  }
  return out;
}

/**
 * Wilder smoothing with SMA seed. Returns null during warmup.
 * Bit-exact for CONST input (SMA seed of n copies = exact value
 * when min === max, and `(n-1)/n * v + 1/n * v = v` exactly).
 */
export function applyLineFractalKcWilder(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  let smoothed: number | null = null;
  let sum = 0;
  let count = 0;
  let seedMin = Infinity;
  let seedMax = -Infinity;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      smoothed = null;
      sum = 0;
      count = 0;
      seedMin = Infinity;
      seedMax = -Infinity;
      continue;
    }
    if (smoothed == null) {
      sum += v;
      count += 1;
      if (v < seedMin) seedMin = v;
      if (v > seedMax) seedMax = v;
      if (count >= length) {
        smoothed = seedMin === seedMax ? seedMin : sum / length;
        out[i] = posZero(smoothed);
      }
    } else {
      const next =
        v === smoothed
          ? v
          : (smoothed * (length - 1) + v) / length;
      smoothed = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

/** Strict upper fractal: high[i] > all neighbours in i +/- lookback. */
export function detectLineFractalKcUpperFractals(
  highs: readonly number[],
  lookback: number,
): boolean[] {
  const n = highs.length;
  const out: boolean[] = new Array(n).fill(false);
  for (let i = lookback; i < n - lookback; i += 1) {
    const center = highs[i]!;
    let isMax = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (highs[i - j]! >= center || highs[i + j]! >= center) {
        isMax = false;
        break;
      }
    }
    if (isMax) out[i] = true;
  }
  return out;
}

/** Strict lower fractal: low[i] < all neighbours in i +/- lookback. */
export function detectLineFractalKcLowerFractals(
  lows: readonly number[],
  lookback: number,
): boolean[] {
  const n = lows.length;
  const out: boolean[] = new Array(n).fill(false);
  for (let i = lookback; i < n - lookback; i += 1) {
    const center = lows[i]!;
    let isMin = true;
    for (let j = 1; j <= lookback; j += 1) {
      if (lows[i - j]! <= center || lows[i + j]! <= center) {
        isMin = false;
        break;
      }
    }
    if (isMin) out[i] = true;
  }
  return out;
}

export interface LineFractalKcChannels {
  trueRange: Array<number | null>;
  atr: Array<number | null>;
  upperFractal: boolean[];
  lowerFractal: boolean[];
  lastUpperFractal: Array<number | null>;
  lastLowerFractal: Array<number | null>;
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
}

export function computeLineFractalKc(
  series: readonly ChartLineFractalKcPoint[] | null | undefined,
  options: {
    atrLength?: number;
    fractalLookback?: number;
    multiplier?: number;
  } = {},
): LineFractalKcChannels {
  const cleaned = getLineFractalKcFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      trueRange: [],
      atr: [],
      upperFractal: [],
      lowerFractal: [],
      lastUpperFractal: [],
      lastLowerFractal: [],
      mid: [],
      upper: [],
      lower: [],
    };
  }
  const atrLength = normalizeLineFractalKcAtrLength(
    options.atrLength,
    DEFAULT_CHART_LINE_FRACTAL_KC_ATR_LENGTH,
  );
  const fractalLookback = normalizeLineFractalKcFractalLookback(
    options.fractalLookback,
    DEFAULT_CHART_LINE_FRACTAL_KC_FRACTAL_LOOKBACK,
  );
  const multiplier = normalizeLineFractalKcMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_FRACTAL_KC_MULTIPLIER,
  );

  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  const closes = cleaned.map((p) => p.close);

  const trueRange = applyLineFractalKcTrueRange(highs, lows, closes);
  const atr = applyLineFractalKcWilder(trueRange, atrLength);
  const upperFractal = detectLineFractalKcUpperFractals(
    highs,
    fractalLookback,
  );
  const lowerFractal = detectLineFractalKcLowerFractals(
    lows,
    fractalLookback,
  );

  // Walk left-to-right; a fractal is "confirmed" `fractalLookback` bars
  // after the pivot index (we have to wait for the future neighbours).
  const lastUpperFractal: Array<number | null> = new Array(
    cleaned.length,
  ).fill(null);
  const lastLowerFractal: Array<number | null> = new Array(
    cleaned.length,
  ).fill(null);
  let curUF: number | null = null;
  let curLF: number | null = null;
  for (let i = 0; i < cleaned.length; i += 1) {
    const confirmIdx = i - fractalLookback;
    if (confirmIdx >= 0) {
      if (upperFractal[confirmIdx]) curUF = highs[confirmIdx]!;
      if (lowerFractal[confirmIdx]) curLF = lows[confirmIdx]!;
    }
    lastUpperFractal[i] = curUF;
    lastLowerFractal[i] = curLF;
  }

  const mid: Array<number | null> = [];
  const upper: Array<number | null> = [];
  const lower: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const a = atr[i];
    const uf = lastUpperFractal[i];
    const lf = lastLowerFractal[i];
    const c = closes[i]!;
    let m: number;
    if (uf != null && lf != null) m = (uf + lf) / 2;
    else if (uf != null) m = uf;
    else if (lf != null) m = lf;
    else m = c;
    if (a == null) {
      mid.push(posZero(m));
      upper.push(null);
      lower.push(null);
      continue;
    }
    mid.push(posZero(m));
    upper.push(posZero(m + multiplier * a));
    lower.push(posZero(m - multiplier * a));
  }

  return {
    trueRange,
    atr,
    upperFractal,
    lowerFractal,
    lastUpperFractal,
    lastLowerFractal,
    mid,
    upper,
    lower,
  };
}

export function classifyLineFractalKcZone(
  close: number,
  upper: number | null,
  lower: number | null,
): ChartLineFractalKcZone {
  if (upper == null || lower == null) return 'none';
  if (close > upper) return 'above';
  if (close < lower) return 'below';
  return 'inside';
}

export function detectLineFractalKcCrosses(
  closes: readonly number[],
  uppers: readonly (number | null)[],
  lowers: readonly (number | null)[],
): ChartLineFractalKcCross[] {
  const out: ChartLineFractalKcCross[] = [];
  let prevZone: ChartLineFractalKcZone = 'none';
  for (let i = 0; i < closes.length; i += 1) {
    const c = closes[i]!;
    const u = uppers[i] ?? null;
    const l = lowers[i] ?? null;
    const zone = classifyLineFractalKcZone(c, u, l);
    if (prevZone === 'none' || zone === 'none') {
      out.push(null);
    } else if (prevZone === 'inside' && zone === 'above') {
      out.push('up');
    } else if (prevZone === 'inside' && zone === 'below') {
      out.push('down');
    } else {
      out.push(null);
    }
    prevZone = zone;
  }
  return out;
}

export function runLineFractalKc(
  data: ChartLineFractalKcPoint[],
  options: {
    atrLength?: number;
    fractalLookback?: number;
    multiplier?: number;
  } = {},
): ChartLineFractalKcRun {
  const cleaned = getLineFractalKcFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const atrLength = normalizeLineFractalKcAtrLength(
    options.atrLength,
    DEFAULT_CHART_LINE_FRACTAL_KC_ATR_LENGTH,
  );
  const fractalLookback = normalizeLineFractalKcFractalLookback(
    options.fractalLookback,
    DEFAULT_CHART_LINE_FRACTAL_KC_FRACTAL_LOOKBACK,
  );
  const multiplier = normalizeLineFractalKcMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_FRACTAL_KC_MULTIPLIER,
  );

  const channels = computeLineFractalKc(series, {
    atrLength,
    fractalLookback,
    multiplier,
  });

  const closes = series.map((p) => p.close);
  const crosses = detectLineFractalKcCrosses(
    closes,
    channels.upper,
    channels.lower,
  );

  const upperFractalValues: Array<number | null> = series.map((p, i) =>
    channels.upperFractal[i] ? p.high : null,
  );
  const lowerFractalValues: Array<number | null> = series.map((p, i) =>
    channels.lowerFractal[i] ? p.low : null,
  );

  const samples: ChartLineFractalKcSample[] = series.map((p, i) => {
    const isUpperFractal = !!channels.upperFractal[i];
    const isLowerFractal = !!channels.lowerFractal[i];
    const lastUF = channels.lastUpperFractal[i] ?? null;
    const lastLF = channels.lastLowerFractal[i] ?? null;
    const atr = channels.atr[i] ?? null;
    const mid = channels.mid[i] ?? null;
    const upper = channels.upper[i] ?? null;
    const lower = channels.lower[i] ?? null;
    const zone = classifyLineFractalKcZone(p.close, upper, lower);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      isUpperFractal,
      isLowerFractal,
      lastUpperFractal: lastUF,
      lastLowerFractal: lastLF,
      atr,
      mid,
      upper,
      lower,
      zone,
      crossed,
    };
  });

  let aboveCount = 0;
  let belowCount = 0;
  let insideCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  let upperFractalCount = 0;
  let lowerFractalCount = 0;
  for (const s of samples) {
    if (s.zone === 'above') aboveCount += 1;
    else if (s.zone === 'below') belowCount += 1;
    else if (s.zone === 'inside') insideCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
    if (s.isUpperFractal) upperFractalCount += 1;
    if (s.isLowerFractal) lowerFractalCount += 1;
  }

  const ok = series.length >= atrLength + fractalLookback;

  return {
    series = [],
    atrLength,
    fractalLookback,
    multiplier,
    upperFractalValues,
    lowerFractalValues,
    lastUpperFractalValues: channels.lastUpperFractal,
    lastLowerFractalValues: channels.lastLowerFractal,
    atrValues: channels.atr,
    midValues: channels.mid,
    upperValues: channels.upper,
    lowerValues: channels.lower,
    samples,
    aboveCount,
    belowCount,
    insideCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    upperFractalCount,
    lowerFractalCount,
    ok,
  };
}

export interface ComputeLineFractalKcLayoutOptions {
  data: ChartLineFractalKcPoint[];
  atrLength?: number;
  fractalLookback?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
}

export function computeLineFractalKcLayout(
  opts: ComputeLineFractalKcLayoutOptions,
): ChartLineFractalKcLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_FRACTAL_KC_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_FRACTAL_KC_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_FRACTAL_KC_PADDING;

  const run = runLineFractalKc(opts.data, {
    atrLength: opts.atrLength ?? undefined,
    fractalLookback: opts.fractalLookback ?? undefined,
    multiplier: opts.multiplier ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      innerLeft,
      innerRight,
      innerTop,
      innerBottom,
      pricePath: '',
      priceDots: [],
      upperPath: '',
      lowerPath: '',
      midPath: '',
      markers: [],
      yMin: 0,
      yMax: 1,
      run,
    };
  }

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const s of run.samples) {
    if (s.low < yMin) yMin = s.low;
    if (s.high > yMax) yMax = s.high;
    if (s.upper != null && s.upper > yMax) yMax = s.upper;
    if (s.lower != null && s.lower < yMin) yMin = s.lower;
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const sy = (y: number): number =>
    innerBottom - ((y - yMin) / (yMax - yMin)) * (innerBottom - innerTop);

  let pricePath = '';
  const priceDots: ChartLineFractalKcDot[] = [];
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s) continue;
    const cx = sx(s.x);
    const cy = sy(s.close);
    pricePath += `${i === 0 ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    priceDots.push({
      index: s.index,
      x: s.x,
      cx,
      cy,
      close: s.close,
    });
  }

  const buildBandPath = (
    key: 'upper' | 'lower' | 'mid',
  ): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = sy(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const upperPath = buildBandPath('upper');
  const lowerPath = buildBandPath('lower');
  const midPath = buildBandPath('mid');

  const markers: ChartLineFractalKcMarker[] = [];
  for (const s of run.samples) {
    if (s.isUpperFractal) {
      markers.push({
        index: s.index,
        x: s.x,
        cx: sx(s.x),
        cy: sy(s.high),
        kind: 'upper-fractal',
      });
    }
    if (s.isLowerFractal) {
      markers.push({
        index: s.index,
        x: s.x,
        cx: sx(s.x),
        cy: sy(s.low),
        kind: 'lower-fractal',
      });
    }
  }

  return {
    ok: true,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    pricePath: pricePath.trim(),
    priceDots,
    upperPath,
    lowerPath,
    midPath,
    markers,
    yMin,
    yMax,
    run,
  };
}

export function describeLineFractalKcChart(
  data: ChartLineFractalKcPoint[],
  options: {
    atrLength?: number;
    fractalLookback?: number;
    multiplier?: number;
  } = {},
): string {
  const cleaned = getLineFractalKcFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const atrLength = normalizeLineFractalKcAtrLength(
    options.atrLength,
    DEFAULT_CHART_LINE_FRACTAL_KC_ATR_LENGTH,
  );
  const fractalLookback = normalizeLineFractalKcFractalLookback(
    options.fractalLookback,
    DEFAULT_CHART_LINE_FRACTAL_KC_FRACTAL_LOOKBACK,
  );
  const multiplier = normalizeLineFractalKcMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_FRACTAL_KC_MULTIPLIER,
  );
  return (
    `Fractal Keltner Channel chart over ${cleaned.length} bars ` +
    `(atrLength ${atrLength}, fractalLookback ${fractalLookback}, ` +
    `multiplier ${multiplier}). Single panel with the close line ` +
    `wrapped by a Keltner envelope anchored to the most recently ` +
    `confirmed Bill Williams fractal pivots and offset by the ` +
    `Wilder ATR multiplier.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineFractalKc = forwardRef<
  HTMLDivElement,
  ChartLineFractalKcProps
>(function ChartLineFractalKc(props, ref): ReactNode {
  const {
    data,
    atrLength = DEFAULT_CHART_LINE_FRACTAL_KC_ATR_LENGTH,
    fractalLookback = DEFAULT_CHART_LINE_FRACTAL_KC_FRACTAL_LOOKBACK,
    multiplier = DEFAULT_CHART_LINE_FRACTAL_KC_MULTIPLIER,
    width = DEFAULT_CHART_LINE_FRACTAL_KC_WIDTH,
    height = DEFAULT_CHART_LINE_FRACTAL_KC_HEIGHT,
    padding = DEFAULT_CHART_LINE_FRACTAL_KC_PADDING,
    tickCount = DEFAULT_CHART_LINE_FRACTAL_KC_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_FRACTAL_KC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FRACTAL_KC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FRACTAL_KC_PRICE_COLOR,
    upperColor = DEFAULT_CHART_LINE_FRACTAL_KC_UPPER_COLOR,
    lowerColor = DEFAULT_CHART_LINE_FRACTAL_KC_LOWER_COLOR,
    midColor = DEFAULT_CHART_LINE_FRACTAL_KC_MID_COLOR,
    upperFractalColor = DEFAULT_CHART_LINE_FRACTAL_KC_UPPER_FRACTAL_COLOR,
    lowerFractalColor = DEFAULT_CHART_LINE_FRACTAL_KC_LOWER_FRACTAL_COLOR,
    axisColor = DEFAULT_CHART_LINE_FRACTAL_KC_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_FRACTAL_KC_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showUpper = true,
    showLower = true,
    showMid = true,
    showFractalMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultPriceFormatter,
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
    () => getLineFractalKcFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineFractalKcLayout({
        data: cleaned,
        atrLength,
        fractalLookback,
        multiplier,
        width,
        height,
        padding,
      }),
    [
      cleaned,
      atrLength,
      fractalLookback,
      multiplier,
      width,
      height,
      padding,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineFractalKcSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineFractalKcSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineFractalKcSeriesId,
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
        data-section="chart-line-fractal-kc-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineFractalKcChart(cleaned, {
      atrLength,
      fractalLookback,
      multiplier,
    });

  const showPrice = !hidden.has('price');
  const showUpperLine = !hidden.has('upper') && showUpper;
  const showLowerLine = !hidden.has('lower') && showLower;
  const showMidLine = !hidden.has('mid') && showMid;

  const tickValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickValues.push(
      layout.yMin + ((layout.yMax - layout.yMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Fractal Keltner Channel chart'}
      aria-describedby={descId}
      data-section="chart-line-fractal-kc"
      data-atr-length={atrLength}
      data-fractal-lookback={fractalLookback}
      data-multiplier={multiplier}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-fractal-kc-title"
      >
        {ariaLabel ?? 'Fractal Keltner Channel chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-fractal-kc-aria-desc"
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
        data-section="chart-line-fractal-kc-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-fractal-kc-grid">
            {tickValues.map((v, i) => {
              const y =
                layout.innerBottom -
                ((v - layout.yMin) / (layout.yMax - layout.yMin)) *
                  (layout.innerBottom - layout.innerTop);
              return (
                <line
                  key={`grid-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-fractal-kc-grid-line"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-fractal-kc-axes">
            <line
              x1={layout.innerLeft}
              y1={layout.innerTop}
              x2={layout.innerLeft}
              y2={layout.innerBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.innerBottom}
              x2={layout.innerRight}
              y2={layout.innerBottom}
              stroke={axisColor}
            />
            {tickValues.map((v, i) => {
              const y =
                layout.innerBottom -
                ((v - layout.yMin) / (layout.yMax - layout.yMin)) *
                  (layout.innerBottom - layout.innerTop);
              return (
                <text
                  key={`tick-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-fractal-kc-tick"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showUpperLine ? (
          <path
            d={layout.upperPath}
            stroke={upperColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fractal-kc-upper"
          />
        ) : null}

        {showLowerLine ? (
          <path
            d={layout.lowerPath}
            stroke={lowerColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fractal-kc-lower"
          />
        ) : null}

        {showMidLine ? (
          <path
            d={layout.midPath}
            stroke={midColor}
            strokeDasharray="4 4"
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fractal-kc-mid"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-fractal-kc-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-fractal-kc-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-fractal-kc-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showFractalMarkers ? (
          <g data-section="chart-line-fractal-kc-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={dotRadius + 1}
                fill={
                  m.kind === 'upper-fractal'
                    ? upperFractalColor
                    : lowerFractalColor
                }
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onPointClick?.({ point: sample });
                }}
                data-section="chart-line-fractal-kc-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-fractal-kc-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.innerTop}
                width={10}
                height={layout.innerBottom - layout.innerTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-fractal-kc-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.innerTop + 8})`}
                data-section="chart-line-fractal-kc-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={190}
                  height={150}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-upper"
                >
                  upper{' '}
                  {tooltipSample.upper == null
                    ? '--'
                    : formatPrice(tooltipSample.upper)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-mid"
                >
                  mid{' '}
                  {tooltipSample.mid == null
                    ? '--'
                    : formatPrice(tooltipSample.mid)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-lower"
                >
                  lower{' '}
                  {tooltipSample.lower == null
                    ? '--'
                    : formatPrice(tooltipSample.lower)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-atr"
                >
                  atr{' '}
                  {tooltipSample.atr == null
                    ? '--'
                    : formatPrice(tooltipSample.atr)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-luf"
                >
                  lastUF{' '}
                  {tooltipSample.lastUpperFractal == null
                    ? '--'
                    : formatPrice(tooltipSample.lastUpperFractal)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-llf"
                >
                  lastLF{' '}
                  {tooltipSample.lastLowerFractal == null
                    ? '--'
                    : formatPrice(tooltipSample.lastLowerFractal)}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-fractal-kc-tooltip-cross"
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
          data-section="chart-line-fractal-kc-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          atrLength {atrLength} | lookback {fractalLookback} |{' '}
          multiplier {multiplier}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-fractal-kc-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
            flexWrap: 'wrap',
          }}
        >
          {(
            [
              { id: 'price' as const, color: priceColor, label: 'close' },
              { id: 'upper' as const, color: upperColor, label: 'upper' },
              { id: 'mid' as const, color: midColor, label: 'mid' },
              { id: 'lower' as const, color: lowerColor, label: 'lower' },
            ] satisfies Array<{
              id: ChartLineFractalKcSeriesId;
              color: string;
              label: string;
            }>
          ).map(({ id, color, label }) => (
            <button
              key={id}
              type="button"
              data-series-id={id}
              aria-pressed={!hidden.has(id)}
              onClick={() => handleLegendClick(id)}
              onKeyDown={(e) => handleLegendKey(e, id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                fontSize: 11,
                opacity: hidden.has(id) ? 0.4 : 1,
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
                  background: color,
                  borderRadius: 2,
                }}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});

ChartLineFractalKc.displayName = 'ChartLineFractalKc';
