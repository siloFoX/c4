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
 * ChartLineTsiSignalCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only True Strength Index
 * (TSI) line plus its EMA signal in the bottom panel, marking
 * bullish (TSI cross up through signal) / bearish (TSI cross
 * down through signal) momentum trigger events distinct from
 * the base TSI level. Signal-line cross variant of the William
 * Blau TSI family that flags the discrete TSI vs. signal
 * crossover rather than the zero-line cross of the base TSI.
 *
 * The signal line is the EMA of the TSI itself -- a lagging
 * companion that fires earlier than a zero-line crossover when
 * momentum starts to turn. A bullish trigger is a clearer entry
 * cue at TSI lows; a bearish trigger at TSI highs.
 *
 *   mom_i     = close_i - close_{i-1}
 *   abs_mom_i = |mom_i|
 *   sm1_mom   = EMA(mom, long, SMA-seed)
 *   sm2_mom   = EMA(sm1_mom, short, SMA-seed)
 *   sm1_abs   = EMA(abs_mom, long, SMA-seed)
 *   sm2_abs   = EMA(sm1_abs, short, SMA-seed)
 *   tsi_i     = sm2_abs == 0 ? 0 : 100 * sm2_mom / sm2_abs
 *   signal_i  = EMA(tsi, signal, SMA-seed)
 *   bullish   : prev (tsi - signal) <= 0 && cur (tsi - signal) > 0
 *   bearish   : prev (tsi - signal) >= 0 && cur (tsi - signal) < 0
 *
 * Defaults: `long = 25`, `short = 13`, `signal = 7` (Blau
 * canonical). Regime classifier `bullish` (tsi >= signal),
 * `bearish` (tsi < signal), `none` (tsi or signal null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: every input collapses to zero, so
 *   `tsi = signal = 0`. The detector sees `tsi - signal = 0`
 *   on every bar, hitting the boundary but never the strict
 *   inequality. regime `bullish` (tsi >= signal). cross count
 *   = 0. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: `mom = +1`, `abs_mom = 1`, so
 *   `tsi -> 100` after the double-EMA warmup. The signal
 *   chases TSI from the SMA seed and converges to 100, so
 *   after full warmup `tsi - signal = 0`. During the chase
 *   `tsi > signal` (bullish trigger). 0 crosses once converged.
 * - **LINEAR DOWN close = -i**: `tsi -> -100`, signal chases
 *   to -100; `tsi <= signal` during the chase (bearish
 *   trigger). 0 crosses once converged.
 */

export interface ChartLineTsiSignalCrossPoint {
  x: number;
  close: number;
}

export type ChartLineTsiSignalCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineTsiSignalCrossSeriesId = 'price' | 'tsi' | 'signal';

export type ChartLineTsiSignalCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineTsiSignalCrossCross {
  index: number;
  x: number;
  kind: ChartLineTsiSignalCrossCrossKind;
}

export interface ChartLineTsiSignalCrossSample {
  index: number;
  x: number;
  close: number;
  tsi: number | null;
  signal: number | null;
  regime: ChartLineTsiSignalCrossRegime;
}

export interface ChartLineTsiSignalCrossRun {
  series: ChartLineTsiSignalCrossPoint[];
  long: number;
  short: number;
  signal: number;
  tsiValues: Array<number | null>;
  signalValues: Array<number | null>;
  samples: ChartLineTsiSignalCrossSample[];
  crosses: ChartLineTsiSignalCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineTsiSignalCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTsiSignalCrossLayout {
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
  priceDots: ChartLineTsiSignalCrossDot[];
  tsiPath: string;
  signalPath: string;
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
    kind: ChartLineTsiSignalCrossCrossKind;
  }>;
  run: ChartLineTsiSignalCrossRun;
}

export interface ChartLineTsiSignalCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTsiSignalCrossPoint[];
  long?: number;
  short?: number;
  signal?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  tsiColor?: string;
  signalColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTsi?: boolean;
  showSignal?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTsiSignalCrossSeriesId[];
  defaultHiddenSeries?: ChartLineTsiSignalCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTsiSignalCrossSeriesId;
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

export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_LONG = 25;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SHORT = 13;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SIGNAL = 7;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_TSI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SIGNAL_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineTsiSignalCrossFinitePoints(
  data: readonly ChartLineTsiSignalCrossPoint[] | null | undefined,
): ChartLineTsiSignalCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTsiSignalCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineTsiSignalCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/**
 * SMA-seeded EMA over a values array that may contain leading
 * nulls. The SMA seed is computed from the first `length`
 * non-null values starting at `firstValidIdx`; subsequent
 * values feed the recursive EMA. CONST short-circuit when the
 * seed window is constant.
 */
export function applyLineTsiSignalCrossEma(
  values: readonly (number | null)[],
  length: number,
  firstValidIdx: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  if (length === 1) {
    for (let i = firstValidIdx; i < values.length; i += 1) {
      const v = values[i];
      if (v != null) out[i] = posZero(v);
    }
    return out;
  }
  if (firstValidIdx + length - 1 >= values.length) return out;
  let sum = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let j = firstValidIdx; j < firstValidIdx + length; j += 1) {
    const v = values[j];
    if (v == null) return out;
    sum += v;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
  }
  const seedIdx = firstValidIdx + length - 1;
  let prev = winMin === winMax ? winMin : sum / length;
  out[seedIdx] = posZero(prev);
  const alpha = 2 / (length + 1);
  for (let i = seedIdx + 1; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) continue;
    prev = prev + alpha * (v - prev);
    out[i] = posZero(prev);
  }
  return out;
}

export interface LineTsiSignalCrossChannels {
  tsi: Array<number | null>;
  signal: Array<number | null>;
  long: number;
  short: number;
  signalLength: number;
}

export function computeLineTsiSignalCross(
  series: readonly ChartLineTsiSignalCrossPoint[] | null | undefined,
  options: { long?: number; short?: number; signal?: number } = {},
): LineTsiSignalCrossChannels {
  const cleaned = getLineTsiSignalCrossFinitePoints(series);
  const long = normalizeLineTsiSignalCrossLength(
    options.long,
    DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_LONG,
  );
  const short = normalizeLineTsiSignalCrossLength(
    options.short,
    DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SHORT,
  );
  const signalLength = normalizeLineTsiSignalCrossLength(
    options.signal,
    DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SIGNAL,
  );
  if (cleaned.length === 0) {
    return { tsi: [], signal: [], long, short, signalLength };
  }
  const n = cleaned.length;
  const closes = cleaned.map((p) => p.close);

  // Raw momentum + absolute momentum (valid from i = 1).
  const mom: Array<number | null> = new Array(n).fill(null);
  const absMom: Array<number | null> = new Array(n).fill(null);
  for (let i = 1; i < n; i += 1) {
    const cur = closes[i];
    const prev = closes[i - 1];
    if (!isFiniteNumber(cur) || !isFiniteNumber(prev)) continue;
    const d = cur - prev;
    mom[i] = posZero(d);
    absMom[i] = posZero(Math.abs(d));
  }

  const sm1Mom = applyLineTsiSignalCrossEma(mom, long, 1);
  const sm1Abs = applyLineTsiSignalCrossEma(absMom, long, 1);

  const sm2Mom = applyLineTsiSignalCrossEma(sm1Mom, short, long);
  const sm2Abs = applyLineTsiSignalCrossEma(sm1Abs, short, long);

  const tsi: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const numer = sm2Mom[i];
    const denom = sm2Abs[i];
    if (numer == null || denom == null) continue;
    tsi[i] = denom === 0 ? 0 : posZero(100 * (numer / denom));
  }

  const tsiFirstIdx = long + short - 1;
  const signal = applyLineTsiSignalCrossEma(tsi, signalLength, tsiFirstIdx);

  return { tsi, signal, long, short, signalLength };
}

export function classifyLineTsiSignalCrossRegime(
  tsi: number | null,
  signal: number | null,
): ChartLineTsiSignalCrossRegime {
  if (tsi == null || signal == null) return 'none';
  if (tsi >= signal) return 'bullish';
  return 'bearish';
}

export function detectLineTsiSignalCrossCrosses(
  series: readonly ChartLineTsiSignalCrossPoint[],
  tsi: readonly (number | null)[],
  signal: readonly (number | null)[],
): ChartLineTsiSignalCrossCross[] {
  const out: ChartLineTsiSignalCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prevT = tsi[i - 1];
    const prevS = signal[i - 1];
    const curT = tsi[i];
    const curS = signal[i];
    if (
      prevT == null ||
      prevS == null ||
      curT == null ||
      curS == null
    )
      continue;
    const prevDiff = prevT - prevS;
    const curDiff = curT - curS;
    if (prevDiff <= 0 && curDiff > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prevDiff >= 0 && curDiff < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineTsiSignalCross(
  data: ChartLineTsiSignalCrossPoint[],
  options: {
    long?: number;
    short?: number;
    signal?: number;
  } = {},
): ChartLineTsiSignalCrossRun {
  const cleaned = getLineTsiSignalCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const channels = computeLineTsiSignalCross(series, {
    long: options.long ?? undefined,
    short: options.short ?? undefined,
    signal: options.signal ?? undefined,
  });

  const samples: ChartLineTsiSignalCrossSample[] = series.map((p, i) => {
    const t = channels.tsi[i] ?? null;
    const s = channels.signal[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      tsi: t,
      signal: s,
      regime: classifyLineTsiSignalCrossRegime(t, s),
    };
  });

  const crosses = detectLineTsiSignalCrossCrosses(
    series,
    channels.tsi,
    channels.signal,
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

  const ok =
    series.length > channels.long + channels.short + channels.signalLength;

  return {
    series,
    long: channels.long,
    short: channels.short,
    signal: channels.signalLength,
    tsiValues: channels.tsi,
    signalValues: channels.signal,
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

export interface ComputeLineTsiSignalCrossLayoutOptions {
  data: ChartLineTsiSignalCrossPoint[];
  long?: number;
  short?: number;
  signal?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTsiSignalCrossLayout(
  opts: ComputeLineTsiSignalCrossLayoutOptions,
): ChartLineTsiSignalCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PANEL_GAP;

  const run = runLineTsiSignalCross(opts.data, {
    long: opts.long ?? undefined,
    short: opts.short ?? undefined,
    signal: opts.signal ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // TSI is bounded to [-100, 100]; fixed range with zero at
  // midline for the visual baseline.
  const oscMin = -100;
  const oscMax = 100;
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
      tsiPath: '',
      signalPath: '',
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
  const priceDots: ChartLineTsiSignalCrossDot[] = [];
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

  let tsiPath = '';
  let tsiFirst = true;
  for (const s of run.samples) {
    if (s.tsi == null) {
      tsiFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.tsi);
    tsiPath += `${tsiFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    tsiFirst = false;
  }
  tsiPath = tsiPath.trim();

  let signalPath = '';
  let sigFirst = true;
  for (const s of run.samples) {
    if (s.signal == null) {
      sigFirst = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.signal);
    signalPath += `${sigFirst ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    sigFirst = false;
  }
  signalPath = signalPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.tsiValues[c.index] ?? 0);
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
    tsiPath,
    signalPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    zeroY,
    crossMarkers,
    run,
  };
}

export function describeLineTsiSignalCrossChart(
  data: ChartLineTsiSignalCrossPoint[],
  options: {
    long?: number;
    short?: number;
    signal?: number;
  } = {},
): string {
  const cleaned = getLineTsiSignalCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const long = normalizeLineTsiSignalCrossLength(
    options.long,
    DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_LONG,
  );
  const short = normalizeLineTsiSignalCrossLength(
    options.short,
    DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SHORT,
  );
  const signalLength = normalizeLineTsiSignalCrossLength(
    options.signal,
    DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SIGNAL,
  );
  return (
    `TSI Signal Cross chart over ${cleaned.length} bars ` +
    `(long ${long}, short ${short}, signal ${signalLength}). ` +
    `Top panel renders the close with bullish (TSI over signal ` +
    `cross up) / bearish (cross down) chevron overlays at every ` +
    `True Strength Index signal-line crossover; bottom panel ` +
    `renders the close-only TSI line and its EMA signal on a ` +
    `fixed -100 to 100 oscillator and marks TSI over signal ` +
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

export const ChartLineTsiSignalCross = forwardRef<
  HTMLDivElement,
  ChartLineTsiSignalCrossProps
>(function ChartLineTsiSignalCross(props, ref): ReactNode {
  const {
    data,
    long = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_LONG,
    short = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SHORT,
    signal = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SIGNAL,
    width = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_PRICE_COLOR,
    tsiColor = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_TSI_COLOR,
    signalColor = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_SIGNAL_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_TSI_SIGNAL_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTsi = true,
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
    () => getLineTsiSignalCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTsiSignalCrossLayout({
        data: cleaned,
        long,
        short,
        signal,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, long, short, signal, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineTsiSignalCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineTsiSignalCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineTsiSignalCrossSeriesId,
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
        data-section="chart-line-tsi-signal-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTsiSignalCrossChart(cleaned, { long, short, signal });

  const showPrice = !hidden.has('price');
  const showTsiLine = !hidden.has('tsi') && showTsi;
  const showSignalLine = !hidden.has('signal') && showSignal;

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
      aria-label={ariaLabel ?? 'TSI Signal Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-tsi-signal-cross"
      data-long={long}
      data-short={short}
      data-signal={signal}
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
        data-section="chart-line-tsi-signal-cross-title"
      >
        {ariaLabel ?? 'TSI Signal Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-tsi-signal-cross-aria-desc"
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
        data-section="chart-line-tsi-signal-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-tsi-signal-cross-grid">
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
                  data-section="chart-line-tsi-signal-cross-grid-line-price"
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
                  data-section="chart-line-tsi-signal-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-tsi-signal-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-tsi-signal-cross-band-zero"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-tsi-signal-cross-axes">
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
                  data-section="chart-line-tsi-signal-cross-tick-price"
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
                  data-section="chart-line-tsi-signal-cross-tick-osc"
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
            data-section="chart-line-tsi-signal-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-tsi-signal-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-tsi-signal-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showTsiLine ? (
          <path
            d={layout.tsiPath}
            stroke={tsiColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-tsi-signal-cross-tsi-path"
          />
        ) : null}

        {showSignalLine ? (
          <path
            d={layout.signalPath}
            stroke={signalColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-tsi-signal-cross-signal-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-tsi-signal-cross-crosses"
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
                data-section={`chart-line-tsi-signal-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-tsi-signal-cross-overlay-crosses"
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
                data-section={`chart-line-tsi-signal-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-tsi-signal-cross-hover-targets">
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
                data-section="chart-line-tsi-signal-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-tsi-signal-cross-tooltip"
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
                  data-section="chart-line-tsi-signal-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-signal-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-signal-cross-tooltip-tsi"
                >
                  TSI{' '}
                  {tooltipSample.tsi == null
                    ? '--'
                    : formatOsc(tooltipSample.tsi)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-signal-cross-tooltip-signal"
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
                  data-section="chart-line-tsi-signal-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-signal-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-signal-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-signal-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-signal-cross-tooltip-params"
                >
                  l/s/sig {layout.run.long} / {layout.run.short} /{' '}
                  {layout.run.signal}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-tsi-signal-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          long {long} | short {short} | signal {signal} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-tsi-signal-cross-legend"
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
              { id: 'tsi' as const, color: tsiColor, label: 'TSI' },
              { id: 'signal' as const, color: signalColor, label: 'signal' },
            ] satisfies Array<{
              id: ChartLineTsiSignalCrossSeriesId;
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

ChartLineTsiSignalCross.displayName = 'ChartLineTsiSignalCross';
