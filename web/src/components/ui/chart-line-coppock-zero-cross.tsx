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
 * ChartLineCoppockZeroCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only Coppock Curve
 * in the bottom panel, marking bullish (cross up through zero)
 * / bearish (cross down through zero) long-term momentum
 * baseline regime transition events for trend confirmation.
 * Zero-line cross variant of the Edwin Coppock family that
 * flags the discrete Coppock crossing of the zero baseline.
 *
 * Coppock is the weighted moving average of the sum of two
 * percentage rate-of-change windows -- a slow / fast pair that
 * captures both the short and long arc of momentum:
 *
 *   roc_s_i = (close_i - close_{i - short}) / close_{i - short} * 100
 *   roc_l_i = (close_i - close_{i - long})  / close_{i - long}  * 100
 *   sum_i   = roc_s_i + roc_l_i
 *   coppock_i = WMA(sum, period) at i
 *   bullish : prev coppock <= 0 && cur coppock > 0
 *   bearish : prev coppock >= 0 && cur coppock < 0
 *
 * Defaults: `short = 11`, `long = 14`, `period = 10` (Coppock
 * canonical monthly settings), `threshold = 0` (zero baseline).
 * Regime classifier `bullish` (coppock >= 0), `bearish`
 * (coppock < 0), `none` (coppock null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K (K > 0)**: each ROC = (K - K) / K * 100
 *   = 0, sum = 0, WMA(0) = 0, so coppock = 0. coppock = 0 sits
 *   on the threshold but the strict-inequality detector never
 *   fires. regime `bullish` (coppock >= 0). cross count = 0.
 *   Verified across K = 1..1234.
 * - **GEOMETRIC UP close = K * r^i (r > 1)**: each ROC is
 *   `(r^N - 1) * 100` for its window N, so sum is constant
 *   `((r^short - 1) + (r^long - 1)) * 100`. WMA of a constant
 *   is that constant. regime `bullish`. 0 crosses.
 * - **GEOMETRIC DOWN close = K * r^i (r < 1)**: sum is
 *   constant and negative. regime `bearish`. 0 crosses.
 */

export interface ChartLineCoppockZeroCrossPoint {
  x: number;
  close: number;
}

export type ChartLineCoppockZeroCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineCoppockZeroCrossSeriesId = 'price' | 'coppock';

export type ChartLineCoppockZeroCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineCoppockZeroCrossCross {
  index: number;
  x: number;
  kind: ChartLineCoppockZeroCrossCrossKind;
}

export interface ChartLineCoppockZeroCrossSample {
  index: number;
  x: number;
  close: number;
  coppock: number | null;
  regime: ChartLineCoppockZeroCrossRegime;
}

export interface ChartLineCoppockZeroCrossRun {
  series: ChartLineCoppockZeroCrossPoint[];
  short: number;
  long: number;
  period: number;
  threshold: number;
  coppockValues: Array<number | null>;
  samples: ChartLineCoppockZeroCrossSample[];
  crosses: ChartLineCoppockZeroCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineCoppockZeroCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCoppockZeroCrossLayout {
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
  priceDots: ChartLineCoppockZeroCrossDot[];
  coppockPath: string;
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
    kind: ChartLineCoppockZeroCrossCrossKind;
  }>;
  run: ChartLineCoppockZeroCrossRun;
}

export interface ChartLineCoppockZeroCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCoppockZeroCrossPoint[];
  short?: number;
  long?: number;
  period?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  coppockColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCoppock?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCoppockZeroCrossSeriesId[];
  defaultHiddenSeries?: ChartLineCoppockZeroCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCoppockZeroCrossSeriesId;
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

export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_SHORT = 11;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_LONG = 14;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PERIOD = 10;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_COPPOCK_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineCoppockZeroCrossFinitePoints(
  data: readonly ChartLineCoppockZeroCrossPoint[] | null | undefined,
): ChartLineCoppockZeroCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCoppockZeroCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineCoppockZeroCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineCoppockZeroCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/**
 * Weighted moving average -- weight `j` (1-indexed within the
 * window of size `length`) so the most recent bar carries
 * weight `length` and the oldest weight 1. Denominator is
 * `length * (length + 1) / 2`. CONST short-circuit when the
 * window is constant.
 */
export function applyLineCoppockZeroCrossWma(
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
  const denom = (length * (length + 1)) / 2;
  for (let i = length - 1; i < values.length; i += 1) {
    let weighted = 0;
    let valid = true;
    let winMin = Infinity;
    let winMax = -Infinity;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - length + 1 + j];
      if (v == null) {
        valid = false;
        break;
      }
      weighted += v * (j + 1);
      if (v < winMin) winMin = v;
      if (v > winMax) winMax = v;
    }
    if (!valid) continue;
    out[i] = winMin === winMax ? winMin : posZero(weighted / denom);
  }
  return out;
}

export interface LineCoppockZeroCrossChannels {
  rocShort: Array<number | null>;
  rocLong: Array<number | null>;
  sum: Array<number | null>;
  coppock: Array<number | null>;
  short: number;
  long: number;
  period: number;
}

export function computeLineCoppockZeroCross(
  series: readonly ChartLineCoppockZeroCrossPoint[] | null | undefined,
  options: { short?: number; long?: number; period?: number } = {},
): LineCoppockZeroCrossChannels {
  const cleaned = getLineCoppockZeroCrossFinitePoints(series);
  const shortN = normalizeLineCoppockZeroCrossLength(
    options.short,
    DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_SHORT,
  );
  const longN = normalizeLineCoppockZeroCrossLength(
    options.long,
    DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_LONG,
  );
  const period = normalizeLineCoppockZeroCrossLength(
    options.period,
    DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PERIOD,
  );
  if (cleaned.length === 0) {
    return {
      rocShort: [],
      rocLong: [],
      sum: [],
      coppock: [],
      short: shortN,
      long: longN,
      period,
    };
  }
  const n = cleaned.length;
  const closes = cleaned.map((p) => p.close);

  const rocShort: Array<number | null> = new Array(n).fill(null);
  const rocLong: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    if (i >= shortN) {
      const cur = closes[i];
      const prev = closes[i - shortN];
      if (isFiniteNumber(cur) && isFiniteNumber(prev) && prev !== 0) {
        rocShort[i] = posZero(((cur - prev) / prev) * 100);
      }
    }
    if (i >= longN) {
      const cur = closes[i];
      const prev = closes[i - longN];
      if (isFiniteNumber(cur) && isFiniteNumber(prev) && prev !== 0) {
        rocLong[i] = posZero(((cur - prev) / prev) * 100);
      }
    }
  }

  const sum: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const a = rocShort[i];
    const b = rocLong[i];
    if (a == null || b == null) continue;
    sum[i] = posZero(a + b);
  }

  const coppock = applyLineCoppockZeroCrossWma(sum, period);

  return {
    rocShort,
    rocLong,
    sum,
    coppock,
    short: shortN,
    long: longN,
    period,
  };
}

export function classifyLineCoppockZeroCrossRegime(
  coppock: number | null,
  threshold: number,
): ChartLineCoppockZeroCrossRegime {
  if (coppock == null) return 'none';
  if (coppock >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineCoppockZeroCrossCrosses(
  series: readonly ChartLineCoppockZeroCrossPoint[],
  coppock: readonly (number | null)[],
  threshold: number,
): ChartLineCoppockZeroCrossCross[] {
  const out: ChartLineCoppockZeroCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = coppock[i - 1];
    const cur = coppock[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineCoppockZeroCross(
  data: ChartLineCoppockZeroCrossPoint[],
  options: {
    short?: number;
    long?: number;
    period?: number;
    threshold?: number;
  } = {},
): ChartLineCoppockZeroCrossRun {
  const cleaned = getLineCoppockZeroCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineCoppockZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_THRESHOLD,
  );
  const channels = computeLineCoppockZeroCross(series, {
    short: options.short ?? undefined,
    long: options.long ?? undefined,
    period: options.period ?? undefined,
  });

  const samples: ChartLineCoppockZeroCrossSample[] = series.map((p, i) => {
    const v = channels.coppock[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      coppock: v,
      regime: classifyLineCoppockZeroCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineCoppockZeroCrossCrosses(
    series,
    channels.coppock,
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

  const ok =
    series.length > Math.max(channels.short, channels.long) + channels.period;

  return {
    series,
    short: channels.short,
    long: channels.long,
    period: channels.period,
    threshold,
    coppockValues: channels.coppock,
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

export interface ComputeLineCoppockZeroCrossLayoutOptions {
  data: ChartLineCoppockZeroCrossPoint[];
  short?: number;
  long?: number;
  period?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineCoppockZeroCrossLayout(
  opts: ComputeLineCoppockZeroCrossLayoutOptions,
): ChartLineCoppockZeroCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PANEL_GAP;
  const threshold = normalizeLineCoppockZeroCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_THRESHOLD,
  );

  const run = runLineCoppockZeroCross(opts.data, {
    short: opts.short ?? undefined,
    long: opts.long ?? undefined,
    period: opts.period ?? undefined,
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
  for (const v of run.coppockValues) {
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
      coppockPath: '',
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
  const priceDots: ChartLineCoppockZeroCrossDot[] = [];
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

  let coppockPath = '';
  let first = true;
  for (const s of run.samples) {
    if (s.coppock == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.coppock);
    coppockPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  coppockPath = coppockPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.coppockValues[c.index] ?? threshold);
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
    coppockPath,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineCoppockZeroCrossChart(
  data: ChartLineCoppockZeroCrossPoint[],
  options: {
    short?: number;
    long?: number;
    period?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineCoppockZeroCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const shortN = normalizeLineCoppockZeroCrossLength(
    options.short,
    DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_SHORT,
  );
  const longN = normalizeLineCoppockZeroCrossLength(
    options.long,
    DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_LONG,
  );
  const period = normalizeLineCoppockZeroCrossLength(
    options.period,
    DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PERIOD,
  );
  const threshold = normalizeLineCoppockZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_THRESHOLD,
  );
  return (
    `Coppock Zero Cross chart over ${cleaned.length} bars ` +
    `(short ${shortN}, long ${longN}, period ${period}, ` +
    `threshold ${threshold}). Top panel renders the close with ` +
    `bullish (long-term momentum baseline cross up) / bearish ` +
    `(cross down) chevron overlays at every Coppock Curve ` +
    `zero-line cross; bottom panel renders the close-only ` +
    `Coppock line on an auto-fitted oscillator with the zero ` +
    `baseline reference band and marks Coppock level ` +
    `${threshold} regime trigger events.`
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

export const ChartLineCoppockZeroCross = forwardRef<
  HTMLDivElement,
  ChartLineCoppockZeroCrossProps
>(function ChartLineCoppockZeroCross(props, ref): ReactNode {
  const {
    data,
    short = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_SHORT,
    long = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_LONG,
    period = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PERIOD,
    threshold = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_PRICE_COLOR,
    coppockColor = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_COPPOCK_COLOR,
    bullishColor = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_COPPOCK_ZERO_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCoppock = true,
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
    () => getLineCoppockZeroCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineCoppockZeroCrossLayout({
        data: cleaned,
        short,
        long,
        period,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      short,
      long,
      period,
      threshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineCoppockZeroCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineCoppockZeroCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineCoppockZeroCrossSeriesId,
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
        data-section="chart-line-coppock-zero-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineCoppockZeroCrossChart(cleaned, {
      short,
      long,
      period,
      threshold,
    });

  const showPrice = !hidden.has('price');
  const showCoppockLine = !hidden.has('coppock') && showCoppock;

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
      aria-label={ariaLabel ?? 'Coppock Zero Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-coppock-zero-cross"
      data-short={short}
      data-long={long}
      data-period={period}
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
        data-section="chart-line-coppock-zero-cross-title"
      >
        {ariaLabel ?? 'Coppock Zero Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-coppock-zero-cross-aria-desc"
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
        data-section="chart-line-coppock-zero-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-coppock-zero-cross-grid">
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
                  data-section="chart-line-coppock-zero-cross-grid-line-price"
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
                  data-section="chart-line-coppock-zero-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-coppock-zero-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-coppock-zero-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-coppock-zero-cross-axes">
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
                  data-section="chart-line-coppock-zero-cross-tick-price"
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
                  data-section="chart-line-coppock-zero-cross-tick-osc"
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
            data-section="chart-line-coppock-zero-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-coppock-zero-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-coppock-zero-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showCoppockLine ? (
          <path
            d={layout.coppockPath}
            stroke={coppockColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-coppock-zero-cross-coppock-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-coppock-zero-cross-crosses"
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
                data-section={`chart-line-coppock-zero-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-coppock-zero-cross-overlay-crosses"
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
                data-section={`chart-line-coppock-zero-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-coppock-zero-cross-hover-targets">
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
                data-section="chart-line-coppock-zero-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-coppock-zero-cross-tooltip"
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
                  data-section="chart-line-coppock-zero-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-coppock-zero-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-coppock-zero-cross-tooltip-coppock"
                >
                  Coppock{' '}
                  {tooltipSample.coppock == null
                    ? '--'
                    : formatOsc(tooltipSample.coppock)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-coppock-zero-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-coppock-zero-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-coppock-zero-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-coppock-zero-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-coppock-zero-cross-tooltip-periods"
                >
                  short {layout.run.short} | long {layout.run.long} | wma{' '}
                  {layout.run.period}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-coppock-zero-cross-tooltip-threshold"
                >
                  threshold {layout.run.threshold}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-coppock-zero-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          short {short} | long {long} | period {period} | threshold{' '}
          {threshold} | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-coppock-zero-cross-legend"
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
                id: 'coppock' as const,
                color: coppockColor,
                label: 'Coppock',
              },
            ] satisfies Array<{
              id: ChartLineCoppockZeroCrossSeriesId;
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

ChartLineCoppockZeroCross.displayName = 'ChartLineCoppockZeroCross';
