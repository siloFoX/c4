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
 * ChartLineSmi -- pure-SVG two-panel Stochastic Momentum Index chart.
 *
 * The Stochastic Momentum Index (William Blau) refines the stochastic
 * oscillator by measuring the close against the MIDPOINT of the recent
 * high-low range rather than its low, and double-smoothing the result.
 * For each bar: D = close - (highestHigh + lowestLow) / 2 over the
 * lookback window; D and the range highestHigh - lowestLow are each
 * smoothed by two successive EMAs; the SMI is
 * `100 * emaD2 / (emaR2 / 2)`. It oscillates around zero in roughly
 * [-100, 100] -- positive when the close sits above the range midpoint.
 *
 * The top panel plots the price; the bottom panel plots the SMI with a
 * zero line and dashed overbought / oversold threshold lines.
 */

export interface ChartLineSmiPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineSmiZone = 'overbought' | 'oversold' | 'neutral' | 'none';

export type ChartLineSmiSeriesId = 'price' | 'smi';

export interface ChartLineSmiSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  smi: number | null;
  zone: ChartLineSmiZone;
}

export interface ChartLineSmiRun {
  series: ChartLineSmiPoint[];
  qPeriod: number;
  smoothPeriod1: number;
  smoothPeriod2: number;
  upperThreshold: number;
  lowerThreshold: number;
  d: (number | null)[];
  rangeHL: (number | null)[];
  smi: (number | null)[];
  samples: ChartLineSmiSample[];
  smiFinal: number | null;
  overboughtCount: number;
  oversoldCount: number;
  neutralCount: number;
  ok: boolean;
}

export interface ChartLineSmiMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  smi: number;
  zone: ChartLineSmiZone;
}

export interface ChartLineSmiDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSmiLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  smiPanelTop: number;
  smiPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineSmiDot[];
  smiPath: string;
  markers: ChartLineSmiMarker[];
  zeroY: number;
  upperY: number;
  lowerY: number;
  priceMin: number;
  priceMax: number;
  smiMin: number;
  smiMax: number;
  run: ChartLineSmiRun;
}

export interface ChartLineSmiProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSmiPoint[];
  qPeriod?: number;
  smoothPeriod1?: number;
  smoothPeriod2?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  gap?: number;
  tickCount?: number;
  pricePanelRatio?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  smiColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  neutralColor?: string;
  zeroColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSmi?: boolean;
  showZeroLine?: boolean;
  showThresholds?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSmiSeriesId[];
  defaultHiddenSeries?: ChartLineSmiSeriesId[];
  onSeriesToggle?: (detail: { seriesId: ChartLineSmiSeriesId; hidden: boolean }) => void;
  onPointClick?: (detail: { point: ChartLineSmiSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SMI_WIDTH = 720;
export const DEFAULT_CHART_LINE_SMI_HEIGHT = 400;
export const DEFAULT_CHART_LINE_SMI_PADDING = 44;
export const DEFAULT_CHART_LINE_SMI_GAP = 12;
export const DEFAULT_CHART_LINE_SMI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SMI_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SMI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SMI_Q_PERIOD = 10;
export const DEFAULT_CHART_LINE_SMI_SMOOTH_PERIOD_1 = 3;
export const DEFAULT_CHART_LINE_SMI_SMOOTH_PERIOD_2 = 3;
export const DEFAULT_CHART_LINE_SMI_UPPER_THRESHOLD = 40;
export const DEFAULT_CHART_LINE_SMI_LOWER_THRESHOLD = -40;
export const DEFAULT_CHART_LINE_SMI_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_SMI_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SMI_SMI_COLOR = '#0d9488';
export const DEFAULT_CHART_LINE_SMI_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SMI_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SMI_NEUTRAL_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_SMI_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SMI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SMI_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only bars whose x, high, low and close are all finite. */
export function getLineSmiFinitePoints(
  data: readonly ChartLineSmiPoint[] | null | undefined,
): ChartLineSmiPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSmiPoint[] = [];
  for (const bar of data) {
    if (!bar) continue;
    if (
      isFiniteNumber(bar.x) &&
      isFiniteNumber(bar.high) &&
      isFiniteNumber(bar.low) &&
      isFiniteNumber(bar.close)
    ) {
      out.push({ x: bar.x, high: bar.high, low: bar.low, close: bar.close });
    }
  }
  return out;
}

/** Coerce a period to an integer >= 1, else the fallback. */
export function normalizeLineSmiPeriod(period: unknown, fallback: number): number {
  if (!isFiniteNumber(period)) return fallback;
  const floored = Math.floor(period);
  if (floored < 1) return fallback;
  return floored;
}

/**
 * Exponential moving average seeded from the first finite value. A
 * non-finite slot carries the previous EMA forward (null until the first
 * finite value).
 */
export function computeLineSmiEma(
  values: readonly (number | null | undefined)[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const p = normalizeLineSmiPeriod(period, 1);
  const alpha = 2 / (p + 1);
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

export interface ChartLineSmiRaw {
  d: (number | null)[];
  rangeHL: (number | null)[];
}

/**
 * The raw Stochastic Momentum Index parts: per bar, the distance D from
 * the close to the midpoint of the trailing high-low range, and the range
 * highestHigh - lowestLow itself.
 */
export function computeLineSmiRaw(
  bars: readonly ChartLineSmiPoint[] | null | undefined,
  qPeriod: number,
): ChartLineSmiRaw {
  if (!Array.isArray(bars)) return { d: [], rangeHL: [] };
  const q = normalizeLineSmiPeriod(qPeriod, 1);
  const d: (number | null)[] = [];
  const rangeHL: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i + 1 < q) {
      d.push(null);
      rangeHL.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    let ok = true;
    for (let k = i - q + 1; k <= i; k += 1) {
      const bar = bars[k];
      if (!bar || !isFiniteNumber(bar.high) || !isFiniteNumber(bar.low)) {
        ok = false;
        break;
      }
      if (bar.high > hh) hh = bar.high;
      if (bar.low < ll) ll = bar.low;
    }
    const cur = bars[i];
    if (!ok || !cur || !isFiniteNumber(cur.close)) {
      d.push(null);
      rangeHL.push(null);
      continue;
    }
    d.push(cur.close - (hh + ll) / 2);
    rangeHL.push(hh - ll);
  }
  return { d, rangeHL };
}

/**
 * Stochastic Momentum Index: the raw distance D and the high-low range are
 * each double-smoothed by two EMAs, then `SMI = 100 * emaD2 / (emaR2 / 2)`.
 * A zero double-smoothed range yields null.
 */
export function computeLineSmi(
  bars: readonly ChartLineSmiPoint[] | null | undefined,
  qPeriod: number,
  smoothPeriod1: number,
  smoothPeriod2: number,
): (number | null)[] {
  if (!Array.isArray(bars)) return [];
  const { d, rangeHL } = computeLineSmiRaw(bars, qPeriod);
  const emaD1 = computeLineSmiEma(d, smoothPeriod1);
  const emaD2 = computeLineSmiEma(emaD1, smoothPeriod2);
  const emaR1 = computeLineSmiEma(rangeHL, smoothPeriod1);
  const emaR2 = computeLineSmiEma(emaR1, smoothPeriod2);
  const out: (number | null)[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    const num = emaD2[i];
    const den = emaR2[i];
    if (isFiniteNumber(num) && isFiniteNumber(den) && den > 0) {
      out.push((100 * num) / (den / 2));
    } else {
      out.push(null);
    }
  }
  return out;
}

/** Classify a bar by the SMI against the thresholds. */
export function classifyLineSmiZone(
  smi: number | null,
  upperThreshold: number,
  lowerThreshold: number,
): ChartLineSmiZone {
  if (!isFiniteNumber(smi)) return 'none';
  if (smi > upperThreshold) return 'overbought';
  if (smi < lowerThreshold) return 'oversold';
  return 'neutral';
}

export interface ChartLineSmiOptions {
  qPeriod?: number;
  smoothPeriod1?: number;
  smoothPeriod2?: number;
  upperThreshold?: number;
  lowerThreshold?: number;
}

/** Run the full Stochastic Momentum Index pipeline over a set of bars. */
export function runLineSmi(
  data: readonly ChartLineSmiPoint[] | null | undefined,
  options: ChartLineSmiOptions = {},
): ChartLineSmiRun {
  const series = getLineSmiFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const qPeriod = normalizeLineSmiPeriod(
    options.qPeriod,
    DEFAULT_CHART_LINE_SMI_Q_PERIOD,
  );
  const smoothPeriod1 = normalizeLineSmiPeriod(
    options.smoothPeriod1,
    DEFAULT_CHART_LINE_SMI_SMOOTH_PERIOD_1,
  );
  const smoothPeriod2 = normalizeLineSmiPeriod(
    options.smoothPeriod2,
    DEFAULT_CHART_LINE_SMI_SMOOTH_PERIOD_2,
  );
  const upperThreshold =
    isFiniteNumber(options.upperThreshold) &&
    options.upperThreshold > 0 &&
    options.upperThreshold < 100
      ? options.upperThreshold
      : DEFAULT_CHART_LINE_SMI_UPPER_THRESHOLD;
  const lowerThreshold =
    isFiniteNumber(options.lowerThreshold) &&
    options.lowerThreshold < 0 &&
    options.lowerThreshold > -100
      ? options.lowerThreshold
      : DEFAULT_CHART_LINE_SMI_LOWER_THRESHOLD;

  const { d, rangeHL } = computeLineSmiRaw(series, qPeriod);
  const smi = computeLineSmi(series, qPeriod, smoothPeriod1, smoothPeriod2);

  const samples: ChartLineSmiSample[] = series.map((bar, index) => {
    const smiValue = smi[index] ?? null;
    return {
      index,
      x: bar.x,
      high: bar.high,
      low: bar.low,
      close: bar.close,
      smi: smiValue,
      zone: classifyLineSmiZone(smiValue, upperThreshold, lowerThreshold),
    };
  });

  let overboughtCount = 0;
  let oversoldCount = 0;
  let neutralCount = 0;
  let smiFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    if (isFiniteNumber(sample.smi)) smiFinal = sample.smi;
  }

  return {
    series = [],
    qPeriod,
    smoothPeriod1,
    smoothPeriod2,
    upperThreshold,
    lowerThreshold,
    d,
    rangeHL,
    smi,
    samples,
    smiFinal,
    overboughtCount,
    oversoldCount,
    neutralCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineSmiLayoutOptions extends ChartLineSmiOptions {
  data: readonly ChartLineSmiPoint[] | null | undefined;
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
export function computeLineSmiLayout(
  options: ChartLineSmiLayoutOptions,
): ChartLineSmiLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_SMI_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_SMI_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_SMI_PADDING;
  const gap = isFiniteNumber(options.gap) ? options.gap : DEFAULT_CHART_LINE_SMI_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_SMI_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineSmi(options.data, {
    ...(options.qPeriod !== undefined ? { qPeriod: options.qPeriod } : {}),
    ...(options.smoothPeriod1 !== undefined
      ? { smoothPeriod1: options.smoothPeriod1 }
      : {}),
    ...(options.smoothPeriod2 !== undefined
      ? { smoothPeriod2: options.smoothPeriod2 }
      : {}),
    ...(options.upperThreshold !== undefined
      ? { upperThreshold: options.upperThreshold }
      : {}),
    ...(options.lowerThreshold !== undefined
      ? { lowerThreshold: options.lowerThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerHeight = innerBottom - innerTop;

  const pricePanelTop = innerTop;
  const pricePanelHeight = Math.max(0, innerHeight * ratio - gap / 2);
  const pricePanelBottom = pricePanelTop + pricePanelHeight;
  const smiPanelTop = pricePanelBottom + gap;
  const smiPanelBottom = innerBottom;

  const innerWidth = innerRight - innerLeft;
  const okGeom =
    innerWidth > 0 && pricePanelHeight > 0 && smiPanelBottom - smiPanelTop > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const bar of run.series) {
    if (bar.close < priceMin) priceMin = bar.close;
    if (bar.close > priceMax) priceMax = bar.close;
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

  let smiMin = Math.min(0, run.lowerThreshold);
  let smiMax = Math.max(0, run.upperThreshold);
  for (const value of run.smi) {
    if (!isFiniteNumber(value)) continue;
    if (value < smiMin) smiMin = value;
    if (value > smiMax) smiMax = value;
  }
  if (smiMin === smiMax) {
    smiMin -= 1;
    smiMax += 1;
  }
  const smiPanelHeight = smiPanelBottom - smiPanelTop;
  const smiYAt = (value: number): number =>
    smiPanelBottom - ((value - smiMin) / (smiMax - smiMin)) * smiPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineSmiDot[] = [];
  run.series.forEach((bar, index) => {
    const cx = xAt(index);
    const cy = priceYAt(bar.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: bar.x, cx, cy, close: bar.close });
  });

  const smiLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineSmiMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.smi)) return;
    const cx = xAt(index);
    const cy = smiYAt(sample.smi);
    smiLinePoints.push({ x: cx, y: cy });
    markers.push({ index, x: sample.x, cx, cy, smi: sample.smi, zone: sample.zone });
  });

  return {
    ok,
    width,
    height,
    padding,
    gap,
    pricePanelTop,
    pricePanelBottom,
    smiPanelTop,
    smiPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    smiPath: buildLinePath(smiLinePoints),
    markers,
    zeroY: smiYAt(0),
    upperY: smiYAt(run.upperThreshold),
    lowerY: smiYAt(run.lowerThreshold),
    priceMin,
    priceMax,
    smiMin,
    smiMax,
    run,
  };
}

/** Build a screen-reader description of the chart. */
export function describeLineSmiChart(
  data: readonly ChartLineSmiPoint[] | null | undefined,
  options: ChartLineSmiOptions = {},
): string {
  const run = runLineSmi(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.smiFinal === null ? 'n/a' : run.smiFinal.toFixed(2);
  return (
    `Two-panel chart with the Stochastic Momentum Index (lookback ` +
    `${run.qPeriod}, smoothing ${run.smoothPeriod1}/${run.smoothPeriod2}): ` +
    `the top panel plots the price, the bottom panel plots the SMI. The SMI ` +
    `is the double-smoothed distance from the close to the midpoint of the ` +
    `recent high-low range, divided by the double-smoothed range -- it runs ` +
    `around zero, positive when the close leads the range midpoint. Across ` +
    `${total} bars it is overbought on ${run.overboughtCount}, oversold on ` +
    `${run.oversoldCount} and neutral on ${run.neutralCount}. The final ` +
    `reading is ${finalText}.`
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
  zone: ChartLineSmiZone,
  overboughtColor: string,
  oversoldColor: string,
  neutralColor: string,
): string {
  if (zone === 'overbought') return overboughtColor;
  if (zone === 'oversold') return oversoldColor;
  return neutralColor;
}

function zoneLabelOf(zone: ChartLineSmiZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'neutral') return 'Neutral';
  return 'n/a';
}

/**
 * ChartLineSmi -- two-panel pure-SVG Stochastic Momentum Index chart.
 */
export const ChartLineSmi = forwardRef<HTMLDivElement, ChartLineSmiProps>(
  function ChartLineSmi(props, ref) {
    const {
      data,
      qPeriod = DEFAULT_CHART_LINE_SMI_Q_PERIOD,
      smoothPeriod1 = DEFAULT_CHART_LINE_SMI_SMOOTH_PERIOD_1,
      smoothPeriod2 = DEFAULT_CHART_LINE_SMI_SMOOTH_PERIOD_2,
      upperThreshold = DEFAULT_CHART_LINE_SMI_UPPER_THRESHOLD,
      lowerThreshold = DEFAULT_CHART_LINE_SMI_LOWER_THRESHOLD,
      width = DEFAULT_CHART_LINE_SMI_WIDTH,
      height = DEFAULT_CHART_LINE_SMI_HEIGHT,
      padding = DEFAULT_CHART_LINE_SMI_PADDING,
      gap = DEFAULT_CHART_LINE_SMI_GAP,
      tickCount = DEFAULT_CHART_LINE_SMI_TICK_COUNT,
      pricePanelRatio = DEFAULT_CHART_LINE_SMI_PRICE_PANEL_RATIO,
      strokeWidth = DEFAULT_CHART_LINE_SMI_STROKE_WIDTH,
      dotRadius = DEFAULT_CHART_LINE_SMI_DOT_RADIUS,
      priceColor = DEFAULT_CHART_LINE_SMI_PRICE_COLOR,
      smiColor = DEFAULT_CHART_LINE_SMI_SMI_COLOR,
      overboughtColor = DEFAULT_CHART_LINE_SMI_OVERBOUGHT_COLOR,
      oversoldColor = DEFAULT_CHART_LINE_SMI_OVERSOLD_COLOR,
      neutralColor = DEFAULT_CHART_LINE_SMI_NEUTRAL_COLOR,
      zeroColor = DEFAULT_CHART_LINE_SMI_ZERO_COLOR,
      gridColor = DEFAULT_CHART_LINE_SMI_GRID_COLOR,
      axisColor = DEFAULT_CHART_LINE_SMI_AXIS_COLOR,
      showAxis = true,
      showGrid = true,
      showDots = false,
      showSmi = true,
      showZeroLine = true,
      showThresholds = true,
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
    const baseId = `chart-line-smi-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const descId = `${baseId}-desc`;

    const [hover, setHover] = useState<number | null>(null);
    const [internalHidden, setInternalHidden] = useState<ChartLineSmiSeriesId[]>(
      defaultHiddenSeries ?? [],
    );
    const hiddenList = hiddenSeries ?? internalHidden;
    const isHidden = (id: ChartLineSmiSeriesId): boolean => hiddenList.includes(id);

    const layout = useMemo(
      () =>
        computeLineSmiLayout({
          data,
          qPeriod,
          smoothPeriod1,
          smoothPeriod2,
          upperThreshold,
          lowerThreshold,
          width,
          height,
          padding,
          gap,
          pricePanelRatio,
        }),
      [
        data,
        qPeriod,
        smoothPeriod1,
        smoothPeriod2,
        upperThreshold,
        lowerThreshold,
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
      describeLineSmiChart(data, {
        qPeriod,
        smoothPeriod1,
        smoothPeriod2,
        upperThreshold,
        lowerThreshold,
      });
    const resolvedLabel =
      ariaLabel ??
      `Stochastic Momentum Index chart, lookback ${run.qPeriod}, smoothing ${run.smoothPeriod1}/${run.smoothPeriod2}`;

    const isEmpty = !layout.ok;

    const toggleSeries = (id: ChartLineSmiSeriesId): void => {
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
      const tooltipW = 168;
      const rawX = anchorX + 12;
      const tx = Math.min(rawX, layout.width - tooltipW - 4);
      const ty = layout.pricePanelTop + 6;
      tooltip = (
        <g data-section="chart-line-smi-tooltip" pointerEvents="none">
          <rect
            x={tx}
            y={ty}
            width={tooltipW}
            height={112}
            rx={6}
            fill="#0f172a"
            opacity={0.92}
          />
          <text
            data-section="chart-line-smi-tooltip-x"
            x={tx + 10}
            y={ty + 19}
            fill="#f8fafc"
            fontSize={11}
            fontWeight={600}
          >
            {formatX(hoverSample.x)}
          </text>
          <text
            data-section="chart-line-smi-tooltip-high"
            x={tx + 10}
            y={ty + 35}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`High: ${formatValue(hoverSample.high)}`}
          </text>
          <text
            data-section="chart-line-smi-tooltip-low"
            x={tx + 10}
            y={ty + 51}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Low: ${formatValue(hoverSample.low)}`}
          </text>
          <text
            data-section="chart-line-smi-tooltip-close"
            x={tx + 10}
            y={ty + 67}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Close: ${formatValue(hoverSample.close)}`}
          </text>
          <text
            data-section="chart-line-smi-tooltip-smi"
            x={tx + 10}
            y={ty + 83}
            fill="#5eead4"
            fontSize={11}
            fontWeight={600}
          >
            {`SMI: ${
              hoverSample.smi === null ? 'n/a' : formatValue(hoverSample.smi)
            }`}
          </text>
          <text
            data-section="chart-line-smi-tooltip-zone"
            x={tx + 10}
            y={ty + 99}
            fill="#cbd5e1"
            fontSize={11}
          >
            {`Zone: ${zoneLabelOf(hoverSample.zone)}`}
          </text>
        </g>
      );
    }

    const priceHidden = isHidden('price');
    const smiHidden = isHidden('smi') || !showSmi;

    const legendItems: Array<{
      id: ChartLineSmiSeriesId;
      label: string;
      color: string;
    }> = [
      { id: 'price', label: 'Price', color: priceColor },
      { id: 'smi', label: 'SMI', color: smiColor },
    ];

    return (
      <div
        ref={ref}
        className={className}
        style={containerStyle}
        data-section="chart-line-smi"
        data-empty={isEmpty ? 'true' : 'false'}
        data-q-period={run.qPeriod}
        data-smooth-period1={run.smoothPeriod1}
        data-smooth-period2={run.smoothPeriod2}
        data-upper-threshold={run.upperThreshold}
        data-lower-threshold={run.lowerThreshold}
        data-smi-final={run.smiFinal === null ? '' : run.smiFinal}
        data-overbought-count={run.overboughtCount}
        data-oversold-count={run.oversoldCount}
        data-neutral-count={run.neutralCount}
        data-total-points={run.series.length}
        data-animate={animate ? 'true' : 'false'}
        role="region"
        aria-label={resolvedLabel}
        aria-describedby={descId}
      >
        <span
          id={descId}
          data-section="chart-line-smi-aria-desc"
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
            data-section="chart-line-smi-svg"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            <text
              data-section="chart-line-smi-empty"
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
            data-section="chart-line-smi-svg"
            className={animate ? 'motion-safe:animate-fade-in' : undefined}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={resolvedLabel}
            {...svgProps}
          >
            {showGrid ? (
              <g data-section="chart-line-smi-grid">
                {tickValues.map((t, i) => {
                  const py =
                    layout.pricePanelBottom -
                    t * (layout.pricePanelBottom - layout.pricePanelTop);
                  return (
                    <line
                      key={`pg-${i}`}
                      data-section="chart-line-smi-grid-line"
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
                  const sy =
                    layout.smiPanelBottom -
                    t * (layout.smiPanelBottom - layout.smiPanelTop);
                  return (
                    <line
                      key={`sg-${i}`}
                      data-section="chart-line-smi-grid-line"
                      data-panel="smi"
                      x1={layout.innerLeft}
                      y1={sy}
                      x2={layout.innerRight}
                      y2={sy}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  );
                })}
              </g>
            ) : null}

            {showAxis ? (
              <g data-section="chart-line-smi-axes">
                <line
                  data-section="chart-line-smi-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelTop}
                  x2={layout.innerLeft}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-smi-axis"
                  data-panel="price"
                  x1={layout.innerLeft}
                  y1={layout.pricePanelBottom}
                  x2={layout.innerRight}
                  y2={layout.pricePanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-smi-axis"
                  data-panel="smi"
                  x1={layout.innerLeft}
                  y1={layout.smiPanelTop}
                  x2={layout.innerLeft}
                  y2={layout.smiPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <line
                  data-section="chart-line-smi-axis"
                  data-panel="smi"
                  x1={layout.innerLeft}
                  y1={layout.smiPanelBottom}
                  x2={layout.innerRight}
                  y2={layout.smiPanelBottom}
                  stroke={axisColor}
                  strokeWidth={1}
                />
                <text
                  data-section="chart-line-smi-tick-label"
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
                  data-section="chart-line-smi-tick-label"
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
                  data-section="chart-line-smi-tick-label"
                  data-panel="smi"
                  x={layout.innerLeft - 6}
                  y={layout.smiPanelTop + 4}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.smiMax)}
                </text>
                <text
                  data-section="chart-line-smi-tick-label"
                  data-panel="smi"
                  x={layout.innerLeft - 6}
                  y={layout.smiPanelBottom}
                  textAnchor="end"
                  fill={axisColor}
                  fontSize={10}
                >
                  {formatValue(layout.smiMin)}
                </text>
              </g>
            ) : null}

            <text
              data-section="chart-line-smi-panel-label"
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
              data-section="chart-line-smi-panel-label"
              data-panel="smi"
              x={layout.innerRight}
              y={layout.smiPanelTop + 4}
              textAnchor="end"
              fill={axisColor}
              fontSize={10}
              fontWeight={600}
            >
              Stochastic Momentum Index
            </text>

            {showZeroLine ? (
              <line
                data-section="chart-line-smi-zero-line"
                x1={layout.innerLeft}
                y1={layout.zeroY}
                x2={layout.innerRight}
                y2={layout.zeroY}
                stroke={zeroColor}
                strokeWidth={1}
              />
            ) : null}

            {showThresholds ? (
              <g data-section="chart-line-smi-thresholds">
                <line
                  data-section="chart-line-smi-threshold-line"
                  data-level="upper"
                  x1={layout.innerLeft}
                  y1={layout.upperY}
                  x2={layout.innerRight}
                  y2={layout.upperY}
                  stroke={overboughtColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <line
                  data-section="chart-line-smi-threshold-line"
                  data-level="lower"
                  x1={layout.innerLeft}
                  y1={layout.lowerY}
                  x2={layout.innerRight}
                  y2={layout.lowerY}
                  stroke={oversoldColor}
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
              </g>
            ) : null}

            {!priceHidden ? (
              <path
                data-section="chart-line-smi-price-path"
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
              <g data-section="chart-line-smi-dots">
                {layout.priceDots.map((dot) => (
                  <circle
                    key={`dot-${dot.index}`}
                    data-section="chart-line-smi-dot"
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

            {!smiHidden ? (
              <path
                data-section="chart-line-smi-smi-line"
                d={layout.smiPath}
                fill="none"
                stroke={smiColor}
                strokeWidth={strokeWidth}
                strokeLinejoin="round"
                strokeLinecap="round"
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Stochastic Momentum Index line, ${layout.markers.length} points`}
              />
            ) : null}

            {!smiHidden && showMarkers ? (
              <g data-section="chart-line-smi-markers">
                {layout.markers.map((marker) => (
                  <circle
                    key={`marker-${marker.index}`}
                    data-section="chart-line-smi-marker"
                    data-zone={marker.zone}
                    data-smi={marker.smi}
                    cx={marker.cx}
                    cy={marker.cy}
                    r={dotRadius + 0.5}
                    fill={zoneColorOf(
                      marker.zone,
                      overboughtColor,
                      oversoldColor,
                      neutralColor,
                    )}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Bar ${formatX(marker.x)}, SMI ${formatValue(
                      marker.smi,
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
              <g data-section="chart-line-smi-badge">
                <rect
                  data-section="chart-line-smi-badge-icon"
                  x={layout.innerLeft + 4}
                  y={layout.pricePanelTop + 4}
                  width={92}
                  height={18}
                  rx={4}
                  fill="#1e293b"
                  opacity={0.85}
                />
                <text
                  data-section="chart-line-smi-badge-config"
                  x={layout.innerLeft + 10}
                  y={layout.pricePanelTop + 16}
                  fill="#e2e8f0"
                  fontSize={10}
                  fontWeight={600}
                >
                  {`SMI ${run.qPeriod}/${run.smoothPeriod1}/${run.smoothPeriod2}`}
                </text>
              </g>
            ) : null}

            {tooltip}
          </svg>
        )}

        {showLegend && !isEmpty ? (
          <div
            data-section="chart-line-smi-legend"
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
                  data-section="chart-line-smi-legend-item"
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
                    data-section="chart-line-smi-legend-swatch"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: item.color,
                      display: 'inline-block',
                    }}
                  />
                  <span data-section="chart-line-smi-legend-label">
                    {item.label}
                  </span>
                </button>
              );
            })}
            <span
              data-section="chart-line-smi-legend-stats"
              style={{ color: axisColor }}
            >
              {`overbought ${run.overboughtCount} / oversold ${run.oversoldCount} / neutral ${run.neutralCount}`}
            </span>
          </div>
        ) : null}
      </div>
    );
  },
);

ChartLineSmi.displayName = 'ChartLineSmi';
