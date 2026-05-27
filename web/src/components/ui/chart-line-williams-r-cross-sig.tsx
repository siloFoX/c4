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
 * ChartLineWilliamsRCrossSig -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Williams %R
 * line plus an SMA signal line in the bottom panel, marking
 * bullish (cross up through signal) / bearish (cross down
 * through signal) trigger events. Each cross also carries a
 * `zone` tag (`overbought` / `oversold` / `neutral`) computed
 * from the %R value at the cross bar, surfacing overbought /
 * oversold trigger events via the regime classifier.
 *
 *   range[i] = max(close[i-n+1..i]) - min(close[i-n+1..i])
 *   wr[i]    = range > 0
 *                ? -100 * (highest - close) / range
 *                : -50
 *   signal[i]= SMA(wr, signalLength)
 *   bullish  : prev wr <= signal && cur wr > signal
 *   bearish  : prev wr >= signal && cur wr < signal
 *
 * Defaults: `length = 14` (canonical Williams %R window),
 * `signalLength = 3` (signal smoothing),
 * `overboughtThreshold = -20`, `oversoldThreshold = -80`.
 * Regime classifier `overbought` (wr >= -20), `oversold`
 * (wr <= -80), `neutral` (-80 < wr < -20), `none` (wr null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: range = 0 every bar -> wr = -50
 *   neutral fallback. SMA of -50s = -50 via the `min === max`
 *   short-circuit. wr === signal = -50, never crosses, regime
 *   is `neutral`. cross count = 0. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: close always sits at the window
 *   high so wr = 0 constant once warm. signal = 0. regime
 *   `overbought`. 0 crosses.
 * - **LINEAR DOWN close = -i**: close always sits at the window
 *   low so wr = -100 constant. signal = -100. regime `oversold`.
 *   0 crosses.
 */

export interface ChartLineWilliamsRCrossSigPoint {
  x: number;
  close: number;
}

export type ChartLineWilliamsRCrossSigRegime =
  | 'overbought'
  | 'neutral'
  | 'oversold'
  | 'none';

export type ChartLineWilliamsRCrossSigZone =
  | 'overbought'
  | 'neutral'
  | 'oversold';

export type ChartLineWilliamsRCrossSigSeriesId = 'price' | 'wr' | 'signal';

export type ChartLineWilliamsRCrossSigCrossKind = 'bullish' | 'bearish';

export interface ChartLineWilliamsRCrossSigCross {
  index: number;
  x: number;
  kind: ChartLineWilliamsRCrossSigCrossKind;
  zone: ChartLineWilliamsRCrossSigZone;
}

export interface ChartLineWilliamsRCrossSigSample {
  index: number;
  x: number;
  close: number;
  wr: number | null;
  signal: number | null;
  regime: ChartLineWilliamsRCrossSigRegime;
}

export interface ChartLineWilliamsRCrossSigRun {
  series: ChartLineWilliamsRCrossSigPoint[];
  length: number;
  signalLength: number;
  overboughtThreshold: number;
  oversoldThreshold: number;
  wrValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineWilliamsRCrossSigSample[];
  crosses: ChartLineWilliamsRCrossSigCross[];
  overboughtCount: number;
  neutralCount: number;
  oversoldCount: number;
  noneCount: number;
  bullishCount: number;
  bearishCount: number;
  bullishOversoldCount: number;
  bearishOverboughtCount: number;
  ok: boolean;
}

export interface ChartLineWilliamsRCrossSigDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineWilliamsRCrossSigLayout {
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
  priceDots: ChartLineWilliamsRCrossSigDot[];
  wrPath: string;
  signalPath: string;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  midY: number;
  overboughtY: number;
  oversoldY: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineWilliamsRCrossSigCrossKind;
    zone: ChartLineWilliamsRCrossSigZone;
  }>;
  run: ChartLineWilliamsRCrossSigRun;
}

export interface ChartLineWilliamsRCrossSigProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineWilliamsRCrossSigPoint[];
  length?: number;
  signalLength?: number;
  overboughtThreshold?: number;
  oversoldThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  wrColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showWr?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineWilliamsRCrossSigSeriesId[];
  defaultHiddenSeries?: ChartLineWilliamsRCrossSigSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineWilliamsRCrossSigSeriesId;
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

export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_WIDTH = 720;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_HEIGHT = 460;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PADDING = 44;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_LENGTH = 14;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_SIGNAL_LENGTH = 3;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERBOUGHT_THRESHOLD = -20;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERSOLD_THRESHOLD = -80;
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_WR_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_SIGNAL_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineWilliamsRCrossSigFinitePoints(
  data: readonly ChartLineWilliamsRCrossSigPoint[] | null | undefined,
): ChartLineWilliamsRCrossSigPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineWilliamsRCrossSigPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineWilliamsRCrossSigLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a finite threshold in [-100, 0]. */
export function normalizeLineWilliamsRCrossSigThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value >= -100 && value <= 0) return value;
  return fallback;
}

/** SMA with CONST short-circuit via min === max. */
export function applyLineWilliamsRCrossSigSma(
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

export interface LineWilliamsRCrossSigChannels {
  wr: Array<number | null>;
  signal: Array<number | null>;
}

export function computeLineWilliamsRCrossSig(
  series: readonly ChartLineWilliamsRCrossSigPoint[] | null | undefined,
  options: { length?: number; signalLength?: number } = {},
): LineWilliamsRCrossSigChannels {
  const cleaned = getLineWilliamsRCrossSigFinitePoints(series);
  if (cleaned.length === 0) {
    return { wr: [], signal: [] };
  }
  const length = normalizeLineWilliamsRCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_LENGTH,
  );
  const signalLength = normalizeLineWilliamsRCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_SIGNAL_LENGTH,
  );

  const closes = cleaned.map((p) => p.close);
  const wr: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = length - 1; i < closes.length; i += 1) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = closes[j]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const range = hi - lo;
    if (range === 0) {
      wr[i] = -50;
    } else {
      wr[i] = posZero(((hi - closes[i]!) / range) * -100);
    }
  }
  const signal = applyLineWilliamsRCrossSigSma(wr, signalLength);
  return { wr, signal };
}

const zoneOf = (
  wr: number | null,
  overboughtThreshold: number,
  oversoldThreshold: number,
): ChartLineWilliamsRCrossSigZone => {
  if (wr == null) return 'neutral';
  if (wr >= overboughtThreshold) return 'overbought';
  if (wr <= oversoldThreshold) return 'oversold';
  return 'neutral';
};

export function classifyLineWilliamsRCrossSigRegime(
  wr: number | null,
  overboughtThreshold: number,
  oversoldThreshold: number,
): ChartLineWilliamsRCrossSigRegime {
  if (wr == null) return 'none';
  if (wr >= overboughtThreshold) return 'overbought';
  if (wr <= oversoldThreshold) return 'oversold';
  return 'neutral';
}

export function detectLineWilliamsRCrossSigCrosses(
  series: readonly ChartLineWilliamsRCrossSigPoint[],
  wr: readonly (number | null)[],
  signal: readonly (number | null)[],
  overboughtThreshold: number,
  oversoldThreshold: number,
): ChartLineWilliamsRCrossSigCross[] {
  const out: ChartLineWilliamsRCrossSigCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevW = wr[i - 1];
    const curW = wr[i];
    const prevS = signal[i - 1];
    const curS = signal[i];
    if (prevW == null || curW == null || prevS == null || curS == null)
      continue;
    const x = series[i]!.x;
    const zone = zoneOf(curW, overboughtThreshold, oversoldThreshold);
    if (prevW <= prevS && curW > curS) {
      out.push({ index: i, x, kind: 'bullish', zone });
    } else if (prevW >= prevS && curW < curS) {
      out.push({ index: i, x, kind: 'bearish', zone });
    }
  }
  return out;
}

export function runLineWilliamsRCrossSig(
  data: ChartLineWilliamsRCrossSigPoint[],
  options: {
    length?: number;
    signalLength?: number;
    overboughtThreshold?: number;
    oversoldThreshold?: number;
  } = {},
): ChartLineWilliamsRCrossSigRun {
  const cleaned = getLineWilliamsRCrossSigFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineWilliamsRCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_LENGTH,
  );
  const signalLength = normalizeLineWilliamsRCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_SIGNAL_LENGTH,
  );
  const overboughtThreshold = normalizeLineWilliamsRCrossSigThreshold(
    options.overboughtThreshold,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERBOUGHT_THRESHOLD,
  );
  const oversoldThreshold = normalizeLineWilliamsRCrossSigThreshold(
    options.oversoldThreshold,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERSOLD_THRESHOLD,
  );

  const channels = computeLineWilliamsRCrossSig(series, {
    length,
    signalLength,
  });

  const samples: ChartLineWilliamsRCrossSigSample[] = series.map((p, i) => {
    const v = channels.wr[i] ?? null;
    const s = channels.signal[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      wr: v,
      signal: s,
      regime: classifyLineWilliamsRCrossSigRegime(
        v,
        overboughtThreshold,
        oversoldThreshold,
      ),
    };
  });

  const crosses = detectLineWilliamsRCrossSigCrosses(
    series,
    channels.wr,
    channels.signal,
    overboughtThreshold,
    oversoldThreshold,
  );

  let overboughtCount = 0;
  let neutralCount = 0;
  let oversoldCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'overbought') overboughtCount += 1;
    else if (s.regime === 'oversold') oversoldCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }
  let bullishCount = 0;
  let bearishCount = 0;
  let bullishOversoldCount = 0;
  let bearishOverboughtCount = 0;
  for (const c of crosses) {
    if (c.kind === 'bullish') bullishCount += 1;
    else bearishCount += 1;
    if (c.kind === 'bullish' && c.zone === 'oversold')
      bullishOversoldCount += 1;
    if (c.kind === 'bearish' && c.zone === 'overbought')
      bearishOverboughtCount += 1;
  }

  const ok = series.length > length + signalLength;

  return {
    series,
    length,
    signalLength,
    overboughtThreshold,
    oversoldThreshold,
    wrValues: channels.wr,
    signalValues: channels.signal,
    samples,
    crosses,
    overboughtCount,
    neutralCount,
    oversoldCount,
    noneCount,
    bullishCount,
    bearishCount,
    bullishOversoldCount,
    bearishOverboughtCount,
    ok,
  };
}

export interface ComputeLineWilliamsRCrossSigLayoutOptions {
  data: ChartLineWilliamsRCrossSigPoint[];
  length?: number;
  signalLength?: number;
  overboughtThreshold?: number;
  oversoldThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineWilliamsRCrossSigLayout(
  opts: ComputeLineWilliamsRCrossSigLayoutOptions,
): ChartLineWilliamsRCrossSigLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PANEL_GAP;
  const overboughtThreshold = normalizeLineWilliamsRCrossSigThreshold(
    opts.overboughtThreshold,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERBOUGHT_THRESHOLD,
  );
  const oversoldThreshold = normalizeLineWilliamsRCrossSigThreshold(
    opts.oversoldThreshold,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERSOLD_THRESHOLD,
  );

  const run = runLineWilliamsRCrossSig(opts.data, {
    length: opts.length ?? undefined,
    signalLength: opts.signalLength ?? undefined,
    overboughtThreshold,
    oversoldThreshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  const oscMin = -100;
  const oscMax = 0;
  const syOscBase = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);
  const midY = syOscBase(-50);
  const overboughtY = syOscBase(overboughtThreshold);
  const oversoldY = syOscBase(oversoldThreshold);

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
      wrPath: '',
      signalPath: '',
      priceMin: 0,
      priceMax: 0,
      oscMin,
      oscMax,
      midY,
      overboughtY,
      oversoldY,
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
  const priceDots: ChartLineWilliamsRCrossSigDot[] = [];
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

  let wrPath = '';
  let firstWr = true;
  for (const s of run.samples) {
    if (s.wr == null) {
      firstWr = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.wr);
    wrPath += `${firstWr ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstWr = false;
  }
  wrPath = wrPath.trim();

  let signalPath = '';
  let firstSig = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      firstSig = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.signal);
    signalPath += `${firstSig ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstSig = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.wrValues[c.index] ?? -50);
    return {
      index: c.index,
      x: c.x,
      cx,
      cyPrice,
      cyOsc,
      kind: c.kind,
      zone: c.zone,
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
    wrPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    midY,
    overboughtY,
    oversoldY,
    crossMarkers,
    run,
  };
}

export function describeLineWilliamsRCrossSigChart(
  data: ChartLineWilliamsRCrossSigPoint[],
  options: {
    length?: number;
    signalLength?: number;
    overboughtThreshold?: number;
    oversoldThreshold?: number;
  } = {},
): string {
  const cleaned = getLineWilliamsRCrossSigFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineWilliamsRCrossSigLength(
    options.length,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_LENGTH,
  );
  const signalLength = normalizeLineWilliamsRCrossSigLength(
    options.signalLength,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_SIGNAL_LENGTH,
  );
  const overboughtThreshold = normalizeLineWilliamsRCrossSigThreshold(
    options.overboughtThreshold,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERBOUGHT_THRESHOLD,
  );
  const oversoldThreshold = normalizeLineWilliamsRCrossSigThreshold(
    options.oversoldThreshold,
    DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERSOLD_THRESHOLD,
  );
  return (
    `Williams %R Cross Signal chart over ${cleaned.length} bars ` +
    `(length ${length}, signalLength ${signalLength}, ` +
    `overbought ${overboughtThreshold}, oversold ` +
    `${oversoldThreshold}). Top panel renders the close with ` +
    `bullish / bearish chevron overlays at every %R-over-signal ` +
    `cross; bottom panel renders the close-only Williams %R line ` +
    `and SMA signal line on a fixed -100 to 0 oscillator with ` +
    `overbought / oversold reference bands and marks zone-tagged ` +
    `entry / exit events.`
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

export const ChartLineWilliamsRCrossSig = forwardRef<
  HTMLDivElement,
  ChartLineWilliamsRCrossSigProps
>(function ChartLineWilliamsRCrossSig(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_LENGTH,
    signalLength = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_SIGNAL_LENGTH,
    overboughtThreshold = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERBOUGHT_THRESHOLD,
    oversoldThreshold = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_OVERSOLD_THRESHOLD,
    width = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_WIDTH,
    height = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_HEIGHT,
    padding = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PADDING,
    panelGap = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_PRICE_COLOR,
    wrColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_WR_COLOR,
    signalColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_WILLIAMS_R_CROSS_SIG_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWr = true,
    showSignal = true,
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
    () => getLineWilliamsRCrossSigFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineWilliamsRCrossSigLayout({
        data: cleaned,
        length,
        signalLength,
        overboughtThreshold,
        oversoldThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      signalLength,
      overboughtThreshold,
      oversoldThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineWilliamsRCrossSigSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineWilliamsRCrossSigSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineWilliamsRCrossSigSeriesId,
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
        data-section="chart-line-williams-r-cross-sig-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineWilliamsRCrossSigChart(cleaned, {
      length,
      signalLength,
      overboughtThreshold,
      oversoldThreshold,
    });

  const showPrice = !hidden.has('price');
  const showWrLine = !hidden.has('wr') && showWr;
  const showSignalLine = !hidden.has('signal') && showSignal;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [
    -100,
    oversoldThreshold,
    -50,
    overboughtThreshold,
    0,
  ];

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'Williams %R Cross Signal chart'}
      aria-describedby={descId}
      data-section="chart-line-williams-r-cross-sig"
      data-length={length}
      data-signal-length={signalLength}
      data-overbought-threshold={overboughtThreshold}
      data-oversold-threshold={oversoldThreshold}
      data-total-points={cleaned.length}
      data-overbought-count={layout.run.overboughtCount}
      data-neutral-count={layout.run.neutralCount}
      data-oversold-count={layout.run.oversoldCount}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-bullish-oversold-count={layout.run.bullishOversoldCount}
      data-bearish-overbought-count={layout.run.bearishOverboughtCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-williams-r-cross-sig-title"
      >
        {ariaLabel ?? 'Williams %R Cross Signal chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-williams-r-cross-sig-aria-desc"
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
        data-section="chart-line-williams-r-cross-sig-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-williams-r-cross-sig-grid">
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
                  data-section="chart-line-williams-r-cross-sig-grid-line-price"
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
                  data-section="chart-line-williams-r-cross-sig-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-williams-r-cross-sig-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.overboughtY}
              x2={layout.innerRight}
              y2={layout.overboughtY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-williams-r-cross-sig-band-overbought"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeDasharray="2 4"
              data-section="chart-line-williams-r-cross-sig-band-mid"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.oversoldY}
              x2={layout.innerRight}
              y2={layout.oversoldY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-williams-r-cross-sig-band-oversold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-williams-r-cross-sig-axes">
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
                  data-section="chart-line-williams-r-cross-sig-tick-price"
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
                  data-section="chart-line-williams-r-cross-sig-tick-osc"
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
            data-section="chart-line-williams-r-cross-sig-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-williams-r-cross-sig-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-williams-r-cross-sig-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showWrLine ? (
          <path
            d={layout.wrPath}
            stroke={wrColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-williams-r-cross-sig-wr-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray="3 3"
            data-section="chart-line-williams-r-cross-sig-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-williams-r-cross-sig-crosses"
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
                aria-label={`${m.kind} ${m.zone} cross at ${formatX(m.x)}`}
                data-section={`chart-line-williams-r-cross-sig-cross-${m.kind}`}
                data-zone={m.zone}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-williams-r-cross-sig-overlay-crosses"
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
                aria-label={`${m.kind} ${m.zone} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-williams-r-cross-sig-overlay-${m.kind}`}
                data-zone={m.zone}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-williams-r-cross-sig-hover-targets">
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
                data-section="chart-line-williams-r-cross-sig-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-williams-r-cross-sig-tooltip"
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
                  data-section="chart-line-williams-r-cross-sig-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-sig-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-sig-tooltip-wr"
                >
                  %R{' '}
                  {tooltipSample.wr == null
                    ? '--'
                    : formatOsc(tooltipSample.wr)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-sig-tooltip-signal"
                >
                  signal{' '}
                  {tooltipSample.signal == null
                    ? '--'
                    : formatOsc(tooltipSample.signal)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-sig-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-sig-tooltip-counts"
                >
                  OB {layout.run.overboughtCount} | OS{' '}
                  {layout.run.oversoldCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-sig-tooltip-zone"
                >
                  bull OS {layout.run.bullishOversoldCount} | bear OB{' '}
                  {layout.run.bearishOverboughtCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-williams-r-cross-sig-tooltip-crosses"
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
          data-section="chart-line-williams-r-cross-sig-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | signal {signalLength} | OB {overboughtThreshold} |
          OS {oversoldThreshold} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-williams-r-cross-sig-legend"
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
              { id: 'wr' as const, color: wrColor, label: '%R' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineWilliamsRCrossSigSeriesId;
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

ChartLineWilliamsRCrossSig.displayName = 'ChartLineWilliamsRCrossSig';
