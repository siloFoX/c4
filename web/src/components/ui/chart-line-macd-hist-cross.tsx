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
 * ChartLineMacdHistCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the MACD histogram (macd - signal)
 * in the bottom panel, marking bullish / bearish zero crossover
 * trigger events on the histogram. This is the histogram-cross
 * variant of the MACD family that flags momentum acceleration
 * triggers distinct from the MACD line / signal cross primitive.
 *
 *   ema_fast[i]  = EMA(close, fastLength)
 *   ema_slow[i]  = EMA(close, slowLength)
 *   macd[i]      = ema_fast[i] - ema_slow[i]
 *   signal[i]    = EMA(macd, signalLength)
 *   hist[i]      = macd[i] - signal[i]
 *   bullish     : prev hist <= 0 && cur hist > 0
 *   bearish     : prev hist >= 0 && cur hist < 0
 *
 * Defaults: `fastLength = 12`, `slowLength = 26`, `signalLength
 * = 9` (canonical MACD). Regime classifier `bullish` (hist > 0),
 * `bearish` (hist < 0), `neutral` (hist === 0), `none` (hist
 * null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: EMA(K) collapses to K via the
 *   `min === max` precision short-circuit -> ema_fast = ema_slow
 *   = K -> macd = 0 -> signal = EMA(0, 9) = 0 -> histogram = 0.
 *   All histograms equal 0, so regime is `neutral` on every
 *   settled bar and the cross count is exactly 0.
 *   Verified across K = 0..1234.
 */

export interface ChartLineMacdHistCrossPoint {
  x: number;
  close: number;
}

export type ChartLineMacdHistCrossRegime =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'none';

export type ChartLineMacdHistCrossSeriesId = 'price' | 'histogram';

export type ChartLineMacdHistCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineMacdHistCrossCross {
  index: number;
  x: number;
  kind: ChartLineMacdHistCrossCrossKind;
}

export interface ChartLineMacdHistCrossSample {
  index: number;
  x: number;
  close: number;
  emaFast: number | null;
  emaSlow: number | null;
  macd: number | null;
  signal: number | null;
  histogram: number | null;
  regime: ChartLineMacdHistCrossRegime;
}

export interface ChartLineMacdHistCrossRun {
  series: ChartLineMacdHistCrossPoint[];
  fastLength: number;
  slowLength: number;
  signalLength: number;
  emaFastValues: Array<number | null>;
  emaSlowValues: Array<number | null>;
  macdValues: Array<number | null>;
  signalValues: Array<number | null>;
  histogramValues: Array<number | null>;
  samples: ChartLineMacdHistCrossSample[];
  crosses: ChartLineMacdHistCrossCross[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineMacdHistCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineMacdHistCrossBar {
  index: number;
  x: number;
  cx: number;
  y: number;
  height: number;
  hist: number;
  positive: boolean;
}

export interface ChartLineMacdHistCrossLayout {
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
  priceDots: ChartLineMacdHistCrossDot[];
  histogramBars: ChartLineMacdHistCrossBar[];
  zeroY: number;
  priceMin: number;
  priceMax: number;
  oscMin: number;
  oscMax: number;
  crossMarkers: Array<{
    index: number;
    x: number;
    cx: number;
    cyPrice: number;
    cyOsc: number;
    kind: ChartLineMacdHistCrossCrossKind;
  }>;
  run: ChartLineMacdHistCrossRun;
}

export interface ChartLineMacdHistCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineMacdHistCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  barWidth?: number;
  priceColor?: string;
  histogramPositiveColor?: string;
  histogramNegativeColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showHistogram?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineMacdHistCrossSeriesId[];
  defaultHiddenSeries?: ChartLineMacdHistCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineMacdHistCrossSeriesId;
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

export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_BAR_WIDTH = 6;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_FAST_LENGTH = 12;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_SLOW_LENGTH = 26;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_SIGNAL_LENGTH = 9;
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_HISTOGRAM_POSITIVE_COLOR =
  '#22c55e';
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_HISTOGRAM_NEGATIVE_COLOR =
  '#ef4444';
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MACD_HIST_CROSS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineMacdHistCrossFinitePoints(
  data: readonly ChartLineMacdHistCrossPoint[] | null | undefined,
): ChartLineMacdHistCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineMacdHistCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineMacdHistCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** SMA-seeded EMA with the precision fix. */
export function applyLineMacdHistCrossEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (length < 1 || values.length === 0) return out;
  const alpha = 2 / (length + 1);

  let seedSum = 0;
  let seedCount = 0;
  let winMin = Infinity;
  let winMax = -Infinity;
  for (let i = 0; i < values.length && seedCount < length; i += 1) {
    const v = values[i];
    if (v == null) {
      seedSum = 0;
      seedCount = 0;
      winMin = Infinity;
      winMax = -Infinity;
      continue;
    }
    seedSum += v;
    seedCount += 1;
    if (v < winMin) winMin = v;
    if (v > winMax) winMax = v;
    if (seedCount === length) {
      const seed =
        winMin === winMax && Number.isFinite(winMin)
          ? winMin
          : posZero(seedSum / length);
      out[i] = seed;
      let prev = seed;
      for (let j = i + 1; j < values.length; j += 1) {
        const nv = values[j];
        if (nv == null) {
          break;
        }
        const next = nv === prev ? nv : posZero(alpha * nv + (1 - alpha) * prev);
        out[j] = next;
        prev = next;
      }
      break;
    }
  }
  return out;
}

export interface LineMacdHistCrossChannels {
  emaFast: Array<number | null>;
  emaSlow: Array<number | null>;
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
}

export function computeLineMacdHistCross(
  series: readonly ChartLineMacdHistCrossPoint[] | null | undefined,
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): LineMacdHistCrossChannels {
  const cleaned = getLineMacdHistCrossFinitePoints(series);
  if (cleaned.length === 0) {
    return {
      emaFast: [],
      emaSlow: [],
      macd: [],
      signal: [],
      histogram: [],
    };
  }
  const fastLength = normalizeLineMacdHistCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_HIST_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdHistCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_HIST_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLineMacdHistCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MACD_HIST_CROSS_SIGNAL_LENGTH,
  );

  const closes: Array<number | null> = cleaned.map((p) => p.close);
  const emaFast = applyLineMacdHistCrossEma(closes, fastLength);
  const emaSlow = applyLineMacdHistCrossEma(closes, slowLength);
  const macd: Array<number | null> = new Array(cleaned.length).fill(null);
  for (let i = 0; i < cleaned.length; i += 1) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f == null || s == null) continue;
    macd[i] = posZero(f - s);
  }
  const signal = applyLineMacdHistCrossEma(macd, signalLength);
  const histogram: Array<number | null> = new Array(cleaned.length).fill(
    null,
  );
  for (let i = 0; i < cleaned.length; i += 1) {
    const m = macd[i];
    const sg = signal[i];
    if (m == null || sg == null) continue;
    histogram[i] = posZero(m - sg);
  }
  return { emaFast, emaSlow, macd, signal, histogram };
}

export function classifyLineMacdHistCrossRegime(
  histogram: number | null,
): ChartLineMacdHistCrossRegime {
  if (histogram == null) return 'none';
  if (histogram > 0) return 'bullish';
  if (histogram < 0) return 'bearish';
  return 'neutral';
}

export function detectLineMacdHistCrossCrosses(
  series: readonly ChartLineMacdHistCrossPoint[],
  histogram: readonly (number | null)[],
): ChartLineMacdHistCrossCross[] {
  const out: ChartLineMacdHistCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = histogram[i - 1];
    const cur = histogram[i];
    if (prev == null || cur == null) continue;
    if (prev <= 0 && cur > 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= 0 && cur < 0) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineMacdHistCross(
  data: ChartLineMacdHistCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): ChartLineMacdHistCrossRun {
  const cleaned = getLineMacdHistCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const fastLength = normalizeLineMacdHistCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_HIST_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdHistCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_HIST_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLineMacdHistCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MACD_HIST_CROSS_SIGNAL_LENGTH,
  );

  const channels = computeLineMacdHistCross(series, {
    fastLength,
    slowLength,
    signalLength,
  });

  const samples: ChartLineMacdHistCrossSample[] = series.map((p, i) => {
    const hist = channels.histogram[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      emaFast: channels.emaFast[i] ?? null,
      emaSlow: channels.emaSlow[i] ?? null,
      macd: channels.macd[i] ?? null,
      signal: channels.signal[i] ?? null,
      histogram: hist,
      regime: classifyLineMacdHistCrossRegime(hist),
    };
  });

  const crosses = detectLineMacdHistCrossCrosses(
    series,
    channels.histogram,
  );

  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  for (const s of samples) {
    if (s.regime === 'bullish') bullishCount += 1;
    else if (s.regime === 'bearish') bearishCount += 1;
    else if (s.regime === 'neutral') neutralCount += 1;
    else noneCount += 1;
  }

  const ok = series.length > slowLength + signalLength;

  return {
    series,
    fastLength,
    slowLength,
    signalLength,
    emaFastValues: channels.emaFast,
    emaSlowValues: channels.emaSlow,
    macdValues: channels.macd,
    signalValues: channels.signal,
    histogramValues: channels.histogram,
    samples,
    crosses,
    bullishCount,
    bearishCount,
    neutralCount,
    noneCount,
    ok,
  };
}

export interface ComputeLineMacdHistCrossLayoutOptions {
  data: ChartLineMacdHistCrossPoint[];
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  barWidth?: number;
}

export function computeLineMacdHistCrossLayout(
  opts: ComputeLineMacdHistCrossLayoutOptions,
): ChartLineMacdHistCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_MACD_HIST_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_MACD_HIST_CROSS_HEIGHT;
  const padding =
    opts.padding ?? DEFAULT_CHART_LINE_MACD_HIST_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_MACD_HIST_CROSS_PANEL_GAP;
  const barWidth =
    opts.barWidth ?? DEFAULT_CHART_LINE_MACD_HIST_CROSS_BAR_WIDTH;

  const run = runLineMacdHistCross(opts.data, {
    fastLength: opts.fastLength ?? undefined,
    slowLength: opts.slowLength ?? undefined,
    signalLength: opts.signalLength ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

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
      histogramBars: [],
      zeroY: oscBottom,
      priceMin: 0,
      priceMax: 0,
      oscMin: 0,
      oscMax: 1,
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

  let oscMin = Infinity;
  let oscMax = -Infinity;
  for (const s of run.samples) {
    if (s.histogram != null) {
      if (s.histogram < oscMin) oscMin = s.histogram;
      if (s.histogram > oscMax) oscMax = s.histogram;
    }
  }
  if (!Number.isFinite(oscMin) || !Number.isFinite(oscMax)) {
    oscMin = -1;
    oscMax = 1;
  }
  if (oscMin > 0) oscMin = 0;
  if (oscMax < 0) oscMax = 0;
  if (oscMin === oscMax) {
    oscMin -= 1;
    oscMax += 1;
  }

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syOsc = (y: number): number =>
    oscBottom - ((y - oscMin) / (oscMax - oscMin)) * (oscBottom - oscTop);

  let pricePath = '';
  const priceDots: ChartLineMacdHistCrossDot[] = [];
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

  const zeroY = syOsc(0);
  const histogramBars: ChartLineMacdHistCrossBar[] = [];
  for (const s of run.samples) {
    if (s.histogram == null) continue;
    const cx = sx(s.x);
    const yVal = syOsc(s.histogram);
    const y = s.histogram >= 0 ? yVal : zeroY;
    const h = Math.abs(zeroY - yVal);
    histogramBars.push({
      index: s.index,
      x: s.x,
      cx,
      y,
      height: h,
      hist: s.histogram,
      positive: s.histogram >= 0,
    });
  }
  void barWidth;

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = zeroY;
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
    histogramBars,
    zeroY,
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    crossMarkers,
    run,
  };
}

export function describeLineMacdHistCrossChart(
  data: ChartLineMacdHistCrossPoint[],
  options: {
    fastLength?: number;
    slowLength?: number;
    signalLength?: number;
  } = {},
): string {
  const cleaned = getLineMacdHistCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const fastLength = normalizeLineMacdHistCrossLength(
    options.fastLength,
    DEFAULT_CHART_LINE_MACD_HIST_CROSS_FAST_LENGTH,
  );
  const slowLength = normalizeLineMacdHistCrossLength(
    options.slowLength,
    DEFAULT_CHART_LINE_MACD_HIST_CROSS_SLOW_LENGTH,
  );
  const signalLength = normalizeLineMacdHistCrossLength(
    options.signalLength,
    DEFAULT_CHART_LINE_MACD_HIST_CROSS_SIGNAL_LENGTH,
  );
  return (
    `MACD Histogram Cross chart over ${cleaned.length} bars ` +
    `(fast ${fastLength}, slow ${slowLength}, signal ` +
    `${signalLength}). Top panel renders the close with bullish ` +
    `/ bearish arrow overlays at every histogram zero crossover; ` +
    `bottom panel renders the MACD histogram (macd - signal) as ` +
    `colored bars centered on zero and marks bullish / bearish ` +
    `trigger events distinct from the MACD line / signal cross ` +
    `published by the base MACD primitives.`
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

export const ChartLineMacdHistCross = forwardRef<
  HTMLDivElement,
  ChartLineMacdHistCrossProps
>(function ChartLineMacdHistCross(props, ref): ReactNode {
  const {
    data,
    fastLength = DEFAULT_CHART_LINE_MACD_HIST_CROSS_FAST_LENGTH,
    slowLength = DEFAULT_CHART_LINE_MACD_HIST_CROSS_SLOW_LENGTH,
    signalLength = DEFAULT_CHART_LINE_MACD_HIST_CROSS_SIGNAL_LENGTH,
    width = DEFAULT_CHART_LINE_MACD_HIST_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_MACD_HIST_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_MACD_HIST_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_MACD_HIST_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_MACD_HIST_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MACD_HIST_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MACD_HIST_CROSS_DOT_RADIUS,
    barWidth = DEFAULT_CHART_LINE_MACD_HIST_CROSS_BAR_WIDTH,
    priceColor = DEFAULT_CHART_LINE_MACD_HIST_CROSS_PRICE_COLOR,
    histogramPositiveColor = DEFAULT_CHART_LINE_MACD_HIST_CROSS_HISTOGRAM_POSITIVE_COLOR,
    histogramNegativeColor = DEFAULT_CHART_LINE_MACD_HIST_CROSS_HISTOGRAM_NEGATIVE_COLOR,
    bullishColor = DEFAULT_CHART_LINE_MACD_HIST_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_MACD_HIST_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_MACD_HIST_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_MACD_HIST_CROSS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showHistogram = true,
    showCrosses = true,
    showOverlayCrosses = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
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
    () => getLineMacdHistCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineMacdHistCrossLayout({
        data: cleaned,
        fastLength,
        slowLength,
        signalLength,
        width,
        height,
        padding,
        panelGap,
        barWidth,
      }),
    [
      cleaned,
      fastLength,
      slowLength,
      signalLength,
      width,
      height,
      padding,
      panelGap,
      barWidth,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineMacdHistCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (
    seriesId: ChartLineMacdHistCrossSeriesId,
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
    seriesId: ChartLineMacdHistCrossSeriesId,
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
        data-section="chart-line-macd-hist-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineMacdHistCrossChart(cleaned, {
      fastLength,
      slowLength,
      signalLength,
    });

  const showPrice = !hidden.has('price');
  const showHistogramBars = !hidden.has('histogram') && showHistogram;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin +
        ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickOscValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickOscValues.push(
      layout.oscMin + ((layout.oscMax - layout.oscMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'MACD Histogram Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-macd-hist-cross"
      data-fast-length={fastLength}
      data-slow-length={slowLength}
      data-signal-length={signalLength}
      data-total-points={cleaned.length}
      data-bullish-count={layout.run.bullishCount}
      data-bearish-count={layout.run.bearishCount}
      data-neutral-count={layout.run.neutralCount}
      data-cross-count={layout.run.crosses.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-macd-hist-cross-title"
      >
        {ariaLabel ?? 'MACD Histogram Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-macd-hist-cross-aria-desc"
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
        data-section="chart-line-macd-hist-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-macd-hist-cross-grid">
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
                  data-section="chart-line-macd-hist-cross-grid-line-price"
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
                  data-section="chart-line-macd-hist-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-macd-hist-cross-axes">
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
            <line
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={axisColor}
              strokeDasharray="4 4"
              data-section="chart-line-macd-hist-cross-zero-line"
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
                  data-section="chart-line-macd-hist-cross-tick-price"
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
                  data-section="chart-line-macd-hist-cross-tick-osc"
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
            data-section="chart-line-macd-hist-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-macd-hist-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-macd-hist-cross-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showHistogramBars ? (
          <g data-section="chart-line-macd-hist-cross-histogram">
            {layout.histogramBars.map((b) => (
              <rect
                key={`hist-${b.index}`}
                x={b.cx - barWidth / 2}
                y={b.y}
                width={barWidth}
                height={Math.max(b.height, 0.5)}
                fill={
                  b.positive
                    ? histogramPositiveColor
                    : histogramNegativeColor
                }
                data-section={`chart-line-macd-hist-cross-bar-${b.positive ? 'pos' : 'neg'}`}
              />
            ))}
          </g>
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-macd-hist-cross-crosses"
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
                data-section={`chart-line-macd-hist-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-macd-hist-cross-overlay-crosses"
            role="group"
            aria-label="overlay cross markers"
          >
            {layout.crossMarkers.map((m) => (
              <polygon
                key={`cross-overlay-${m.index}`}
                points={
                  m.kind === 'bullish'
                    ? `${m.cx},${m.cyPrice + 8} ${m.cx - 5},${m.cyPrice + 16} ${m.cx + 5},${m.cyPrice + 16}`
                    : `${m.cx},${m.cyPrice - 8} ${m.cx - 5},${m.cyPrice - 16} ${m.cx + 5},${m.cyPrice - 16}`
                }
                fill={m.kind === 'bullish' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`${m.kind} overlay at ${formatX(m.x)}`}
                data-section={`chart-line-macd-hist-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-macd-hist-cross-hover-targets">
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
                data-section="chart-line-macd-hist-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-macd-hist-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={224}
                  height={146}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-hist-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-hist-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-hist-cross-tooltip-macd"
                >
                  macd{' '}
                  {tooltipSample.macd == null
                    ? '--'
                    : formatOsc(tooltipSample.macd)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-hist-cross-tooltip-signal"
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
                  data-section="chart-line-macd-hist-cross-tooltip-hist"
                >
                  hist{' '}
                  {tooltipSample.histogram == null
                    ? '--'
                    : formatOsc(tooltipSample.histogram)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-hist-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-hist-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-hist-cross-tooltip-counts2"
                >
                  neutral {layout.run.neutralCount} | none{' '}
                  {layout.run.noneCount}
                </text>
                <text
                  x={12}
                  y={128}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-macd-hist-cross-tooltip-crosses"
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
          data-section="chart-line-macd-hist-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          fast {fastLength} | slow {slowLength} | signal {signalLength}{' '}
          | crosses {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-macd-hist-cross-legend"
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
                id: 'histogram' as const,
                color: histogramPositiveColor,
                label: 'histogram',
              },
            ] satisfies Array<{
              id: ChartLineMacdHistCrossSeriesId;
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

ChartLineMacdHistCross.displayName = 'ChartLineMacdHistCross';
