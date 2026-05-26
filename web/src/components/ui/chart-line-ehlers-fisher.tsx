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
 * ChartLineEhlersFisher -- pure-SVG two-panel Ehlers Fisher
 * Transform chart.
 *
 * The Fisher Transform (John Ehlers) maps the normalised price into a
 * Gaussian-shaped distribution by passing it through the inverse
 * hyperbolic tangent (`atanh`, expressed as `0.5 * ln((1 + v) / (1 -
 * v))`). The output is sharply peaked near the tails (close to +/-1)
 * and almost linear near zero, which makes turning points stand out.
 *
 * For each bar `i` with a filled lookback `period`:
 *
 *   hl2  = (high + low) / 2
 *   HH   = max(hl2 over [i-period+1 .. i])
 *   LL   = min(hl2 over [i-period+1 .. i])
 *   ratio = HH == LL ? 0 : (hl2 - LL) / (HH - LL) - 0.5
 *   v[i] = 0.66 * ratio + 0.67 * v[i-1]      (priorNorm = 0 at warm-up)
 *   v[i] = clamp(v[i], -0.999, +0.999)
 *   fisher[i] = 0.5 * ln((1 + v[i]) / (1 - v[i])) + 0.5 * fisher[i-1]
 *
 * The first `period - 1` bars are null. CONST_FLAT (`high == low ==
 * K`) leaves both `v` and `fisher` at exactly zero (the degenerate
 * branch returns 0 and the recurrence then stays at zero forever).
 *
 * The top panel plots `hl2`; the bottom panel plots the Fisher in a
 * fixed `[-3, +3]` band with a zero line and `+/-threshold`
 * overbought / oversold reference lines.
 */

export interface ChartLineEhlersFisherPoint {
  x: number;
  high: number;
  low: number;
}

export type ChartLineEhlersFisherZone =
  | 'overbought'
  | 'positive'
  | 'negative'
  | 'oversold'
  | 'none';

export type ChartLineEhlersFisherSeriesId = 'price' | 'fisher';

export interface ChartLineEhlersFisherSample {
  index: number;
  x: number;
  high: number;
  low: number;
  hl2: number;
  norm: number | null;
  fisher: number | null;
  zone: ChartLineEhlersFisherZone;
}

export interface ChartLineEhlersFisherRun {
  series: ChartLineEhlersFisherPoint[];
  period: number;
  threshold: number;
  norm: Array<number | null>;
  fisher: Array<number | null>;
  samples: ChartLineEhlersFisherSample[];
  fisherFinal: number | null;
  overboughtCount: number;
  oversoldCount: number;
  positiveCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineEhlersFisherMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  fisher: number;
  zone: ChartLineEhlersFisherZone;
}

export interface ChartLineEhlersFisherDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  hl2: number;
}

export interface ChartLineEhlersFisherLayout {
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
  priceDots: ChartLineEhlersFisherDot[];
  fisherPath: string;
  markers: ChartLineEhlersFisherMarker[];
  zeroY: number;
  upperThresholdY: number;
  lowerThresholdY: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineEhlersFisherRun;
}

export interface ChartLineEhlersFisherProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineEhlersFisherPoint[];
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
  overboughtColor?: string;
  oversoldColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  noneColor?: string;
  zeroColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showFisher?: boolean;
  showZeroLine?: boolean;
  showThresholdLines?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineEhlersFisherSeriesId[];
  defaultHiddenSeries?: ChartLineEhlersFisherSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineEhlersFisherSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineEhlersFisherSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_EHLERS_FISHER_WIDTH = 720;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_HEIGHT = 400;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_PADDING = 44;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_GAP = 12;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_PERIOD = 9;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_THRESHOLD = 1.5;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_EHLERS_FISHER_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_FISHER_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_POSITIVE_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_NEGATIVE_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_EHLERS_FISHER_AXIS_COLOR = '#94a3b8';

/** Clamp constant: the normalised value is held inside (-1, +1). */
export const CHART_LINE_EHLERS_FISHER_CLAMP = 0.999;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `high` / `low` and `high >= low`. */
export function getLineEhlersFisherFinitePoints(
  data: readonly ChartLineEhlersFisherPoint[] | null | undefined,
): ChartLineEhlersFisherPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineEhlersFisherPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      point.high >= point.low
    ) {
      out.push({ x: point.x, high: point.high, low: point.low });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 2. */
export function normalizeLineEhlersFisherPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the +/- threshold to a positive finite. */
export function normalizeLineEhlersFisherThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0) return threshold;
  return fallback;
}

/** Clamp the normalised value to the open interval (-1, +1). */
export function clampLineEhlersFisherNorm(value: number): number {
  if (value > CHART_LINE_EHLERS_FISHER_CLAMP) {
    return CHART_LINE_EHLERS_FISHER_CLAMP;
  }
  if (value < -CHART_LINE_EHLERS_FISHER_CLAMP) {
    return -CHART_LINE_EHLERS_FISHER_CLAMP;
  }
  return value;
}

/**
 * Per-bar `(hl2, hh, ll)` triple over the lookback. Warm-up bars
 * return null on `hh` and `ll`.
 */
export function computeLineEhlersFisherWindow(
  bars: readonly ChartLineEhlersFisherPoint[] | null | undefined,
  period: unknown,
): {
  hl2: number[];
  hh: Array<number | null>;
  ll: Array<number | null>;
} {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { hl2: [], hh: [], ll: [] };
  }
  const p = normalizeLineEhlersFisherPeriod(
    period,
    DEFAULT_CHART_LINE_EHLERS_FISHER_PERIOD,
  );
  const hl2: number[] = [];
  for (const bar of bars) {
    hl2.push((bar.high + bar.low) / 2);
  }
  const hh: Array<number | null> = [];
  const ll: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p - 1) {
      hh.push(null);
      ll.push(null);
      continue;
    }
    let maxV = -Infinity;
    let minV = Infinity;
    for (let j = i - p + 1; j <= i; j += 1) {
      const v = hl2[j]!;
      if (v > maxV) maxV = v;
      if (v < minV) minV = v;
    }
    hh.push(maxV);
    ll.push(minV);
  }
  return { hl2, hh, ll };
}

/**
 * Run the full Ehlers Fisher recurrence. Returns the normalised
 * value `v` and the Fisher reading per bar.
 */
export function computeLineEhlersFisher(
  bars: readonly ChartLineEhlersFisherPoint[] | null | undefined,
  period: unknown,
): {
  norm: Array<number | null>;
  fisher: Array<number | null>;
} {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { norm: [], fisher: [] };
  }
  const p = normalizeLineEhlersFisherPeriod(
    period,
    DEFAULT_CHART_LINE_EHLERS_FISHER_PERIOD,
  );
  const { hl2, hh, ll } = computeLineEhlersFisherWindow(bars, p);
  const norm: Array<number | null> = [];
  const fisher: Array<number | null> = [];
  let priorNorm = 0;
  let priorFisher = 0;
  for (let i = 0; i < bars.length; i += 1) {
    if (i < p - 1) {
      norm.push(null);
      fisher.push(null);
      continue;
    }
    const top = hh[i];
    const bot = ll[i];
    if (!isFiniteNumber(top) || !isFiniteNumber(bot)) {
      norm.push(null);
      fisher.push(null);
      continue;
    }
    const price = hl2[i]!;
    const range = top - bot;
    const ratio = range === 0 ? 0 : (price - bot) / range - 0.5;
    let v = 0.66 * ratio + 0.67 * priorNorm;
    v = clampLineEhlersFisherNorm(v);
    const f = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * priorFisher;
    norm.push(v);
    fisher.push(f);
    priorNorm = v;
    priorFisher = f;
  }
  return { norm, fisher };
}

/** Classify a Fisher reading against the threshold band. */
export function classifyLineEhlersFisherZone(
  value: number | null,
  threshold: number,
): ChartLineEhlersFisherZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'overbought';
  if (value <= -threshold) return 'oversold';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'positive';
}

export interface ChartLineEhlersFisherOptions {
  period?: number;
  threshold?: number;
}

/** Run the full Ehlers Fisher pipeline. */
export function runLineEhlersFisher(
  data: readonly ChartLineEhlersFisherPoint[] | null | undefined,
  options: ChartLineEhlersFisherOptions = {},
): ChartLineEhlersFisherRun {
  const series = getLineEhlersFisherFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineEhlersFisherPeriod(
    options.period,
    DEFAULT_CHART_LINE_EHLERS_FISHER_PERIOD,
  );
  const threshold = normalizeLineEhlersFisherThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_EHLERS_FISHER_THRESHOLD,
  );
  const { norm, fisher } = computeLineEhlersFisher(series, period);
  const samples: ChartLineEhlersFisherSample[] = series.map((point, index) => {
    const fv = fisher[index] ?? null;
    const nv = norm[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      hl2: (point.high + point.low) / 2,
      norm: nv,
      fisher: fv,
      zone: classifyLineEhlersFisherZone(fv, threshold),
    };
  });
  let overboughtCount = 0;
  let oversoldCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let fisherFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    if (isFiniteNumber(sample.fisher)) fisherFinal = sample.fisher;
  }
  return {
    series,
    period,
    threshold,
    norm,
    fisher,
    samples,
    fisherFinal,
    overboughtCount,
    oversoldCount,
    positiveCount,
    negativeCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineEhlersFisherLayoutOptions
  extends ChartLineEhlersFisherOptions {
  data: readonly ChartLineEhlersFisherPoint[] | null | undefined;
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
export function computeLineEhlersFisherLayout(
  options: ChartLineEhlersFisherLayoutOptions,
): ChartLineEhlersFisherLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_EHLERS_FISHER_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_EHLERS_FISHER_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_EHLERS_FISHER_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_EHLERS_FISHER_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_EHLERS_FISHER_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineEhlersFisher(options.data, {
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
    if (sample.hl2 < priceMin) priceMin = sample.hl2;
    if (sample.hl2 > priceMax) priceMax = sample.hl2;
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

  const fisherMin = -3;
  const fisherMax = 3;
  const fisherPanelHeight = fisherPanelBottom - fisherPanelTop;
  const fisherYAt = (value: number): number =>
    fisherPanelBottom -
    ((value - fisherMin) / (fisherMax - fisherMin)) * fisherPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineEhlersFisherDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.hl2);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, hl2: sample.hl2 });
  });

  const fisherLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineEhlersFisherMarker[] = [];
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
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineEhlersFisherChart(
  data: readonly ChartLineEhlersFisherPoint[] | null | undefined,
  options: ChartLineEhlersFisherOptions = {},
): string {
  const run = runLineEhlersFisher(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.fisherFinal === null ? 'n/a' : run.fisherFinal.toFixed(3);
  return (
    `Two-panel chart with an Ehlers Fisher Transform panel (period ` +
    `${run.period}, threshold +/- ${run.threshold}): the top panel ` +
    `plots the hl2 median price, the bottom panel plots the Fisher ` +
    `Transform of the normalised price. The normalised value is ` +
    `recursively smoothed and then passed through the inverse ` +
    `hyperbolic tangent (atanh) to push turning points into the ` +
    `Gaussian tails. A constant high/low series leaves both the ` +
    `normalised value and the Fisher reading at exactly zero. ` +
    `Across ${total} bars the Fisher reads overbought ` +
    `(>= ${run.threshold}) on ${run.overboughtCount}, oversold ` +
    `(<= -${run.threshold}) on ${run.oversoldCount}, positive on ` +
    `${run.positiveCount}, and negative on ${run.negativeCount}. ` +
    `The final reading is ${finalText}.`
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
  zone: ChartLineEhlersFisherZone,
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

function zoneLabelOf(zone: ChartLineEhlersFisherZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  return 'n/a';
}

/**
 * ChartLineEhlersFisher -- two-panel pure-SVG Ehlers Fisher
 * Transform chart.
 */
export const ChartLineEhlersFisher = forwardRef<
  HTMLDivElement,
  ChartLineEhlersFisherProps
>(function ChartLineEhlersFisher(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_EHLERS_FISHER_PERIOD,
    threshold = DEFAULT_CHART_LINE_EHLERS_FISHER_THRESHOLD,
    width = DEFAULT_CHART_LINE_EHLERS_FISHER_WIDTH,
    height = DEFAULT_CHART_LINE_EHLERS_FISHER_HEIGHT,
    padding = DEFAULT_CHART_LINE_EHLERS_FISHER_PADDING,
    gap = DEFAULT_CHART_LINE_EHLERS_FISHER_GAP,
    tickCount = DEFAULT_CHART_LINE_EHLERS_FISHER_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_EHLERS_FISHER_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_EHLERS_FISHER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_EHLERS_FISHER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_EHLERS_FISHER_PRICE_COLOR,
    fisherColor = DEFAULT_CHART_LINE_EHLERS_FISHER_FISHER_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_EHLERS_FISHER_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_EHLERS_FISHER_OVERSOLD_COLOR,
    positiveColor = DEFAULT_CHART_LINE_EHLERS_FISHER_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_EHLERS_FISHER_NEGATIVE_COLOR,
    noneColor = DEFAULT_CHART_LINE_EHLERS_FISHER_NONE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_EHLERS_FISHER_ZERO_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_EHLERS_FISHER_THRESHOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_EHLERS_FISHER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_EHLERS_FISHER_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showFisher = true,
    showZeroLine = true,
    showThresholdLines = true,
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
  const baseId = `chart-line-ehlers-fisher-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineEhlersFisherSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineEhlersFisherSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineEhlersFisherLayout({
        data,
        period,
        threshold,
        width,
        height,
        padding,
        gap,
        pricePanelRatio,
      }),
    [
      data,
      period,
      threshold,
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
    describeLineEhlersFisherChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `Ehlers Fisher Transform chart, period ${run.period}, threshold +/- ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineEhlersFisherSeriesId): void => {
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
      <g data-section="chart-line-ehlers-fisher-tooltip" pointerEvents="none">
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
          data-section="chart-line-ehlers-fisher-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-ehlers-fisher-tooltip-hl2"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`HL2: ${formatValue(hoverSample.hl2)}`}
        </text>
        <text
          data-section="chart-line-ehlers-fisher-tooltip-hl"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatValue(hoverSample.high)} / ${formatValue(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-ehlers-fisher-tooltip-fisher"
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
          data-section="chart-line-ehlers-fisher-tooltip-zone"
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
    id: ChartLineEhlersFisherSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'HL2', color: priceColor },
    { id: 'fisher', label: 'Fisher', color: fisherColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-ehlers-fisher"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-fisher-final={run.fisherFinal === null ? '' : run.fisherFinal}
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
        data-section="chart-line-ehlers-fisher-aria-desc"
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
          data-section="chart-line-ehlers-fisher-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-ehlers-fisher-empty"
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
          data-section="chart-line-ehlers-fisher-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-ehlers-fisher-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-ehlers-fisher-grid-line"
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
                    data-section="chart-line-ehlers-fisher-grid-line"
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
            <g data-section="chart-line-ehlers-fisher-axes">
              <line
                data-section="chart-line-ehlers-fisher-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ehlers-fisher-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ehlers-fisher-axis"
                data-panel="fisher"
                x1={layout.innerLeft}
                y1={layout.fisherPanelTop}
                x2={layout.innerLeft}
                y2={layout.fisherPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-ehlers-fisher-axis"
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
            data-section="chart-line-ehlers-fisher-panel-label"
            data-panel="price"
            x={layout.innerRight}
            y={layout.pricePanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            HL2
          </text>
          <text
            data-section="chart-line-ehlers-fisher-panel-label"
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
              data-section="chart-line-ehlers-fisher-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-ehlers-fisher-threshold-lines">
              <line
                data-section="chart-line-ehlers-fisher-threshold-line"
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
                data-section="chart-line-ehlers-fisher-threshold-line"
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
              data-section="chart-line-ehlers-fisher-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`HL2 line, ${run.series.length} bars`}
            />
          ) : null}

          {!priceHidden && showDots ? (
            <g data-section="chart-line-ehlers-fisher-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-ehlers-fisher-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, HL2 ${formatValue(
                    dot.hl2,
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
              data-section="chart-line-ehlers-fisher-line"
              d={layout.fisherPath}
              fill="none"
              stroke={fisherColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Fisher line, ${layout.markers.length} points`}
            />
          ) : null}

          {!fisherHidden && showMarkers ? (
            <g data-section="chart-line-ehlers-fisher-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-ehlers-fisher-marker"
                  data-zone={marker.zone}
                  data-fisher={marker.fisher}
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
            <g data-section="chart-line-ehlers-fisher-badge">
              <rect
                data-section="chart-line-ehlers-fisher-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-ehlers-fisher-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Fisher ${run.period} +/- ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-ehlers-fisher-legend"
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
                data-section="chart-line-ehlers-fisher-legend-item"
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
                  data-section="chart-line-ehlers-fisher-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-ehlers-fisher-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-ehlers-fisher-legend-stats"
            style={{ color: axisColor }}
          >
            {`overbought ${run.overboughtCount} / oversold ${run.oversoldCount} / +${run.positiveCount} / -${run.negativeCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineEhlersFisher.displayName = 'ChartLineEhlersFisher';
