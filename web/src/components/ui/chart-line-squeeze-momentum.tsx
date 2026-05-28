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
 * ChartLineSqueezeMomentum -- pure-SVG dual-panel chart with a
 * LazyBear Squeeze Momentum oscillator panel beneath the close.
 *
 * Definition (LazyBear, TradingView):
 *
 *   midDonchian = (highest(high, n) + lowest(low, n)) / 2
 *   smaClose    = sma(close, n)
 *   base        = (midDonchian + smaClose) / 2
 *   src[i]      = close[i] - base[i]
 *   val[i]      = linreg(src[i - n + 1..i], n, 0)
 *
 * `linreg(y, n, 0)` is the linear regression value at the last
 * bar of the window, computed as
 *   mean(y) + slope * (n - 1) / 2,
 * which is equivalent to `intercept + slope * (n - 1)` for
 * `x = 0..n - 1`.
 *
 * Bars before `i = n - 1` are `null` (warmup). Non-finite
 * inputs null the bar.
 *
 * Bit-exact anchor on integer fixtures:
 *
 *   * **CONST_FLAT (high = low = close = K)**:
 *     midDonchian = K, smaClose = K, base = K -> src = 0 at
 *     every bar. Linear regression of zeros is zero (mean = 0,
 *     slope = 0), so `val = 0` bit-exact for every bar past
 *     the warmup window.
 *
 * The chart is split into two stacked panels: the top panel
 * plots the close, the bottom plots the Squeeze Momentum with a
 * zero baseline.
 */

export interface ChartLineSqueezeMomentumPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineSqueezeMomentumZone =
  | 'positive'
  | 'flat'
  | 'negative'
  | 'none';

export type ChartLineSqueezeMomentumSeriesId = 'price' | 'momentum';

export interface ChartLineSqueezeMomentumSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  momentum: number | null;
  zone: ChartLineSqueezeMomentumZone;
}

export interface ChartLineSqueezeMomentumRun {
  series: ChartLineSqueezeMomentumPoint[];
  length: number;
  momentum: Array<number | null>;
  samples: ChartLineSqueezeMomentumSample[];
  momentumFinal: number | null;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineSqueezeMomentumMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  momentum: number;
  zone: ChartLineSqueezeMomentumZone;
}

export interface ChartLineSqueezeMomentumDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineSqueezeMomentumLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  momentumTop: number;
  momentumBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineSqueezeMomentumDot[];
  momentumPath: string;
  markers: ChartLineSqueezeMomentumMarker[];
  priceMin: number;
  priceMax: number;
  momentumMin: number;
  momentumMax: number;
  zeroLineY: number;
  run: ChartLineSqueezeMomentumRun;
}

export interface ChartLineSqueezeMomentumProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineSqueezeMomentumPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  momentumColor?: string;
  positiveColor?: string;
  negativeColor?: string;
  flatColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  zeroLineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMomentum?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineSqueezeMomentumSeriesId[];
  defaultHiddenSeries?: ChartLineSqueezeMomentumSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineSqueezeMomentumSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineSqueezeMomentumSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatMomentum?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_WIDTH = 720;
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_HEIGHT = 460;
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_PADDING = 44;
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_LENGTH = 20;
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_MOMENTUM_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineSqueezeMomentumFinitePoints(
  data: readonly ChartLineSqueezeMomentumPoint[] | null | undefined,
): ChartLineSqueezeMomentumPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineSqueezeMomentumPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.high) &&
      isFiniteNumber(point.low) &&
      isFiniteNumber(point.close)
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

/** Coerce length to integer >= 2. */
export function normalizeLineSqueezeMomentumLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Compute the linear regression value at the last bar of an
 * input window, evaluated at x = n - 1 with x = 0..n-1.
 *
 *   slope = sum((x - mean_x) * (y - mean_y)) / sum((x - mean_x)^2)
 *   val   = mean_y + slope * (n - 1) / 2
 */
export function computeLineSqueezeMomentumLinreg(
  values: readonly number[],
): number {
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return values[0]!;
  const meanX = (n - 1) / 2;
  let sumY = 0;
  for (let i = 0; i < n; i += 1) sumY += values[i]!;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - meanX;
    const dy = values[i]! - meanY;
    num += dx * dy;
    den += dx * dx;
  }
  if (den === 0) return meanY;
  const slope = num / den;
  return meanY + slope * (n - 1) / 2;
}

/**
 * Compute the LazyBear Squeeze Momentum value per bar.
 *
 * Bars before `i = length - 1` are `null` (warmup); non-finite
 * inputs in the window null the bar.
 */
export function computeLineSqueezeMomentum(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const n = normalizeLineSqueezeMomentumLength(
    length,
    DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_LENGTH,
  );
  const closes = bars.map((b) => b?.close);
  const highs = bars.map((b) => b?.high);
  const lows = bars.map((b) => b?.low);
  const out: Array<number | null> = [];

  // Pre-compute src[i] = close[i] - base[i] for each bar with a
  // full window; nulls for warmup or non-finite inputs.
  const src: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < n - 1) {
      src.push(null);
      continue;
    }
    let hh = -Infinity;
    let ll = Infinity;
    let sumC = 0;
    let ok = true;
    for (let j = 0; j < n; j += 1) {
      const idx = i - j;
      const h = highs[idx];
      const l = lows[idx];
      const c = closes[idx];
      if (!isFiniteNumber(h) || !isFiniteNumber(l) || !isFiniteNumber(c)) {
        ok = false;
        break;
      }
      if (h > hh) hh = h;
      if (l < ll) ll = l;
      sumC += c;
    }
    if (!ok) {
      src.push(null);
      continue;
    }
    const midDonchian = (hh + ll) / 2;
    const smaClose = sumC / n;
    const base = (midDonchian + smaClose) / 2;
    const c = closes[i];
    if (!isFiniteNumber(c)) {
      src.push(null);
      continue;
    }
    src.push(c - base);
  }

  // Linear regression of src window ending at i. Bars before
  // `2*(n - 1)` need n consecutive src values, which only exist
  // when src[i - n + 1..i] are all finite. The earliest fully
  // valid index for the linreg is `i = 2*(n - 1)` (so the
  // window of src starts at i = n - 1).
  for (let i = 0; i < bars.length; i += 1) {
    if (i < 2 * (n - 1)) {
      out.push(null);
      continue;
    }
    const window: number[] = [];
    let ok = true;
    for (let j = 0; j < n; j += 1) {
      const v = src[i - (n - 1) + j];
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      window.push(v);
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(computeLineSqueezeMomentumLinreg(window));
  }
  return out;
}

/** Classify the squeeze momentum reading. */
export function classifyLineSqueezeMomentumZone(
  value: number | null,
): ChartLineSqueezeMomentumZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'flat';
}

export interface ChartLineSqueezeMomentumOptions {
  length?: number;
}

/** Run the full squeeze momentum pipeline plus sample classification. */
export function runLineSqueezeMomentum(
  data: readonly ChartLineSqueezeMomentumPoint[] | null | undefined,
  options: ChartLineSqueezeMomentumOptions = {},
): ChartLineSqueezeMomentumRun {
  const series = getLineSqueezeMomentumFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineSqueezeMomentumLength(
    options.length,
    DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_LENGTH,
  );
  const momentum = computeLineSqueezeMomentum(series, length);
  const samples: ChartLineSqueezeMomentumSample[] = series.map(
    (point, index) => {
      const value = momentum[index] ?? null;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        momentum: value,
        zone: classifyLineSqueezeMomentumZone(value),
      };
    },
  );
  let positiveCount = 0;
  let flatCount = 0;
  let negativeCount = 0;
  let momentumFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.momentum)) momentumFinal = sample.momentum;
  }
  return {
    series = [],
    length,
    momentum,
    samples,
    momentumFinal,
    positiveCount,
    flatCount,
    negativeCount,
    ok: series.length >= 2 * length - 1,
  };
}

export interface ChartLineSqueezeMomentumLayoutOptions
  extends ChartLineSqueezeMomentumOptions {
  data: readonly ChartLineSqueezeMomentumPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
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

/** Project the run into a dual-panel SVG layout. */
export function computeLineSqueezeMomentumLayout(
  options: ChartLineSqueezeMomentumLayoutOptions,
): ChartLineSqueezeMomentumLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_PANEL_GAP;

  const run = runLineSqueezeMomentum(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const momentumHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const momentumTop = priceBottom + panelGap;
  const momentumBottom = momentumTop + momentumHeight;

  const okGeom = innerWidth > 0 && innerHeight > panelGap;
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
  const priceY = (value: number): number =>
    priceBottom - ((value - priceMin) / (priceMax - priceMin)) * priceHeight;

  let momentumMin = Infinity;
  let momentumMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.momentum)) {
      if (sample.momentum < momentumMin) momentumMin = sample.momentum;
      if (sample.momentum > momentumMax) momentumMax = sample.momentum;
    }
  }
  if (!Number.isFinite(momentumMin) || !Number.isFinite(momentumMax)) {
    momentumMin = -1;
    momentumMax = 1;
  }
  if (momentumMin === momentumMax) {
    momentumMin -= 1;
    momentumMax += 1;
  }
  if (momentumMin > 0) momentumMin = 0;
  if (momentumMax < 0) momentumMax = 0;
  const momentumY = (value: number): number =>
    momentumBottom -
    ((value - momentumMin) / (momentumMax - momentumMin)) * momentumHeight;
  const zeroLineY = momentumY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineSqueezeMomentumDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const momentumLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineSqueezeMomentumMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.momentum)) return;
    const cx = xAt(index);
    const yc = momentumY(sample.momentum);
    momentumLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      momentum: sample.momentum,
      zone: sample.zone,
    });
  });

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    momentumTop,
    momentumBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    momentumPath: buildLinePath(momentumLinePoints),
    markers,
    priceMin,
    priceMax,
    momentumMin,
    momentumMax,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineSqueezeMomentumChart(
  data: readonly ChartLineSqueezeMomentumPoint[] | null | undefined,
  options: ChartLineSqueezeMomentumOptions = {},
): string {
  const run = runLineSqueezeMomentum(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.momentumFinal === null ? 'n/a' : run.momentumFinal.toFixed(4);
  return (
    `Dual-panel chart with a LazyBear Squeeze Momentum oscillator ` +
    `panel beneath the close (length ${run.length}). The Squeeze ` +
    `Momentum is the linear regression of (close - base) over ` +
    `${run.length} bars, where base is the average of the ` +
    `midpoint of the high / low range and the simple moving ` +
    `average of the close. Across ${total} bars the momentum is ` +
    `positive on ${run.positiveCount}, flat on ${run.flatCount}, ` +
    `and negative on ${run.negativeCount}. The final reading is ` +
    `${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatMomentum(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineSqueezeMomentumZone,
  positiveColor: string,
  negativeColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'positive') return positiveColor;
  if (zone === 'negative') return negativeColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineSqueezeMomentumZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineSqueezeMomentum -- dual-panel pure-SVG LazyBear
 * Squeeze Momentum chart.
 */
export const ChartLineSqueezeMomentum = forwardRef<
  HTMLDivElement,
  ChartLineSqueezeMomentumProps
>(function ChartLineSqueezeMomentum(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_LENGTH,
    width = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_WIDTH,
    height = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_HEIGHT,
    padding = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_PADDING,
    panelGap = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_PRICE_COLOR,
    momentumColor = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_MOMENTUM_COLOR,
    positiveColor = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_NEGATIVE_COLOR,
    flatColor = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_SQUEEZE_MOMENTUM_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMomentum = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showZeroLine = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatMomentum = defaultFormatMomentum,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-squeeze-momentum-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineSqueezeMomentumSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineSqueezeMomentumSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineSqueezeMomentumLayout({
        data,
        length,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineSqueezeMomentumChart(data, { length });
  const resolvedLabel =
    ariaLabel ??
    `LazyBear Squeeze Momentum chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineSqueezeMomentumSeriesId): void => {
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
    const tooltipW = 240;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g
        data-section="chart-line-squeeze-momentum-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={102}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-squeeze-momentum-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-squeeze-momentum-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-squeeze-momentum-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-squeeze-momentum-tooltip-momentum"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`SM: ${
            hoverSample.momentum === null
              ? 'n/a'
              : formatMomentum(hoverSample.momentum)
          }`}
        </text>
        <text
          data-section="chart-line-squeeze-momentum-tooltip-zone"
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
  const momentumHidden = isHidden('momentum') || !showMomentum;

  const legendItems: Array<{
    id: ChartLineSqueezeMomentumSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'momentum', label: 'Squeeze Momentum', color: momentumColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-squeeze-momentum"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-momentum-final={
        run.momentumFinal === null ? '' : run.momentumFinal
      }
      data-positive-count={run.positiveCount}
      data-flat-count={run.flatCount}
      data-negative-count={run.negativeCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-squeeze-momentum-aria-desc"
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
          data-section="chart-line-squeeze-momentum-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-squeeze-momentum-empty"
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
          data-section="chart-line-squeeze-momentum-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-squeeze-momentum-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const ym =
                  layout.momentumBottom -
                  t * (layout.momentumBottom - layout.momentumTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-squeeze-momentum-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-squeeze-momentum-grid-line"
                      data-panel="momentum"
                      x1={layout.innerLeft}
                      y1={ym}
                      x2={layout.innerRight}
                      y2={ym}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-squeeze-momentum-axes">
              <line
                data-section="chart-line-squeeze-momentum-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-squeeze-momentum-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-squeeze-momentum-axis"
                data-panel="momentum"
                x1={layout.innerLeft}
                y1={layout.momentumTop}
                x2={layout.innerLeft}
                y2={layout.momentumBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-squeeze-momentum-axis"
                data-panel="momentum"
                x1={layout.innerLeft}
                y1={layout.momentumBottom}
                x2={layout.innerRight}
                y2={layout.momentumBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-squeeze-momentum-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMax)}
              </text>
              <text
                data-section="chart-line-squeeze-momentum-tick-label"
                data-panel="price"
                x={layout.innerLeft - 6}
                y={layout.priceBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.priceMin)}
              </text>
              <text
                data-section="chart-line-squeeze-momentum-tick-label"
                data-panel="momentum"
                x={layout.innerLeft - 6}
                y={layout.momentumTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatMomentum(layout.momentumMax)}
              </text>
              <text
                data-section="chart-line-squeeze-momentum-tick-label"
                data-panel="momentum"
                x={layout.innerLeft - 6}
                y={layout.momentumBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatMomentum(layout.momentumMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-squeeze-momentum-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-squeeze-momentum-price-path"
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
            <g data-section="chart-line-squeeze-momentum-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-squeeze-momentum-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatPrice(
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

          {!momentumHidden ? (
            <path
              data-section="chart-line-squeeze-momentum-line"
              d={layout.momentumPath}
              fill="none"
              stroke={momentumColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Squeeze Momentum line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-squeeze-momentum-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-squeeze-momentum-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-momentum={marker.momentum}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    positiveColor,
                    negativeColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, SM ${formatMomentum(marker.momentum)}, ${zoneLabelOf(
                    marker.zone,
                  )}`}
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
            <g data-section="chart-line-squeeze-momentum-badge">
              <rect
                data-section="chart-line-squeeze-momentum-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={150}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-squeeze-momentum-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Squeeze Momentum ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-squeeze-momentum-legend"
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
                data-section="chart-line-squeeze-momentum-legend-item"
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
                  data-section="chart-line-squeeze-momentum-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-squeeze-momentum-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-squeeze-momentum-legend-stats"
            style={{ color: axisColor }}
          >
            {`positive ${run.positiveCount} / flat ${run.flatCount} / negative ${run.negativeCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSqueezeMomentum.displayName = 'ChartLineSqueezeMomentum';
