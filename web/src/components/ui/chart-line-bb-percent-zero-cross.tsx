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
 * ChartLineBbPercentZeroCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Bollinger %B
 * line in the bottom panel, marking bullish (cross up through
 * 0.5) / bearish (cross down through 0.5) position-within-bands
 * centerline regime transition events. Midline-0.5 crossover
 * variant of the John Bollinger %B family that flags the
 * discrete %B crossing of the neutral 0.5 baseline.
 *
 * Bollinger %B normalises the close to its position within
 * fixed-multiple Bollinger Bands centered on the rolling SMA:
 *
 *   middle_i = SMA(close, length) at i
 *   stdev_i  = population stdev of close window
 *   upper_i  = middle_i + mult * stdev_i
 *   lower_i  = middle_i - mult * stdev_i
 *   range_i  = upper_i - lower_i             (= 2 * mult * stdev)
 *   pctB_i   = range == 0 ? 0.5
 *                         : (close - lower) / range
 *   bullish  : prev pctB <= 0.5 && cur pctB > 0.5  (above middle)
 *   bearish  : prev pctB >= 0.5 && cur pctB < 0.5  (below middle)
 *
 * %B = 0.5 when close sits exactly on the middle band; %B = 1
 * when close touches the upper; %B = 0 when close touches the
 * lower. Values outside `[0, 1]` mean the close has exited the
 * bands.
 *
 * Defaults: `length = 20`, `mult = 2`, `threshold = 0.5`. Regime
 * classifier `bullish` (pctB >= 0.5), `bearish` (pctB < 0.5),
 * `none` (pctB null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: stdev = 0, upper == lower == middle
 *   == K, so the `range = 0` fallback returns `pctB = 0.5`
 *   (neutral midline). pctB = 0.5 sits on the threshold but the
 *   strict-inequality detector never fires. regime `bullish`
 *   (pctB >= 0.5). cross count = 0. Verified across K =
 *   0..1234.
 * - **LINEAR UP close = i**: at steady state the close sits
 *   `(N - 1) / 2` above the middle, stdev = sqrt((N^2 - 1) /
 *   12), and pctB = 0.5 + ((N - 1) / 2) / (2 * mult * stdev) =
 *   a constant > 0.5. regime `bullish`. 0 crosses.
 * - **LINEAR DOWN close = -i**: symmetric -- pctB = a constant
 *   < 0.5. regime `bearish`. 0 crosses.
 */

export interface ChartLineBbPercentZeroCrossPoint {
  x: number;
  close: number;
}

export type ChartLineBbPercentZeroCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'none';

export type ChartLineBbPercentZeroCrossSeriesId = 'price' | 'percentb';

export type ChartLineBbPercentZeroCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineBbPercentZeroCrossCross {
  index: number;
  x: number;
  kind: ChartLineBbPercentZeroCrossCrossKind;
}

export interface ChartLineBbPercentZeroCrossSample {
  index: number;
  x: number;
  close: number;
  percentb: number | null;
  regime: ChartLineBbPercentZeroCrossRegime;
}

export interface ChartLineBbPercentZeroCrossRun {
  series: ChartLineBbPercentZeroCrossPoint[];
  length: number;
  mult: number;
  threshold: number;
  percentbValues: Array<number | null>;
  samples: ChartLineBbPercentZeroCrossSample[];
  crosses: ChartLineBbPercentZeroCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineBbPercentZeroCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineBbPercentZeroCrossLayout {
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
  priceDots: ChartLineBbPercentZeroCrossDot[];
  percentbPath: string;
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
    kind: ChartLineBbPercentZeroCrossCrossKind;
  }>;
  run: ChartLineBbPercentZeroCrossRun;
}

export interface ChartLineBbPercentZeroCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineBbPercentZeroCrossPoint[];
  length?: number;
  mult?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  percentbColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showPercentb?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineBbPercentZeroCrossSeriesId[];
  defaultHiddenSeries?: ChartLineBbPercentZeroCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineBbPercentZeroCrossSeriesId;
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

export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_LENGTH = 20;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_MULT = 2;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_THRESHOLD = 0.5;
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PERCENTB_COLOR =
  '#7c3aed';
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_BULLISH_COLOR =
  '#16a34a';
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_BEARISH_COLOR =
  '#dc2626';
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineBbPercentZeroCrossFinitePoints(
  data: readonly ChartLineBbPercentZeroCrossPoint[] | null | undefined,
): ChartLineBbPercentZeroCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineBbPercentZeroCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineBbPercentZeroCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a positive finite multiplier. */
export function normalizeLineBbPercentZeroCrossMult(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value) && value > 0) return value;
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineBbPercentZeroCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

export interface LineBbPercentZeroCrossBands {
  middle: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  stdev: Array<number | null>;
}

/** Rolling SMA + population stdev + bands. */
export function applyLineBbPercentZeroCrossBands(
  values: readonly number[],
  length: number,
  mult: number,
): LineBbPercentZeroCrossBands {
  const n = values.length;
  const middle: Array<number | null> = new Array(n).fill(null);
  const stdev: Array<number | null> = new Array(n).fill(null);
  const upper: Array<number | null> = new Array(n).fill(null);
  const lower: Array<number | null> = new Array(n).fill(null);
  if (length < 1 || n === 0) return { middle, stdev, upper, lower };
  for (let i = length - 1; i < n; i += 1) {
    let sum = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j];
      if (!isFiniteNumber(v)) {
        valid = false;
        break;
      }
      sum += v;
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    const mean = winMin === winMax ? winMin : sum / length;
    middle[i] = posZero(mean);
    if (winMin === winMax) {
      stdev[i] = 0;
      upper[i] = posZero(mean);
      lower[i] = posZero(mean);
      continue;
    }
    let sq = 0;
    for (let j = i - length + 1; j <= i; j += 1) {
      const v = values[j]!;
      const d = v - mean;
      sq += d * d;
    }
    const sd = Math.sqrt(sq / length);
    stdev[i] = posZero(sd);
    upper[i] = posZero(mean + mult * sd);
    lower[i] = posZero(mean - mult * sd);
  }
  return { middle, stdev, upper, lower };
}

export interface LineBbPercentZeroCrossChannels {
  middle: Array<number | null>;
  upper: Array<number | null>;
  lower: Array<number | null>;
  percentb: Array<number | null>;
  length: number;
  mult: number;
}

export function computeLineBbPercentZeroCross(
  series: readonly ChartLineBbPercentZeroCrossPoint[] | null | undefined,
  options: { length?: number; mult?: number } = {},
): LineBbPercentZeroCrossChannels {
  const cleaned = getLineBbPercentZeroCrossFinitePoints(series);
  const length = normalizeLineBbPercentZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_LENGTH,
  );
  const mult = normalizeLineBbPercentZeroCrossMult(
    options.mult,
    DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_MULT,
  );
  if (cleaned.length === 0) {
    return {
      middle: [],
      upper: [],
      lower: [],
      percentb: [],
      length,
      mult,
    };
  }
  const closes = cleaned.map((p) => p.close);
  const bands = applyLineBbPercentZeroCrossBands(closes, length, mult);
  const percentb: Array<number | null> = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i += 1) {
    const u = bands.upper[i];
    const l = bands.lower[i];
    if (u == null || l == null) continue;
    const cur = closes[i]!;
    const range = u - l;
    if (range === 0) {
      percentb[i] = 0.5;
    } else {
      percentb[i] = posZero((cur - l) / range);
    }
  }
  return {
    middle: bands.middle,
    upper: bands.upper,
    lower: bands.lower,
    percentb,
    length,
    mult,
  };
}

export function classifyLineBbPercentZeroCrossRegime(
  percentb: number | null,
  threshold: number,
): ChartLineBbPercentZeroCrossRegime {
  if (percentb == null) return 'none';
  if (percentb >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineBbPercentZeroCrossCrosses(
  series: readonly ChartLineBbPercentZeroCrossPoint[],
  percentb: readonly (number | null)[],
  threshold: number,
): ChartLineBbPercentZeroCrossCross[] {
  const out: ChartLineBbPercentZeroCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = percentb[i - 1];
    const cur = percentb[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineBbPercentZeroCross(
  data: ChartLineBbPercentZeroCrossPoint[],
  options: {
    length?: number;
    mult?: number;
    threshold?: number;
  } = {},
): ChartLineBbPercentZeroCrossRun {
  const cleaned = getLineBbPercentZeroCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineBbPercentZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_THRESHOLD,
  );
  const channels = computeLineBbPercentZeroCross(series, {
    length: options.length ?? undefined,
    mult: options.mult ?? undefined,
  });

  const samples: ChartLineBbPercentZeroCrossSample[] = series.map((p, i) => {
    const v = channels.percentb[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      percentb: v,
      regime: classifyLineBbPercentZeroCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineBbPercentZeroCrossCrosses(
    series,
    channels.percentb,
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

  const ok = series.length > channels.length;

  return {
    series,
    length: channels.length,
    mult: channels.mult,
    threshold,
    percentbValues: channels.percentb,
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

export interface ComputeLineBbPercentZeroCrossLayoutOptions {
  data: ChartLineBbPercentZeroCrossPoint[];
  length?: number;
  mult?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineBbPercentZeroCrossLayout(
  opts: ComputeLineBbPercentZeroCrossLayoutOptions,
): ChartLineBbPercentZeroCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_WIDTH;
  const height =
    opts.height ?? DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PANEL_GAP;
  const threshold = normalizeLineBbPercentZeroCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_THRESHOLD,
  );

  const run = runLineBbPercentZeroCross(opts.data, {
    length: opts.length ?? undefined,
    mult: opts.mult ?? undefined,
    threshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // %B is typically [0, 1] but can spill outside when close
  // exits the bands. Auto-fit with padding while always
  // including [0, 1] and the threshold in the displayed range.
  let oscMin = 0;
  let oscMax = 1;
  for (const v of run.percentbValues) {
    if (v == null) continue;
    if (v < oscMin) oscMin = v;
    if (v > oscMax) oscMax = v;
  }
  if (oscMin > threshold) oscMin = threshold;
  if (oscMax < threshold) oscMax = threshold;
  if (oscMin === oscMax) {
    oscMin = threshold - 0.5;
    oscMax = threshold + 0.5;
  } else {
    const padPct = 0.05;
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
      percentbPath: '',
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
  const priceDots: ChartLineBbPercentZeroCrossDot[] = [];
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

  let percentbPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.percentb == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.percentb);
    percentbPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  percentbPath = percentbPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.percentbValues[c.index] ?? threshold);
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
    percentbPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineBbPercentZeroCrossChart(
  data: ChartLineBbPercentZeroCrossPoint[],
  options: {
    length?: number;
    mult?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineBbPercentZeroCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineBbPercentZeroCrossLength(
    options.length,
    DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_LENGTH,
  );
  const mult = normalizeLineBbPercentZeroCrossMult(
    options.mult,
    DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_MULT,
  );
  const threshold = normalizeLineBbPercentZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_THRESHOLD,
  );
  return (
    `BB Percent B Zero Cross chart over ${cleaned.length} bars ` +
    `(length ${length}, mult ${mult}, threshold ${threshold}). ` +
    `Top panel renders the close with bullish (position within ` +
    `bands centerline cross up) / bearish (cross down) chevron ` +
    `overlays at every Bollinger %B midline crossover; bottom ` +
    `panel renders the close-only %B line on an auto-fitted ` +
    `oscillator centered on ${threshold} (= 0.5 inside the ` +
    `bands) and marks %B level ${threshold} regime trigger ` +
    `events.`
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

export const ChartLineBbPercentZeroCross = forwardRef<
  HTMLDivElement,
  ChartLineBbPercentZeroCrossProps
>(function ChartLineBbPercentZeroCross(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_LENGTH,
    mult = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_MULT,
    threshold = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PRICE_COLOR,
    percentbColor = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_PERCENTB_COLOR,
    bullishColor = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_BB_PERCENT_ZERO_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showPercentb = true,
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
    () => getLineBbPercentZeroCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineBbPercentZeroCrossLayout({
        data: cleaned,
        length,
        mult,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, length, mult, threshold, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineBbPercentZeroCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineBbPercentZeroCrossSeriesId,
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
    seriesId: ChartLineBbPercentZeroCrossSeriesId,
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
        data-section="chart-line-bb-percent-zero-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineBbPercentZeroCrossChart(cleaned, {
      length,
      mult,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showPercentbLine = !hidden.has('percentb') && showPercentb;

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
      aria-label={ariaLabel ?? 'BB Percent B Zero Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-bb-percent-zero-cross"
      data-length={length}
      data-mult={mult}
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
        data-section="chart-line-bb-percent-zero-cross-title"
      >
        {ariaLabel ?? 'BB Percent B Zero Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-bb-percent-zero-cross-aria-desc"
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
        data-section="chart-line-bb-percent-zero-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-bb-percent-zero-cross-grid">
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
                  data-section="chart-line-bb-percent-zero-cross-grid-line-price"
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
                  data-section="chart-line-bb-percent-zero-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-bb-percent-zero-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-bb-percent-zero-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-bb-percent-zero-cross-axes">
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
                  data-section="chart-line-bb-percent-zero-cross-tick-price"
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
                  data-section="chart-line-bb-percent-zero-cross-tick-osc"
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
            data-section="chart-line-bb-percent-zero-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-bb-percent-zero-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-bb-percent-zero-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showPercentbLine ? (
          <path
            d={layout.percentbPath}
            stroke={percentbColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-bb-percent-zero-cross-percentb-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-bb-percent-zero-cross-crosses"
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
                data-section={`chart-line-bb-percent-zero-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-bb-percent-zero-cross-overlay-crosses"
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
                data-section={`chart-line-bb-percent-zero-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-bb-percent-zero-cross-hover-targets">
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
                data-section="chart-line-bb-percent-zero-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-bb-percent-zero-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={244}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bb-percent-zero-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bb-percent-zero-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bb-percent-zero-cross-tooltip-percentb"
                >
                  %B{' '}
                  {tooltipSample.percentb == null
                    ? '--'
                    : formatOsc(tooltipSample.percentb)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bb-percent-zero-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bb-percent-zero-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bb-percent-zero-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bb-percent-zero-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-bb-percent-zero-cross-tooltip-params"
                >
                  length {layout.run.length} | mult {layout.run.mult}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-bb-percent-zero-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | mult {mult} | threshold {threshold} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-bb-percent-zero-cross-legend"
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
              {
                id: 'percentb' as const,
                color: percentbColor,
                label: '%B',
              },
            ] satisfies Array<{
              id: ChartLineBbPercentZeroCrossSeriesId;
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

ChartLineBbPercentZeroCross.displayName = 'ChartLineBbPercentZeroCross';
