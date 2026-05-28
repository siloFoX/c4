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
 * ChartLineHlPct -- pure-SVG dual-panel chart with the close on the
 * top panel and a "High Low percent of price" oscillator on the bottom
 * panel. Each bar is scored by the size of its range as a percentage
 * of the midpoint, then smoothed with a rolling SMA across the
 * lookback:
 *
 *   midpoint[i] = (high[i] + low[i]) / 2
 *   raw[i]      = (high[i] - low[i]) / |midpoint[i]| * 100
 *   hlPct[i]    = SMA(raw, length)[i]
 *
 * `raw[i]` is `null` when `midpoint == 0` (degenerate flat-at-zero
 * bar). `hlPct[i]` is `null` during warmup (`i < length - 1`) and
 * whenever any raw value in the window is `null`/non-finite.
 *
 * Markers fire on volatility-threshold crossings: when the smoothed
 * line crosses above `volatilityThreshold` it triggers `'up'`,
 * mirror for `'down'`.
 *
 * Bit-exact anchor: **CONST high=low=K** (`K != 0`): `raw = 0` at
 * every bar, SMA of zero is zero -> `hlPct = 0` (bit-exact).
 * Verified across `K` and `length` combinations.
 *
 * Additional bit-exact anchor: **CONST high=12, low=8**: midpoint =
 * 10, raw = `4 / 10 * 100 = 40` at every bar (integer dyadic
 * arithmetic), SMA = 40 -> `hlPct = 40` exactly.
 *
 * Degenerate **CONST high=low=0** -> midpoint = 0 -> raw = null
 * everywhere -> hlPct = null.
 */

export interface ChartLineHlPctPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineHlPctZone = 'high' | 'low' | 'flat' | 'none';

export type ChartLineHlPctCross = 'up' | 'down' | null;

export type ChartLineHlPctSeriesId = 'price' | 'hlPct';

export interface ChartLineHlPctSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  midpoint: number;
  raw: number | null;
  hlPct: number | null;
  zone: ChartLineHlPctZone;
  crossed: ChartLineHlPctCross;
}

export interface ChartLineHlPctRun {
  series: ChartLineHlPctPoint[];
  length: number;
  volatilityThreshold: number;
  rawValues: Array<number | null>;
  hlPctValues: Array<number | null>;
  samples: ChartLineHlPctSample[];
  highCount: number;
  lowCount: number;
  flatCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineHlPctMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  hlPct: number;
  crossed: 'up' | 'down';
}

export interface ChartLineHlPctDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHlPctLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  hlPctTop: number;
  hlPctBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineHlPctDot[];
  hlPctPath: string;
  thresholdY: number;
  markers: ChartLineHlPctMarker[];
  priceMin: number;
  priceMax: number;
  hlPctMin: number;
  hlPctMax: number;
  run: ChartLineHlPctRun;
}

export interface ChartLineHlPctProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHlPctPoint[];
  length?: number;
  volatilityThreshold?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  hlPctColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showHlPct?: boolean;
  showMarkers?: boolean;
  showThreshold?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHlPctSeriesId[];
  defaultHiddenSeries?: ChartLineHlPctSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHlPctSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineHlPctSample }) => void;
  formatPrice?: (value: number) => string;
  formatPct?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HL_PCT_WIDTH = 720;
export const DEFAULT_CHART_LINE_HL_PCT_HEIGHT = 460;
export const DEFAULT_CHART_LINE_HL_PCT_PADDING = 44;
export const DEFAULT_CHART_LINE_HL_PCT_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_HL_PCT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HL_PCT_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HL_PCT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HL_PCT_LENGTH = 14;
export const DEFAULT_CHART_LINE_HL_PCT_VOLATILITY_THRESHOLD = 5;
export const DEFAULT_CHART_LINE_HL_PCT_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HL_PCT_HL_PCT_COLOR = '#db2777';
export const DEFAULT_CHART_LINE_HL_PCT_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HL_PCT_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HL_PCT_THRESHOLD_COLOR = '#475569';
export const DEFAULT_CHART_LINE_HL_PCT_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HL_PCT_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC fields. */
export function getLineHlPctFinitePoints(
  data: readonly ChartLineHlPctPoint[] | null | undefined,
): ChartLineHlPctPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHlPctPoint[] = [];
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

/** Coerce a positive integer length (>= 1). */
export function normalizeLineHlPctLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Coerce a non-negative finite volatility threshold. */
export function normalizeLineHlPctVolatilityThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold) && threshold >= 0) return threshold;
  return fallback;
}

/**
 * Per-bar raw HL% reading: `(high - low) / |midpoint| * 100`.
 * Returns `null` when `midpoint == 0` (degenerate flat-at-zero bar).
 */
export function computeLineHlPctRawSeries(
  series: readonly ChartLineHlPctPoint[],
): Array<number | null> {
  const out: Array<number | null> = [];
  for (const point of series) {
    const midpoint = (point.high + point.low) / 2;
    if (!isFiniteNumber(midpoint) || midpoint === 0) {
      out.push(null);
      continue;
    }
    const raw = ((point.high - point.low) / Math.abs(midpoint)) * 100;
    if (!isFiniteNumber(raw)) {
      out.push(null);
      continue;
    }
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

/** SMA over the raw HL% series. */
export function applyLineHlPctSma(
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
    out.push(ok ? sum / length : null);
  }
  return out;
}

export interface ChartLineHlPctOptions {
  length?: number;
  volatilityThreshold?: number;
}

export interface ChartLineHlPctChannels {
  raw: Array<number | null>;
  hlPct: Array<number | null>;
}

/** Compute the HL% pipeline. */
export function computeLineHlPct(
  series: readonly ChartLineHlPctPoint[] | null | undefined,
  options: ChartLineHlPctOptions = {},
): ChartLineHlPctChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return { raw: [], hlPct: [] };
  }
  const length = normalizeLineHlPctLength(
    options.length,
    DEFAULT_CHART_LINE_HL_PCT_LENGTH,
  );
  const raw = computeLineHlPctRawSeries(series);
  const hlPct = applyLineHlPctSma(raw, length);
  return { raw, hlPct };
}

/** Classify a hlPct reading. */
export function classifyLineHlPctZone(
  value: number | null,
  threshold: number,
): ChartLineHlPctZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value >= threshold) return 'high';
  if (value > 0) return 'low';
  return 'flat';
}

/**
 * Detect volatility-threshold crosses. A bar transitions `'up'` when
 * the previous defined value was `< threshold` and the current is
 * `>= threshold`; `'down'` is the mirror.
 */
export function detectLineHlPctCrosses(
  values: readonly (number | null)[],
  threshold: number,
): Array<ChartLineHlPctCross> {
  const out: Array<ChartLineHlPctCross> = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null || !isFiniteNumber(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) {
      out.push(null);
      prev = v;
      continue;
    }
    if (prev < threshold && v >= threshold) {
      out.push('up');
    } else if (prev >= threshold && v < threshold) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineHlPct(
  data: readonly ChartLineHlPctPoint[] | null | undefined,
  options: ChartLineHlPctOptions = {},
): ChartLineHlPctRun {
  const series = getLineHlPctFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineHlPctLength(
    options.length,
    DEFAULT_CHART_LINE_HL_PCT_LENGTH,
  );
  const volatilityThreshold = normalizeLineHlPctVolatilityThreshold(
    options.volatilityThreshold,
    DEFAULT_CHART_LINE_HL_PCT_VOLATILITY_THRESHOLD,
  );
  const channels = computeLineHlPct(series, { length });
  const crosses = detectLineHlPctCrosses(
    channels.hlPct,
    volatilityThreshold,
  );
  const samples: ChartLineHlPctSample[] = series.map((point, index) => {
    const value = channels.hlPct[index] ?? null;
    const midpoint = (point.high + point.low) / 2;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      midpoint,
      raw: channels.raw[index] ?? null,
      hlPct: value,
      zone: classifyLineHlPctZone(value, volatilityThreshold),
      crossed: crosses[index] ?? null,
    };
  });
  let highCount = 0;
  let lowCount = 0;
  let flatCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'high') highCount += 1;
    else if (sample.zone === 'low') lowCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series = [],
    length,
    volatilityThreshold,
    rawValues: channels.raw,
    hlPctValues: channels.hlPct,
    samples,
    highCount,
    lowCount,
    flatCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length,
  };
}

export interface ChartLineHlPctLayoutOptions extends ChartLineHlPctOptions {
  data: readonly ChartLineHlPctPoint[] | null | undefined;
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
export function computeLineHlPctLayout(
  options: ChartLineHlPctLayoutOptions,
): ChartLineHlPctLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_HL_PCT_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_HL_PCT_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_HL_PCT_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_HL_PCT_PANEL_GAP;

  const run = runLineHlPct(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
    ...(options.volatilityThreshold !== undefined
      ? { volatilityThreshold: options.volatilityThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const hlPctHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const hlPctTop = priceBottom + panelGap;
  const hlPctBottom = hlPctTop + hlPctHeight;

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

  // HL% is always >= 0 by construction (|midpoint| guards sign).
  let hlPctMax = 0;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.hlPct) && sample.hlPct > hlPctMax) {
      hlPctMax = sample.hlPct;
    }
  }
  if (run.volatilityThreshold > hlPctMax) {
    hlPctMax = run.volatilityThreshold * 1.25;
  }
  if (hlPctMax === 0) hlPctMax = 1;
  const hlPctMin = 0;
  const hlPctY = (value: number): number =>
    hlPctBottom - ((value - hlPctMin) / (hlPctMax - hlPctMin)) * hlPctHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineHlPctDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const hlPctLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineHlPctMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.hlPct)) return;
    const cx = xAt(index);
    const yc = hlPctY(sample.hlPct);
    hlPctLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        hlPct: sample.hlPct,
        crossed: sample.crossed,
      });
    }
  });

  const thresholdY = hlPctY(run.volatilityThreshold);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    hlPctTop,
    hlPctBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    hlPctPath: buildLinePath(hlPctLinePoints),
    thresholdY,
    markers,
    priceMin,
    priceMax,
    hlPctMin,
    hlPctMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineHlPctChart(
  data: readonly ChartLineHlPctPoint[] | null | undefined,
  options: ChartLineHlPctOptions = {},
): string {
  const run = runLineHlPct(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a High Low percent of price oscillator ` +
    `beneath the close (length ${run.length}, volatilityThreshold ` +
    `${run.volatilityThreshold}). The bar range as a percentage of ` +
    `the midpoint is smoothed with a rolling SMA: hlPct = SMA((high ` +
    `- low) / |midpoint| * 100, length). Across ${total} bars the ` +
    `detector saw ${run.highCount} high-volatility, ${run.lowCount} ` +
    `low-volatility, ${run.flatCount} flat, and ${run.noneCount} ` +
    `undefined readings, with ${run.bullishCrossCount} bullish and ` +
    `${run.bearishCrossCount} bearish threshold crosses.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatPct(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return `${value.toFixed(2)}%`;
}

function defaultFormatX(x: number): string {
  return String(x);
}

function markerColorOf(
  crossed: 'up' | 'down',
  bullishColor: string,
  bearishColor: string,
): string {
  if (crossed === 'up') return bullishColor;
  return bearishColor;
}

function zoneLabelOf(zone: ChartLineHlPctZone): string {
  if (zone === 'high') return 'High volatility';
  if (zone === 'low') return 'Low volatility';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineHlPctCross): string {
  if (crossed === 'up') return 'Threshold up';
  if (crossed === 'down') return 'Threshold down';
  return '-';
}

/** ChartLineHlPct -- dual-panel pure-SVG chart. */
export const ChartLineHlPct = forwardRef<
  HTMLDivElement,
  ChartLineHlPctProps
>(function ChartLineHlPct(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_HL_PCT_LENGTH,
    volatilityThreshold = DEFAULT_CHART_LINE_HL_PCT_VOLATILITY_THRESHOLD,
    width = DEFAULT_CHART_LINE_HL_PCT_WIDTH,
    height = DEFAULT_CHART_LINE_HL_PCT_HEIGHT,
    padding = DEFAULT_CHART_LINE_HL_PCT_PADDING,
    panelGap = DEFAULT_CHART_LINE_HL_PCT_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_HL_PCT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HL_PCT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HL_PCT_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HL_PCT_PRICE_COLOR,
    hlPctColor = DEFAULT_CHART_LINE_HL_PCT_HL_PCT_COLOR,
    bullishColor = DEFAULT_CHART_LINE_HL_PCT_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_HL_PCT_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_HL_PCT_THRESHOLD_COLOR,
    axisColor = DEFAULT_CHART_LINE_HL_PCT_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HL_PCT_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showHlPct = true,
    showMarkers = true,
    showThreshold = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatPct = defaultFormatPct,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-hl-pct-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineHlPctSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineHlPctSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineHlPctLayout({
        data,
        length,
        volatilityThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, length, volatilityThreshold, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineHlPctChart(data, { length, volatilityThreshold });
  const resolvedLabel =
    ariaLabel ?? `High Low percent chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineHlPctSeriesId): void => {
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
    const tooltipW = 260;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g data-section="chart-line-hl-pct-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={166}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-hl-pct-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-hl-pct-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatPrice(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-hl-pct-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-hl-pct-tooltip-close"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-hl-pct-tooltip-mid"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Midpoint: ${formatPrice(hoverSample.midpoint)}`}
        </text>
        <text
          data-section="chart-line-hl-pct-tooltip-raw"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Raw HL%: ${
            hoverSample.raw === null ? 'n/a' : formatPct(hoverSample.raw)
          }`}
        </text>
        <text
          data-section="chart-line-hl-pct-tooltip-hl-pct"
          x={tx + 10}
          y={ty + 117}
          fill="#fbcfe8"
          fontSize={11}
          fontWeight={600}
        >
          {`HL% SMA: ${
            hoverSample.hlPct === null
              ? 'n/a'
              : formatPct(hoverSample.hlPct)
          }`}
        </text>
        <text
          data-section="chart-line-hl-pct-tooltip-zone"
          x={tx + 10}
          y={ty + 135}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-hl-pct-tooltip-cross"
          x={tx + 10}
          y={ty + 151}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const hlPctHidden = isHidden('hlPct') || !showHlPct;

  const legendItems: Array<{
    id: ChartLineHlPctSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'hlPct', label: 'HL%', color: hlPctColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-hl-pct"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-volatility-threshold={run.volatilityThreshold}
      data-high-count={run.highCount}
      data-low-count={run.lowCount}
      data-flat-count={run.flatCount}
      data-none-count={run.noneCount}
      data-bullish-cross-count={run.bullishCrossCount}
      data-bearish-cross-count={run.bearishCrossCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-hl-pct-aria-desc"
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
          data-section="chart-line-hl-pct-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-hl-pct-empty"
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
          data-section="chart-line-hl-pct-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-hl-pct-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.hlPctBottom -
                  t * (layout.hlPctBottom - layout.hlPctTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-hl-pct-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-hl-pct-grid-line"
                      data-panel="hlPct"
                      x1={layout.innerLeft}
                      y1={yk}
                      x2={layout.innerRight}
                      y2={yk}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-hl-pct-axes">
              <line
                data-section="chart-line-hl-pct-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hl-pct-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hl-pct-axis"
                data-panel="hlPct"
                x1={layout.innerLeft}
                y1={layout.hlPctTop}
                x2={layout.innerLeft}
                y2={layout.hlPctBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hl-pct-axis"
                data-panel="hlPct"
                x1={layout.innerLeft}
                y1={layout.hlPctBottom}
                x2={layout.innerRight}
                y2={layout.hlPctBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-hl-pct-tick-label"
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
                data-section="chart-line-hl-pct-tick-label"
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
                data-section="chart-line-hl-pct-tick-label"
                data-panel="hlPct"
                x={layout.innerLeft - 6}
                y={layout.hlPctTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPct(layout.hlPctMax)}
              </text>
              <text
                data-section="chart-line-hl-pct-tick-label"
                data-panel="hlPct"
                x={layout.innerLeft - 6}
                y={layout.hlPctBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {`0`}
              </text>
            </g>
          ) : null}

          {showThreshold ? (
            <line
              data-section="chart-line-hl-pct-threshold-line"
              x1={layout.innerLeft}
              y1={layout.thresholdY}
              x2={layout.innerRight}
              y2={layout.thresholdY}
              stroke={thresholdColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-hl-pct-price-path"
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
            <g data-section="chart-line-hl-pct-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-hl-pct-dot"
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

          {!hlPctHidden ? (
            <path
              data-section="chart-line-hl-pct-line"
              d={layout.hlPctPath}
              fill="none"
              stroke={hlPctColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`HL percent line, length ${run.length}`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-hl-pct-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-hl-pct-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-hl-pct={marker.hlPct}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={markerColorOf(
                    marker.crossed,
                    bullishColor,
                    bearishColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, HL% ${formatPct(marker.hlPct)}, ${crossLabelOf(
                    marker.crossed,
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
            <g data-section="chart-line-hl-pct-badge">
              <rect
                data-section="chart-line-hl-pct-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={200}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-hl-pct-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`HL% SMA ${run.length}/T>=${run.volatilityThreshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-hl-pct-legend"
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
                data-section="chart-line-hl-pct-legend-item"
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
                  data-section="chart-line-hl-pct-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-hl-pct-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-hl-pct-legend-stats"
            style={{ color: axisColor }}
          >
            {`high ${run.highCount} / low ${run.lowCount} / crosses ${run.bullishCrossCount + run.bearishCrossCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHlPct.displayName = 'ChartLineHlPct';
