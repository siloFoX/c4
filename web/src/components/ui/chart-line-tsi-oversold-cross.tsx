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
 * ChartLineTsiOversoldCross -- pure-SVG dual-panel chart with
 * the close in the top panel and the close-only True Strength
 * Index (TSI) line in the bottom panel, marking bullish (cross
 * up through -25 = exit) / bearish (cross down through -25 =
 * entry) double-smoothed momentum oversold trigger events.
 * Threshold -25 crossover variant of the William Blau TSI
 * family. Mirror of the overbought-cross primitive with
 * threshold negated.
 *
 *   mom_i     = close_i - close_{i-1}
 *   abs_mom_i = |mom_i|
 *   sm1_mom   = EMA(mom, long, SMA-seed)
 *   sm2_mom   = EMA(sm1_mom, short, SMA-seed)
 *   sm1_abs   = EMA(abs_mom, long, SMA-seed)
 *   sm2_abs   = EMA(sm1_abs, short, SMA-seed)
 *   tsi_i     = sm2_abs == 0 ? 0 : 100 * sm2_mom / sm2_abs
 *   bullish (exit)  : prev tsi <= -25 && cur tsi > -25
 *   bearish (entry) : prev tsi >= -25 && cur tsi < -25
 *
 * Defaults: `long = 25`, `short = 13` (Blau canonical),
 * `threshold = -25` (oversold line). Regime classifier
 * `bullish` (tsi >= -25), `bearish` (tsi < -25), `none` (tsi
 * null).
 *
 * Bit-exact anchor:
 *
 * - **CONST close = K**: tsi = 0. 0 >= -25 -> regime `bullish`
 *   on every valid bar. cross count = 0. Verified across K =
 *   0..1234.
 * - **LINEAR UP close = i**: tsi = 100. 100 >= -25 -> regime
 *   `bullish`. 0 crosses.
 * - **LINEAR DOWN close = -i**: tsi = -100. -100 < -25 ->
 *   regime `bearish`. 0 crosses. Cross activity lives in
 *   transients: decline-then-rise pushes tsi from -100 through
 *   -25 going up (bullish exit); rise-then-decline pulls tsi
 *   from 100 through -25 going down (bearish entry).
 */

export interface ChartLineTsiOversoldCrossPoint {
  x: number;
  close: number;
}

export type ChartLineTsiOversoldCrossRegime = 'bullish' | 'bearish' | 'none';

export type ChartLineTsiOversoldCrossSeriesId = 'price' | 'tsi';

export type ChartLineTsiOversoldCrossCrossKind = 'bullish' | 'bearish';

export interface ChartLineTsiOversoldCrossCross {
  index: number;
  x: number;
  kind: ChartLineTsiOversoldCrossCrossKind;
}

export interface ChartLineTsiOversoldCrossSample {
  index: number;
  x: number;
  close: number;
  tsi: number | null;
  regime: ChartLineTsiOversoldCrossRegime;
}

export interface ChartLineTsiOversoldCrossRun {
  series: ChartLineTsiOversoldCrossPoint[];
  long: number;
  short: number;
  threshold: number;
  tsiValues: Array<number | null>;
  samples: ChartLineTsiOversoldCrossSample[];
  crosses: ChartLineTsiOversoldCrossCross[];
  bullishCount: number;
  bearishCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineTsiOversoldCrossDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineTsiOversoldCrossLayout {
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
  priceDots: ChartLineTsiOversoldCrossDot[];
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
    kind: ChartLineTsiOversoldCrossCrossKind;
  }>;
  run: ChartLineTsiOversoldCrossRun;
}

export interface ChartLineTsiOversoldCrossProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineTsiOversoldCrossPoint[];
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
  hiddenSeries?: ChartLineTsiOversoldCrossSeriesId[];
  defaultHiddenSeries?: ChartLineTsiOversoldCrossSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineTsiOversoldCrossSeriesId;
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

export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_WIDTH = 720;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_PADDING = 44;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_LONG = 25;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_SHORT = 13;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_THRESHOLD = -25;
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_TSI_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_MID_COLOR = '#cbd5e1';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite x / close. */
export function getLineTsiOversoldCrossFinitePoints(
  data: readonly ChartLineTsiOversoldCrossPoint[] | null | undefined,
): ChartLineTsiOversoldCrossPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineTsiOversoldCrossPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineTsiOversoldCrossLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce any finite threshold. */
export function normalizeLineTsiOversoldCrossThreshold(
  value: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(value)) return value;
  return fallback;
}

/** SMA-seeded EMA over a values array that may contain leading nulls. */
export function applyLineTsiOversoldCrossEma(
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

export interface LineTsiOversoldCrossChannels {
  tsi: Array<number | null>;
  long: number;
  short: number;
}

export function computeLineTsiOversoldCross(
  series: readonly ChartLineTsiOversoldCrossPoint[] | null | undefined,
  options: { long?: number; short?: number } = {},
): LineTsiOversoldCrossChannels {
  const cleaned = getLineTsiOversoldCrossFinitePoints(series);
  const long = normalizeLineTsiOversoldCrossLength(
    options.long,
    DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_LONG,
  );
  const short = normalizeLineTsiOversoldCrossLength(
    options.short,
    DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_SHORT,
  );
  if (cleaned.length === 0) {
    return { tsi: [], long, short };
  }
  const n = cleaned.length;
  const closes = cleaned.map((p) => p.close);

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

  const sm1Mom = applyLineTsiOversoldCrossEma(mom, long, 1);
  const sm1Abs = applyLineTsiOversoldCrossEma(absMom, long, 1);

  const sm2Mom = applyLineTsiOversoldCrossEma(sm1Mom, short, long);
  const sm2Abs = applyLineTsiOversoldCrossEma(sm1Abs, short, long);

  const tsi: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i += 1) {
    const numer = sm2Mom[i];
    const denom = sm2Abs[i];
    if (numer == null || denom == null) continue;
    tsi[i] = denom === 0 ? 0 : posZero(100 * (numer / denom));
  }

  return { tsi, long, short };
}

export function classifyLineTsiOversoldCrossRegime(
  tsi: number | null,
  threshold: number,
): ChartLineTsiOversoldCrossRegime {
  if (tsi == null) return 'none';
  if (tsi >= threshold) return 'bullish';
  return 'bearish';
}

export function detectLineTsiOversoldCrossCrosses(
  series: readonly ChartLineTsiOversoldCrossPoint[],
  tsi: readonly (number | null)[],
  threshold: number,
): ChartLineTsiOversoldCrossCross[] {
  const out: ChartLineTsiOversoldCrossCross[] = [];
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

export function runLineTsiOversoldCross(
  data: ChartLineTsiOversoldCrossPoint[],
  options: {
    long?: number;
    short?: number;
    threshold?: number;
  } = {},
): ChartLineTsiOversoldCrossRun {
  const cleaned = getLineTsiOversoldCrossFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const threshold = normalizeLineTsiOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_THRESHOLD,
  );
  const channels = computeLineTsiOversoldCross(series, {
    long: options.long ?? undefined,
    short: options.short ?? undefined,
  });

  const samples: ChartLineTsiOversoldCrossSample[] = series.map((p, i) => {
    const v = channels.tsi[i] ?? null;
    return {
      index: i,
      x: p.x,
      close: p.close,
      tsi: v,
      regime: classifyLineTsiOversoldCrossRegime(v, threshold),
    };
  });

  const crosses = detectLineTsiOversoldCrossCrosses(
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

export interface ComputeLineTsiOversoldCrossLayoutOptions {
  data: ChartLineTsiOversoldCrossPoint[];
  long?: number;
  short?: number;
  threshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineTsiOversoldCrossLayout(
  opts: ComputeLineTsiOversoldCrossLayoutOptions,
): ChartLineTsiOversoldCrossLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_PADDING;
  const panelGap =
    opts.panelGap ?? DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_PANEL_GAP;
  const threshold = normalizeLineTsiOversoldCrossThreshold(
    opts.threshold,
    DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_THRESHOLD,
  );

  const run = runLineTsiOversoldCross(opts.data, {
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
  const priceDots: ChartLineTsiOversoldCrossDot[] = [];
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

export function describeLineTsiOversoldCrossChart(
  data: ChartLineTsiOversoldCrossPoint[],
  options: {
    long?: number;
    short?: number;
    threshold?: number;
  } = {},
): string {
  const cleaned = getLineTsiOversoldCrossFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const long = normalizeLineTsiOversoldCrossLength(
    options.long,
    DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_LONG,
  );
  const short = normalizeLineTsiOversoldCrossLength(
    options.short,
    DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_SHORT,
  );
  const threshold = normalizeLineTsiOversoldCrossThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_THRESHOLD,
  );
  return (
    `TSI Oversold Cross chart over ${cleaned.length} bars ` +
    `(long ${long}, short ${short}, threshold ${threshold}). ` +
    `Top panel renders the close with bullish (double-smoothed ` +
    `momentum oversold exit) / bearish (entry) chevron overlays ` +
    `at every True Strength Index ${threshold} crossover; bottom ` +
    `panel renders the close-only TSI line on a fixed -100 to ` +
    `100 oscillator with the ${threshold} oversold reference band ` +
    `and marks TSI level ${threshold} regime trigger events.`
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

export const ChartLineTsiOversoldCross = forwardRef<
  HTMLDivElement,
  ChartLineTsiOversoldCrossProps
>(function ChartLineTsiOversoldCross(props, ref): ReactNode {
  const {
    data,
    long = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_LONG,
    short = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_SHORT,
    threshold = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_THRESHOLD,
    width = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_WIDTH,
    height = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_HEIGHT,
    padding = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_PADDING,
    panelGap = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_PRICE_COLOR,
    tsiColor = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_TSI_COLOR,
    bullishColor = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_BEARISH_COLOR,
    axisColor = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_GRID_COLOR,
    midColor = DEFAULT_CHART_LINE_TSI_OVERSOLD_CROSS_MID_COLOR,
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
    () => getLineTsiOversoldCrossFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineTsiOversoldCrossLayout({
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
    ChartLineTsiOversoldCrossSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled ? (hiddenSeries ?? []) : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineTsiOversoldCrossSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineTsiOversoldCrossSeriesId,
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
        data-section="chart-line-tsi-oversold-cross-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineTsiOversoldCrossChart(cleaned, { long, short, threshold });

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
      aria-label={ariaLabel ?? 'TSI Oversold Cross chart'}
      aria-describedby={descId}
      data-section="chart-line-tsi-oversold-cross"
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
        data-section="chart-line-tsi-oversold-cross-title"
      >
        {ariaLabel ?? 'TSI Oversold Cross chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-tsi-oversold-cross-aria-desc"
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
        data-section="chart-line-tsi-oversold-cross-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-tsi-oversold-cross-grid">
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
                  data-section="chart-line-tsi-oversold-cross-grid-line-price"
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
                  data-section="chart-line-tsi-oversold-cross-grid-line-osc"
                />
              );
            })}
          </g>
        ) : null}

        {showBands ? (
          <g data-section="chart-line-tsi-oversold-cross-bands">
            <line
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={midColor}
              strokeDasharray="4 4"
              data-section="chart-line-tsi-oversold-cross-band-threshold"
            />
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-tsi-oversold-cross-axes">
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
                  data-section="chart-line-tsi-oversold-cross-tick-price"
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
                  data-section="chart-line-tsi-oversold-cross-tick-osc"
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
            data-section="chart-line-tsi-oversold-cross-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-tsi-oversold-cross-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-tsi-oversold-cross-price-dot"
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
            data-section="chart-line-tsi-oversold-cross-tsi-path"
          />
        ) : null}

        {showCrosses ? (
          <g
            data-section="chart-line-tsi-oversold-cross-crosses"
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
                data-section={`chart-line-tsi-oversold-cross-cross-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showOverlayCrosses ? (
          <g
            data-section="chart-line-tsi-oversold-cross-overlay-crosses"
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
                data-section={`chart-line-tsi-oversold-cross-overlay-${m.kind}`}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-tsi-oversold-cross-hover-targets">
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
                data-section="chart-line-tsi-oversold-cross-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-tsi-oversold-cross-tooltip"
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
                  data-section="chart-line-tsi-oversold-cross-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-oversold-cross-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-oversold-cross-tooltip-tsi"
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
                  data-section="chart-line-tsi-oversold-cross-tooltip-regime"
                >
                  regime {tooltipSample.regime}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-oversold-cross-tooltip-counts"
                >
                  bullish {layout.run.bullishCount} | bearish{' '}
                  {layout.run.bearishCount}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-oversold-cross-tooltip-entries"
                >
                  exits {layout.run.bullishCrossCount} | entries{' '}
                  {layout.run.bearishCrossCount}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-oversold-cross-tooltip-crosses"
                >
                  crosses {layout.run.crosses.length}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-tsi-oversold-cross-tooltip-periods"
                >
                  long {layout.run.long} | short {layout.run.short} | T{' '}
                  {layout.run.threshold}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-tsi-oversold-cross-badge"
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
          data-section="chart-line-tsi-oversold-cross-legend"
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
              id: ChartLineTsiOversoldCrossSeriesId;
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

ChartLineTsiOversoldCross.displayName = 'ChartLineTsiOversoldCross';
