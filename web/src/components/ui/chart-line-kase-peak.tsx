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
 * ChartLineKasePeak -- pure-SVG two-panel Kase Peak Oscillator
 * chart (Cynthia Kase, simplified formulation).
 *
 * The Kase Peak compares two cycle lengths' volatility-scaled
 * momentum readings. For each lookback `L` and bar `i >= L`:
 *
 *   mom(L, i)     = close[i] - close[i - L]
 *   volAvg(L, i)  = mean over [i - L + 1, i] of abs(close[j] - close[j - 1])
 *   peakOut(L, i) = mom(L, i) / volAvg(L, i)
 *
 *   KP[i] = peakOut(fastLength, i) - peakOut(slowLength, i)
 *
 * A bar with a zero `volAvg` on either cycle (no single-bar
 * movement inside the window) is null. The first `max(fast, slow)`
 * bars are null on both peakOuts.
 *
 * Three bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (close == K)` -> `mom = 0`, `volAvg = 0`, so
 *     KP is null at every bar.
 *   * `RISING (close == i + 10, monotone increasing)` with
 *     `fast = 2, slow = 4` -> `mom(2) = 2, volAvg(2) = 1, peakOut(2)
 *     = 2`; `mom(4) = 4, volAvg(4) = 1, peakOut(4) = 4`; `KP = 2 -
 *     4 = -2` bit-exact.
 *   * `FALLING (close == 19 - i)` with same lengths -> `peakOut(2)
 *     = -2`, `peakOut(4) = -4`; `KP = -2 - (-4) = +2` bit-exact.
 *
 * The top panel plots the close; the bottom panel plots the
 * Kase Peak with a zero line and `+/-threshold` dashed lines.
 */

export interface ChartLineKasePeakPoint {
  x: number;
  close: number;
}

export type ChartLineKasePeakZone =
  | 'peak-bull'
  | 'bull'
  | 'bear'
  | 'peak-bear'
  | 'flat'
  | 'none';

export type ChartLineKasePeakSeriesId = 'price' | 'kp' | 'fast' | 'slow';

export interface ChartLineKasePeakSample {
  index: number;
  x: number;
  close: number;
  fast: number | null;
  slow: number | null;
  kp: number | null;
  zone: ChartLineKasePeakZone;
}

export interface ChartLineKasePeakRun {
  series: ChartLineKasePeakPoint[];
  fastLength: number;
  slowLength: number;
  threshold: number;
  fast: Array<number | null>;
  slow: Array<number | null>;
  kp: Array<number | null>;
  samples: ChartLineKasePeakSample[];
  kpFinal: number | null;
  peakBullCount: number;
  bullCount: number;
  bearCount: number;
  peakBearCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineKasePeakMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  kp: number;
  zone: ChartLineKasePeakZone;
}

export interface ChartLineKasePeakDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineKasePeakLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  kpPanelTop: number;
  kpPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineKasePeakDot[];
  kpPath: string;
  fastPath: string;
  slowPath: string;
  markers: ChartLineKasePeakMarker[];
  zeroY: number;
  upperThresholdY: number;
  lowerThresholdY: number;
  priceMin: number;
  priceMax: number;
  kpMin: number;
  kpMax: number;
  run: ChartLineKasePeakRun;
}

export interface ChartLineKasePeakProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineKasePeakPoint[];
  fastLength?: number;
  slowLength?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  kpColor?: string;
  fastColor?: string;
  slowColor?: string;
  peakBullColor?: string;
  bullColor?: string;
  bearColor?: string;
  peakBearColor?: string;
  flatColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showKp?: boolean;
  showFast?: boolean;
  showSlow?: boolean;
  showThresholdLines?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineKasePeakSeriesId[];
  defaultHiddenSeries?: ChartLineKasePeakSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineKasePeakSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineKasePeakSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_KASE_PEAK_WIDTH = 720;
export const DEFAULT_CHART_LINE_KASE_PEAK_HEIGHT = 400;
export const DEFAULT_CHART_LINE_KASE_PEAK_PADDING = 44;
export const DEFAULT_CHART_LINE_KASE_PEAK_GAP = 12;
export const DEFAULT_CHART_LINE_KASE_PEAK_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KASE_PEAK_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KASE_PEAK_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KASE_PEAK_FAST_LENGTH = 5;
export const DEFAULT_CHART_LINE_KASE_PEAK_SLOW_LENGTH = 30;
export const DEFAULT_CHART_LINE_KASE_PEAK_THRESHOLD = 1;
export const DEFAULT_CHART_LINE_KASE_PEAK_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_KASE_PEAK_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KASE_PEAK_KP_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_KASE_PEAK_FAST_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_KASE_PEAK_SLOW_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_KASE_PEAK_PEAK_BULL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KASE_PEAK_BULL_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_KASE_PEAK_BEAR_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_KASE_PEAK_PEAK_BEAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KASE_PEAK_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_KASE_PEAK_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_KASE_PEAK_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_KASE_PEAK_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_KASE_PEAK_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KASE_PEAK_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineKasePeakFinitePoints(
  data: readonly ChartLineKasePeakPoint[] | null | undefined,
): ChartLineKasePeakPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineKasePeakPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a cycle length to an integer of at least 1. */
export function normalizeLineKasePeakLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce the +/- threshold to a positive finite. */
export function normalizeLineKasePeakThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

/**
 * The volatility-scaled momentum at a single cycle length:
 *
 *   peakOut(L, i) = (close[i] - close[i - L]) / volAvg(L, i)
 *   volAvg(L, i)  = mean of abs(close[j] - close[j - 1])
 *                   for j in [i - L + 1, i]
 *
 * The first `L` bars are null. A bar with a zero `volAvg` is also
 * null (no single-bar movement to scale by).
 */
export function computeLineKasePeakOut(
  closes: readonly number[] | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const L = normalizeLineKasePeakLength(length, 1);
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < L) {
      out.push(null);
      continue;
    }
    const c = closes[i];
    const cAnchor = closes[i - L];
    if (!isFiniteNumber(c) || !isFiniteNumber(cAnchor)) {
      out.push(null);
      continue;
    }
    let absSum = 0;
    let ok = true;
    for (let j = i - L + 1; j <= i; j += 1) {
      const cj = closes[j];
      const cjPrev = closes[j - 1];
      if (!isFiniteNumber(cj) || !isFiniteNumber(cjPrev)) {
        ok = false;
        break;
      }
      absSum += Math.abs(cj - cjPrev);
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const volAvg = absSum / L;
    if (volAvg === 0) {
      out.push(null);
      continue;
    }
    out.push((c - cAnchor) / volAvg);
  }
  return out;
}

/**
 * Run the full Kase Peak pipeline. Returns `{ fast, slow, kp }`
 * arrays; the KP is `fast - slow` and is null when either leg is
 * null.
 */
export function computeLineKasePeak(
  closes: readonly number[] | null | undefined,
  fastLength: unknown,
  slowLength: unknown,
): {
  fast: Array<number | null>;
  slow: Array<number | null>;
  kp: Array<number | null>;
} {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { fast: [], slow: [], kp: [] };
  }
  const fast = computeLineKasePeakOut(closes, fastLength);
  const slow = computeLineKasePeakOut(closes, slowLength);
  const kp: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const f = fast[i];
    const s = slow[i];
    if (!isFiniteNumber(f) || !isFiniteNumber(s)) {
      kp.push(null);
      continue;
    }
    kp.push(f - s);
  }
  return { fast, slow, kp };
}

/** Classify a Kase Peak reading against the threshold ladder. */
export function classifyLineKasePeakZone(
  value: number | null,
  threshold: number,
): ChartLineKasePeakZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'peak-bull';
  if (value > 0) return 'bull';
  if (value <= -threshold) return 'peak-bear';
  if (value < 0) return 'bear';
  return 'flat';
}

export interface ChartLineKasePeakOptions {
  fastLength?: number;
  slowLength?: number;
  threshold?: number;
}

/** Run the full Kase Peak pipeline plus sample classification. */
export function runLineKasePeak(
  data: readonly ChartLineKasePeakPoint[] | null | undefined,
  options: ChartLineKasePeakOptions = {},
): ChartLineKasePeakRun {
  const series = getLineKasePeakFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineKasePeakLength(
    options.fastLength,
    DEFAULT_CHART_LINE_KASE_PEAK_FAST_LENGTH,
  );
  const slowLength = normalizeLineKasePeakLength(
    options.slowLength,
    DEFAULT_CHART_LINE_KASE_PEAK_SLOW_LENGTH,
  );
  const threshold = normalizeLineKasePeakThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_KASE_PEAK_THRESHOLD,
  );
  const closes = series.map((p) => p.close);
  const { fast, slow, kp } = computeLineKasePeak(closes, fastLength, slowLength);
  const samples: ChartLineKasePeakSample[] = series.map((point, index) => {
    const value = kp[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      fast: fast[index] ?? null,
      slow: slow[index] ?? null,
      kp: value,
      zone: classifyLineKasePeakZone(value, threshold),
    };
  });
  let peakBullCount = 0;
  let bullCount = 0;
  let bearCount = 0;
  let peakBearCount = 0;
  let flatCount = 0;
  let kpFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'peak-bull') peakBullCount += 1;
    else if (sample.zone === 'bull') bullCount += 1;
    else if (sample.zone === 'bear') bearCount += 1;
    else if (sample.zone === 'peak-bear') peakBearCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.kp)) kpFinal = sample.kp;
  }
  return {
    series,
    fastLength,
    slowLength,
    threshold,
    fast,
    slow,
    kp,
    samples,
    kpFinal,
    peakBullCount,
    bullCount,
    bearCount,
    peakBearCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineKasePeakLayoutOptions
  extends ChartLineKasePeakOptions {
  data: readonly ChartLineKasePeakPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
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

/** Project the run into a two-panel SVG layout. */
export function computeLineKasePeakLayout(
  options: ChartLineKasePeakLayoutOptions,
): ChartLineKasePeakLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_KASE_PEAK_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_KASE_PEAK_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_KASE_PEAK_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_KASE_PEAK_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_KASE_PEAK_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineKasePeak(options.data, {
    ...(options.fastLength !== undefined ? { fastLength: options.fastLength } : {}),
    ...(options.slowLength !== undefined ? { slowLength: options.slowLength } : {}),
    ...(options.threshold !== undefined ? { threshold: options.threshold } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;
  const innerWidth = innerRight - innerLeft;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const kpPanelTop = pricePanelBottom + gap;
  const kpPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    kpPanelBottom - kpPanelTop > 0;
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
  const priceYAt = (value: number): number =>
    pricePanelBottom -
    ((value - priceMin) / (priceMax - priceMin)) * pricePanelHeight;

  let kpAbsMax = run.threshold * 2;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.kp)) {
      const v = Math.abs(sample.kp);
      if (v > kpAbsMax) kpAbsMax = v;
    }
    if (isFiniteNumber(sample.fast)) {
      const v = Math.abs(sample.fast);
      if (v > kpAbsMax) kpAbsMax = v;
    }
    if (isFiniteNumber(sample.slow)) {
      const v = Math.abs(sample.slow);
      if (v > kpAbsMax) kpAbsMax = v;
    }
  }
  const kpMin = -kpAbsMax * 1.05;
  const kpMax = kpAbsMax * 1.05;
  const kpPanelHeight = kpPanelBottom - kpPanelTop;
  const kpYAt = (value: number): number =>
    kpPanelBottom - ((value - kpMin) / (kpMax - kpMin)) * kpPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineKasePeakDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const kpLinePoints: Array<{ x: number; y: number }> = [];
  const fastLinePoints: Array<{ x: number; y: number }> = [];
  const slowLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineKasePeakMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (isFiniteNumber(sample.kp)) {
      const cy = kpYAt(sample.kp);
      kpLinePoints.push({ x: cx, y: cy });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy,
        kp: sample.kp,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.fast)) {
      fastLinePoints.push({ x: cx, y: kpYAt(sample.fast) });
    }
    if (isFiniteNumber(sample.slow)) {
      slowLinePoints.push({ x: cx, y: kpYAt(sample.slow) });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    kpPanelTop,
    kpPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    kpPath: buildLinePath(kpLinePoints),
    fastPath: buildLinePath(fastLinePoints),
    slowPath: buildLinePath(slowLinePoints),
    markers,
    zeroY: kpYAt(0),
    upperThresholdY: kpYAt(run.threshold),
    lowerThresholdY: kpYAt(-run.threshold),
    priceMin,
    priceMax,
    kpMin,
    kpMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineKasePeakChart(
  data: readonly ChartLineKasePeakPoint[] | null | undefined,
  options: ChartLineKasePeakOptions = {},
): string {
  const run = runLineKasePeak(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.kpFinal === null ? 'n/a' : run.kpFinal.toFixed(3);
  return (
    `Two-panel chart with a Cynthia Kase Peak Oscillator panel ` +
    `(fast ${run.fastLength}, slow ${run.slowLength}, threshold ` +
    `+/- ${run.threshold}): the top panel plots the close, the ` +
    `bottom panel plots the Kase Peak as the difference of two ` +
    `volatility-scaled momentum readings, peakOut(fast) - ` +
    `peakOut(slow). Each peakOut is the lookback momentum divided ` +
    `by the mean absolute single-bar change across the same ` +
    `window. A constant series nulls the bar (zero volatility). A ` +
    `monotone-rising integer ramp reads peakOut(L) = L on every ` +
    `defined bar, so the KP reads fast - slow. Across ${total} ` +
    `bars the KP reads peak-bull (>= ${run.threshold}) on ` +
    `${run.peakBullCount}, bull on ${run.bullCount}, bear on ` +
    `${run.bearCount}, peak-bear (<= -${run.threshold}) on ` +
    `${run.peakBearCount}, and flat on ${run.flatCount}. The ` +
    `final reading is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineKasePeakZone,
  peakBullColor: string,
  bullColor: string,
  bearColor: string,
  peakBearColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'peak-bull') return peakBullColor;
  if (zone === 'bull') return bullColor;
  if (zone === 'bear') return bearColor;
  if (zone === 'peak-bear') return peakBearColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineKasePeakZone): string {
  if (zone === 'peak-bull') return 'Peak bull';
  if (zone === 'bull') return 'Bull';
  if (zone === 'bear') return 'Bear';
  if (zone === 'peak-bear') return 'Peak bear';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineKasePeak -- two-panel pure-SVG Cynthia Kase Peak
 * Oscillator chart.
 */
export const ChartLineKasePeak = forwardRef<
  HTMLDivElement,
  ChartLineKasePeakProps
>(function ChartLineKasePeak(props, ref) {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_KASE_PEAK_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_KASE_PEAK_SLOW_LENGTH,
    threshold = DEFAULT_CHART_LINE_KASE_PEAK_THRESHOLD,
    width = DEFAULT_CHART_LINE_KASE_PEAK_WIDTH,
    height = DEFAULT_CHART_LINE_KASE_PEAK_HEIGHT,
    padding = DEFAULT_CHART_LINE_KASE_PEAK_PADDING,
    gap = DEFAULT_CHART_LINE_KASE_PEAK_GAP,
    tickCount = DEFAULT_CHART_LINE_KASE_PEAK_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_KASE_PEAK_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_KASE_PEAK_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KASE_PEAK_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KASE_PEAK_PRICE_COLOR,
    kpColor = DEFAULT_CHART_LINE_KASE_PEAK_KP_COLOR,
    fastColor = DEFAULT_CHART_LINE_KASE_PEAK_FAST_COLOR,
    slowColor = DEFAULT_CHART_LINE_KASE_PEAK_SLOW_COLOR,
    peakBullColor = DEFAULT_CHART_LINE_KASE_PEAK_PEAK_BULL_COLOR,
    bullColor = DEFAULT_CHART_LINE_KASE_PEAK_BULL_COLOR,
    bearColor = DEFAULT_CHART_LINE_KASE_PEAK_BEAR_COLOR,
    peakBearColor = DEFAULT_CHART_LINE_KASE_PEAK_PEAK_BEAR_COLOR,
    flatColor = DEFAULT_CHART_LINE_KASE_PEAK_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_KASE_PEAK_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_KASE_PEAK_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_KASE_PEAK_ZERO_COLOR,
    gridColor = DEFAULT_CHART_LINE_KASE_PEAK_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_KASE_PEAK_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showKp = true,
    showFast = false,
    showSlow = false,
    showThresholdLines = true,
    showZeroLine = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatValue = defaultFormatValue,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-kase-peak-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineKasePeakSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineKasePeakSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineKasePeakLayout({
        data,
        fastLength,
        slowLength,
        threshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [data, fastLength, slowLength, threshold, width, height, padding, gap, pricePanelRatio],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineKasePeakChart(data, { fastLength, slowLength, threshold });
  const resolvedLabel =
    ariaLabel ??
    `Kase Peak Oscillator chart, fast ${run.fastLength}, slow ${run.slowLength}, threshold +/- ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineKasePeakSeriesId): void => {
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
    const tooltipW = 220;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-kase-peak-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={120}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-kase-peak-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-kase-peak-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-kase-peak-tooltip-fast"
          x={tx + 10}
          y={ty + 51}
          fill="#fcd34d"
          fontSize={11}
        >
          {`Fast: ${
            hoverSample.fast === null ? 'n/a' : hoverSample.fast.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-kase-peak-tooltip-slow"
          x={tx + 10}
          y={ty + 67}
          fill="#7dd3fc"
          fontSize={11}
        >
          {`Slow: ${
            hoverSample.slow === null ? 'n/a' : hoverSample.slow.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-kase-peak-tooltip-kp"
          x={tx + 10}
          y={ty + 83}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`KP: ${
            hoverSample.kp === null ? 'n/a' : hoverSample.kp.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-kase-peak-tooltip-zone"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const kpHidden = isHidden('kp') || !showKp;
  const fastHidden = isHidden('fast') || !showFast;
  const slowHidden = isHidden('slow') || !showSlow;

  const legendItems: Array<{
    id: ChartLineKasePeakSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'kp', label: 'Kase Peak', color: kpColor },
    { id: 'fast', label: 'Fast peakOut', color: fastColor },
    { id: 'slow', label: 'Slow peakOut', color: slowColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-kase-peak"
      data-empty={isEmpty ? 'true' : 'false'}
      data-fast-length={run.fastLength}
      data-slow-length={run.slowLength}
      data-threshold={run.threshold}
      data-kp-final={run.kpFinal === null ? '' : run.kpFinal}
      data-peak-bull-count={run.peakBullCount}
      data-bull-count={run.bullCount}
      data-bear-count={run.bearCount}
      data-peak-bear-count={run.peakBearCount}
      data-flat-count={run.flatCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-kase-peak-aria-desc"
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
          data-section="chart-line-kase-peak-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-kase-peak-empty"
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
          data-section="chart-line-kase-peak-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-kase-peak-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-kase-peak-grid-line"
                    data-panel="price"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
              {tickValues.map((t, i) => {
                const py =
                  layout.kpPanelBottom -
                  t * (layout.kpPanelBottom - layout.kpPanelTop);
                return (
                  <line
                    key={`kg-${i}`}
                    data-section="chart-line-kase-peak-grid-line"
                    data-panel="kp"
                    x1={layout.innerLeft}
                    y1={py}
                    x2={layout.innerRight}
                    y2={py}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-kase-peak-axes">
              <line
                data-section="chart-line-kase-peak-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-kase-peak-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-kase-peak-axis"
                data-panel="kp"
                x1={layout.innerLeft}
                y1={layout.kpPanelTop}
                x2={layout.innerLeft}
                y2={layout.kpPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-kase-peak-axis"
                data-panel="kp"
                x1={layout.innerLeft}
                y1={layout.kpPanelBottom}
                x2={layout.innerRight}
                y2={layout.kpPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-kase-peak-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Close
          </text>
          <text
            data-section="chart-line-kase-peak-panel-label"
            data-panel="kp"
            x={layout.innerRight}
            y={layout.kpPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            KP
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-kase-peak-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-kase-peak-threshold-lines">
              <line
                data-section="chart-line-kase-peak-threshold-line"
                data-direction="upper"
                x1={layout.innerLeft}
                y1={layout.upperThresholdY}
                x2={layout.innerRight}
                y2={layout.upperThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-kase-peak-threshold-line"
                data-direction="lower"
                x1={layout.innerLeft}
                y1={layout.lowerThresholdY}
                x2={layout.innerRight}
                y2={layout.lowerThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-kase-peak-price-path"
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
            <g data-section="chart-line-kase-peak-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-kase-peak-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatValue(
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

          {!fastHidden ? (
            <path
              data-section="chart-line-kase-peak-fast-line"
              d={layout.fastPath}
              fill="none"
              stroke={fastColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 2"
            />
          ) : null}

          {!slowHidden ? (
            <path
              data-section="chart-line-kase-peak-slow-line"
              d={layout.slowPath}
              fill="none"
              stroke={slowColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray="4 2"
            />
          ) : null}

          {!kpHidden ? (
            <path
              data-section="chart-line-kase-peak-line"
              d={layout.kpPath}
              fill="none"
              stroke={kpColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Kase Peak line, ${layout.markers.length} points`}
            />
          ) : null}

          {!kpHidden && showMarkers ? (
            <g data-section="chart-line-kase-peak-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-kase-peak-marker"
                  data-zone={marker.zone}
                  data-kp={marker.kp}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    peakBullColor,
                    bullColor,
                    bearColor,
                    peakBearColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, KP ${formatValue(
                    marker.kp,
                  )}, ${zoneLabelOf(marker.zone)}`}
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
            <g data-section="chart-line-kase-peak-badge">
              <rect
                data-section="chart-line-kase-peak-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={132}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-kase-peak-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`KP ${run.fastLength}/${run.slowLength} +/- ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-kase-peak-legend"
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
                data-section="chart-line-kase-peak-legend-item"
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
                  data-section="chart-line-kase-peak-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-kase-peak-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-kase-peak-legend-stats"
            style={{ color: axisColor }}
          >
            {`++ ${run.peakBullCount} / + ${run.bullCount} / - ${run.bearCount} / -- ${run.peakBearCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineKasePeak.displayName = 'ChartLineKasePeak';
