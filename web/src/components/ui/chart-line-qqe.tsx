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
 * ChartLineQqe -- pure-SVG two-panel Quantitative Qualitative Estimation
 * chart.
 *
 * The QQE works on the RSI: it smooths the RSI with an EMA, then wraps the
 * smoothed RSI in an ADAPTIVE TRAILING BAND whose half-width is the
 * smoothed average true range of the RSI times a factor. The band ratchets
 * like a trailing stop -- the long band can only climb while price leads
 * it, the short band can only fall -- and the trend flips when the
 * smoothed RSI crosses the active band. The QQE line is the long band in
 * an uptrend, the short band in a downtrend.
 *
 * The top panel plots the price; the bottom panel plots the smoothed RSI,
 * the QQE trailing line and a 50 midline.
 */

export interface ChartLineQqePoint {
  x: number;
  value: number;
}

export type ChartLineQqeZone = 'up' | 'down' | 'none';

export type ChartLineQqeSeriesId = 'price' | 'rsi' | 'qqe';

export interface ChartLineQqeSample {
  index: number;
  x: number;
  value: number;
  rsiMa: number | null;
  qqeLine: number | null;
  trend: number;
  zone: ChartLineQqeZone;
}

export interface ChartLineQqeRun {
  series: ChartLineQqePoint[];
  rsiPeriod: number;
  smoothPeriod: number;
  wilderPeriod: number;
  factor: number;
  rsi: (number | null)[];
  rsiMa: (number | null)[];
  qqeLine: (number | null)[];
  trend: number[];
  samples: ChartLineQqeSample[];
  trendFinal: number;
  upCount: number;
  downCount: number;
  ok: boolean;
}

export interface ChartLineQqeTrail {
  qqeLine: (number | null)[];
  trend: number[];
}

export interface ChartLineQqeMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  rsiMa: number;
  trend: number;
  zone: ChartLineQqeZone;
}

export interface ChartLineQqeDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  value: number;
}

export interface ChartLineQqeLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  qqePanelTop: number;
  qqePanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineQqeDot[];
  rsiPath: string;
  qqePath: string;
  markers: ChartLineQqeMarker[];
  midlineY: number;
  priceMin: number;
  priceMax: number;
  qqeMin: number;
  qqeMax: number;
  run: ChartLineQqeRun;
}

export interface ChartLineQqeProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineQqePoint[];
  rsiPeriod?: number;
  smoothPeriod?: number;
  wilderPeriod?: number;
  factor?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rsiColor?: string;
  qqeColor?: string;
  upColor?: string;
  downColor?: string;
  midlineColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRsi?: boolean;
  showQqe?: boolean;
  showMidline?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineQqeSeriesId[];
  defaultHiddenSeries?: ChartLineQqeSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineQqeSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineQqeSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_QQE_WIDTH = 720;
export const DEFAULT_CHART_LINE_QQE_HEIGHT = 400;
export const DEFAULT_CHART_LINE_QQE_PADDING = 44;
export const DEFAULT_CHART_LINE_QQE_GAP = 12;
export const DEFAULT_CHART_LINE_QQE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_QQE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_QQE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_QQE_RSI_PERIOD = 14;
export const DEFAULT_CHART_LINE_QQE_SMOOTH_PERIOD = 5;
export const DEFAULT_CHART_LINE_QQE_WILDER_PERIOD = 27;
export const DEFAULT_CHART_LINE_QQE_FACTOR = 4.236;
export const DEFAULT_CHART_LINE_QQE_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_QQE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_QQE_RSI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_QQE_QQE_COLOR = '#ea580c';
export const DEFAULT_CHART_LINE_QQE_UP_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_QQE_DOWN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_QQE_MIDLINE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_QQE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_QQE_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with a finite x and a finite value. */
export function getLineQqeFinitePoints(
  data: readonly ChartLineQqePoint[] | null | undefined,
): ChartLineQqePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineQqePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.value)) {
      out.push({ x: point.x, value: point.value });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLineQqePeriod(period: unknown, fallback: number): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

function expSmooth(
  values: readonly (number | null | undefined)[],
  alpha: number,
): (number | null)[] {
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (const v of values) {
    if (!isFiniteNumber(v)) {
      out.push(prev);
      continue;
    }
    prev = prev === null ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

/** Standard EMA (alpha = 2 / (period + 1)), seeded from the first value. */
export function computeLineQqeEma(
  values: readonly (number | null | undefined)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineQqePeriod(period, 1);
  return expSmooth(values, 2 / (p + 1));
}

/** Wilder smoothing (alpha = 1 / period), seeded from the first value. */
export function computeLineQqeWilder(
  values: readonly (number | null | undefined)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineQqePeriod(period, 1);
  return expSmooth(values, 1 / p);
}

/**
 * Wilder's Relative Strength Index of a close series. A strictly rising
 * series pins at 100, a strictly falling one at 0, a flat series at 50.
 */
export function computeLineQqeRsi(
  closes: readonly number[] | null | undefined,
  rsiPeriod: number,
): (number | null)[] {
  if (!Array.isArray(closes)) return [];
  const p = normalizeLineQqePeriod(rsiPeriod, 1);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + 1) return out;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < n; i += 1) {
    const d = (closes[i] as number) - (closes[i - 1] as number);
    gains.push(d > 0 ? d : 0);
    losses.push(d < 0 ? -d : 0);
  }
  const rsiFrom = (ag: number, al: number): number =>
    ag + al === 0 ? 50 : (100 * ag) / (ag + al);

  let avgGain = 0;
  let avgLoss = 0;
  for (let k = 0; k < p; k += 1) {
    avgGain += gains[k] as number;
    avgLoss += losses[k] as number;
  }
  avgGain /= p;
  avgLoss /= p;
  out[p] = rsiFrom(avgGain, avgLoss);
  for (let i = p + 1; i < n; i += 1) {
    avgGain = (avgGain * (p - 1) + (gains[i - 1] as number)) / p;
    avgLoss = (avgLoss * (p - 1) + (losses[i - 1] as number)) / p;
    out[i] = rsiFrom(avgGain, avgLoss);
  }
  return out;
}

/**
 * The QQE adaptive trailing band: given the smoothed RSI and the band
 * half-width (delta), ratchet a long band up and a short band down like a
 * trailing stop, flip the trend when the smoothed RSI crosses the active
 * band, and emit the QQE line (long band in an uptrend, short band in a
 * downtrend) and the per-bar trend (+1 up / -1 down / 0 undefined).
 */
export function computeLineQqeTrail(
  rsiMa: readonly (number | null | undefined)[] | null | undefined,
  delta: readonly (number | null | undefined)[] | null | undefined,
): ChartLineQqeTrail {
  if (!Array.isArray(rsiMa) || !Array.isArray(delta)) {
    return { qqeLine: [], trend: [] };
  }
  const qqeLine: (number | null)[] = [];
  const trend: number[] = [];
  let tLong: number | null = null;
  let tShort: number | null = null;
  let dir = 1;
  let prevRm: number | null = null;
  let started = false;
  for (let i = 0; i < rsiMa.length; i += 1) {
    const rm = rsiMa[i];
    const d = delta[i];
    if (!isFiniteNumber(rm) || !isFiniteNumber(d)) {
      qqeLine.push(null);
      trend.push(0);
      continue;
    }
    const newLong = rm - d;
    const newShort = rm + d;
    if (!started || tLong === null || tShort === null || prevRm === null) {
      tLong = newLong;
      tShort = newShort;
      dir = 1;
      started = true;
    } else {
      const pLong: number = tLong;
      const pShort: number = tShort;
      const pRm: number = prevRm;
      const nextLong: number =
        pRm > pLong && rm > pLong ? Math.max(newLong, pLong) : newLong;
      const nextShort: number =
        pRm < pShort && rm < pShort ? Math.min(newShort, pShort) : newShort;
      if (dir === 1 && rm < pLong) dir = -1;
      else if (dir === -1 && rm > pShort) dir = 1;
      tLong = nextLong;
      tShort = nextShort;
    }
    prevRm = rm;
    qqeLine.push(dir === 1 ? tLong : tShort);
    trend.push(dir);
  }
  return { qqeLine, trend };
}

export interface ChartLineQqeComputed {
  rsi: (number | null)[];
  rsiMa: (number | null)[];
  atrRsi: (number | null)[];
  delta: (number | null)[];
  qqeLine: (number | null)[];
  trend: number[];
}

export interface ChartLineQqeOptions {
  rsiPeriod?: number;
  smoothPeriod?: number;
  wilderPeriod?: number;
  factor?: number;
}

/** Compute the full QQE pipeline for a close series. */
export function computeLineQqe(
  closes: readonly number[] | null | undefined,
  options: ChartLineQqeOptions = {},
): ChartLineQqeComputed {
  if (!Array.isArray(closes)) {
    return { rsi: [], rsiMa: [], atrRsi: [], delta: [], qqeLine: [], trend: [] };
  }
  const rsiPeriod = normalizeLineQqePeriod(
    options.rsiPeriod,
    DEFAULT_CHART_LINE_QQE_RSI_PERIOD,
  );
  const smoothPeriod = normalizeLineQqePeriod(
    options.smoothPeriod,
    DEFAULT_CHART_LINE_QQE_SMOOTH_PERIOD,
  );
  const wilderPeriod = normalizeLineQqePeriod(
    options.wilderPeriod,
    DEFAULT_CHART_LINE_QQE_WILDER_PERIOD,
  );
  const factor = isFiniteNumber(options.factor) && options.factor > 0
    ? options.factor
    : DEFAULT_CHART_LINE_QQE_FACTOR;

  const rsi = computeLineQqeRsi(closes, rsiPeriod);
  const rsiMa = computeLineQqeEma(rsi, smoothPeriod);
  const atrRsi: (number | null)[] = rsiMa.map((v, i) => {
    if (i === 0) return null;
    const prev = rsiMa[i - 1];
    return isFiniteNumber(v) && isFiniteNumber(prev) ? Math.abs(v - prev) : null;
  });
  const maAtrRsi = computeLineQqeWilder(atrRsi, wilderPeriod);
  const delta = maAtrRsi.map((v) => (isFiniteNumber(v) ? v * factor : null));
  const { qqeLine, trend } = computeLineQqeTrail(rsiMa, delta);
  return { rsi, rsiMa, atrRsi, delta, qqeLine, trend };
}

function trendZone(trend: number): ChartLineQqeZone {
  if (trend === 1) return 'up';
  if (trend === -1) return 'down';
  return 'none';
}

/** Run the full QQE pipeline over a set of points. */
export function runLineQqe(
  data: readonly ChartLineQqePoint[] | null | undefined,
  options: ChartLineQqeOptions = {},
): ChartLineQqeRun {
  const series = getLineQqeFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const rsiPeriod = normalizeLineQqePeriod(
    options.rsiPeriod,
    DEFAULT_CHART_LINE_QQE_RSI_PERIOD,
  );
  const smoothPeriod = normalizeLineQqePeriod(
    options.smoothPeriod,
    DEFAULT_CHART_LINE_QQE_SMOOTH_PERIOD,
  );
  const wilderPeriod = normalizeLineQqePeriod(
    options.wilderPeriod,
    DEFAULT_CHART_LINE_QQE_WILDER_PERIOD,
  );
  const factor = isFiniteNumber(options.factor) && options.factor > 0
    ? options.factor
    : DEFAULT_CHART_LINE_QQE_FACTOR;

  const closes = series.map((point) => point.value);
  const { rsi, rsiMa, qqeLine, trend } = computeLineQqe(closes, {
    rsiPeriod,
    smoothPeriod,
    wilderPeriod,
    factor,
  });

  const samples: ChartLineQqeSample[] = series.map((point, index) => {
    const rsiMaValue = rsiMa[index] ?? null;
    const qqeValue = qqeLine[index] ?? null;
    const trendValue = trend[index] ?? 0;
    return {
      index,
      x: point.x,
      value: point.value,
      rsiMa: rsiMaValue,
      qqeLine: qqeValue,
      trend: trendValue,
      zone: trendZone(trendValue),
    };
  });

  let upCount = 0;
  let downCount = 0;
  let trendFinal = 0;
  for (const sample of samples) {
    if (sample.zone === 'up') upCount += 1;
    else if (sample.zone === 'down') downCount += 1;
    if (sample.trend !== 0) trendFinal = sample.trend;
  }

  return {
    series,
    rsiPeriod,
    smoothPeriod,
    wilderPeriod,
    factor,
    rsi,
    rsiMa,
    qqeLine,
    trend,
    samples,
    trendFinal,
    upCount,
    downCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineQqeLayoutOptions extends ChartLineQqeOptions {
  data: readonly ChartLineQqePoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  pricePanelRatio?: number;
}

function buildLinePath(points: ReadonlyArray<{ x: number; y: number }>): string {
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
export function computeLineQqeLayout(
  options: ChartLineQqeLayoutOptions,
): ChartLineQqeLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_QQE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_QQE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_QQE_PADDING;
  const gap = isFiniteNumber(options.gap) ? options.gap : DEFAULT_CHART_LINE_QQE_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_QQE_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineQqe(options.data, {
    ...(options.rsiPeriod !== undefined ? { rsiPeriod: options.rsiPeriod } : {}),
    ...(options.smoothPeriod !== undefined
      ? { smoothPeriod: options.smoothPeriod }
      : {}),
    ...(options.wilderPeriod !== undefined
      ? { wilderPeriod: options.wilderPeriod }
      : {}),
    ...(options.factor !== undefined ? { factor: options.factor } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const qqePanelTop = pricePanelBottom + gap;
  const qqePanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && qqePanelBottom - qqePanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const point of run.series) {
    if (point.value < priceMin) priceMin = point.value;
    if (point.value > priceMax) priceMax = point.value;
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

  let qqeMin = 30;
  let qqeMax = 70;
  for (const v of run.rsiMa) {
    if (!isFiniteNumber(v)) continue;
    if (v < qqeMin) qqeMin = v;
    if (v > qqeMax) qqeMax = v;
  }
  for (const v of run.qqeLine) {
    if (!isFiniteNumber(v)) continue;
    if (v < qqeMin) qqeMin = v;
    if (v > qqeMax) qqeMax = v;
  }
  if (qqeMin === qqeMax) {
    qqeMin -= 1;
    qqeMax += 1;
  }
  const qqePanelHeight = qqePanelBottom - qqePanelTop;
  const qqeYAt = (value: number): number =>
    qqePanelBottom - ((value - qqeMin) / (qqeMax - qqeMin)) * qqePanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineQqeDot[] = [];
  run.series.forEach((point, index) => {
    const cx = xAt(index);
    const cy = priceYAt(point.value);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: point.x, cx, cy, value: point.value });
  });

  const rsiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineQqeMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.rsiMa)) return;
    const cx = xAt(index);
    const cy = qqeYAt(sample.rsiMa);
    rsiLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      rsiMa: sample.rsiMa,
      trend: sample.trend,
      zone: sample.zone,
    });
  });

  const qqeLinePoints: Array<{ x: number; y: number }> = [];
  run.qqeLine.forEach((v, index) => {
    if (isFiniteNumber(v)) qqeLinePoints.push({ x: xAt(index), y: qqeYAt(v) });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    qqePanelTop,
    qqePanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    rsiPath: buildLinePath(rsiLinePoints),
    qqePath: buildLinePath(qqeLinePoints),
    markers,
    midlineY: qqeYAt(50),
    priceMin,
    priceMax,
    qqeMin,
    qqeMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineQqeChart(
  data: readonly ChartLineQqePoint[] | null | undefined,
  options: ChartLineQqeOptions = {},
): string {
  const run = runLineQqe(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.trendFinal === 1 ? 'up' : run.trendFinal === -1 ? 'down' : 'n/a';
  return (
    `Two-panel chart with the Quantitative Qualitative Estimation (QQE, ` +
    `RSI ${run.rsiPeriod}, smoothing ${run.smoothPeriod}): the top panel ` +
    `plots the price, the bottom panel plots the smoothed RSI and the QQE ` +
    `trailing band. The QQE smooths the RSI with an EMA, then wraps it in ` +
    `an adaptive trailing band whose half-width is the smoothed average ` +
    `true range of the RSI times a factor; the band ratchets like a ` +
    `trailing stop and the trend flips when the smoothed RSI crosses it. ` +
    `Across ${total} bars the trend is up on ${run.upCount} and down on ` +
    `${run.downCount}. The final trend is ${finalText}.`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineQqeZone,
  upColor: string,
  downColor: string,
  midlineColor: string,
): string {
  if (zone === 'up') return upColor;
  if (zone === 'down') return downColor;
  return midlineColor;
}

function zoneLabelOf(zone: ChartLineQqeZone): string {
  if (zone === 'up') return 'Uptrend';
  if (zone === 'down') return 'Downtrend';
  return 'n/a';
}

/**
 * ChartLineQqe -- two-panel pure-SVG Quantitative Qualitative Estimation
 * chart.
 */
export const ChartLineQqe = forwardRef<HTMLDivElement, ChartLineQqeProps>(
  function ChartLineQqe(props, ref) {
    const {
      data,
      rsiPeriod = DEFAULT_CHART_LINE_QQE_RSI_PERIOD,
      smoothPeriod = DEFAULT_CHART_LINE_QQE_SMOOTH_PERIOD,
      wilderPeriod = DEFAULT_CHART_LINE_QQE_WILDER_PERIOD,
      factor = DEFAULT_CHART_LINE_QQE_FACTOR,
      width = DEFAULT_CHART_LINE_QQE_WIDTH,
      height = DEFAULT_CHART_LINE_QQE_HEIGHT,
      padding = DEFAULT_CHART_LINE_QQE_PADDING,
      gap = DEFAULT_CHART_LINE_QQE_GAP,
      tickCount = DEFAULT_CHART_LINE_QQE_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_QQE_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_QQE_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_QQE_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_QQE_PRICE_COLOR,
      rsiColor = DEFAULT_CHART_LINE_QQE_RSI_COLOR,
      qqeColor = DEFAULT_CHART_LINE_QQE_QQE_COLOR,
      upColor = DEFAULT_CHART_LINE_QQE_UP_COLOR,
      downColor = DEFAULT_CHART_LINE_QQE_DOWN_COLOR,
      midlineColor = DEFAULT_CHART_LINE_QQE_MIDLINE_COLOR,
      gridColor = DEFAULT_CHART_LINE_QQE_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_QQE_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showRsi = true,
      showQqe = true,
      showMidline = true,
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
    const baseId = `chart-line-qqe-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineQqeSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineQqeSeriesId): boolean => hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineQqeLayout({
          data,
          rsiPeriod,
          smoothPeriod,
          wilderPeriod,
          factor,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
        }),
      [
        data,
        rsiPeriod,
        smoothPeriod,
        wilderPeriod,
        factor,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      ],
    );

    const run = layout.run;
    const description =
      ariaDescription ??
      describeLineQqeChart(data, { rsiPeriod, smoothPeriod, wilderPeriod, factor });
    const resolvedLabel =
      ariaLabel ??
      `Quantitative Qualitative Estimation chart, RSI ${run.rsiPeriod}, smoothing ${run.smoothPeriod}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineQqeSeriesId): void => {
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
      const tooltipW = 176;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.pricePanelTop + 6;
      tooltip = (
        <g data-section="chart-line-qqe-tooltip" pointerEvents="none">
          <rect
            x={tx}
            y={ty}
            width={tooltipW}
            height={96}
            rx={6}
            fill="#0f172a"
            opacity={0.92}
          />
          <text
            data-section="chart-line-qqe-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-qqe-tooltip-value"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Price: ${formatValue(hoverSample.value)}`}
          </text>
          <text
            data-section="chart-line-qqe-tooltip-rsi"
            x={tx + 10}
            y={ty + 51}
            fill="#c4b5fd"
            fontSize={11}
          >
            {`RSI MA: ${
              hoverSample.rsiMa === null ? 'n/a' : formatValue(hoverSample.rsiMa)
            }`}
          </text>
          <text
            data-section="chart-line-qqe-tooltip-qqe"
            x={tx + 10}
            y={ty + 67}
            fill="#fdba74"
            fontSize={11}
          >
            {`QQE line: ${
              hoverSample.qqeLine === null
                ? 'n/a'
                : formatValue(hoverSample.qqeLine)
            }`}
          </text>
          <text
            data-section="chart-line-qqe-tooltip-trend"
            x={tx + 10}
            y={ty + 83}
            fill="#cbd5e1"
            fontSize={11}
            fontWeight={600}
          >
            {`Trend: ${zoneLabelOf(hoverSample.zone)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const rsiHidden = isHidden('rsi') || !showRsi;
    const qqeHidden = isHidden('qqe') || !showQqe;

    const legendItems: Array<{
      id: ChartLineQqeSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'rsi', label: 'RSI MA', color: rsiColor },
      { id: 'qqe', label: 'QQE Line', color: qqeColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-qqe"
        data-empty={isEmpty ? 'true' : 'false'}
        data-rsi-period={run.rsiPeriod}
        data-smooth-period={run.smoothPeriod}
        data-wilder-period={run.wilderPeriod}
        data-factor={run.factor}
        data-trend-final={run.trendFinal}
        data-up-count={run.upCount}
        data-down-count={run.downCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-qqe-aria-desc"
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
            data-section="chart-line-qqe-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-qqe-empty"
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
            data-section="chart-line-qqe-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-qqe-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-qqe-grid-line"
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
                  const qy =
                    layout.qqePanelBottom -
                    t * (layout.qqePanelBottom - layout.qqePanelTop);
                  return (
                    <line
                      key={`qg-${i}`}
                      data-section="chart-line-qqe-grid-line"
                      data-panel="qqe"
                      x1={layout.innerLeft}
                      y1={qy}
                      x2={layout.innerRight}
                      y2={qy}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g data-section="chart-line-qqe-axes">
                <line
                  data-section="chart-line-qqe-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-qqe-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-qqe-axis"
                  data-panel="qqe"
                  x1={layout.innerLeft}
                  y1={layout.qqePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.qqePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-qqe-axis"
                  data-panel="qqe"
                  x1={layout.innerLeft}
                  y1={layout.qqePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.qqePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-qqe-tick-label"
                  data-panel="price"
                  x={layout.innerLeft - 6}
                  y={layout.pricePanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.priceMax)}
                </text>
                <text
                  data-section="chart-line-qqe-tick-label"
                  data-panel="price"
                  x={layout.innerLeft - 6}
                  y={layout.pricePanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.priceMin)}
                </text>
                <text
                  data-section="chart-line-qqe-tick-label"
                  data-panel="qqe"
                  x={layout.innerLeft - 6}
                  y={layout.qqePanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.qqeMax)}
                </text>
                <text
                  data-section="chart-line-qqe-tick-label"
                  data-panel="qqe"
                  x={layout.innerLeft - 6}
                  y={layout.qqePanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.qqeMin)}
                </text>
              </g>
            ) : null}

            <text
              data-section="chart-line-qqe-panel-label"
              data-panel="price"
              x={layout.innerRight}
              y={layout.pricePanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Price
            </text>
            <text
              data-section="chart-line-qqe-panel-label"
              data-panel="qqe"
              x={layout.innerRight}
              y={layout.qqePanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Quantitative Qualitative Estimation
            </text>

            {showMidline ? (
              <line
                data-section="chart-line-qqe-midline"
                x1={layout.innerLeft}
                y1={layout.midlineY}
                x2={layout.innerRight}
                y2={layout.midlineY}
                stroke={midlineColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-qqe-price-path"
                d={layout.pricePath}
                fill="none"
                stroke={priceColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Price line, ${run.series.length} bars`}
              />
            ) : null}

            {!priceHidden && showDots ? (
              <g data-section="chart-line-qqe-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-qqe-dot"
                    cx={dot.cx}
                    cy={dot.cy}
                    r={dotRadius}
                    fill={priceColor}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(dot.x)}, price ${formatValue(
                      dot.value,
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

            {!qqeHidden ? (
              <path
                data-section="chart-line-qqe-qqe-line"
                d={layout.qqePath}
                fill="none"
                stroke={qqeColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="5 3"
                role="graphics-symbol"
                tabIndex={0}
                aria-label="QQE trailing line"
              />
            ) : null}

            {!rsiHidden ? (
              <path
                data-section="chart-line-qqe-rsi-line"
                d={layout.rsiPath}
                fill="none"
                stroke={rsiColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Smoothed RSI line, ${layout.markers.length} points`}
              />
            ) : null}

            {!rsiHidden && showMarkers ? (
              <g data-section="chart-line-qqe-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-qqe-marker"
                    data-zone={marker.zone}
                    data-trend={marker.trend}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(marker.zone, upColor, downColor, midlineColor)}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, smoothed RSI ${formatValue(
                      marker.rsiMa,
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
              <g data-section="chart-line-qqe-badge">
                <rect
                  data-section="chart-line-qqe-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={84}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-qqe-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`QQE ${run.rsiPeriod}/${run.smoothPeriod}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-qqe-legend"
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
                  data-section="chart-line-qqe-legend-item"
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
                    data-section="chart-line-qqe-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-qqe-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-qqe-legend-stats"
              style={{ color: axisColor }}
            >
              {`up ${run.upCount} / down ${run.downCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineQqe.displayName = 'ChartLineQqe';
