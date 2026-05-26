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
 * ChartLineRsiCrossSig -- pure-SVG dual-panel chart with the
 * close on top and the Wilder RSI plus its EMA-smoothed signal
 * line on the bottom. Markers fire at every RSI-vs-signal cross
 * -- distinct from RSI overbought/oversold level crosses; these
 * mark momentum trigger events as the RSI moves relative to its
 * own short-term mean:
 *
 *   gain[i]   = max(0, close[i] - close[i-1])
 *   loss[i]   = max(0, close[i-1] - close[i])
 *   avgGain   = Wilder(gain, rsiLength)
 *   avgLoss   = Wilder(loss, rsiLength)
 *   RSI       = (avgGain === 0 && avgLoss === 0) ? 50
 *             : avgLoss === 0                    ? 100
 *             : avgGain === 0                    ? 0
 *             : 100 - 100 / (1 + avgGain/avgLoss)
 *   signal    = EMA(RSI, signalLength)
 *
 * Cross events: `up` (RSI newly exceeds signal -> regime
 * `accelerating-up`) and `down` (RSI newly drops below signal
 * -> regime `accelerating-down`).
 *
 * Bit-exact anchors (with the `min === max` precision fix in
 * both Wilder and EMA helpers):
 *
 * - **CONST close = K**: every gain/loss = 0 -> RSI = 50
 *   (neutral fallback). EMA(50) = 50. Relation `equal` forever,
 *   regime `aligned`, zero crosses.
 * - **LINEAR UP close = i + 1**: every gain = 1, loss = 0 ->
 *   avgGain = 1, avgLoss = 0 -> RSI = 100. EMA(100) = 100.
 *   Relation `equal`, zero crosses.
 * - **LINEAR DOWN close = N - i**: mirror image -> RSI = 0,
 *   EMA(0) = 0. Zero crosses.
 */

export interface ChartLineRsiCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineRsiCrossSigRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineRsiCrossSigCross = 'up' | 'down' | null;

export type ChartLineRsiCrossSigRegime =
  | 'accelerating-up'
  | 'accelerating-down'
  | 'aligned'
  | 'none';

export type ChartLineRsiCrossSigSeriesId = 'price' | 'rsi' | 'signal';

export interface ChartLineRsiCrossSigSample {
  index: number;
  x: number;
  close: number;
  rsi: number | null;
  signal: number | null;
  relation: ChartLineRsiCrossSigRelation;
  regime: ChartLineRsiCrossSigRegime;
  crossed: ChartLineRsiCrossSigCross;
}

export interface ChartLineRsiCrossSigRun {
  series: ChartLineRsiCrossSigPoint[];
  rsiLength: number;
  signalLength: number;
  rsiValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineRsiCrossSigSample[];
  upCrossCount: number;
  downCrossCount: number;
  acceleratingUpCount: number;
  acceleratingDownCount: number;
  alignedCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineRsiCrossSigMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  rsi: number;
  kind: 'up' | 'down';
}

export interface ChartLineRsiCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRsiCrossSigLayout {
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
  priceDots: ChartLineRsiCrossSigDot[];
  rsiPath: string;
  signalPath: string;
  markers: ChartLineRsiCrossSigMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midlineY: number;
  run: ChartLineRsiCrossSigRun;
}

export interface ChartLineRsiCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRsiCrossSigPoint[];
  rsiLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  rsiColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  midlineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRsi?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRsiCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineRsiCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRsiCrossSigSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineRsiCrossSigSample }) => void;
  formatPrice?: (value: number) => string;
  formatRsi?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_RSI_LENGTH = 14;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_RSI_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_SIGNAL_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RSI_CROSS_SIG_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineRsiCrossSigFinitePoints(
  data: readonly ChartLineRsiCrossSigPoint[] | null | undefined,
): ChartLineRsiCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRsiCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineRsiCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Wilder smoothing with SMA seed + `min === max` precision fix.
 */
export function applyLineRsiCrossSigWilder(
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

/**
 * SMA-seeded EMA with `min === max` precision fix and CONST short-
 * circuit.
 */
export function applyLineRsiCrossSigEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);
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
        v === smoothed ? v : alpha * v + (1 - alpha) * smoothed;
      smoothed = next;
      out[i] = posZero(next);
    }
  }
  return out;
}

/** Per-bar (gain, loss). [0] is null (no prev). */
export function applyLineRsiCrossSigGainLoss(
  closes: readonly number[],
): { gain: Array<number | null>; loss: Array<number | null> } {
  const gain: Array<number | null> = [];
  const loss: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      gain.push(null);
      loss.push(null);
      continue;
    }
    const d = closes[i]! - closes[i - 1]!;
    if (!isFiniteNumber(d)) {
      gain.push(null);
      loss.push(null);
      continue;
    }
    gain.push(d > 0 ? posZero(d) : 0);
    loss.push(d < 0 ? posZero(-d) : 0);
  }
  return { gain, loss };
}

/** RSI from already-smoothed avg gain / loss. */
export function applyLineRsiCrossSigRsi(
  avgGain: readonly (number | null)[],
  avgLoss: readonly (number | null)[],
): Array<number | null> {
  const n = Math.min(avgGain.length, avgLoss.length);
  const out: Array<number | null> = [];
  for (let i = 0; i < n; i += 1) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g == null || l == null) {
      out.push(null);
      continue;
    }
    if (g === 0 && l === 0) {
      out.push(50);
      continue;
    }
    if (l === 0) {
      out.push(100);
      continue;
    }
    if (g === 0) {
      out.push(0);
      continue;
    }
    const rs = g / l;
    const rsi = 100 - 100 / (1 + rs);
    out.push(Number.isFinite(rsi) ? posZero(rsi) : null);
  }
  return out;
}

export interface LineRsiCrossSigChannels {
  rsi: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineRsiCrossSig(
  series: readonly ChartLineRsiCrossSigPoint[] | null | undefined,
  options: { rsiLength?: number; signalLength?: number } = {},
): LineRsiCrossSigChannels {
  const cleaned = getLineRsiCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { rsi: [], signal: [] };
  }
  const rsiLength = normalizeLineRsiCrossSigLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_RSI_CROSS_SIG_RSI_LENGTH,
  );
  const signalLength = normalizeLineRsiCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_RSI_CROSS_SIG_SIGNAL_LENGTH,
  );
  const closes = cleaned.map((p) => p.close);
  const { gain, loss } = applyLineRsiCrossSigGainLoss(closes);
  const avgGain = applyLineRsiCrossSigWilder(gain, rsiLength);
  const avgLoss = applyLineRsiCrossSigWilder(loss, rsiLength);
  const rsi = applyLineRsiCrossSigRsi(avgGain, avgLoss);
  const signal = applyLineRsiCrossSigEma(rsi, signalLength);
  return { rsi, signal };
}

export function classifyLineRsiCrossSigRelation(
  rsi: number | null,
  signal: number | null,
): ChartLineRsiCrossSigRelation {
  if (rsi == null || signal == null) return 'none';
  if (rsi > signal) return 'bullish';
  if (rsi < signal) return 'bearish';
  return 'equal';
}

export function classifyLineRsiCrossSigRegime(
  relation: ChartLineRsiCrossSigRelation,
): ChartLineRsiCrossSigRegime {
  if (relation === 'bullish') return 'accelerating-up';
  if (relation === 'bearish') return 'accelerating-down';
  if (relation === 'equal') return 'aligned';
  return 'none';
}

export function detectLineRsiCrossSigCrosses(
  rsiValues: readonly (number | null)[],
  signalValues: readonly (number | null)[],
): ChartLineRsiCrossSigCross[] {
  const out: ChartLineRsiCrossSigCross[] = [];
  let prevR: number | null = null;
  let prevS: number | null = null;
  for (let i = 0; i < rsiValues.length; i += 1) {
    const r = rsiValues[i];
    const s = signalValues[i];
    if (r == null || s == null) {
      out.push(null);
      prevR = null;
      prevS = null;
      continue;
    }
    if (prevR == null || prevS == null) {
      out.push(null);
      prevR = r;
      prevS = s;
      continue;
    }
    if (prevR <= prevS && r > s) {
      out.push('up');
    } else if (prevR >= prevS && r < s) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevR = r;
    prevS = s;
  }
  return out;
}

export function runLineRsiCrossSig(
  data: ChartLineRsiCrossSigPoint[],
  options: { rsiLength?: number; signalLength?: number } = {},
): ChartLineRsiCrossSigRun {
  const cleaned = getLineRsiCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const rsiLength = normalizeLineRsiCrossSigLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_RSI_CROSS_SIG_RSI_LENGTH,
  );
  const signalLength = normalizeLineRsiCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_RSI_CROSS_SIG_SIGNAL_LENGTH,
  );

  const channels = computeLineRsiCrossSig(series, {
    rsiLength,
    signalLength,
  });
  const crosses = detectLineRsiCrossSigCrosses(
    channels.rsi,
    channels.signal,
  );

  const samples: ChartLineRsiCrossSigSample[] = series.map((p, i) => {
    const rsi = channels.rsi[i] ?? null;
    const signal = channels.signal[i] ?? null;
    const relation = classifyLineRsiCrossSigRelation(rsi, signal);
    const regime = classifyLineRsiCrossSigRegime(relation);
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      rsi,
      signal,
      relation,
      regime,
      crossed,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let acceleratingUpCount = 0;
  let acceleratingDownCount = 0;
  let alignedCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.regime === 'accelerating-up') acceleratingUpCount += 1;
    else if (s.regime === 'accelerating-down') acceleratingDownCount += 1;
    else if (s.regime === 'aligned') alignedCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > rsiLength + signalLength;

  return {
    series,
    rsiLength,
    signalLength,
    rsiValues: channels.rsi,
    signalValues: channels.signal,
    samples,
    upCrossCount,
    downCrossCount,
    acceleratingUpCount,
    acceleratingDownCount,
    alignedCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineRsiCrossSigLayoutOptions {
  data: ChartLineRsiCrossSigPoint[];
  rsiLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineRsiCrossSigLayout(
  opts: ComputeLineRsiCrossSigLayoutOptions,
): ChartLineRsiCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_RSI_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_RSI_CROSS_SIG_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_RSI_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_RSI_CROSS_SIG_PANEL_GAP;

  const run = runLineRsiCrossSig(opts.data, {
    rsiLength: opts.rsiLength ?? undefined,
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  const oscMin = 0;
  const oscMax = 100;

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
      rsiPath: '',
      signalPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      midlineY: (oscTop + oscBottom) / 2,
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
  const priceDots: ChartLineRsiCrossSigDot[] = [];
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

  const buildPath = (key: 'rsi' | 'signal'): string => {
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

  const rsiPath = buildPath('rsi');
  const signalPath = buildPath('signal');

  const markers: ChartLineRsiCrossSigMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.rsi == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.rsi),
      rsi: s.rsi,
      kind: s.crossed,
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
    rsiPath,
    signalPath,
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midlineY: syOsc(50),
    run,
  };
}

export function describeLineRsiCrossSigChart(
  data: ChartLineRsiCrossSigPoint[],
  options: { rsiLength?: number; signalLength?: number } = {},
): string {
  const cleaned = getLineRsiCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const rsiLength = normalizeLineRsiCrossSigLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_RSI_CROSS_SIG_RSI_LENGTH,
  );
  const signalLength = normalizeLineRsiCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_RSI_CROSS_SIG_SIGNAL_LENGTH,
  );
  return (
    `RSI Cross Signal chart over ${cleaned.length} bars (rsiLength ` +
    `${rsiLength}, signalLength ${signalLength}). Top panel renders ` +
    `the close; bottom panel renders the Wilder RSI and its EMA ` +
    `signal with markers at every RSI-vs-signal cross.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultRsiFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineRsiCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineRsiCrossSigProps
>(function ChartLineRsiCrossSig(props, ref): ReactNode {
  const {
    data,
    rsiLength = DEFAULT_CHART_LINE_RSI_CROSS_SIG_RSI_LENGTH,
    signalLength = DEFAULT_CHART_LINE_RSI_CROSS_SIG_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_RSI_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_RSI_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_RSI_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_RSI_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_RSI_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RSI_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RSI_CROSS_SIG_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_RSI_CROSS_SIG_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RSI_CROSS_SIG_PRICE_COLOR,
    rsiColor = DEFAULT_CHART_LINE_RSI_CROSS_SIG_RSI_COLOR,
    signalColor = DEFAULT_CHART_LINE_RSI_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_RSI_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_RSI_CROSS_SIG_BEARISH_COLOR,
    midlineColor = DEFAULT_CHART_LINE_RSI_CROSS_SIG_MIDLINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_RSI_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RSI_CROSS_SIG_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRsi = true,
    showSignal = true,
    showMarkers = true,
    showMidline = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onCrossClick,
    formatPrice = defaultPriceFormatter,
    formatRsi = defaultRsiFormatter,
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
    () => getLineRsiCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineRsiCrossSigLayout({
        data: cleaned,
        rsiLength,
        signalLength,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, rsiLength, signalLength, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineRsiCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineRsiCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineRsiCrossSigSeriesId,
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
        data-section="chart-line-rsi-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineRsiCrossSigChart(cleaned, { rsiLength, signalLength });

  const showPrice = !hidden.has('price');
  const showRsiLine = !hidden.has('rsi') && showRsi;
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

  const markerColor = (kind: 'up' | 'down'): string =>
    kind === 'up' ? bullishColor : bearishColor;

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'RSI Cross Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-rsi-cross-sig"
      data-rsi-length={rsiLength}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-rsi-cross-sig-title"
      >
        {ariaLabel ?? 'RSI Cross Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-rsi-cross-sig-aria-desc"
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
        data-section="chart-line-rsi-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-rsi-cross-sig-grid">
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
                  data-section="chart-line-rsi-cross-sig-grid-line-price"
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
                  data-section="chart-line-rsi-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-rsi-cross-sig-axes">
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
                  data-section="chart-line-rsi-cross-sig-tick-price"
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
                  data-section="chart-line-rsi-cross-sig-tick-osc"
                >
                  {formatRsi(v)}
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
            data-section="chart-line-rsi-cross-sig-midline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-rsi-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-rsi-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-rsi-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-rsi-cross-sig-signal"
          />
        ) : null}

        {showRsiLine ? (
          <path
            d={layout.rsiPath}
            stroke={rsiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-rsi-cross-sig-rsi"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-rsi-cross-sig-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.kind)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-rsi-cross-sig-marker"
                data-kind={m.kind}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-rsi-cross-sig-hover-targets">
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
                data-section="chart-line-rsi-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-rsi-cross-sig-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={196}
                  height={140}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-sig-tooltip-rsi"
                >
                  rsi{' '}
                  {tooltipSample.rsi == null
                    ? '--'
                    : formatRsi(tooltipSample.rsi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-sig-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatRsi(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-sig-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-sig-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-rsi-cross-sig-tooltip-counts"
                >
                  up {layout.run.upCrossCount} | down{' '}
                  {layout.run.downCrossCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-rsi-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          rsi {rsiLength} | signal {signalLength} | up{' '}
          {layout.run.upCrossCount} | down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-rsi-cross-sig-legend"
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
              { id: 'rsi' as const, color: rsiColor, label: 'rsi' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineRsiCrossSigSeriesId;
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

ChartLineRsiCrossSig.displayName = 'ChartLineRsiCrossSig';
