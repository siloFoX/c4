import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_STC_WIDTH = 560;
export const DEFAULT_CHART_LINE_STC_HEIGHT = 360;
export const DEFAULT_CHART_LINE_STC_PADDING = 40;
export const DEFAULT_CHART_LINE_STC_GAP = 26;
export const DEFAULT_CHART_LINE_STC_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_STC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STC_FAST_PERIOD = 23;
export const DEFAULT_CHART_LINE_STC_SLOW_PERIOD = 50;
export const DEFAULT_CHART_LINE_STC_CYCLE_PERIOD = 10;
export const DEFAULT_CHART_LINE_STC_FACTOR = 0.5;
export const DEFAULT_CHART_LINE_STC_UPPER_THRESHOLD = 75;
export const DEFAULT_CHART_LINE_STC_LOWER_THRESHOLD = 25;
export const DEFAULT_CHART_LINE_STC_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_STC_STC_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STC_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STC_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STC_AXIS_COLOR = '#cbd5e1';

export type ChartLineStcZone = 'overbought' | 'oversold' | 'neutral';

export interface ChartLineStcPoint {
  x: number;
  value: number;
}

export interface ChartLineStcSample {
  index: number;
  x: number;
  value: number;
  macd: number | null;
  stc: number | null;
  zone: ChartLineStcZone;
}

export interface ChartLineStcRun {
  series: ChartLineStcPoint[];
  fastPeriod: number;
  slowPeriod: number;
  cyclePeriod: number;
  factor: number;
  upperThreshold: number;
  lowerThreshold: number;
  macd: (number | null)[];
  stc: (number | null)[];
  samples: ChartLineStcSample[];
  stcFinal: number;
  stcMin: number;
  stcMax: number;
  overboughtCount: number;
  oversoldCount: number;
  ok: boolean;
}

export interface ChartLineStcPriceDot {
  index: number;
  x: number;
  value: number;
  macd: number | null;
  stc: number | null;
  zone: ChartLineStcZone;
  px: number;
  py: number;
}

export interface ChartLineStcMarker {
  index: number;
  x: number;
  stc: number;
  zone: ChartLineStcZone;
  px: number;
  py: number;
}

export interface ChartLineStcPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineStcRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineStcLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineStcPanel;
  stcPanel: ChartLineStcPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  stcYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  pricePath: string;
  priceDots: ChartLineStcPriceDot[];
  stcPath: string;
  markers: ChartLineStcMarker[];
  overboughtRect: ChartLineStcRect;
  oversoldRect: ChartLineStcRect;
  upperY: number;
  lowerY: number;
  fastPeriod: number;
  slowPeriod: number;
  cyclePeriod: number;
  factor: number;
  upperThreshold: number;
  lowerThreshold: number;
  stcFinal: number;
  stcMin: number;
  stcMax: number;
  overboughtCount: number;
  oversoldCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineStcLayoutOptions {
  data: readonly ChartLineStcPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  cyclePeriod?: number;
  factor?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
}

export interface ChartLineStcProps {
  data: readonly ChartLineStcPoint[];
  fastPeriod?: number;
  slowPeriod?: number;
  cyclePeriod?: number;
  factor?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  stcColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStc?: boolean;
  showZones?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineStcPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function isDefined(v: number | null | undefined): v is number {
  return v !== null && v !== undefined;
}

export function getLineStcFinitePoints(
  points: readonly ChartLineStcPoint[] | null | undefined,
): ChartLineStcPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineStcPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineStcPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * An exponential moving average over `period` values, tolerating
 * leading `null` placeholders. The seed is the simple mean of the
 * first `period` defined values placed at that value's index; each
 * later defined value folds in at weight `2 / (period + 1)`.
 */
export function computeLineStcEma(
  src: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  const idx: number[] = [];
  for (let i = 0; i < n; i += 1) {
    if (isDefined(src[i])) idx.push(i);
  }
  if (idx.length < p) return out;
  const mult = 2 / (p + 1);
  let sum = 0;
  for (let k = 0; k < p; k += 1) sum += src[idx[k]!] as number;
  let ema = sum / p;
  out[idx[p - 1]!] = ema;
  for (let k = p; k < idx.length; k += 1) {
    const i = idx[k]!;
    ema = (src[i] as number) * mult + ema * (1 - mult);
    out[i] = ema;
  }
  return out;
}

/**
 * The MACD line: the difference between a fast and a slow EMA of the
 * value series. Defined only where both EMAs are defined.
 */
export function computeLineStcMacd(
  values: readonly number[] | null | undefined,
  fastPeriod: number,
  slowPeriod: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const fast = computeLineStcEma(values, fastPeriod);
  const slow = computeLineStcEma(values, slowPeriod);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const f = fast[i];
    const s = slow[i];
    if (isDefined(f) && isDefined(s)) {
      const raw = f - s;
      out[i] = raw === 0 ? 0 : raw;
    }
  }
  return out;
}

/**
 * The raw stochastic %K of a series over `cyclePeriod`: each value's
 * position within the window's high-low range, scaled 0-100. A flat
 * window (zero range) reads the neutral 50; results are clamped to
 * [0, 100].
 */
export function computeLineStcStochK(
  src: readonly (number | null)[] | null | undefined,
  cyclePeriod: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const p = cyclePeriod < 1 ? 1 : Math.floor(cyclePeriod);
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = p - 1; i < n; i += 1) {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    let valid = true;
    for (let k = 0; k < p; k += 1) {
      const v = src[i - k];
      if (!isDefined(v)) {
        valid = false;
        break;
      }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!valid) continue;
    const range = hi - lo;
    let k = range === 0 ? 50 : (100 * ((src[i] as number) - lo)) / range;
    if (k < 0) k = 0;
    if (k > 100) k = 100;
    out[i] = k === 0 ? 0 : k;
  }
  return out;
}

/**
 * The Schaff modified-EMA smoother: `out[i] = out[i-1] + factor *
 * (src[i] - out[i-1])`, seeded with the first defined value.
 * Tolerates leading `null` placeholders.
 */
export function computeLineStcSmooth(
  src: readonly (number | null)[] | null | undefined,
  factor: number,
): (number | null)[] {
  if (!Array.isArray(src)) return [];
  const n = src.length;
  const f = isFiniteNumber(factor) && factor > 0 && factor <= 1 ? factor : 0.5;
  const out: (number | null)[] = new Array(n).fill(null);
  let prev: number | null = null;
  for (let i = 0; i < n; i += 1) {
    const v = src[i];
    if (!isDefined(v)) continue;
    prev = prev === null ? v : prev + f * (v - prev);
    out[i] = prev === 0 ? 0 : prev;
  }
  return out;
}

function resolveFactor(factor: number | undefined): number {
  return isFiniteNumber(factor) && factor > 0 && factor <= 1
    ? factor
    : DEFAULT_CHART_LINE_STC_FACTOR;
}

/**
 * Doug Schaff's Trend Cycle. The MACD line is run through two cycles
 * of stochastic normalisation and modified-EMA smoothing, producing a
 * fast oscillator bounded to 0-100.
 */
export function computeLineStc(
  values: readonly number[] | null | undefined,
  fastPeriod: number,
  slowPeriod: number,
  cyclePeriod: number,
  factor: number,
): {
  macd: (number | null)[];
  k1: (number | null)[];
  d1: (number | null)[];
  k2: (number | null)[];
  stc: (number | null)[];
} {
  if (!Array.isArray(values)) {
    return { macd: [], k1: [], d1: [], k2: [], stc: [] };
  }
  const macd = computeLineStcMacd(values, fastPeriod, slowPeriod);
  const k1 = computeLineStcStochK(macd, cyclePeriod);
  const d1 = computeLineStcSmooth(k1, factor);
  const k2 = computeLineStcStochK(d1, cyclePeriod);
  const stc = computeLineStcSmooth(k2, factor);
  return { macd, k1, d1, k2, stc };
}

function classifyZone(
  stc: number | null,
  upper: number,
  lower: number,
): ChartLineStcZone {
  if (stc === null) return 'neutral';
  if (stc >= upper) return 'overbought';
  if (stc <= lower) return 'oversold';
  return 'neutral';
}

export function runLineStc(
  points: readonly ChartLineStcPoint[] | null | undefined,
  options?: {
    fastPeriod?: number;
    slowPeriod?: number;
    cyclePeriod?: number;
    factor?: number;
    upperThreshold?: number;
    lowerThreshold?: number;
  },
): ChartLineStcRun {
  const finite = getLineStcFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const fastPeriod = normalizeLineStcPeriod(
    options?.fastPeriod ?? DEFAULT_CHART_LINE_STC_FAST_PERIOD,
    DEFAULT_CHART_LINE_STC_FAST_PERIOD,
  );
  const slowPeriod = normalizeLineStcPeriod(
    options?.slowPeriod ?? DEFAULT_CHART_LINE_STC_SLOW_PERIOD,
    DEFAULT_CHART_LINE_STC_SLOW_PERIOD,
  );
  const cyclePeriod = normalizeLineStcPeriod(
    options?.cyclePeriod ?? DEFAULT_CHART_LINE_STC_CYCLE_PERIOD,
    DEFAULT_CHART_LINE_STC_CYCLE_PERIOD,
  );
  const factor = resolveFactor(options?.factor);
  const upperThreshold = isFiniteNumber(options?.upperThreshold)
    ? (options!.upperThreshold as number)
    : DEFAULT_CHART_LINE_STC_UPPER_THRESHOLD;
  const lowerThreshold = isFiniteNumber(options?.lowerThreshold)
    ? (options!.lowerThreshold as number)
    : DEFAULT_CHART_LINE_STC_LOWER_THRESHOLD;
  const n = series.length;

  if (n < 2) {
    return {
      series,
      fastPeriod,
      slowPeriod,
      cyclePeriod,
      factor,
      upperThreshold,
      lowerThreshold,
      macd: [],
      stc: [],
      samples: [],
      stcFinal: NaN,
      stcMin: NaN,
      stcMax: NaN,
      overboughtCount: 0,
      oversoldCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const { macd, stc } = computeLineStc(
    values,
    fastPeriod,
    slowPeriod,
    cyclePeriod,
    factor,
  );

  const samples: ChartLineStcSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    macd: macd[i] ?? null,
    stc: stc[i] ?? null,
    zone: classifyZone(stc[i] ?? null, upperThreshold, lowerThreshold),
  }));

  const lastDefined = (arr: (number | null)[]): number => {
    for (let i = arr.length - 1; i >= 0; i -= 1) {
      if (isDefined(arr[i])) return arr[i] as number;
    }
    return NaN;
  };

  let stcMin = NaN;
  let stcMax = NaN;
  let overboughtCount = 0;
  let oversoldCount = 0;
  for (const s of samples) {
    if (s.stc !== null) {
      if (Number.isNaN(stcMin) || s.stc < stcMin) stcMin = s.stc;
      if (Number.isNaN(stcMax) || s.stc > stcMax) stcMax = s.stc;
    }
    if (s.zone === 'overbought') overboughtCount += 1;
    if (s.zone === 'oversold') oversoldCount += 1;
  }

  return {
    series = [],
    fastPeriod,
    slowPeriod,
    cyclePeriod,
    factor,
    upperThreshold,
    lowerThreshold,
    macd,
    stc,
    samples,
    stcFinal: lastDefined(stc),
    stcMin,
    stcMax,
    overboughtCount,
    oversoldCount,
    ok: true,
  };
}

function buildPath(points: readonly { px: number; py: number }[]): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineStcLayout(
  options: ComputeLineStcLayoutOptions,
): ChartLineStcLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_STC_GAP,
    pricePanelRatio = DEFAULT_CHART_LINE_STC_PRICE_PANEL_RATIO,
    tickCount = DEFAULT_CHART_LINE_STC_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const ratio = Math.min(0.8, Math.max(0.3, pricePanelRatio));

  const emptyPanel: ChartLineStcPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const emptyRect: ChartLineStcRect = { x: 0, y: 0, width: 0, height: 0 };
  const run = runLineStc(data, {
    ...(isFiniteNumber(options.fastPeriod)
      ? { fastPeriod: options.fastPeriod }
      : {}),
    ...(isFiniteNumber(options.slowPeriod)
      ? { slowPeriod: options.slowPeriod }
      : {}),
    ...(isFiniteNumber(options.cyclePeriod)
      ? { cyclePeriod: options.cyclePeriod }
      : {}),
    ...(isFiniteNumber(options.factor) ? { factor: options.factor } : {}),
    ...(isFiniteNumber(options.upperThreshold)
      ? { upperThreshold: options.upperThreshold }
      : {}),
    ...(isFiniteNumber(options.lowerThreshold)
      ? { lowerThreshold: options.lowerThreshold }
      : {}),
  });
  const empty: ChartLineStcLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    stcPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    stcYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    pricePath: '',
    priceDots: [],
    stcPath: '',
    markers: [],
    overboughtRect: emptyRect,
    oversoldRect: emptyRect,
    upperY: 0,
    lowerY: 0,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    cyclePeriod: run.cyclePeriod,
    factor: run.factor,
    upperThreshold: run.upperThreshold,
    lowerThreshold: run.lowerThreshold,
    stcFinal: NaN,
    stcMin: NaN,
    stcMax: NaN,
    overboughtCount: 0,
    oversoldCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const usableHeight = innerHeight - gap;
  if (usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const priceH = usableHeight * ratio;
  const stcH = usableHeight - priceH;
  if (priceH <= 0 || stcH <= 0) return empty;

  const pricePanel: ChartLineStcPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceH,
  };
  const stcPanel: ChartLineStcPanel = {
    x: padding,
    y: padding + priceH + gap,
    width: innerWidth,
    height: stcH,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let pyLo = Number.POSITIVE_INFINITY;
  let pyHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < pyLo) pyLo = s.value;
    if (s.value > pyHi) pyHi = s.value;
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (pyLo === pyHi) {
    pyLo -= 0.5;
    pyHi += 0.5;
  }

  const xRange = xHi - xLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - pyLo) / (pyHi - pyLo)) * pricePanel.height;
  const projectStcY = (v: number): number => {
    const c = v < 0 ? 0 : v > 100 ? 100 : v;
    return stcPanel.y + stcPanel.height - (c / 100) * stcPanel.height;
  };

  const priceDots: ChartLineStcPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    macd: s.macd,
    stc: s.stc,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const stcPts: { px: number; py: number }[] = [];
  const markers: ChartLineStcMarker[] = [];
  for (const s of run.samples) {
    if (s.stc !== null) {
      const px = projectX(s.x);
      const py = projectStcY(s.stc);
      stcPts.push({ px, py });
      markers.push({
        index: s.index,
        x: s.x,
        stc: s.stc,
        zone: s.zone,
        px,
        py,
      });
    }
  }

  const upperY = projectStcY(run.upperThreshold);
  const lowerY = projectStcY(run.lowerThreshold);
  const topY = projectStcY(100);
  const bottomY = projectStcY(0);

  return {
    ok: true,
    width,
    height,
    pricePanel,
    stcPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(pyLo, pyHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    stcYTicks: computeTicks(0, 100, tickCount).map((v) => ({
      value: v,
      py: projectStcY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: pyLo,
    priceYMax: pyHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    stcPath: buildPath(stcPts),
    markers,
    overboughtRect: {
      x: stcPanel.x,
      y: topY,
      width: stcPanel.width,
      height: upperY - topY,
    },
    oversoldRect: {
      x: stcPanel.x,
      y: lowerY,
      width: stcPanel.width,
      height: bottomY - lowerY,
    },
    upperY,
    lowerY,
    fastPeriod: run.fastPeriod,
    slowPeriod: run.slowPeriod,
    cyclePeriod: run.cyclePeriod,
    factor: run.factor,
    upperThreshold: run.upperThreshold,
    lowerThreshold: run.lowerThreshold,
    stcFinal: run.stcFinal,
    stcMin: run.stcMin,
    stcMax: run.stcMax,
    overboughtCount: run.overboughtCount,
    oversoldCount: run.oversoldCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineStcChart(
  data: readonly ChartLineStcPoint[] | null | undefined,
  options?: {
    fastPeriod?: number;
    slowPeriod?: number;
    cyclePeriod?: number;
    factor?: number;
    upperThreshold?: number;
    lowerThreshold?: number;
  },
): string {
  const run = runLineStc(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with a Schaff Trend Cycle (STC) panel on a 0-100 scale (MACD ${run.fastPeriod}/${run.slowPeriod}, cycle ${run.cyclePeriod}): the STC runs a MACD line through two cycles of stochastic normalisation and smoothing, producing a fast, bounded trend oscillator; readings at or above ${run.upperThreshold} are overbought and at or below ${run.lowerThreshold} oversold. ${run.overboughtCount} overbought and ${run.oversoldCount} oversold readings across ${run.samples.length} periods.`;
}

const STC_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineStc = forwardRef<HTMLDivElement, ChartLineStcProps>(
  function ChartLineStc(
    props: ChartLineStcProps,
    ref: ForwardedRef<HTMLDivElement>,
  ) {
    const {
      data,
      fastPeriod,
      slowPeriod,
      cyclePeriod,
      factor,
      upperThreshold,
      lowerThreshold,
      hiddenSeries: controlledHidden,
      defaultHiddenSeries,
      onHiddenSeriesChange,
      width = DEFAULT_CHART_LINE_STC_WIDTH,
      height = DEFAULT_CHART_LINE_STC_HEIGHT,
      padding = DEFAULT_CHART_LINE_STC_PADDING,
      gap = DEFAULT_CHART_LINE_STC_GAP,
      pricePanelRatio = DEFAULT_CHART_LINE_STC_PRICE_PANEL_RATIO,
      tickCount = DEFAULT_CHART_LINE_STC_TICK_COUNT,
      strokeWidth = DEFAULT_CHART_LINE_STC_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_STC_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_STC_PRICE_COLOR,
      stcColor = DEFAULT_CHART_LINE_STC_STC_COLOR,
      overboughtColor = DEFAULT_CHART_LINE_STC_OVERBOUGHT_COLOR,
      oversoldColor = DEFAULT_CHART_LINE_STC_OVERSOLD_COLOR,
      gridColor = DEFAULT_CHART_LINE_STC_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_STC_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showStc = true,
      showZones = true,
      showTooltip = true,
      showConfigBadge = true,
      showLegend = true,
      animate = true,
      className,
      ariaLabel = 'Line chart with a Schaff Trend Cycle panel',
      ariaDescription,
      formatValue = defaultFormatValue,
      formatX = defaultFormatValue,
      onPointClick,
      onSeriesToggle,
      style,
    } = props;

    const reactId = useId();
    const descId = `${reactId}-desc`;

    const isControlled = controlledHidden !== undefined;
    const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
      normaliseHidden(defaultHiddenSeries),
    );
    const hiddenSet = isControlled
      ? normaliseHidden(controlledHidden)
      : uncontrolled;

    const layout = useMemo(
      () =>
        computeLineStcLayout({
          data,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
          tickCount,
          ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
          ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
          ...(isFiniteNumber(cyclePeriod) ? { cyclePeriod } : {}),
          ...(isFiniteNumber(factor) ? { factor } : {}),
          ...(isFiniteNumber(upperThreshold) ? { upperThreshold } : {}),
          ...(isFiniteNumber(lowerThreshold) ? { lowerThreshold } : {}),
        }),
      [
        data,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
        tickCount,
        fastPeriod,
        slowPeriod,
        cyclePeriod,
        factor,
        upperThreshold,
        lowerThreshold,
      ],
    );

    const summary = useMemo(
      () =>
        ariaDescription ??
        describeLineStcChart(data, {
          ...(isFiniteNumber(fastPeriod) ? { fastPeriod } : {}),
          ...(isFiniteNumber(slowPeriod) ? { slowPeriod } : {}),
          ...(isFiniteNumber(cyclePeriod) ? { cyclePeriod } : {}),
          ...(isFiniteNumber(factor) ? { factor } : {}),
          ...(isFiniteNumber(upperThreshold) ? { upperThreshold } : {}),
          ...(isFiniteNumber(lowerThreshold) ? { lowerThreshold } : {}),
        }),
      [
        ariaDescription,
        data,
        fastPeriod,
        slowPeriod,
        cyclePeriod,
        factor,
        upperThreshold,
        lowerThreshold,
      ],
    );

    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
    const [tooltipPos, setTooltipPos] = useState<{
      px: number;
      py: number;
    } | null>(null);

    const clearHover = useCallback(() => {
      setHoverIndex(null);
      setTooltipPos(null);
    }, []);

    const handleToggle = useCallback(
      (seriesId: string) => {
        const next = new Set(hiddenSet);
        const willHide = !next.has(seriesId);
        if (willHide) next.add(seriesId);
        else next.delete(seriesId);
        if (!isControlled) setUncontrolled(next);
        onHiddenSeriesChange?.(next);
        onSeriesToggle?.({ seriesId, hidden: willHide });
      },
      [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
    );

    const zoneColor = useCallback(
      (z: ChartLineStcZone): string =>
        z === 'overbought'
          ? overboughtColor
          : z === 'oversold'
            ? oversoldColor
            : stcColor,
      [overboughtColor, oversoldColor, stcColor],
    );

    const containerStyle: CSSProperties = {
      width,
      height,
      position: 'relative',
      ...(style ?? {}),
    };

    if (!layout.ok) {
      return (
        <div
          ref={ref}
          role="region"
          aria-label={ariaLabel}
          aria-describedby={descId}
          className={className}
          style={containerStyle}
          data-section="chart-line-stc"
          data-empty="true"
          data-animate={animate ? 'true' : 'false'}
        >
          <span
            id={descId}
            data-section="chart-line-stc-aria-desc"
            style={STC_SR_STYLE}
          >
            {summary}
          </span>
        </div>
      );
    }

    const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
    const pp = layout.pricePanel;
    const sp = layout.stcPanel;
    const priceVisible = !hiddenSet.has('price');
    const stcVisible = showStc && !hiddenSet.has('stc');

    const legendItems: { id: string; label: string; color: string }[] = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'stc', label: 'STC', color: stcColor },
    ];

    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={
          [className, animateClass].filter(Boolean).join(' ') || undefined
        }
        style={containerStyle}
        data-section="chart-line-stc"
        data-empty="false"
        data-fast-period={layout.fastPeriod}
        data-slow-period={layout.slowPeriod}
        data-cycle-period={layout.cyclePeriod}
        data-upper-threshold={layout.upperThreshold}
        data-lower-threshold={layout.lowerThreshold}
        data-stc-final={layout.stcFinal}
        data-overbought-count={layout.overboughtCount}
        data-oversold-count={layout.oversoldCount}
        data-total-points={layout.totalPoints}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-stc-aria-desc"
          style={STC_SR_STYLE}
        >
          {summary}
        </span>

        <div
          data-section="chart-line-stc-canvas"
          style={{ position: 'relative', width, height }}
        >
          {showConfigBadge ? (
            <div
              data-section="chart-line-stc-badge"
              style={{
                position: 'absolute',
                top: 4,
                left: 4,
                padding: '2px 6px',
                borderRadius: 4,
                background: '#ffffffd9',
                color: '#0f172a',
                fontSize: 11,
                fontWeight: 600,
                display: 'flex',
                gap: 4,
                alignItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <span
                data-section="chart-line-stc-badge-icon"
                aria-hidden="true"
                style={{ color: stcColor }}
              >
                STC
              </span>
              <span data-section="chart-line-stc-badge-macd">
                {layout.fastPeriod}/{layout.slowPeriod}
              </span>
              <span data-section="chart-line-stc-badge-cycle">
                c={layout.cyclePeriod}
              </span>
            </div>
          ) : null}

          <svg
            role="img"
            aria-label={ariaLabel}
            width={width}
            height={height}
            data-section="chart-line-stc-svg"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {showGrid ? (
              <g
                data-section="chart-line-stc-grid"
                stroke={gridColor}
                strokeWidth={1}
              >
                {layout.priceYTicks.map((t, i) => (
                  <line
                    key={`pgy-${i}`}
                    data-section="chart-line-stc-grid-line"
                    data-panel="price"
                    x1={pp.x}
                    x2={pp.x + pp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
                {layout.stcYTicks.map((t, i) => (
                  <line
                    key={`sgy-${i}`}
                    data-section="chart-line-stc-grid-line"
                    data-panel="stc"
                    x1={sp.x}
                    x2={sp.x + sp.width}
                    y1={t.py}
                    y2={t.py}
                  />
                ))}
              </g>
            ) : null}

            {showZones ? (
              <g data-section="chart-line-stc-zones">
                <rect
                  data-section="chart-line-stc-overbought-zone"
                  x={layout.overboughtRect.x}
                  y={layout.overboughtRect.y}
                  width={layout.overboughtRect.width}
                  height={layout.overboughtRect.height}
                  fill={overboughtColor}
                  fillOpacity={0.12}
                />
                <rect
                  data-section="chart-line-stc-oversold-zone"
                  x={layout.oversoldRect.x}
                  y={layout.oversoldRect.y}
                  width={layout.oversoldRect.width}
                  height={layout.oversoldRect.height}
                  fill={oversoldColor}
                  fillOpacity={0.12}
                />
                <line
                  data-section="chart-line-stc-threshold-line"
                  data-kind="upper"
                  x1={sp.x}
                  x2={sp.x + sp.width}
                  y1={layout.upperY}
                  y2={layout.upperY}
                  stroke={overboughtColor}
                  strokeWidth={1}
                  strokeDasharray="5 3"
                />
                <line
                  data-section="chart-line-stc-threshold-line"
                  data-kind="lower"
                  x1={sp.x}
                  x2={sp.x + sp.width}
                  y1={layout.lowerY}
                  y2={layout.lowerY}
                  stroke={oversoldColor}
                  strokeWidth={1}
                  strokeDasharray="5 3"
                />
              </g>
            ) : null}

            {showAxis ? (
              <g
                data-section="chart-line-stc-axes"
                stroke={axisColor}
                strokeWidth={1}
              >
                {[
                  { panel: pp, name: 'price', yt: layout.priceYTicks },
                  { panel: sp, name: 'stc', yt: layout.stcYTicks },
                ].map((cfg) => (
                  <g
                    key={`axis-${cfg.name}`}
                    data-section="chart-line-stc-axis-group"
                    data-panel={cfg.name}
                  >
                    <line
                      data-section="chart-line-stc-axis"
                      data-panel={cfg.name}
                      data-axis="x"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y + cfg.panel.height}
                      x2={cfg.panel.x + cfg.panel.width}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    <line
                      data-section="chart-line-stc-axis"
                      data-panel={cfg.name}
                      data-axis="y"
                      x1={cfg.panel.x}
                      y1={cfg.panel.y}
                      x2={cfg.panel.x}
                      y2={cfg.panel.y + cfg.panel.height}
                    />
                    {cfg.yt.map((t, i) => (
                      <g
                        key={`yt-${cfg.name}-${i}`}
                        data-section="chart-line-stc-tick"
                        data-panel={cfg.name}
                        data-axis="y"
                      >
                        <line
                          x1={cfg.panel.x - 4}
                          x2={cfg.panel.x}
                          y1={t.py}
                          y2={t.py}
                        />
                        <text
                          data-section="chart-line-stc-tick-label"
                          data-panel={cfg.name}
                          data-axis="y"
                          x={cfg.panel.x - 6}
                          y={t.py + 3}
                          textAnchor="end"
                          fontSize={10}
                          fill={axisColor}
                          stroke="none"
                        >
                          {formatValue(t.value)}
                        </text>
                      </g>
                    ))}
                  </g>
                ))}
                <g data-section="chart-line-stc-ticks" data-axis="x">
                  {layout.xTicks.map((t, i) => (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-stc-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.px}
                        x2={t.px}
                        y1={sp.y + sp.height}
                        y2={sp.y + sp.height + 4}
                      />
                      <text
                        data-section="chart-line-stc-tick-label"
                        data-axis="x"
                        x={t.px}
                        y={sp.y + sp.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatX(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              </g>
            ) : null}

            <g data-section="chart-line-stc-panel-labels">
              <text
                data-section="chart-line-stc-panel-label"
                data-panel="price"
                x={pp.x + pp.width / 2}
                y={pp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Price
              </text>
              <text
                data-section="chart-line-stc-panel-label"
                data-panel="stc"
                x={sp.x + sp.width / 2}
                y={sp.y - 8}
                textAnchor="middle"
                fontSize={11}
                fontWeight={600}
                fill={axisColor}
                stroke="none"
              >
                Schaff Trend Cycle
              </text>
            </g>

            {priceVisible ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Price line"
                data-section="chart-line-stc-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {priceVisible && showDots ? (
              <g data-section="chart-line-stc-dots">
                {layout.priceDots.map((d) => {
                  const isHover = hoverIndex === d.index;
                  return (
                    <circle
                      key={`d-${d.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                      data-section="chart-line-stc-dot"
                      data-point-index={d.index}
                      data-x={d.x}
                      data-value={d.value}
                      cx={d.px}
                      cy={d.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={priceColor}
                      stroke="#ffffff"
                      strokeWidth={1}
                      onMouseEnter={() => {
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onMouseLeave={clearHover}
                      onFocus={() => {
                        setHoverIndex(d.index);
                        setTooltipPos({ px: d.px, py: d.py });
                      }}
                      onBlur={clearHover}
                      onClick={() => onPointClick?.({ point: d })}
                    />
                  );
                })}
              </g>
            ) : null}

            {stcVisible && layout.stcPath ? (
              <path
                role="graphics-symbol"
                tabIndex={0}
                aria-label="Schaff Trend Cycle line"
                data-section="chart-line-stc-stc-line"
                d={layout.stcPath}
                fill="none"
                stroke={stcColor}
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {stcVisible ? (
              <g data-section="chart-line-stc-markers">
                {layout.markers.map((m) => {
                  const isHover = hoverIndex === m.index;
                  return (
                    <circle
                      key={`m-${m.index}`}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`STC at x ${formatX(m.x)}: ${formatValue(m.stc)} (${m.zone})`}
                      data-section="chart-line-stc-marker"
                      data-point-index={m.index}
                      data-stc={m.stc}
                      data-zone={m.zone}
                      cx={m.px}
                      cy={m.py}
                      r={isHover ? dotRadius + 1.5 : dotRadius}
                      fill={zoneColor(m.zone)}
                      stroke="#ffffff"
                      strokeWidth={1}
                      onMouseEnter={() => {
                        setHoverIndex(m.index);
                        setTooltipPos({ px: m.px, py: m.py });
                      }}
                      onMouseLeave={clearHover}
                      onFocus={() => {
                        setHoverIndex(m.index);
                        setTooltipPos({ px: m.px, py: m.py });
                      }}
                      onBlur={clearHover}
                      onClick={() => {
                        const d = layout.priceDots.find(
                          (x) => x.index === m.index,
                        );
                        if (d) onPointClick?.({ point: d });
                      }}
                    />
                  );
                })}
              </g>
            ) : null}
          </svg>

          {showTooltip && hoverIndex !== null && tooltipPos
            ? (() => {
                const d = layout.priceDots.find((x) => x.index === hoverIndex);
                if (!d) return null;
                return (
                  <div
                    data-section="chart-line-stc-tooltip"
                    data-point-index={d.index}
                    style={{
                      position: 'absolute',
                      left: tooltipPos.px + 8,
                      top: tooltipPos.py + 8,
                      background: '#0f172a',
                      color: '#f8fafc',
                      padding: '6px 8px',
                      fontSize: 11,
                      borderRadius: 4,
                      pointerEvents: 'none',
                      minWidth: 150,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                    }}
                  >
                    <div data-section="chart-line-stc-tooltip-x">
                      x: {formatX(d.x)}
                    </div>
                    <div
                      data-section="chart-line-stc-tooltip-value"
                      style={{ fontWeight: 600 }}
                    >
                      value: {formatValue(d.value)}
                    </div>
                    <div data-section="chart-line-stc-tooltip-macd">
                      macd: {d.macd === null ? 'n/a' : formatValue(d.macd)}
                    </div>
                    <div data-section="chart-line-stc-tooltip-stc">
                      stc: {d.stc === null ? 'n/a' : formatValue(d.stc)}
                    </div>
                    <div data-section="chart-line-stc-tooltip-zone">
                      zone: {d.zone}
                    </div>
                  </div>
                );
              })()
            : null}
        </div>

        {showLegend ? (
          <div
            data-section="chart-line-stc-legend"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              marginTop: 8,
              alignItems: 'center',
            }}
          >
            {legendItems.map((item) => {
              const isHidden = hiddenSet.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  data-section="chart-line-stc-legend-item"
                  data-series-id={item.id}
                  data-hidden={isHidden ? 'true' : 'false'}
                  onClick={() => handleToggle(item.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    border: 'none',
                    background: 'transparent',
                    padding: 0,
                    cursor: 'pointer',
                    opacity: isHidden ? 0.5 : 1,
                  }}
                >
                  <span
                    data-section="chart-line-stc-legend-swatch"
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: item.color,
                    }}
                  />
                  <span data-section="chart-line-stc-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-stc-legend-stats"
              style={{ fontSize: 10, color: '#64748b' }}
            >
              {layout.overboughtCount} overbought, {layout.oversoldCount}{' '}
              oversold
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineStc.displayName = 'ChartLineStc';
