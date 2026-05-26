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
 * ChartLineChandeMomentum -- pure-SVG two-panel Chande Momentum
 * Oscillator chart (Tushar Chande).
 *
 * The CMO reads the imbalance of up-closes against down-closes
 * across the lookback `period`, scaled to the [-100, +100] band:
 *
 *   For j in [i - period + 1, i]:
 *     delta[j] = close[j] - close[j - 1]
 *     upPart[j]   = delta[j] > 0 ?  delta[j] : 0
 *     downPart[j] = delta[j] < 0 ? -delta[j] : 0
 *
 *   upSum   = sum(upPart   over window)
 *   downSum = sum(downPart over window)
 *
 *   CMO[i]  = 100 * (upSum - downSum) / (upSum + downSum)
 *
 * The first `period` bars are null (need `period + 1` closes to
 * fill the window of deltas). A degenerate denominator (`upSum +
 * downSum == 0`, i.e. every delta in the window is zero) also
 * nulls the bar.
 *
 * Four bit-exact anchors hold on integer fixtures:
 *
 *   * `CONST_FLAT (close == K)` -> every delta is zero, so the
 *     CMO is null at every bar.
 *   * `RISING (close == i + 10, monotone increasing)` -> every
 *     delta is +1, `downSum = 0`, `upSum = period`, so the CMO is
 *     exactly +100 at every defined bar.
 *   * `FALLING (close == 19 - i, monotone decreasing)` -> every
 *     delta is -1, `upSum = 0`, `downSum = period`, so the CMO is
 *     exactly -100 at every defined bar.
 *   * `ZIGZAG_ZERO ([10, 11, 10, 11, ...])` period 4 -> deltas
 *     alternate +/-1, `upSum = downSum = 2`, so the CMO is
 *     exactly 0 at every defined bar.
 *
 * The top panel plots the close; the bottom panel plots the CMO
 * in a fixed `[-100, +100]` band with a zero line and `+/-threshold`
 * overbought / oversold reference lines.
 */

export interface ChartLineChandeMomentumPoint {
  x: number;
  close: number;
}

export type ChartLineChandeMomentumZone =
  | 'overbought'
  | 'positive'
  | 'negative'
  | 'oversold'
  | 'flat'
  | 'none';

export type ChartLineChandeMomentumSeriesId = 'price' | 'cmo';

export interface ChartLineChandeMomentumSample {
  index: number;
  x: number;
  close: number;
  cmo: number | null;
  zone: ChartLineChandeMomentumZone;
}

export interface ChartLineChandeMomentumRun {
  series: ChartLineChandeMomentumPoint[];
  period: number;
  threshold: number;
  cmo: Array<number | null>;
  samples: ChartLineChandeMomentumSample[];
  cmoFinal: number | null;
  overboughtCount: number;
  oversoldCount: number;
  positiveCount: number;
  negativeCount: number;
  flatCount: number;
  ok: boolean;
}

export interface ChartLineChandeMomentumMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  cmo: number;
  zone: ChartLineChandeMomentumZone;
}

export interface ChartLineChandeMomentumDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineChandeMomentumLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  gap: number;
  pricePanelTop: number;
  pricePanelBottom: number;
  cmoPanelTop: number;
  cmoPanelBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineChandeMomentumDot[];
  cmoPath: string;
  markers: ChartLineChandeMomentumMarker[];
  zeroY: number;
  upperThresholdY: number;
  lowerThresholdY: number;
  priceMin: number;
  priceMax: number;
  run: ChartLineChandeMomentumRun;
}

export interface ChartLineChandeMomentumProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineChandeMomentumPoint[];
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
  cmoColor?: string;
  overboughtColor?: string;
  oversoldColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  flatColor?: string;
  noneColor?: string;
  zeroColor?: string;
  thresholdColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCmo?: boolean;
  showZeroLine?: boolean;
  showThresholdLines?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineChandeMomentumSeriesId[];
  defaultHiddenSeries?: ChartLineChandeMomentumSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineChandeMomentumSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineChandeMomentumSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_WIDTH = 720;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_HEIGHT = 400;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PADDING = 44;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_GAP = 12;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PERIOD = 14;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_THRESHOLD = 50;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PRICE_PANEL_RATIO = 0.55;
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_CMO_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_OVERBOUGHT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_OVERSOLD_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_POSITIVE_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_NEGATIVE_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_THRESHOLD_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHANDE_MOMENTUM_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineChandeMomentumFinitePoints(
  data: readonly ChartLineChandeMomentumPoint[] | null | undefined,
): ChartLineChandeMomentumPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineChandeMomentumPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce the lookback period to an integer of at least 2. */
export function normalizeLineChandeMomentumPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the +/- threshold to a positive finite in (0, 100]. */
export function normalizeLineChandeMomentumThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold > 0 && threshold <= 100) {
    return threshold;
  }
  return fallback;
}

/**
 * Run the CMO pipeline per bar. The first `period` bars are null
 * (no full window of deltas yet); a bar with a zero net move
 * across the whole window also nulls the bar (no scale to divide
 * by).
 */
export function computeLineChandeMomentum(
  closes: readonly number[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(closes) || closes.length === 0) return [];
  const p = normalizeLineChandeMomentumPeriod(
    period,
    DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PERIOD,
  );
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i < p) {
      out.push(null);
      continue;
    }
    let upSum = 0;
    let downSum = 0;
    let ok = true;
    for (let j = i - p + 1; j <= i; j += 1) {
      const c = closes[j];
      const cPrev = closes[j - 1];
      if (!isFiniteNumber(c) || !isFiniteNumber(cPrev)) {
        ok = false;
        break;
      }
      const delta = c - cPrev;
      if (delta > 0) upSum += delta;
      else if (delta < 0) downSum += -delta;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    const total = upSum + downSum;
    if (total === 0) {
      out.push(null);
      continue;
    }
    out.push((100 * (upSum - downSum)) / total);
  }
  return out;
}

/** Classify a CMO reading against the threshold ladder. */
export function classifyLineChandeMomentumZone(
  value: number | null,
  threshold: number,
): ChartLineChandeMomentumZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'overbought';
  if (value > 0) return 'positive';
  if (value <= -threshold) return 'oversold';
  if (value < 0) return 'negative';
  return 'flat';
}

export interface ChartLineChandeMomentumOptions {
  period?: number;
  threshold?: number;
}

/** Run the full CMO pipeline. */
export function runLineChandeMomentum(
  data: readonly ChartLineChandeMomentumPoint[] | null | undefined,
  options: ChartLineChandeMomentumOptions = {},
): ChartLineChandeMomentumRun {
  const series = getLineChandeMomentumFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineChandeMomentumPeriod(
    options.period,
    DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PERIOD,
  );
  const threshold = normalizeLineChandeMomentumThreshold(
    options.threshold,
    DEFAULT_CHART_LINE_CHANDE_MOMENTUM_THRESHOLD,
  );
  const closes = series.map((p) => p.close);
  const cmo = computeLineChandeMomentum(closes, period);
  const samples: ChartLineChandeMomentumSample[] = series.map((point, index) => {
    const value = cmo[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      cmo: value,
      zone: classifyLineChandeMomentumZone(value, threshold),
    };
  });
  let overboughtCount = 0;
  let oversoldCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;
  let flatCount = 0;
  let cmoFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'overbought') overboughtCount += 1;
    else if (sample.zone === 'oversold') oversoldCount += 1;
    else if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.cmo)) cmoFinal = sample.cmo;
  }
  return {
    series,
    period,
    threshold,
    cmo,
    samples,
    cmoFinal,
    overboughtCount,
    oversoldCount,
    positiveCount,
    negativeCount,
    flatCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineChandeMomentumLayoutOptions
  extends ChartLineChandeMomentumOptions {
  data: readonly ChartLineChandeMomentumPoint[] | null | undefined;
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
export function computeLineChandeMomentumLayout(
  options: ChartLineChandeMomentumLayoutOptions,
): ChartLineChandeMomentumLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CHANDE_MOMENTUM_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CHANDE_MOMENTUM_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PADDING;
  const gap = isFiniteNumber(options.gap)
    ? options.gap
    : DEFAULT_CHART_LINE_CHANDE_MOMENTUM_GAP;
  const ratioRaw = isFiniteNumber(options.pricePanelRatio)
    ? options.pricePanelRatio
    : DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PRICE_PANEL_RATIO;
  const ratio = Math.min(0.8, Math.max(0.3, ratioRaw));

  const run = runLineChandeMomentum(options.data, {
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
  const cmoPanelTop = pricePanelBottom + gap;
  const cmoPanelBottom = innerBottom;

  const okGeom =
    innerWidth > 0 &&
    pricePanelHeight > 0 &&
    cmoPanelBottom - cmoPanelTop > 0;
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

  const cmoMin = -110;
  const cmoMax = 110;
  const cmoPanelHeight = cmoPanelBottom - cmoPanelTop;
  const cmoYAt = (value: number): number =>
    cmoPanelBottom - ((value - cmoMin) / (cmoMax - cmoMin)) * cmoPanelHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineChandeMomentumDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceYAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const cmoLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineChandeMomentumMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.cmo)) return;
    const cx = xAt(index);
    const cy = cmoYAt(sample.cmo);
    cmoLinePoints.push({ x: cx, y: cy });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      cmo: sample.cmo,
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
    cmoPanelTop,
    cmoPanelBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    cmoPath: buildLinePath(cmoLinePoints),
    markers,
    zeroY: cmoYAt(0),
    upperThresholdY: cmoYAt(run.threshold),
    lowerThresholdY: cmoYAt(-run.threshold),
    priceMin,
    priceMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineChandeMomentumChart(
  data: readonly ChartLineChandeMomentumPoint[] | null | undefined,
  options: ChartLineChandeMomentumOptions = {},
): string {
  const run = runLineChandeMomentum(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.cmoFinal === null ? 'n/a' : run.cmoFinal.toFixed(3);
  return (
    `Two-panel chart with a Tushar Chande Momentum Oscillator panel ` +
    `(period ${run.period}, threshold +/- ${run.threshold}): the top ` +
    `panel plots the close, the bottom panel plots the CMO in the ` +
    `[-100, +100] band. The CMO is 100 * (upSum - downSum) / (upSum ` +
    `+ downSum) over the lookback, where upSum and downSum are the ` +
    `cumulative positive and absolute negative bar-over-bar deltas. ` +
    `A monotone-rising series reads +100; a monotone-falling series ` +
    `reads -100; an alternating up/down series reads zero. A ` +
    `constant series leaves the bar null (no scale). Across ${total} ` +
    `bars the CMO reads overbought (>= ${run.threshold}) on ` +
    `${run.overboughtCount}, oversold (<= -${run.threshold}) on ` +
    `${run.oversoldCount}, positive on ${run.positiveCount}, ` +
    `negative on ${run.negativeCount}, and flat on ${run.flatCount}. ` +
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
  zone: ChartLineChandeMomentumZone,
  overboughtColor: string,
  oversoldColor: string,
  positiveColor: string,
  negativeColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'overbought') return overboughtColor;
  if (zone === 'oversold') return oversoldColor;
  if (zone === 'positive') return positiveColor;
  if (zone === 'negative') return negativeColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineChandeMomentumZone): string {
  if (zone === 'overbought') return 'Overbought';
  if (zone === 'oversold') return 'Oversold';
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineChandeMomentum -- two-panel pure-SVG Chande Momentum
 * Oscillator chart.
 */
export const ChartLineChandeMomentum = forwardRef<
  HTMLDivElement,
  ChartLineChandeMomentumProps
>(function ChartLineChandeMomentum(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PERIOD,
    threshold = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_THRESHOLD,
    width = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_WIDTH,
    height = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PADDING,
    gap = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_GAP,
    tickCount = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_TICK_COUNT,
    pricePanelRatio = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PRICE_PANEL_RATIO,
    strokeWidth = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_PRICE_COLOR,
    cmoColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_CMO_COLOR,
    overboughtColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_OVERBOUGHT_COLOR,
    oversoldColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_OVERSOLD_COLOR,
    positiveColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_NEGATIVE_COLOR,
    flatColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_NONE_COLOR,
    zeroColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_ZERO_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_THRESHOLD_COLOR,
    gridColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHANDE_MOMENTUM_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCmo = true,
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
  const baseId = `chart-line-chande-momentum-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineChandeMomentumSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineChandeMomentumSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineChandeMomentumLayout({
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
    ariaDescription ??
    describeLineChandeMomentumChart(data, { period, threshold });
  const resolvedLabel =
    ariaLabel ??
    `Chande Momentum Oscillator chart, period ${run.period}, threshold +/- ${run.threshold}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineChandeMomentumSeriesId): void => {
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
    const tooltipW = 196;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.pricePanelTop + 6;
    tooltip = (
      <g
        data-section="chart-line-chande-momentum-tooltip"
        pointerEvents="none"
      >
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
          data-section="chart-line-chande-momentum-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-chande-momentum-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-chande-momentum-tooltip-cmo"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`CMO: ${
            hoverSample.cmo === null ? 'n/a' : hoverSample.cmo.toFixed(2)
          }`}
        </text>
        <text
          data-section="chart-line-chande-momentum-tooltip-zone"
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
  const cmoHidden = isHidden('cmo') || !showCmo;

  const legendItems: Array<{
    id: ChartLineChandeMomentumSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'cmo', label: 'CMO', color: cmoColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-chande-momentum"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-threshold={run.threshold}
      data-cmo-final={run.cmoFinal === null ? '' : run.cmoFinal}
      data-overbought-count={run.overboughtCount}
      data-oversold-count={run.oversoldCount}
      data-positive-count={run.positiveCount}
      data-negative-count={run.negativeCount}
      data-flat-count={run.flatCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-chande-momentum-aria-desc"
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
          data-section="chart-line-chande-momentum-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-chande-momentum-empty"
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
          data-section="chart-line-chande-momentum-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-chande-momentum-grid">
              {tickValues.map((t, i) => {
                const py =
                  layout.pricePanelBottom -
                  t * (layout.pricePanelBottom - layout.pricePanelTop);
                return (
                  <line
                    key={`pg-${i}`}
                    data-section="chart-line-chande-momentum-grid-line"
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
                  layout.cmoPanelBottom -
                  t * (layout.cmoPanelBottom - layout.cmoPanelTop);
                return (
                  <line
                    key={`cg-${i}`}
                    data-section="chart-line-chande-momentum-grid-line"
                    data-panel="cmo"
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
            <g data-section="chart-line-chande-momentum-axes">
              <line
                data-section="chart-line-chande-momentum-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelTop}
                x2={layout.innerLeft}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chande-momentum-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.pricePanelBottom}
                x2={layout.innerRight}
                y2={layout.pricePanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chande-momentum-axis"
                data-panel="cmo"
                x1={layout.innerLeft}
                y1={layout.cmoPanelTop}
                x2={layout.innerLeft}
                y2={layout.cmoPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chande-momentum-axis"
                data-panel="cmo"
                x1={layout.innerLeft}
                y1={layout.cmoPanelBottom}
                x2={layout.innerRight}
                y2={layout.cmoPanelBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
            </g>
          ) : null}

          <text
            data-section="chart-line-chande-momentum-panel-label"
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
            data-section="chart-line-chande-momentum-panel-label"
            data-panel="cmo"
            x={layout.innerRight}
            y={layout.cmoPanelTop + 4}
            textAnchor="end"
            fill={axisColor}
            fontSize={10}
            fontWeight={600}
          >
            CMO
          </text>

          {showZeroLine ? (
            <line
              data-section="chart-line-chande-momentum-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroY}
              x2={layout.innerRight}
              y2={layout.zeroY}
              stroke={zeroColor}
              strokeWidth={1}
            />
          ) : null}

          {showThresholdLines ? (
            <g data-section="chart-line-chande-momentum-threshold-lines">
              <line
                data-section="chart-line-chande-momentum-threshold-line"
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
                data-section="chart-line-chande-momentum-threshold-line"
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
              data-section="chart-line-chande-momentum-price-path"
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
            <g data-section="chart-line-chande-momentum-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-chande-momentum-dot"
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

          {!cmoHidden ? (
            <path
              data-section="chart-line-chande-momentum-line"
              d={layout.cmoPath}
              fill="none"
              stroke={cmoColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`CMO line, ${layout.markers.length} points`}
            />
          ) : null}

          {!cmoHidden && showMarkers ? (
            <g data-section="chart-line-chande-momentum-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-chande-momentum-marker"
                  data-zone={marker.zone}
                  data-cmo={marker.cmo}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    overboughtColor,
                    oversoldColor,
                    positiveColor,
                    negativeColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, CMO ${formatValue(
                    marker.cmo,
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
            <g data-section="chart-line-chande-momentum-badge">
              <rect
                data-section="chart-line-chande-momentum-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.pricePanelTop + 4}
                width={108}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-chande-momentum-badge-config"
                x={layout.innerLeft + 10}
                y={layout.pricePanelTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`CMO ${run.period} +/- ${run.threshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-chande-momentum-legend"
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
                data-section="chart-line-chande-momentum-legend-item"
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
                  data-section="chart-line-chande-momentum-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-chande-momentum-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-chande-momentum-legend-stats"
            style={{ color: axisColor }}
          >
            {`OB ${run.overboughtCount} / OS ${run.oversoldCount} / + ${run.positiveCount} / - ${run.negativeCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineChandeMomentum.displayName = 'ChartLineChandeMomentum';
