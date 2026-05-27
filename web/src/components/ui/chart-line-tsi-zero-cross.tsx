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
 * ChartLineTsiZeroCross -- pure-SVG dual-panel chart with the
 * close in the top panel and the close-only True Strength Index
 * (TSI) line in the bottom panel, marking bullish (cross up
 * through zero) / bearish (cross down through zero) double-
 * smoothed momentum baseline regime transition events. Zero-
 * line cross variant of the William Blau TSI family that flags
 * the discrete TSI crossing of the zero baseline.
 *
 * TSI applies two passes of EMA smoothing to the raw momentum
 * (`close - close_prev`) and its absolute value, then divides:
 *
 *   mom_i       = close_i - close_{i-1}
 *   abs_mom_i   = |mom_i|
 *   sm1_mom     = EMA(mom, long, SMA-seed)
 *   sm2_mom     = EMA(sm1_mom, short, SMA-seed)
 *   sm1_abs     = EMA(abs_mom, long, SMA-seed)
 *   sm2_abs     = EMA(sm1_abs, short, SMA-seed)
 *   tsi_i       = sm2_abs == 0 ? 0 : 100 * sm2_mom / sm2_abs
 *   bullish     : prev tsi <= 0 && cur tsi > 0  (momentum up)
 *   bearish     : prev tsi >= 0 && cur tsi < 0  (momentum down)
 *
 * Defaults: `long = 25`, `short = 13` (Blau canonical),
 * `threshold = 0` (zero baseline). Regime classifier `bullish`
 * (tsi >= 0), `bearish` (tsi < 0), `none` (tsi null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: mom = 0 every bar, abs_mom = 0. Both
 *   double-EMAs end up at 0; the divide-by-zero fallback
 *   resolves to tsi = 0. tsi = 0 sits on the threshold but the
 *   strict-inequality detector never fires. regime `bullish`
 *   (tsi >= 0). cross count = 0. Verified across K = 0..1234.
 * - **LINEAR UP close = i**: mom = +1 every bar, abs_mom = 1.
 *   Both double-EMAs converge to 1. tsi = 100 constant. regime
 *   `bullish`. 0 crosses.
 * - **LINEAR DOWN close = -i**: mom = -1, abs_mom = 1. sm2_mom
 *   = -1, sm2_abs = 1, tsi = -100 constant. regime `bearish`.
 *   0 crosses.
 */

export interface ChartLineTsiZeroCrossPoint {
  x: number;
  close: number;
}

export type ChartLineTsiZeroCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineTsiZeroCrossSeriesId = 'price' | 'tsi';

export type ChartLineTsiZeroCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineTsiZeroCrossCross {
  index: number;
  x: number;
  kind: ChartLineTsiZeroCrossCrossKind;
}

export interface ChartLineTsiZeroCrossSample {
  index: number;
  x: number;
  close: number;
  tsi: number | null;
  regime: ChartLineTsiZeroCrossRegime;
}

export interface ChartLineTsiZeroCrossRun {
  series: ChartLineTsiZeroCrossPoint[];
  long: number;
  short: number;
  threshold: number;
  tsiValues: Array<number | null>;
  samples: ChartLineTsiZeroCrossSample[];
  crosses: ChartLineTsiZeroCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineTsiZeroCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTsiZeroCrossLayout {
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
  priceDots: ChartLineTsiZeroCrossDot[];
  tsiPath: string;
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
    kind: ChartLineTsiZeroCrossCrossKind;
  }>;
  run: ChartLineTsiZeroCrossRun;
}

export interface ChartLineTsiZeroCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTsiZeroCrossPoint[];
  long?: number;
  short?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  tsiColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  axisColor?: string;
  gridColor?: string;
  midColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showTsi?: boolean;
  showCrosses?: boolean;
  showOverlayCrosses?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBands?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineTsiZeroCrossSeriesId[];
  defaultHiddenSeries?: ChartLineTsiZeroCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTsiZeroCrossSeriesId;
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

export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_LONG = 25;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_SHORT = 13;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_TSI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TSI_ZERO_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineTsiZeroCrossFinitePoints(
  data: readonly ChartLineTsiZeroCrossPoint[] | null | undefined,
): ChartLineTsiZeroCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTsiZeroCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineTsiZeroCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineTsiZeroCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/**
 * SMA-seeded EMA over a values array that may contain leading
 * nulls. The SMA seed is computed from the first `length`
 * non-null values starting at `firstValidIdx`; subsequent
 * values feed the recursive EMA. CONST short-circuit when the
 * seed window is constant.
 */
export function applyLineTsiZeroCrossEma(
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

export interface LineTsiZeroCrossChannels {
  tsi: Array<number | null>;
  long: number;
  short: number;
}

export function computeLineTsiZeroCross(
  series: readonly ChartLineTsiZeroCrossPoint[] | null | undefined,
  options: { long?: number; short?: number } = {},
): LineTsiZeroCrossChannels {
  const cleaned = getLineTsiZeroCrossFinitePoints(series);
  const long = normalizeLineTsiZeroCrossLength(
    options.long,
    DEFAULT_CHART_LINE_TSI_ZERO_CROSS_LONG,
  );
  const short = normalizeLineTsiZeroCrossLength(
    options.short,
    DEFAULT_CHART_LINE_TSI_ZERO_CROSS_SHORT,
  );
  if (cleaned.length === 0) {
    return { tsi: [], long, short };
  }
  const n = cleaned.length;
  const closes = cleaned.map((p) => p.close);

  // Raw momentum and absolute momentum (valid from i = 1).
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

  // First-pass EMAs over long window, starting at i = 1.
  const sm1Mom = applyLineTsiZeroCrossEma(mom, long, 1);
  const sm1Abs = applyLineTsiZeroCrossEma(absMom, long, 1);

  // Second-pass EMAs over short window, starting at the first
  // valid index of the first-pass result (i = long).
  const sm2Mom = applyLineTsiZeroCrossEma(sm1Mom, short, long);
  const sm2Abs = applyLineTsiZeroCrossEma(sm1Abs, short, long);

  const tsi: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const numer = sm2Mom[i];
    const denom = sm2Abs[i];
    if (numer == null || denom == null) continue;
    tsi[i] = denom === 0 ? 0 : posZero(100 * (numer / denom));
  }

  return { tsi, long, short };
}

export function classifyLineTsiZeroCrossRegime(
  tsi: number | null,
  threshold: number,
): ChartLineTsiZeroCrossRegime {
  if (tsi == null) return 'none';
  if (tsi >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineTsiZeroCrossCrosses(
  series: readonly ChartLineTsiZeroCrossPoint[],
  tsi: readonly (number | null)[],
  threshold: number,
): ChartLineTsiZeroCrossCross[] {
  const out: ChartLineTsiZeroCrossCross[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = tsi[i - 1];
    const cur = tsi[i];
    if (prev == null || cur == null) continue;
    if (prev <= threshold && cur > threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bullish' });
    } else if (prev >= threshold && cur < threshold) {
      out.push({ index: i, x: series[i]!.x, kind: 'bearish' });
    }
  }
  return out;
}

export function runLineTsiZeroCross(
  data: ChartLineTsiZeroCrossPoint[],
  options: {
    long?: number;
    short?: number;
    threshold?: number;
  } = {},
): ChartLineTsiZeroCrossRun {
  const cleaned = getLineTsiZeroCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineTsiZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_TSI_ZERO_CROSS_THRESHOLD,
  );
  const channels = computeLineTsiZeroCross(series, {
    long: options.long ?? undefined,
    short: options.short ?? undefined,
  });

  const samples: ChartLineTsiZeroCrossSample[] = series.map((p, i) => {
    const v = channels.tsi[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      tsi: v,
      regime: classifyLineTsiZeroCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineTsiZeroCrossCrosses(
    series,
    channels.tsi,
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

  const ok = series.length > channels.long + channels.short;

  return {
    series,
    long: channels.long,
    short: channels.short,
    threshold,
    tsiValues: channels.tsi,
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

export interface ComputeLineTsiZeroCrossLayoutOptions {
  data: ChartLineTsiZeroCrossPoint[];
  long?: number;
  short?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTsiZeroCrossLayout(
  opts: ComputeLineTsiZeroCrossLayoutOptions,
): ChartLineTsiZeroCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TSI_ZERO_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_TSI_ZERO_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_TSI_ZERO_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TSI_ZERO_CROSS_PANEL_GAP;
  const threshold = normalizeLineTsiZeroCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_TSI_ZERO_CROSS_THRESHOLD,
  );

  const run = runLineTsiZeroCross(opts.data, {
    long: opts.long ?? undefined,
    short: opts.short ?? undefined,
    threshold,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const oscTop = priceBottom + panelGap;
  const oscBottom = priceBottom + panelGap + usable * 0.45;

  // TSI is bounded to [-100, 100] by construction, so the osc
  // panel uses a fixed range with the threshold (default 0)
  // sitting at the midline.
  const oscMin = -100;
  const oscMax = 100;
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
      tsiPath: '',
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
  const priceDots: ChartLineTsiZeroCrossDot[] = [];
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
  let first = true;
  for (const s of run.samples) {
    if (s.tsi == null) {
      first = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syOscBase(s.tsi);
    tsiPath += `${first ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    first = false;
  }
  tsiPath = tsiPath.trim();

  const crossMarkers = run.crosses.map((c) => {
    const samp = run.samples[c.index];
    const cx = sx(c.x);
    const cyPrice = samp ? syPrice(samp.close) : priceBottom;
    const cyOsc = syOscBase(run.tsiValues[c.index] ?? threshold);
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
    priceMin,
    priceMax,
    oscMin,
    oscMax,
    thresholdY,
    crossMarkers,
    run,
  };
}

export function describeLineTsiZeroCrossChart(
  data: ChartLineTsiZeroCrossPoint[],
  options: {
    long?: number;
    short?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineTsiZeroCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const long = normalizeLineTsiZeroCrossLength(
    options.long,
    DEFAULT_CHART_LINE_TSI_ZERO_CROSS_LONG,
  );
  const short = normalizeLineTsiZeroCrossLength(
    options.short,
    DEFAULT_CHART_LINE_TSI_ZERO_CROSS_SHORT,
  );
  const threshold = normalizeLineTsiZeroCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_TSI_ZERO_CROSS_THRESHOLD,
  );
  return (
    `TSI Zero Cross chart over ${cleaned.length} bars ` +
    `(long ${long}, short ${short}, threshold ${threshold}). ` +
    `Top panel renders the close with bullish (double-smoothed ` +
    `momentum baseline cross up) / bearish (cross down) ` +
    `chevron overlays at every True Strength Index zero-line ` +
    `cross; bottom panel renders the close-only TSI line on a ` +
    `fixed -100 to 100 oscillator with the zero baseline ` +
    `reference band and marks TSI level ${threshold} regime ` +
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

export const ChartLineTsiZeroCross = forwardRef<
  HTMLDivElement,
  ChartLineTsiZeroCrossProps
>(function ChartLineTsiZeroCross(props, ref): ReactNode {
  const {
    data,
    long = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_LONG,
    short = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_SHORT,
    threshold = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_PRICE_COLOR,
    tsiColor = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_TSI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_TSI_ZERO_CROSS_MID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showTsi = true,
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
    () => getLineTsiZeroCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTsiZeroCrossLayout({
        data: cleaned,
        long,
        short,
        threshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [cleaned, long, short, threshold, width, height, padding, panelGap],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineTsiZeroCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineTsiZeroCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineTsiZeroCrossSeriesId,
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
        data-section="chart-line-tsi-zero-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTsiZeroCrossChart(cleaned, { long, short, threshold });

  const showPrice = !hidden.has('price');
  const showTsiLine = !hidden.has('tsi') && showTsi;

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
      aria-label={ariaLabel ?? 'TSI Zero Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-tsi-zero-cross"
      data-long={long}
      data-short={short}
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
        data-section="chart-line-tsi-zero-cross-title"
      >
        {ariaLabel ?? 'TSI Zero Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-tsi-zero-cross-aria-desc"
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
        data-section="chart-line-tsi-zero-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-tsi-zero-cross-grid">
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
                  data-section="chart-line-tsi-zero-cross-grid-line-price"
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
                  data-section="chart-line-tsi-zero-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-tsi-zero-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-tsi-zero-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-tsi-zero-cross-axes">
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
                  data-section="chart-line-tsi-zero-cross-tick-price"
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
                  data-section="chart-line-tsi-zero-cross-tick-osc"
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
            data-section="chart-line-tsi-zero-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-tsi-zero-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-tsi-zero-cross-price-dot"
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
            data-section="chart-line-tsi-zero-cross-tsi-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-tsi-zero-cross-crosses"
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
                data-section={`chart-line-tsi-zero-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-tsi-zero-cross-overlay-crosses"
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
                data-section={`chart-line-tsi-zero-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-tsi-zero-cross-hover-targets">
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
                data-section="chart-line-tsi-zero-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-tsi-zero-cross-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={236}
                  height={132}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-zero-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-zero-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-zero-cross-tooltip-tsi"
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
                  data-section="chart-line-tsi-zero-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-zero-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-zero-cross-tooltip-entries"
                >
                  bull crosses {layout.run.bullishCrossCount} | bear{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-zero-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-zero-cross-tooltip-periods"
                >
                  long {layout.run.long} | short {layout.run.short}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-tsi-zero-cross-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          long {long} | short {short} | threshold {threshold} | crosses{' '}
          {layout.run.crosses.length}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-tsi-zero-cross-legend"
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
            ] satisfies Array<{
              id: ChartLineTsiZeroCrossSeriesId;
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

ChartLineTsiZeroCross.displayName = 'ChartLineTsiZeroCross';
