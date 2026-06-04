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
 * ChartLineSmiDouble -- pure-SVG dual-panel chart with the close on
 * top and a doubly smoothed Stochastic Momentum Index (Blau-style)
 * panel on the bottom.
 *
 *   highestHigh[i] = max(high[i - length + 1 .. i])
 *   lowestLow[i]   = min(low[i - length + 1 .. i])
 *   midpoint[i]    = (highestHigh[i] + lowestLow[i]) / 2
 *   range[i]       = highestHigh[i] - lowestLow[i]
 *   centered[i]    = close[i] - midpoint[i]
 *   numerEMA[i]    = EMA(EMA(centered, smoothLength1), smoothLength2)[i]
 *   denomEMA[i]    = EMA(EMA(range,    smoothLength1), smoothLength2)[i]
 *   smi[i]         = denomEMA[i] === 0
 *                      ? null
 *                      : (numerEMA[i] / (denomEMA[i] / 2)) * 100
 *
 * `smi[i]` is `null` during the combined warmup
 * (`length - 1 + smoothLength1 - 1 + smoothLength2 - 1`) and propagates
 * `null` whenever the EMA seed cannot be formed. Output is bounded
 * in `[-100, 100]` for well-defined inputs.
 *
 * Bit-exact anchors:
 * - **CONST high=low=close=K**: `range = 0` for every window, so
 *   `denomEMA = 0` and the divide-by-zero guard returns `null`
 *   everywhere post-warmup. Verified across `K` and parameter sweeps.
 * - **LINEAR UP** (`close[i] = i + 1`, `high = low = close`): every
 *   defined `centered = (length - 1) / 2`, `range = length - 1`, the
 *   ratio `centered / (range / 2)` collapses to `1`, and `smi = 100`
 *   bit-exact. The EMA CONST short-circuit preserves the constant
 *   through both smoothing passes.
 * - **LINEAR DOWN** (`close[i] = N - i`): symmetric -> `smi = -100`
 *   bit-exact.
 */

export interface ChartLineSmiDoublePoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineSmiDoubleZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineSmiDoubleCross = 'up' | 'down' | null;

export type ChartLineSmiDoubleSeriesId = 'price' | 'smi';

export interface ChartLineSmiDoubleSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  highestHigh: number | null;
  lowestLow: number | null;
  centered: number | null;
  range: number | null;
  smi: number | null;
  zone: ChartLineSmiDoubleZone;
  crossed: ChartLineSmiDoubleCross;
}

export interface ChartLineSmiDoubleRun {
  series: ChartLineSmiDoublePoint[];
  length: number;
  smoothLength1: number;
  smoothLength2: number;
  overbought: number;
  oversold: number;
  highestHighValues: Array<number | null>;
  lowestLowValues: Array<number | null>;
  centeredValues: Array<number | null>;
  rangeValues: Array<number | null>;
  smiValues: Array<number | null>;
  samples: ChartLineSmiDoubleSample[];
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineSmiDoubleMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  smi: number;
  crossed: 'up' | 'down';
}

export interface ChartLineSmiDoubleDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSmiDoubleLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  smiTop: number;
  smiBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineSmiDoubleDot[];
  smiPath: string;
  overboughtY: number;
  oversoldY: number;
  midlineY: number;
  markers: ChartLineSmiDoubleMarker[];
  priceMin: number;
  priceMax: number;
  smiMin: number;
  smiMax: number;
  run: ChartLineSmiDoubleRun;
}

export interface ChartLineSmiDoubleProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSmiDoublePoint[];
  length?: number;
  smoothLength1?: number;
  smoothLength2?: number;
  overbought?: number;
  oversold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  smiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  midlineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSmi?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSmiDoubleSeriesId[];
  defaultHiddenSeries?: ChartLineSmiDoubleSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSmiDoubleSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineSmiDoubleSample }) => void;
  formatPrice?: (value: number) => string;
  formatSmi?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SMI_DOUBLE_WIDTH = 720;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_PADDING = 44;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_LENGTH = 10;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_1 = 3;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_2 = 3;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_OVERBOUGHT = 40;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_OVERSOLD = -40;
export const DEFAULT_CHART_LINE_SMI_DOUBLE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SMI_DOUBLE_SMI_COLOR = '#db2777';
export const DEFAULT_CHART_LINE_SMI_DOUBLE_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SMI_DOUBLE_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SMI_DOUBLE_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_SMI_DOUBLE_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_SMI_DOUBLE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SMI_DOUBLE_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite OHLC fields. */
export function getLineSmiDoubleFinitePoints(
  data: readonly ChartLineSmiDoublePoint[] | null | undefined,
): ChartLineSmiDoublePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSmiDoublePoint[] = [];
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
export function normalizeLineSmiDoubleLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer smooth length (>= 1). */
export function normalizeLineSmiDoubleSmoothLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a threshold value in `[-100, 100]`. */
export function normalizeLineSmiDoubleThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= -100 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** Rolling max over a window of length bars. */
export function applyLineSmiDoubleRollingMax(
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
    let hi = -Infinity;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v > hi) hi = v;
    }
    out.push(ok && Number.isFinite(hi) ? hi : null);
  }
  return out;
}

/** Rolling min over a window of length bars. */
export function applyLineSmiDoubleRollingMin(
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
    let lo = Infinity;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v < lo) lo = v;
    }
    out.push(ok && Number.isFinite(lo) ? lo : null);
  }
  return out;
}

/**
 * SMA-seeded EMA with CONST short-circuit. Null inputs reset the
 * seed (a fresh SMA accumulation must complete before EMA resumes).
 */
export function applyLineSmiDoubleEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
  let ema: number | null = null;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      ema = null;
      sum = 0;
      count = 0;
      continue;
    }
    if (ema == null) {
      sum += v;
      count += 1;
      if (count >= length) {
        ema = sum / length;
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

export interface LineSmiDoubleChannels {
  highestHigh: Array<number | null>;
  lowestLow: Array<number | null>;
  centered: Array<number | null>;
  range: Array<number | null>;
  numerSmoothed: Array<number | null>;
  denomSmoothed: Array<number | null>;
  smi: Array<number | null>;
}

/** Compute the full SMI Double pipeline. */
export function computeLineSmiDouble(
  series: readonly ChartLineSmiDoublePoint[] | null | undefined,
  options: {
    length?: number;
    smoothLength1?: number;
    smoothLength2?: number;
  } = {},
): LineSmiDoubleChannels {
  const cleaned = getLineSmiDoubleFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      highestHigh: [],
      lowestLow: [],
      centered: [],
      range: [],
      numerSmoothed: [],
      denomSmoothed: [],
      smi: [],
    };
  }
  const length = normalizeLineSmiDoubleLength(
    options.length,
    DEFAULT_CHART_LINE_SMI_DOUBLE_LENGTH,
  );
  const smoothLength1 = normalizeLineSmiDoubleSmoothLength(
    options.smoothLength1,
    DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_1,
  );
  const smoothLength2 = normalizeLineSmiDoubleSmoothLength(
    options.smoothLength2,
    DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_2,
  );

  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  const closes = cleaned.map((p) => p.close);

  const highestHigh = applyLineSmiDoubleRollingMax(highs, length);
  const lowestLow = applyLineSmiDoubleRollingMin(lows, length);
  const centered: Array<number | null> = [];
  const range: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const hh = highestHigh[i];
    const ll = lowestLow[i];
    if (hh == null || ll == null) {
      centered.push(null);
      range.push(null);
      continue;
    }
    const mid = (hh + ll) / 2;
    centered.push(posZero(closes[i]! - mid));
    range.push(posZero(hh - ll));
  }

  const numer1 = applyLineSmiDoubleEma(centered, smoothLength1);
  const numerSmoothed = applyLineSmiDoubleEma(numer1, smoothLength2);
  const denom1 = applyLineSmiDoubleEma(range, smoothLength1);
  const denomSmoothed = applyLineSmiDoubleEma(denom1, smoothLength2);

  const smi: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const numer = numerSmoothed[i];
    const denom = denomSmoothed[i];
    if (numer == null || denom == null) {
      smi.push(null);
      continue;
    }
    if (denom === 0) {
      smi.push(null);
      continue;
    }
    const raw = (numer / (denom / 2)) * 100;
    if (!Number.isFinite(raw)) {
      smi.push(null);
      continue;
    }
    smi.push(posZero(raw));
  }

  return {
    highestHigh,
    lowestLow,
    centered,
    range,
    numerSmoothed,
    denomSmoothed,
    smi,
  };
}

export function classifyLineSmiDoubleZone(
  value: number | null,
  overbought: number,
  oversold: number,
): ChartLineSmiDoubleZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= overbought) return 'overbought';
  if (value <= oversold) return 'oversold';
  return 'neutral';
}

export function detectLineSmiDoubleCrosses(
  values: readonly (number | null)[],
  overbought: number,
  oversold: number,
): ChartLineSmiDoubleCross[] {
  const out: ChartLineSmiDoubleCross[] = [];
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
    if (prev < overbought && v >= overbought) {
      out.push('up');
    } else if (prev > oversold && v <= oversold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineSmiDouble(
  data: ChartLineSmiDoublePoint[],
  options: {
    length?: number;
    smoothLength1?: number;
    smoothLength2?: number;
    overbought?: number;
    oversold?: number;
  } = {},
): ChartLineSmiDoubleRun {
  const cleaned = getLineSmiDoubleFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineSmiDoubleLength(
    options.length,
    DEFAULT_CHART_LINE_SMI_DOUBLE_LENGTH,
  );
  const smoothLength1 = normalizeLineSmiDoubleSmoothLength(
    options.smoothLength1,
    DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_1,
  );
  const smoothLength2 = normalizeLineSmiDoubleSmoothLength(
    options.smoothLength2,
    DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_2,
  );
  const overbought = normalizeLineSmiDoubleThreshold(
    options.overbought,
    DEFAULT_CHART_LINE_SMI_DOUBLE_OVERBOUGHT,
  );
  const oversold = normalizeLineSmiDoubleThreshold(
    options.oversold,
    DEFAULT_CHART_LINE_SMI_DOUBLE_OVERSOLD,
  );

  const channels = computeLineSmiDouble(series, {
    length,
    smoothLength1,
    smoothLength2,
  });
  const crosses = detectLineSmiDoubleCrosses(
    channels.smi,
    overbought,
    oversold,
  );

  const samples: ChartLineSmiDoubleSample[] = series.map((p, i) => {
    const hh = channels.highestHigh[i] ?? null;
    const ll = channels.lowestLow[i] ?? null;
    const c = channels.centered[i] ?? null;
    const r = channels.range[i] ?? null;
    const smi = channels.smi[i] ?? null;
    const zone = classifyLineSmiDoubleZone(smi, overbought, oversold);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      highestHigh: hh,
      lowestLow: ll,
      centered: c,
      range: r,
      smi,
      zone,
      crossed,
    };
  });

  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'overbought') overboughtCount += 1;
    else if (s.zone === 'oversold') oversoldCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length >= length + smoothLength1 + smoothLength2 - 2;

  return {
    series,
    length,
    smoothLength1,
    smoothLength2,
    overbought,
    oversold,
    highestHighValues: channels.highestHigh,
    lowestLowValues: channels.lowestLow,
    centeredValues: channels.centered,
    rangeValues: channels.range,
    smiValues: channels.smi,
    samples,
    overboughtCount,
    oversoldCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineSmiDoubleLayoutOptions {
  data: ChartLineSmiDoublePoint[];
  length?: number;
  smoothLength1?: number;
  smoothLength2?: number;
  overbought?: number;
  oversold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineSmiDoubleLayout(
  opts: ComputeLineSmiDoubleLayoutOptions,
): ChartLineSmiDoubleLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_SMI_DOUBLE_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_SMI_DOUBLE_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_SMI_DOUBLE_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_SMI_DOUBLE_PANEL_GAP;

  const run = runLineSmiDouble(opts.data, {
    length: opts.length ?? undefined,
    smoothLength1: opts.smoothLength1 ?? undefined,
    smoothLength2: opts.smoothLength2 ?? undefined,
    overbought: opts.overbought ?? undefined,
    oversold: opts.oversold ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const smiTop = priceBottom + panelGap;
  const smiBottom = priceBottom + panelGap + usable * 0.45;

  const smiMin = -100;
  const smiMax = 100;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      smiTop,
      smiBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      smiPath: '',
      overboughtY: smiTop,
      oversoldY: smiBottom,
      midlineY: (smiTop + smiBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      smiMin,
      smiMax,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.low < priceMin) priceMin = s.low;
    if (s.high > priceMax) priceMax = s.high;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const sySmi = (y: number): number =>
    smiBottom - ((y - smiMin) / (smiMax - smiMin)) * (smiBottom - smiTop);

  let pricePath = '';
  const priceDots: ChartLineSmiDoubleDot[] = [];
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

  let smiPath = '';
  let firstS = true;
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s || s.smi == null) {
      firstS = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = sySmi(s.smi);
    smiPath += `${firstS ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstS = false;
  }

  const markers: ChartLineSmiDoubleMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.smi == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: sySmi(s.smi),
      close: s.close,
      smi: s.smi,
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
    smiTop,
    smiBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    smiPath: smiPath.trim(),
    overboughtY: sySmi(run.overbought),
    oversoldY: sySmi(run.oversold),
    midlineY: sySmi(0),
    markers,
    priceMin,
    priceMax,
    smiMin,
    smiMax,
    run,
  };
}

export function describeLineSmiDoubleChart(
  data: ChartLineSmiDoublePoint[],
  options: {
    length?: number;
    smoothLength1?: number;
    smoothLength2?: number;
    overbought?: number;
    oversold?: number;
  } = {},
): string {
  const cleaned = getLineSmiDoubleFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineSmiDoubleLength(
    options.length,
    DEFAULT_CHART_LINE_SMI_DOUBLE_LENGTH,
  );
  const smoothLength1 = normalizeLineSmiDoubleSmoothLength(
    options.smoothLength1,
    DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_1,
  );
  const smoothLength2 = normalizeLineSmiDoubleSmoothLength(
    options.smoothLength2,
    DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_2,
  );
  const overbought = normalizeLineSmiDoubleThreshold(
    options.overbought,
    DEFAULT_CHART_LINE_SMI_DOUBLE_OVERBOUGHT,
  );
  const oversold = normalizeLineSmiDoubleThreshold(
    options.oversold,
    DEFAULT_CHART_LINE_SMI_DOUBLE_OVERSOLD,
  );
  return (
    `Double-smoothed SMI chart over ${cleaned.length} bars ` +
    `(length ${length}, smoothLength1 ${smoothLength1}, ` +
    `smoothLength2 ${smoothLength2}, overbought ${overbought}, ` +
    `oversold ${oversold}). Top panel renders the close; bottom ` +
    `panel renders the doubly EMA-smoothed Stochastic Momentum Index.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultSmiFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineSmiDouble = forwardRef<
  HTMLDivElement,
  ChartLineSmiDoubleProps
>(function ChartLineSmiDouble(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_SMI_DOUBLE_LENGTH,
    smoothLength1 = DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_1,
    smoothLength2 = DEFAULT_CHART_LINE_SMI_DOUBLE_SMOOTH_LENGTH_2,
    overbought = DEFAULT_CHART_LINE_SMI_DOUBLE_OVERBOUGHT,
    oversold = DEFAULT_CHART_LINE_SMI_DOUBLE_OVERSOLD,
    width = DEFAULT_CHART_LINE_SMI_DOUBLE_WIDTH,
    height = DEFAULT_CHART_LINE_SMI_DOUBLE_HEIGHT,
    padding = DEFAULT_CHART_LINE_SMI_DOUBLE_PADDING,
    panelGap = DEFAULT_CHART_LINE_SMI_DOUBLE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SMI_DOUBLE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SMI_DOUBLE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SMI_DOUBLE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SMI_DOUBLE_PRICE_COLOR,
    smiColor = DEFAULT_CHART_LINE_SMI_DOUBLE_SMI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_SMI_DOUBLE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_SMI_DOUBLE_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_SMI_DOUBLE_THRESHOLD_COLOR,
    midlineColor = DEFAULT_CHART_LINE_SMI_DOUBLE_MIDLINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_SMI_DOUBLE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SMI_DOUBLE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSmi = true,
    showMarkers = true,
    showThresholds = true,
    showMidline = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultPriceFormatter,
    formatSmi = defaultSmiFormatter,
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
    () => getLineSmiDoubleFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineSmiDoubleLayout({
        data: cleaned,
        length,
        smoothLength1,
        smoothLength2,
        overbought,
        oversold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      smoothLength1,
      smoothLength2,
      overbought,
      oversold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineSmiDoubleSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineSmiDoubleSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineSmiDoubleSeriesId,
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
        data-section="chart-line-smi-double-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineSmiDoubleChart(cleaned, {
      length,
      smoothLength1,
      smoothLength2,
      overbought,
      oversold,
    });

  const showPrice = !hidden.has('price');
  const showSmiLine = !hidden.has('smi') && showSmi;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickSmiValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickSmiValues.push(
      layout.smiMin + ((layout.smiMax - layout.smiMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Double SMI chart'}
      aria-describedby={descId}
      data-section="chart-line-smi-double"
      data-length={length}
      data-smooth-length-1={smoothLength1}
      data-smooth-length-2={smoothLength2}
      data-overbought={overbought}
      data-oversold={oversold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-smi-double-title"
      >
        {ariaLabel ?? 'Double SMI chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-smi-double-aria-desc"
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
        data-section="chart-line-smi-double-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-smi-double-grid">
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
                  data-section="chart-line-smi-double-grid-line-price"
                />
              );
            })}
            {tickSmiValues.map((v, i) => {
              const y =
                layout.smiBottom -
                ((v - layout.smiMin) /
                  (layout.smiMax - layout.smiMin)) *
                  (layout.smiBottom - layout.smiTop);
              return (
                <line
                  key={`grid-smi-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-smi-double-grid-line-smi"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-smi-double-axes">
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
              y1={layout.smiTop}
              x2={layout.innerLeft}
              y2={layout.smiBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.smiBottom}
              x2={layout.innerRight}
              y2={layout.smiBottom}
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
                  data-section="chart-line-smi-double-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickSmiValues.map((v, i) => {
              const y =
                layout.smiBottom -
                ((v - layout.smiMin) /
                  (layout.smiMax - layout.smiMin)) *
                  (layout.smiBottom - layout.smiTop);
              return (
                <text
                  key={`tick-smi-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-smi-double-tick-smi"
                >
                  {formatSmi(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showMidline ? (
          <line
            x1={layout.innerLeft}
            y1={layout.midlineY}
            x2={layout.innerRight}
            y2={layout.midlineY}
            stroke={midlineColor}
            strokeDasharray="2 4"
            data-section="chart-line-smi-double-midline"
          />
        ) : null}

        {showThresholds ? (
          <g data-section="chart-line-smi-double-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.overboughtY}
              x2={layout.innerRight}
              y2={layout.overboughtY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-smi-double-overbought-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oversoldY}
              x2={layout.innerRight}
              y2={layout.oversoldY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-smi-double-oversold-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-smi-double-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-smi-double-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-smi-double-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSmiLine ? (
          <path
            d={layout.smiPath}
            stroke={smiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-smi-double-line"
          />
        ) : null}

        {showMarkers && showSmiLine ? (
          <g data-section="chart-line-smi-double-markers">
            {layout.markers.map((m) => (
              <circle
                key={`smi-marker-${m.index}`}
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
                data-section="chart-line-smi-double-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-smi-double-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.smiBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-smi-double-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-smi-double-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={130}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-smi-double-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-smi-double-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-smi-double-tooltip-hh"
                >
                  hh{' '}
                  {tooltipSample.highestHigh == null
                    ? '--'
                    : formatPrice(tooltipSample.highestHigh)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-smi-double-tooltip-ll"
                >
                  ll{' '}
                  {tooltipSample.lowestLow == null
                    ? '--'
                    : formatPrice(tooltipSample.lowestLow)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-smi-double-tooltip-centered"
                >
                  centered{' '}
                  {tooltipSample.centered == null
                    ? '--'
                    : formatPrice(tooltipSample.centered)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-smi-double-tooltip-range"
                >
                  range{' '}
                  {tooltipSample.range == null
                    ? '--'
                    : formatPrice(tooltipSample.range)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-smi-double-tooltip-smi"
                >
                  smi{' '}
                  {tooltipSample.smi == null
                    ? '--'
                    : formatSmi(tooltipSample.smi)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-smi-double-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-smi-double-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | smooth1 {smoothLength1} | smooth2{' '}
          {smoothLength2} | OB {overbought} | OS {oversold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-smi-double-legend"
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
            data-series-id="smi"
            aria-pressed={!hidden.has('smi')}
            onClick={() => handleLegendClick('smi')}
            onKeyDown={(e) => handleLegendKey(e, 'smi')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('smi') ? 0.4 : 1,
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
                background: smiColor,
                borderRadius: 2,
              }}
            />
            smi
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSmiDouble.displayName = 'ChartLineSmiDouble';
