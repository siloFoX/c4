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
 * ChartLineConnorsRsi -- pure-SVG two-panel Connors RSI chart.
 *
 * The Connors RSI averages three component readings, each scaled
 * to `[0, 100]`:
 *
 *   1. `RSI(close, lenRsi)` -- classic Wilder/SMA RSI of the close.
 *   2. `RSI(streak, lenStreak)` -- RSI of the "streak" series.
 *      `streak[i]` is `+k` after `k` consecutive up-closes,
 *      `-k` after `k` consecutive down-closes, and `0` when
 *      `close[i] == close[i - 1]`. `streak[0] = 0`.
 *   3. `PercentRank(return, lenRank)` -- the percent rank of the
 *      latest one-bar return against the past `lenRank` returns.
 *      Strict-less comparison; the denominator is the number of
 *      valid past returns in the window (the first bar has no
 *      return and is excluded).
 *
 *   CRSI[i] = (RSI_close + RSI_streak + PercentRank) / 3
 *
 * Bounded `[0, 100]`. A bar is null when any component is null.
 *
 * Three bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (close == K)` -> every component is null, so
 *     CRSI is null at every bar.
 *   * `ACCELERATING_UP (close == [10, 11, 12, 13, 20])` with
 *     `lenRsi = 3`, `lenStreak = 2`, `lenRank = 4` -> all three
 *     components read 100 (all gains, streak rising, current
 *     return strictly greater than every past return), so the
 *     CRSI is exactly 100.
 *   * `DECELERATING_DOWN (close == [31, 30, 25, 20, 10])` with
 *     the same lengths -> all three components read 0, so the
 *     CRSI is exactly 0.
 *
 * The top panel plots the close; the bottom panel plots the
 * Connors RSI in a fixed `[0, 100]` band with `+/-`overbought /
 * oversold reference lines and a midline.
 */

export interface ChartLineConnorsRsiPoint {
  x: number;
  close: number;
}

export type ChartLineConnorsRsiZone =
  | 'overbought'
  | 'positive'
  | 'negative'
  | 'oversold'
  | 'none';

export type ChartLineConnorsRsiSeriesId = 'price' | 'crsi';

export interface ChartLineConnorsRsiComponents {
  rsiClose: number | null;
  rsiStreak: number | null;
  rank: number | null;
}

export interface ChartLineConnorsRsiSample {
  index: number;
  x: number;
  close: number;
  components: ChartLineConnorsRsiComponents;
  crsi: number | null;
  zone: ChartLineConnorsRsiZone;
}

export interface ChartLineConnorsRsiRun {
  series: ChartLineConnorsRsiPoint[];
  lenRsi: number;
  lenStreak: number;
  lenRank: number;
  overbought: number;
  oversold: number;
  crsi: Array<number | null>;
  rsiClose: Array<number | null>;
  rsiStreak: Array<number | null>;
  rank: Array<number | null>;
  samples: ChartLineConnorsRsiSample[];
  crsiFinal: number | null;
  overboughtCount: number;
  oversoldCount: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineConnorsRsiMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  crsi: number;
  zone: ChartLineConnorsRsiZone;
}

export interface ChartLineConnorsRsiDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineConnorsRsiLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  crsiPanelTop: number;
  crsiPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineConnorsRsiDot[];
  crsiPath: string;
  markers: ChartLineConnorsRsiMarker[];
  midY: number;
  overboughtY: number;
  oversoldY: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineConnorsRsiRun;
}

export interface ChartLineConnorsRsiProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineConnorsRsiPoint[];
  lenRsi?: number;
  lenStreak?: number;
  lenRank?: number;
  overbought?: number;
  oversold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  crsiColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  midColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCrsi?: boolean;
  showThresholdLines?: boolean;
  showMidLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineConnorsRsiSeriesId[];
  defaultHiddenSeries?: ChartLineConnorsRsiSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineConnorsRsiSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineConnorsRsiSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CONNORS_RSI_WIDTH = 720;
export const DEFAULT_CHART_LINE_CONNORS_RSI_HEIGHT = 400;
export const DEFAULT_CHART_LINE_CONNORS_RSI_PADDING = 44;
export const DEFAULT_CHART_LINE_CONNORS_RSI_GAP = 12;
export const DEFAULT_CHART_LINE_CONNORS_RSI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CONNORS_RSI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CONNORS_RSI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RSI = 3;
export const DEFAULT_CHART_LINE_CONNORS_RSI_LEN_STREAK = 2;
export const DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RANK = 100;
export const DEFAULT_CHART_LINE_CONNORS_RSI_OVERBOUGHT = 90;
export const DEFAULT_CHART_LINE_CONNORS_RSI_OVERSOLD = 10;
export const DEFAULT_CHART_LINE_CONNORS_RSI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_CONNORS_RSI_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CONNORS_RSI_CRSI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CONNORS_RSI_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CONNORS_RSI_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CONNORS_RSI_POSITIVE_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_CONNORS_RSI_NEGATIVE_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_CONNORS_RSI_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CONNORS_RSI_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CONNORS_RSI_MID_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CONNORS_RSI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CONNORS_RSI_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineConnorsRsiFinitePoints(
  data: readonly ChartLineConnorsRsiPoint[] | null | undefined,
): ChartLineConnorsRsiPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineConnorsRsiPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a length to an integer of at least 2. */
export function normalizeLineConnorsRsiLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a percent threshold to a finite in `(0, 100)`. */
export function normalizeLineConnorsRsiThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0 && threshold < 100) {
    return threshold;
  }
  return fallback;
}

/**
 * Simple-moving-average RSI per Wilder's original formula. Output
 * is null until the window has filled with finite values, and
 * null on bars whose `avgGain + avgLoss == 0`.
 */
export function computeLineConnorsRsiRsi(
  values: ReadonlyArray<number | null>,
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0 || length < 2) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length) {
      out.push(null);
      continue;
    }
    let sumGain = 0;
    let sumLoss = 0;
    let ok = true;
    for (let j = i - length + 1; j <= i; j += 1) {
      const a = values[j];
      const b = values[j - 1];
      if (!isFiniteNumber(a) || !isFiniteNumber(b)) {
        ok = false;
        break;
      }
      const d = a - b;
      if (d > 0) sumGain += d;
      else if (d < 0) sumLoss += -d;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const total = sumGain + sumLoss;
    if (total === 0) {
      out.push(null);
      continue;
    }
    out.push((100 * sumGain) / total);
  }
  return out;
}

/**
 * Run the consecutive-direction streak series. `streak[i]` is
 * `+k` after `k` consecutive up-closes, `-k` after `k`
 * consecutive down-closes, and `0` when `close[i] == close[i -
 * 1]`. `streak[0] = 0`.
 */
export function computeLineConnorsRsiStreak(
  closes: readonly number[] | null | undefined,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const out: Array<number | null> = [];
  let prev = 0;
  out.push(0);
  for (let i = 1; i < closes.length; i += 1) {
    const c = closes[i];
    const cPrev = closes[i - 1];
    if (!isFiniteNumber(c) || !isFiniteNumber(cPrev)) {
      out.push(null);
      prev = 0;
      continue;
    }
    if (c > cPrev) {
      prev = prev > 0 ? prev + 1 : 1;
    } else if (c < cPrev) {
      prev = prev < 0 ? prev - 1 : -1;
    } else {
      prev = 0;
    }
    out.push(prev);
  }
  return out;
}

/**
 * Percent rank of the latest one-bar return against the past
 * `lenRank` returns. Strict-less comparison; the denominator is
 * the count of defined past returns in the window. Bar 0 has no
 * return (excluded from windows). A bar is null until the window
 * has at least one defined past value and the current return is
 * defined.
 */
export function computeLineConnorsRsiPercentRank(
  closes: readonly number[] | null | undefined,
  lenRank: number,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0 || lenRank < 1) {
    return [];
  }
  const n = closes.length;
  const returns: Array<number | null> = [];
  for (let i = 0; i < n; i += 1) {
    if (i === 0) {
      returns.push(null);
      continue;
    }
    const c = closes[i];
    const cPrev = closes[i - 1];
    if (!isFiniteNumber(c) || !isFiniteNumber(cPrev) || cPrev === 0) {
      returns.push(null);
      continue;
    }
    returns.push((c - cPrev) / cPrev);
  }
  const out: Array<number | null> = [];
  for (let i = 0; i < n; i += 1) {
    const cur = returns[i];
    if (!isFiniteNumber(cur)) {
      out.push(null);
      continue;
    }
    let lessCount = 0;
    let validCount = 0;
    const from = Math.max(0, i - lenRank);
    for (let j = from; j < i; j += 1) {
      const past = returns[j];
      if (!isFiniteNumber(past)) continue;
      validCount += 1;
      if (past < cur) lessCount += 1;
    }
    if (validCount === 0) {
      out.push(null);
      continue;
    }
    out.push((100 * lessCount) / validCount);
  }
  return out;
}

/**
 * Run the full Connors RSI pipeline. Returns the per-bar
 * components and the averaged CRSI.
 */
export function computeLineConnorsRsi(
  closes: readonly number[] | null | undefined,
  lenRsi: unknown,
  lenStreak: unknown,
  lenRank: unknown,
): {
  rsiClose: Array<number | null>;
  rsiStreak: Array<number | null>;
  rank: Array<number | null>;
  crsi: Array<number | null>;
} {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { rsiClose: [], rsiStreak: [], rank: [], crsi: [] };
  }
  const lr = normalizeLineConnorsRsiLength(
    lenRsi,
    DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RSI,
  );
  const ls = normalizeLineConnorsRsiLength(
    lenStreak,
    DEFAULT_CHART_LINE_CONNORS_RSI_LEN_STREAK,
  );
  const lk = normalizeLineConnorsRsiLength(
    lenRank,
    DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RANK,
  );
  const closeNullable: Array<number | null> = closes.map((c) =>
    isFiniteNumber(c) ? c : null,
  );
  const rsiClose = computeLineConnorsRsiRsi(closeNullable, lr);
  const streak = computeLineConnorsRsiStreak(closes);
  const rsiStreak = computeLineConnorsRsiRsi(streak, ls);
  const rank = computeLineConnorsRsiPercentRank(closes, lk);
  const crsi: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    const a = rsiClose[i];
    const b = rsiStreak[i];
    const c = rank[i];
    if (!isFiniteNumber(a) || !isFiniteNumber(b) || !isFiniteNumber(c)) {
      crsi.push(null);
      continue;
    }
    crsi.push((a + b + c) / 3);
  }
  return { rsiClose, rsiStreak, rank, crsi };
}

/** Classify a CRSI reading against the overbought / oversold band. */
export function classifyLineConnorsRsiZone(
  value: number | null,
  overbought: number,
  oversold: number,
): ChartLineConnorsRsiZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= overbought) return 'overbought';
  if (value <= oversold) return 'oversold';
  if (value > 50) return 'positive';
  if (value < 50) return 'negative';
  return 'positive';
}

export interface ChartLineConnorsRsiOptions {
  lenRsi?: number;
  lenStreak?: number;
  lenRank?: number;
  overbought?: number;
  oversold?: number;
}

/** Run the full pipeline plus sample classification. */
export function runLineConnorsRsi(
  data: readonly ChartLineConnorsRsiPoint[] | null | undefined,
  options: ChartLineConnorsRsiOptions = {},
): ChartLineConnorsRsiRun {
  const series = getLineConnorsRsiFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const lenRsi = normalizeLineConnorsRsiLength(
    options.lenRsi,
    DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RSI,
  );
  const lenStreak = normalizeLineConnorsRsiLength(
    options.lenStreak,
    DEFAULT_CHART_LINE_CONNORS_RSI_LEN_STREAK,
  );
  const lenRank = normalizeLineConnorsRsiLength(
    options.lenRank,
    DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RANK,
  );
  const overbought = normalizeLineConnorsRsiThreshold(
    options.overbought,
    DEFAULT_CHART_LINE_CONNORS_RSI_OVERBOUGHT,
  );
  const oversold = normalizeLineConnorsRsiThreshold(
    options.oversold,
    DEFAULT_CHART_LINE_CONNORS_RSI_OVERSOLD,
  );
  const closes = series.map((p) => p.close);
  const { rsiClose, rsiStreak, rank, crsi } = computeLineConnorsRsi(
    closes,
    lenRsi,
    lenStreak,
    lenRank,
  );
  const samples: ChartLineConnorsRsiSample[] = series.map((point, index) => {
    const value = crsi[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      components: {
        rsiClose: rsiClose[index] ?? null,
        rsiStreak: rsiStreak[index] ?? null,
        rank: rank[index] ?? null,
      },
      crsi: value,
      zone: classifyLineConnorsRsiZone(value, overbought, oversold),
    };
  });
  let overboughtCount = 0;
  let oversoldCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let crsiFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    if (isFiniteNumber(sample.crsi)) crsiFinal = sample.crsi;
  }
  return {
    series,
    lenRsi,
    lenStreak,
    lenRank,
    overbought,
    oversold,
    rsiClose,
    rsiStreak,
    rank,
    crsi,
    samples,
    crsiFinal,
    overboughtCount,
    oversoldCount,
    positiveCount,
    negativeCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineConnorsRsiLayoutOptions
  extends ChartLineConnorsRsiOptions {
  data: readonly ChartLineConnorsRsiPoint[] | null | undefined;
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
export function computeLineConnorsRsiLayout(
  options: ChartLineConnorsRsiLayoutOptions,
): ChartLineConnorsRsiLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CONNORS_RSI_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CONNORS_RSI_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CONNORS_RSI_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_CONNORS_RSI_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_CONNORS_RSI_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineConnorsRsi(options.data, {
    ...(options.lenRsi !== undefined ? { lenRsi: options.lenRsi } : {}),
    ...(options.lenStreak !== undefined ? { lenStreak: options.lenStreak } : {}),
    ...(options.lenRank !== undefined ? { lenRank: options.lenRank } : {}),
    ...(options.overbought !== undefined ? { overbought: options.overbought } : {}),
    ...(options.oversold !== undefined ? { oversold: options.oversold } : {}),
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
  const crsiPanelTop = pricePanelBottom + gap;
  const crsiPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    crsiPanelBottom - crsiPanelTop > 0;
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

  const crsiMin = -2;
  const crsiMax = 102;
  const crsiPanelHeight = crsiPanelBottom - crsiPanelTop;
  const crsiYAt = (value: number): number =>
    crsiPanelBottom -
    ((value - crsiMin) / (crsiMax - crsiMin)) * crsiPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineConnorsRsiDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const crsiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineConnorsRsiMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.crsi)) return;
    const cx = xAt(index);
    const cy = crsiYAt(sample.crsi);
    crsiLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      crsi: sample.crsi,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    crsiPanelTop,
    crsiPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    crsiPath: buildLinePath(crsiLinePoints),
    markers,
    midY: crsiYAt(50),
    overboughtY: crsiYAt(run.overbought),
    oversoldY: crsiYAt(run.oversold),
    priceMin,
    priceMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineConnorsRsiChart(
  data: readonly ChartLineConnorsRsiPoint[] | null | undefined,
  options: ChartLineConnorsRsiOptions = {},
): string {
  const run = runLineConnorsRsi(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.crsiFinal === null ? 'n/a' : run.crsiFinal.toFixed(3);
  return (
    `Two-panel chart with a Connors RSI panel (lenRsi ` +
    `${run.lenRsi}, lenStreak ${run.lenStreak}, lenRank ` +
    `${run.lenRank}, overbought ${run.overbought}, oversold ` +
    `${run.oversold}): the top panel plots the close, the bottom ` +
    `panel plots the Connors RSI in the [0, 100] band. The Connors ` +
    `RSI is the average of three components: an RSI of close, an ` +
    `RSI of the consecutive up/down streak, and the percent rank ` +
    `of the latest one-bar return against the past returns. An ` +
    `accelerating up-move reads +100 on every component (CRSI = ` +
    `100); a decelerating down-move reads 0. Across ${total} bars ` +
    `the CRSI reads overbought (>= ${run.overbought}) on ` +
    `${run.overboughtCount}, oversold (<= ${run.oversold}) on ` +
    `${run.oversoldCount}, positive (> 50) on ${run.positiveCount}, ` +
    `and negative (< 50) on ${run.negativeCount}. The final ` +
    `reading is ${finalText}.`
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
  zone: ChartLineConnorsRsiZone,
  overboughtColor: string,
  oversoldColor: string,
  positiveColor: string,
  negativeColor: string,
  noneColor: string,
): string {
  if (zone === 'overbought') return overboughtColor;
  if (zone === 'oversold') return oversoldColor;
  if (zone === 'positive') return positiveColor;
  if (zone === 'negative') return negativeColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineConnorsRsiZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  return 'n/a';
}

/**
 * ChartLineConnorsRsi -- two-panel pure-SVG Connors RSI chart.
 */
export const ChartLineConnorsRsi = forwardRef<
  HTMLDivElement,
  ChartLineConnorsRsiProps
>(function ChartLineConnorsRsi(props, ref) {
  const {
    data,
    lenRsi = DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RSI,
    lenStreak = DEFAULT_CHART_LINE_CONNORS_RSI_LEN_STREAK,
    lenRank = DEFAULT_CHART_LINE_CONNORS_RSI_LEN_RANK,
    overbought = DEFAULT_CHART_LINE_CONNORS_RSI_OVERBOUGHT,
    oversold = DEFAULT_CHART_LINE_CONNORS_RSI_OVERSOLD,
    width = DEFAULT_CHART_LINE_CONNORS_RSI_WIDTH,
    height = DEFAULT_CHART_LINE_CONNORS_RSI_HEIGHT,
    padding = DEFAULT_CHART_LINE_CONNORS_RSI_PADDING,
    gap = DEFAULT_CHART_LINE_CONNORS_RSI_GAP,
    tickCount = DEFAULT_CHART_LINE_CONNORS_RSI_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_CONNORS_RSI_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_CONNORS_RSI_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CONNORS_RSI_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CONNORS_RSI_PRICE_COLOR,
    crsiColor = DEFAULT_CHART_LINE_CONNORS_RSI_CRSI_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_CONNORS_RSI_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_CONNORS_RSI_OVERSOLD_COLOR,
    positiveColor = DEFAULT_CHART_LINE_CONNORS_RSI_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_CONNORS_RSI_NEGATIVE_COLOR,
    noneColor = DEFAULT_CHART_LINE_CONNORS_RSI_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_CONNORS_RSI_THRESHOLD_COLOR,
    midColor = DEFAULT_CHART_LINE_CONNORS_RSI_MID_COLOR,
    gridColor = DEFAULT_CHART_LINE_CONNORS_RSI_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CONNORS_RSI_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCrsi = true,
    showThresholdLines = true,
    showMidLine = true,
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
  const baseId = `chart-line-connors-rsi-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineConnorsRsiSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineConnorsRsiSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineConnorsRsiLayout({
        data,
        lenRsi,
        lenStreak,
        lenRank,
        overbought,
        oversold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      lenRsi,
      lenStreak,
      lenRank,
      overbought,
      oversold,
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
    describeLineConnorsRsiChart(data, {
      lenRsi,
      lenStreak,
      lenRank,
      overbought,
      oversold,
    });
  const resolvedLabel =
    ariaLabel ??
    `Connors RSI chart, lenRsi ${run.lenRsi}, lenStreak ${run.lenStreak}, lenRank ${run.lenRank}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineConnorsRsiSeriesId): void => {
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
    const cps = hoverSample.components;
    const fmt = (v: number | null): string =>
      v === null ? 'n/a' : v.toFixed(2);
    tooltip = (
      <g data-section="chart-line-connors-rsi-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={136}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-connors-rsi-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-connors-rsi-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-connors-rsi-tooltip-rsi-close"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`RSI close: ${fmt(cps.rsiClose)}`}
        </text>
        <text
          data-section="chart-line-connors-rsi-tooltip-rsi-streak"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`RSI streak: ${fmt(cps.rsiStreak)}`}
        </text>
        <text
          data-section="chart-line-connors-rsi-tooltip-rank"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Rank: ${fmt(cps.rank)}`}
        </text>
        <text
          data-section="chart-line-connors-rsi-tooltip-crsi"
          x={tx + 10}
          y={ty + 99}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`CRSI: ${
            hoverSample.crsi === null ? 'n/a' : hoverSample.crsi.toFixed(2)
          }`}
        </text>
        <text
          data-section="chart-line-connors-rsi-tooltip-zone"
          x={tx + 10}
          y={ty + 115}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const crsiHidden = isHidden('crsi') || !showCrsi;

  const legendItems: Array<{
    id: ChartLineConnorsRsiSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'crsi', label: 'Connors RSI', color: crsiColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-connors-rsi"
      data-empty={isEmpty ? 'true' : 'false'}
      data-len-rsi={run.lenRsi}
      data-len-streak={run.lenStreak}
      data-len-rank={run.lenRank}
      data-overbought={run.overbought}
      data-oversold={run.oversold}
      data-crsi-final={run.crsiFinal === null ? '' : run.crsiFinal}
      data-overbought-count={run.overboughtCount}
      data-oversold-count={run.oversoldCount}
      data-positive-count={run.positiveCount}
      data-negative-count={run.negativeCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-connors-rsi-aria-desc"
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
          data-section="chart-line-connors-rsi-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-connors-rsi-empty"
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
          data-section="chart-line-connors-rsi-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-connors-rsi-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-connors-rsi-grid-line"
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
                  layout.crsiPanelBottom -
                  t * (layout.crsiPanelBottom - layout.crsiPanelTop);
                return (
                  <line
                    key={`cg-${i}`}
                    data-section="chart-line-connors-rsi-grid-line"
                    data-panel="crsi"
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
            <g data-section="chart-line-connors-rsi-axes">
              <line
                data-section="chart-line-connors-rsi-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-connors-rsi-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-connors-rsi-axis"
                data-panel="crsi"
                x1={layout.innerLeft}
                y1={layout.crsiPanelTop}
                x2={layout.innerLeft}
                y2={layout.crsiPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-connors-rsi-axis"
                data-panel="crsi"
                x1={layout.innerLeft}
                y1={layout.crsiPanelBottom}
                x2={layout.innerRight}
                y2={layout.crsiPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          {showMidLine ? (
            <line
              data-section="chart-line-connors-rsi-mid-line"
              x1={layout.innerLeft}
              y1={layout.midY}
              x2={layout.innerRight}
              y2={layout.midY}
              stroke={midColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-connors-rsi-threshold-lines">
              <line
                data-section="chart-line-connors-rsi-threshold-line"
                data-direction="upper"
                x1={layout.innerLeft}
                y1={layout.overboughtY}
                x2={layout.innerRight}
                y2={layout.overboughtY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-connors-rsi-threshold-line"
                data-direction="lower"
                x1={layout.innerLeft}
                y1={layout.oversoldY}
                x2={layout.innerRight}
                y2={layout.oversoldY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-connors-rsi-price-path"
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
            <g data-section="chart-line-connors-rsi-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-connors-rsi-dot"
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

          {!crsiHidden ? (
            <path
              data-section="chart-line-connors-rsi-line"
              d={layout.crsiPath}
              fill="none"
              stroke={crsiColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Connors RSI line, ${layout.markers.length} points`}
            />
          ) : null}

          {!crsiHidden && showMarkers ? (
            <g data-section="chart-line-connors-rsi-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-connors-rsi-marker"
                  data-zone={marker.zone}
                  data-crsi={marker.crsi}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    overboughtColor,
                    oversoldColor,
                    positiveColor,
                    negativeColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, CRSI ${formatValue(
                    marker.crsi,
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
            <g data-section="chart-line-connors-rsi-badge">
              <rect
                data-section="chart-line-connors-rsi-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={132}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-connors-rsi-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`CRSI ${run.lenRsi}/${run.lenStreak}/${run.lenRank}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-connors-rsi-legend"
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
                data-section="chart-line-connors-rsi-legend-item"
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
                  data-section="chart-line-connors-rsi-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-connors-rsi-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-connors-rsi-legend-stats"
            style={{ color: axisColor }}
          >
            {`OB ${run.overboughtCount} / + ${run.positiveCount} / - ${run.negativeCount} / OS ${run.oversoldCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineConnorsRsi.displayName = 'ChartLineConnorsRsi';
