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
 * ChartLineTsiSignal -- pure-SVG dual-panel chart with William
 * Blau's True Strength Index (TSI) and its signal line beneath
 * the close.
 *
 * Definition:
 *
 *   mom[i]     = close[i] - close[i - 1]
 *   ema1Mom[i] = EMA(mom, longLength)[i]
 *   ema2Mom[i] = EMA(ema1Mom, shortLength)[i]
 *   ema1Abs[i] = EMA(|mom|, longLength)[i]
 *   ema2Abs[i] = EMA(ema1Abs, shortLength)[i]
 *   TSI[i]     = 100 * ema2Mom[i] / ema2Abs[i]
 *   Signal[i]  = EMA(TSI, signalLength)[i]
 *
 * Defaults: `longLength = 25`, `shortLength = 13`,
 * `signalLength = 13`. The seed bar (i = 0) has no momentum and
 * is `null`. When the absolute-momentum EMA is zero (singular:
 * completely flat close) the TSI is `null`.
 *
 * Bit-exact anchors:
 *
 *   * **RISING_BY_S (close[i] = c0 + S * i, S > 0)**:
 *     mom = +S at every bar past the seed; |mom| = +S. Since
 *     both EMAs operate on the same constant series, their
 *     ULP drift is identical and the ratio `ema2Mom / ema2Abs`
 *     is exactly 1. `TSI = 100` bit-exact past warmup. The
 *     signal EMA of constant 100 is 100 bit-exact too.
 *   * **FALLING_BY_S (close[i] = c0 - S * i, S > 0)**:
 *     mom = -S, |mom| = +S. The EMAs differ only by sign, so
 *     `TSI = -100` bit-exact, and the signal converges to
 *     -100.
 *   * **CONST_FLAT (close == K)**: mom = 0, |mom| = 0,
 *     ema2Abs = 0 -> singular -> `TSI = null` at every bar.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots both TSI and its
 * signal on a fixed `[-100, +100]` axis with a zero baseline.
 */

export interface ChartLineTsiSignalPoint {
  x: number;
  close: number;
}

export type ChartLineTsiSignalZone =
  | 'overbought'
  | 'oversold'
  | 'neutral'
  | 'none';

export type ChartLineTsiSignalSeriesId = 'price' | 'tsi' | 'signal';

export interface ChartLineTsiSignalSample {
  index: number;
  x: number;
  close: number;
  tsi: number | null;
  signal: number | null;
  zone: ChartLineTsiSignalZone;
}

export interface ChartLineTsiSignalRun {
  series: ChartLineTsiSignalPoint[];
  longLength: number;
  shortLength: number;
  signalLength: number;
  overboughtThreshold: number;
  oversoldThreshold: number;
  tsi: Array<number | null>;
  signal: Array<number | null>;
  samples: ChartLineTsiSignalSample[];
  tsiFinal: number | null;
  signalFinal: number | null;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineTsiSignalMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  tsi: number;
  signal: number | null;
  zone: ChartLineTsiSignalZone;
}

export interface ChartLineTsiSignalDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTsiSignalLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  tsiTop: number;
  tsiBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineTsiSignalDot[];
  tsiPath: string;
  signalPath: string;
  markers: ChartLineTsiSignalMarker[];
  priceMin: number;
  priceMax: number;
  zeroLineY: number;
  overboughtY: number;
  oversoldY: number;
  run: ChartLineTsiSignalRun;
}

export interface ChartLineTsiSignalProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTsiSignalPoint[];
  longLength?: number;
  shortLength?: number;
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
  tsiColor?: string;
  signalColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  neutralColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  bandColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTsi?: boolean;
  showSignal?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTsiSignalSeriesId[];
  defaultHiddenSeries?: ChartLineTsiSignalSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTsiSignalSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineTsiSignalSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatTsi?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_TSI_SIGNAL_WIDTH = 720;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_PADDING = 44;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_LONG_LENGTH = 25;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_SHORT_LENGTH = 13;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_SIGNAL_LENGTH = 13;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_OVERBOUGHT_THRESHOLD = 25;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_OVERSOLD_THRESHOLD = -25;
export const DEFAULT_CHART_LINE_TSI_SIGNAL_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_TSI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_SIGNAL_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_OVERBOUGHT_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_OVERSOLD_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_ZERO_LINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TSI_SIGNAL_BAND_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineTsiSignalFinitePoints(
  data: readonly ChartLineTsiSignalPoint[] | null | undefined,
): ChartLineTsiSignalPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTsiSignalPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineTsiSignalLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/**
 * Single-pass EMA seeded at the first finite value.
 *
 *   alpha = 2 / (length + 1)
 *   ema[0] = x[0]
 *   ema[i] = alpha * x[i] + (1 - alpha) * ema[i - 1]
 *
 * Non-finite inputs null the bar and break the chain (the next
 * finite bar re-seeds).
 */
export function applyLineTsiSignalEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const alpha = 2 / (length + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev === null) {
      out.push(v);
      prev = v;
      continue;
    }
    const e: number = alpha * v + (1 - alpha) * prev;
    out.push(e);
    prev = e;
  }
  return out;
}

export interface ChartLineTsiSignalOptions {
  longLength?: number;
  shortLength?: number;
  signalLength?: number;
}

/**
 * Compute the TSI and its signal line per bar.
 */
export function computeLineTsiSignal(
  closes: readonly number[] | null | undefined,
  options: ChartLineTsiSignalOptions = {},
): { tsi: Array<number | null>; signal: Array<number | null> } {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { tsi: [], signal: [] };
  }
  const longLength = normalizeLineTsiSignalLength(
    options.longLength,
    DEFAULT_CHART_LINE_TSI_SIGNAL_LONG_LENGTH,
  );
  const shortLength = normalizeLineTsiSignalLength(
    options.shortLength,
    DEFAULT_CHART_LINE_TSI_SIGNAL_SHORT_LENGTH,
  );
  const signalLength = normalizeLineTsiSignalLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TSI_SIGNAL_SIGNAL_LENGTH,
  );
  // Momentum and |momentum| per bar; i = 0 has no prior so it
  // is null (which breaks the EMA chain re-seed on bar 1).
  const mom: Array<number | null> = [];
  const absMom: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      mom.push(null);
      absMom.push(null);
      continue;
    }
    const cCur = closes[i];
    const cPrev = closes[i - 1];
    if (!isFiniteNumber(cCur) || !isFiniteNumber(cPrev)) {
      mom.push(null);
      absMom.push(null);
      continue;
    }
    const m = cCur - cPrev;
    mom.push(m);
    absMom.push(Math.abs(m));
  }
  const ema1Mom = applyLineTsiSignalEma(mom, longLength);
  const ema2Mom = applyLineTsiSignalEma(ema1Mom, shortLength);
  const ema1Abs = applyLineTsiSignalEma(absMom, longLength);
  const ema2Abs = applyLineTsiSignalEma(ema1Abs, shortLength);
  const tsi: Array<number | null> = closes.map((_, i) => {
    const n = ema2Mom[i];
    const d = ema2Abs[i];
    if (
      n === null ||
      n === undefined ||
      d === null ||
      d === undefined ||
      !isFiniteNumber(n) ||
      !isFiniteNumber(d) ||
      d === 0
    ) {
      return null;
    }
    return (100 * n) / d;
  });
  const signal = applyLineTsiSignalEma(tsi, signalLength);
  return { tsi, signal };
}

/** Classify a TSI reading. */
export function classifyLineTsiSignalZone(
  value: number | null,
  overbought: number,
  oversold: number,
): ChartLineTsiSignalZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= overbought) return 'overbought';
  if (value <= oversold) return 'oversold';
  return 'neutral';
}

/** Run the full TSI pipeline plus sample classification. */
export function runLineTsiSignal(
  data: readonly ChartLineTsiSignalPoint[] | null | undefined,
  options: ChartLineTsiSignalOptions & {
    overboughtThreshold?: number;
    oversoldThreshold?: number;
  } = {},
): ChartLineTsiSignalRun {
  const series = getLineTsiSignalFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const longLength = normalizeLineTsiSignalLength(
    options.longLength,
    DEFAULT_CHART_LINE_TSI_SIGNAL_LONG_LENGTH,
  );
  const shortLength = normalizeLineTsiSignalLength(
    options.shortLength,
    DEFAULT_CHART_LINE_TSI_SIGNAL_SHORT_LENGTH,
  );
  const signalLength = normalizeLineTsiSignalLength(
    options.signalLength,
    DEFAULT_CHART_LINE_TSI_SIGNAL_SIGNAL_LENGTH,
  );
  const overboughtThreshold = isFiniteNumber(options.overboughtThreshold)
    ? options.overboughtThreshold
    : DEFAULT_CHART_LINE_TSI_SIGNAL_OVERBOUGHT_THRESHOLD;
  const oversoldThreshold = isFiniteNumber(options.oversoldThreshold)
    ? options.oversoldThreshold
    : DEFAULT_CHART_LINE_TSI_SIGNAL_OVERSOLD_THRESHOLD;
  const closes = series.map((p) => p.close);
  const { tsi, signal } = computeLineTsiSignal(closes, {
    longLength,
    shortLength,
    signalLength,
  });
  const samples: ChartLineTsiSignalSample[] = series.map((point, index) => {
    const t = tsi[index] ?? null;
    const s = signal[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      tsi: t,
      signal: s,
      zone: classifyLineTsiSignalZone(
        t,
        overboughtThreshold,
        oversoldThreshold,
      ),
    };
  });
  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let tsiFinal: number | null = null;
  let signalFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.tsi)) tsiFinal = sample.tsi;
    if (isFiniteNumber(sample.signal)) signalFinal = sample.signal;
  }
  return {
    series = [],
    longLength,
    shortLength,
    signalLength,
    overboughtThreshold,
    oversoldThreshold,
    tsi,
    signal,
    samples,
    tsiFinal,
    signalFinal,
    overboughtCount,
    oversoldCount,
    neutralCount,
    noneCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineTsiSignalLayoutOptions
  extends ChartLineTsiSignalOptions {
  data: readonly ChartLineTsiSignalPoint[] | null | undefined;
  overboughtThreshold?: number;
  oversoldThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

function buildLinePath(
  points: ReadonlyArray<{ x: number; y: number }>,
): string {
  if (points.length === 0) return '';
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    if (i < points.length - 1) d += ' ';
  }
  return d;
}

/** Project the run into a dual-panel SVG layout. */
export function computeLineTsiSignalLayout(
  options: ChartLineTsiSignalLayoutOptions,
): ChartLineTsiSignalLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_TSI_SIGNAL_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_TSI_SIGNAL_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_TSI_SIGNAL_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_TSI_SIGNAL_PANEL_GAP;

  const run = runLineTsiSignal(options.data, {
    ...(options.longLength !== undefined
      ? { longLength: options.longLength }
      : {}),
    ...(options.shortLength !== undefined
      ? { shortLength: options.shortLength }
      : {}),
    ...(options.signalLength !== undefined
      ? { signalLength: options.signalLength }
      : {}),
    ...(options.overboughtThreshold !== undefined
      ? { overboughtThreshold: options.overboughtThreshold }
      : {}),
    ...(options.oversoldThreshold !== undefined
      ? { oversoldThreshold: options.oversoldThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const tsiHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const tsiTop = priceBottom + panelGap;
  const tsiBottom = tsiTop + tsiHeight;

  const okGeom = innerWidth > 0 && innerHeight > panelGap;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < priceMin) priceMin = sample.close;
    if (sample.close > priceMax) priceMax = sample.close;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }
  const priceY = (value: number): number =>
    priceBottom - ((value - priceMin) / (priceMax - priceMin)) * priceHeight;

  // TSI panel spans the constant range [-100, +100].
  const tsiMin = -100;
  const tsiMax = 100;
  const tsiY = (value: number): number =>
    tsiBottom - ((value - tsiMin) / (tsiMax - tsiMin)) * tsiHeight;
  const zeroLineY = tsiY(0);
  const overboughtY = tsiY(run.overboughtThreshold);
  const oversoldY = tsiY(run.oversoldThreshold);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineTsiSignalDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const tsiLinePoints: Array<{ x: number; y: number }> = [];
  const signalLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineTsiSignalMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (isFiniteNumber(sample.tsi)) {
      const cx = xAt(index);
      const yc = tsiY(sample.tsi);
      tsiLinePoints.push({ x: cx, y: yc });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        tsi: sample.tsi,
        signal: sample.signal,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.signal)) {
      const cx = xAt(index);
      signalLinePoints.push({ x: cx, y: tsiY(sample.signal) });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    tsiTop,
    tsiBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    tsiPath: buildLinePath(tsiLinePoints),
    signalPath: buildLinePath(signalLinePoints),
    markers,
    priceMin,
    priceMax,
    zeroLineY,
    overboughtY,
    oversoldY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineTsiSignalChart(
  data: readonly ChartLineTsiSignalPoint[] | null | undefined,
  options: ChartLineTsiSignalOptions & {
    overboughtThreshold?: number;
    oversoldThreshold?: number;
  } = {},
): string {
  const run = runLineTsiSignal(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const tsiText = run.tsiFinal === null ? 'n/a' : run.tsiFinal.toFixed(4);
  const sigText =
    run.signalFinal === null ? 'n/a' : run.signalFinal.toFixed(4);
  return (
    `Dual-panel chart with a True Strength Index oscillator and ` +
    `its signal line beneath the close (long ${run.longLength}, ` +
    `short ${run.shortLength}, signal ${run.signalLength}, ` +
    `overbought ${run.overboughtThreshold}, oversold ` +
    `${run.oversoldThreshold}). The TSI doubly smooths bar-to-bar ` +
    `momentum and its absolute value, then takes the ratio scaled ` +
    `to 100. The signal line is an EMA of the TSI. Across ${total} ` +
    `bars the TSI is overbought on ${run.overboughtCount}, ` +
    `neutral on ${run.neutralCount}, oversold on ` +
    `${run.oversoldCount}, and undefined on ${run.noneCount}. The ` +
    `final TSI is ${tsiText} and the final signal is ${sigText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatTsi(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineTsiSignalZone,
  overboughtColor: string,
  neutralColor: string,
  oversoldColor: string,
  noneColor: string,
): string {
  if (zone === 'overbought') return overboughtColor;
  if (zone === 'oversold') return oversoldColor;
  if (zone === 'neutral') return neutralColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineTsiSignalZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

/**
 * ChartLineTsiSignal -- dual-panel pure-SVG True Strength Index
 * + signal line chart.
 */
export const ChartLineTsiSignal = forwardRef<
  HTMLDivElement,
  ChartLineTsiSignalProps
>(function ChartLineTsiSignal(props, ref) {
  const {
    data,
    longLength = DEFAULT_CHART_LINE_TSI_SIGNAL_LONG_LENGTH,
    shortLength = DEFAULT_CHART_LINE_TSI_SIGNAL_SHORT_LENGTH,
    signalLength = DEFAULT_CHART_LINE_TSI_SIGNAL_SIGNAL_LENGTH,
    overboughtThreshold = DEFAULT_CHART_LINE_TSI_SIGNAL_OVERBOUGHT_THRESHOLD,
    oversoldThreshold = DEFAULT_CHART_LINE_TSI_SIGNAL_OVERSOLD_THRESHOLD,
    width = DEFAULT_CHART_LINE_TSI_SIGNAL_WIDTH,
    height = DEFAULT_CHART_LINE_TSI_SIGNAL_HEIGHT,
    padding = DEFAULT_CHART_LINE_TSI_SIGNAL_PADDING,
    panelGap = DEFAULT_CHART_LINE_TSI_SIGNAL_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TSI_SIGNAL_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TSI_SIGNAL_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TSI_SIGNAL_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TSI_SIGNAL_PRICE_COLOR,
    tsiColor = DEFAULT_CHART_LINE_TSI_SIGNAL_TSI_COLOR,
    signalColor = DEFAULT_CHART_LINE_TSI_SIGNAL_SIGNAL_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_TSI_SIGNAL_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_TSI_SIGNAL_OVERSOLD_COLOR,
    neutralColor = DEFAULT_CHART_LINE_TSI_SIGNAL_NEUTRAL_COLOR,
    noneColor = DEFAULT_CHART_LINE_TSI_SIGNAL_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_TSI_SIGNAL_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TSI_SIGNAL_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_TSI_SIGNAL_ZERO_LINE_COLOR,
    bandColor = DEFAULT_CHART_LINE_TSI_SIGNAL_BAND_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTsi = true,
    showSignal = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showZeroLine = true,
    showBands = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatTsi = defaultFormatTsi,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-tsi-signal-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineTsiSignalSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineTsiSignalSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineTsiSignalLayout({
        data,
        longLength,
        shortLength,
        signalLength,
        overboughtThreshold,
        oversoldThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      data,
      longLength,
      shortLength,
      signalLength,
      overboughtThreshold,
      oversoldThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineTsiSignalChart(data, {
      longLength,
      shortLength,
      signalLength,
      overboughtThreshold,
      oversoldThreshold,
    });
  const resolvedLabel =
    ariaLabel ??
    `True Strength Index chart, long ${run.longLength}, short ${run.shortLength}, signal ${run.signalLength}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineTsiSignalSeriesId): void => {
    const next = isHidden(id);
    if (hiddenSeries === undefined) {
      setInternalHidden((prev) =>
        prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
      );
    }
    onSeriesToggle?.({ seriesId: id, hidden: !next });
  };

  const handleActivate = (sampleIndex: number): void => {
    const sample = run.samples[sampleIndex];
    if (sample) onPointClick?.({ point: sample });
  };

  const handleKey = (
    event: KeyboardEvent<SVGElement>,
    sampleIndex: number,
  ): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleActivate(sampleIndex);
    }
  };

  const tickValues: number[] = [];
  if (tickCount > 1) {
    for (let i = 0; i < tickCount; i += 1) {
      tickValues.push(i / (tickCount - 1));
    }
  }

  const containerStyle: CSSProperties = {
    display: 'inline-block',
    fontFamily:
      'var(--font-sans, ui-sans-serif, system-ui, -apple-system, sans-serif)',
    ...style,
  };

  const hoverSample =
    hover !== null && run.samples[hover] ? run.samples[hover]! : null;

  let tooltip: ReactNode = null;
  if (showTooltip && hoverSample && !isEmpty) {
    const dot = layout.priceDots[hoverSample.index];
    const anchorX = dot ? dot.cx : (layout.innerLeft + layout.innerRight) / 2;
    const tooltipW = 240;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-tsi-signal-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={102}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-tsi-signal-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-tsi-signal-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-tsi-signal-tooltip-tsi"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`TSI: ${
            hoverSample.tsi === null ? 'n/a' : formatTsi(hoverSample.tsi)
          }`}
        </text>
        <text
          data-section="chart-line-tsi-signal-tooltip-signal"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Signal: ${
            hoverSample.signal === null
              ? 'n/a'
              : formatTsi(hoverSample.signal)
          }`}
        </text>
        <text
          data-section="chart-line-tsi-signal-tooltip-zone"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const tsiHidden = isHidden('tsi') || !showTsi;
  const signalHidden = isHidden('signal') || !showSignal;

  const legendItems: Array<{
    id: ChartLineTsiSignalSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'tsi', label: 'TSI', color: tsiColor },
    { id: 'signal', label: 'Signal', color: signalColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-tsi-signal"
      data-empty={isEmpty ? 'true' : 'false'}
      data-long-length={run.longLength}
      data-short-length={run.shortLength}
      data-signal-length={run.signalLength}
      data-tsi-final={run.tsiFinal === null ? '' : run.tsiFinal}
      data-signal-final={run.signalFinal === null ? '' : run.signalFinal}
      data-overbought-count={run.overboughtCount}
      data-oversold-count={run.oversoldCount}
      data-neutral-count={run.neutralCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-tsi-signal-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {description}
      </span>

      {isEmpty ? (
        <svg
          data-section="chart-line-tsi-signal-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-tsi-signal-empty"
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            fill={axisColor}
            fontSize={13}
          >
            No data
          </text>
        </svg>
      ) : (
        <svg
          data-section="chart-line-tsi-signal-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-tsi-signal-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yt =
                  layout.tsiBottom -
                  t * (layout.tsiBottom - layout.tsiTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-tsi-signal-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-tsi-signal-grid-line"
                      data-panel="tsi"
                      x1={layout.innerLeft}
                      y1={yt}
                      x2={layout.innerRight}
                      y2={yt}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-tsi-signal-axes">
              <line
                data-section="chart-line-tsi-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-tsi-signal-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-tsi-signal-axis"
                data-panel="tsi"
                x1={layout.innerLeft}
                y1={layout.tsiTop}
                x2={layout.innerLeft}
                y2={layout.tsiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-tsi-signal-axis"
                data-panel="tsi"
                x1={layout.innerLeft}
                y1={layout.tsiBottom}
                x2={layout.innerRight}
                y2={layout.tsiBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-tsi-signal-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-tsi-signal-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-tsi-signal-tick-label"
                data-panel="tsi"
                x={layout.innerLeft - 6}
                y={layout.tsiTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatTsi(100)}
              </text>
              <text
                data-section="chart-line-tsi-signal-tick-label"
                data-panel="tsi"
                x={layout.innerLeft - 6}
                y={layout.tsiBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatTsi(-100)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-tsi-signal-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {showBands ? (
            <g data-section="chart-line-tsi-signal-bands">
              <line
                data-section="chart-line-tsi-signal-overbought-band"
                x1={layout.innerLeft}
                y1={layout.overboughtY}
                x2={layout.innerRight}
                y2={layout.overboughtY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-tsi-signal-oversold-band"
                x1={layout.innerLeft}
                y1={layout.oversoldY}
                x2={layout.innerRight}
                y2={layout.oversoldY}
                stroke={bandColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-tsi-signal-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Close line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-tsi-signal-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-tsi-signal-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatPrice(
                    dot.close,
                  )}`}
                  onMouseEnter={() => setHover(dot.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(dot.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(dot.index)}
                  onKeyDown={(e) => handleKey(e, dot.index)}
                />
              ))}
            </g>
          ) : null}

          {!signalHidden ? (
            <path
              data-section="chart-line-tsi-signal-signal"
              d={layout.signalPath}
              fill="none"
              stroke={signalColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Signal line"
            />
          ) : null}

          {!tsiHidden ? (
            <path
              data-section="chart-line-tsi-signal-line"
              d={layout.tsiPath}
              fill="none"
              stroke={tsiColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`TSI line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-tsi-signal-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-tsi-signal-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-tsi={marker.tsi}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    overboughtColor,
                    neutralColor,
                    oversoldColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, TSI ${formatTsi(marker.tsi)}, ${zoneLabelOf(
                    marker.zone,
                  )}`}
                  onMouseEnter={() => setHover(marker.index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(marker.index)}
                  onBlur={() => setHover(null)}
                  onClick={() => handleActivate(marker.index)}
                  onKeyDown={(e) => handleKey(e, marker.index)}
                />
              ))}
            </g>
          ) : null}

          {showConfigBadge ? (
            <g data-section="chart-line-tsi-signal-badge">
              <rect
                data-section="chart-line-tsi-signal-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={170}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-tsi-signal-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`TSI ${run.longLength}/${run.shortLength} sig=${run.signalLength}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-tsi-signal-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            fontSize: 12,
          }}
        >
          {legendItems.map((item) => {
            const hidden = isHidden(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-tsi-signal-legend-item"
                data-series-id={item.id}
                data-hidden={hidden ? 'true' : 'false'}
                onClick={() => toggleSeries(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  opacity: hidden ? 0.4 : 1,
                  color: 'inherit',
                  font: 'inherit',
                }}
                aria-pressed={!hidden}
              >
                <span
                  data-section="chart-line-tsi-signal-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-tsi-signal-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-tsi-signal-legend-stats"
            style={{ color: axisColor }}
          >
            {`overbought ${run.overboughtCount} / neutral ${run.neutralCount} / oversold ${run.oversoldCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTsiSignal.displayName = 'ChartLineTsiSignal';
