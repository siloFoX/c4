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
 * ChartLineHlSpread -- pure-SVG dual-panel chart with the close
 * on the top panel and a High-Low Spread panel beneath. The
 * spread is the per-bar range scaled to percent of close,
 * smoothed by an SMA across the lookback:
 *
 *   raw[i]    = (high[i] - low[i]) / close[i] * 100   (close != 0)
 *   spread[i] = SMA(raw, length)[i]
 *
 * Defaults: `length = 14`. Bars before `i = length - 1` are
 * warmup (`spread = null`). When `close[i] == 0` (singular)
 * `raw[i]` is `null`, which nulls every spread bar whose window
 * includes it.
 *
 * Bit-exact anchors:
 *
 *   * **CONST_FLAT** (`high = low = close = K`, `K != 0`):
 *     `high - low = 0`, so `raw = 0` and the SMA collapses to
 *     `0` bit-exact past warmup. `K = 0` is the singular case
 *     (divide-by-zero -> null).
 *   * **CONST_BAR with dyadic ratio** (`high = K + r`, `low = K
 *     - r`, `close = C` with `(2r)/C` representable in IEEE
 *     754, e.g. `r = 5`, `C = 20`): `raw = 10/20 * 100 = 50`
 *     bit-exact at every bar, and the SMA of constant `50`
 *     stays at `50` bit-exact past warmup. The test sweeps a
 *     handful of dyadic-friendly `(H, L, C)` triples.
 */

export interface ChartLineHlSpreadPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineHlSpreadZone =
  | 'wide'
  | 'normal'
  | 'narrow'
  | 'flat'
  | 'none';

export type ChartLineHlSpreadSeriesId = 'price' | 'spread';

export interface ChartLineHlSpreadSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  raw: number | null;
  spread: number | null;
  zone: ChartLineHlSpreadZone;
}

export interface ChartLineHlSpreadRun {
  series: ChartLineHlSpreadPoint[];
  length: number;
  raw: Array<number | null>;
  spread: Array<number | null>;
  samples: ChartLineHlSpreadSample[];
  spreadFinal: number | null;
  spreadMaxSeen: number;
  wideCount: number;
  normalCount: number;
  narrowCount: number;
  flatCount: number;
  noneCount: number;
  ok: boolean;
}

export interface ChartLineHlSpreadMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  spread: number;
  zone: ChartLineHlSpreadZone;
}

export interface ChartLineHlSpreadDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineHlSpreadLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  spreadTop: number;
  spreadBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineHlSpreadDot[];
  spreadPath: string;
  markers: ChartLineHlSpreadMarker[];
  priceMin: number;
  priceMax: number;
  spreadMin: number;
  spreadMax: number;
  zeroBaselineY: number;
  run: ChartLineHlSpreadRun;
}

export interface ChartLineHlSpreadProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineHlSpreadPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  spreadColor?: string;
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
  showSpread?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  showBaseline?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineHlSpreadSeriesId[];
  defaultHiddenSeries?: ChartLineHlSpreadSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineHlSpreadSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineHlSpreadSample }) => void;
  formatPrice?: (value: number) => string;
  formatSpread?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_HL_SPREAD_WIDTH = 720;
export const DEFAULT_CHART_LINE_HL_SPREAD_HEIGHT = 460;
export const DEFAULT_CHART_LINE_HL_SPREAD_PADDING = 44;
export const DEFAULT_CHART_LINE_HL_SPREAD_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_HL_SPREAD_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_HL_SPREAD_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_HL_SPREAD_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_HL_SPREAD_LENGTH = 14;
export const DEFAULT_CHART_LINE_HL_SPREAD_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_HL_SPREAD_SPREAD_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_HL_SPREAD_WIDE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_HL_SPREAD_NORMAL_COLOR = '#0ea5e9';
export const DEFAULT_CHART_LINE_HL_SPREAD_NARROW_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_HL_SPREAD_FLAT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_HL_SPREAD_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_HL_SPREAD_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_HL_SPREAD_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_HL_SPREAD_BASELINE_COLOR = '#64748b';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x`, `high`, `low`, and `close`. */
export function getLineHlSpreadFinitePoints(
  data: readonly ChartLineHlSpreadPoint[] | null | undefined,
): ChartLineHlSpreadPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineHlSpreadPoint[] = [];
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
export function normalizeLineHlSpreadLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 2) return Math.floor(length);
  return fallback;
}

/**
 * Per-bar raw spread: `(high - low) / close * 100`. `null` when
 * `close == 0`. `-0` from `0 / negative_close` is normalized to
 * `+0` so the bit-exact zero anchor holds for negative closes.
 */
export function computeLineHlSpreadRaw(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const out: Array<number | null> = [];
  for (const bar of bars) {
    if (
      !bar ||
      !isFiniteNumber(bar.high) ||
      !isFiniteNumber(bar.low) ||
      !isFiniteNumber(bar.close) ||
      bar.close === 0
    ) {
      out.push(null);
      continue;
    }
    const raw = ((bar.high - bar.low) / bar.close) * 100;
    out.push(raw === 0 ? 0 : raw);
  }
  return out;
}

/** SMA; nulls in the window null the bar. */
export function applyLineHlSpreadSma(
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
      if (v === null || v === undefined || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    out.push(ok ? sum / length : null);
  }
  return out;
}

export interface ChartLineHlSpreadOptions {
  length?: number;
}

export interface ChartLineHlSpreadChannels {
  raw: Array<number | null>;
  spread: Array<number | null>;
}

/** Compute the HL Spread pipeline per bar. */
export function computeLineHlSpread(
  bars: ReadonlyArray<{ high: number; low: number; close: number }> | null | undefined,
  options: ChartLineHlSpreadOptions = {},
): ChartLineHlSpreadChannels {
  if (!Array.isArray(bars) || bars.length === 0) {
    return { raw: [], spread: [] };
  }
  const length = normalizeLineHlSpreadLength(
    options.length,
    DEFAULT_CHART_LINE_HL_SPREAD_LENGTH,
  );
  const raw = computeLineHlSpreadRaw(bars);
  const spread = applyLineHlSpreadSma(raw, length);
  return { raw, spread };
}

/** Classify a spread reading by ratio to the max seen. */
export function classifyLineHlSpreadZone(
  value: number | null,
  spreadMaxSeen: number,
): ChartLineHlSpreadZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value === 0) return 'flat';
  if (!isFiniteNumber(spreadMaxSeen) || spreadMaxSeen <= 0) return 'normal';
  const ratio = value / spreadMaxSeen;
  if (ratio >= 0.75) return 'wide';
  if (ratio >= 0.25) return 'normal';
  return 'narrow';
}

/** Run the full pipeline plus sample classification. */
export function runLineHlSpread(
  data: readonly ChartLineHlSpreadPoint[] | null | undefined,
  options: ChartLineHlSpreadOptions = {},
): ChartLineHlSpreadRun {
  const series = getLineHlSpreadFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineHlSpreadLength(
    options.length,
    DEFAULT_CHART_LINE_HL_SPREAD_LENGTH,
  );
  const channels = computeLineHlSpread(series, { length });
  let spreadMaxSeen = 0;
  for (const s of channels.spread) {
    if (s != null && isFiniteNumber(s) && s > spreadMaxSeen) {
      spreadMaxSeen = s;
    }
  }
  const samples: ChartLineHlSpreadSample[] = series.map((point, index) => {
    const value = channels.spread[index] ?? null;
    return {
      index,
      x: point.x,
      high: point.high,
      low: point.low,
      close: point.close,
      raw: channels.raw[index] ?? null,
      spread: value,
      zone: classifyLineHlSpreadZone(value, spreadMaxSeen),
    };
  });
  let wideCount = 0;
  let normalCount = 0;
  let narrowCount = 0;
  let flatCount = 0;
  let noneCount = 0;
  let spreadFinal: number | null = null;
  for (const sample of samples) {
    if (sample.zone === 'wide') wideCount += 1;
    else if (sample.zone === 'normal') normalCount += 1;
    else if (sample.zone === 'narrow') narrowCount += 1;
    else if (sample.zone === 'flat') flatCount += 1;
    else noneCount += 1;
    if (isFiniteNumber(sample.spread)) spreadFinal = sample.spread;
  }
  return {
    series = [],
    length,
    raw: channels.raw,
    spread: channels.spread,
    samples,
    spreadFinal,
    spreadMaxSeen,
    wideCount,
    normalCount,
    narrowCount,
    flatCount,
    noneCount,
    ok: series.length >= length,
  };
}

export interface ChartLineHlSpreadLayoutOptions
  extends ChartLineHlSpreadOptions {
  data: readonly ChartLineHlSpreadPoint[] | null | undefined;
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
export function computeLineHlSpreadLayout(
  options: ChartLineHlSpreadLayoutOptions,
): ChartLineHlSpreadLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_HL_SPREAD_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_HL_SPREAD_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_HL_SPREAD_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_HL_SPREAD_PANEL_GAP;

  const run = runLineHlSpread(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const spreadHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const spreadTop = priceBottom + panelGap;
  const spreadBottom = spreadTop + spreadHeight;

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

  // HL Spread is non-negative percent; pad to at least 1 for
  // context.
  let spreadMin = 0;
  let spreadMax = 1;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.spread)) {
      if (sample.spread > spreadMax) spreadMax = sample.spread;
    }
  }
  if (spreadMin === spreadMax) {
    spreadMax += 1;
  }
  const spreadY = (value: number): number =>
    spreadBottom -
    ((value - spreadMin) / (spreadMax - spreadMin)) * spreadHeight;
  const zeroBaselineY = spreadY(0);

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineHlSpreadDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const spreadLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineHlSpreadMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.spread)) return;
    const cx = xAt(index);
    const yc = spreadY(sample.spread);
    spreadLinePoints.push({ x: cx, y: yc });
    markers.push({
      index,
      x: sample.x,
      cx,
      cy: yc,
      close: sample.close,
      spread: sample.spread,
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
    spreadTop,
    spreadBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    spreadPath: buildLinePath(spreadLinePoints),
    markers,
    priceMin,
    priceMax,
    spreadMin,
    spreadMax,
    zeroBaselineY,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineHlSpreadChart(
  data: readonly ChartLineHlSpreadPoint[] | null | undefined,
  options: ChartLineHlSpreadOptions = {},
): string {
  const run = runLineHlSpread(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalText =
    run.spreadFinal === null ? 'n/a' : run.spreadFinal.toFixed(4);
  return (
    `Dual-panel chart with a High-Low Spread oscillator panel ` +
    `beneath the close (length ${run.length}). HL Spread = ` +
    `SMA((high - low) / close * 100, length). Across ${total} ` +
    `bars the spread reads wide on ${run.wideCount}, normal on ` +
    `${run.normalCount}, narrow on ${run.narrowCount}, flat (zero) ` +
    `on ${run.flatCount}, and undefined on ${run.noneCount}. The ` +
    `final reading is ${finalText}.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatSpread(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function zoneColorOf(
  zone: ChartLineHlSpreadZone,
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

function zoneLabelOf(zone: ChartLineHlSpreadZone): string {
  if (zone === 'wide') return 'Wide';
  if (zone === 'normal') return 'Normal';
  if (zone === 'narrow') return 'Narrow';
  if (zone === 'flat') return 'Flat';
  return 'n/a';
}

/** ChartLineHlSpread -- dual-panel pure-SVG HL Spread chart. */
export const ChartLineHlSpread = forwardRef<
  HTMLDivElement,
  ChartLineHlSpreadProps
>(function ChartLineHlSpread(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_HL_SPREAD_LENGTH,
    width = DEFAULT_CHART_LINE_HL_SPREAD_WIDTH,
    height = DEFAULT_CHART_LINE_HL_SPREAD_HEIGHT,
    padding = DEFAULT_CHART_LINE_HL_SPREAD_PADDING,
    panelGap = DEFAULT_CHART_LINE_HL_SPREAD_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_HL_SPREAD_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_HL_SPREAD_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_HL_SPREAD_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_HL_SPREAD_PRICE_COLOR,
    spreadColor = DEFAULT_CHART_LINE_HL_SPREAD_SPREAD_COLOR,
    wideColor = DEFAULT_CHART_LINE_HL_SPREAD_WIDE_COLOR,
    normalColor = DEFAULT_CHART_LINE_HL_SPREAD_NORMAL_COLOR,
    narrowColor = DEFAULT_CHART_LINE_HL_SPREAD_NARROW_COLOR,
    flatColor = DEFAULT_CHART_LINE_HL_SPREAD_FLAT_COLOR,
    noneColor = DEFAULT_CHART_LINE_HL_SPREAD_NONE_COLOR,
    axisColor = DEFAULT_CHART_LINE_HL_SPREAD_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_HL_SPREAD_GRID_COLOR,
    baselineColor = DEFAULT_CHART_LINE_HL_SPREAD_BASELINE_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSpread = true,
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
    formatSpread = defaultFormatSpread,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-hl-spread-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineHlSpreadSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineHlSpreadSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineHlSpreadLayout({
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
    ariaDescription ?? describeLineHlSpreadChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `High-Low Spread chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineHlSpreadSeriesId): void => {
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
        data-section="chart-line-hl-spread-tooltip"
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
          data-section="chart-line-hl-spread-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-hl-spread-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-hl-spread-tooltip-range"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`H/L: ${formatPrice(hoverSample.high)} / ${formatPrice(hoverSample.low)}`}
        </text>
        <text
          data-section="chart-line-hl-spread-tooltip-raw"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Bar Spread %: ${
            hoverSample.raw === null
              ? 'n/a'
              : formatSpread(hoverSample.raw)
          }`}
        </text>
        <text
          data-section="chart-line-hl-spread-tooltip-spread"
          x={tx + 10}
          y={ty + 83}
          fill="#7dd3fc"
          fontSize={11}
          fontWeight={600}
        >
          {`Smoothed %: ${
            hoverSample.spread === null
              ? 'n/a'
              : formatSpread(hoverSample.spread)
          }`}
        </text>
        <text
          data-section="chart-line-hl-spread-tooltip-zone"
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
  const spreadHidden = isHidden('spread') || !showSpread;

  const legendItems: Array<{
    id: ChartLineHlSpreadSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'spread', label: 'HL Spread %', color: spreadColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-hl-spread"
      data-empty={isEmpty ? 'true' : 'false'}
      data-length={run.length}
      data-spread-final={run.spreadFinal === null ? '' : run.spreadFinal}
      data-spread-max-seen={run.spreadMaxSeen}
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
        data-section="chart-line-hl-spread-aria-desc"
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
          data-section="chart-line-hl-spread-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-hl-spread-empty"
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
          data-section="chart-line-hl-spread-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-hl-spread-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.spreadBottom -
                  t * (layout.spreadBottom - layout.spreadTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-hl-spread-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-hl-spread-grid-line"
                      data-panel="spread"
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
            <g data-section="chart-line-hl-spread-axes">
              <line
                data-section="chart-line-hl-spread-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hl-spread-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hl-spread-axis"
                data-panel="spread"
                x1={layout.innerLeft}
                y1={layout.spreadTop}
                x2={layout.innerLeft}
                y2={layout.spreadBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-hl-spread-axis"
                data-panel="spread"
                x1={layout.innerLeft}
                y1={layout.spreadBottom}
                x2={layout.innerRight}
                y2={layout.spreadBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-hl-spread-tick-label"
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
                data-section="chart-line-hl-spread-tick-label"
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
                data-section="chart-line-hl-spread-tick-label"
                data-panel="spread"
                x={layout.innerLeft - 6}
                y={layout.spreadTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSpread(layout.spreadMax)}
              </text>
              <text
                data-section="chart-line-hl-spread-tick-label"
                data-panel="spread"
                x={layout.innerLeft - 6}
                y={layout.spreadBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatSpread(layout.spreadMin)}
              </text>
            </g>
          ) : null}

          {showBaseline ? (
            <line
              data-section="chart-line-hl-spread-baseline"
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
              data-section="chart-line-hl-spread-price-path"
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
            <g data-section="chart-line-hl-spread-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-hl-spread-dot"
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

          {!spreadHidden ? (
            <path
              data-section="chart-line-hl-spread-line"
              d={layout.spreadPath}
              fill="none"
              stroke={spreadColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`HL Spread line, ${layout.markers.length} points`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-hl-spread-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-hl-spread-marker"
                  data-zone={marker.zone}
                  data-close={marker.close}
                  data-spread={marker.spread}
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
                  )}, spread ${formatSpread(marker.spread)}, ${zoneLabelOf(
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
            <g data-section="chart-line-hl-spread-badge">
              <rect
                data-section="chart-line-hl-spread-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={160}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-hl-spread-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`HL Spread ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-hl-spread-legend"
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
                data-section="chart-line-hl-spread-legend-item"
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
                  data-section="chart-line-hl-spread-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-hl-spread-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-hl-spread-legend-stats"
            style={{ color: axisColor }}
          >
            {`wide ${run.wideCount} / normal ${run.normalCount} / narrow ${run.narrowCount} / flat ${run.flatCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineHlSpread.displayName = 'ChartLineHlSpread';
