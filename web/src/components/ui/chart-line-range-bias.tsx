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
 * ChartLineRangeBias -- pure-SVG dual-panel chart with the close on
 * top and a per-bar Range Bias positional ratio on the bottom. Each
 * bar maps the close into `[-0.5, +0.5]` relative to its own
 * high/low range, indicating whether the bar closed in the upper or
 * lower half of its trading band:
 *
 *   midpoint[i] = (high[i] + low[i]) / 2
 *   range[i]    = high[i] - low[i]
 *   bias[i]     = range[i] > 0
 *                  ? (close[i] - midpoint[i]) / range[i]
 *                  : null
 *
 * `bias[i]` is `null` when `range[i] <= 0` (degenerate bar with
 * `high == low`) or when any input is non-finite.
 *
 * Bit-exact testability anchors (per-bar, no lookback):
 * - **close=high**: numerator = `high - (high+low)/2 = (high-low)/2`,
 *   denominator = `high - low`, so `bias = 0.5` (dyadic-exact).
 * - **close=low**: mirror -> `bias = -0.5` (dyadic-exact).
 * - **close=midpoint**: numerator = 0, `bias = 0` (bit-exact).
 * - **high=low**: divide-by-zero guard -> `bias = null`.
 *
 * Useful as a low-cost trend filter: bias >= +threshold suggests
 * bullish close-in-band; bias <= -threshold suggests bearish.
 */

export interface ChartLineRangeBiasPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineRangeBiasZone =
  | 'bullish'
  | 'bearish'
  | 'neutral'
  | 'flat'
  | 'none';

export type ChartLineRangeBiasCross = 'up' | 'down' | null;

export type ChartLineRangeBiasSeriesId = 'price' | 'bias';

export interface ChartLineRangeBiasSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  midpoint: number;
  range: number;
  bias: number | null;
  zone: ChartLineRangeBiasZone;
  crossed: ChartLineRangeBiasCross;
}

export interface ChartLineRangeBiasRun {
  series: ChartLineRangeBiasPoint[];
  highThreshold: number;
  lowThreshold: number;
  biasValues: Array<number | null>;
  samples: ChartLineRangeBiasSample[];
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  flatCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineRangeBiasMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  bias: number;
  crossed: 'up' | 'down';
}

export interface ChartLineRangeBiasDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineRangeBiasLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  biasTop: number;
  biasBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineRangeBiasDot[];
  biasPath: string;
  highThresholdY: number;
  lowThresholdY: number;
  zeroLineY: number;
  markers: ChartLineRangeBiasMarker[];
  priceMin: number;
  priceMax: number;
  biasMin: number;
  biasMax: number;
  run: ChartLineRangeBiasRun;
}

export interface ChartLineRangeBiasProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineRangeBiasPoint[];
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
  biasColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  thresholdColor?: string;
  zeroLineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBias?: boolean;
  showMarkers?: boolean;
  showThresholds?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineRangeBiasSeriesId[];
  defaultHiddenSeries?: ChartLineRangeBiasSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineRangeBiasSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineRangeBiasSample }) => void;
  formatPrice?: (value: number) => string;
  formatBias?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_RANGE_BIAS_WIDTH = 720;
export const DEFAULT_CHART_LINE_RANGE_BIAS_HEIGHT = 460;
export const DEFAULT_CHART_LINE_RANGE_BIAS_PADDING = 44;
export const DEFAULT_CHART_LINE_RANGE_BIAS_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_RANGE_BIAS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_RANGE_BIAS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_RANGE_BIAS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_RANGE_BIAS_HIGH_THRESHOLD = 0.3;
export const DEFAULT_CHART_LINE_RANGE_BIAS_LOW_THRESHOLD = -0.3;
export const DEFAULT_CHART_LINE_RANGE_BIAS_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_RANGE_BIAS_BIAS_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RANGE_BIAS_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_RANGE_BIAS_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_RANGE_BIAS_THRESHOLD_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_RANGE_BIAS_ZERO_LINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_RANGE_BIAS_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_RANGE_BIAS_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite OHLC fields. */
export function getLineRangeBiasFinitePoints(
  data: readonly ChartLineRangeBiasPoint[] | null | undefined,
): ChartLineRangeBiasPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineRangeBiasPoint[] = [];
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

/** Coerce a finite threshold value. */
export function normalizeLineRangeBiasThreshold(
  threshold: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(threshold)) return threshold;
  return fallback;
}

export interface ChartLineRangeBiasOptions {
  highThreshold?: number;
  lowThreshold?: number;
}

export interface ChartLineRangeBiasChannels {
  bias: Array<number | null>;
}

/** Compute the per-bar Range Bias values. */
export function computeLineRangeBias(
  series: readonly ChartLineRangeBiasPoint[] | null | undefined,
): ChartLineRangeBiasChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return { bias: [] };
  }
  const bias: Array<number | null> = [];
  for (const point of series) {
    if (
      !isFiniteNumber(point.high) ||
      !isFiniteNumber(point.low) ||
      !isFiniteNumber(point.close)
    ) {
      bias.push(null);
      continue;
    }
    const range = point.high - point.low;
    if (range <= 0) {
      bias.push(null);
      continue;
    }
    const midpoint = (point.high + point.low) / 2;
    const raw = (point.close - midpoint) / range;
    bias.push(raw === 0 ? 0 : raw);
  }
  return { bias };
}

/** Classify a bias reading. */
export function classifyLineRangeBiasZone(
  value: number | null,
  highThreshold: number,
  lowThreshold: number,
): ChartLineRangeBiasZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value === 0) return 'flat';
  if (value >= highThreshold) return 'bullish';
  if (value <= lowThreshold) return 'bearish';
  return 'neutral';
}

/**
 * Detect threshold crosses. `'up'` when prev `< highThreshold` and
 * current `>= highThreshold`; `'down'` when prev `> lowThreshold`
 * and current `<= lowThreshold`.
 */
export function detectLineRangeBiasCrosses(
  values: readonly (number | null)[],
  highThreshold: number,
  lowThreshold: number,
): Array<ChartLineRangeBiasCross> {
  const out: Array<ChartLineRangeBiasCross> = [];
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

/** Run the full pipeline plus sample classification. */
export function runLineRangeBias(
  data: readonly ChartLineRangeBiasPoint[] | null | undefined,
  options: ChartLineRangeBiasOptions = {},
): ChartLineRangeBiasRun {
  const series = getLineRangeBiasFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const highThreshold = normalizeLineRangeBiasThreshold(
    options.highThreshold,
    DEFAULT_CHART_LINE_RANGE_BIAS_HIGH_THRESHOLD,
  );
  const lowThreshold = normalizeLineRangeBiasThreshold(
    options.lowThreshold,
    DEFAULT_CHART_LINE_RANGE_BIAS_LOW_THRESHOLD,
  );
  const channels = computeLineRangeBias(series);
  const crosses = detectLineRangeBiasCrosses(
    channels.bias,
    highThreshold,
    lowThreshold,
  );
  const samples: ChartLineRangeBiasSample[] = series.map((point, index) => {
    const value = channels.bias[index] ?? null;
    const midpoint = (point.high + point.low) / 2;
    const range = point.high - point.low;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      midpoint,
      range,
      bias: value,
      zone: classifyLineRangeBiasZone(value, highThreshold, lowThreshold),
      crossed: crosses[index] ?? null,
    };
  });
  let bullishCount = 0;
  let bearishCount = 0;
  let neutralCount = 0;
  let flatCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'bullish') bullishCount += 1;
    else if (sample.zone === 'bearish') bearishCount += 1;
    else if (sample.zone === 'neutral') neutralCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series = [],
    highThreshold,
    lowThreshold,
    biasValues: channels.bias,
    samples,
    bullishCount,
    bearishCount,
    neutralCount,
    flatCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= 1,
  };
}

export interface ChartLineRangeBiasLayoutOptions
  extends ChartLineRangeBiasOptions {
  data: readonly ChartLineRangeBiasPoint[] | null | undefined;
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
export function computeLineRangeBiasLayout(
  options: ChartLineRangeBiasLayoutOptions,
): ChartLineRangeBiasLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_RANGE_BIAS_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_RANGE_BIAS_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_RANGE_BIAS_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_RANGE_BIAS_PANEL_GAP;

  const run = runLineRangeBias(options.data, {
    ...(options.highThreshold !== undefined
      ? { highThreshold: options.highThreshold }
      : {}),
    ...(options.lowThreshold !== undefined
      ? { lowThreshold: options.lowThreshold }
      : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const biasHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const biasTop = priceBottom + panelGap;
  const biasBottom = biasTop + biasHeight;

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

  // Bias is theoretically bounded by [-0.5, +0.5]. Fix the axis at
  // those bounds so the panel reads as a stable positional gauge.
  const biasMin = -0.5;
  const biasMax = 0.5;
  const biasY = (value: number): number =>
    biasBottom - ((value - biasMin) / (biasMax - biasMin)) * biasHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineRangeBiasDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const biasLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineRangeBiasMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.bias)) return;
    const cx = xAt(index);
    const yc = biasY(sample.bias);
    biasLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        bias: sample.bias,
        crossed: sample.crossed,
      });
    }
  });

  const highThresholdY = biasY(run.highThreshold);
  const lowThresholdY = biasY(run.lowThreshold);
  const zeroLineY = biasY(0);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    biasTop,
    biasBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    biasPath: buildLinePath(biasLinePoints),
    highThresholdY,
    lowThresholdY,
    zeroLineY,
    markers,
    priceMin,
    priceMax,
    biasMin,
    biasMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineRangeBiasChart(
  data: readonly ChartLineRangeBiasPoint[] | null | undefined,
  options: ChartLineRangeBiasOptions = {},
): string {
  const run = runLineRangeBias(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a per-bar Range Bias positional ratio on ` +
    `the lower panel (highThreshold ${run.highThreshold}, lowThreshold ` +
    `${run.lowThreshold}). Each bar reports ` +
    `(close - midpoint) / (high - low) in [-0.5, +0.5]. Across ` +
    `${total} bars the bias was bullish on ${run.bullishCount}, ` +
    `bearish on ${run.bearishCount}, neutral on ${run.neutralCount}, ` +
    `flat on ${run.flatCount}, and undefined on ${run.noneCount}, ` +
    `with ${run.bullishCrossCount} crosses up and ` +
    `${run.bearishCrossCount} crosses down.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatBias(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return value.toFixed(4);
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

function zoneLabelOf(zone: ChartLineRangeBiasZone): string {
  if (zone === 'bullish') return 'Bullish';
  if (zone === 'bearish') return 'Bearish';
  if (zone === 'neutral') return 'Neutral';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineRangeBiasCross): string {
  if (crossed === 'up') return 'Entered bullish';
  if (crossed === 'down') return 'Entered bearish';
  return '-';
}

/** ChartLineRangeBias -- dual-panel pure-SVG chart. */
export const ChartLineRangeBias = forwardRef<
  HTMLDivElement,
  ChartLineRangeBiasProps
>(function ChartLineRangeBias(props, ref) {
  const {
    data,
    highThreshold = DEFAULT_CHART_LINE_RANGE_BIAS_HIGH_THRESHOLD,
    lowThreshold = DEFAULT_CHART_LINE_RANGE_BIAS_LOW_THRESHOLD,
    width = DEFAULT_CHART_LINE_RANGE_BIAS_WIDTH,
    height = DEFAULT_CHART_LINE_RANGE_BIAS_HEIGHT,
    padding = DEFAULT_CHART_LINE_RANGE_BIAS_PADDING,
    panelGap = DEFAULT_CHART_LINE_RANGE_BIAS_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_RANGE_BIAS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_RANGE_BIAS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_RANGE_BIAS_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_RANGE_BIAS_PRICE_COLOR,
    biasColor = DEFAULT_CHART_LINE_RANGE_BIAS_BIAS_COLOR,
    bullishColor = DEFAULT_CHART_LINE_RANGE_BIAS_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_RANGE_BIAS_BEARISH_COLOR,
    thresholdColor = DEFAULT_CHART_LINE_RANGE_BIAS_THRESHOLD_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_RANGE_BIAS_ZERO_LINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_RANGE_BIAS_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_RANGE_BIAS_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showBias = true,
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
    formatPrice = defaultFormatPrice,
    formatBias = defaultFormatBias,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-range-bias-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineRangeBiasSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineRangeBiasSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineRangeBiasLayout({
        data,
        highThreshold,
        lowThreshold,
        width,
        height,
        padding,
        panelGap,
      }),
    [data, highThreshold, lowThreshold, width, height, padding, panelGap],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineRangeBiasChart(data, { highThreshold, lowThreshold });
  const resolvedLabel = ariaLabel ?? `Range Bias chart`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineRangeBiasSeriesId): void => {
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
      <g
        data-section="chart-line-range-bias-tooltip"
        pointerEvents="none"
      >
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
          data-section="chart-line-range-bias-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-range-bias-tooltip-high"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`High: ${formatPrice(hoverSample.high)}`}
        </text>
        <text
          data-section="chart-line-range-bias-tooltip-low"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Low: ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-range-bias-tooltip-close"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-range-bias-tooltip-mid"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Midpoint: ${formatPrice(hoverSample.midpoint)}`}
        </text>
        <text
          data-section="chart-line-range-bias-tooltip-range"
          x={tx + 10}
          y={ty + 99}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Range: ${formatPrice(hoverSample.range)}`}
        </text>
        <text
          data-section="chart-line-range-bias-tooltip-bias"
          x={tx + 10}
          y={ty + 119}
          fill="#86efac"
          fontSize={11}
          fontWeight={600}
        >
          {`Bias: ${
            hoverSample.bias === null
              ? 'n/a'
              : formatBias(hoverSample.bias)
          }`}
        </text>
        <text
          data-section="chart-line-range-bias-tooltip-zone"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-range-bias-tooltip-cross"
          x={tx + 10}
          y={ty + 153}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const biasHidden = isHidden('bias') || !showBias;

  const legendItems: Array<{
    id: ChartLineRangeBiasSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'bias', label: 'Range Bias', color: biasColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-range-bias"
      data-empty={isEmpty ? 'true' : 'false'}
      data-high-threshold={run.highThreshold}
      data-low-threshold={run.lowThreshold}
      data-bullish-count={run.bullishCount}
      data-bearish-count={run.bearishCount}
      data-neutral-count={run.neutralCount}
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
        data-section="chart-line-range-bias-aria-desc"
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
          data-section="chart-line-range-bias-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-range-bias-empty"
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
          data-section="chart-line-range-bias-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-range-bias-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.biasBottom - t * (layout.biasBottom - layout.biasTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-range-bias-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-range-bias-grid-line"
                      data-panel="bias"
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
            <g data-section="chart-line-range-bias-axes">
              <line
                data-section="chart-line-range-bias-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-range-bias-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-range-bias-axis"
                data-panel="bias"
                x1={layout.innerLeft}
                y1={layout.biasTop}
                x2={layout.innerLeft}
                y2={layout.biasBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-range-bias-axis"
                data-panel="bias"
                x1={layout.innerLeft}
                y1={layout.biasBottom}
                x2={layout.innerRight}
                y2={layout.biasBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-range-bias-tick-label"
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
                data-section="chart-line-range-bias-tick-label"
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
                data-section="chart-line-range-bias-tick-label"
                data-panel="bias"
                x={layout.innerLeft - 6}
                y={layout.biasTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatBias(layout.biasMax)}
              </text>
              <text
                data-section="chart-line-range-bias-tick-label"
                data-panel="bias"
                x={layout.innerLeft - 6}
                y={layout.biasBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatBias(layout.biasMin)}
              </text>
            </g>
          ) : null}

          {showThresholds ? (
            <g data-section="chart-line-range-bias-thresholds">
              <line
                data-section="chart-line-range-bias-high-threshold-line"
                x1={layout.innerLeft}
                y1={layout.highThresholdY}
                x2={layout.innerRight}
                y2={layout.highThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-range-bias-low-threshold-line"
                x1={layout.innerLeft}
                y1={layout.lowThresholdY}
                x2={layout.innerRight}
                y2={layout.lowThresholdY}
                stroke={thresholdColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-range-bias-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-range-bias-price-path"
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
            <g data-section="chart-line-range-bias-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-range-bias-dot"
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

          {!biasHidden ? (
            <path
              data-section="chart-line-range-bias-line"
              d={layout.biasPath}
              fill="none"
              stroke={biasColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Range Bias line`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-range-bias-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-range-bias-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-bias={marker.bias}
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
                  )}, bias ${formatBias(marker.bias)}, ${crossLabelOf(
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
            <g data-section="chart-line-range-bias-badge">
              <rect
                data-section="chart-line-range-bias-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={220}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-range-bias-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Range Bias H>=${run.highThreshold} L<=${run.lowThreshold}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-range-bias-legend"
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
                data-section="chart-line-range-bias-legend-item"
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
                  data-section="chart-line-range-bias-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-range-bias-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-range-bias-legend-stats"
            style={{ color: axisColor }}
          >
            {`bull ${run.bullishCount} / bear ${run.bearishCount} / neutral ${run.neutralCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineRangeBias.displayName = 'ChartLineRangeBias';
