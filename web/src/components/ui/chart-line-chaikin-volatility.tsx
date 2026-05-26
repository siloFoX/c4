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
 * ChartLineChaikinVolatility -- pure-SVG dual-panel chart with a
 * Chaikin Volatility oscillator panel beneath the close.
 *
 * Definition (Marc Chaikin):
 *
 *   range[i] = high[i] - low[i]
 *   ema[i]   = EMA(range, length)
 *   CV[i]    = 100 * (ema[i] - ema[i - length]) / ema[i - length]
 *
 * The EMA uses `alpha = 2 / (length + 1)` and seeds with the
 * first finite value. Bars before `i = 2 * length` are `null`
 * (warmup: needs `length` bars for the EMA seed plus another
 * `length` bars to look back). When `ema[i - length] == 0`
 * (singular) the bar is `null`.
 *
 * Bit-exact anchor:
 *
 *   * **CONST_HL (high - low == K, K != 0)**: range is constant
 *     -> ema converges to K immediately (the EMA-of-constant
 *     identity rounds back to K for any K that yields a clean
 *     sum in IEEE 754; the ratio `ema[i] / ema[i - length]`
 *     remains 1 even when the EMAs drift slightly, since both
 *     drift identically). `CV = 100 * (K - K) / K = 0`
 *     bit-exact.
 *   * **FLAT_HL (range == 0)**: ema = 0 -> denominator = 0 ->
 *     `null` at every bar.
 *
 * Layout: the chart is split into two stacked panels. The top
 * panel plots the close, the bottom plots the CV with a zero
 * baseline.
 */

export interface ChartLineChaikinVolatilityPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineChaikinVolatilityZone =
  | 'positive'
  | 'flat'
  | 'negative'
  | 'none';

export type ChartLineChaikinVolatilitySeriesId = 'price' | 'cv';

export interface ChartLineChaikinVolatilitySample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  cv: number | null;
  zone: ChartLineChaikinVolatilityZone;
}

export interface ChartLineChaikinVolatilityRun {
  series: ChartLineChaikinVolatilityPoint[];
  length: number;
  cv: Array<number | null>;
  samples: ChartLineChaikinVolatilitySample[];
  cvFinal: number | null;
  positiveCount: number;
  flatCount: number;
  negativeCount: number;
  ok: boolean;
}

export interface ChartLineChaikinVolatilityMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  cv: number;
  zone: ChartLineChaikinVolatilityZone;
}

export interface ChartLineChaikinVolatilityDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineChaikinVolatilityLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  cvTop: number;
  cvBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineChaikinVolatilityDot[];
  cvPath: string;
  markers: ChartLineChaikinVolatilityMarker[];
  priceMin: number;
  priceMax: number;
  cvMin: number;
  cvMax: number;
  zeroLineY: number;
  run: ChartLineChaikinVolatilityRun;
}

export interface ChartLineChaikinVolatilityProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineChaikinVolatilityPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cvColor?: string;
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
  showCv?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showZeroLine?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineChaikinVolatilitySeriesId[];
  defaultHiddenSeries?: ChartLineChaikinVolatilitySeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineChaikinVolatilitySeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineChaikinVolatilitySample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatCv?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_WIDTH = 720;
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_PADDING = 44;
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_LENGTH = 10;
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_CV_COLOR = '#7c3aed';
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_FLAT_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_ZERO_LINE_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineChaikinVolatilityFinitePoints(
  data: readonly ChartLineChaikinVolatilityPoint[] | null | undefined,
): ChartLineChaikinVolatilityPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineChaikinVolatilityPoint[] = [];
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

/** Coerce a positive integer length (>= 2). */
export function normalizeLineChaikinVolatilityLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Single-pass EMA seeded at the first finite value.
 *
 *   alpha = 2 / (length + 1)
 *   ema[0] = x[0]
 *   ema[i] = alpha * x[i] + (1 - alpha) * ema[i - 1]
 */
export function computeLineChaikinVolatilityEma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const alpha = 2 / (length + 1);
  const out: Array<number | null> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev === null) {
      out.push(v);
      prev = v;
      continue;
    }
    const e: number = alpha * v + (1 - alpha) * prev;
    out.push(e);
    prev = e;
  }
  return out;
}

/**
 * Compute the Chaikin Volatility per bar.
 *
 *   CV[i] = 100 * (ema[i] - ema[i - length]) / ema[i - length]
 *
 * Bars before `i = 2 * length` are `null` (warmup). When the
 * lookback EMA is zero the bar is `null` (singular).
 */
export function computeLineChaikinVolatility(
  bars: ReadonlyArray<{ high: number; low: number }> | null | undefined,
  length: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const L = normalizeLineChaikinVolatilityLength(
    length,
    DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_LENGTH,
  );
  const range: Array<number | null> = bars.map((bar) => {
    if (
      !bar ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low)
    ) {
      return null;
    }
    return bar.high - bar.low;
  });
  const ema = computeLineChaikinVolatilityEma(range, L);
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    if (i < 2 * L) {
      out.push(null);
      continue;
    }
    const cur = ema[i];
    const prior = ema[i - L];
    if (
      cur === null ||
      cur === undefined ||
      prior === null ||
      prior === undefined ||
      !isFiniteNumber(cur) ||
      !isFiniteNumber(prior) ||
      prior === 0
    ) {
      out.push(null);
      continue;
    }
    out.push(100 * (cur - prior) / prior);
  }
  return out;
}

/** Classify a CV reading. */
export function classifyLineChaikinVolatilityZone(
  value: number | null,
): ChartLineChaikinVolatilityZone {
  if (!isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'flat';
}

export interface ChartLineChaikinVolatilityOptions {
  length?: number;
}

/** Run the full Chaikin Volatility pipeline plus sample classification. */
export function runLineChaikinVolatility(
  data: readonly ChartLineChaikinVolatilityPoint[] | null | undefined,
  options: ChartLineChaikinVolatilityOptions = {},
): ChartLineChaikinVolatilityRun {
  const series = getLineChaikinVolatilityFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineChaikinVolatilityLength(
    options.length,
    DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_LENGTH,
  );
  const cv = computeLineChaikinVolatility(series, length);
  const samples: ChartLineChaikinVolatilitySample[] = series.map(
    (point, index) => {
      const value = cv[index] ?? null;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        cv: value,
        zone: classifyLineChaikinVolatilityZone(value),
      };
    },
  );
  let positiveCount = 0;
  let flatCount = 0;
  let negativeCount = 0;
  let cvFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    if (isFiniteNumber(sample.cv)) cvFinal = sample.cv;
  }
  return {
    series,
    length,
    cv,
    samples,
    cvFinal,
    positiveCount,
    flatCount,
    negativeCount,
    ok: series.length >= 2 * length + 1,
  };
}

export interface ChartLineChaikinVolatilityLayoutOptions
  extends ChartLineChaikinVolatilityOptions {
  data: readonly ChartLineChaikinVolatilityPoint[] | null | undefined;
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
export function computeLineChaikinVolatilityLayout(
  options: ChartLineChaikinVolatilityLayoutOptions,
): ChartLineChaikinVolatilityLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_PANEL_GAP;

  const run = runLineChaikinVolatility(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const cvHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const cvTop = priceBottom + panelGap;
  const cvBottom = cvTop + cvHeight;

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

  let cvMin = Infinity;
  let cvMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.cv)) {
      if (sample.cv < cvMin) cvMin = sample.cv;
      if (sample.cv > cvMax) cvMax = sample.cv;
    }
  }
  if (!Number.isFinite(cvMin) || !Number.isFinite(cvMax)) {
    cvMin = -10;
    cvMax = 10;
  }
  if (cvMin === cvMax) {
    cvMin -= 1;
    cvMax += 1;
  }
  if (cvMin > 0) cvMin = 0;
  if (cvMax < 0) cvMax = 0;
  const cvY = (value: number): number =>
    cvBottom - ((value - cvMin) / (cvMax - cvMin)) * cvHeight;
  const zeroLineY = cvY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineChaikinVolatilityDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const cvLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineChaikinVolatilityMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.cv)) return;
    const cx = xAt(index);
    const yc = cvY(sample.cv);
    cvLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      cv: sample.cv,
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
    cvTop,
    cvBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    cvPath: buildLinePath(cvLinePoints),
    markers,
    priceMin,
    priceMax,
    cvMin,
    cvMax,
    zeroLineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineChaikinVolatilityChart(
  data: readonly ChartLineChaikinVolatilityPoint[] | null | undefined,
  options: ChartLineChaikinVolatilityOptions = {},
): string {
  const run = runLineChaikinVolatility(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText = run.cvFinal === null ? 'n/a' : run.cvFinal.toFixed(4);
  return (
    `Dual-panel chart with a Chaikin Volatility oscillator panel ` +
    `beneath the close (length ${run.length}). The Chaikin ` +
    `Volatility is the percentage rate of change of an EMA of the ` +
    `high minus low range across the lookback window, expressed as ` +
    `100 * (ema[i] - ema[i - length]) / ema[i - length]. Across ` +
    `${total} bars the oscillator is positive on ` +
    `${run.positiveCount}, flat on ${run.flatCount}, and negative ` +
    `on ${run.negativeCount}. The final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatCv(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(2);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineChaikinVolatilityZone,
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

function zoneLabelOf(zone: ChartLineChaikinVolatilityZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/**
 * ChartLineChaikinVolatility -- dual-panel pure-SVG Chaikin
 * Volatility chart.
 */
export const ChartLineChaikinVolatility = forwardRef<
  HTMLDivElement,
  ChartLineChaikinVolatilityProps
>(function ChartLineChaikinVolatility(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_LENGTH,
    width = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_WIDTH,
    height = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_HEIGHT,
    padding = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_PADDING,
    panelGap = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_PRICE_COLOR,
    cvColor = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_CV_COLOR,
    positiveColor = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_POSITIVE_COLOR,
    negativeColor = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_NEGATIVE_COLOR,
    flatColor = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_GRID_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_CHAIKIN_VOLATILITY_ZERO_LINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCv = true,
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
    formatCv = defaultFormatCv,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-chaikin-volatility-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineChaikinVolatilitySeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineChaikinVolatilitySeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineChaikinVolatilityLayout({
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
    describeLineChaikinVolatilityChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Chaikin Volatility chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineChaikinVolatilitySeriesId): void => {
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
        data-section="chart-line-chaikin-volatility-tooltip"
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
          data-section="chart-line-chaikin-volatility-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-chaikin-volatility-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-chaikin-volatility-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-chaikin-volatility-tooltip-cv"
          x={tx + 10}
          y={ty + 67}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`CV: ${
            hoverSample.cv === null ? 'n/a' : formatCv(hoverSample.cv)
          }`}
        </text>
        <text
          data-section="chart-line-chaikin-volatility-tooltip-zone"
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
  const cvHidden = isHidden('cv') || !showCv;

  const legendItems: Array<{
    id: ChartLineChaikinVolatilitySeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'cv', label: 'Chaikin Volatility', color: cvColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-chaikin-volatility"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-cv-final={run.cvFinal === null ? '' : run.cvFinal}
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
        data-section="chart-line-chaikin-volatility-aria-desc"
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
          data-section="chart-line-chaikin-volatility-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-chaikin-volatility-empty"
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
          data-section="chart-line-chaikin-volatility-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-chaikin-volatility-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yc =
                  layout.cvBottom - t * (layout.cvBottom - layout.cvTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-chaikin-volatility-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-chaikin-volatility-grid-line"
                      data-panel="cv"
                      x1={layout.innerLeft}
                      y1={yc}
                      x2={layout.innerRight}
                      y2={yc}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-chaikin-volatility-axes">
              <line
                data-section="chart-line-chaikin-volatility-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chaikin-volatility-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chaikin-volatility-axis"
                data-panel="cv"
                x1={layout.innerLeft}
                y1={layout.cvTop}
                x2={layout.innerLeft}
                y2={layout.cvBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-chaikin-volatility-axis"
                data-panel="cv"
                x1={layout.innerLeft}
                y1={layout.cvBottom}
                x2={layout.innerRight}
                y2={layout.cvBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-chaikin-volatility-tick-label"
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
                data-section="chart-line-chaikin-volatility-tick-label"
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
                data-section="chart-line-chaikin-volatility-tick-label"
                data-panel="cv"
                x={layout.innerLeft - 6}
                y={layout.cvTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCv(layout.cvMax)}
              </text>
              <text
                data-section="chart-line-chaikin-volatility-tick-label"
                data-panel="cv"
                x={layout.innerLeft - 6}
                y={layout.cvBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatCv(layout.cvMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-chaikin-volatility-zero-line"
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
              data-section="chart-line-chaikin-volatility-price-path"
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
            <g data-section="chart-line-chaikin-volatility-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-chaikin-volatility-dot"
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

          {!cvHidden ? (
            <path
              data-section="chart-line-chaikin-volatility-line"
              d={layout.cvPath}
              fill="none"
              stroke={cvColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Chaikin Volatility line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-chaikin-volatility-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-chaikin-volatility-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-cv={marker.cv}
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
                  )}, CV ${formatCv(marker.cv)}, ${zoneLabelOf(marker.zone)}`}
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
            <g data-section="chart-line-chaikin-volatility-badge">
              <rect
                data-section="chart-line-chaikin-volatility-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-chaikin-volatility-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Chaikin Volatility ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-chaikin-volatility-legend"
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
                data-section="chart-line-chaikin-volatility-legend-item"
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
                  data-section="chart-line-chaikin-volatility-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-chaikin-volatility-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-chaikin-volatility-legend-stats"
            style={{ color: axisColor }}
          >
            {`positive ${run.positiveCount} / flat ${run.flatCount} / negative ${run.negativeCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineChaikinVolatility.displayName = 'ChartLineChaikinVolatility';
