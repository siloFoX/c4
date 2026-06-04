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
 * ChartLineAdxDiPlus -- pure-SVG two-panel chart with the Wilder
 * **+DI** directional indicator (SMA-smoothed variant).
 *
 * For each bar `i >= 1`:
 *
 *   upMove   = high[i] - high[i - 1]
 *   downMove = low[i - 1] - low[i]
 *   plusDM   = (upMove > downMove && upMove > 0) ? upMove : 0
 *   TR       = max(high - low, abs(high - prevClose),
 *                  abs(low - prevClose))
 *
 *   plusS = SMA(plusDM, period)
 *   trS   = SMA(TR, period)
 *
 *   +DI[i] = 100 * plusS / trS
 *
 * A bar is null when `trS == 0`. The first `period` bars after
 * bar 0 are null on the +DI line.
 *
 * Four bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (high == low == close == K)` -> `TR = 0` at
 *     every bar, so `+DI` is null at every bar.
 *   * `RISING (high == low == close == i + 10)` period 4 ->
 *     `plusDM = 1, TR = 1` at every bar after bar 0; `plusS =
 *     trS = 1` -> `+DI = 100` bit-exact at every defined bar.
 *   * `RISING_HALF (high == close == i + 10, low == i + 8)`
 *     period 4 -> `plusDM = 1, TR = 2` at every bar after bar 0
 *     (the `high - low = 2` term dominates the TR max); `plusS
 *     = 1, trS = 2` -> `+DI = 100 * 1 / 2 = 50` bit-exact.
 *   * `FALLING (high == low == close == 19 - i)` period 4 ->
 *     `plusDM = 0, TR = 1` -> `+DI = 0` bit-exact.
 *
 * The top panel plots the close; the bottom panel plots the +DI
 * in a fixed `[0, 100]` band with dashed `threshold` and `2 *
 * threshold` reference lines.
 */

export interface ChartLineAdxDiPlusPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAdxDiPlusZone =
  | 'strong'
  | 'bull'
  | 'weak'
  | 'none';

export type ChartLineAdxDiPlusSeriesId = 'price' | 'diPlus';

export interface ChartLineAdxDiPlusSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  diPlus: number | null;
  zone: ChartLineAdxDiPlusZone;
}

export interface ChartLineAdxDiPlusRun {
  series: ChartLineAdxDiPlusPoint[];
  period: number;
  threshold: number;
  diPlus: Array<number | null>;
  samples: ChartLineAdxDiPlusSample[];
  diPlusFinal: number | null;
  strongCount: number;
  bullCount: number;
  weakCount: number;
  ok: boolean;
}

export interface ChartLineAdxDiPlusMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  diPlus: number;
  zone: ChartLineAdxDiPlusZone;
}

export interface ChartLineAdxDiPlusDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxDiPlusLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  diPlusPanelTop: number;
  diPlusPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAdxDiPlusDot[];
  diPlusPath: string;
  markers: ChartLineAdxDiPlusMarker[];
  thresholdY: number;
  strongY: number;
  zeroY: number;
  priceMin: number;
  priceMax: number;
  diPlusMin: number;
  diPlusMax: number;
  run: ChartLineAdxDiPlusRun;
}

export interface ChartLineAdxDiPlusProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxDiPlusPoint[];
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
  diPlusColor?: string;
  strongColor?: string;
  bullColor?: string;
  weakColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDiPlus?: boolean;
  showThresholdLines?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxDiPlusSeriesId[];
  defaultHiddenSeries?: ChartLineAdxDiPlusSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxDiPlusSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAdxDiPlusSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ADX_DI_PLUS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_PERIOD = 14;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_THRESHOLD = 25;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_DI_PLUS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_STRONG_COLOR = '#15803d';
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_BULL_COLOR = '#22c55e';
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_WEAK_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_DI_PLUS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineAdxDiPlusFinitePoints(
  data: readonly ChartLineAdxDiPlusPoint[] | null | undefined,
): ChartLineAdxDiPlusPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxDiPlusPoint[] = [];
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
export function normalizeLineAdxDiPlusPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the threshold to a positive finite in `(0, 100]`. */
export function normalizeLineAdxDiPlusThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** Simple moving average of a nullable series. */
export function computeLineAdxDiPlusSma(
  values: ReadonlyArray<number | null>,
  period: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0 || period < 1) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = i - period + 1; j <= i; j += 1) {
      const v = values[j];
      if (!isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / period : null);
  }
  return out;
}

/**
 * Compute the +DI series per bar. Returns the +DI array same
 * length as `bars`. A bar is null when `trS == 0`.
 */
export function computeLineAdxDiPlus(
  bars: readonly ChartLineAdxDiPlusPoint[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const p = normalizeLineAdxDiPlusPeriod(
    period,
    DEFAULT_CHART_LINE_ADX_DI_PLUS_PERIOD,
  );
  const plusDm: Array<number | null> = [null];
  const tr: Array<number | null> = [null];
  for (let i = 1; i < bars.length; i += 1) {
    const cur = bars[i];
    const prev = bars[i - 1];
    if (
      !cur ||
      !prev ||
      !isFiniteNumber(cur.high) ||
      !isFiniteNumber(cur.low) ||
      !isFiniteNumber(cur.close) ||
      !isFiniteNumber(prev.high) ||
      !isFiniteNumber(prev.low) ||
      !isFiniteNumber(prev.close)
    ) {
      plusDm.push(null);
      tr.push(null);
      continue;
    }
    const up = cur.high - prev.high;
    const down = prev.low - cur.low;
    plusDm.push(up > down && up > 0 ? up : 0);
    const hl = cur.high - cur.low;
    const hc = Math.abs(cur.high - prev.close);
    const lc = Math.abs(cur.low - prev.close);
    let trV = hl;
    if (hc > trV) trV = hc;
    if (lc > trV) trV = lc;
    tr.push(trV);
  }
  const plusS = computeLineAdxDiPlusSma(plusDm, p);
  const trS = computeLineAdxDiPlusSma(tr, p);
  const diPlus: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const pp = plusS[i];
    const tt = trS[i];
    if (!isFiniteNumber(pp) || !isFiniteNumber(tt) || tt === 0) {
      diPlus.push(null);
      continue;
    }
    diPlus.push((100 * pp) / tt);
  }
  return diPlus;
}

/** Classify a +DI reading against the threshold ladder. */
export function classifyLineAdxDiPlusZone(
  value: number | null,
  threshold: number,
): ChartLineAdxDiPlusZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold * 2) return 'strong';
  if (value >= threshold) return 'bull';
  return 'weak';
}

export interface ChartLineAdxDiPlusOptions {
  period?: number;
  threshold?: number;
}

/** Run the full +DI pipeline plus sample classification. */
export function runLineAdxDiPlus(
  data: readonly ChartLineAdxDiPlusPoint[] | null | undefined,
  options: ChartLineAdxDiPlusOptions = {},
): ChartLineAdxDiPlusRun {
  const series = getLineAdxDiPlusFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineAdxDiPlusPeriod(
    options.period,
    DEFAULT_CHART_LINE_ADX_DI_PLUS_PERIOD,
  );
  const threshold = normalizeLineAdxDiPlusThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_ADX_DI_PLUS_THRESHOLD,
  );
  const diPlus = computeLineAdxDiPlus(series, period);
  const samples: ChartLineAdxDiPlusSample[] = series.map((point, index) => {
    const value = diPlus[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      diPlus: value,
      zone: classifyLineAdxDiPlusZone(value, threshold),
    };
  });
  let strongCount = 0;
  let bullCount = 0;
  let weakCount = 0;
  let diPlusFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong') strongCount += 1;
    else if (sample.zone === 'bull') bullCount += 1;
    else if (sample.zone === 'weak') weakCount += 1;
    if (isFiniteNumber(sample.diPlus)) diPlusFinal = sample.diPlus;
  }
  return {
    series,
    period,
    threshold,
    diPlus,
    samples,
    diPlusFinal,
    strongCount,
    bullCount,
    weakCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineAdxDiPlusLayoutOptions
  extends ChartLineAdxDiPlusOptions {
  data: readonly ChartLineAdxDiPlusPoint[] | null | undefined;
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
export function computeLineAdxDiPlusLayout(
  options: ChartLineAdxDiPlusLayoutOptions,
): ChartLineAdxDiPlusLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ADX_DI_PLUS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ADX_DI_PLUS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ADX_DI_PLUS_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_ADX_DI_PLUS_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_ADX_DI_PLUS_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineAdxDiPlus(options.data, {
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
  const diPlusPanelTop = pricePanelBottom + gap;
  const diPlusPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    diPlusPanelBottom - diPlusPanelTop > 0;
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

  const diPlusMin = 0;
  const diPlusMax = 105;
  const diPlusPanelHeight = diPlusPanelBottom - diPlusPanelTop;
  const diPlusYAt = (value: number): number =>
    diPlusPanelBottom -
    ((value - diPlusMin) / (diPlusMax - diPlusMin)) * diPlusPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineAdxDiPlusDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const diPlusLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAdxDiPlusMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.diPlus)) return;
    const cx = xAt(index);
    const cy = diPlusYAt(sample.diPlus);
    diPlusLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      diPlus: sample.diPlus,
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
    diPlusPanelTop,
    diPlusPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    diPlusPath: buildLinePath(diPlusLinePoints),
    markers,
    thresholdY: diPlusYAt(run.threshold),
    strongY: diPlusYAt(Math.min(100, run.threshold * 2)),
    zeroY: diPlusYAt(0),
    priceMin,
    priceMax,
    diPlusMin,
    diPlusMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAdxDiPlusChart(
  data: readonly ChartLineAdxDiPlusPoint[] | null | undefined,
  options: ChartLineAdxDiPlusOptions = {},
): string {
  const run = runLineAdxDiPlus(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.diPlusFinal === null ? 'n/a' : run.diPlusFinal.toFixed(3);
  return (
    `Two-panel chart with a Wilder +DI directional indicator panel ` +
    `(period ${run.period}, threshold ${run.threshold}): the top ` +
    `panel plots the close, the bottom panel plots the +DI as 100 ` +
    `* SMA(plusDM) / SMA(TR), where plusDM is the positive ` +
    `directional movement (high - prevHigh when greater than the ` +
    `mirrored downMove and positive) and TR is the Wilder true ` +
    `range. A constant series leaves the bar null (TR = 0). A ` +
    `pure rising trend with high == low == close reads +DI = 100 ` +
    `bit-exact; a pure falling trend reads 0. Across ${total} ` +
    `bars the +DI reads strong ` +
    `(>= ${Math.min(100, run.threshold * 2)}) on ${run.strongCount}, ` +
    `bull (>= ${run.threshold}) on ${run.bullCount}, and weak on ` +
    `${run.weakCount}. The final reading is ${finalText}.`
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
  zone: ChartLineAdxDiPlusZone,
  strongColor: string,
  bullColor: string,
  weakColor: string,
  noneColor: string,
): string {
  if (zone === 'strong') return strongColor;
  if (zone === 'bull') return bullColor;
  if (zone === 'weak') return weakColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineAdxDiPlusZone): string {
  if (zone === 'strong') return 'Strong';
  if (zone === 'bull') return 'Bull';
  if (zone === 'weak') return 'Weak';
  return 'n/a';
}

/**
 * ChartLineAdxDiPlus -- two-panel pure-SVG Wilder +DI directional
 * indicator chart.
 */
export const ChartLineAdxDiPlus = forwardRef<
  HTMLDivElement,
  ChartLineAdxDiPlusProps
>(function ChartLineAdxDiPlus(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_ADX_DI_PLUS_PERIOD,
    threshold = DEFAULT_CHART_LINE_ADX_DI_PLUS_THRESHOLD,
    width = DEFAULT_CHART_LINE_ADX_DI_PLUS_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_DI_PLUS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_DI_PLUS_PADDING,
    gap = DEFAULT_CHART_LINE_ADX_DI_PLUS_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_DI_PLUS_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ADX_DI_PLUS_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_ADX_DI_PLUS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_DI_PLUS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_DI_PLUS_PRICE_COLOR,
    diPlusColor = DEFAULT_CHART_LINE_ADX_DI_PLUS_DI_PLUS_COLOR,
    strongColor = DEFAULT_CHART_LINE_ADX_DI_PLUS_STRONG_COLOR,
    bullColor = DEFAULT_CHART_LINE_ADX_DI_PLUS_BULL_COLOR,
    weakColor = DEFAULT_CHART_LINE_ADX_DI_PLUS_WEAK_COLOR,
    noneColor = DEFAULT_CHART_LINE_ADX_DI_PLUS_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ADX_DI_PLUS_THRESHOLD_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_DI_PLUS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_DI_PLUS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDiPlus = true,
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
  const baseId = `chart-line-adx-di-plus-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAdxDiPlusSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAdxDiPlusSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAdxDiPlusLayout({
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
    ariaDescription ?? describeLineAdxDiPlusChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `+DI directional indicator chart, period ${run.period}, threshold ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAdxDiPlusSeriesId): void => {
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
      <g data-section="chart-line-adx-di-plus-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={88}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-adx-di-plus-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-adx-di-plus-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-adx-di-plus-tooltip-di-plus"
          x={tx + 10}
          y={ty + 51}
          fill="#86efac"
          fontSize={11}
          fontWeight={600}
        >
          {`+DI: ${
            hoverSample.diPlus === null
              ? 'n/a'
              : hoverSample.diPlus.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-adx-di-plus-tooltip-zone"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const diPlusHidden = isHidden('diPlus') || !showDiPlus;

  const legendItems: Array<{
    id: ChartLineAdxDiPlusSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'diPlus', label: '+DI', color: diPlusColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-adx-di-plus"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-di-plus-final={run.diPlusFinal === null ? '' : run.diPlusFinal}
      data-strong-count={run.strongCount}
      data-bull-count={run.bullCount}
      data-weak-count={run.weakCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-adx-di-plus-aria-desc"
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
          data-section="chart-line-adx-di-plus-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-adx-di-plus-empty"
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
          data-section="chart-line-adx-di-plus-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-adx-di-plus-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-adx-di-plus-grid-line"
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
                  layout.diPlusPanelBottom -
                  t * (layout.diPlusPanelBottom - layout.diPlusPanelTop);
                return (
                  <line
                    key={`dg-${i}`}
                    data-section="chart-line-adx-di-plus-grid-line"
                    data-panel="diPlus"
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
            <g data-section="chart-line-adx-di-plus-axes">
              <line
                data-section="chart-line-adx-di-plus-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adx-di-plus-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adx-di-plus-axis"
                data-panel="diPlus"
                x1={layout.innerLeft}
                y1={layout.diPlusPanelTop}
                x2={layout.innerLeft}
                y2={layout.diPlusPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adx-di-plus-axis"
                data-panel="diPlus"
                x1={layout.innerLeft}
                y1={layout.diPlusPanelBottom}
                x2={layout.innerRight}
                y2={layout.diPlusPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-adx-di-plus-panel-label"
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
            data-section="chart-line-adx-di-plus-panel-label"
            data-panel="diPlus"
            x={layout.innerRight}
            y={layout.diPlusPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            +DI
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-adx-di-plus-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={axisColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-adx-di-plus-threshold-lines">
              <line
                data-section="chart-line-adx-di-plus-threshold-line"
                data-direction="bull"
                x1={layout.innerLeft}
                y1={layout.thresholdY}
                x2={layout.innerRight}
                y2={layout.thresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-adx-di-plus-threshold-line"
                data-direction="strong"
                x1={layout.innerLeft}
                y1={layout.strongY}
                x2={layout.innerRight}
                y2={layout.strongY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-adx-di-plus-price-path"
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
            <g data-section="chart-line-adx-di-plus-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-adx-di-plus-dot"
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

          {!diPlusHidden ? (
            <path
              data-section="chart-line-adx-di-plus-line"
              d={layout.diPlusPath}
              fill="none"
              stroke={diPlusColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`+DI line, ${layout.markers.length} points`}
            />
          ) : null}

          {!diPlusHidden && showMarkers ? (
            <g data-section="chart-line-adx-di-plus-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-adx-di-plus-marker"
                  data-zone={marker.zone}
                  data-di-plus={marker.diPlus}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongColor,
                    bullColor,
                    weakColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, +DI ${formatValue(
                    marker.diPlus,
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
            <g data-section="chart-line-adx-di-plus-badge">
              <rect
                data-section="chart-line-adx-di-plus-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={120}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-adx-di-plus-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`+DI ${run.period} thr ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-adx-di-plus-legend"
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
                data-section="chart-line-adx-di-plus-legend-item"
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
                  data-section="chart-line-adx-di-plus-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-adx-di-plus-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-adx-di-plus-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong ${run.strongCount} / bull ${run.bullCount} / weak ${run.weakCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAdxDiPlus.displayName = 'ChartLineAdxDiPlus';
