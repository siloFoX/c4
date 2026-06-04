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
 * ChartLineKvoDivergenceCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the Stephen Klinger Volume
 * Oscillator (KVO) line in the bottom panel, marking bullish
 * (price down + KVO up, potential bottom reversal warning) /
 * bearish (price up + KVO down, potential top reversal warning)
 * divergence cross events. Divergence variant of the volume
 * momentum family that flags discrete price-vs-KVO direction
 * disagreement transitions over a configurable look-back window.
 *
 *   typical[i]   = (high[i] + low[i] + close[i]) / 3
 *   direction[i] = sign(typical[i] - typical[i-1])
 *   vf[i]        = direction[i] * volume[i]
 *   fastSma[i]   = SMA(vf, fastLength)
 *   slowSma[i]   = SMA(vf, slowLength)
 *   kvo[i]       = fastSma - slowSma
 *   priceUp      = close[i] > close[i-window]
 *   kvoUp        = kvo[i]   > kvo[i-window]
 *   state
 *     aligned-bullish    : priceUp && kvoUp
 *     aligned-bearish    : !priceUp && !kvoUp
 *     divergent-bullish  : !priceUp && kvoUp   (price down, KVO up)
 *     divergent-bearish  : priceUp && !kvoUp   (price up, KVO down)
 *   bullish-cross : prev != 'divergent-bullish' && cur == 'divergent-bullish'
 *   bearish-cross : prev != 'divergent-bearish' && cur == 'divergent-bearish'
 *
 * Defaults: `fastLength = 34`, `slowLength = 55` (Klinger's
 * canonical KVO windows), `divergenceWindow = 5`. Crosses never
 * fire when prev state is `none` (insufficient data). Warmup is
 * `slowLength`: the slow SMA needs `slowLength` valid volume
 * force samples starting at index 1 (vf is null at index 0
 * because the typical-price delta is undefined there).
 *
 * Bit-exact anchor:
 *
 * - **CONST HLC = K, volume = V**: delta typical = 0 ->
 *   direction = 0 -> vf = 0 -> fastSma = slowSma = 0 ->
 *   kvo = 0. priceUp = false (close[i] === close[i-5]),
 *   kvoUp = false (0 === 0) -> regime `aligned-bearish` (no
 *   volume momentum). 0 divergence crosses. Verified across
 *   K = 0..1234.
 * - **LINEAR UP HLC = i, volume = V**: delta = 1 -> direction
 *   = 1 -> vf = V constant -> fastSma = slowSma = V ->
 *   kvo = 0. priceUp = true, kvoUp = false (0 === 0) ->
 *   regime `divergent-bearish` (price rising but the SMAs
 *   of a constant volume force collapse to the same value
 *   -- canonical bearish divergence reading on the KVO
 *   oscillator). 0 crosses because divergent state is
 *   entered from `none`.
 * - **LINEAR DOWN HLC = -i, volume = V**: delta = -1 ->
 *   direction = -1 -> vf = -V -> fastSma = slowSma = -V ->
 *   kvo = 0. priceUp = false, kvoUp = false -> regime
 *   `aligned-bearish`. 0 crosses.
 */

export interface ChartLineKvoDivergenceCrossPoint {
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ChartLineKvoDivergenceCrossRegime =
  | 'aligned-bullish'
  | 'aligned-bearish'
  | 'divergent-bullish'
  | 'divergent-bearish'
  | 'none';

export type ChartLineKvoDivergenceCrossSeriesId = 'price' | 'kvo';

export type ChartLineKvoDivergenceCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineKvoDivergenceCrossCross {
  index: number;
  x: number;
  kind: ChartLineKvoDivergenceCrossCrossKind;
}

export interface ChartLineKvoDivergenceCrossSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  kvo: number | null;
  priceUp: boolean | null;
  kvoUp: boolean | null;
  regime: ChartLineKvoDivergenceCrossRegime;
}

export interface ChartLineKvoDivergenceCrossRun {
  series: ChartLineKvoDivergenceCrossPoint[];
  fastLength: number;
  slowLength: number;
  divergenceWindow: number;
  kvoValues: Array<number | null>;
  samples: ChartLineKvoDivergenceCrossSample[];
  crosses: ChartLineKvoDivergenceCrossCross[];
  alignedBullishCount: number;
  alignedBearishCount: number;
  divergentBullishCount: number;
  divergentBearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineKvoDivergenceCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKvoDivergenceCrossLayout {
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
  priceDots: ChartLineKvoDivergenceCrossDot[];
  kvoPath: string;
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
    kind: ChartLineKvoDivergenceCrossCrossKind;
  }>;
  run: ChartLineKvoDivergenceCrossRun;
}

export interface ChartLineKvoDivergenceCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKvoDivergenceCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kvoColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKvo?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZero?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKvoDivergenceCrossSeriesId[];
  defaultHiddenSeries?: ChartLineKvoDivergenceCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKvoDivergenceCrossSeriesId;
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

export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_FAST_LENGTH = 34;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_SLOW_LENGTH = 55;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WINDOW = 5;
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_KVO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_ZERO_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

export function getLineKvoDivergenceCrossFinitePoints(
  data: readonly ChartLineKvoDivergenceCrossPoint[] | null | undefined,
): ChartLineKvoDivergenceCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKvoDivergenceCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
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

export function normalizeLineKvoDivergenceCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

export function normalizeLineKvoDivergenceCrossWindow(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 1) return Math.floor(value);
  return fallback;
}

/** SMA over a nullable input array. */
export function applyLineKvoDivergenceCrossSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  for (let i = length - 1; i < values.length; i += 1) {
    let sum = 0;
    let valid = true;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (v == null) {
        valid = false;
        break;
      }
      sum += v;
    }
    if (!valid) continue;
    out[i] = posZero(sum / length);
  }
  return out;
}

/**
 * Klinger Volume Oscillator over HLCV inputs. Computes the
 * typical price, the sign of its delta, the signed volume
 * force, and finally `kvo = SMA(vf, fastLength) - SMA(vf,
 * slowLength)`. Returns null for indices that lack a full
 * slow-window history of volume force.
 */
export function applyLineKvoDivergenceCrossKvo(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  volumes: readonly number[],
  fastLength: number,
  slowLength: number,
): Array<number | null> {
  const n = Math.min(highs.length, lows.length, closes.length, volumes.length);
  const out: Array<number | null> = new Array(n).fill(null);
  if (fastLength < 1 || slowLength < 1 || n < 2) return out;
  const typical: number[] = new Array(n);
  for (let i = 0; i < n; i += 1) {
    typical[i] = (highs[i]! + lows[i]!) / 3 + closes[i]! / 3;
  }
  const vf: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const delta = typical[i]! - typical[i - 1]!;
    let dir = 0;
    if (delta > 0) dir = 1;
    else if (delta < 0) dir = -1;
    vf[i] = posZero(dir * volumes[i]!);
  }
  const fastSma = applyLineKvoDivergenceCrossSma(vf, fastLength);
  const slowSma = applyLineKvoDivergenceCrossSma(vf, slowLength);
  for (let i = 0; i < n; i += 1) {
    const f = fastSma[i];
    const s = slowSma[i];
    if (f == null || s == null) continue;
    out[i] = posZero(f - s);
  }
  return out;
}

export interface LineKvoDivergenceCrossChannels {
  kvo: Array<number | null>;
}

export function computeLineKvoDivergenceCross(
  series: readonly ChartLineKvoDivergenceCrossPoint[] | null | undefined,
  options: { fastLength?: number; slowLength?: number } = {},
): LineKvoDivergenceCrossChannels {
  const cleaned = getLineKvoDivergenceCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return { kvo: [] };
  }
  const fastLength = normalizeLineKvoDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKvoDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  const closes = cleaned.map((p) => p.close);
  const volumes = cleaned.map((p) => p.volume);
  const kvo = applyLineKvoDivergenceCrossKvo(
    highs,
    lows,
    closes,
    volumes,
    fastLength,
    slowLength,
  );
  return { kvo };
}

export function classifyLineKvoDivergenceCrossRegime(
  priceUp: boolean | null,
  kvoUp: boolean | null,
): ChartLineKvoDivergenceCrossRegime {
  if (priceUp == null || kvoUp == null) return 'none';
  if (priceUp && kvoUp) return 'aligned-bullish';
  if (!priceUp && !kvoUp) return 'aligned-bearish';
  if (!priceUp && kvoUp) return 'divergent-bullish';
  return 'divergent-bearish';
}

export function detectLineKvoDivergenceCrossCrosses(
  series: readonly ChartLineKvoDivergenceCrossPoint[],
  states: readonly ChartLineKvoDivergenceCrossRegime[],
): ChartLineKvoDivergenceCrossCross[] {
  const out: ChartLineKvoDivergenceCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = states[i - 1];
    const cur = states[i];
    if (prev === 'none' || cur === 'none') continue;
    if (prev !== 'divergent-bullish' && cur === 'divergent-bullish') {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (
      prev !== 'divergent-bearish' &&
      cur === 'divergent-bearish'
    ) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineKvoDivergenceCross(
  data: ChartLineKvoDivergenceCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    divergenceWindow?: number;
  } = {},
): ChartLineKvoDivergenceCrossRun {
  const cleaned = getLineKvoDivergenceCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineKvoDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKvoDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  const divergenceWindow = normalizeLineKvoDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WINDOW,
  );

  const channels = computeLineKvoDivergenceCross(series, {
    fastLength,
    slowLength,
  });

  const samples: ChartLineKvoDivergenceCrossSample[] = series.map((p, i) => {
    const kvo = channels.kvo[i] ?? null;
    let priceUp: boolean | null = null;
    let kvoUp: boolean | null = null;
    if (i >= divergenceWindow) {
      const cPrev = series[i - divergenceWindow]?.close;
      if (cPrev != null) priceUp = p.close > cPrev;
      const kPrev = channels.kvo[i - divergenceWindow] ?? null;
      if (kvo != null && kPrev != null) kvoUp = kvo > kPrev;
    }
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      volume: p.volume,
      kvo,
      priceUp,
      kvoUp,
      regime: classifyLineKvoDivergenceCrossRegime(priceUp, kvoUp),
    };
  });

  const states = samples.map((s) => s.regime);
  const crosses = detectLineKvoDivergenceCrossCrosses(series, states);

  let alignedBullishCount = 0;
  let alignedBearishCount = 0;
  let divergentBullishCount = 0;
  let divergentBearishCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    switch (s.regime) {
      case 'aligned-bullish':
        alignedBullishCount += 1;
        break;
      case 'aligned-bearish':
        alignedBearishCount += 1;
        break;
      case 'divergent-bullish':
        divergentBullishCount += 1;
        break;
      case 'divergent-bearish':
        divergentBearishCount += 1;
        break;
      default:
        noneCount += 1;
    }
  }
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCrossCount += 1;
    else bearishCrossCount += 1;
  }

  const ok = series.length > slowLength + divergenceWindow;

  return {
    series,
    fastLength,
    slowLength,
    divergenceWindow,
    kvoValues: channels.kvo,
    samples,
    crosses,
    alignedBullishCount,
    alignedBearishCount,
    divergentBullishCount,
    divergentBearishCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineKvoDivergenceCrossLayoutOptions {
  data: ChartLineKvoDivergenceCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  divergenceWindow?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineKvoDivergenceCrossLayout(
  opts: ComputeLineKvoDivergenceCrossLayoutOptions,
): ChartLineKvoDivergenceCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PANEL_GAP;

  const run = runLineKvoDivergenceCross(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
    divergenceWindow: opts.divergenceWindow ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let kMin = Infinity;
  let kMax = -Infinity;
  for (let i = 0; i < run.kvoValues.length; i += 1) {
    const v = run.kvoValues[i];
    if (v == null) continue;
    if (v < kMin) kMin = v;
    if (v > kMax) kMax = v;
  }
  if (!Number.isFinite(kMin) || !Number.isFinite(kMax)) {
    kMin = -1;
    kMax = 1;
  }
  const span = Math.max(Math.abs(kMin), Math.abs(kMax));
  const padded = span === 0 ? 1 : span * 1.1;
  const oscMin = -padded;
  const oscMax = padded;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const zeroY = syOscBase(0);

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
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      zeroY,
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
  const priceDots: ChartLineKvoDivergenceCrossDot[] = [];
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

  let kvoPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.kvo == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.kvo);
    kvoPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  kvoPath = kvoPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.kvoValues[c.index] ?? 0);
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
    kvoPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineKvoDivergenceCrossChart(
  data: ChartLineKvoDivergenceCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    divergenceWindow?: number;
  } = {},
): string {
  const cleaned = getLineKvoDivergenceCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineKvoDivergenceCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineKvoDivergenceCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_SLOW_LENGTH,
  );
  const divergenceWindow = normalizeLineKvoDivergenceCrossWindow(
    options.divergenceWindow,
    DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WINDOW,
  );
  return (
    `KVO Divergence Cross chart over ${cleaned.length} bars ` +
    `(fast ${fastLength}, slow ${slowLength}, divergenceWindow ` +
    `${divergenceWindow}). Top panel renders the close with bullish ` +
    `(price down + KVO up, potential bottom reversal warning) / ` +
    `bearish (price up + KVO down, potential top reversal warning) ` +
    `chevron overlays at every price-versus-KVO direction ` +
    `disagreement event; bottom panel renders the Klinger Volume ` +
    `Oscillator and marks divergence transitions for volume-` +
    `momentum reversal warning.`
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

export const ChartLineKvoDivergenceCross = forwardRef<
  HTMLDivElement,
  ChartLineKvoDivergenceCrossProps
>(function ChartLineKvoDivergenceCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_SLOW_LENGTH,
    divergenceWindow = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WINDOW,
    width = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_PRICE_COLOR,
    kvoColor = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_KVO_COLOR,
    bullishColor = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_GRID_COLOR,
    zeroColor = DEFAULT_CHART_LINE_KVO_DIVERGENCE_CROSS_ZERO_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKvo = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showZero = true,
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
    () => getLineKvoDivergenceCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineKvoDivergenceCrossLayout({
        data: cleaned,
        fastLength,
        slowLength,
        divergenceWindow,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      fastLength,
      slowLength,
      divergenceWindow,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineKvoDivergenceCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineKvoDivergenceCrossSeriesId,
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
    seriesId: ChartLineKvoDivergenceCrossSeriesId,
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
        data-section="chart-line-kvo-divergence-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineKvoDivergenceCrossChart(cleaned, {
      fastLength,
      slowLength,
      divergenceWindow,
    });

  const showPrice = !hidden.has('price');
  const showKvoLine = !hidden.has('kvo') && showKvo;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [layout.oscMin, 0, layout.oscMax];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'KVO Divergence Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-kvo-divergence-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-divergence-window={divergenceWindow}
      data-total-points={cleaned.length}
      data-aligned-bullish-count={layout.run.alignedBullishCount}
      data-aligned-bearish-count={layout.run.alignedBearishCount}
      data-divergent-bullish-count={layout.run.divergentBullishCount}
      data-divergent-bearish-count={layout.run.divergentBearishCount}
      data-bullish-cross-count={layout.run.bullishCrossCount}
      data-bearish-cross-count={layout.run.bearishCrossCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-kvo-divergence-cross-title"
      >
        {ariaLabel ?? 'KVO Divergence Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-kvo-divergence-cross-aria-desc"
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
        data-section="chart-line-kvo-divergence-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-kvo-divergence-cross-grid">
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
                  data-section="chart-line-kvo-divergence-cross-grid-line-price"
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
                  data-section="chart-line-kvo-divergence-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showZero ? (
          <g data-section="chart-line-kvo-divergence-cross-zero">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeDasharray="4 4"
              data-section="chart-line-kvo-divergence-cross-zero-line"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-kvo-divergence-cross-axes">
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
                  data-section="chart-line-kvo-divergence-cross-tick-price"
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
                  data-section="chart-line-kvo-divergence-cross-tick-osc"
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
            data-section="chart-line-kvo-divergence-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-kvo-divergence-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-kvo-divergence-cross-price-dot"
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
            data-section="chart-line-kvo-divergence-cross-kvo-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-kvo-divergence-cross-crosses"
            role="group"
            aria-label="divergence markers"
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
                aria-label={`${m.kind} divergence at ${formatX(m.x)}`}
                data-section={`chart-line-kvo-divergence-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-kvo-divergence-cross-overlay-crosses"
            role="group"
            aria-label="overlay divergence markers"
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
                aria-label={`${m.kind} divergence overlay at ${formatX(m.x)}`}
                data-section={`chart-line-kvo-divergence-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-kvo-divergence-cross-hover-targets">
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
                data-section="chart-line-kvo-divergence-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-kvo-divergence-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={252}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-divergence-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-divergence-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-divergence-cross-tooltip-kvo"
                >
                  KVO{' '}
                  {tooltipSample.kvo == null
                    ? '--'
                    : formatOsc(tooltipSample.kvo)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-divergence-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-divergence-cross-tooltip-aligned"
                >
                  aligned bull {layout.run.alignedBullishCount} | bear{' '}
                  {layout.run.alignedBearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-divergence-cross-tooltip-divergent"
                >
                  divergent bull {layout.run.divergentBullishCount} | bear{' '}
                  {layout.run.divergentBearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-divergence-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-kvo-divergence-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-kvo-divergence-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | window {divergenceWindow}{' '}
          | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-kvo-divergence-cross-legend"
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
              { id: 'kvo' as const, color: kvoColor, label: 'KVO' },
            ] satisfies Array<{
              id: ChartLineKvoDivergenceCrossSeriesId;
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

ChartLineKvoDivergenceCross.displayName = 'ChartLineKvoDivergenceCross';
