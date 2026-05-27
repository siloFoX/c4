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
 * ChartLineStochRsiOverboughtCross -- pure-SVG dual-panel chart
 * with the close in the top panel and the close-only
 * Stochastic RSI %K line in the bottom panel, marking bullish
 * (cross up through 80) / bearish (cross down through 80)
 * overbought threshold trigger entry and exit events. K-level
 * 80 crossover variant of the Chande-Kroll Stochastic RSI
 * family that flags the discrete %K crossing of the canonical
 * overbought line.
 *
 * Stochastic RSI applies a stochastic normalisation to the RSI
 * itself, producing a more sensitive `[0, 100]` oscillator:
 *
 *   delta_i      = close_i - close_{i-1}
 *   gain_i       = max(0,  delta_i)
 *   loss_i       = max(0, -delta_i)
 *   avg_gain_i   = Wilder(gain, rsi_length)
 *   avg_loss_i   = Wilder(loss, rsi_length)
 *   rsi_i        = avg_loss == 0
 *                  ? (avg_gain == 0 ? 50 : 100)
 *                  : 100 - 100 / (1 + avg_gain / avg_loss)
 *   stochK_i     = rsi_high == rsi_low
 *                  ? prev_stochK (seed 50)
 *                  : 100 * (rsi - rsi_low) / (rsi_high - rsi_low)
 *   bullish (entry) : prev stochK <= 80 && cur stochK > 80
 *   bearish (exit)  : prev stochK >= 80 && cur stochK < 80
 *
 * Defaults: `rsiLength = 14`, `stochLength = 14` (Chande-Kroll
 * canonical), `threshold = 80` (overbought line). Regime
 * classifier `bullish` (stochK >= 80), `bearish` (stochK < 80),
 * `none` (stochK null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: delta = 0 every bar, both Wilder
 *   averages are 0, RSI lands at 50 via the both-zero
 *   fallback, and the stochastic of a constant rsi locks at
 *   the 50 seed. stochK = 50 sits below the 80 threshold,
 *   regime `bearish` on every valid bar. cross count = 0.
 *   Verified across K = 0..1234.
 * - **LINEAR UP close = i**: gain = 1, loss = 0, RSI = 100
 *   constant, stochK locked at the 50 seed. regime `bearish`.
 * - **LINEAR DOWN close = -i**: RSI = 0 constant, stochK
 *   locked at 50. regime `bearish`. The interesting cross
 *   activity lives in transients (decline-then-rise pushes
 *   stochK above 80 -> bullish entry; rise-then-decline pulls
 *   it below 80 -> bearish exit).
 */

export interface ChartLineStochRsiOverboughtCrossPoint {
  x: number;
  close: number;
}

export type ChartLineStochRsiOverboughtCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineStochRsiOverboughtCrossSeriesId = 'price' | 'stochk';

export type ChartLineStochRsiOverboughtCrossCrossKind =
  | 'bullish'
  | 'bearish';

export interface ChartLineStochRsiOverboughtCrossCross {
  index: number;
  x: number;
  kind: ChartLineStochRsiOverboughtCrossCrossKind;
}

export interface ChartLineStochRsiOverboughtCrossSample {
  index: number;
  x: number;
  close: number;
  rsi: number | null;
  stochK: number | null;
  regime: ChartLineStochRsiOverboughtCrossRegime;
}

export interface ChartLineStochRsiOverboughtCrossRun {
  series: ChartLineStochRsiOverboughtCrossPoint[];
  rsiLength: number;
  stochLength: number;
  threshold: number;
  rsiValues: Array<number | null>;
  stochKValues: Array<number | null>;
  samples: ChartLineStochRsiOverboughtCrossSample[];
  crosses: ChartLineStochRsiOverboughtCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineStochRsiOverboughtCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineStochRsiOverboughtCrossLayout {
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
  priceDots: ChartLineStochRsiOverboughtCrossDot[];
  stochKPath: string;
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
    kind: ChartLineStochRsiOverboughtCrossCrossKind;
  }>;
  run: ChartLineStochRsiOverboughtCrossRun;
}

export interface ChartLineStochRsiOverboughtCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineStochRsiOverboughtCrossPoint[];
  rsiLength?: number;
  stochLength?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  stochKColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStochK?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineStochRsiOverboughtCrossSeriesId[];
  defaultHiddenSeries?: ChartLineStochRsiOverboughtCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineStochRsiOverboughtCrossSeriesId;
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

export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_RSI_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STOCH_LENGTH = 14;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_THRESHOLD = 80;
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PRICE_COLOR =
  '#2563eb';
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STOCHK_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_AXIS_COLOR =
  '#94a3b8';
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_GRID_COLOR =
  '#e2e8f0';
export const DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_MID_COLOR =
  '#cbd5e1';

const STOCH_SEED = 50;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineStochRsiOverboughtCrossFinitePoints(
  data:
    | readonly ChartLineStochRsiOverboughtCrossPoint[]
    | null
    | undefined,
): ChartLineStochRsiOverboughtCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineStochRsiOverboughtCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineStochRsiOverboughtCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineStochRsiOverboughtCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/**
 * Wilder-style smoothed moving average over a values array
 * that may contain leading nulls. SMA-seeded at index
 * `firstValidIdx + length - 1`, then recursively
 * `(prev * (length - 1) + value) / length`.
 */
export function applyLineStochRsiOverboughtCrossWilder(
  values: readonly (number | null)[],
  length: number,
  firstValidIdx: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (firstValidIdx + length - 1 >= values.length) return out;
  let sum = 0;
  for (let j = firstValidIdx; j < firstValidIdx + length; j += 1) {
    const v = values[j];
    if (v == null) return out;
    sum += v;
  }
  const seedIdx = firstValidIdx + length - 1;
  let prev = sum / length;
  out[seedIdx] = posZero(prev);
  for (let i = seedIdx + 1; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) continue;
    prev = (prev * (length - 1) + v) / length;
    out[i] = posZero(prev);
  }
  return out;
}

export interface LineStochRsiOverboughtCrossChannels {
  rsi: Array<number | null>;
  stochK: Array<number | null>;
  rsiLength: number;
  stochLength: number;
}

export function computeLineStochRsiOverboughtCross(
  series:
    | readonly ChartLineStochRsiOverboughtCrossPoint[]
    | null
    | undefined,
  options: { rsiLength?: number; stochLength?: number } = {},
): LineStochRsiOverboughtCrossChannels {
  const cleaned = getLineStochRsiOverboughtCrossFinitePoints(series);
  const rsiLength = normalizeLineStochRsiOverboughtCrossLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiOverboughtCrossLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STOCH_LENGTH,
  );
  if (cleaned.length === 0) {
    return { rsi: [], stochK: [], rsiLength, stochLength };
  }
  const n = cleaned.length;
  const closes = cleaned.map((p) => p.close);

  // Gain / loss series (valid from i = 1).
  const gain: Array<number | null> = new Array(n).fill(null);
  const loss: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) continue;
    const d = cur - prev;
    gain[i] = posZero(Math.max(0, d));
    loss[i] = posZero(Math.max(0, -d));
  }
  const avgGain = applyLineStochRsiOverboughtCrossWilder(
    gain,
    rsiLength,
    1,
  );
  const avgLoss = applyLineStochRsiOverboughtCrossWilder(
    loss,
    rsiLength,
    1,
  );

  const rsi: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (g == null || l == null) continue;
    if (l === 0) {
      rsi[i] = g === 0 ? 50 : 100;
    } else if (g === 0) {
      rsi[i] = 0;
    } else {
      rsi[i] = posZero(100 - 100 / (1 + g / l));
    }
  }

  // Stochastic over the rolling rsi window.
  const stochK: Array<number | null> = new Array(n).fill(null);
  let prevStochK = STOCH_SEED;
  for (let i = 0; i < n; i += 1) {
    if (i < rsiLength + stochLength - 1) continue;
    let winMin = Infinity;
    let winMax = -Infinity;
    let allValid = true;
    for (let j = i - stochLength + 1; j <= i; j += 1) {
      const v = rsi[j];
      if (v == null) {
        allValid = false;
        break;
      }
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!allValid) continue;
    const cur = rsi[i]!;
    const range = winMax - winMin;
    const k = range === 0 ? prevStochK : 100 * ((cur - winMin) / range);
    stochK[i] = posZero(k);
    prevStochK = k;
  }

  return { rsi, stochK, rsiLength, stochLength };
}

export function classifyLineStochRsiOverboughtCrossRegime(
  stochK: number | null,
  threshold: number,
): ChartLineStochRsiOverboughtCrossRegime {
  if (stochK == null) return 'none';
  if (stochK >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineStochRsiOverboughtCrossCrosses(
  series: readonly ChartLineStochRsiOverboughtCrossPoint[],
  stochK: readonly (number | null)[],
  threshold: number,
): ChartLineStochRsiOverboughtCrossCross[] {
  const out: ChartLineStochRsiOverboughtCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = stochK[i - 1];
    const cur = stochK[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineStochRsiOverboughtCross(
  data: ChartLineStochRsiOverboughtCrossPoint[],
  options: {
    rsiLength?: number;
    stochLength?: number;
    threshold?: number;
  } = {},
): ChartLineStochRsiOverboughtCrossRun {
  const cleaned = getLineStochRsiOverboughtCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineStochRsiOverboughtCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_THRESHOLD,
  );
  const channels = computeLineStochRsiOverboughtCross(series, {
    rsiLength: options.rsiLength ?? undefined,
    stochLength: options.stochLength ?? undefined,
  });

  const samples: ChartLineStochRsiOverboughtCrossSample[] = series.map(
    (p, i) => {
      const r = channels.rsi[i] ?? null;
      const k = channels.stochK[i] ?? null;
      return {
        index: i,
        x: p.x,
        close: p.close,
        rsi: r,
        stochK: k,
        regime: classifyLineStochRsiOverboughtCrossRegime(k, threshold),
      };
    },
  );

  const crosses = detectLineStochRsiOverboughtCrossCrosses(
    series,
    channels.stochK,
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

  const ok = series.length > channels.rsiLength + channels.stochLength;

  return {
    series,
    rsiLength: channels.rsiLength,
    stochLength: channels.stochLength,
    threshold,
    rsiValues: channels.rsi,
    stochKValues: channels.stochK,
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

export interface ComputeLineStochRsiOverboughtCrossLayoutOptions {
  data: ChartLineStochRsiOverboughtCrossPoint[];
  rsiLength?: number;
  stochLength?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineStochRsiOverboughtCrossLayout(
  opts: ComputeLineStochRsiOverboughtCrossLayoutOptions,
): ChartLineStochRsiOverboughtCrossLayout {
  const width =
    opts.width ?? DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PADDING;
  const panelGap =
    opts.panelGap ??
    DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PANEL_GAP;
  const threshold = normalizeLineStochRsiOverboughtCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_THRESHOLD,
  );

  const run = runLineStochRsiOverboughtCross(opts.data, {
    rsiLength: opts.rsiLength ?? undefined,
    stochLength: opts.stochLength ?? undefined,
    threshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // Stoch %K is bounded to [0, 100] by construction. Fixed
  // range with the threshold line drawn at its absolute level.
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
      stochKPath: '',
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
  const priceDots: ChartLineStochRsiOverboughtCrossDot[] = [];
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

  let stochKPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.stochK == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.stochK);
    stochKPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  stochKPath = stochKPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.stochKValues[c.index] ?? threshold);
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
    stochKPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineStochRsiOverboughtCrossChart(
  data: ChartLineStochRsiOverboughtCrossPoint[],
  options: {
    rsiLength?: number;
    stochLength?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineStochRsiOverboughtCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const rsiLength = normalizeLineStochRsiOverboughtCrossLength(
    options.rsiLength,
    DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_RSI_LENGTH,
  );
  const stochLength = normalizeLineStochRsiOverboughtCrossLength(
    options.stochLength,
    DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STOCH_LENGTH,
  );
  const threshold = normalizeLineStochRsiOverboughtCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_THRESHOLD,
  );
  return (
    `Stoch RSI Overbought Cross chart over ${cleaned.length} bars ` +
    `(rsiLength ${rsiLength}, stochLength ${stochLength}, ` +
    `threshold ${threshold}). Top panel renders the close with ` +
    `bullish (overbought K level cross up = entry) / bearish ` +
    `(cross down = exit) chevron overlays at every Stochastic ` +
    `RSI %K threshold crossover; bottom panel renders the ` +
    `close-only %K line on a fixed 0 to 100 oscillator with the ` +
    `${threshold} overbought reference band and marks %K level ` +
    `${threshold} trigger events.`
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

export const ChartLineStochRsiOverboughtCross = forwardRef<
  HTMLDivElement,
  ChartLineStochRsiOverboughtCrossProps
>(function ChartLineStochRsiOverboughtCross(props, ref): ReactNode {
  const {
    data,
    rsiLength = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_RSI_LENGTH,
    stochLength = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STOCH_LENGTH,
    threshold = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_PRICE_COLOR,
    stochKColor = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_STOCHK_COLOR,
    bullishColor = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_STOCH_RSI_OVERBOUGHT_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStochK = true,
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
    () => getLineStochRsiOverboughtCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineStochRsiOverboughtCrossLayout({
        data: cleaned,
        rsiLength,
        stochLength,
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
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineStochRsiOverboughtCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineStochRsiOverboughtCrossSeriesId,
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
    seriesId: ChartLineStochRsiOverboughtCrossSeriesId,
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
        data-section="chart-line-stoch-rsi-overbought-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineStochRsiOverboughtCrossChart(cleaned, {
      rsiLength,
      stochLength,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showStochKLine = !hidden.has('stochk') && showStochK;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, threshold, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Stoch RSI Overbought Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-stoch-rsi-overbought-cross"
      data-rsi-length={rsiLength}
      data-stoch-length={stochLength}
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
        data-section="chart-line-stoch-rsi-overbought-cross-title"
      >
        {ariaLabel ?? 'Stoch RSI Overbought Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-stoch-rsi-overbought-cross-aria-desc"
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
        data-section="chart-line-stoch-rsi-overbought-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-stoch-rsi-overbought-cross-grid">
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
                  data-section="chart-line-stoch-rsi-overbought-cross-grid-line-price"
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
                  data-section="chart-line-stoch-rsi-overbought-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-stoch-rsi-overbought-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-stoch-rsi-overbought-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-stoch-rsi-overbought-cross-axes">
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
                  data-section="chart-line-stoch-rsi-overbought-cross-tick-price"
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
                  data-section="chart-line-stoch-rsi-overbought-cross-tick-osc"
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
            data-section="chart-line-stoch-rsi-overbought-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-stoch-rsi-overbought-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-stoch-rsi-overbought-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showStochKLine ? (
          <path
            d={layout.stochKPath}
            stroke={stochKColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-stoch-rsi-overbought-cross-stochk-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-stoch-rsi-overbought-cross-crosses"
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
                data-section={`chart-line-stoch-rsi-overbought-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-stoch-rsi-overbought-cross-overlay-crosses"
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
                data-section={`chart-line-stoch-rsi-overbought-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-stoch-rsi-overbought-cross-hover-targets">
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
                data-section="chart-line-stoch-rsi-overbought-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-stoch-rsi-overbought-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-overbought-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-overbought-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-overbought-cross-tooltip-rsi"
                >
                  RSI{' '}
                  {tooltipSample.rsi == null
                    ? '--'
                    : formatOsc(tooltipSample.rsi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-overbought-cross-tooltip-stochk"
                >
                  %K{' '}
                  {tooltipSample.stochK == null
                    ? '--'
                    : formatOsc(tooltipSample.stochK)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-overbought-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-overbought-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-overbought-cross-tooltip-entries"
                >
                  entries {layout.run.bullishCrossCount} | exits{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-overbought-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-stoch-rsi-overbought-cross-tooltip-params"
                >
                  rsi {layout.run.rsiLength} | stoch{' '}
                  {layout.run.stochLength} | T {layout.run.threshold}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-stoch-rsi-overbought-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          rsi {rsiLength} | stoch {stochLength} | threshold {threshold} |
          crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-stoch-rsi-overbought-cross-legend"
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
              { id: 'stochk' as const, color: stochKColor, label: '%K' },
            ] satisfies Array<{
              id: ChartLineStochRsiOverboughtCrossSeriesId;
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

ChartLineStochRsiOverboughtCross.displayName =
  'ChartLineStochRsiOverboughtCross';
