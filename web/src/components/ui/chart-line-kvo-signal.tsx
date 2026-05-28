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
 * ChartLineKvoSignal -- pure-SVG dual-panel chart with the close on
 * top and the Klinger Volume Oscillator signal line beneath:
 *
 *   tp[i]      = (high[i] + low[i] + close[i]) / 3
 *   sign[i]    = tp[i] > tp[i - 1] ?  1
 *              : tp[i] < tp[i - 1] ? -1
 *              :                      0   (and tp[0] -> sign 0)
 *   vf[i]      = volume[i] * sign[i]
 *   kvo[i]     = EMA(vf, fastLength)[i] - EMA(vf, slowLength)[i]
 *   signal[i]  = EMA(kvo, signalLength)[i]
 *
 * This is the simplified Klinger Volume Force formulation: per-bar
 * volume signed by the direction of the typical-price change, then
 * passed through the standard MACD-style fast/slow EMA spread and
 * smoothed by the signal-line EMA. Original Klinger 1997 uses a
 * more elaborate accumulator-based volume force; the simplified
 * sign-based form keeps the same long-run behaviour and yields
 * clean bit-exact anchors.
 *
 * Bit-exact anchors:
 * - **CONST OHLC and volume = V**: tp constant -> sign = 0 ->
 *   vf = 0 every bar -> both EMAs collapse to 0 -> KVO = 0 ->
 *   signal = 0 once warmed.
 * - **LINEAR UP h = l = close = i + 1, volume = V > 0**: tp rises
 *   strictly so sign[i] = 1 for i >= 1, vf[i] = V constant; both
 *   EMAs collapse to V (min === max seed + CONST short-circuit) ->
 *   KVO = V - V = 0 -> signal = 0 once warmed.
 * - **LINEAR DOWN**: symmetric, vf = -V constant -> KVO = 0 ->
 *   signal = 0.
 */

export interface ChartLineKvoSignalPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartLineKvoSignalZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineKvoSignalCross = 'up' | 'down' | null;

export type ChartLineKvoSignalSeriesId = 'price' | 'kvo' | 'signal';

export interface ChartLineKvoSignalSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tp: number;
  vf: number | null;
  kvo: number | null;
  signal: number | null;
  zone: ChartLineKvoSignalZone;
  crossed: ChartLineKvoSignalCross;
}

export interface ChartLineKvoSignalRun {
  series: ChartLineKvoSignalPoint[];
  fastLength: number;
  slowLength: number;
  signalLength: number;
  vfValues: Array<number | null>;
  kvoValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineKvoSignalSample[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineKvoSignalMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  signal: number;
  crossed: 'up' | 'down';
}

export interface ChartLineKvoSignalDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKvoSignalLayout {
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
  priceDots: ChartLineKvoSignalDot[];
  kvoPath: string;
  signalPath: string;
  zeroY: number;
  markers: ChartLineKvoSignalMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  run: ChartLineKvoSignalRun;
}

export interface ChartLineKvoSignalProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKvoSignalPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kvoColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKvo?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKvoSignalSeriesId[];
  defaultHiddenSeries?: ChartLineKvoSignalSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKvoSignalSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineKvoSignalSample }) => void;
  formatPrice?: (value: number) => string;
  formatOsc?: (value: number) => string;
  formatVolume?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_KVO_SIGNAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_PADDING = 44;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_FAST_LENGTH = 34;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_SLOW_LENGTH = 55;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_SIGNAL_LENGTH = 13;
export const DEFAULT_CHART_LINE_KVO_SIGNAL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KVO_SIGNAL_KVO_COLOR = '#facc15';
export const DEFAULT_CHART_LINE_KVO_SIGNAL_SIGNAL_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_KVO_SIGNAL_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KVO_SIGNAL_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KVO_SIGNAL_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_KVO_SIGNAL_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KVO_SIGNAL_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite OHLC + volume fields (volume >= 0). */
export function getLineKvoSignalFinitePoints(
  data: readonly ChartLineKvoSignalPoint[] | null | undefined,
): ChartLineKvoSignalPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKvoSignalPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume) &&
      point.volume >= 0
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        volume: point.volume,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineKvoSignalLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer signal length (>= 1). */
export function normalizeLineKvoSignalSignalLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA with CONST short-circuit + min===max seed
 * precision fix. Used three times in this primitive (fast, slow,
 * and signal-on-kvo).
 */
export function applyLineKvoSignalEma(
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

/** Typical price array. */
export function applyLineKvoSignalTypicalPrice(
  series: readonly ChartLineKvoSignalPoint[],
): number[] {
  return series.map((p) => posZero((p.high + p.low + p.close) / 3));
}

/** Volume Force: volume[i] * sign(tp[i] - tp[i-1]). Null for i = 0. */
export function applyLineKvoSignalVolumeForce(
  tps: readonly number[],
  volumes: readonly number[],
): Array<number | null> {
  const n = Math.min(tps.length, volumes.length);
  const out: Array<number | null> = [];
  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const dt = tps[i]! - tps[i - 1]!;
    const dir = dt > 0 ? 1 : dt < 0 ? -1 : 0;
    out.push(posZero(volumes[i]! * dir));
  }
  return out;
}

export interface LineKvoSignalChannels {
  tp: number[];
  vf: Array<number | null>;
  emaFast: Array<number | null>;
  emaSlow: Array<number | null>;
  kvo: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineKvoSignal(
  series: readonly ChartLineKvoSignalPoint[] | null | undefined,
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): LineKvoSignalChannels {
  const cleaned = getLineKvoSignalFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      tp: [],
      vf: [],
      emaFast: [],
      emaSlow: [],
      kvo: [],
      signal: [],
    };
  }
  const fastLength = normalizeLineKvoSignalLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KVO_SIGNAL_FAST_LENGTH,
  );
  const slowLength = normalizeLineKvoSignalLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KVO_SIGNAL_SLOW_LENGTH,
  );
  const signalLength = normalizeLineKvoSignalSignalLength(
    options.signalLength,
    DEFAULT_CHART_LINE_KVO_SIGNAL_SIGNAL_LENGTH,
  );

  const tp = applyLineKvoSignalTypicalPrice(cleaned);
  const vf = applyLineKvoSignalVolumeForce(
    tp,
    cleaned.map((p) => p.volume),
  );
  const emaFast = applyLineKvoSignalEma(vf, fastLength);
  const emaSlow = applyLineKvoSignalEma(vf, slowLength);

  const kvo: Array<number | null> = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f == null || s == null) {
      kvo.push(null);
    } else {
      kvo.push(posZero(f - s));
    }
  }

  const signal = applyLineKvoSignalEma(kvo, signalLength);

  return { tp, vf, emaFast, emaSlow, kvo, signal };
}

export function classifyLineKvoSignalZone(
  value: number | null,
): ChartLineKvoSignalZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > 0) return 'bullish';
  if (value < 0) return 'bearish';
  return 'neutral';
}

export function detectLineKvoSignalCrosses(
  values: readonly (number | null)[],
): ChartLineKvoSignalCross[] {
  const out: ChartLineKvoSignalCross[] = [];
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

export function runLineKvoSignal(
  data: ChartLineKvoSignalPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): ChartLineKvoSignalRun {
  const cleaned = getLineKvoSignalFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineKvoSignalLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KVO_SIGNAL_FAST_LENGTH,
  );
  const slowLength = normalizeLineKvoSignalLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KVO_SIGNAL_SLOW_LENGTH,
  );
  const signalLength = normalizeLineKvoSignalSignalLength(
    options.signalLength,
    DEFAULT_CHART_LINE_KVO_SIGNAL_SIGNAL_LENGTH,
  );

  const channels = computeLineKvoSignal(series, {
    fastLength,
    slowLength,
    signalLength,
  });
  const crosses = detectLineKvoSignalCrosses(channels.signal);

  const samples: ChartLineKvoSignalSample[] = series.map((p, i) => {
    const tp = channels.tp[i] ?? 0;
    const vf = channels.vf[i] ?? null;
    const kvo = channels.kvo[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const zone = classifyLineKvoSignalZone(signal);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
      tp,
      vf,
      kvo,
      signal,
      zone,
      crossed,
    };
  });

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

  const ok = series.length > slowLength + signalLength;

  return {
    series = [],
    fastLength,
    slowLength,
    signalLength,
    vfValues: channels.vf,
    kvoValues: channels.kvo,
    signalValues: channels.signal,
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

export interface ComputeLineKvoSignalLayoutOptions {
  data: ChartLineKvoSignalPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineKvoSignalLayout(
  opts: ComputeLineKvoSignalLayoutOptions,
): ChartLineKvoSignalLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_KVO_SIGNAL_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_KVO_SIGNAL_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_KVO_SIGNAL_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_KVO_SIGNAL_PANEL_GAP;

  const run = runLineKvoSignal(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
    signalLength: opts.signalLength ?? undefined,
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
      kvoPath: '',
      signalPath: '',
      zeroY: (oscTop + oscBottom) / 2,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin: -1,
      oscMax: 1,
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.kvo != null) {
      if (s.kvo < oscMin) oscMin = s.kvo;
      if (s.kvo > oscMax) oscMax = s.kvo;
    }
    if (s.signal != null) {
      if (s.signal < oscMin) oscMin = s.signal;
      if (s.signal > oscMax) oscMax = s.signal;
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

  let pricePath = '';
  const priceDots: ChartLineKvoSignalDot[] = [];
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

  const buildPath = (key: 'kvo' | 'signal'): string => {
    let p = '';
    let first = true;
    for (const s of run.samples) {
      const v = s[key];
      if (v == null) {
        first = true;
        continue;
      }
      const cx = sx(s.x);
      const cy = syOsc(v);
      p += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
      first = false;
    }
    return p.trim();
  };

  const kvoPath = buildPath('kvo');
  const signalPath = buildPath('signal');

  const markers: ChartLineKvoSignalMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.signal == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.signal),
      close: s.close,
      signal: s.signal,
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
    oscTop,
    oscBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    kvoPath,
    signalPath,
    zeroY: syOsc(0),
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    run,
  };
}

export function describeLineKvoSignalChart(
  data: ChartLineKvoSignalPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): string {
  const cleaned = getLineKvoSignalFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineKvoSignalLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KVO_SIGNAL_FAST_LENGTH,
  );
  const slowLength = normalizeLineKvoSignalLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KVO_SIGNAL_SLOW_LENGTH,
  );
  const signalLength = normalizeLineKvoSignalSignalLength(
    options.signalLength,
    DEFAULT_CHART_LINE_KVO_SIGNAL_SIGNAL_LENGTH,
  );
  return (
    `Klinger Volume Oscillator chart over ${cleaned.length} bars ` +
    `(fastLength ${fastLength}, slowLength ${slowLength}, ` +
    `signalLength ${signalLength}). Top panel renders the close; ` +
    `bottom panel renders the KVO (fast minus slow EMA of volume ` +
    `force) and its signal line (EMA of KVO).`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultOscFormatter = (value: number): string => formatNumber(value);
const defaultVolumeFormatter = (value: number): string =>
  formatNumber(value, 0);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineKvoSignal = forwardRef<
  HTMLDivElement,
  ChartLineKvoSignalProps
>(function ChartLineKvoSignal(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_KVO_SIGNAL_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_KVO_SIGNAL_SLOW_LENGTH,
    signalLength = DEFAULT_CHART_LINE_KVO_SIGNAL_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_KVO_SIGNAL_WIDTH,
    height = DEFAULT_CHART_LINE_KVO_SIGNAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_KVO_SIGNAL_PADDING,
    panelGap = DEFAULT_CHART_LINE_KVO_SIGNAL_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_KVO_SIGNAL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KVO_SIGNAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KVO_SIGNAL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KVO_SIGNAL_PRICE_COLOR,
    kvoColor = DEFAULT_CHART_LINE_KVO_SIGNAL_KVO_COLOR,
    signalColor = DEFAULT_CHART_LINE_KVO_SIGNAL_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_KVO_SIGNAL_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_KVO_SIGNAL_BEARISH_COLOR,
    zeroColor = DEFAULT_CHART_LINE_KVO_SIGNAL_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_KVO_SIGNAL_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_KVO_SIGNAL_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKvo = true,
    showSignal = true,
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
    formatPrice = defaultPriceFormatter,
    formatOsc = defaultOscFormatter,
    formatVolume = defaultVolumeFormatter,
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
    () => getLineKvoSignalFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineKvoSignalLayout({
        data: cleaned,
        fastLength,
        slowLength,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      fastLength,
      slowLength,
      signalLength,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineKvoSignalSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineKvoSignalSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineKvoSignalSeriesId,
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
        data-section="chart-line-kvo-signal-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineKvoSignalChart(cleaned, {
      fastLength,
      slowLength,
      signalLength,
    });

  const showPrice = !hidden.has('price');
  const showKvoLine = !hidden.has('kvo') && showKvo;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
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
      aria-label={ariaLabel ?? 'KVO Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-kvo-signal"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-kvo-signal-title"
      >
        {ariaLabel ?? 'KVO Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-kvo-signal-aria-desc"
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
        data-section="chart-line-kvo-signal-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-kvo-signal-grid">
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
                  data-section="chart-line-kvo-signal-grid-line-price"
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
                  data-section="chart-line-kvo-signal-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-kvo-signal-axes">
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
                  data-section="chart-line-kvo-signal-tick-price"
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
                  data-section="chart-line-kvo-signal-tick-osc"
                >
                  {formatOsc(v)}
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
            data-section="chart-line-kvo-signal-zero-line"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kvo-signal-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-kvo-signal-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-kvo-signal-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showKvoLine ? (
          <path
            d={layout.kvoPath}
            stroke={kvoColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kvo-signal-kvo-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-kvo-signal-signal-path"
          />
        ) : null}

        {showMarkers && showSignalLine ? (
          <g data-section="chart-line-kvo-signal-markers">
            {layout.markers.map((m) => (
              <circle
                key={`signal-marker-${m.index}`}
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
                data-section="chart-line-kvo-signal-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-kvo-signal-hover-targets">
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
                data-section="chart-line-kvo-signal-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-kvo-signal-tooltip"
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
                  data-section="chart-line-kvo-signal-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-signal-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-signal-tooltip-vol"
                >
                  vol {formatVolume(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-signal-tooltip-tp"
                >
                  tp {formatPrice(tooltipSample.tp)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-signal-tooltip-vf"
                >
                  vf{' '}
                  {tooltipSample.vf == null
                    ? '--'
                    : formatOsc(tooltipSample.vf)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-signal-tooltip-kvo"
                >
                  kvo{' '}
                  {tooltipSample.kvo == null
                    ? '--'
                    : formatOsc(tooltipSample.kvo)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-signal-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatOsc(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-signal-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-signal-tooltip-cross"
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
          data-section="chart-line-kvo-signal-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | signal {signalLength}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-kvo-signal-legend"
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
              { id: 'kvo' as const, color: kvoColor, label: 'kvo' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineKvoSignalSeriesId;
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

ChartLineKvoSignal.displayName = 'ChartLineKvoSignal';
