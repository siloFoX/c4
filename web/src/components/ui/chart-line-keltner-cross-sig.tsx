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
 * ChartLineKeltnerCrossSig -- pure-SVG dual-panel chart with
 * the close + Keltner envelope in the top panel and the
 * (close - middle line) deviation oscillator in the bottom
 * panel, marking bullish / bearish close vs middle line cross
 * trigger events. Signal-cross variant of the Keltner Channel
 * family that flags adaptive volatility regime trigger events
 * distinct from envelope touches.
 *
 *   mid[i]    = EMA(close, length)
 *   TR[i]     = i == 0 ? 0 : |close[i] - close[i-1]|   (close-only)
 *   atr[i]    = Wilder smooth of TR over atrLength
 *   upper[i]  = mid + mult * atr
 *   lower[i]  = mid - mult * atr
 *   diff[i]   = close[i] - mid[i]
 *   bullish  : (close - mid) crosses up   (prev <= 0, cur > 0)
 *   bearish  : (close - mid) crosses down (prev >= 0, cur < 0)
 *
 * Defaults: `length = 20` (EMA window), `atrLength = 10` (ATR
 * window), `mult = 2`. Regime classifier `bullish` (close >
 * mid), `bearish` (close < mid), `neutral` (close === mid),
 * `none` (mid null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: EMA(K) collapses to K via the
 *   `min === max` precision short-circuit; TR = 0 every bar ->
 *   ATR = 0; upper = lower = K; close - mid = 0 every bar.
 *   diff = 0 -> regime `neutral`, cross count = 0. Verified
 *   across K = 0..1234.
 */

export interface ChartLineKeltnerCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineKeltnerCrossSigRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineKeltnerCrossSigSeriesId =
  | 'price'
  | 'middle'
  | 'upper'
  | 'lower';

export type ChartLineKeltnerCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineKeltnerCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineKeltnerCrossSigCrossKind;
}

export interface ChartLineKeltnerCrossSigSample {
  index: number;
  x: number;
  close: number;
  mid: number | null;
  upper: number | null;
  lower: number | null;
  diff: number | null;
  regime: ChartLineKeltnerCrossSigRegime;
}

export interface ChartLineKeltnerCrossSigRun {
  series: ChartLineKeltnerCrossSigPoint[];
  length: number;
  atrLength: number;
  mult: number;
  midValues: Array<number | null>;
  upperValues: Array<number | null>;
  lowerValues: Array<number | null>;
  diffValues: Array<number | null>;
  samples: ChartLineKeltnerCrossSigSample[];
  crosses: ChartLineKeltnerCrossSigCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineKeltnerCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKeltnerCrossSigLayout {
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
  priceDots: ChartLineKeltnerCrossSigDot[];
  midPath: string;
  upperPath: string;
  lowerPath: string;
  diffPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  zeroY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineKeltnerCrossSigCrossKind;
  }>;
  run: ChartLineKeltnerCrossSigRun;
}

export interface ChartLineKeltnerCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKeltnerCrossSigPoint[];
  length?: number;
  atrLength?: number;
  mult?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  midColor?: string;
  upperColor?: string;
  lowerColor?: string;
  diffColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMid?: boolean;
  showUpper?: boolean;
  showLower?: boolean;
  showDiff?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKeltnerCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineKeltnerCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKeltnerCrossSigSeriesId;
    hidden: boolean;
  }) => void;
  formatPrice?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_LENGTH = 20;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_ATR_LENGTH = 10;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_MULT = 2;
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_MID_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_UPPER_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_LOWER_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_DIFF_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_ZERO_LINE_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineKeltnerCrossSigFinitePoints(
  data: readonly ChartLineKeltnerCrossSigPoint[] | null | undefined,
): ChartLineKeltnerCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKeltnerCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineKeltnerCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite multiplier. */
export function normalizeLineKeltnerCrossSigMult(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0) return value;
  return fallback;
}

/** Wilder smoothing with CONST short-circuit. */
export function applyLineKeltnerCrossSigWilder(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (values.length < length) return out;
  let sum = 0;
  for (let i = 0; i < length; i += 1) sum += values[i]!;
  const seed = posZero(sum / length);
  out[length - 1] = seed;
  let prev = seed;
  for (let i = length; i < values.length; i += 1) {
    const v = values[i]!;
    const next =
      v === prev ? v : posZero((prev * (length - 1) + v) / length);
    out[i] = next;
    prev = next;
  }
  return out;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineKeltnerCrossSigEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);

  let seedSum = 0;
  let seedCount = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < values.length && seedCount < length; i += 1) {
    const v = values[i];
    if (v == null) {
      seedSum = 0;
      seedCount = 0;
      winMin = Infinity;
      winMax = -Infinity;
      continue;
    }
    seedSum += v;
    seedCount += 1;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
    if (seedCount === length) {
      const seed =
        winMin === winMax && Number.isFinite(winMin)
          ? winMin
          : posZero(seedSum / length);
      out[i] = seed;
      let prev = seed;
      for (let j = i + 1; j < values.length; j += 1) {
        const nv = values[j];
        if (nv == null) {
          break;
        }
        const next =
          nv === prev ? nv : posZero(alpha * nv + (1 - alpha) * prev);
        out[j] = next;
        prev = next;
      }
      break;
    }
  }
  return out;
}

export interface LineKeltnerCrossSigChannels {
  mid: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  diff: Array<number | null>;
}

export function computeLineKeltnerCrossSig(
  series: readonly ChartLineKeltnerCrossSigPoint[] | null | undefined,
  options: { length?: number; atrLength?: number; mult?: number } = {},
): LineKeltnerCrossSigChannels {
  const cleaned = getLineKeltnerCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { mid: [], upper: [], lower: [], diff: [] };
  }
  const length = normalizeLineKeltnerCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_LENGTH,
  );
  const atrLength = normalizeLineKeltnerCrossSigLength(
    options.atrLength,
    DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_ATR_LENGTH,
  );
  const mult = normalizeLineKeltnerCrossSigMult(
    options.mult,
    DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_MULT,
  );

  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const mid = applyLineKeltnerCrossSigEma(closes, length);

  const tr: number[] = new Array(closes.length).fill(0);
  for (let i = 1; i < cleaned.length; i += 1) {
    tr[i] = Math.abs(cleaned[i]!.close - cleaned[i - 1]!.close);
  }
  const atrFromIdx1 = applyLineKeltnerCrossSigWilder(tr.slice(1), atrLength);
  const atr: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < atrFromIdx1.length; i += 1) {
    atr[i + 1] = atrFromIdx1[i] ?? null;
  }

  const upper: Array<number | null> = new Array(closes.length).fill(null);
  const lower: Array<number | null> = new Array(closes.length).fill(null);
  const diff: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = 0; i < closes.length; i += 1) {
    const m = mid[i];
    const a = atr[i];
    if (m == null) continue;
    const ab = a == null ? 0 : a;
    upper[i] = posZero(m + mult * ab);
    lower[i] = posZero(m - mult * ab);
    diff[i] = posZero(cleaned[i]!.close - m);
  }

  return { mid, upper, lower, diff };
}

export function classifyLineKeltnerCrossSigRegime(
  diff: number | null,
): ChartLineKeltnerCrossSigRegime {
  if (diff == null) return 'none';
  if (diff > 0) return 'bullish';
  if (diff < 0) return 'bearish';
  return 'neutral';
}

export function detectLineKeltnerCrossSigCrosses(
  series: readonly ChartLineKeltnerCrossSigPoint[],
  diff: readonly (number | null)[],
): ChartLineKeltnerCrossSigCross[] {
  const out: ChartLineKeltnerCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = diff[i - 1];
    const cur = diff[i];
    if (prev == null || cur == null) continue;
    if (prev <= 0 && cur > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= 0 && cur < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineKeltnerCrossSig(
  data: ChartLineKeltnerCrossSigPoint[],
  options: { length?: number; atrLength?: number; mult?: number } = {},
): ChartLineKeltnerCrossSigRun {
  const cleaned = getLineKeltnerCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineKeltnerCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_LENGTH,
  );
  const atrLength = normalizeLineKeltnerCrossSigLength(
    options.atrLength,
    DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_ATR_LENGTH,
  );
  const mult = normalizeLineKeltnerCrossSigMult(
    options.mult,
    DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_MULT,
  );

  const channels = computeLineKeltnerCrossSig(series, {
    length,
    atrLength,
    mult,
  });

  const samples: ChartLineKeltnerCrossSigSample[] = series.map((p, i) => {
    const d = channels.diff[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      mid: channels.mid[i] ?? null,
      upper: channels.upper[i] ?? null,
      lower: channels.lower[i] ?? null,
      diff: d,
      regime: classifyLineKeltnerCrossSigRegime(d),
    };
  });

  const crosses = detectLineKeltnerCrossSigCrosses(series, channels.diff);

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > length;

  return {
    series = [],
    length,
    atrLength,
    mult,
    midValues: channels.mid,
    upperValues: channels.upper,
    lowerValues: channels.lower,
    diffValues: channels.diff,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineKeltnerCrossSigLayoutOptions {
  data: ChartLineKeltnerCrossSigPoint[];
  length?: number;
  atrLength?: number;
  mult?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineKeltnerCrossSigLayout(
  opts: ComputeLineKeltnerCrossSigLayoutOptions,
): ChartLineKeltnerCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_PANEL_GAP;

  const run = runLineKeltnerCrossSig(opts.data, {
    length: opts.length ?? undefined,
    atrLength: opts.atrLength ?? undefined,
    mult: opts.mult ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
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
      pricePath: '',
      priceDots: [],
      midPath: '',
      upperPath: '',
      lowerPath: '',
      diffPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
      zeroY: oscBottom,
      crossMarkers: [],
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.close < priceMin) priceMin = s.close;
    if (s.close > priceMax) priceMax = s.close;
    if (s.upper != null && s.upper > priceMax) priceMax = s.upper;
    if (s.lower != null && s.lower < priceMin) priceMin = s.lower;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.diff != null) {
      if (s.diff < oscMin) oscMin = s.diff;
      if (s.diff > oscMax) oscMax = s.diff;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  const zeroY = syOsc(0);

  let pricePath = '';
  const priceDots: ChartLineKeltnerCrossSigDot[] = [];
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

  const buildPath = (
    accessor: (s: ChartLineKeltnerCrossSigSample) => number | null,
    syFn: (y: number) => number,
  ): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = accessor(s);
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syFn(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const midPath = buildPath((s) => s.mid, syPrice);
  const upperPath = buildPath((s) => s.upper, syPrice);
  const lowerPath = buildPath((s) => s.lower, syPrice);
  const diffPath = buildPath((s) => s.diff, syOsc);

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOsc(run.diffValues[c.index] ?? 0);
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
    };
  });

  return {
    ok: true,
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
    pricePath: pricePath.trim(),
    priceDots,
    midPath,
    upperPath,
    lowerPath,
    diffPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineKeltnerCrossSigChart(
  data: ChartLineKeltnerCrossSigPoint[],
  options: { length?: number; atrLength?: number; mult?: number } = {},
): string {
  const cleaned = getLineKeltnerCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineKeltnerCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_LENGTH,
  );
  const atrLength = normalizeLineKeltnerCrossSigLength(
    options.atrLength,
    DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_ATR_LENGTH,
  );
  const mult = normalizeLineKeltnerCrossSigMult(
    options.mult,
    DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_MULT,
  );
  return (
    `Keltner Cross Signal chart over ${cleaned.length} bars ` +
    `(length ${length}, atrLength ${atrLength}, mult ${mult}). ` +
    `Top panel renders the close + upper / middle / lower ` +
    `Keltner Channel with bullish / bearish arrow overlays at ` +
    `every close vs middle line cross; bottom panel renders the ` +
    `(close - middle) deviation oscillator centered on zero and ` +
    `marks adaptive volatility regime trigger events.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string =>
  formatNumber(value, 2);
const defaultOscFormatter = (value: number): string => formatNumber(value, 2);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineKeltnerCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineKeltnerCrossSigProps
>(function ChartLineKeltnerCrossSig(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_LENGTH,
    atrLength = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_ATR_LENGTH,
    mult = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_MULT,
    width = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_PRICE_COLOR,
    midColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_MID_COLOR,
    upperColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_UPPER_COLOR,
    lowerColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_LOWER_COLOR,
    diffColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_DIFF_COLOR,
    bullishColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_KELTNER_CROSS_SIG_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMid = true,
    showUpper = true,
    showLower = true,
    showDiff = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    formatPrice = defaultPriceFormatter,
    formatOsc = defaultOscFormatter,
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
    () => getLineKeltnerCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineKeltnerCrossSigLayout({
        data: cleaned,
        length,
        atrLength,
        mult,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      atrLength,
      mult,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineKeltnerCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineKeltnerCrossSigSeriesId,
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
    seriesId: ChartLineKeltnerCrossSigSeriesId,
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
        data-section="chart-line-keltner-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineKeltnerCrossSigChart(cleaned, {
      length,
      atrLength,
      mult,
    });

  const showPrice = !hidden.has('price');
  const showMidLine = !hidden.has('middle') && showMid;
  const showUpperLine = !hidden.has('upper') && showUpper;
  const showLowerLine = !hidden.has('lower') && showLower;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'Keltner Cross Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-keltner-cross-sig"
      data-length={length}
      data-atr-length={atrLength}
      data-mult={mult}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-keltner-cross-sig-title"
      >
        {ariaLabel ?? 'Keltner Cross Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-keltner-cross-sig-aria-desc"
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
        data-section="chart-line-keltner-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-keltner-cross-sig-grid">
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
                  data-section="chart-line-keltner-cross-sig-grid-line-price"
                />
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <line
                  key={`grid-osc-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-keltner-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-keltner-cross-sig-axes">
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
              y1={layout.oscTop}
              x2={layout.innerLeft}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oscBottom}
              x2={layout.innerRight}
              y2={layout.oscBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroLineColor}
              strokeDasharray="4 4"
              data-section="chart-line-keltner-cross-sig-zero-line"
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
                  data-section="chart-line-keltner-cross-sig-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickOscValues.map((v, i) => {
              const y =
                layout.oscBottom -
                ((v - layout.oscMin) /
                  (layout.oscMax - layout.oscMin)) *
                  (layout.oscBottom - layout.oscTop);
              return (
                <text
                  key={`tick-osc-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-keltner-cross-sig-tick-osc"
                >
                  {formatOsc(v)}
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
            data-section="chart-line-keltner-cross-sig-upper-path"
          />
        ) : null}

        {showLowerLine ? (
          <path
            d={layout.lowerPath}
            stroke={lowerColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-keltner-cross-sig-lower-path"
          />
        ) : null}

        {showMidLine ? (
          <path
            d={layout.midPath}
            stroke={midColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-keltner-cross-sig-mid-path"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-keltner-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-keltner-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-keltner-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showDiff ? (
          <path
            d={layout.diffPath}
            stroke={diffColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-keltner-cross-sig-diff-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-keltner-cross-sig-crosses"
            role="group"
            aria-label="cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <circle
                key={`cross-osc-${m.index}`}
                cx={m.cx}
                cy={m.cyOsc}
                r={4}
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} cross at ${formatX(m.x)}`}
                data-section={`chart-line-keltner-cross-sig-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-keltner-cross-sig-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                    : `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-keltner-cross-sig-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-keltner-cross-sig-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.oscBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-keltner-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-keltner-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={224}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-keltner-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-keltner-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-keltner-cross-sig-tooltip-upper"
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
                  data-section="chart-line-keltner-cross-sig-tooltip-mid"
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
                  data-section="chart-line-keltner-cross-sig-tooltip-lower"
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
                  data-section="chart-line-keltner-cross-sig-tooltip-diff"
                >
                  diff{' '}
                  {tooltipSample.diff == null
                    ? '--'
                    : formatOsc(tooltipSample.diff)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-keltner-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-keltner-cross-sig-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-keltner-cross-sig-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | crosses{' '}
                  {layout.run.crosses.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-keltner-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | atr {atrLength} | mult {mult} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-keltner-cross-sig-legend"
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
              { id: 'middle' as const, color: midColor, label: 'mid' },
              { id: 'upper' as const, color: upperColor, label: 'upper' },
              { id: 'lower' as const, color: lowerColor, label: 'lower' },
            ] satisfies Array<{
              id: ChartLineKeltnerCrossSigSeriesId;
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

ChartLineKeltnerCrossSig.displayName = 'ChartLineKeltnerCrossSig';
