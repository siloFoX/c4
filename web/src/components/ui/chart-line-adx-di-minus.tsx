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
 * ChartLineAdxDiMinus -- pure-SVG two-panel chart with the Wilder
 * **-DI** directional indicator (SMA-smoothed variant).
 *
 * For each bar `i >= 1`:
 *
 *   upMove   = high[i] - high[i - 1]
 *   downMove = low[i - 1] - low[i]
 *   minusDM  = (downMove > upMove && downMove > 0) ? downMove : 0
 *   TR       = max(high - low, abs(high - prevClose),
 *                  abs(low - prevClose))
 *
 *   minusS = SMA(minusDM, period)
 *   trS    = SMA(TR, period)
 *
 *   -DI[i] = 100 * minusS / trS
 *
 * A bar is null when `trS == 0`.
 *
 * Four bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (high == low == close == K)` -> `TR = 0` -> -DI
 *     null at every bar.
 *   * `RISING (high == low == close == i + 10)` period 4 ->
 *     `minusDM = 0` -> -DI = 0 bit-exact.
 *   * `FALLING (high == low == close == 19 - i)` period 4 ->
 *     `minusDM = 1, TR = 1` -> -DI = 100 bit-exact.
 *   * `FALLING_HALF (low == close == 19 - i, high == 21 - i)`
 *     period 4 -> `minusDM = 1, TR = 2` (hl = 2 term dominates)
 *     -> -DI = 100 * 1 / 2 = 50 bit-exact.
 *
 * The top panel plots the close; the bottom panel plots the -DI
 * in a fixed `[0, 100]` band with dashed `threshold` and `2 *
 * threshold` reference lines.
 */

export interface ChartLineAdxDiMinusPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineAdxDiMinusZone =
  | 'strong'
  | 'bear'
  | 'weak'
  | 'none';

export type ChartLineAdxDiMinusSeriesId = 'price' | 'diMinus';

export interface ChartLineAdxDiMinusSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  diMinus: number | null;
  zone: ChartLineAdxDiMinusZone;
}

export interface ChartLineAdxDiMinusRun {
  series: ChartLineAdxDiMinusPoint[];
  period: number;
  threshold: number;
  diMinus: Array<number | null>;
  samples: ChartLineAdxDiMinusSample[];
  diMinusFinal: number | null;
  strongCount: number;
  bearCount: number;
  weakCount: number;
  ok: boolean;
}

export interface ChartLineAdxDiMinusMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  diMinus: number;
  zone: ChartLineAdxDiMinusZone;
}

export interface ChartLineAdxDiMinusDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdxDiMinusLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  diMinusPanelTop: number;
  diMinusPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAdxDiMinusDot[];
  diMinusPath: string;
  markers: ChartLineAdxDiMinusMarker[];
  thresholdY: number;
  strongY: number;
  zeroY: number;
  priceMin: number;
  priceMax: number;
  diMinusMin: number;
  diMinusMax: number;
  run: ChartLineAdxDiMinusRun;
}

export interface ChartLineAdxDiMinusProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdxDiMinusPoint[];
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
  diMinusColor?: string;
  strongColor?: string;
  bearColor?: string;
  weakColor?: string;
  noneColor?: string;
  thresholdColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showDiMinus?: boolean;
  showThresholdLines?: boolean;
  showZeroLine?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdxDiMinusSeriesId[];
  defaultHiddenSeries?: ChartLineAdxDiMinusSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdxDiMinusSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAdxDiMinusSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ADX_DI_MINUS_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_HEIGHT = 400;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_PADDING = 44;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_GAP = 12;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_PERIOD = 14;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_THRESHOLD = 25;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_DI_MINUS_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_STRONG_COLOR = '#7f1d1d';
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_BEAR_COLOR = '#ef4444';
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_WEAK_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADX_DI_MINUS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC and `high >= low`. */
export function getLineAdxDiMinusFinitePoints(
  data: readonly ChartLineAdxDiMinusPoint[] | null | undefined,
): ChartLineAdxDiMinusPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdxDiMinusPoint[] = [];
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
export function normalizeLineAdxDiMinusPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the threshold to a positive finite in `(0, 100]`. */
export function normalizeLineAdxDiMinusThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/** Simple moving average of a nullable series. */
export function computeLineAdxDiMinusSma(
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
 * Compute the -DI series per bar. Returns the -DI array same
 * length as `bars`. A bar is null when `trS == 0`.
 */
export function computeLineAdxDiMinus(
  bars: readonly ChartLineAdxDiMinusPoint[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const p = normalizeLineAdxDiMinusPeriod(
    period,
    DEFAULT_CHART_LINE_ADX_DI_MINUS_PERIOD,
  );
  const minusDm: Array<number | null> = [null];
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
      minusDm.push(null);
      tr.push(null);
      continue;
    }
    const up = cur.high - prev.high;
    const down = prev.low - cur.low;
    minusDm.push(down > up && down > 0 ? down : 0);
    const hl = cur.high - cur.low;
    const hc = Math.abs(cur.high - prev.close);
    const lc = Math.abs(cur.low - prev.close);
    let trV = hl;
    if (hc > trV) trV = hc;
    if (lc > trV) trV = lc;
    tr.push(trV);
  }
  const minusS = computeLineAdxDiMinusSma(minusDm, p);
  const trS = computeLineAdxDiMinusSma(tr, p);
  const diMinus: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const mm = minusS[i];
    const tt = trS[i];
    if (!isFiniteNumber(mm) || !isFiniteNumber(tt) || tt === 0) {
      diMinus.push(null);
      continue;
    }
    diMinus.push((100 * mm) / tt);
  }
  return diMinus;
}

/** Classify a -DI reading against the threshold ladder. */
export function classifyLineAdxDiMinusZone(
  value: number | null,
  threshold: number,
): ChartLineAdxDiMinusZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold * 2) return 'strong';
  if (value >= threshold) return 'bear';
  return 'weak';
}

export interface ChartLineAdxDiMinusOptions {
  period?: number;
  threshold?: number;
}

/** Run the full -DI pipeline plus sample classification. */
export function runLineAdxDiMinus(
  data: readonly ChartLineAdxDiMinusPoint[] | null | undefined,
  options: ChartLineAdxDiMinusOptions = {},
): ChartLineAdxDiMinusRun {
  const series = getLineAdxDiMinusFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineAdxDiMinusPeriod(
    options.period,
    DEFAULT_CHART_LINE_ADX_DI_MINUS_PERIOD,
  );
  const threshold = normalizeLineAdxDiMinusThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_ADX_DI_MINUS_THRESHOLD,
  );
  const diMinus = computeLineAdxDiMinus(series, period);
  const samples: ChartLineAdxDiMinusSample[] = series.map((point, index) => {
    const value = diMinus[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      diMinus: value,
      zone: classifyLineAdxDiMinusZone(value, threshold),
    };
  });
  let strongCount = 0;
  let bearCount = 0;
  let weakCount = 0;
  let diMinusFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'strong') strongCount += 1;
    else if (sample.zone === 'bear') bearCount += 1;
    else if (sample.zone === 'weak') weakCount += 1;
    if (isFiniteNumber(sample.diMinus)) diMinusFinal = sample.diMinus;
  }
  return {
    series,
    period,
    threshold,
    diMinus,
    samples,
    diMinusFinal,
    strongCount,
    bearCount,
    weakCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineAdxDiMinusLayoutOptions
  extends ChartLineAdxDiMinusOptions {
  data: readonly ChartLineAdxDiMinusPoint[] | null | undefined;
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
export function computeLineAdxDiMinusLayout(
  options: ChartLineAdxDiMinusLayoutOptions,
): ChartLineAdxDiMinusLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ADX_DI_MINUS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ADX_DI_MINUS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ADX_DI_MINUS_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_ADX_DI_MINUS_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_ADX_DI_MINUS_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineAdxDiMinus(options.data, {
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
  const diMinusPanelTop = pricePanelBottom + gap;
  const diMinusPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    diMinusPanelBottom - diMinusPanelTop > 0;
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

  const diMinusMin = 0;
  const diMinusMax = 105;
  const diMinusPanelHeight = diMinusPanelBottom - diMinusPanelTop;
  const diMinusYAt = (value: number): number =>
    diMinusPanelBottom -
    ((value - diMinusMin) / (diMinusMax - diMinusMin)) * diMinusPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineAdxDiMinusDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const diMinusLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAdxDiMinusMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.diMinus)) return;
    const cx = xAt(index);
    const cy = diMinusYAt(sample.diMinus);
    diMinusLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      diMinus: sample.diMinus,
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
    diMinusPanelTop,
    diMinusPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    diMinusPath: buildLinePath(diMinusLinePoints),
    markers,
    thresholdY: diMinusYAt(run.threshold),
    strongY: diMinusYAt(Math.min(100, run.threshold * 2)),
    zeroY: diMinusYAt(0),
    priceMin,
    priceMax,
    diMinusMin,
    diMinusMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAdxDiMinusChart(
  data: readonly ChartLineAdxDiMinusPoint[] | null | undefined,
  options: ChartLineAdxDiMinusOptions = {},
): string {
  const run = runLineAdxDiMinus(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.diMinusFinal === null ? 'n/a' : run.diMinusFinal.toFixed(3);
  return (
    `Two-panel chart with a Wilder -DI directional indicator panel ` +
    `(period ${run.period}, threshold ${run.threshold}): the top ` +
    `panel plots the close, the bottom panel plots the -DI as 100 ` +
    `* SMA(minusDM) / SMA(TR), where minusDM is the negative ` +
    `directional movement (prevLow - low when greater than the ` +
    `mirrored upMove and positive) and TR is the Wilder true ` +
    `range. A constant series leaves the bar null (TR = 0). A ` +
    `pure falling trend with high == low == close reads -DI = 100 ` +
    `bit-exact; a pure rising trend reads 0. Across ${total} ` +
    `bars the -DI reads strong ` +
    `(>= ${Math.min(100, run.threshold * 2)}) on ${run.strongCount}, ` +
    `bear (>= ${run.threshold}) on ${run.bearCount}, and weak on ` +
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
  zone: ChartLineAdxDiMinusZone,
  strongColor: string,
  bearColor: string,
  weakColor: string,
  noneColor: string,
): string {
  if (zone === 'strong') return strongColor;
  if (zone === 'bear') return bearColor;
  if (zone === 'weak') return weakColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineAdxDiMinusZone): string {
  if (zone === 'strong') return 'Strong';
  if (zone === 'bear') return 'Bear';
  if (zone === 'weak') return 'Weak';
  return 'n/a';
}

/**
 * ChartLineAdxDiMinus -- two-panel pure-SVG Wilder -DI directional
 * indicator chart.
 */
export const ChartLineAdxDiMinus = forwardRef<
  HTMLDivElement,
  ChartLineAdxDiMinusProps
>(function ChartLineAdxDiMinus(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_ADX_DI_MINUS_PERIOD,
    threshold = DEFAULT_CHART_LINE_ADX_DI_MINUS_THRESHOLD,
    width = DEFAULT_CHART_LINE_ADX_DI_MINUS_WIDTH,
    height = DEFAULT_CHART_LINE_ADX_DI_MINUS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADX_DI_MINUS_PADDING,
    gap = DEFAULT_CHART_LINE_ADX_DI_MINUS_GAP,
    tickCount = DEFAULT_CHART_LINE_ADX_DI_MINUS_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_ADX_DI_MINUS_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_ADX_DI_MINUS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADX_DI_MINUS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADX_DI_MINUS_PRICE_COLOR,
    diMinusColor = DEFAULT_CHART_LINE_ADX_DI_MINUS_DI_MINUS_COLOR,
    strongColor = DEFAULT_CHART_LINE_ADX_DI_MINUS_STRONG_COLOR,
    bearColor = DEFAULT_CHART_LINE_ADX_DI_MINUS_BEAR_COLOR,
    weakColor = DEFAULT_CHART_LINE_ADX_DI_MINUS_WEAK_COLOR,
    noneColor = DEFAULT_CHART_LINE_ADX_DI_MINUS_NONE_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_ADX_DI_MINUS_THRESHOLD_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADX_DI_MINUS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADX_DI_MINUS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showDiMinus = true,
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
  const baseId = `chart-line-adx-di-minus-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAdxDiMinusSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAdxDiMinusSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAdxDiMinusLayout({
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
    ariaDescription ?? describeLineAdxDiMinusChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `-DI directional indicator chart, period ${run.period}, threshold ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAdxDiMinusSeriesId): void => {
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
      <g data-section="chart-line-adx-di-minus-tooltip" pointerEvents="none">
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
          data-section="chart-line-adx-di-minus-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-adx-di-minus-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-adx-di-minus-tooltip-di-minus"
          x={tx + 10}
          y={ty + 51}
          fill="#fca5a5"
          fontSize={11}
          fontWeight={600}
        >
          {`-DI: ${
            hoverSample.diMinus === null
              ? 'n/a'
              : hoverSample.diMinus.toFixed(3)
          }`}
        </text>
        <text
          data-section="chart-line-adx-di-minus-tooltip-zone"
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
  const diMinusHidden = isHidden('diMinus') || !showDiMinus;

  const legendItems: Array<{
    id: ChartLineAdxDiMinusSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'diMinus', label: '-DI', color: diMinusColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-adx-di-minus"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-di-minus-final={run.diMinusFinal === null ? '' : run.diMinusFinal}
      data-strong-count={run.strongCount}
      data-bear-count={run.bearCount}
      data-weak-count={run.weakCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-adx-di-minus-aria-desc"
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
          data-section="chart-line-adx-di-minus-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-adx-di-minus-empty"
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
          data-section="chart-line-adx-di-minus-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-adx-di-minus-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-adx-di-minus-grid-line"
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
                  layout.diMinusPanelBottom -
                  t * (layout.diMinusPanelBottom - layout.diMinusPanelTop);
                return (
                  <line
                    key={`dg-${i}`}
                    data-section="chart-line-adx-di-minus-grid-line"
                    data-panel="diMinus"
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
            <g data-section="chart-line-adx-di-minus-axes">
              <line
                data-section="chart-line-adx-di-minus-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adx-di-minus-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adx-di-minus-axis"
                data-panel="diMinus"
                x1={layout.innerLeft}
                y1={layout.diMinusPanelTop}
                x2={layout.innerLeft}
                y2={layout.diMinusPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adx-di-minus-axis"
                data-panel="diMinus"
                x1={layout.innerLeft}
                y1={layout.diMinusPanelBottom}
                x2={layout.innerRight}
                y2={layout.diMinusPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-adx-di-minus-panel-label"
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
            data-section="chart-line-adx-di-minus-panel-label"
            data-panel="diMinus"
            x={layout.innerRight}
            y={layout.diMinusPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            -DI
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-adx-di-minus-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={axisColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-adx-di-minus-threshold-lines">
              <line
                data-section="chart-line-adx-di-minus-threshold-line"
                data-direction="bear"
                x1={layout.innerLeft}
                y1={layout.thresholdY}
                x2={layout.innerRight}
                y2={layout.thresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <line
                data-section="chart-line-adx-di-minus-threshold-line"
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
              data-section="chart-line-adx-di-minus-price-path"
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
            <g data-section="chart-line-adx-di-minus-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-adx-di-minus-dot"
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

          {!diMinusHidden ? (
            <path
              data-section="chart-line-adx-di-minus-line"
              d={layout.diMinusPath}
              fill="none"
              stroke={diMinusColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`-DI line, ${layout.markers.length} points`}
            />
          ) : null}

          {!diMinusHidden && showMarkers ? (
            <g data-section="chart-line-adx-di-minus-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-adx-di-minus-marker"
                  data-zone={marker.zone}
                  data-di-minus={marker.diMinus}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    strongColor,
                    bearColor,
                    weakColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, -DI ${formatValue(
                    marker.diMinus,
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
            <g data-section="chart-line-adx-di-minus-badge">
              <rect
                data-section="chart-line-adx-di-minus-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={120}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-adx-di-minus-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`-DI ${run.period} thr ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-adx-di-minus-legend"
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
                data-section="chart-line-adx-di-minus-legend-item"
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
                  data-section="chart-line-adx-di-minus-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-adx-di-minus-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-adx-di-minus-legend-stats"
            style={{ color: axisColor }}
          >
            {`strong ${run.strongCount} / bear ${run.bearCount} / weak ${run.weakCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAdxDiMinus.displayName = 'ChartLineAdxDiMinus';
