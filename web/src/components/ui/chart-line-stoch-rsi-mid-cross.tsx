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
 * ChartLineStochRsiMidCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Stochastic RSI
 * line in the bottom panel, marking bullish (cross up through
 * midline 50) / bearish (cross down through midline 50)
 * second-derivative momentum centerline regime trigger events.
 * Stochastic RSI is the Stochastic oscillator applied to the
 * RSI series, exposing momentum-of-momentum turning points
 * earlier than the underlying RSI line.
 *
 *   rsi[i]   = close-only RSI(close, rsiLength)
 *   rRange   = max(rsi[i-n+1..i]) - min(rsi[i-n+1..i])
 *   rawK[i]  = rRange > 0
 *                ? ((rsi - lowestRsi) / rRange) * 100
 *                : 50
 *   stochK[i]= SMA(rawK, kSmoothing)
 *   bullish  : prev stochK <= 50 && cur stochK > 50
 *   bearish  : prev stochK >= 50 && cur stochK < 50
 *
 * Defaults: `rsiLength = 14` (canonical RSI window),
 * `stochLength = 14` (Stochastic of RSI window),
 * `kSmoothing = 3` (slow %K smoothing), `threshold = 50`
 * (midline). Regime classifier `bullish` (stochK >= 50),
 * `bearish` (stochK < 50), `none` (stochK null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: delta = 0 every bar -> RSI = 50
 *   via zero-flow fallback. Range of RSI over the Stochastic
 *   window = 0 -> rawK = 50 via the zero-range neutral
 *   fallback. SMA of 50s = 50. stochK = 50 sits on the
 *   threshold but the strict-inequality detector never
 *   fires. regime `bullish` (stochK >= 50). cross count = 0.
 *   Verified across K = 0..1234.
 * - **LINEAR UP close = i**: delta = +1 every bar -> RSI =
 *   100 constant. Range of RSI = 0 -> stochK = 50 (same
 *   neutral fallback). regime `bullish` (at boundary). 0
 *   crosses. Worth noting: even an extreme RSI of 100 maps
 *   to stochK = 50 when RSI is constant -- the Stochastic
 *   normalizes against its own window.
 * - **LINEAR DOWN close = -i**: RSI = 0 constant -> stochK
 *   = 50 (zero-range fallback). regime `bullish` at
 *   boundary. 0 crosses. Same Stochastic-of-constant quirk.
 */

export interface ChartLineStochRsiMidCrossPoint {
  x: number;
  close: number;
}

export type ChartLineStochRsiMidCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineStochRsiMidCrossSeriesId = 'price' | 'stochRsi';

export type ChartLineStochRsiMidCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineStochRsiMidCrossCross {
  index: number;
  x: number;
  kind: ChartLineStochRsiMidCrossCrossKind;
}

export interface ChartLineStochRsiMidCrossSample {
  index: number;
  x: number;
  close: number;
  stochRsi: number | null;
  regime: ChartLineStochRsiMidCrossRegime;
}

export interface ChartLineStochRsiMidCrossRun {
  series: ChartLineStochRsiMidCrossPoint[];
  rsiLength: number;
  stochLength: number;
  kSmoothing: number;
  threshold: number;
  rsiValues: Array<number | null>;
  stochRsiValues: Array<number | null>;
  samples: ChartLineStochRsiMidCrossSample[];
  crosses: ChartLineStochRsiMidCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineStochRsiMidCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochRsiMidCrossLayout {
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
  priceDots: ChartLineStochRsiMidCrossDot[];
  stochRsiPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  thresholdY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineStochRsiMidCrossCrossKind;
  }>;
  run: ChartLineStochRsiMidCrossRun;
}

export interface ChartLineStochRsiMidCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochRsiMidCrossPoint[];
  rsiLength?: number;
  stochLength?: number;
  kSmoothing?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  stochRsiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStochRsi?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochRsiMidCrossSeriesId[];
  defaultHiddenSeries?: ChartLineStochRsiMidCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochRsiMidCrossSeriesId;
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

export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_RSI_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STOCH_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_K_SMOOTHING = 3;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STOCH_RSI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineStochRsiMidCrossFinitePoints(
  data: readonly ChartLineStochRsiMidCrossPoint[] | null | undefined,
): ChartLineStochRsiMidCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochRsiMidCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineStochRsiMidCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold in [0, 100]. */
export function normalizeLineStochRsiMidCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

/** Wilder smoothing with CONST short-circuit (used for RSI). */
export function applyLineStochRsiMidCrossWilder(
  values: readonly number[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (values.length < length) return out;
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += values[i] ?? 0;
  }
  let seed = sum / length;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < length; i += 1) {
    const v = values[i] ?? 0;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
  }
  if (winMin === winMax) seed = winMin;
  out[length - 1] = posZero(seed);
  let prev = seed;
  for (let i = length; i < values.length; i += 1) {
    const v = values[i] ?? 0;
    const next = v === prev ? v : posZero((prev * (length - 1) + v) / length);
    out[i] = next;
    prev = next;
  }
  return out;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineStochRsiMidCrossSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = 0; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(sum / length);
  }
  return out;
}

export interface LineStochRsiMidCrossChannels {
  rsi: Array<number | null>;
  stochRsi: Array<number | null>;
}

export function computeLineStochRsiMidCross(
  series: readonly ChartLineStochRsiMidCrossPoint[] | null | undefined,
  options: {
    rsiLength?: number;
    stochLength?: number;
    kSmoothing?: number;
  } = {},
): LineStochRsiMidCrossChannels {
  const cleaned = getLineStochRsiMidCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { rsi: [], stochRsi: [] };
  }
  const rsiLength = normalizeLineStochRsiMidCrossLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiMidCrossLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STOCH_LENGTH,
  );
  const kSmoothing = normalizeLineStochRsiMidCrossLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_K_SMOOTHING,
  );

  const closes = cleaned.map((p) => p.close);
  const n = closes.length;
  const gainSeed: number[] = [];
  const lossSeed: number[] = [];
  for (let i = 1; i < n; i += 1) {
    const delta = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    gainSeed.push(delta > 0 ? delta : 0);
    lossSeed.push(delta < 0 ? -delta : 0);
  }
  const avgGain = applyLineStochRsiMidCrossWilder(gainSeed, rsiLength);
  const avgLoss = applyLineStochRsiMidCrossWilder(lossSeed, rsiLength);

  const rsi: Array<number | null> = new Array(n).fill(null);
  for (let j = 0; j < avgGain.length; j += 1) {
    const g = avgGain[j];
    const l = avgLoss[j];
    if (g == null || l == null) continue;
    let v: number;
    if (g === 0 && l === 0) v = 50;
    else if (l === 0) v = 100;
    else if (g === 0) v = 0;
    else v = posZero(100 - 100 / (1 + g / l));
    rsi[j + 1] = v;
  }

  // Stochastic of RSI
  const rawK: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const start = i - stochLength + 1;
    if (start < 0) continue;
    let lo = Infinity;
    let hi = -Infinity;
    let valid = true;
    for (let j = start; j <= i; j += 1) {
      const v = rsi[j];
      if (v == null) {
        valid = false;
        break;
      }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!valid) continue;
    const range = hi - lo;
    const r = rsi[i]!;
    if (range === 0) {
      rawK[i] = 50;
    } else {
      rawK[i] = posZero(((r - lo) / range) * 100);
    }
  }
  const stochRsi = applyLineStochRsiMidCrossSma(rawK, kSmoothing);

  return { rsi, stochRsi };
}

export function classifyLineStochRsiMidCrossRegime(
  stochRsi: number | null,
  threshold: number,
): ChartLineStochRsiMidCrossRegime {
  if (stochRsi == null) return 'none';
  if (stochRsi >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineStochRsiMidCrossCrosses(
  series: readonly ChartLineStochRsiMidCrossPoint[],
  stochRsi: readonly (number | null)[],
  threshold: number,
): ChartLineStochRsiMidCrossCross[] {
  const out: ChartLineStochRsiMidCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = stochRsi[i - 1];
    const cur = stochRsi[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineStochRsiMidCross(
  data: ChartLineStochRsiMidCrossPoint[],
  options: {
    rsiLength?: number;
    stochLength?: number;
    kSmoothing?: number;
    threshold?: number;
  } = {},
): ChartLineStochRsiMidCrossRun {
  const cleaned = getLineStochRsiMidCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const rsiLength = normalizeLineStochRsiMidCrossLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiMidCrossLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STOCH_LENGTH,
  );
  const kSmoothing = normalizeLineStochRsiMidCrossLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_K_SMOOTHING,
  );
  const threshold = normalizeLineStochRsiMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_THRESHOLD,
  );

  const channels = computeLineStochRsiMidCross(series, {
    rsiLength,
    stochLength,
    kSmoothing,
  });

  const samples: ChartLineStochRsiMidCrossSample[] = series.map((p, i) => {
    const v = channels.stochRsi[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      stochRsi: v,
      regime: classifyLineStochRsiMidCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineStochRsiMidCrossCrosses(
    series,
    channels.stochRsi,
    threshold,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else noneCount += 1;
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > rsiLength + stochLength + kSmoothing;

  return {
    series,
    rsiLength,
    stochLength,
    kSmoothing,
    threshold,
    rsiValues: channels.rsi,
    stochRsiValues: channels.stochRsi,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineStochRsiMidCrossLayoutOptions {
  data: ChartLineStochRsiMidCrossPoint[];
  rsiLength?: number;
  stochLength?: number;
  kSmoothing?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStochRsiMidCrossLayout(
  opts: ComputeLineStochRsiMidCrossLayoutOptions,
): ChartLineStochRsiMidCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PANEL_GAP;
  const threshold = normalizeLineStochRsiMidCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_THRESHOLD,
  );

  const run = runLineStochRsiMidCross(opts.data, {
    rsiLength: opts.rsiLength ?? undefined,
    stochLength: opts.stochLength ?? undefined,
    kSmoothing: opts.kSmoothing ?? undefined,
    threshold,
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
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const thresholdY = syOscBase(threshold);

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
      stochRsiPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      thresholdY,
      crossMarkers: [],
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

  let pricePath = '';
  const priceDots: ChartLineStochRsiMidCrossDot[] = [];
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

  let stochRsiPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.stochRsi == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.stochRsi);
    stochRsiPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  stochRsiPath = stochRsiPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.stochRsiValues[c.index] ?? 50);
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
    stochRsiPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineStochRsiMidCrossChart(
  data: ChartLineStochRsiMidCrossPoint[],
  options: {
    rsiLength?: number;
    stochLength?: number;
    kSmoothing?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineStochRsiMidCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const rsiLength = normalizeLineStochRsiMidCrossLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiMidCrossLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STOCH_LENGTH,
  );
  const kSmoothing = normalizeLineStochRsiMidCrossLength(
    options.kSmoothing,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_K_SMOOTHING,
  );
  const threshold = normalizeLineStochRsiMidCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_THRESHOLD,
  );
  return (
    `Stochastic RSI Midline Cross chart over ${cleaned.length} ` +
    `bars (rsiLength ${rsiLength}, stochLength ${stochLength}, ` +
    `kSmoothing ${kSmoothing}, threshold ${threshold}). Top ` +
    `panel renders the close with bullish (second-derivative ` +
    `momentum centerline cross up) / bearish (cross down) ` +
    `chevron overlays at every Stochastic RSI midline cross; ` +
    `bottom panel renders the close-only Stochastic RSI line ` +
    `on a fixed 0-100 oscillator with the threshold reference ` +
    `band and marks Stochastic RSI level ${threshold} regime ` +
    `trigger events.`
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

export const ChartLineStochRsiMidCross = forwardRef<
  HTMLDivElement,
  ChartLineStochRsiMidCrossProps
>(function ChartLineStochRsiMidCross(props, ref): ReactNode {
  const {
    data,
    rsiLength = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_RSI_LENGTH,
    stochLength = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STOCH_LENGTH,
    kSmoothing = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_K_SMOOTHING,
    threshold = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_PRICE_COLOR,
    stochRsiColor = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_STOCH_RSI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_STOCH_RSI_MID_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStochRsi = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBands = true,
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
    () => getLineStochRsiMidCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStochRsiMidCrossLayout({
        data: cleaned,
        rsiLength,
        stochLength,
        kSmoothing,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      rsiLength,
      stochLength,
      kSmoothing,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStochRsiMidCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineStochRsiMidCrossSeriesId,
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
    seriesId: ChartLineStochRsiMidCrossSeriesId,
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
        data-section="chart-line-stoch-rsi-mid-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStochRsiMidCrossChart(cleaned, {
      rsiLength,
      stochLength,
      kSmoothing,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showStochRsiLine = !hidden.has('stochRsi') && showStochRsi;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [0, threshold, 100];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Stochastic RSI Midline Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-stoch-rsi-mid-cross"
      data-rsi-length={rsiLength}
      data-stoch-length={stochLength}
      data-k-smoothing={kSmoothing}
      data-threshold={threshold}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-stoch-rsi-mid-cross-title"
      >
        {ariaLabel ?? 'Stochastic RSI Midline Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stoch-rsi-mid-cross-aria-desc"
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
        data-section="chart-line-stoch-rsi-mid-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stoch-rsi-mid-cross-grid">
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
                  data-section="chart-line-stoch-rsi-mid-cross-grid-line-price"
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
                  data-section="chart-line-stoch-rsi-mid-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-stoch-rsi-mid-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-stoch-rsi-mid-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stoch-rsi-mid-cross-axes">
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
                  data-section="chart-line-stoch-rsi-mid-cross-tick-price"
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
                  data-section="chart-line-stoch-rsi-mid-cross-tick-osc"
                >
                  {formatOsc(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-rsi-mid-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stoch-rsi-mid-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stoch-rsi-mid-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showStochRsiLine ? (
          <path
            d={layout.stochRsiPath}
            stroke={stochRsiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-rsi-mid-cross-stoch-rsi-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-stoch-rsi-mid-cross-crosses"
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
                data-section={`chart-line-stoch-rsi-mid-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-stoch-rsi-mid-cross-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                    : `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-stoch-rsi-mid-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stoch-rsi-mid-cross-hover-targets">
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
                data-section="chart-line-stoch-rsi-mid-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stoch-rsi-mid-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={232}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-mid-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-mid-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-mid-cross-tooltip-stoch-rsi"
                >
                  StochRSI{' '}
                  {tooltipSample.stochRsi == null
                    ? '--'
                    : formatOsc(tooltipSample.stochRsi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-mid-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-mid-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-mid-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-mid-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-mid-cross-tooltip-none"
                >
                  warmup {layout.run.noneCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-stoch-rsi-mid-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          rsi {rsiLength} | stoch {stochLength} | k {kSmoothing} | threshold{' '}
          {threshold} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stoch-rsi-mid-cross-legend"
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
              {
                id: 'stochRsi' as const,
                color: stochRsiColor,
                label: 'StochRSI',
              },
            ] satisfies Array<{
              id: ChartLineStochRsiMidCrossSeriesId;
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

ChartLineStochRsiMidCross.displayName = 'ChartLineStochRsiMidCross';
