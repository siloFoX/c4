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
 * ChartLineDonchianMid -- pure-SVG single-panel line chart that
 * overlays the Donchian Channel midline on the close. The
 * midline is the midpoint of the highest high and the lowest
 * low over the lookback:
 *
 *   upper[i]  = max(high, [i - length + 1, i])
 *   lower[i]  = min(low,  [i - length + 1, i])
 *   middle[i] = (upper[i] + lower[i]) / 2
 *
 * Defaults: `length = 20`. Bars `0 .. length - 2` are warmup
 * (`middle = null`).
 *
 * Bit-exact anchors:
 *
 *   * **CONST_FLAT** (`high = low = close = K`): every window's
 *     max high and min low equal `K`, so `middle = K` and the
 *     midline coincides with the close. Bit-exact past warmup.
 *   * **CONST_BAR** (constant `high = H`, `low = L`, with
 *     `H > L`): `middle = (H + L) / 2`, a constant. When
 *     `close = (H + L) / 2` (the channel midpoint), close and
 *     midline coincide bit-exact.
 *
 * Tooltip shows close + midline + zone classification (above /
 * at / below midline).
 */

export interface ChartLineDonchianMidPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineDonchianMidZone =
  | 'above'
  | 'at'
  | 'below'
  | 'none';

export type ChartLineDonchianMidSeriesId =
  | 'price'
  | 'middle'
  | 'upper'
  | 'lower';

export interface ChartLineDonchianMidSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  upper: number | null;
  lower: number | null;
  middle: number | null;
  zone: ChartLineDonchianMidZone;
}

export interface ChartLineDonchianMidRun {
  series: ChartLineDonchianMidPoint[];
  length: number;
  upper: Array<number | null>;
  lower: Array<number | null>;
  middle: Array<number | null>;
  samples: ChartLineDonchianMidSample[];
  middleFinal: number | null;
  aboveCount: number;
  atCount: number;
  belowCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineDonchianMidMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  middle: number;
  zone: ChartLineDonchianMidZone;
}

export interface ChartLineDonchianMidDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDonchianMidLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineDonchianMidDot[];
  middlePath: string;
  markers: ChartLineDonchianMidMarker[];
  upperPath: string;
  lowerPath: string;
  yMin: number;
  yMax: number;
  run: ChartLineDonchianMidRun;
}

export interface ChartLineDonchianMidProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDonchianMidPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  middleColor?: string;
  upperColor?: string;
  lowerColor?: string;
  aboveColor?: string;
  atColor?: string;
  belowColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  channelFill?: string;
  channelFillOpacity?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMiddle?: boolean;
  showUpper?: boolean;
  showLower?: boolean;
  showChannelFill?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDonchianMidSeriesId[];
  defaultHiddenSeries?: ChartLineDonchianMidSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDonchianMidSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineDonchianMidSample }) => void;
  formatPrice?: (value: number) => string;
  formatMiddle?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_DONCHIAN_MID_WIDTH = 720;
export const DEFAULT_CHART_LINE_DONCHIAN_MID_HEIGHT = 400;
export const DEFAULT_CHART_LINE_DONCHIAN_MID_PADDING = 44;
export const DEFAULT_CHART_LINE_DONCHIAN_MID_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DONCHIAN_MID_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DONCHIAN_MID_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DONCHIAN_MID_LENGTH = 20;
export const DEFAULT_CHART_LINE_DONCHIAN_MID_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_MIDDLE_COLOR = '#a855f7';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_UPPER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_LOWER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_AT_COLOR = '#a855f7';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_CHANNEL_FILL = '#a855f7';
export const DEFAULT_CHART_LINE_DONCHIAN_MID_CHANNEL_FILL_OPACITY = 0.08;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineDonchianMidFinitePoints(
  data: readonly ChartLineDonchianMidPoint[] | null | undefined,
): ChartLineDonchianMidPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDonchianMidPoint[] = [];
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
export function normalizeLineDonchianMidLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Rolling max of `length` samples ending at bar `i`. Returns
 * `null` if the window contains any null / non-finite value.
 */
export function applyLineDonchianMidRollingMax(
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
    let m = -Infinity;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v > m) m = v;
    }
    out.push(ok ? m : null);
  }
  return out;
}

/**
 * Rolling min of `length` samples ending at bar `i`. Returns
 * `null` if the window contains any null / non-finite value.
 */
export function applyLineDonchianMidRollingMin(
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
    let m = Infinity;
    let ok = true;
    for (let j = 0; j < length; j += 1) {
      const v = values[i - j];
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      if (v < m) m = v;
    }
    out.push(ok ? m : null);
  }
  return out;
}

export interface ChartLineDonchianMidOptions {
  length?: number;
}

export interface ChartLineDonchianMidChannels {
  upper: Array<number | null>;
  lower: Array<number | null>;
  middle: Array<number | null>;
}

/**
 * Compute Donchian upper / lower / middle channels per bar.
 * Bars before `i = length - 1` are `null`.
 */
export function computeLineDonchianMid(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineDonchianMidOptions = {},
): ChartLineDonchianMidChannels {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { upper: [], lower: [], middle: [] };
  }
  const length = normalizeLineDonchianMidLength(
    options.length,
    DEFAULT_CHART_LINE_DONCHIAN_MID_LENGTH,
  );
  const highs: Array<number | null> = bars.map((bar) =>
    !bar || !isFiniteNumber(bar.high) ? null : bar.high,
  );
  const lows: Array<number | null> = bars.map((bar) =>
    !bar || !isFiniteNumber(bar.low) ? null : bar.low,
  );
  const upper = applyLineDonchianMidRollingMax(highs, length);
  const lower = applyLineDonchianMidRollingMin(lows, length);
  const middle: Array<number | null> = upper.map((u, i) => {
    const l = lower[i];
    if (u == null || l == null || !isFiniteNumber(u) || !isFiniteNumber(l)) {
      return null;
    }
    return (u + l) / 2;
  });
  return { upper, lower, middle };
}

/** Classify the close relative to the midline. */
export function classifyLineDonchianMidZone(
  close: number,
  middle: number | null,
): ChartLineDonchianMidZone {
  if (middle == null || !isFiniteNumber(middle)) return 'none';
  if (!isFiniteNumber(close)) return 'none';
  if (close > middle) return 'above';
  if (close < middle) return 'below';
  return 'at';
}

/** Run the full Donchian midline pipeline. */
export function runLineDonchianMid(
  data: readonly ChartLineDonchianMidPoint[] | null | undefined,
  options: ChartLineDonchianMidOptions = {},
): ChartLineDonchianMidRun {
  const series = getLineDonchianMidFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineDonchianMidLength(
    options.length,
    DEFAULT_CHART_LINE_DONCHIAN_MID_LENGTH,
  );
  const channels = computeLineDonchianMid(series, { length });
  const samples: ChartLineDonchianMidSample[] = series.map((point, index) => {
    const m = channels.middle[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      upper: channels.upper[index] ?? null,
      lower: channels.lower[index] ?? null,
      middle: m,
      zone: classifyLineDonchianMidZone(point.close, m),
    };
  });
  let aboveCount = 0;
  let atCount = 0;
  let belowCount = 0;
  let noneCount = 0;
  let middleFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'above') aboveCount += 1;
    else if (sample.zone === 'at') atCount += 1;
    else if (sample.zone === 'below') belowCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.middle)) middleFinal = sample.middle;
  }
  return {
    series = [],
    length,
    upper: channels.upper,
    lower: channels.lower,
    middle: channels.middle,
    samples,
    middleFinal,
    aboveCount,
    atCount,
    belowCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineDonchianMidLayoutOptions
  extends ChartLineDonchianMidOptions {
  data: readonly ChartLineDonchianMidPoint[] | null | undefined;
  width?: number;
  height?: number;
  padding?: number;
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

/** Project the run into a single-panel SVG layout. */
export function computeLineDonchianMidLayout(
  options: ChartLineDonchianMidLayoutOptions,
): ChartLineDonchianMidLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_DONCHIAN_MID_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_DONCHIAN_MID_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_DONCHIAN_MID_PADDING;

  const run = runLineDonchianMid(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const okGeom = innerWidth > 0 && innerHeight > 0;
  const ok = run.ok && okGeom;

  const count = run.series.length;
  const stepX = count > 1 ? innerWidth / (count - 1) : 0;
  const xAt = (index: number): number =>
    count > 1 ? innerLeft + stepX * index : (innerLeft + innerRight) / 2;

  // y-range covers the highest and lowest seen in close, upper,
  // lower combined.
  let yMin = Infinity;
  let yMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.close < yMin) yMin = sample.close;
    if (sample.close > yMax) yMax = sample.close;
    if (sample.upper != null && isFiniteNumber(sample.upper)) {
      if (sample.upper > yMax) yMax = sample.upper;
    }
    if (sample.lower != null && isFiniteNumber(sample.lower)) {
      if (sample.lower < yMin) yMin = sample.lower;
    }
  }
  if (!Number.isFinite(yMin) || !Number.isFinite(yMax)) {
    yMin = 0;
    yMax = 1;
  }
  if (yMin === yMax) {
    yMin -= 1;
    yMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - yMin) / (yMax - yMin)) * innerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineDonchianMidDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const middleLinePoints: Array<{ x: number; y: number }> = [];
  const upperLinePoints: Array<{ x: number; y: number }> = [];
  const lowerLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineDonchianMidMarker[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    if (isFiniteNumber(sample.middle)) {
      const yc = yAt(sample.middle);
      middleLinePoints.push({ x: cx, y: yc });
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        middle: sample.middle,
        zone: sample.zone,
      });
    }
    if (isFiniteNumber(sample.upper)) {
      upperLinePoints.push({ x: cx, y: yAt(sample.upper) });
    }
    if (isFiniteNumber(sample.lower)) {
      lowerLinePoints.push({ x: cx, y: yAt(sample.lower) });
    }
  });

  return {
    ok,
    width,
    height,
    padding,
    innerLeft,
    innerRight,
    innerTop,
    innerBottom,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    middlePath: buildLinePath(middleLinePoints),
    markers,
    upperPath: buildLinePath(upperLinePoints),
    lowerPath: buildLinePath(lowerLinePoints),
    yMin,
    yMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineDonchianMidChart(
  data: readonly ChartLineDonchianMidPoint[] | null | undefined,
  options: ChartLineDonchianMidOptions = {},
): string {
  const run = runLineDonchianMid(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.middleFinal === null ? 'n/a' : run.middleFinal.toFixed(4);
  return (
    `Single-panel chart with a Donchian Channel midline overlay on ` +
    `the close (length ${run.length}). The midline is the midpoint ` +
    `of the highest high and the lowest low over the lookback. ` +
    `Across ${total} bars the close is above the midline on ` +
    `${run.aboveCount}, at the midline on ${run.atCount}, below the ` +
    `midline on ${run.belowCount}, and the midline is undefined on ` +
    `${run.noneCount}. The final midline value is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatMiddle(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineDonchianMidZone,
  aboveColor: string,
  atColor: string,
  belowColor: string,
  noneColor: string,
): string {
  if (zone === 'above') return aboveColor;
  if (zone === 'at') return atColor;
  if (zone === 'below') return belowColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineDonchianMidZone): string {
  if (zone === 'above') return 'Above Midline';
  if (zone === 'at') return 'At Midline';
  if (zone === 'below') return 'Below Midline';
  return 'n/a';
}

/** ChartLineDonchianMid -- single-panel pure-SVG chart. */
export const ChartLineDonchianMid = forwardRef<
  HTMLDivElement,
  ChartLineDonchianMidProps
>(function ChartLineDonchianMid(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_DONCHIAN_MID_LENGTH,
    width = DEFAULT_CHART_LINE_DONCHIAN_MID_WIDTH,
    height = DEFAULT_CHART_LINE_DONCHIAN_MID_HEIGHT,
    padding = DEFAULT_CHART_LINE_DONCHIAN_MID_PADDING,
    tickCount = DEFAULT_CHART_LINE_DONCHIAN_MID_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DONCHIAN_MID_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DONCHIAN_MID_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DONCHIAN_MID_PRICE_COLOR,
    middleColor = DEFAULT_CHART_LINE_DONCHIAN_MID_MIDDLE_COLOR,
    upperColor = DEFAULT_CHART_LINE_DONCHIAN_MID_UPPER_COLOR,
    lowerColor = DEFAULT_CHART_LINE_DONCHIAN_MID_LOWER_COLOR,
    aboveColor = DEFAULT_CHART_LINE_DONCHIAN_MID_ABOVE_COLOR,
    atColor = DEFAULT_CHART_LINE_DONCHIAN_MID_AT_COLOR,
    belowColor = DEFAULT_CHART_LINE_DONCHIAN_MID_BELOW_COLOR,
    noneColor = DEFAULT_CHART_LINE_DONCHIAN_MID_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_DONCHIAN_MID_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DONCHIAN_MID_GRID_COLOR,
    channelFill = DEFAULT_CHART_LINE_DONCHIAN_MID_CHANNEL_FILL,
    channelFillOpacity = DEFAULT_CHART_LINE_DONCHIAN_MID_CHANNEL_FILL_OPACITY,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMiddle = true,
    showUpper = true,
    showLower = true,
    showChannelFill = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatMiddle = defaultFormatMiddle,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-donchian-mid-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineDonchianMidSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineDonchianMidSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineDonchianMidLayout({
        data,
        length,
        width,
        height,
        padding,
      }),
    [data, length, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ?? describeLineDonchianMidChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Donchian midline chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineDonchianMidSeriesId): void => {
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
    const ty = layout.innerTop + 6;
    tooltip = (
      <g
        data-section="chart-line-donchian-mid-tooltip"
        pointerEvents="none"
      >
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={118}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-donchian-mid-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-donchian-mid-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-donchian-mid-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-donchian-mid-tooltip-middle"
          x={tx + 10}
          y={ty + 67}
          fill="#d8b4fe"
          fontSize={11}
          fontWeight={600}
        >
          {`Mid: ${
            hoverSample.middle === null
              ? 'n/a'
              : formatMiddle(hoverSample.middle)
          }`}
        </text>
        <text
          data-section="chart-line-donchian-mid-tooltip-channel"
          x={tx + 10}
          y={ty + 83}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`U/L: ${
            hoverSample.upper === null
              ? 'n/a'
              : formatPrice(hoverSample.upper)
          } / ${
            hoverSample.lower === null
              ? 'n/a'
              : formatPrice(hoverSample.lower)
          }`}
        </text>
        <text
          data-section="chart-line-donchian-mid-tooltip-zone"
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
  const middleHidden = isHidden('middle') || !showMiddle;
  const upperHidden = isHidden('upper') || !showUpper;
  const lowerHidden = isHidden('lower') || !showLower;

  const legendItems: Array<{
    id: ChartLineDonchianMidSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'middle', label: 'Donchian Mid', color: middleColor },
    { id: 'upper', label: 'Upper', color: upperColor },
    { id: 'lower', label: 'Lower', color: lowerColor },
  ];

  // Build channel polygon (between upper and lower) for the fill.
  // Skip warmup samples so the polygon only covers bars with valid
  // upper/lower readings.
  let channelPath = '';
  if (showChannelFill && !isEmpty) {
    const upperPts: Array<{ x: number; y: number }> = [];
    const lowerPts: Array<{ x: number; y: number }> = [];
    run.samples.forEach((sample, index) => {
      if (
        isFiniteNumber(sample.upper) &&
        isFiniteNumber(sample.lower)
      ) {
        const cx =
          run.series.length > 1
            ? layout.innerLeft +
              ((layout.innerRight - layout.innerLeft) /
                (run.series.length - 1)) *
                index
            : (layout.innerLeft + layout.innerRight) / 2;
        const yUp = layout.innerBottom -
          ((sample.upper - layout.yMin) /
            (layout.yMax - layout.yMin)) *
            (layout.innerBottom - layout.innerTop);
        const yLo = layout.innerBottom -
          ((sample.lower - layout.yMin) /
            (layout.yMax - layout.yMin)) *
            (layout.innerBottom - layout.innerTop);
        upperPts.push({ x: cx, y: yUp });
        lowerPts.push({ x: cx, y: yLo });
      }
    });
    if (upperPts.length > 0 && lowerPts.length > 0) {
      let d = '';
      for (let i = 0; i < upperPts.length; i += 1) {
        const p = upperPts[i]!;
        d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)} `;
      }
      for (let i = lowerPts.length - 1; i >= 0; i -= 1) {
        const p = lowerPts[i]!;
        d += `L${p.x.toFixed(2)},${p.y.toFixed(2)} `;
      }
      d += 'Z';
      channelPath = d;
    }
  }

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-donchian-mid"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-middle-final={
        run.middleFinal === null ? '' : run.middleFinal
      }
      data-above-count={run.aboveCount}
      data-at-count={run.atCount}
      data-below-count={run.belowCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-donchian-mid-aria-desc"
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
          data-section="chart-line-donchian-mid-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-donchian-mid-empty"
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
          data-section="chart-line-donchian-mid-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-donchian-mid-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-donchian-mid-grid-line"
                    x1={layout.innerLeft}
                    y1={yp}
                    x2={layout.innerRight}
                    y2={yp}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-donchian-mid-axes">
              <line
                data-section="chart-line-donchian-mid-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-donchian-mid-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-donchian-mid-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMax)}
              </text>
              <text
                data-section="chart-line-donchian-mid-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatPrice(layout.yMin)}
              </text>
            </g>
          ) : null}

          {showChannelFill && channelPath ? (
            <path
              data-section="chart-line-donchian-mid-channel-fill"
              d={channelPath}
              fill={channelFill}
              fillOpacity={channelFillOpacity}
              stroke="none"
            />
          ) : null}

          {!upperHidden ? (
            <path
              data-section="chart-line-donchian-mid-upper-path"
              d={layout.upperPath}
              fill="none"
              stroke={upperColor}
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Donchian upper channel"
            />
          ) : null}

          {!lowerHidden ? (
            <path
              data-section="chart-line-donchian-mid-lower-path"
              d={layout.lowerPath}
              fill="none"
              stroke={lowerColor}
              strokeWidth={1}
              strokeDasharray="3 3"
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Donchian lower channel"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-donchian-mid-price-path"
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
            <g data-section="chart-line-donchian-mid-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-donchian-mid-dot"
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

          {!middleHidden ? (
            <path
              data-section="chart-line-donchian-mid-middle-path"
              d={layout.middlePath}
              fill="none"
              stroke={middleColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Donchian midline, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-donchian-mid-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-donchian-mid-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-middle={marker.middle}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    aboveColor,
                    atColor,
                    belowColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, midline ${formatMiddle(marker.middle)}, ${zoneLabelOf(
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
            <g data-section="chart-line-donchian-mid-badge">
              <rect
                data-section="chart-line-donchian-mid-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-donchian-mid-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Donchian Mid ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-donchian-mid-legend"
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
                data-section="chart-line-donchian-mid-legend-item"
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
                  data-section="chart-line-donchian-mid-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-donchian-mid-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-donchian-mid-legend-stats"
            style={{ color: axisColor }}
          >
            {`above ${run.aboveCount} / at ${run.atCount} / below ${run.belowCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDonchianMid.displayName = 'ChartLineDonchianMid';
