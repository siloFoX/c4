import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_WIDTH = 560;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_HEIGHT = 360;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_PADDING = 40;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_GAP = 12;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_RSI_PERIOD = 14;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA1_PERIOD = 5;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA2_PERIOD = 3;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_SIGNAL_PERIOD = 9;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_OSC_COLOR = '#6366f1';
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DERIVATIVE_OSC_AXIS_COLOR = '#cbd5e1';

export type ChartLineDerivativeOscZone =
  | 'positive'
  | 'negative'
  | 'zero'
  | 'none';

export interface ChartLineDerivativeOscParams {
  rsiPeriod?: number;
  ema1Period?: number;
  ema2Period?: number;
  signalPeriod?: number;
}

export interface ChartLineDerivativeOscPoint {
  x: number;
  value: number;
}

export interface ChartLineDerivativeOscSample {
  index: number;
  x: number;
  value: number;
  rsi: number | null;
  smoothed: number | null;
  signal: number | null;
  osc: number | null;
  zone: ChartLineDerivativeOscZone;
}

export interface ChartLineDerivativeOscRun {
  series: ChartLineDerivativeOscPoint[];
  rsiPeriod: number;
  ema1Period: number;
  ema2Period: number;
  signalPeriod: number;
  rsi: (number | null)[];
  smoothed: (number | null)[];
  signal: (number | null)[];
  osc: (number | null)[];
  samples: ChartLineDerivativeOscSample[];
  oscFinal: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  ok: boolean;
}

export interface ChartLineDerivativeOscPriceDot {
  index: number;
  x: number;
  value: number;
  rsi: number | null;
  osc: number | null;
  zone: ChartLineDerivativeOscZone;
  px: number;
  py: number;
}

export interface ChartLineDerivativeOscMarker {
  index: number;
  x: number;
  osc: number;
  zone: ChartLineDerivativeOscZone;
  px: number;
  py: number;
}

export interface ChartLineDerivativeOscPanel {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ChartLineDerivativeOscLayout {
  ok: boolean;
  width: number;
  height: number;
  pricePanel: ChartLineDerivativeOscPanel;
  oscPanel: ChartLineDerivativeOscPanel;
  xTicks: { value: number; px: number }[];
  priceYTicks: { value: number; py: number }[];
  oscYTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  priceYMin: number;
  priceYMax: number;
  oscYMin: number;
  oscYMax: number;
  pricePath: string;
  priceDots: ChartLineDerivativeOscPriceDot[];
  oscPath: string;
  markers: ChartLineDerivativeOscMarker[];
  zeroY: number;
  rsiPeriod: number;
  ema1Period: number;
  ema2Period: number;
  signalPeriod: number;
  oscFinal: number;
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineDerivativeOscLayoutOptions {
  data: readonly ChartLineDerivativeOscPoint[];
  rsiPeriod?: number;
  ema1Period?: number;
  ema2Period?: number;
  signalPeriod?: number;
  width: number;
  height: number;
  padding: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
}

export interface ChartLineDerivativeOscProps {
  data: readonly ChartLineDerivativeOscPoint[];
  rsiPeriod?: number;
  ema1Period?: number;
  ema2Period?: number;
  signalPeriod?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  oscColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineDerivativeOscPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

export function getLineDerivativeOscFinitePoints(
  points: readonly ChartLineDerivativeOscPoint[] | null | undefined,
): ChartLineDerivativeOscPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineDerivativeOscPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce an RSI / smoothing / signal length to a positive
 * integer. A non-finite or sub-1 value falls back to `fallback`;
 * a fractional value floors.
 */
export function normalizeLineDerivativeOscPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  const total = avgGain + avgLoss;
  if (total === 0) return 50;
  return (100 * avgGain) / total;
}

/**
 * Welles Wilder's Relative Strength Index. The first value (at
 * index `period`) seeds the average gain and loss with their
 * simple mean over the first `period` changes; later values use
 * Wilder smoothing. A window with no movement reads 50. Bars
 * before the window is full are null.
 */
export function computeLineDerivativeOscRsi(
  closes: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineDerivativeOscPeriod(
    period,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_RSI_PERIOD,
  );
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + 1) return out;
  let sumGain = 0;
  let sumLoss = 0;
  for (let i = 1; i <= p; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) return out;
    const change = cur - prev;
    if (change > 0) sumGain += change;
    else sumLoss += -change;
  }
  let avgGain = sumGain / p;
  let avgLoss = sumLoss / p;
  out[p] = rsiFrom(avgGain, avgLoss);
  for (let i = p + 1; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) break;
    const change = cur - prev;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (p - 1) + gain) / p;
    avgLoss = (avgLoss * (p - 1) + loss) / p;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

/**
 * An exponential moving average of a series that may carry a null
 * warm-up prefix. The EMA seeds with the first finite value and
 * then advances `ema += alpha * (value - ema)`, so a constant
 * input yields a bit-exact constant output.
 */
export function computeLineDerivativeOscEma(
  values: readonly (number | null)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineDerivativeOscPeriod(
    period,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA1_PERIOD,
  );
  const alpha = 2 / (p + 1);
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  let ema: number | null = null;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (!isFiniteNumber(v)) continue;
    ema = ema === null ? v : ema + alpha * (v - ema);
    out[i] = ema;
  }
  return out;
}

function rollingMean(
  values: readonly (number | null)[],
  window: number,
): (number | null)[] {
  const n = values.length;
  const out: (number | null)[] = new Array(n).fill(null);
  const w = window < 1 ? 1 : Math.floor(window);
  for (let i = w - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    for (let k = i - w + 1; k <= i; k += 1) {
      const v = values[k];
      if (v === null || v === undefined) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (valid) out[i] = sum / w;
  }
  return out;
}

/**
 * The double-smoothed RSI -- the RSI run through two successive
 * exponential moving averages.
 */
export function computeLineDerivativeOscSmoothed(
  closes: readonly number[] | null | undefined,
  params?: ChartLineDerivativeOscParams,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const rsiPeriod = normalizeLineDerivativeOscPeriod(
    params?.rsiPeriod ?? DEFAULT_CHART_LINE_DERIVATIVE_OSC_RSI_PERIOD,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_RSI_PERIOD,
  );
  const ema1Period = normalizeLineDerivativeOscPeriod(
    params?.ema1Period ?? DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA1_PERIOD,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA1_PERIOD,
  );
  const ema2Period = normalizeLineDerivativeOscPeriod(
    params?.ema2Period ?? DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA2_PERIOD,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA2_PERIOD,
  );
  const rsi = computeLineDerivativeOscRsi(closes, rsiPeriod);
  const first = computeLineDerivativeOscEma(rsi, ema1Period);
  return computeLineDerivativeOscEma(first, ema2Period);
}

/**
 * The Derivative Oscillator signal line -- the simple moving
 * average of the double-smoothed RSI over `signalPeriod` bars.
 */
export function computeLineDerivativeOscSignal(
  closes: readonly number[] | null | undefined,
  params?: ChartLineDerivativeOscParams,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const smoothed = computeLineDerivativeOscSmoothed(closes, params);
  const signalPeriod = normalizeLineDerivativeOscPeriod(
    params?.signalPeriod ?? DEFAULT_CHART_LINE_DERIVATIVE_OSC_SIGNAL_PERIOD,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_SIGNAL_PERIOD,
  );
  return rollingMean(smoothed, signalPeriod);
}

/**
 * Constance Brown's Derivative Oscillator -- the double-smoothed
 * RSI minus its signal average. A bar is defined only once both
 * the smoothed RSI and its signal exist.
 */
export function computeLineDerivativeOsc(
  closes: readonly number[] | null | undefined,
  params?: ChartLineDerivativeOscParams,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const smoothed = computeLineDerivativeOscSmoothed(closes, params);
  const signal = computeLineDerivativeOscSignal(closes, params);
  const n = smoothed.length;
  const out: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const s = smoothed[i];
    const g = signal[i];
    if (isFiniteNumber(s) && isFiniteNumber(g)) out[i] = s - g;
  }
  return out;
}

function classifyZone(osc: number | null): ChartLineDerivativeOscZone {
  if (osc === null) return 'none';
  if (osc > 0) return 'positive';
  if (osc < 0) return 'negative';
  return 'zero';
}

export function runLineDerivativeOsc(
  points: readonly ChartLineDerivativeOscPoint[] | null | undefined,
  options?: ChartLineDerivativeOscParams,
): ChartLineDerivativeOscRun {
  const finite = getLineDerivativeOscFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const rsiPeriod = normalizeLineDerivativeOscPeriod(
    options?.rsiPeriod ?? DEFAULT_CHART_LINE_DERIVATIVE_OSC_RSI_PERIOD,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_RSI_PERIOD,
  );
  const ema1Period = normalizeLineDerivativeOscPeriod(
    options?.ema1Period ?? DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA1_PERIOD,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA1_PERIOD,
  );
  const ema2Period = normalizeLineDerivativeOscPeriod(
    options?.ema2Period ?? DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA2_PERIOD,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_EMA2_PERIOD,
  );
  const signalPeriod = normalizeLineDerivativeOscPeriod(
    options?.signalPeriod ?? DEFAULT_CHART_LINE_DERIVATIVE_OSC_SIGNAL_PERIOD,
    DEFAULT_CHART_LINE_DERIVATIVE_OSC_SIGNAL_PERIOD,
  );
  const params: ChartLineDerivativeOscParams = {
    rsiPeriod,
    ema1Period,
    ema2Period,
    signalPeriod,
  };
  const n = series.length;

  if (n < 2) {
    return {
      series,
      rsiPeriod,
      ema1Period,
      ema2Period,
      signalPeriod,
      rsi: [],
      smoothed: [],
      signal: [],
      osc: [],
      samples: [],
      oscFinal: NaN,
      positiveCount: 0,
      negativeCount: 0,
      zeroCount: 0,
      ok: false,
    };
  }

  const closes = series.map((p) => p.value);
  const rsi = computeLineDerivativeOscRsi(closes, rsiPeriod);
  const smoothed = computeLineDerivativeOscSmoothed(closes, params);
  const signal = computeLineDerivativeOscSignal(closes, params);
  const osc = computeLineDerivativeOsc(closes, params);

  const samples: ChartLineDerivativeOscSample[] = series.map((p, i) => {
    const o = osc[i] ?? null;
    return {
      index: i,
      x: p.x,
      value: p.value,
      rsi: rsi[i] ?? null,
      smoothed: smoothed[i] ?? null,
      signal: signal[i] ?? null,
      osc: o,
      zone: classifyZone(o),
    };
  });

  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let oscFinal = NaN;
  for (const s of samples) {
    if (s.zone === 'positive') positiveCount += 1;
    else if (s.zone === 'negative') negativeCount += 1;
    else if (s.zone === 'zero') zeroCount += 1;
    if (s.osc !== null) oscFinal = s.osc;
  }

  return {
    series = [],
    rsiPeriod,
    ema1Period,
    ema2Period,
    signalPeriod,
    rsi,
    smoothed,
    signal,
    osc,
    samples,
    oscFinal,
    positiveCount,
    negativeCount,
    zeroCount,
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

export function computeLineDerivativeOscLayout(
  options: ComputeLineDerivativeOscLayoutOptions,
): ChartLineDerivativeOscLayout {
  const {
    data,
    width,
    height,
    padding,
    gap = DEFAULT_CHART_LINE_DERIVATIVE_OSC_GAP,
    tickCount = DEFAULT_CHART_LINE_DERIVATIVE_OSC_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_DERIVATIVE_OSC_PRICE_PANEL_RATIO,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineDerivativeOsc(data, {
    ...(isFiniteNumber(options.rsiPeriod)
      ? { rsiPeriod: options.rsiPeriod }
      : {}),
    ...(isFiniteNumber(options.ema1Period)
      ? { ema1Period: options.ema1Period }
      : {}),
    ...(isFiniteNumber(options.ema2Period)
      ? { ema2Period: options.ema2Period }
      : {}),
    ...(isFiniteNumber(options.signalPeriod)
      ? { signalPeriod: options.signalPeriod }
      : {}),
  });

  const emptyPanel: ChartLineDerivativeOscPanel = {
    x: padding,
    y: padding,
    width: 0,
    height: 0,
  };
  const empty: ChartLineDerivativeOscLayout = {
    ok: false,
    width,
    height,
    pricePanel: emptyPanel,
    oscPanel: emptyPanel,
    xTicks: [],
    priceYTicks: [],
    oscYTicks: [],
    xMin: 0,
    xMax: 0,
    priceYMin: 0,
    priceYMax: 0,
    oscYMin: 0,
    oscYMax: 0,
    pricePath: '',
    priceDots: [],
    oscPath: '',
    markers: [],
    zeroY: 0,
    rsiPeriod: run.rsiPeriod,
    ema1Period: run.ema1Period,
    ema2Period: run.ema2Period,
    signalPeriod: run.signalPeriod,
    oscFinal: NaN,
    positiveCount: 0,
    negativeCount: 0,
    zeroCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  const usableHeight = innerHeight - gap;
  if (innerWidth <= 0 || usableHeight <= 0) return empty;
  if (!run.ok) return empty;

  const ratio = clamp(pricePanelRatio, 0.3, 0.8);
  const priceHeight = usableHeight * ratio;
  const oscHeight = usableHeight - priceHeight;

  const pricePanel: ChartLineDerivativeOscPanel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: priceHeight,
  };
  const oscPanel: ChartLineDerivativeOscPanel = {
    x: padding,
    y: padding + priceHeight + gap,
    width: innerWidth,
    height: oscHeight,
  };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let priceLo = Number.POSITIVE_INFINITY;
  let priceHi = Number.NEGATIVE_INFINITY;
  let oscLo = 0;
  let oscHi = 0;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < priceLo) priceLo = s.value;
    if (s.value > priceHi) priceHi = s.value;
    if (s.osc !== null) {
      if (s.osc < oscLo) oscLo = s.osc;
      if (s.osc > oscHi) oscHi = s.osc;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (priceLo === priceHi) {
    priceLo -= 0.5;
    priceHi += 0.5;
  }
  if (oscLo === oscHi) {
    oscLo -= 1;
    oscHi += 1;
  }

  const xRange = xHi - xLo;
  const priceRange = priceHi - priceLo;
  const oscRange = oscHi - oscLo;
  const projectX = (x: number): number =>
    pricePanel.x + ((x - xLo) / xRange) * pricePanel.width;
  const projectPriceY = (v: number): number =>
    pricePanel.y +
    pricePanel.height -
    ((v - priceLo) / priceRange) * pricePanel.height;
  const projectOscY = (v: number): number =>
    oscPanel.y + oscPanel.height - ((v - oscLo) / oscRange) * oscPanel.height;

  const priceDots: ChartLineDerivativeOscPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    rsi: s.rsi,
    osc: s.osc,
    zone: s.zone,
    px: projectX(s.x),
    py: projectPriceY(s.value),
  }));

  const oscPts: { px: number; py: number }[] = [];
  const markers: ChartLineDerivativeOscMarker[] = [];
  for (const s of run.samples) {
    if (s.osc === null) continue;
    const px = projectX(s.x);
    const py = projectOscY(s.osc);
    oscPts.push({ px, py });
    if (s.zone !== 'none') {
      markers.push({ index: s.index, x: s.x, osc: s.osc, zone: s.zone, px, py });
    }
  }

  return {
    ok: true,
    width,
    height,
    pricePanel,
    oscPanel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    priceYTicks: computeTicks(priceLo, priceHi, tickCount).map((v) => ({
      value: v,
      py: projectPriceY(v),
    })),
    oscYTicks: computeTicks(oscLo, oscHi, tickCount).map((v) => ({
      value: v,
      py: projectOscY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    priceYMin: priceLo,
    priceYMax: priceHi,
    oscYMin: oscLo,
    oscYMax: oscHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    oscPath: buildPath(oscPts),
    markers,
    zeroY: projectOscY(0),
    rsiPeriod: run.rsiPeriod,
    ema1Period: run.ema1Period,
    ema2Period: run.ema2Period,
    signalPeriod: run.signalPeriod,
    oscFinal: run.oscFinal,
    positiveCount: run.positiveCount,
    negativeCount: run.negativeCount,
    zeroCount: run.zeroCount,
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

export function describeLineDerivativeOscChart(
  data: readonly ChartLineDerivativeOscPoint[] | null | undefined,
  options?: ChartLineDerivativeOscParams,
): string {
  const run = runLineDerivativeOsc(data, options);
  if (!run.ok) return 'No data';
  return `Two-panel chart with Constance Brown's Derivative Oscillator (RSI ${run.rsiPeriod}): the top panel plots the price; the bottom panel plots the Derivative Oscillator. The oscillator double-smooths the RSI with two successive exponential moving averages, then subtracts a simple moving average of that double-smoothed RSI as a signal line -- what is left swings around zero, positive when momentum is building upward, negative when it is building downward. The oscillator is positive on ${run.positiveCount} bars, negative on ${run.negativeCount} and zero on ${run.zeroCount} across ${run.samples.length} bars.`;
}

const DERIVATIVE_OSC_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineDerivativeOsc = forwardRef<
  HTMLDivElement,
  ChartLineDerivativeOscProps
>(function ChartLineDerivativeOsc(
  props: ChartLineDerivativeOscProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    rsiPeriod,
    ema1Period,
    ema2Period,
    signalPeriod,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_DERIVATIVE_OSC_WIDTH,
    height = DEFAULT_CHART_LINE_DERIVATIVE_OSC_HEIGHT,
    padding = DEFAULT_CHART_LINE_DERIVATIVE_OSC_PADDING,
    gap = DEFAULT_CHART_LINE_DERIVATIVE_OSC_GAP,
    tickCount = DEFAULT_CHART_LINE_DERIVATIVE_OSC_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_DERIVATIVE_OSC_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_DERIVATIVE_OSC_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DERIVATIVE_OSC_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DERIVATIVE_OSC_PRICE_COLOR,
    oscColor = DEFAULT_CHART_LINE_DERIVATIVE_OSC_OSC_COLOR,
    positiveColor = DEFAULT_CHART_LINE_DERIVATIVE_OSC_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_DERIVATIVE_OSC_NEGATIVE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_DERIVATIVE_OSC_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_DERIVATIVE_OSC_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_DERIVATIVE_OSC_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showZeroLine = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = "Two-panel chart with Constance Brown's Derivative Oscillator",
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

  const paramOpts = useMemo(
    () => ({
      ...(isFiniteNumber(rsiPeriod) ? { rsiPeriod } : {}),
      ...(isFiniteNumber(ema1Period) ? { ema1Period } : {}),
      ...(isFiniteNumber(ema2Period) ? { ema2Period } : {}),
      ...(isFiniteNumber(signalPeriod) ? { signalPeriod } : {}),
    }),
    [rsiPeriod, ema1Period, ema2Period, signalPeriod],
  );

  const layout = useMemo(
    () =>
      computeLineDerivativeOscLayout({
        data,
        width,
        height,
        padding,
        gap,
        tickCount,
        pricePanelRatio,
        ...paramOpts,
      }),
    [data, width, height, padding, gap, tickCount, pricePanelRatio, paramOpts],
  );

  const summary = useMemo(
    () => ariaDescription ?? describeLineDerivativeOscChart(data, paramOpts),
    [ariaDescription, data, paramOpts],
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
        data-section="chart-line-derivative-osc"
        data-empty="true"
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-derivative-osc-aria-desc"
          style={DERIVATIVE_OSC_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pp = layout.pricePanel;
  const op = layout.oscPanel;
  const priceVisible = !hiddenSet.has('price');
  const oscVisible = !hiddenSet.has('osc');

  const fmtNullable = (v: number | null): string =>
    v === null ? 'n/a' : formatValue(v);

  const zoneColor = (zone: ChartLineDerivativeOscZone): string => {
    if (zone === 'positive') return positiveColor;
    if (zone === 'negative') return negativeColor;
    return oscColor;
  };

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'osc', label: 'Derivative Osc', color: oscColor },
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
      data-section="chart-line-derivative-osc"
      data-empty="false"
      data-rsi-period={layout.rsiPeriod}
      data-ema1-period={layout.ema1Period}
      data-ema2-period={layout.ema2Period}
      data-signal-period={layout.signalPeriod}
      data-osc-final={layout.oscFinal}
      data-positive-count={layout.positiveCount}
      data-negative-count={layout.negativeCount}
      data-zero-count={layout.zeroCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-derivative-osc-aria-desc"
        style={DERIVATIVE_OSC_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-derivative-osc-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-derivative-osc-badge"
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
              data-section="chart-line-derivative-osc-badge-icon"
              aria-hidden="true"
              style={{ color: oscColor }}
            >
              DO
            </span>
            <span data-section="chart-line-derivative-osc-badge-config">
              {layout.rsiPeriod}/{layout.ema1Period}/{layout.ema2Period}/
              {layout.signalPeriod}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-derivative-osc-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-derivative-osc-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.priceYTicks.map((t, i) => (
                <line
                  key={`gp-${i}`}
                  data-section="chart-line-derivative-osc-grid-line"
                  data-panel="price"
                  x1={pp.x}
                  x2={pp.x + pp.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
              {layout.oscYTicks.map((t, i) => (
                <line
                  key={`go-${i}`}
                  data-section="chart-line-derivative-osc-grid-line"
                  data-panel="osc"
                  x1={op.x}
                  x2={op.x + op.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-derivative-osc-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-derivative-osc-axis"
                data-panel="price"
                data-axis="y"
                x1={pp.x}
                y1={pp.y}
                x2={pp.x}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-derivative-osc-axis"
                data-panel="price"
                data-axis="x"
                x1={pp.x}
                y1={pp.y + pp.height}
                x2={pp.x + pp.width}
                y2={pp.y + pp.height}
              />
              <line
                data-section="chart-line-derivative-osc-axis"
                data-panel="osc"
                data-axis="y"
                x1={op.x}
                y1={op.y}
                x2={op.x}
                y2={op.y + op.height}
              />
              <line
                data-section="chart-line-derivative-osc-axis"
                data-panel="osc"
                data-axis="x"
                x1={op.x}
                y1={op.y + op.height}
                x2={op.x + op.width}
                y2={op.y + op.height}
              />
              {layout.priceYTicks.map((t, i) => (
                <text
                  key={`pyt-${i}`}
                  data-section="chart-line-derivative-osc-tick-label"
                  data-panel="price"
                  data-axis="y"
                  x={pp.x - 6}
                  y={t.py + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatValue(t.value)}
                </text>
              ))}
              {layout.oscYTicks.map((t, i) => (
                <text
                  key={`oyt-${i}`}
                  data-section="chart-line-derivative-osc-tick-label"
                  data-panel="osc"
                  data-axis="y"
                  x={op.x - 6}
                  y={t.py + 3}
                  textAnchor="end"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatValue(t.value)}
                </text>
              ))}
              {layout.xTicks.map((t, i) => (
                <text
                  key={`xt-${i}`}
                  data-section="chart-line-derivative-osc-tick-label"
                  data-axis="x"
                  x={t.px}
                  y={op.y + op.height + 14}
                  textAnchor="middle"
                  fontSize={10}
                  fill={axisColor}
                  stroke="none"
                >
                  {formatX(t.value)}
                </text>
              ))}
            </g>
          ) : null}

          <text
            data-section="chart-line-derivative-osc-panel-label"
            data-panel="price"
            x={pp.x + 2}
            y={pp.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Price
          </text>
          <text
            data-section="chart-line-derivative-osc-panel-label"
            data-panel="osc"
            x={op.x + 2}
            y={op.y + 10}
            fontSize={10}
            fontWeight={600}
            fill={axisColor}
            stroke="none"
          >
            Derivative Osc
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-derivative-osc-zero-line"
              x1={op.x}
              x2={op.x + op.width}
              y1={layout.zeroY}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-derivative-osc-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-derivative-osc-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-derivative-osc-dot"
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

          {oscVisible && layout.oscPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Derivative Oscillator line"
              data-section="chart-line-derivative-osc-osc-line"
              d={layout.oscPath}
              fill="none"
              stroke={oscColor}
              strokeWidth={1.75}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {oscVisible && showMarkers ? (
            <g data-section="chart-line-derivative-osc-markers">
              {layout.markers.map((m) => {
                const isHover = hoverIndex === m.index;
                return (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Derivative Oscillator at x ${formatX(m.x)}: ${formatValue(m.osc)}, ${m.zone}`}
                    data-section="chart-line-derivative-osc-marker"
                    data-point-index={m.index}
                    data-osc={m.osc}
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
                  data-section="chart-line-derivative-osc-tooltip"
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
                  <div data-section="chart-line-derivative-osc-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-derivative-osc-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-derivative-osc-tooltip-rsi">
                    rsi: {fmtNullable(d.rsi)}
                  </div>
                  <div data-section="chart-line-derivative-osc-tooltip-osc">
                    osc: {fmtNullable(d.osc)}
                  </div>
                  <div data-section="chart-line-derivative-osc-tooltip-zone">
                    zone: {d.zone}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-derivative-osc-legend"
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
                data-section="chart-line-derivative-osc-legend-item"
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
                  data-section="chart-line-derivative-osc-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-derivative-osc-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-derivative-osc-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.positiveCount} pos, {layout.negativeCount} neg,{' '}
            {layout.zeroCount} zero
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDerivativeOsc.displayName = 'ChartLineDerivativeOsc';
