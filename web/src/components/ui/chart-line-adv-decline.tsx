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
 * ChartLineAdvDecline -- pure-SVG dual-panel chart with a market index
 * `close` on top and the rolling Advance Decline line on the bottom.
 * The Advance Decline line is the running sum of per-bar net breadth
 * (`advances - declines`) across the lookback:
 *
 *   net[i]    = advances[i] - declines[i]
 *   adLine[i] = sum_{k = i - length + 1 .. i} net[k]
 *
 * `adLine[i]` is `null` during warmup (`i < length - 1`) or when any
 * input value is non-finite.
 *
 * Bit-exact anchor: **CONST advances=A, declines=D**: `net = A - D` at
 * every bar, so the rolling sum collapses to `(A - D) * length` at every
 * valid bar. For `A = D` (equal breadth) the line is exactly zero.
 * Both forms are integer-exact in IEEE 754 within
 * `Number.MAX_SAFE_INTEGER`. Verified across `(A, D, length)`
 * combinations in the integration sweep.
 */

export interface ChartLineAdvDeclinePoint {
  x: number;
  close: number;
  advances: number;
  declines: number;
}

export type ChartLineAdvDeclineZone =
  | 'positive'
  | 'negative'
  | 'zero'
  | 'none';

export type ChartLineAdvDeclineCross = 'up' | 'down' | null;

export type ChartLineAdvDeclineSeriesId = 'price' | 'adLine';

export interface ChartLineAdvDeclineSample {
  index: number;
  x: number;
  close: number;
  advances: number;
  declines: number;
  net: number;
  adLine: number | null;
  zone: ChartLineAdvDeclineZone;
  crossed: ChartLineAdvDeclineCross;
}

export interface ChartLineAdvDeclineRun {
  series: ChartLineAdvDeclinePoint[];
  length: number;
  netValues: number[];
  adLineValues: Array<number | null>;
  samples: ChartLineAdvDeclineSample[];
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineAdvDeclineMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  adLine: number;
  crossed: 'up' | 'down';
}

export interface ChartLineAdvDeclineDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineAdvDeclineLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  adTop: number;
  adBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineAdvDeclineDot[];
  adPath: string;
  zeroLineY: number;
  markers: ChartLineAdvDeclineMarker[];
  priceMin: number;
  priceMax: number;
  adMin: number;
  adMax: number;
  run: ChartLineAdvDeclineRun;
}

export interface ChartLineAdvDeclineProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineAdvDeclinePoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  adLineColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroLineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showAdLine?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineAdvDeclineSeriesId[];
  defaultHiddenSeries?: ChartLineAdvDeclineSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineAdvDeclineSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineAdvDeclineSample }) => void;
  formatPrice?: (value: number) => string;
  formatAd?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_ADV_DECLINE_WIDTH = 720;
export const DEFAULT_CHART_LINE_ADV_DECLINE_HEIGHT = 460;
export const DEFAULT_CHART_LINE_ADV_DECLINE_PADDING = 44;
export const DEFAULT_CHART_LINE_ADV_DECLINE_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_ADV_DECLINE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ADV_DECLINE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ADV_DECLINE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ADV_DECLINE_LENGTH = 14;
export const DEFAULT_CHART_LINE_ADV_DECLINE_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_ADV_DECLINE_AD_LINE_COLOR = '#d97706';
export const DEFAULT_CHART_LINE_ADV_DECLINE_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_ADV_DECLINE_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_ADV_DECLINE_ZERO_LINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_ADV_DECLINE_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_ADV_DECLINE_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite numeric fields. */
export function getLineAdvDeclineFinitePoints(
  data: readonly ChartLineAdvDeclinePoint[] | null | undefined,
): ChartLineAdvDeclinePoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineAdvDeclinePoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (
      isFiniteNumber(point.x) &&
      isFiniteNumber(point.close) &&
      isFiniteNumber(point.advances) &&
      isFiniteNumber(point.declines)
    ) {
      out.push({
        x: point.x,
        close: point.close,
        advances: point.advances,
        declines: point.declines,
      });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineAdvDeclineLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Per-bar net breadth `advances - declines`. */
export function computeLineAdvDeclineNetSeries(
  series: readonly ChartLineAdvDeclinePoint[],
): number[] {
  const out: number[] = [];
  for (const point of series) {
    const raw = point.advances - point.declines;
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

/** Rolling window sum of the net breadth array. */
export function applyLineAdvDeclineRollingSum(
  values: readonly number[],
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
    for (let k = 0; k < length; k += 1) {
      const v = values[i - k];
      if (v === undefined || !isFiniteNumber(v)) {
        sum = Number.NaN;
        break;
      }
      sum += v;
    }
    if (!Number.isFinite(sum)) {
      out.push(null);
      continue;
    }
    out.push(sum === 0 ? 0 : sum);
  }
  return out;
}

export interface ChartLineAdvDeclineOptions {
  length?: number;
}

export interface ChartLineAdvDeclineChannels {
  net: number[];
  adLine: Array<number | null>;
}

/** Compute the Advance Decline pipeline. */
export function computeLineAdvDecline(
  series: readonly ChartLineAdvDeclinePoint[] | null | undefined,
  options: ChartLineAdvDeclineOptions = {},
): ChartLineAdvDeclineChannels {
  if (!Array.isArray(series) || series.length === 0) {
    return { net: [], adLine: [] };
  }
  const length = normalizeLineAdvDeclineLength(
    options.length,
    DEFAULT_CHART_LINE_ADV_DECLINE_LENGTH,
  );
  const net = computeLineAdvDeclineNetSeries(series);
  const adLine = applyLineAdvDeclineRollingSum(net, length);
  return { net, adLine };
}

/** Classify an adLine reading. */
export function classifyLineAdvDeclineZone(
  value: number | null,
): ChartLineAdvDeclineZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}

/**
 * Detect zero-line crosses across an adLine sequence. A bar
 * transitions `'up'` when the previous defined value was `<= 0` and
 * the current is `> 0`; `'down'` is the mirror.
 */
export function detectLineAdvDeclineCrosses(
  values: readonly (number | null)[],
): Array<ChartLineAdvDeclineCross> {
  const out: Array<ChartLineAdvDeclineCross> = [];
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
    if (prev <= 0 && v > 0) {
      out.push('up');
    } else if (prev >= 0 && v < 0) {
      out.push('down');
    } else {
      out.push(null);
    }
    prev = v;
  }
  return out;
}

/** Run the full pipeline plus sample classification. */
export function runLineAdvDecline(
  data: readonly ChartLineAdvDeclinePoint[] | null | undefined,
  options: ChartLineAdvDeclineOptions = {},
): ChartLineAdvDeclineRun {
  const series = getLineAdvDeclineFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineAdvDeclineLength(
    options.length,
    DEFAULT_CHART_LINE_ADV_DECLINE_LENGTH,
  );
  const channels = computeLineAdvDecline(series, { length });
  const crosses = detectLineAdvDeclineCrosses(channels.adLine);
  const samples: ChartLineAdvDeclineSample[] = series.map((point, index) => {
    const value = channels.adLine[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      advances: point.advances,
      declines: point.declines,
      net: channels.net[index] ?? 0,
      adLine: value,
      zone: classifyLineAdvDeclineZone(value),
      crossed: crosses[index] ?? null,
    };
  });
  let positiveCount = 0;
  let negativeCount = 0;
  let zeroCount = 0;
  let noneCount = 0;
  let bullishCrossCount = 0;
  let bearishCrossCount = 0;
  for (const sample of samples) {
    if (sample.zone === 'positive') positiveCount += 1;
    else if (sample.zone === 'negative') negativeCount += 1;
    else if (sample.zone === 'zero') zeroCount += 1;
    else noneCount += 1;
    if (sample.crossed === 'up') bullishCrossCount += 1;
    else if (sample.crossed === 'down') bearishCrossCount += 1;
  }
  return {
    series = [],
    length,
    netValues: channels.net,
    adLineValues: channels.adLine,
    samples,
    positiveCount,
    negativeCount,
    zeroCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length,
  };
}

export interface ChartLineAdvDeclineLayoutOptions
  extends ChartLineAdvDeclineOptions {
  data: readonly ChartLineAdvDeclinePoint[] | null | undefined;
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
export function computeLineAdvDeclineLayout(
  options: ChartLineAdvDeclineLayoutOptions,
): ChartLineAdvDeclineLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_ADV_DECLINE_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_ADV_DECLINE_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_ADV_DECLINE_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_ADV_DECLINE_PANEL_GAP;

  const run = runLineAdvDecline(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const adHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const adTop = priceBottom + panelGap;
  const adBottom = adTop + adHeight;

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

  let adMin = Infinity;
  let adMax = -Infinity;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.adLine)) {
      if (sample.adLine < adMin) adMin = sample.adLine;
      if (sample.adLine > adMax) adMax = sample.adLine;
    }
  }
  if (!Number.isFinite(adMin) || !Number.isFinite(adMax)) {
    adMin = -1;
    adMax = 1;
  }
  if (adMin > 0) adMin = 0;
  if (adMax < 0) adMax = 0;
  if (adMin === adMax) {
    adMin -= 1;
    adMax += 1;
  }
  const adY = (value: number): number =>
    adBottom - ((value - adMin) / (adMax - adMin)) * adHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineAdvDeclineDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const adLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineAdvDeclineMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.adLine)) return;
    const cx = xAt(index);
    const yc = adY(sample.adLine);
    adLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        adLine: sample.adLine,
        crossed: sample.crossed,
      });
    }
  });

  const zeroLineY = adY(0);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    adTop,
    adBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    adPath: buildLinePath(adLinePoints),
    zeroLineY,
    markers,
    priceMin,
    priceMax,
    adMin,
    adMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineAdvDeclineChart(
  data: readonly ChartLineAdvDeclinePoint[] | null | undefined,
  options: ChartLineAdvDeclineOptions = {},
): string {
  const run = runLineAdvDecline(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with an Advance Decline cumulative panel beneath ` +
    `the close (length ${run.length}). The rolling window sums ` +
    `(advances - declines) across the lookback. Across ${total} bars ` +
    `the line was positive on ${run.positiveCount}, negative on ` +
    `${run.negativeCount}, zero on ${run.zeroCount}, and undefined on ` +
    `${run.noneCount}, with ${run.bullishCrossCount} bullish and ` +
    `${run.bearishCrossCount} bearish zero-line crosses.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatAd(value: number): string {
  if (!Number.isFinite(value)) return '-';
  if (value === 0) return '0';
  return value.toFixed(0);
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

function zoneLabelOf(zone: ChartLineAdvDeclineZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'zero') return 'Zero';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineAdvDeclineCross): string {
  if (crossed === 'up') return 'Bullish cross';
  if (crossed === 'down') return 'Bearish cross';
  return '-';
}

/** ChartLineAdvDecline -- dual-panel pure-SVG chart. */
export const ChartLineAdvDecline = forwardRef<
  HTMLDivElement,
  ChartLineAdvDeclineProps
>(function ChartLineAdvDecline(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_ADV_DECLINE_LENGTH,
    width = DEFAULT_CHART_LINE_ADV_DECLINE_WIDTH,
    height = DEFAULT_CHART_LINE_ADV_DECLINE_HEIGHT,
    padding = DEFAULT_CHART_LINE_ADV_DECLINE_PADDING,
    panelGap = DEFAULT_CHART_LINE_ADV_DECLINE_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_ADV_DECLINE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ADV_DECLINE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ADV_DECLINE_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_ADV_DECLINE_PRICE_COLOR,
    adLineColor = DEFAULT_CHART_LINE_ADV_DECLINE_AD_LINE_COLOR,
    bullishColor = DEFAULT_CHART_LINE_ADV_DECLINE_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_ADV_DECLINE_BEARISH_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_ADV_DECLINE_ZERO_LINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_ADV_DECLINE_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_ADV_DECLINE_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showAdLine = true,
    showMarkers = true,
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
    formatAd = defaultFormatAd,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-adv-decline-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineAdvDeclineSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineAdvDeclineSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineAdvDeclineLayout({
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
    ariaDescription ?? describeLineAdvDeclineChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Advance Decline chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineAdvDeclineSeriesId): void => {
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
        data-section="chart-line-adv-decline-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={150}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-adv-decline-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-adv-decline-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-adv-decline-tooltip-adv"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Advances: ${formatAd(hoverSample.advances)}`}
        </text>
        <text
          data-section="chart-line-adv-decline-tooltip-dec"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Declines: ${formatAd(hoverSample.declines)}`}
        </text>
        <text
          data-section="chart-line-adv-decline-tooltip-net"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Net: ${formatAd(hoverSample.net)}`}
        </text>
        <text
          data-section="chart-line-adv-decline-tooltip-ad"
          x={tx + 10}
          y={ty + 103}
          fill="#fde68a"
          fontSize={11}
          fontWeight={600}
        >
          {`A/D Line: ${
            hoverSample.adLine === null
              ? 'n/a'
              : formatAd(hoverSample.adLine)
          }`}
        </text>
        <text
          data-section="chart-line-adv-decline-tooltip-zone"
          x={tx + 10}
          y={ty + 121}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-adv-decline-tooltip-cross"
          x={tx + 10}
          y={ty + 137}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const adHidden = isHidden('adLine') || !showAdLine;

  const legendItems: Array<{
    id: ChartLineAdvDeclineSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'adLine', label: 'A/D Line', color: adLineColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-adv-decline"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-positive-count={run.positiveCount}
      data-negative-count={run.negativeCount}
      data-zero-count={run.zeroCount}
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
        data-section="chart-line-adv-decline-aria-desc"
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
          data-section="chart-line-adv-decline-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-adv-decline-empty"
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
          data-section="chart-line-adv-decline-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-adv-decline-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.adBottom - t * (layout.adBottom - layout.adTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-adv-decline-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-adv-decline-grid-line"
                      data-panel="adLine"
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
            <g data-section="chart-line-adv-decline-axes">
              <line
                data-section="chart-line-adv-decline-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adv-decline-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adv-decline-axis"
                data-panel="adLine"
                x1={layout.innerLeft}
                y1={layout.adTop}
                x2={layout.innerLeft}
                y2={layout.adBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-adv-decline-axis"
                data-panel="adLine"
                x1={layout.innerLeft}
                y1={layout.adBottom}
                x2={layout.innerRight}
                y2={layout.adBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-adv-decline-tick-label"
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
                data-section="chart-line-adv-decline-tick-label"
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
                data-section="chart-line-adv-decline-tick-label"
                data-panel="adLine"
                x={layout.innerLeft - 6}
                y={layout.adTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatAd(layout.adMax)}
              </text>
              <text
                data-section="chart-line-adv-decline-tick-label"
                data-panel="adLine"
                x={layout.innerLeft - 6}
                y={layout.adBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatAd(layout.adMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-adv-decline-zero-line"
              x1={layout.innerLeft}
              y1={layout.zeroLineY}
              x2={layout.innerRight}
              y2={layout.zeroLineY}
              stroke={zeroLineColor}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-adv-decline-price-path"
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
            <g data-section="chart-line-adv-decline-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-adv-decline-dot"
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

          {!adHidden ? (
            <path
              data-section="chart-line-adv-decline-line"
              d={layout.adPath}
              fill="none"
              stroke={adLineColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Advance Decline line, length ${run.length}`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-adv-decline-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-adv-decline-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-ad-line={marker.adLine}
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
                  )}, A/D ${formatAd(marker.adLine)}, ${crossLabelOf(
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
            <g data-section="chart-line-adv-decline-badge">
              <rect
                data-section="chart-line-adv-decline-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={180}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-adv-decline-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`A/D Line ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-adv-decline-legend"
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
                data-section="chart-line-adv-decline-legend-item"
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
                  data-section="chart-line-adv-decline-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-adv-decline-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-adv-decline-legend-stats"
            style={{ color: axisColor }}
          >
            {`pos ${run.positiveCount} / neg ${run.negativeCount} / crosses ${run.bullishCrossCount + run.bearishCrossCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineAdvDecline.displayName = 'ChartLineAdvDecline';
