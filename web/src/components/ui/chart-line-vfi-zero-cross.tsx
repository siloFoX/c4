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
 * ChartLineVfiZeroCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the volume-weighted Volume Flow
 * Index (VFI) line in the bottom panel, marking bullish (cross
 * up through zero) / bearish (cross down through zero)
 * volume-weighted price momentum baseline transition events.
 * Zero-line cross variant of the Markos Katsanos VFI family
 * that flags the discrete VFI crossing of the zero baseline.
 *
 * VFI weights each bar's signed money flow by its volume,
 * filters small price moves with a standard-deviation cutoff,
 * caps outlier-volume bars at `maxVolumeCoef * vol_avg`, then
 * SMA-smooths the resulting normalised flow:
 *
 *   inter_i    = ln(close_i / close_{i-1})
 *   sd_i       = stdev(inter, length) at i
 *   cutoff_i   = coef * sd_i              (coef = 0.2)
 *   vol_avg_i  = SMA(volume, length) at i
 *   max_vol_i  = vol_avg_i * maxVolumeCoef (maxVolumeCoef = 2.5)
 *   vol_cap_i  = min(volume_i, max_vol_i)
 *   mf_i       = inter_i >  cutoff_i ? +vol_cap_i
 *              : inter_i < -cutoff_i ? -vol_cap_i
 *              : 0
 *   ratio_i    = mf_i / vol_avg_i         (vol_avg_i = 0 -> null)
 *   vfi_i      = SMA(ratio, length) at i
 *   bullish    : prev vfi <= 0 && cur vfi > 0
 *   bearish    : prev vfi >= 0 && cur vfi < 0
 *
 * Defaults: `length = 14`, `coef = 0.2`, `maxVolumeCoef = 2.5`,
 * `threshold = 0` (zero baseline). Regime classifier `bullish`
 * (vfi >= 0), `bearish` (vfi < 0), `none` (vfi null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: inter = 0 every bar, sd = 0, cutoff =
 *   0; the strict-inequality cutoff drops every bar, so mf = 0
 *   and vfi = 0. vfi = 0 sits on the threshold but the strict-
 *   inequality detector never fires. regime `bullish` (vfi >=
 *   0). cross count = 0. Verified across K = 1..1234.
 * - **GEOMETRIC UP close = K * 1.01^i**: inter = ln(1.01) > 0
 *   every bar, sd = 0, cutoff = 0; mf = +volume (capped). With
 *   constant volume, ratio = +1 and vfi = +1. regime `bullish`.
 *   0 crosses.
 * - **GEOMETRIC DOWN close = K * 0.99^i**: inter = ln(0.99) <
 *   0 every bar, mf = -volume. With constant volume, ratio =
 *   -1 and vfi = -1. regime `bearish`. 0 crosses.
 */

export interface ChartLineVfiZeroCrossPoint {
  x: number;
  close: number;
  volume: number;
}

export type ChartLineVfiZeroCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineVfiZeroCrossSeriesId = 'price' | 'vfi';

export type ChartLineVfiZeroCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineVfiZeroCrossCross {
  index: number;
  x: number;
  kind: ChartLineVfiZeroCrossCrossKind;
}

export interface ChartLineVfiZeroCrossSample {
  index: number;
  x: number;
  close: number;
  volume: number;
  vfi: number | null;
  regime: ChartLineVfiZeroCrossRegime;
}

export interface ChartLineVfiZeroCrossRun {
  series: ChartLineVfiZeroCrossPoint[];
  length: number;
  coef: number;
  maxVolumeCoef: number;
  threshold: number;
  vfiValues: Array<number | null>;
  samples: ChartLineVfiZeroCrossSample[];
  crosses: ChartLineVfiZeroCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineVfiZeroCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVfiZeroCrossLayout {
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
  priceDots: ChartLineVfiZeroCrossDot[];
  vfiPath: string;
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
    kind: ChartLineVfiZeroCrossCrossKind;
  }>;
  run: ChartLineVfiZeroCrossRun;
}

export interface ChartLineVfiZeroCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVfiZeroCrossPoint[];
  length?: number;
  coef?: number;
  maxVolumeCoef?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  vfiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showVfi?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVfiZeroCrossSeriesId[];
  defaultHiddenSeries?: ChartLineVfiZeroCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVfiZeroCrossSeriesId;
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

export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_LENGTH = 14;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_COEF = 0.2;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_MAX_VOLUME_COEF = 2.5;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_VFI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VFI_ZERO_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close / volume. */
export function getLineVfiZeroCrossFinitePoints(
  data: readonly ChartLineVfiZeroCrossPoint[] | null | undefined,
): ChartLineVfiZeroCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVfiZeroCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.volume)
    ) {
      out.push({ x: point.x, close: point.close, volume: point.volume });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineVfiZeroCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any positive finite coefficient. */
export function normalizeLineVfiZeroCrossCoef(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= 0) return value;
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineVfiZeroCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineVfiZeroCrossSma(
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

/** Population standard deviation with CONST short-circuit. */
export function applyLineVfiZeroCrossStdev(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
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
    if (winMin === winMax) {
      out[i] = 0;
      continue;
    }
    const mean = sum / length;
    let sq = 0;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j]!;
      const d = v - mean;
      sq += d * d;
    }
    out[i] = posZero(Math.sqrt(sq / length));
  }
  return out;
}

export interface LineVfiZeroCrossChannels {
  vfi: Array<number | null>;
  length: number;
  coef: number;
  maxVolumeCoef: number;
}

export function computeLineVfiZeroCross(
  series: readonly ChartLineVfiZeroCrossPoint[] | null | undefined,
  options: {
    length?: number;
    coef?: number;
    maxVolumeCoef?: number;
  } = {},
): LineVfiZeroCrossChannels {
  const cleaned = getLineVfiZeroCrossFinitePoints(series);
  const length = normalizeLineVfiZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_VFI_ZERO_CROSS_LENGTH,
  );
  const coef = normalizeLineVfiZeroCrossCoef(
    options.coef,
    DEFAULT_CHART_LINE_VFI_ZERO_CROSS_COEF,
  );
  const maxVolumeCoef = normalizeLineVfiZeroCrossCoef(
    options.maxVolumeCoef,
    DEFAULT_CHART_LINE_VFI_ZERO_CROSS_MAX_VOLUME_COEF,
  );
  if (cleaned.length === 0) {
    return { vfi: [], length, coef, maxVolumeCoef };
  }
  const n = cleaned.length;

  // Log-return per bar (i >= 1).
  const inter: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = cleaned[i]?.close;
    const prev = cleaned[i - 1]?.close;
    if (
      !isFiniteNumber(cur) ||
      !isFiniteNumber(prev) ||
      cur <= 0 ||
      prev <= 0
    )
      continue;
    inter[i] = posZero(Math.log(cur / prev));
  }

  const stdev = applyLineVfiZeroCrossStdev(inter, length);
  const volumes: Array<number | null> = cleaned.map((p) => p.volume);
  const volAvg = applyLineVfiZeroCrossSma(volumes, length);

  // Money flow normalised by vol_avg.
  const ratio: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const r = inter[i];
    const sd = stdev[i];
    const v = volumes[i];
    const va = volAvg[i];
    if (r == null || sd == null || v == null || va == null) continue;
    if (va === 0) continue;
    const cutoff = coef * sd;
    const cap = va * maxVolumeCoef;
    const volCapped = v < cap ? v : cap;
    let mf: number;
    if (r > cutoff) mf = volCapped;
    else if (r < -cutoff) mf = -volCapped;
    else mf = 0;
    ratio[i] = posZero(mf / va);
  }

  const vfi = applyLineVfiZeroCrossSma(ratio, length);
  return { vfi, length, coef, maxVolumeCoef };
}

export function classifyLineVfiZeroCrossRegime(
  vfi: number | null,
  threshold: number,
): ChartLineVfiZeroCrossRegime {
  if (vfi == null) return 'none';
  if (vfi >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineVfiZeroCrossCrosses(
  series: readonly ChartLineVfiZeroCrossPoint[],
  vfi: readonly (number | null)[],
  threshold: number,
): ChartLineVfiZeroCrossCross[] {
  const out: ChartLineVfiZeroCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = vfi[i - 1];
    const cur = vfi[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineVfiZeroCross(
  data: ChartLineVfiZeroCrossPoint[],
  options: {
    length?: number;
    coef?: number;
    maxVolumeCoef?: number;
    threshold?: number;
  } = {},
): ChartLineVfiZeroCrossRun {
  const cleaned = getLineVfiZeroCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineVfiZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_VFI_ZERO_CROSS_THRESHOLD,
  );
  const channels = computeLineVfiZeroCross(series, {
    length: options.length ?? undefined,
    coef: options.coef ?? undefined,
    maxVolumeCoef: options.maxVolumeCoef ?? undefined,
  });

  const samples: ChartLineVfiZeroCrossSample[] = series.map((p, i) => {
    const v = channels.vfi[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      volume: p.volume,
      vfi: v,
      regime: classifyLineVfiZeroCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineVfiZeroCrossCrosses(
    series,
    channels.vfi,
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

  const ok = series.length > channels.length * 2;

  return {
    series,
    length: channels.length,
    coef: channels.coef,
    maxVolumeCoef: channels.maxVolumeCoef,
    threshold,
    vfiValues: channels.vfi,
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

export interface ComputeLineVfiZeroCrossLayoutOptions {
  data: ChartLineVfiZeroCrossPoint[];
  length?: number;
  coef?: number;
  maxVolumeCoef?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineVfiZeroCrossLayout(
  opts: ComputeLineVfiZeroCrossLayoutOptions,
): ChartLineVfiZeroCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_VFI_ZERO_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_VFI_ZERO_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PANEL_GAP;
  const threshold = normalizeLineVfiZeroCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_VFI_ZERO_CROSS_THRESHOLD,
  );

  const run = runLineVfiZeroCross(opts.data, {
    length: opts.length ?? undefined,
    coef: opts.coef ?? undefined,
    maxVolumeCoef: opts.maxVolumeCoef ?? undefined,
    threshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const v of run.vfiValues) {
    if (v == null) continue;
    if (v < oscMin) oscMin = v;
    if (v > oscMax) oscMax = v;
  }
  if (oscMin > threshold) oscMin = threshold;
  if (oscMax < threshold) oscMax = threshold;
  if (
    !Number.isFinite(oscMin) ||
    !Number.isFinite(oscMax) ||
    oscMin === oscMax
  ) {
    oscMin = threshold - 1;
    oscMax = threshold + 1;
  } else {
    const padPct = 0.1;
    const range = oscMax - oscMin;
    oscMin -= range * padPct;
    oscMax += range * padPct;
  }
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
      vfiPath: '',
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
  const priceDots: ChartLineVfiZeroCrossDot[] = [];
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

  let vfiPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.vfi == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.vfi);
    vfiPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  vfiPath = vfiPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.vfiValues[c.index] ?? threshold);
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
    vfiPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineVfiZeroCrossChart(
  data: ChartLineVfiZeroCrossPoint[],
  options: {
    length?: number;
    coef?: number;
    maxVolumeCoef?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineVfiZeroCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineVfiZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_VFI_ZERO_CROSS_LENGTH,
  );
  const coef = normalizeLineVfiZeroCrossCoef(
    options.coef,
    DEFAULT_CHART_LINE_VFI_ZERO_CROSS_COEF,
  );
  const threshold = normalizeLineVfiZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_VFI_ZERO_CROSS_THRESHOLD,
  );
  return (
    `VFI Zero Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, coef ${coef}, threshold ${threshold}). ` +
    `Top panel renders the close with bullish (volume-weighted ` +
    `price momentum baseline cross up) / bearish (cross down) ` +
    `chevron overlays at every Volume Flow Index zero-line ` +
    `cross; bottom panel renders the volume-weighted VFI line ` +
    `on an auto-fitted oscillator with the zero baseline ` +
    `reference band and marks VFI level ${threshold} regime ` +
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

export const ChartLineVfiZeroCross = forwardRef<
  HTMLDivElement,
  ChartLineVfiZeroCrossProps
>(function ChartLineVfiZeroCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_LENGTH,
    coef = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_COEF,
    maxVolumeCoef = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_MAX_VOLUME_COEF,
    threshold = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_PRICE_COLOR,
    vfiColor = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_VFI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_VFI_ZERO_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showVfi = true,
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
    () => getLineVfiZeroCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineVfiZeroCrossLayout({
        data: cleaned,
        length,
        coef,
        maxVolumeCoef,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      coef,
      maxVolumeCoef,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineVfiZeroCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineVfiZeroCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineVfiZeroCrossSeriesId,
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
        data-section="chart-line-vfi-zero-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineVfiZeroCrossChart(cleaned, {
      length,
      coef,
      maxVolumeCoef,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showVfiLine = !hidden.has('vfi') && showVfi;

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
      aria-label={ariaLabel ?? 'VFI Zero Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-vfi-zero-cross"
      data-length={length}
      data-coef={coef}
      data-max-volume-coef={maxVolumeCoef}
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
        data-section="chart-line-vfi-zero-cross-title"
      >
        {ariaLabel ?? 'VFI Zero Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-vfi-zero-cross-aria-desc"
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
        data-section="chart-line-vfi-zero-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-vfi-zero-cross-grid">
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
                  data-section="chart-line-vfi-zero-cross-grid-line-price"
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
                  data-section="chart-line-vfi-zero-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-vfi-zero-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-vfi-zero-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-vfi-zero-cross-axes">
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
                  data-section="chart-line-vfi-zero-cross-tick-price"
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
                  data-section="chart-line-vfi-zero-cross-tick-osc"
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
            data-section="chart-line-vfi-zero-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-vfi-zero-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-vfi-zero-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showVfiLine ? (
          <path
            d={layout.vfiPath}
            stroke={vfiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-vfi-zero-cross-vfi-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-vfi-zero-cross-crosses"
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
                data-section={`chart-line-vfi-zero-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-vfi-zero-cross-overlay-crosses"
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
                data-section={`chart-line-vfi-zero-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-vfi-zero-cross-hover-targets">
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
                data-section="chart-line-vfi-zero-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-vfi-zero-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={244}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vfi-zero-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vfi-zero-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vfi-zero-cross-tooltip-volume"
                >
                  volume {formatPrice(tooltipSample.volume)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vfi-zero-cross-tooltip-vfi"
                >
                  VFI{' '}
                  {tooltipSample.vfi == null
                    ? '--'
                    : formatOsc(tooltipSample.vfi)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vfi-zero-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vfi-zero-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vfi-zero-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vfi-zero-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length} | length{' '}
                  {layout.run.length}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-vfi-zero-cross-tooltip-coef"
                >
                  coef {layout.run.coef} | maxVolCoef{' '}
                  {layout.run.maxVolumeCoef}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-vfi-zero-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | coef {coef} | maxVolCoef {maxVolumeCoef} |
          threshold {threshold} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-vfi-zero-cross-legend"
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
              { id: 'vfi' as const, color: vfiColor, label: 'VFI' },
            ] satisfies Array<{
              id: ChartLineVfiZeroCrossSeriesId;
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

ChartLineVfiZeroCross.displayName = 'ChartLineVfiZeroCross';
