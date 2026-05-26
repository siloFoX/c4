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
 * ChartLineHlRange -- pure-SVG dual-panel chart with the close on
 * top and a SMA-smoothed High-Low Range on the bottom. The
 * smoother first computes the per-bar range `high - low` and then
 * averages it across the lookback:
 *
 *   range[i]    = high[i] - low[i]
 *   avgRange[i] = mean(range[i - length + 1 .. i])
 *
 * For well-ordered OHLC data (`high >= low`), `avgRange` is
 * non-negative. `avgRange[i]` is `null` during warmup
 * (`i < length - 1`). The implementation differs from the
 * `chart-line-hl-osc` primitive only in operation order
 * (range-then-SMA vs. SMA(high) - SMA(low)); by the linearity of
 * SMA the two are algebraically equivalent and yield identical
 * results on the bit-exact anchors below.
 *
 * Bit-exact anchors:
 * - **CONST high = low = K**: per-bar range = 0, so
 *   `avgRange = SMA(0) = 0` bit-exact post-warmup.
 * - **CONSTANT SPREAD high - low = D** (any baseLow, any L):
 *   per-bar range = D, so `avgRange = SMA(D) = D` bit-exact
 *   post-warmup.
 * - **LINEAR + CONSTANT SPREAD high = i + 1 + D, low = i + 1**:
 *   per-bar range = D, so `avgRange = D` bit-exact post-warmup.
 */

export interface ChartLineHlRangePoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineHlRangeZone = 'wide' | 'narrow' | 'neutral' | 'none';

export type ChartLineHlRangeCross = 'up' | 'down' | null;

export type ChartLineHlRangeSeriesId = 'price' | 'range';

export interface ChartLineHlRangeSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  range: number | null;
  avgRange: number | null;
  zone: ChartLineHlRangeZone;
  crossed: ChartLineHlRangeCross;
}

export interface ChartLineHlRangeRun {
  series: ChartLineHlRangePoint[];
  length: number;
  highThreshold: number;
  lowThreshold: number;
  rangeValues: Array<number | null>;
  avgRangeValues: Array<number | null>;
  samples: ChartLineHlRangeSample[];
  wideCount: number;
  narrowCount: number;
  neutralCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineHlRangeMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  avgRange: number;
  crossed: 'up' | 'down';
}

export interface ChartLineHlRangeDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHlRangeLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  rangeTop: number;
  rangeBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineHlRangeDot[];
  rangePath: string;
  highY: number;
  lowY: number;
  zeroY: number;
  markers: ChartLineHlRangeMarker[];
  priceMin: number;
  priceMax: number;
  rangeMin: number;
  rangeMax: number;
  run: ChartLineHlRangeRun;
}

export interface ChartLineHlRangeProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHlRangePoint[];
  length?: number;
  highThreshold?: number;
  lowThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  rangeColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showRange?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHlRangeSeriesId[];
  defaultHiddenSeries?: ChartLineHlRangeSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHlRangeSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineHlRangeSample }) => void;
  formatPrice?: (value: number) => string;
  formatRange?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HL_RANGE_WIDTH = 720;
export const DEFAULT_CHART_LINE_HL_RANGE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_HL_RANGE_PADDING = 44;
export const DEFAULT_CHART_LINE_HL_RANGE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_HL_RANGE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HL_RANGE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HL_RANGE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HL_RANGE_LENGTH = 14;
export const DEFAULT_CHART_LINE_HL_RANGE_HIGH_THRESHOLD = 1;
export const DEFAULT_CHART_LINE_HL_RANGE_LOW_THRESHOLD = 0;
export const DEFAULT_CHART_LINE_HL_RANGE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HL_RANGE_RANGE_COLOR = '#ca8a04';
export const DEFAULT_CHART_LINE_HL_RANGE_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HL_RANGE_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HL_RANGE_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_HL_RANGE_ZERO_COLOR = '#475569';
export const DEFAULT_CHART_LINE_HL_RANGE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HL_RANGE_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const posZero = (value: number): number => (value === 0 ? 0 : value);

/** Keep only points with finite OHLC fields. */
export function getLineHlRangeFinitePoints(
  data: readonly ChartLineHlRangePoint[] | null | undefined,
): ChartLineHlRangePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHlRangePoint[] = [];
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
export function normalizeLineHlRangeLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Coerce a numeric threshold (any finite real). */
export function normalizeLineHlRangeThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold)) return threshold;
  return fallback;
}

/** Per-bar high minus low (null propagation on missing inputs). */
export function applyLineHlRangeDifference(
  highs: readonly number[],
  lows: readonly number[],
): Array<number | null> {
  const n = Math.min(highs.length, lows.length);
  const out: Array<number | null> = [];
  for (let i = 0; i < n; i += 1) {
    const h = highs[i];
    const l = lows[i];
    if (!isFiniteNumber(h) || !isFiniteNumber(l)) {
      out.push(null);
      continue;
    }
    out.push(posZero(h - l));
  }
  return out;
}

/** Rolling SMA over a window of length bars. */
export function applyLineHlRangeSma(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length - 1) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? posZero(sum / length) : null);
  }
  return out;
}

export interface LineHlRangeChannels {
  range: Array<number | null>;
  avgRange: Array<number | null>;
}

/** Compute the per-bar range and the rolling SMA channels. */
export function computeLineHlRange(
  series: readonly ChartLineHlRangePoint[] | null | undefined,
  options: { length?: number } = {},
): LineHlRangeChannels {
  const cleaned = getLineHlRangeFinitePoints(series);
  if (cleaned.length === 0) {
    return { range: [], avgRange: [] };
  }
  const length = normalizeLineHlRangeLength(
    options.length,
    DEFAULT_CHART_LINE_HL_RANGE_LENGTH,
  );
  const highs = cleaned.map((p) => p.high);
  const lows = cleaned.map((p) => p.low);
  const range = applyLineHlRangeDifference(highs, lows);
  const avgRange = applyLineHlRangeSma(range, length);
  return { range, avgRange };
}

export function classifyLineHlRangeZone(
  value: number | null,
  highThreshold: number,
  lowThreshold: number,
): ChartLineHlRangeZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= highThreshold) return 'wide';
  if (value <= lowThreshold) return 'narrow';
  return 'neutral';
}

export function detectLineHlRangeCrosses(
  values: readonly (number | null)[],
  highThreshold: number,
  lowThreshold: number,
): ChartLineHlRangeCross[] {
  const out: ChartLineHlRangeCross[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      prev = null;
      continue;
    }
    if (prev == null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev < highThreshold && v >= highThreshold) {
      out.push('up');
    } else if (prev > lowThreshold && v <= lowThreshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

export function runLineHlRange(
  data: ChartLineHlRangePoint[],
  options: {
    length?: number;
    highThreshold?: number;
    lowThreshold?: number;
  } = {},
): ChartLineHlRangeRun {
  const cleaned = getLineHlRangeFinitePoints(data);
  const series = [...cleaned].sort((a, b) => a.x - b.x);
  const length = normalizeLineHlRangeLength(
    options.length,
    DEFAULT_CHART_LINE_HL_RANGE_LENGTH,
  );
  const highThreshold = normalizeLineHlRangeThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_HL_RANGE_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineHlRangeThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_HL_RANGE_LOW_THRESHOLD,
  );

  const channels = computeLineHlRange(series, { length });
  const crosses = detectLineHlRangeCrosses(
    channels.avgRange,
    highThreshold,
    lowThreshold,
  );

  const samples: ChartLineHlRangeSample[] = series.map((p, i) => {
    const range = channels.range[i] ?? null;
    const avgRange = channels.avgRange[i] ?? null;
    const zone = classifyLineHlRangeZone(
      avgRange,
      highThreshold,
      lowThreshold,
    );
    const crossed = crosses[i] ?? null;
    return {
      index: i,
      x: p.x,
      high: p.high,
      low: p.low,
      close: p.close,
      range,
      avgRange,
      zone,
      crossed,
    };
  });

  let wideCount = 0;
  let narrowCount = 0;
  let neutralCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const s of samples) {
    if (s.zone === 'wide') wideCount += 1;
    else if (s.zone === 'narrow') narrowCount += 1;
    else if (s.zone === 'neutral') neutralCount += 1;
    else noneCount += 1;
    if (s.crossed === 'up') bullishCrossCount += 1;
    else if (s.crossed === 'down') bearishCrossCount += 1;
  }

  const ok = series.length >= length;

  return {
    series,
    length,
    highThreshold,
    lowThreshold,
    rangeValues: channels.range,
    avgRangeValues: channels.avgRange,
    samples,
    wideCount,
    narrowCount,
    neutralCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok,
  };
}

export interface ComputeLineHlRangeLayoutOptions {
  data: ChartLineHlRangePoint[];
  length?: number;
  highThreshold?: number;
  lowThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
}

export function computeLineHlRangeLayout(
  opts: ComputeLineHlRangeLayoutOptions,
): ChartLineHlRangeLayout {
  const width = opts.width ?? DEFAULT_CHART_LINE_HL_RANGE_WIDTH;
  const height = opts.height ?? DEFAULT_CHART_LINE_HL_RANGE_HEIGHT;
  const padding = opts.padding ?? DEFAULT_CHART_LINE_HL_RANGE_PADDING;
  const panelGap = opts.panelGap ?? DEFAULT_CHART_LINE_HL_RANGE_PANEL_GAP;

  const run = runLineHlRange(opts.data, {
    length: opts.length ?? undefined,
    highThreshold: opts.highThreshold ?? undefined,
    lowThreshold: opts.lowThreshold ?? undefined,
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const usable = height - padding * 2 - panelGap;
  const priceTop = padding;
  const priceBottom = padding + usable * 0.55;
  const rangeTop = priceBottom + panelGap;
  const rangeBottom = priceBottom + panelGap + usable * 0.45;

  if (run.series.length === 0) {
    return {
      ok: false,
      width,
      height,
      padding,
      panelGap,
      priceTop,
      priceBottom,
      rangeTop,
      rangeBottom,
      innerLeft,
      innerRight,
      pricePath: '',
      priceDots: [],
      rangePath: '',
      highY: rangeTop,
      lowY: rangeBottom,
      zeroY: rangeBottom,
      markers: [],
      priceMin: 0,
      priceMax: 0,
      rangeMin: 0,
      rangeMax: 1,
      run,
    };
  }

  let priceMin = Infinity;
  let priceMax = -Infinity;
  for (const s of run.samples) {
    if (s.low < priceMin) priceMin = s.low;
    if (s.high > priceMax) priceMax = s.high;
  }
  if (!Number.isFinite(priceMin) || !Number.isFinite(priceMax)) {
    priceMin = 0;
    priceMax = 1;
  }
  if (priceMin === priceMax) {
    priceMin -= 1;
    priceMax += 1;
  }

  let rangeMin = 0;
  let rangeMax = Math.max(run.highThreshold + 0.5, 1);
  for (const s of run.samples) {
    if (s.avgRange == null) continue;
    if (s.avgRange < rangeMin) rangeMin = s.avgRange;
    if (s.avgRange > rangeMax) rangeMax = s.avgRange;
  }
  if (rangeMin === rangeMax) rangeMax += 1;

  const xMin = run.series[0]?.x ?? 0;
  const xMax = run.series[run.series.length - 1]?.x ?? xMin + 1;
  const xRange = xMax === xMin ? 1 : xMax - xMin;

  const sx = (x: number): number =>
    innerLeft + ((x - xMin) / xRange) * (innerRight - innerLeft);
  const syPrice = (y: number): number =>
    priceBottom -
    ((y - priceMin) / (priceMax - priceMin)) * (priceBottom - priceTop);
  const syRange = (y: number): number =>
    rangeBottom -
    ((y - rangeMin) / (rangeMax - rangeMin)) * (rangeBottom - rangeTop);

  let pricePath = '';
  const priceDots: ChartLineHlRangeDot[] = [];
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

  let rangePath = '';
  let firstR = true;
  for (let i = 0; i < run.samples.length; i += 1) {
    const s = run.samples[i];
    if (!s || s.avgRange == null) {
      firstR = true;
      continue;
    }
    const cx = sx(s.x);
    const cy = syRange(s.avgRange);
    rangePath += `${firstR ? 'M' : 'L'} ${cx.toFixed(2)} ${cy.toFixed(2)} `;
    firstR = false;
  }

  const markers: ChartLineHlRangeMarker[] = [];
  for (const s of run.samples) {
    if (s.crossed !== 'up' && s.crossed !== 'down') continue;
    if (s.avgRange == null) continue;
    markers.push({
      index: s.index,
      x: s.x,
      cx: sx(s.x),
      cy: syRange(s.avgRange),
      close: s.close,
      avgRange: s.avgRange,
      crossed: s.crossed,
    });
  }

  return {
    ok: true,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    rangeTop,
    rangeBottom,
    innerLeft,
    innerRight,
    pricePath: pricePath.trim(),
    priceDots,
    rangePath: rangePath.trim(),
    highY: syRange(run.highThreshold),
    lowY: syRange(run.lowThreshold),
    zeroY: syRange(0),
    markers,
    priceMin,
    priceMax,
    rangeMin,
    rangeMax,
    run,
  };
}

export function describeLineHlRangeChart(
  data: ChartLineHlRangePoint[],
  options: {
    length?: number;
    highThreshold?: number;
    lowThreshold?: number;
  } = {},
): string {
  const cleaned = getLineHlRangeFinitePoints(data);
  if (cleaned.length === 0) return 'No data';
  const length = normalizeLineHlRangeLength(
    options.length,
    DEFAULT_CHART_LINE_HL_RANGE_LENGTH,
  );
  const highThreshold = normalizeLineHlRangeThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_HL_RANGE_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineHlRangeThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_HL_RANGE_LOW_THRESHOLD,
  );
  return (
    `High-Low Range chart over ${cleaned.length} bars ` +
    `(length ${length}, highThreshold ${highThreshold}, ` +
    `lowThreshold ${lowThreshold}). Top panel renders the close; ` +
    `bottom panel renders the SMA-smoothed per-bar high minus low ` +
    `across the lookback.`
  );
}

const formatNumber = (value: number, digits = 2): string => {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
};

const defaultPriceFormatter = (value: number): string => formatNumber(value);
const defaultRangeFormatter = (value: number): string => formatNumber(value);
const defaultXFormatter = (x: number): string => formatNumber(x, 0);

export const ChartLineHlRange = forwardRef<
  HTMLDivElement,
  ChartLineHlRangeProps
>(function ChartLineHlRange(props, ref): ReactNode {
  const {
    data,
    length = DEFAULT_CHART_LINE_HL_RANGE_LENGTH,
    highThreshold = DEFAULT_CHART_LINE_HL_RANGE_HIGH_THRESHOLD,
    lowThreshold = DEFAULT_CHART_LINE_HL_RANGE_LOW_THRESHOLD,
    width = DEFAULT_CHART_LINE_HL_RANGE_WIDTH,
    height = DEFAULT_CHART_LINE_HL_RANGE_HEIGHT,
    padding = DEFAULT_CHART_LINE_HL_RANGE_PADDING,
    panelGap = DEFAULT_CHART_LINE_HL_RANGE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_HL_RANGE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HL_RANGE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HL_RANGE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HL_RANGE_PRICE_COLOR,
    rangeColor = DEFAULT_CHART_LINE_HL_RANGE_RANGE_COLOR,
    bullishColor = DEFAULT_CHART_LINE_HL_RANGE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_HL_RANGE_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_HL_RANGE_THRESHOLD_COLOR,
    zeroColor = DEFAULT_CHART_LINE_HL_RANGE_ZERO_COLOR,
    axisColor = DEFAULT_CHART_LINE_HL_RANGE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HL_RANGE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showRange = true,
    showMarkers = true,
    showThresholds = true,
    showZeroLine = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultPriceFormatter,
    formatRange = defaultRangeFormatter,
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
    () => getLineHlRangeFinitePoints(data),
    [data],
  );

  const layout = useMemo(
    () =>
      computeLineHlRangeLayout({
        data: cleaned,
        length,
        highThreshold,
        lowThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [
      cleaned,
      length,
      highThreshold,
      lowThreshold,
      width,
      height,
      padding,
      panelGap,
    ],
  );

  const isControlled = Array.isArray(hiddenSeries);
  const [uncontrolledHidden, setUncontrolledHidden] = useState<
    ChartLineHlRangeSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = isControlled
    ? (hiddenSeries ?? [])
    : uncontrolledHidden;
  const hidden = new Set(hiddenList);

  const handleLegendClick = (seriesId: ChartLineHlRangeSeriesId) => {
    const isHidden = hidden.has(seriesId);
    const next = isHidden
      ? hiddenList.filter((s) => s !== seriesId)
      : [...hiddenList, seriesId];
    if (!isControlled) setUncontrolledHidden(next);
    onSeriesToggle?.({ seriesId, hidden: !isHidden });
  };

  const handleLegendKey = (
    e: KeyboardEvent<HTMLButtonElement>,
    seriesId: ChartLineHlRangeSeriesId,
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
        data-section="chart-line-hl-range-empty"
      >
        No data
      </div>
    );
  }

  const desc =
    ariaDescription ??
    describeLineHlRangeChart(cleaned, {
      length,
      highThreshold,
      lowThreshold,
    });

  const showPrice = !hidden.has('price');
  const showRangeLine = !hidden.has('range') && showRange;

  const tickPriceValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickPriceValues.push(
      layout.priceMin + ((layout.priceMax - layout.priceMin) * i) / tickCount,
    );
  }
  const tickRangeValues: number[] = [];
  for (let i = 0; i <= tickCount; i += 1) {
    tickRangeValues.push(
      layout.rangeMin +
        ((layout.rangeMax - layout.rangeMin) * i) / tickCount,
    );
  }

  const tooltipSample =
    hoverIndex == null ? null : layout.run.samples[hoverIndex];

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      role="region"
      aria-label={ariaLabel ?? 'High-Low Range chart'}
      aria-describedby={descId}
      data-section="chart-line-hl-range"
      data-length={length}
      data-high-threshold={highThreshold}
      data-low-threshold={lowThreshold}
      data-total-points={cleaned.length}
    >
      <span
        id={titleId}
        className="sr-only"
        data-section="chart-line-hl-range-title"
      >
        {ariaLabel ?? 'High-Low Range chart'}
      </span>
      <span
        id={descId}
        className="sr-only"
        data-section="chart-line-hl-range-aria-desc"
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
        data-section="chart-line-hl-range-svg"
        {...rest}
      >
        {showGrid ? (
          <g data-section="chart-line-hl-range-grid">
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
                  data-section="chart-line-hl-range-grid-line-price"
                />
              );
            })}
            {tickRangeValues.map((v, i) => {
              const y =
                layout.rangeBottom -
                ((v - layout.rangeMin) /
                  (layout.rangeMax - layout.rangeMin)) *
                  (layout.rangeBottom - layout.rangeTop);
              return (
                <line
                  key={`grid-range-${i}`}
                  x1={layout.innerLeft}
                  y1={y}
                  x2={layout.innerRight}
                  y2={y}
                  stroke={gridColor}
                  strokeDasharray="3 3"
                  data-section="chart-line-hl-range-grid-line-range"
                />
              );
            })}
          </g>
        ) : null}

        {showAxis ? (
          <g data-section="chart-line-hl-range-axes">
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
              y1={layout.rangeTop}
              x2={layout.innerLeft}
              y2={layout.rangeBottom}
              stroke={axisColor}
            />
            <line
              x1={layout.innerLeft}
              y1={layout.rangeBottom}
              x2={layout.innerRight}
              y2={layout.rangeBottom}
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
                  data-section="chart-line-hl-range-tick-price"
                >
                  {formatPrice(v)}
                </text>
              );
            })}
            {tickRangeValues.map((v, i) => {
              const y =
                layout.rangeBottom -
                ((v - layout.rangeMin) /
                  (layout.rangeMax - layout.rangeMin)) *
                  (layout.rangeBottom - layout.rangeTop);
              return (
                <text
                  key={`tick-range-${i}`}
                  x={layout.innerLeft - 6}
                  y={y + 3}
                  fontSize={10}
                  fill={axisColor}
                  textAnchor="end"
                  data-section="chart-line-hl-range-tick-range"
                >
                  {formatRange(v)}
                </text>
              );
            })}
          </g>
        ) : null}

        {showZeroLine ? (
          <line
            x1={layout.innerLeft}
            y1={layout.zeroY}
            x2={layout.innerRight}
            y2={layout.zeroY}
            stroke={zeroColor}
            strokeDasharray="2 4"
            data-section="chart-line-hl-range-zero-line"
          />
        ) : null}

        {showThresholds ? (
          <g data-section="chart-line-hl-range-thresholds">
            <line
              x1={layout.innerLeft}
              y1={layout.highY}
              x2={layout.innerRight}
              y2={layout.highY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-hl-range-high-line"
            />
            <line
              x1={layout.innerLeft}
              y1={layout.lowY}
              x2={layout.innerRight}
              y2={layout.lowY}
              stroke={thresholdColor}
              strokeDasharray="4 4"
              data-section="chart-line-hl-range-low-line"
            />
          </g>
        ) : null}

        {showPrice ? (
          <path
            d={layout.pricePath}
            stroke={priceColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hl-range-price-path"
          />
        ) : null}

        {showDots && showPrice ? (
          <g data-section="chart-line-hl-range-price-dots">
            {layout.priceDots.map((d) => (
              <circle
                key={`price-dot-${d.index}`}
                cx={d.cx}
                cy={d.cy}
                r={dotRadius}
                fill={priceColor}
                data-section="chart-line-hl-range-price-dot"
              />
            ))}
          </g>
        ) : null}

        {showRangeLine ? (
          <path
            d={layout.rangePath}
            stroke={rangeColor}
            strokeWidth={strokeWidth}
            fill="none"
            data-section="chart-line-hl-range-line"
          />
        ) : null}

        {showMarkers && showRangeLine ? (
          <g data-section="chart-line-hl-range-markers">
            {layout.markers.map((m) => (
              <circle
                key={`range-marker-${m.index}`}
                cx={m.cx}
                cy={m.cy}
                r={dotRadius + 2}
                fill={m.crossed === 'up' ? bullishColor : bearishColor}
                role="graphics-symbol"
                tabIndex={0}
                onClick={() => {
                  const sample = layout.run.samples[m.index];
                  if (sample) onPointClick?.({ point: sample });
                }}
                data-section="chart-line-hl-range-marker"
                data-cross={m.crossed}
              />
            ))}
          </g>
        ) : null}

        {showTooltip ? (
          <g data-section="chart-line-hl-range-hover-targets">
            {layout.priceDots.map((d, idx) => (
              <rect
                key={`hover-${d.index}`}
                x={d.cx - 5}
                y={layout.priceTop}
                width={10}
                height={layout.rangeBottom - layout.priceTop}
                fill="transparent"
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
                onFocus={() => setHoverIndex(idx)}
                onBlur={() => setHoverIndex(null)}
                tabIndex={0}
                data-section="chart-line-hl-range-hover"
              />
            ))}
            {tooltipSample ? (
              <g
                transform={`translate(${layout.priceDots[hoverIndex ?? 0]?.cx ?? 0}, ${layout.priceTop + 8})`}
                data-section="chart-line-hl-range-tooltip"
              >
                <rect
                  x={4}
                  y={0}
                  width={180}
                  height={122}
                  rx={4}
                  fill="rgba(15, 23, 42, 0.92)"
                />
                <text
                  x={12}
                  y={16}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-range-tooltip-x"
                >
                  x {formatX(tooltipSample.x)}
                </text>
                <text
                  x={12}
                  y={30}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-range-tooltip-close"
                >
                  close {formatPrice(tooltipSample.close)}
                </text>
                <text
                  x={12}
                  y={44}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-range-tooltip-high"
                >
                  high {formatPrice(tooltipSample.high)}
                </text>
                <text
                  x={12}
                  y={58}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-range-tooltip-low"
                >
                  low {formatPrice(tooltipSample.low)}
                </text>
                <text
                  x={12}
                  y={72}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-range-tooltip-range"
                >
                  range{' '}
                  {tooltipSample.range == null
                    ? '--'
                    : formatRange(tooltipSample.range)}
                </text>
                <text
                  x={12}
                  y={86}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-range-tooltip-avg"
                >
                  avgRange{' '}
                  {tooltipSample.avgRange == null
                    ? '--'
                    : formatRange(tooltipSample.avgRange)}
                </text>
                <text
                  x={12}
                  y={100}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-range-tooltip-zone"
                >
                  zone {tooltipSample.zone}
                </text>
                <text
                  x={12}
                  y={114}
                  fill="#f8fafc"
                  fontSize={11}
                  data-section="chart-line-hl-range-tooltip-cross"
                >
                  cross {tooltipSample.crossed ?? '--'}
                </text>
              </g>
            ) : null}
          </g>
        ) : null}
      </svg>

      {showConfigBadge ? (
        <div
          data-section="chart-line-hl-range-badge"
          style={{
            display: 'inline-block',
            padding: '2px 6px',
            fontSize: 10,
            border: `1px solid ${axisColor}`,
            borderRadius: 4,
            marginTop: 4,
          }}
        >
          length {length} | high {highThreshold} | low {lowThreshold}
        </div>
      ) : null}

      {showLegend ? (
        <div
          role="group"
          aria-label="Series legend"
          data-section="chart-line-hl-range-legend"
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 4,
          }}
        >
          <button
            type="button"
            data-series-id="price"
            aria-pressed={!hidden.has('price')}
            onClick={() => handleLegendClick('price')}
            onKeyDown={(e) => handleLegendKey(e, 'price')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('price') ? 0.4 : 1,
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
                background: priceColor,
                borderRadius: 2,
              }}
            />
            close
          </button>
          <button
            type="button"
            data-series-id="range"
            aria-pressed={!hidden.has('range')}
            onClick={() => handleLegendClick('range')}
            onKeyDown={(e) => handleLegendKey(e, 'range')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 6px',
              fontSize: 11,
              opacity: hidden.has('range') ? 0.4 : 1,
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
                background: rangeColor,
                borderRadius: 2,
              }}
            />
            hl range
          </button>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHlRange.displayName = 'ChartLineHlRange';
