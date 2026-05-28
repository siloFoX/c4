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
 * ChartLineFisherStoch -- pure-SVG two-panel chart applying the
 * inverse hyperbolic tangent (Fisher Transform) to the normalised
 * Stochastic value.
 *
 * For each bar `i >= period - 1`:
 *
 *   HH       = max(high over [i - period + 1, i])
 *   LL       = min(low  over [i - period + 1, i])
 *   stochK   = (close - LL) / (HH - LL)        (in [0, 1])
 *   x        = clamp(2 * stochK - 1, -CLAMP, +CLAMP)
 *   fisher   = 0.5 * ln((1 + x) / (1 - x))     (atanh(x))
 *
 * `CLAMP` is `0.999` -- the atanh asymptote is excluded with a
 * tiny margin so the log is finite. A bar with `HH == LL` (no
 * range) is null (no normalisation possible). The first `period
 * - 1` bars are null.
 *
 * Two bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (high == low == close == K)` -> `HH == LL`,
 *     so the bar is null at every position.
 *   * `AT_MIDPOINT (high == 12, low == 8, close == 10)` -> `HH
 *     = 12, LL = 8, stochK = (10 - 8) / (12 - 8) = 0.5, x = 2
 *     * 0.5 - 1 = 0`. `atanh(0) = 0.5 * ln(1 / 1) = 0`
 *     bit-exact. So `fisher = 0` at every defined bar.
 *
 * The top panel plots the close; the bottom panel plots the
 * Fisher Stochastic with a zero line and dashed `+/- threshold`
 * reference lines.
 */

export interface ChartLineFisherStochPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineFisherStochZone =
  | 'peak-bull'
  | 'bull'
  | 'flat'
  | 'bear'
  | 'peak-bear'
  | 'none';

export type ChartLineFisherStochSeriesId = 'price' | 'fisher';

export interface ChartLineFisherStochSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  stochK: number | null;
  fisher: number | null;
  zone: ChartLineFisherStochZone;
}

export interface ChartLineFisherStochRun {
  series: ChartLineFisherStochPoint[];
  period: number;
  threshold: number;
  stochK: Array<number | null>;
  fisher: Array<number | null>;
  samples: ChartLineFisherStochSample[];
  fisherFinal: number | null;
  peakBullCount: number;
  bullCount: number;
  bearCount: number;
  peakBearCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineFisherStochMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  fisher: number;
  zone: ChartLineFisherStochZone;
}

export interface ChartLineFisherStochDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineFisherStochLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  fisherPanelTop: number;
  fisherPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineFisherStochDot[];
  fisherPath: string;
  markers: ChartLineFisherStochMarker[];
  zeroY: number;
  upperThresholdY: number;
  lowerThresholdY: number;
  priceMin: number;
  priceMax: number;
  fisherMin: number;
  fisherMax: number;
  run: ChartLineFisherStochRun;
}

export interface ChartLineFisherStochProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineFisherStochPoint[];
  period?: number;
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
  fisherColor?: string;
  peakBullColor?: string;
  bullColor?: string;
  bearColor?: string;
  peakBearColor?: string;
  flatColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFisher?: boolean;
  showThresholdLines?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineFisherStochSeriesId[];
  defaultHiddenSeries?: ChartLineFisherStochSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineFisherStochSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineFisherStochSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_FISHER_STOCH_WIDTH = 720;
export const DEFAULT_CHART_LINE_FISHER_STOCH_HEIGHT = 400;
export const DEFAULT_CHART_LINE_FISHER_STOCH_PADDING = 44;
export const DEFAULT_CHART_LINE_FISHER_STOCH_GAP = 12;
export const DEFAULT_CHART_LINE_FISHER_STOCH_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_FISHER_STOCH_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_FISHER_STOCH_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_FISHER_STOCH_PERIOD = 10;
export const DEFAULT_CHART_LINE_FISHER_STOCH_THRESHOLD = 1.5;
export const DEFAULT_CHART_LINE_FISHER_STOCH_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_FISHER_STOCH_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_FISHER_STOCH_FISHER_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_FISHER_STOCH_PEAK_BULL_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_FISHER_STOCH_BULL_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_FISHER_STOCH_BEAR_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_FISHER_STOCH_PEAK_BEAR_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_FISHER_STOCH_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_FISHER_STOCH_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_FISHER_STOCH_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_FISHER_STOCH_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FISHER_STOCH_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_FISHER_STOCH_GRID_COLOR = '#e2e8f0';

/** Clamp constant: keep the input to atanh inside (-1, +1). */
export const CHART_LINE_FISHER_STOCH_CLAMP = 0.999;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineFisherStochFinitePoints(
  data: readonly ChartLineFisherStochPoint[] | null | undefined,
): ChartLineFisherStochPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineFisherStochPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close) &&
      point.high >= point.low
    ) {
      out.push({
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
      });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 2. */
export function normalizeLineFisherStochPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the +/- threshold to a positive finite. */
export function normalizeLineFisherStochThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

/** Clamp a value into `[-CLAMP, +CLAMP]`. */
export function clampLineFisherStoch(value: number): number {
  if (value > CHART_LINE_FISHER_STOCH_CLAMP) return CHART_LINE_FISHER_STOCH_CLAMP;
  if (value < -CHART_LINE_FISHER_STOCH_CLAMP) return -CHART_LINE_FISHER_STOCH_CLAMP;
  return value;
}

/**
 * Compute the per-bar `{stochK, fisher}` series. The first `period
 * - 1` bars are null on both. A bar with `HH == LL` (no range)
 * is null.
 */
export function computeLineFisherStoch(
  bars: readonly ChartLineFisherStochPoint[] | null | undefined,
  period: unknown,
): {
  stochK: Array<number | null>;
  fisher: Array<number | null>;
} {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { stochK: [], fisher: [] };
  }
  const p = normalizeLineFisherStochPeriod(
    period,
    DEFAULT_CHART_LINE_FISHER_STOCH_PERIOD,
  );
  const stochK: Array<number | null> = [];
  const fisher: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p - 1) {
      stochK.push(null);
      fisher.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const bar = bars[j];
      if (!bar || !isFiniteNumber(bar.high) || !isFiniteNumber(bar.low)) {
        ok = false;
        break;
      }
      if (bar.high > hh) hh = bar.high;
      if (bar.low < ll) ll = bar.low;
    }
    const bar = bars[i]!;
    if (!ok || !isFiniteNumber(bar.close) || hh === ll) {
      stochK.push(null);
      fisher.push(null);
      continue;
    }
    const k = (bar.close - ll) / (hh - ll);
    stochK.push(k);
    const x = clampLineFisherStoch(2 * k - 1);
    fisher.push(0.5 * Math.log((1 + x) / (1 - x)));
  }
  return { stochK, fisher };
}

/** Classify a Fisher Stochastic reading against the threshold ladder. */
export function classifyLineFisherStochZone(
  value: number | null,
  threshold: number,
): ChartLineFisherStochZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'peak-bull';
  if (value <= -threshold) return 'peak-bear';
  if (value > 0) return 'bull';
  if (value < 0) return 'bear';
  return 'flat';
}

export interface ChartLineFisherStochOptions {
  period?: number;
  threshold?: number;
}

/** Run the full Fisher Stochastic pipeline plus sample classification. */
export function runLineFisherStoch(
  data: readonly ChartLineFisherStochPoint[] | null | undefined,
  options: ChartLineFisherStochOptions = {},
): ChartLineFisherStochRun {
  const series = getLineFisherStochFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineFisherStochPeriod(
    options.period,
    DEFAULT_CHART_LINE_FISHER_STOCH_PERIOD,
  );
  const threshold = normalizeLineFisherStochThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_FISHER_STOCH_THRESHOLD,
  );
  const { stochK, fisher } = computeLineFisherStoch(series, period);
  const samples: ChartLineFisherStochSample[] = series.map((point, index) => {
    const value = fisher[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      stochK: stochK[index] ?? null,
      fisher: value,
      zone: classifyLineFisherStochZone(value, threshold),
    };
  });
  let peakBullCount = 0;
  let bullCount = 0;
  let bearCount = 0;
  let peakBearCount = 0;
  let flatCount = 0;
  let fisherFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'peak-bull') peakBullCount += 1;
    else if (sample.zone === 'bull') bullCount += 1;
    else if (sample.zone === 'bear') bearCount += 1;
    else if (sample.zone === 'peak-bear') peakBearCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.fisher)) fisherFinal = sample.fisher;
  }
  return {
    series = [],
    period,
    threshold,
    stochK,
    fisher,
    samples,
    fisherFinal,
    peakBullCount,
    bullCount,
    bearCount,
    peakBearCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineFisherStochLayoutOptions
  extends ChartLineFisherStochOptions {
  data: readonly ChartLineFisherStochPoint[] | null | undefined;
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
export function computeLineFisherStochLayout(
  options: ChartLineFisherStochLayoutOptions,
): ChartLineFisherStochLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_FISHER_STOCH_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_FISHER_STOCH_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_FISHER_STOCH_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_FISHER_STOCH_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_FISHER_STOCH_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineFisherStoch(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.threshold !== undefined
      ? { threshold: options.threshold }
      : {}),
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
  const fisherPanelTop = pricePanelBottom + gap;
  const fisherPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    fisherPanelBottom - fisherPanelTop > 0;
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

  let fisherAbsMax = run.threshold * 2;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.fisher)) {
      const v = Math.abs(sample.fisher);
      if (v > fisherAbsMax) fisherAbsMax = v;
    }
  }
  if (fisherAbsMax === 0) fisherAbsMax = run.threshold || 1;
  const fisherMin = -fisherAbsMax * 1.05;
  const fisherMax = fisherAbsMax * 1.05;
  const fisherPanelHeight = fisherPanelBottom - fisherPanelTop;
  const fisherYAt = (value: number): number =>
    fisherPanelBottom -
    ((value - fisherMin) / (fisherMax - fisherMin)) * fisherPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineFisherStochDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const fisherLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineFisherStochMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.fisher)) return;
    const cx = xAt(index);
    const cy = fisherYAt(sample.fisher);
    fisherLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      fisher: sample.fisher,
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
    fisherPanelTop,
    fisherPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    fisherPath: buildLinePath(fisherLinePoints),
    markers,
    zeroY: fisherYAt(0),
    upperThresholdY: fisherYAt(run.threshold),
    lowerThresholdY: fisherYAt(-run.threshold),
    priceMin,
    priceMax,
    fisherMin,
    fisherMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineFisherStochChart(
  data: readonly ChartLineFisherStochPoint[] | null | undefined,
  options: ChartLineFisherStochOptions = {},
): string {
  const run = runLineFisherStoch(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.fisherFinal === null ? 'n/a' : run.fisherFinal.toFixed(4);
  return (
    `Two-panel chart with a Fisher Stochastic panel (period ` +
    `${run.period}, threshold +/- ${run.threshold}): the top ` +
    `panel plots the close, the bottom panel applies the inverse ` +
    `hyperbolic tangent (atanh) to the normalised Stochastic ` +
    `value 2 * stochK - 1, clamped to (-${CHART_LINE_FISHER_STOCH_CLAMP}, ` +
    `+${CHART_LINE_FISHER_STOCH_CLAMP}). A close at the bar-window ` +
    `midpoint reads exactly zero on the Fisher Stochastic. ` +
    `Across ${total} bars the Fisher reads peak-bull (>= ` +
    `${run.threshold}) on ${run.peakBullCount}, bull on ` +
    `${run.bullCount}, bear on ${run.bearCount}, peak-bear ` +
    `(<= -${run.threshold}) on ${run.peakBearCount}, and flat ` +
    `on ${run.flatCount}. The final reading is ${finalText}.`
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
  zone: ChartLineFisherStochZone,
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

function zoneLabelOf(zone: ChartLineFisherStochZone): string {
  if (zone === 'peak-bull') return 'Peak bull';
  if (zone === 'bull') return 'Bull';
  if (zone === 'bear') return 'Bear';
  if (zone === 'peak-bear') return 'Peak bear';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineFisherStoch -- two-panel pure-SVG Fisher Stochastic
 * chart.
 */
export const ChartLineFisherStoch = forwardRef<
  HTMLDivElement,
  ChartLineFisherStochProps
>(function ChartLineFisherStoch(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_FISHER_STOCH_PERIOD,
    threshold = DEFAULT_CHART_LINE_FISHER_STOCH_THRESHOLD,
    width = DEFAULT_CHART_LINE_FISHER_STOCH_WIDTH,
    height = DEFAULT_CHART_LINE_FISHER_STOCH_HEIGHT,
    padding = DEFAULT_CHART_LINE_FISHER_STOCH_PADDING,
    gap = DEFAULT_CHART_LINE_FISHER_STOCH_GAP,
    tickCount = DEFAULT_CHART_LINE_FISHER_STOCH_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_FISHER_STOCH_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_FISHER_STOCH_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_FISHER_STOCH_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_FISHER_STOCH_PRICE_COLOR,
    fisherColor = DEFAULT_CHART_LINE_FISHER_STOCH_FISHER_COLOR,
    peakBullColor = DEFAULT_CHART_LINE_FISHER_STOCH_PEAK_BULL_COLOR,
    bullColor = DEFAULT_CHART_LINE_FISHER_STOCH_BULL_COLOR,
    bearColor = DEFAULT_CHART_LINE_FISHER_STOCH_BEAR_COLOR,
    peakBearColor = DEFAULT_CHART_LINE_FISHER_STOCH_PEAK_BEAR_COLOR,
    flatColor = DEFAULT_CHART_LINE_FISHER_STOCH_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_FISHER_STOCH_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_FISHER_STOCH_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_FISHER_STOCH_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_FISHER_STOCH_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_FISHER_STOCH_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFisher = true,
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
  const baseId = `chart-line-fisher-stoch-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineFisherStochSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineFisherStochSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineFisherStochLayout({
        data,
        period,
        threshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [data, period, threshold, width, height, padding, gap, pricePanelRatio],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineFisherStochChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `Fisher Stochastic chart, period ${run.period}, threshold +/- ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineFisherStochSeriesId): void => {
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
    const tooltipW = 200;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g data-section="chart-line-fisher-stoch-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={104}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-fisher-stoch-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-fisher-stoch-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-fisher-stoch-tooltip-stoch"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`%K: ${
            hoverSample.stochK === null
              ? 'n/a'
              : hoverSample.stochK.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-fisher-stoch-tooltip-fisher"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Fisher: ${
            hoverSample.fisher === null
              ? 'n/a'
              : hoverSample.fisher.toFixed(4)
          }`}
        </text>
        <text
          data-section="chart-line-fisher-stoch-tooltip-zone"
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
  const fisherHidden = isHidden('fisher') || !showFisher;

  const legendItems: Array<{
    id: ChartLineFisherStochSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'fisher', label: 'Fisher %K', color: fisherColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-fisher-stoch"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-fisher-final={run.fisherFinal === null ? '' : run.fisherFinal}
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
        data-section="chart-line-fisher-stoch-aria-desc"
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
          data-section="chart-line-fisher-stoch-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-fisher-stoch-empty"
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
          data-section="chart-line-fisher-stoch-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-fisher-stoch-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-fisher-stoch-grid-line"
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
                  layout.fisherPanelBottom -
                  t * (layout.fisherPanelBottom - layout.fisherPanelTop);
                return (
                  <line
                    key={`fg-${i}`}
                    data-section="chart-line-fisher-stoch-grid-line"
                    data-panel="fisher"
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
            <g data-section="chart-line-fisher-stoch-axes">
              <line
                data-section="chart-line-fisher-stoch-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-fisher-stoch-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-fisher-stoch-axis"
                data-panel="fisher"
                x1={layout.innerLeft}
                y1={layout.fisherPanelTop}
                x2={layout.innerLeft}
                y2={layout.fisherPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-fisher-stoch-axis"
                data-panel="fisher"
                x1={layout.innerLeft}
                y1={layout.fisherPanelBottom}
                x2={layout.innerRight}
                y2={layout.fisherPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-fisher-stoch-panel-label"
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
            data-section="chart-line-fisher-stoch-panel-label"
            data-panel="fisher"
            x={layout.innerRight}
            y={layout.fisherPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            Fisher
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-fisher-stoch-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-fisher-stoch-threshold-lines">
              <line
                data-section="chart-line-fisher-stoch-threshold-line"
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
                data-section="chart-line-fisher-stoch-threshold-line"
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
              data-section="chart-line-fisher-stoch-price-path"
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
            <g data-section="chart-line-fisher-stoch-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-fisher-stoch-dot"
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

          {!fisherHidden ? (
            <path
              data-section="chart-line-fisher-stoch-line"
              d={layout.fisherPath}
              fill="none"
              stroke={fisherColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Fisher Stochastic line, ${layout.markers.length} points`}
            />
          ) : null}

          {!fisherHidden && showMarkers ? (
            <g data-section="chart-line-fisher-stoch-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-fisher-stoch-marker"
                  data-zone={marker.zone}
                  data-fisher={marker.fisher}
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
                  aria-label={`Bar ${formatX(marker.x)}, Fisher ${formatValue(
                    marker.fisher,
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
            <g data-section="chart-line-fisher-stoch-badge">
              <rect
                data-section="chart-line-fisher-stoch-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={132}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-fisher-stoch-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`FisherK ${run.period} +/- ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-fisher-stoch-legend"
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
                data-section="chart-line-fisher-stoch-legend-item"
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
                  data-section="chart-line-fisher-stoch-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-fisher-stoch-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-fisher-stoch-legend-stats"
            style={{ color: axisColor }}
          >
            {`++ ${run.peakBullCount} / + ${run.bullCount} / - ${run.bearCount} / -- ${run.peakBearCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineFisherStoch.displayName = 'ChartLineFisherStoch';
