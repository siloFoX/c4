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
 * ChartLineDonchianWidth -- pure-SVG dual-panel chart with the
 * close on the top panel and the Donchian channel width on the
 * bottom panel. The width is the height of the Donchian channel
 * over the lookback:
 *
 *   upper[i] = max(high, [i - length + 1, i])
 *   lower[i] = min(low,  [i - length + 1, i])
 *   width[i] = upper[i] - lower[i]    (>= 0)
 *
 * Defaults: `length = 20`. Bars `0 .. length - 2` are warmup
 * (`width = null`).
 *
 * Bit-exact anchors:
 *
 *   * **CONST_FLAT** (`high = low = close = K`): every window's
 *     max high and min low equal `K`, so `width = K - K = 0`
 *     bit-exact past warmup.
 *   * **CONST_BAR** (constant `high = H`, `low = L`): every
 *     window's max equals `H` and min equals `L`, so
 *     `width = H - L` -- a constant integer-friendly anchor past
 *     warmup.
 *
 * Tooltip shows close + width + zone classification (wide /
 * normal / narrow / flat).
 */

export interface ChartLineDonchianWidthPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineDonchianWidthZone =
  | 'wide'
  | 'normal'
  | 'narrow'
  | 'flat'
  | 'none';

export type ChartLineDonchianWidthSeriesId = 'price' | 'width';

export interface ChartLineDonchianWidthSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  upper: number | null;
  lower: number | null;
  width: number | null;
  zone: ChartLineDonchianWidthZone;
}

export interface ChartLineDonchianWidthRun {
  series: ChartLineDonchianWidthPoint[];
  length: number;
  upper: Array<number | null>;
  lower: Array<number | null>;
  width: Array<number | null>;
  samples: ChartLineDonchianWidthSample[];
  widthFinal: number | null;
  widthMaxSeen: number;
  wideCount: number;
  normalCount: number;
  narrowCount: number;
  flatCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineDonchianWidthMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  width: number;
  zone: ChartLineDonchianWidthZone;
}

export interface ChartLineDonchianWidthDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineDonchianWidthLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  widthTop: number;
  widthBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineDonchianWidthDot[];
  widthPath: string;
  markers: ChartLineDonchianWidthMarker[];
  priceMin: number;
  priceMax: number;
  widthMin: number;
  widthMax: number;
  zeroBaselineY: number;
  run: ChartLineDonchianWidthRun;
}

export interface ChartLineDonchianWidthProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineDonchianWidthPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  widthColor?: string;
  wideColor?: string;
  normalColor?: string;
  narrowColor?: string;
  flatColor?: string;
  noneColor?: string;
  axisColor?: string;
  gridColor?: string;
  baselineColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showWidth?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBaseline?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineDonchianWidthSeriesId[];
  defaultHiddenSeries?: ChartLineDonchianWidthSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineDonchianWidthSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: {
    point: ChartLineDonchianWidthSample;
  }) => void;
  formatPrice?: (value: number) => string;
  formatWidth?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_WIDTH = 720;
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_HEIGHT = 460;
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_PADDING = 44;
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_LENGTH = 20;
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_WIDTH_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_WIDE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_NORMAL_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_NARROW_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_FLAT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_DONCHIAN_WIDTH_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineDonchianWidthFinitePoints(
  data: readonly ChartLineDonchianWidthPoint[] | null | undefined,
): ChartLineDonchianWidthPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineDonchianWidthPoint[] = [];
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
export function normalizeLineDonchianWidthLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/** Rolling max of `length` samples ending at bar `i`. */
export function applyLineDonchianWidthRollingMax(
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

/** Rolling min of `length` samples ending at bar `i`. */
export function applyLineDonchianWidthRollingMin(
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

export interface ChartLineDonchianWidthOptions {
  length?: number;
}

export interface ChartLineDonchianWidthChannels {
  upper: Array<number | null>;
  lower: Array<number | null>;
  width: Array<number | null>;
}

/** Compute upper / lower / width per bar. */
export function computeLineDonchianWidth(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineDonchianWidthOptions = {},
): ChartLineDonchianWidthChannels {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { upper: [], lower: [], width: [] };
  }
  const length = normalizeLineDonchianWidthLength(
    options.length,
    DEFAULT_CHART_LINE_DONCHIAN_WIDTH_LENGTH,
  );
  const highs: Array<number | null> = bars.map((bar) =>
    !bar || !isFiniteNumber(bar.high) ? null : bar.high,
  );
  const lows: Array<number | null> = bars.map((bar) =>
    !bar || !isFiniteNumber(bar.low) ? null : bar.low,
  );
  const upper = applyLineDonchianWidthRollingMax(highs, length);
  const lower = applyLineDonchianWidthRollingMin(lows, length);
  const width: Array<number | null> = upper.map((u, i) => {
    const l = lower[i];
    if (u == null || l == null || !isFiniteNumber(u) || !isFiniteNumber(l)) {
      return null;
    }
    return u - l;
  });
  return { upper, lower, width };
}

/**
 * Classify a width reading relative to the maximum seen in the
 * current series. Buckets:
 *
 *   * `wide`    -- width >= 0.75 * widthMaxSeen
 *   * `normal`  -- 0.25 * widthMaxSeen <= width < 0.75 * widthMaxSeen
 *   * `narrow`  -- 0   < width < 0.25 * widthMaxSeen
 *   * `flat`    -- width == 0 (singular: all bars in the window are
 *                  identical)
 *   * `none`    -- width is null (warmup)
 */
export function classifyLineDonchianWidthZone(
  value: number | null,
  widthMaxSeen: number,
): ChartLineDonchianWidthZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value === 0) return 'flat';
  if (!isFiniteNumber(widthMaxSeen) || widthMaxSeen <= 0) return 'normal';
  const ratio = value / widthMaxSeen;
  if (ratio >= 0.75) return 'wide';
  if (ratio >= 0.25) return 'normal';
  return 'narrow';
}

/** Run the full Donchian width pipeline. */
export function runLineDonchianWidth(
  data: readonly ChartLineDonchianWidthPoint[] | null | undefined,
  options: ChartLineDonchianWidthOptions = {},
): ChartLineDonchianWidthRun {
  const series = getLineDonchianWidthFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineDonchianWidthLength(
    options.length,
    DEFAULT_CHART_LINE_DONCHIAN_WIDTH_LENGTH,
  );
  const channels = computeLineDonchianWidth(series, { length });
  let widthMaxSeen = 0;
  for (const w of channels.width) {
    if (w != null && isFiniteNumber(w) && w > widthMaxSeen) {
      widthMaxSeen = w;
    }
  }
  const samples: ChartLineDonchianWidthSample[] = series.map((point, index) => {
    const w = channels.width[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      upper: channels.upper[index] ?? null,
      lower: channels.lower[index] ?? null,
      width: w,
      zone: classifyLineDonchianWidthZone(w, widthMaxSeen),
    };
  });
  let wideCount = 0;
  let normalCount = 0;
  let narrowCount = 0;
  let flatCount = 0;
  let noneCount = 0;
  let widthFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'wide') wideCount += 1;
    else if (sample.zone === 'normal') normalCount += 1;
    else if (sample.zone === 'narrow') narrowCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.width)) widthFinal = sample.width;
  }
  return {
    series,
    length,
    upper: channels.upper,
    lower: channels.lower,
    width: channels.width,
    samples,
    widthFinal,
    widthMaxSeen,
    wideCount,
    normalCount,
    narrowCount,
    flatCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineDonchianWidthLayoutOptions
  extends ChartLineDonchianWidthOptions {
  data: readonly ChartLineDonchianWidthPoint[] | null | undefined;
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
export function computeLineDonchianWidthLayout(
  options: ChartLineDonchianWidthLayoutOptions,
): ChartLineDonchianWidthLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_DONCHIAN_WIDTH_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_DONCHIAN_WIDTH_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_DONCHIAN_WIDTH_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_DONCHIAN_WIDTH_PANEL_GAP;

  const run = runLineDonchianWidth(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const widthHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const widthTop = priceBottom + panelGap;
  const widthBottom = widthTop + widthHeight;

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

  // Width is non-negative; pad to at least 1 for visual context.
  let widthMin = 0;
  let widthMax = 1;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.width)) {
      if (sample.width > widthMax) widthMax = sample.width;
    }
  }
  if (widthMin === widthMax) {
    widthMax += 1;
  }
  const widthY = (value: number): number =>
    widthBottom - ((value - widthMin) / (widthMax - widthMin)) * widthHeight;
  const zeroBaselineY = widthY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineDonchianWidthDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const widthLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineDonchianWidthMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.width)) return;
    const cx = xAt(index);
    const yc = widthY(sample.width);
    widthLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      width: sample.width,
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
    widthTop,
    widthBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    widthPath: buildLinePath(widthLinePoints),
    markers,
    priceMin,
    priceMax,
    widthMin,
    widthMax,
    zeroBaselineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineDonchianWidthChart(
  data: readonly ChartLineDonchianWidthPoint[] | null | undefined,
  options: ChartLineDonchianWidthOptions = {},
): string {
  const run = runLineDonchianWidth(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.widthFinal === null ? 'n/a' : run.widthFinal.toFixed(4);
  return (
    `Dual-panel chart with a Donchian channel width oscillator ` +
    `panel beneath the close (length ${run.length}). Width = ` +
    `(highest high over the lookback) - (lowest low over the ` +
    `lookback); width is non-negative. Across ${total} bars the ` +
    `width is wide on ${run.wideCount}, normal on ${run.normalCount}, ` +
    `narrow on ${run.narrowCount}, flat (zero) on ${run.flatCount}, ` +
    `and undefined on ${run.noneCount}. The final width is ` +
    `${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatWidth(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineDonchianWidthZone,
  wideColor: string,
  normalColor: string,
  narrowColor: string,
  flatColor: string,
  noneColor: string,
): string {
  if (zone === 'wide') return wideColor;
  if (zone === 'normal') return normalColor;
  if (zone === 'narrow') return narrowColor;
  if (zone === 'flat') return flatColor;
  return noneColor;
}

function zoneLabelOf(zone: ChartLineDonchianWidthZone): string {
  if (zone === 'wide') return 'Wide';
  if (zone === 'normal') return 'Normal';
  if (zone === 'narrow') return 'Narrow';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/** ChartLineDonchianWidth -- dual-panel pure-SVG chart. */
export const ChartLineDonchianWidth = forwardRef<
  HTMLDivElement,
  ChartLineDonchianWidthProps
>(function ChartLineDonchianWidth(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_LENGTH,
    width = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_WIDTH,
    height = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_HEIGHT,
    padding = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_PADDING,
    panelGap = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_PRICE_COLOR,
    widthColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_WIDTH_COLOR,
    wideColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_WIDE_COLOR,
    normalColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_NORMAL_COLOR,
    narrowColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_NARROW_COLOR,
    flatColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_DONCHIAN_WIDTH_BASELINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showWidth = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    showBaseline = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatPrice = defaultFormatPrice,
    formatWidth = defaultFormatWidth,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-donchian-width-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineDonchianWidthSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineDonchianWidthSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineDonchianWidthLayout({
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
    ariaDescription ?? describeLineDonchianWidthChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Donchian channel width chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineDonchianWidthSeriesId): void => {
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
        data-section="chart-line-donchian-width-tooltip"
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
          data-section="chart-line-donchian-width-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-donchian-width-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-donchian-width-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-donchian-width-tooltip-width"
          x={tx + 10}
          y={ty + 67}
          fill="#7dd3fc"
          fontSize={11}
          fontWeight={600}
        >
          {`Width: ${
            hoverSample.width === null
              ? 'n/a'
              : formatWidth(hoverSample.width)
          }`}
        </text>
        <text
          data-section="chart-line-donchian-width-tooltip-channel"
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
          data-section="chart-line-donchian-width-tooltip-zone"
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
  const widthHidden = isHidden('width') || !showWidth;

  const legendItems: Array<{
    id: ChartLineDonchianWidthSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'width', label: 'Donchian Width', color: widthColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-donchian-width"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-width-final={run.widthFinal === null ? '' : run.widthFinal}
      data-width-max-seen={run.widthMaxSeen}
      data-wide-count={run.wideCount}
      data-normal-count={run.normalCount}
      data-narrow-count={run.narrowCount}
      data-flat-count={run.flatCount}
      data-none-count={run.noneCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-donchian-width-aria-desc"
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
          data-section="chart-line-donchian-width-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-donchian-width-empty"
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
          data-section="chart-line-donchian-width-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-donchian-width-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.widthBottom -
                  t * (layout.widthBottom - layout.widthTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-donchian-width-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-donchian-width-grid-line"
                      data-panel="width"
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
            <g data-section="chart-line-donchian-width-axes">
              <line
                data-section="chart-line-donchian-width-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-donchian-width-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-donchian-width-axis"
                data-panel="width"
                x1={layout.innerLeft}
                y1={layout.widthTop}
                x2={layout.innerLeft}
                y2={layout.widthBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-donchian-width-axis"
                data-panel="width"
                x1={layout.innerLeft}
                y1={layout.widthBottom}
                x2={layout.innerRight}
                y2={layout.widthBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-donchian-width-tick-label"
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
                data-section="chart-line-donchian-width-tick-label"
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
                data-section="chart-line-donchian-width-tick-label"
                data-panel="width"
                x={layout.innerLeft - 6}
                y={layout.widthTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatWidth(layout.widthMax)}
              </text>
              <text
                data-section="chart-line-donchian-width-tick-label"
                data-panel="width"
                x={layout.innerLeft - 6}
                y={layout.widthBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatWidth(layout.widthMin)}
              </text>
            </g>
          ) : null}

          {showBaseline ? (
            <line
              data-section="chart-line-donchian-width-baseline"
              x1={layout.innerLeft}
              y1={layout.zeroBaselineY}
              x2={layout.innerRight}
              y2={layout.zeroBaselineY}
              stroke={baselineColor}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-donchian-width-price-path"
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
            <g data-section="chart-line-donchian-width-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-donchian-width-dot"
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

          {!widthHidden ? (
            <path
              data-section="chart-line-donchian-width-line"
              d={layout.widthPath}
              fill="none"
              stroke={widthColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Donchian width line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-donchian-width-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-donchian-width-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-width={marker.width}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + 0.5}
                  fill={zoneColorOf(
                    marker.zone,
                    wideColor,
                    normalColor,
                    narrowColor,
                    flatColor,
                    noneColor,
                  )}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, close ${formatPrice(
                    marker.close,
                  )}, width ${formatWidth(marker.width)}, ${zoneLabelOf(
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
            <g data-section="chart-line-donchian-width-badge">
              <rect
                data-section="chart-line-donchian-width-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-donchian-width-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Donchian Width ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-donchian-width-legend"
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
                data-section="chart-line-donchian-width-legend-item"
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
                  data-section="chart-line-donchian-width-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-donchian-width-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-donchian-width-legend-stats"
            style={{ color: axisColor }}
          >
            {`wide ${run.wideCount} / normal ${run.normalCount} / narrow ${run.narrowCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineDonchianWidth.displayName = 'ChartLineDonchianWidth';
