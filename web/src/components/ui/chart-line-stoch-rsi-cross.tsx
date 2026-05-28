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
 * ChartLineStochRsiCross -- pure-SVG dual-panel chart with the
 * close on top and the Stochastic RSI %K / %D pair on the bottom.
 * Markers fire at every K-vs-D crossover and carry a trigger tag
 * derived from the zone of %K at the cross bar:
 *
 *   gain[i]   = max(0, close[i] - close[i-1])
 *   loss[i]   = max(0, close[i-1] - close[i])
 *   avgGain   = Wilder(gain, rsiLength)
 *   avgLoss   = Wilder(loss, rsiLength)
 *   RSI       = avgGain === 0 && avgLoss === 0 ? 50
 *             : avgLoss === 0                  ? 100
 *             : avgGain === 0                  ? 0
 *             : 100 - 100 / (1 + avgGain/avgLoss)
 *   stochRsi  = max(RSI, stochLength) === min(RSI, stochLength) ? null
 *             : (RSI - min) / (max - min) * 100
 *   %K        = SMA(stochRsi, kSmooth)
 *   %D        = SMA(%K, dSmooth)
 *
 * Cross events: `up` (K newly exceeds D), `down` (K newly drops
 * below D). Trigger tag:
 *   - `oversold-exit` if %K <= oversoldLevel on an `up` cross
 *   - `overbought-exit` if %K >= overboughtLevel on a `down` cross
 *   - `neutral` otherwise (cross in the mid-zone).
 *
 * Bit-exact anchors (with the `min === max` precision fix in both
 * Wilder and SMA helpers):
 *
 * - **CONST close = K**: gain/loss = 0 -> RSI = 50 every bar.
 *   The Stoch window over the constant RSI has range = 0 ->
 *   `stochRsi = null` forever. %K = null, %D = null. Zero crosses,
 *   regime `none` for every bar.
 * - **LINEAR UP close = i+1**: every gain = 1, loss = 0 -> RSI
 *   = 100 every bar. Stoch range = 0 -> null forever -> zero
 *   crosses.
 * - **LINEAR DOWN close = N-i**: mirror image, RSI = 0, range = 0
 *   -> null, zero crosses.
 */

export interface ChartLineStochRsiCrossPoint {
  x: number;
  close: number;
}

export type ChartLineStochRsiCrossRelation =
  | 'bullish'
  | 'bearish'
  | 'equal'
  | 'none';

export type ChartLineStochRsiCrossCross = 'up' | 'down' | null;

export type ChartLineStochRsiCrossZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineStochRsiCrossTrigger =
  | 'oversold-exit'
  | 'overbought-exit'
  | 'neutral'
  | null;

export type ChartLineStochRsiCrossSeriesId = 'price' | 'k' | 'd';

export interface ChartLineStochRsiCrossSample {
  index: number;
  x: number;
  close: number;
  rsi: number | null;
  stochRsi: number | null;
  k: number | null;
  d: number | null;
  relation: ChartLineStochRsiCrossRelation;
  zone: ChartLineStochRsiCrossZone;
  crossed: ChartLineStochRsiCrossCross;
  trigger: ChartLineStochRsiCrossTrigger;
}

export interface ChartLineStochRsiCrossRun {
  series: ChartLineStochRsiCrossPoint[];
  rsiLength: number;
  stochLength: number;
  kSmooth: number;
  dSmooth: number;
  overboughtLevel: number;
  oversoldLevel: number;
  rsiValues: Array<number | null>;
  stochRsiValues: Array<number | null>;
  kValues: Array<number | null>;
  dValues: Array<number | null>;
  samples: ChartLineStochRsiCrossSample[];
  upCrossCount: number;
  downCrossCount: number;
  oversoldExitCount: number;
  overboughtExitCount: number;
  neutralTriggerCount: number;
  overboughtCount: number;
  oversoldCount: number;
  neutralZoneCount: number;
  noneZoneCount: number;
  ok: boolean;
}

export interface ChartLineStochRsiCrossMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  k: number;
  kind: 'up' | 'down';
  trigger: NonNullable<ChartLineStochRsiCrossTrigger>;
}

export interface ChartLineStochRsiCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochRsiCrossLayout {
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
  priceDots: ChartLineStochRsiCrossDot[];
  kPath: string;
  dPath: string;
  markers: ChartLineStochRsiCrossMarker[];
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  overboughtY: number;
  oversoldY: number;
  midlineY: number;
  run: ChartLineStochRsiCrossRun;
}

export interface ChartLineStochRsiCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochRsiCrossPoint[];
  rsiLength?: number;
  stochLength?: number;
  kSmooth?: number;
  dSmooth?: number;
  overboughtLevel?: number;
  oversoldLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  markerRadius?: number;
  priceColor?: string;
  kColor?: string;
  dColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  midlineColor?: string;
  oversoldExitColor?: string;
  overboughtExitColor?: string;
  neutralTriggerColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showK?: boolean;
  showD?: boolean;
  showMarkers?: boolean;
  showOverbought?: boolean;
  showOversold?: boolean;
  showMidline?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochRsiCrossSeriesId[];
  defaultHiddenSeries?: ChartLineStochRsiCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochRsiCrossSeriesId;
    hidden: boolean;
  }) => void;
  onCrossClick?: (detail: { point: ChartLineStochRsiCrossSample }) => void;
  formatPrice?: (value: number) => string;
  formatStoch?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_MARKER_RADIUS = 5;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_RSI_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_STOCH_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_K_SMOOTH = 3;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_D_SMOOTH = 3;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERBOUGHT_LEVEL = 80;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERSOLD_LEVEL = 20;
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_K_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_D_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_MIDLINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERSOLD_EXIT_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERBOUGHT_EXIT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_NEUTRAL_TRIGGER_COLOR = '#475569';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_RSI_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineStochRsiCrossFinitePoints(
  data: readonly ChartLineStochRsiCrossPoint[] | null | undefined,
): ChartLineStochRsiCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochRsiCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 2). */
export function normalizeLineStochRsiCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a positive integer smoothing length (>= 1). */
export function normalizeLineStochRsiCrossSmooth(
  smooth: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(smooth) && smooth >= 1) return Math.floor(smooth);
  return fallback;
}

/** Coerce a finite level in [0, 100]. */
export function normalizeLineStochRsiCrossLevel(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0 && value <= 100) return value;
  return fallback;
}

/**
 * Wilder smoothing with SMA seed + `min === max` precision fix.
 */
export function applyLineStochRsiCrossWilder(
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

/** Rolling SMA with `min === max` window-constant precision fix. */
export function applyLineStochRsiCrossSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let winMin = Infinity;
    let winMax = -Infinity;
    let ok = true;
    for (let k = i - length + 1; k <= i; k += 1) {
      const v = values[k];
      if (v == null) {
        ok = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!ok) continue;
    out[i] =
      winMin === winMax && Number.isFinite(winMin)
        ? winMin
        : posZero(sum / length);
  }
  return out;
}

/** Per-bar (gain, loss). [0] is null (no prev). */
export function applyLineStochRsiCrossGainLoss(
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
export function applyLineStochRsiCrossRsi(
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

/**
 * Raw Stochastic RSI = (RSI - rsiLow) / (rsiHigh - rsiLow) * 100.
 * Null when the lookback window is incomplete or has zero range.
 */
export function applyLineStochRsiCrossStoch(
  rsiValues: readonly (number | null)[],
  stochLength: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(rsiValues.length).fill(null);
  if (stochLength < 1) return out;
  for (let i = stochLength - 1; i < rsiValues.length; i += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    let ok = true;
    for (let k = i - stochLength + 1; k <= i; k += 1) {
      const v = rsiValues[k];
      if (v == null) {
        ok = false;
        break;
      }
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (!ok) continue;
    const cur = rsiValues[i];
    if (cur == null) continue;
    const range = hi - lo;
    if (range === 0) continue;
    out[i] = posZero(((cur - lo) / range) * 100);
  }
  return out;
}

export interface LineStochRsiCrossChannels {
  rsi: Array<number | null>;
  stochRsi: Array<number | null>;
  k: Array<number | null>;
  d: Array<number | null>;
}

export function computeLineStochRsiCross(
  series: readonly ChartLineStochRsiCrossPoint[] | null | undefined,
  options: {
    rsiLength?: number;
    stochLength?: number;
    kSmooth?: number;
    dSmooth?: number;
  } = {},
): LineStochRsiCrossChannels {
  const cleaned = getLineStochRsiCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { rsi: [], stochRsi: [], k: [], d: [] };
  }
  const rsiLength = normalizeLineStochRsiCrossLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiCrossLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_STOCH_LENGTH,
  );
  const kSmooth = normalizeLineStochRsiCrossSmooth(
    options.kSmooth,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_K_SMOOTH,
  );
  const dSmooth = normalizeLineStochRsiCrossSmooth(
    options.dSmooth,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_D_SMOOTH,
  );

  const closes = cleaned.map((p) => p.close);
  const { gain, loss } = applyLineStochRsiCrossGainLoss(closes);
  const avgGain = applyLineStochRsiCrossWilder(gain, rsiLength);
  const avgLoss = applyLineStochRsiCrossWilder(loss, rsiLength);
  const rsi = applyLineStochRsiCrossRsi(avgGain, avgLoss);
  const stochRsi = applyLineStochRsiCrossStoch(rsi, stochLength);
  const k = applyLineStochRsiCrossSma(stochRsi, kSmooth);
  const d = applyLineStochRsiCrossSma(k, dSmooth);
  return { rsi, stochRsi, k, d };
}

export function classifyLineStochRsiCrossRelation(
  k: number | null,
  d: number | null,
): ChartLineStochRsiCrossRelation {
  if (k == null || d == null) return 'none';
  if (k > d) return 'bullish';
  if (k < d) return 'bearish';
  return 'equal';
}

export function classifyLineStochRsiCrossZone(
  k: number | null,
  overboughtLevel: number,
  oversoldLevel: number,
): ChartLineStochRsiCrossZone {
  if (k == null) return 'none';
  if (k >= overboughtLevel) return 'overbought';
  if (k <= oversoldLevel) return 'oversold';
  return 'neutral';
}

export function classifyLineStochRsiCrossTrigger(
  cross: ChartLineStochRsiCrossCross,
  k: number | null,
  overboughtLevel: number,
  oversoldLevel: number,
): ChartLineStochRsiCrossTrigger {
  if (cross == null || k == null) return null;
  if (cross === 'up' && k <= oversoldLevel) return 'oversold-exit';
  if (cross === 'down' && k >= overboughtLevel) return 'overbought-exit';
  return 'neutral';
}

export function detectLineStochRsiCrossCrosses(
  kValues: readonly (number | null)[],
  dValues: readonly (number | null)[],
): ChartLineStochRsiCrossCross[] {
  const out: ChartLineStochRsiCrossCross[] = [];
  let prevK: number | null = null;
  let prevD: number | null = null;
  for (let i = 0; i < kValues.length; i += 1) {
    const k = kValues[i];
    const d = dValues[i];
    if (k == null || d == null) {
      out.push(null);
      prevK = null;
      prevD = null;
      continue;
    }
    if (prevK == null || prevD == null) {
      out.push(null);
      prevK = k;
      prevD = d;
      continue;
    }
    if (prevK <= prevD && k > d) {
      out.push('up');
    } else if (prevK >= prevD && k < d) {
      out.push('down');
    } else {
      out.push(null);
    }
    prevK = k;
    prevD = d;
  }
  return out;
}

export function runLineStochRsiCross(
  data: ChartLineStochRsiCrossPoint[],
  options: {
    rsiLength?: number;
    stochLength?: number;
    kSmooth?: number;
    dSmooth?: number;
    overboughtLevel?: number;
    oversoldLevel?: number;
  } = {},
): ChartLineStochRsiCrossRun {
  const cleaned = getLineStochRsiCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const rsiLength = normalizeLineStochRsiCrossLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiCrossLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_STOCH_LENGTH,
  );
  const kSmooth = normalizeLineStochRsiCrossSmooth(
    options.kSmooth,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_K_SMOOTH,
  );
  const dSmooth = normalizeLineStochRsiCrossSmooth(
    options.dSmooth,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_D_SMOOTH,
  );
  const overboughtLevel = normalizeLineStochRsiCrossLevel(
    options.overboughtLevel,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERBOUGHT_LEVEL,
  );
  const oversoldLevel = normalizeLineStochRsiCrossLevel(
    options.oversoldLevel,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERSOLD_LEVEL,
  );

  const channels = computeLineStochRsiCross(series, {
    rsiLength,
    stochLength,
    kSmooth,
    dSmooth,
  });
  const crosses = detectLineStochRsiCrossCrosses(channels.k, channels.d);

  const samples: ChartLineStochRsiCrossSample[] = series.map((p, i) => {
    const rsi = channels.rsi[i] ?? null;
    const stochRsi = channels.stochRsi[i] ?? null;
    const k = channels.k[i] ?? null;
    const d = channels.d[i] ?? null;
    const relation = classifyLineStochRsiCrossRelation(k, d);
    const zone = classifyLineStochRsiCrossZone(
      k,
      overboughtLevel,
      oversoldLevel,
    );
    const crossed = crosses[i] ?? null;
    const trigger = classifyLineStochRsiCrossTrigger(
      crossed,
      k,
      overboughtLevel,
      oversoldLevel,
    );
    return {
      index: i,
      x: p.x,
      close: p.close,
      rsi,
      stochRsi,
      k,
      d,
      relation,
      zone,
      crossed,
      trigger,
    };
  });

  let upCrossCount = 0;
  let downCrossCount = 0;
  let oversoldExitCount = 0;
  let overboughtExitCount = 0;
  let neutralTriggerCount = 0;
  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralZoneCount = 0;
  let noneZoneCount = 0;
  for (const s of samples) {
    if (s.crossed === 'up') upCrossCount += 1;
    else if (s.crossed === 'down') downCrossCount += 1;
    if (s.trigger === 'oversold-exit') oversoldExitCount += 1;
    else if (s.trigger === 'overbought-exit') overboughtExitCount += 1;
    else if (s.trigger === 'neutral') neutralTriggerCount += 1;
    if (s.zone === 'overbought') overboughtCount += 1;
    else if (s.zone === 'oversold') oversoldCount += 1;
    else if (s.zone === 'neutral') neutralZoneCount += 1;
    else noneZoneCount += 1;
  }

  const ok =
    series.length > rsiLength + stochLength + kSmooth + dSmooth;

  return {
    series = [],
    rsiLength,
    stochLength,
    kSmooth,
    dSmooth,
    overboughtLevel,
    oversoldLevel,
    rsiValues: channels.rsi,
    stochRsiValues: channels.stochRsi,
    kValues: channels.k,
    dValues: channels.d,
    samples,
    upCrossCount,
    downCrossCount,
    oversoldExitCount,
    overboughtExitCount,
    neutralTriggerCount,
    overboughtCount,
    oversoldCount,
    neutralZoneCount,
    noneZoneCount,
    ok,
  };
}

export interface ComputeLineStochRsiCrossLayoutOptions {
  data: ChartLineStochRsiCrossPoint[];
  rsiLength?: number;
  stochLength?: number;
  kSmooth?: number;
  dSmooth?: number;
  overboughtLevel?: number;
  oversoldLevel?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStochRsiCrossLayout(
  opts: ComputeLineStochRsiCrossLayoutOptions,
): ChartLineStochRsiCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_STOCH_RSI_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_STOCH_RSI_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_STOCH_RSI_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_STOCH_RSI_CROSS_PANEL_GAP;

  const run = runLineStochRsiCross(opts.data, {
    rsiLength: opts.rsiLength ?? undefined,
    stochLength: opts.stochLength ?? undefined,
    kSmooth: opts.kSmooth ?? undefined,
    dSmooth: opts.dSmooth ?? undefined,
    overboughtLevel: opts.overboughtLevel ?? undefined,
    oversoldLevel: opts.oversoldLevel ?? undefined,
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
      kPath: '',
      dPath: '',
      markers: [],
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      overboughtY: 0,
      oversoldY: 0,
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
  const priceDots: ChartLineStochRsiCrossDot[] = [];
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

  const buildPath = (key: 'k' | 'd'): string => {
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

  const kPath = buildPath('k');
  const dPath = buildPath('d');

  const markers: ChartLineStochRsiCrossMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.k == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syOsc(s.k),
      k: s.k,
      kind: s.crossed,
      trigger: s.trigger ?? 'neutral',
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
    kPath,
    dPath,
    markers,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    overboughtY: syOsc(run.overboughtLevel),
    oversoldY: syOsc(run.oversoldLevel),
    midlineY: syOsc(50),
    run,
  };
}

export function describeLineStochRsiCrossChart(
  data: ChartLineStochRsiCrossPoint[],
  options: {
    rsiLength?: number;
    stochLength?: number;
    kSmooth?: number;
    dSmooth?: number;
    overboughtLevel?: number;
    oversoldLevel?: number;
  } = {},
): string {
  const cleaned = getLineStochRsiCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const rsiLength = normalizeLineStochRsiCrossLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiCrossLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_STOCH_LENGTH,
  );
  const kSmooth = normalizeLineStochRsiCrossSmooth(
    options.kSmooth,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_K_SMOOTH,
  );
  const dSmooth = normalizeLineStochRsiCrossSmooth(
    options.dSmooth,
    DEFAULT_CHART_LINE_STOCH_RSI_CROSS_D_SMOOTH,
  );
  return (
    `Stoch RSI Cross chart over ${cleaned.length} bars ` +
    `(rsiLength ${rsiLength}, stochLength ${stochLength}, kSmooth ` +
    `${kSmooth}, dSmooth ${dSmooth}). Top panel renders the close; ` +
    `bottom panel renders Stochastic RSI %K and %D with markers at ` +
    `every K-vs-D cross, tagged oversold-exit when up cross at low ` +
    `%K, overbought-exit when down cross at high %K, neutral otherwise.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultStochFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineStochRsiCross = forwardRef<
  HTMLDivElement,
  ChartLineStochRsiCrossProps
>(function ChartLineStochRsiCross(props, ref): ReactNode {
  const {
    data,
    rsiLength = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_RSI_LENGTH,
    stochLength = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_STOCH_LENGTH,
    kSmooth = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_K_SMOOTH,
    dSmooth = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_D_SMOOTH,
    overboughtLevel = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERBOUGHT_LEVEL,
    oversoldLevel = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERSOLD_LEVEL,
    width = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_DOT_RADIUS,
    markerRadius = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_MARKER_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_PRICE_COLOR,
    kColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_K_COLOR,
    dColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_D_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERSOLD_COLOR,
    midlineColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_MIDLINE_COLOR,
    oversoldExitColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERSOLD_EXIT_COLOR,
    overboughtExitColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_OVERBOUGHT_EXIT_COLOR,
    neutralTriggerColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_NEUTRAL_TRIGGER_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_RSI_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showK = true,
    showD = true,
    showMarkers = true,
    showOverbought = true,
    showOversold = true,
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
    formatStoch = defaultStochFormatter,
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
    () => getLineStochRsiCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStochRsiCrossLayout({
        data: cleaned,
        rsiLength,
        stochLength,
        kSmooth,
        dSmooth,
        overboughtLevel,
        oversoldLevel,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      rsiLength,
      stochLength,
      kSmooth,
      dSmooth,
      overboughtLevel,
      oversoldLevel,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStochRsiCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineStochRsiCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineStochRsiCrossSeriesId,
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
        data-section="chart-line-stoch-rsi-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStochRsiCrossChart(cleaned, {
      rsiLength,
      stochLength,
      kSmooth,
      dSmooth,
      overboughtLevel,
      oversoldLevel,
    });

  const showPrice = !hidden.has('price');
  const showKLine = !hidden.has('k') && showK;
  const showDLine = !hidden.has('d') && showD;

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

  const markerColor = (
    trigger: NonNullable<ChartLineStochRsiCrossTrigger>,
  ): string => {
    if (trigger === 'oversold-exit') return oversoldExitColor;
    if (trigger === 'overbought-exit') return overboughtExitColor;
    return neutralTriggerColor;
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Stochastic RSI Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-stoch-rsi-cross"
      data-rsi-length={rsiLength}
      data-stoch-length={stochLength}
      data-k-smooth={kSmooth}
      data-d-smooth={dSmooth}
      data-overbought-level={overboughtLevel}
      data-oversold-level={oversoldLevel}
      data-total-points={cleaned.length}
      data-up-cross-count={layout.run.upCrossCount}
      data-down-cross-count={layout.run.downCrossCount}
      data-oversold-exit-count={layout.run.oversoldExitCount}
      data-overbought-exit-count={layout.run.overboughtExitCount}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-stoch-rsi-cross-title"
      >
        {ariaLabel ?? 'Stochastic RSI Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stoch-rsi-cross-aria-desc"
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
        data-section="chart-line-stoch-rsi-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stoch-rsi-cross-grid">
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
                  data-section="chart-line-stoch-rsi-cross-grid-line-price"
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
                  data-section="chart-line-stoch-rsi-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stoch-rsi-cross-axes">
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
                  data-section="chart-line-stoch-rsi-cross-tick-price"
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
                  data-section="chart-line-stoch-rsi-cross-tick-osc"
                >
                  {formatStoch(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showOverbought ? (
          <line
            x1={layout.innerLeft}
            y1={layout.overboughtY}
            x2={layout.innerRight}
            y2={layout.overboughtY}
            stroke={overboughtColor}
            strokeDasharray="3 3"
            data-section="chart-line-stoch-rsi-cross-overbought"
          />
        ) : null}

        {showOversold ? (
          <line
            x1={layout.innerLeft}
            y1={layout.oversoldY}
            x2={layout.innerRight}
            y2={layout.oversoldY}
            stroke={oversoldColor}
            strokeDasharray="3 3"
            data-section="chart-line-stoch-rsi-cross-oversold"
          />
        ) : null}

        {showMidline ? (
          <line
            x1={layout.innerLeft}
            y1={layout.midlineY}
            x2={layout.innerRight}
            y2={layout.midlineY}
            stroke={midlineColor}
            strokeDasharray="2 4"
            data-section="chart-line-stoch-rsi-cross-midline"
          />
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-rsi-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stoch-rsi-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stoch-rsi-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showDLine ? (
          <path
            d={layout.dPath}
            stroke={dColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-rsi-cross-d"
          />
        ) : null}

        {showKLine ? (
          <path
            d={layout.kPath}
            stroke={kColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-rsi-cross-k"
          />
        ) : null}

        {showMarkers ? (
          <g data-section="chart-line-stoch-rsi-cross-markers">
            {layout.markers.map((m) => (
              <circle
                key={`marker-${m.index}-${m.kind}`}
                cx={m.cx}
                cy={m.cy}
                r={markerRadius}
                fill={markerColor(m.trigger)}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onCrossClick?.({ point: sample });
                }}
                data-section="chart-line-stoch-rsi-cross-marker"
                data-kind={m.kind}
                data-trigger={m.trigger}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stoch-rsi-cross-hover-targets">
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
                data-section="chart-line-stoch-rsi-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stoch-rsi-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={210}
                  height={172}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-rsi"
                >
                  rsi{' '}
                  {tooltipSample.rsi == null
                    ? '--'
                    : formatStoch(tooltipSample.rsi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-stochrsi"
                >
                  stochRsi{' '}
                  {tooltipSample.stochRsi == null
                    ? '--'
                    : formatStoch(tooltipSample.stochRsi)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-k"
                >
                  %K{' '}
                  {tooltipSample.k == null
                    ? '--'
                    : formatStoch(tooltipSample.k)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-d"
                >
                  %D{' '}
                  {tooltipSample.d == null
                    ? '--'
                    : formatStoch(tooltipSample.d)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-relation"
                >
                  relation {tooltipSample.relation}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
                <text
                  x={12}
                  y={142}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-trigger"
                >
                  trigger {tooltipSample.trigger ?? '--'}
                </text>
                <text
                  x={12}
                  y={156}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-cross-tooltip-counts"
                >
                  oversold-exit {layout.run.oversoldExitCount} |
                  overbought-exit {layout.run.overboughtExitCount}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-stoch-rsi-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          rsi {rsiLength} | stoch {stochLength} | %K {kSmooth} | %D{' '}
          {dSmooth} | OB {overboughtLevel} | OS {oversoldLevel} | up{' '}
          {layout.run.upCrossCount} | down {layout.run.downCrossCount}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stoch-rsi-cross-legend"
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
              { id: 'k' as const, color: kColor, label: '%K' },
              { id: 'd' as const, color: dColor, label: '%D' },
            ] satisfies Array<{
              id: ChartLineStochRsiCrossSeriesId;
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

ChartLineStochRsiCross.displayName = 'ChartLineStochRsiCross';
