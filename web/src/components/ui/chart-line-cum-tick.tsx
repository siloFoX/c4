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
 * ChartLineCumTick -- pure-SVG dual-panel chart with a close line on
 * top and a Cumulative Tick panel on the bottom. Each bar contributes
 * a `+1` / `-1` / `0` tick depending on its close relative to the
 * prior close; the rolling window sum over `length` bars yields the
 * Cumulative Tick reading:
 *
 *   direction[i] = sign(close[i] - close[i - 1])
 *   cumTick[i]   = sum_{k = i - length + 1 .. i} direction[k]
 *
 * `cumTick[i]` is `null` during warmup (`i < length`) and whenever a
 * `close` in the window is non-finite. The first bar has no direction
 * (no prior close), so the first valid `cumTick` is at `i = length`.
 *
 * Bit-exact anchor: **CONST close** (`close = K`): every direction is
 * `0`, so the rolling sum is `0` at every valid bar.
 *
 * Additional bit-exact anchors:
 * - **MONOTONIC UP** (`close[k] = k + 1`): every direction is `+1`,
 *   so `cumTick = length` at every valid bar.
 * - **MONOTONIC DOWN** (`close[k] = N - k`): mirror -> `cumTick =
 *   -length`.
 * - **ALTERNATING** (`close[k] = k % 2 ? 11 : 10`): directions
 *   alternate `+1`, `-1`, ... Over an even-length window the sum is
 *   `0`. Over an odd-length window the sum is `+/-1`.
 *
 * All of these are integer-exact in IEEE 754 within
 * `Number.MAX_SAFE_INTEGER`.
 */

export interface ChartLineCumTickPoint {
  x: number;
  close: number;
}

export type ChartLineCumTickZone = 'positive' | 'negative' | 'zero' | 'none';

export type ChartLineCumTickCross = 'up' | 'down' | null;

export type ChartLineCumTickSeriesId = 'price' | 'cumTick';

export interface ChartLineCumTickSample {
  index: number;
  x: number;
  close: number;
  direction: number | null;
  cumTick: number | null;
  zone: ChartLineCumTickZone;
  crossed: ChartLineCumTickCross;
}

export interface ChartLineCumTickRun {
  series: ChartLineCumTickPoint[];
  length: number;
  directionValues: Array<number | null>;
  cumTickValues: Array<number | null>;
  samples: ChartLineCumTickSample[];
  positiveCount: number;
  negativeCount: number;
  zeroCount: number;
  noneCount: number;
  bullishCrossCount: number;
  bearishCrossCount: number;
  ok: boolean;
}

export interface ChartLineCumTickMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
  cumTick: number;
  crossed: 'up' | 'down';
}

export interface ChartLineCumTickDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineCumTickLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  panelGap: number;
  priceTop: number;
  priceBottom: number;
  cumTickTop: number;
  cumTickBottom: number;
  innerLeft: number;
  innerRight: number;
  pricePath: string;
  priceDots: ChartLineCumTickDot[];
  cumTickPath: string;
  zeroLineY: number;
  markers: ChartLineCumTickMarker[];
  priceMin: number;
  priceMax: number;
  cumTickMin: number;
  cumTickMax: number;
  run: ChartLineCumTickRun;
}

export interface ChartLineCumTickProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineCumTickPoint[];
  length?: number;
  width?: number;
  height?: number;
  padding?: number;
  panelGap?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  cumTickColor?: string;
  bullishColor?: string;
  bearishColor?: string;
  zeroLineColor?: string;
  axisColor?: string;
  gridColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCumTick?: boolean;
  showMarkers?: boolean;
  showZeroLine?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineCumTickSeriesId[];
  defaultHiddenSeries?: ChartLineCumTickSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineCumTickSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineCumTickSample }) => void;
  formatPrice?: (value: number) => string;
  formatTick?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_CUM_TICK_WIDTH = 720;
export const DEFAULT_CHART_LINE_CUM_TICK_HEIGHT = 460;
export const DEFAULT_CHART_LINE_CUM_TICK_PADDING = 44;
export const DEFAULT_CHART_LINE_CUM_TICK_PANEL_GAP = 12;
export const DEFAULT_CHART_LINE_CUM_TICK_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CUM_TICK_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CUM_TICK_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CUM_TICK_LENGTH = 14;
export const DEFAULT_CHART_LINE_CUM_TICK_PRICE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_CUM_TICK_CUM_TICK_COLOR = '#f97316';
export const DEFAULT_CHART_LINE_CUM_TICK_BULLISH_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_CUM_TICK_BEARISH_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_CUM_TICK_ZERO_LINE_COLOR = '#475569';
export const DEFAULT_CHART_LINE_CUM_TICK_AXIS_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_CUM_TICK_GRID_COLOR = '#e2e8f0';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite `x` and `close`. */
export function getLineCumTickFinitePoints(
  data: readonly ChartLineCumTickPoint[] | null | undefined,
): ChartLineCumTickPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineCumTickPoint[] = [];
  for (const point of data) {
    if (!point) continue;
    if (isFiniteNumber(point.x) && isFiniteNumber(point.close)) {
      out.push({ x: point.x, close: point.close });
    }
  }
  return out;
}

/** Coerce a positive integer length (>= 1). */
export function normalizeLineCumTickLength(
  length: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(length) && length >= 1) return Math.floor(length);
  return fallback;
}

/** Per-bar direction tick: +1 / -1 / 0. First bar is null. */
export function computeLineCumTickDirections(
  closes: readonly (number | null)[],
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let i = 0; i < closes.length; i += 1) {
    if (i === 0) {
      out.push(null);
      continue;
    }
    const c = closes[i];
    const prev = closes[i - 1];
    if (c == null || prev == null || !isFiniteNumber(c) || !isFiniteNumber(prev)) {
      out.push(null);
      continue;
    }
    if (c > prev) out.push(1);
    else if (c < prev) out.push(-1);
    else out.push(0);
  }
  return out;
}

/** Rolling window sum of the direction series. */
export function applyLineCumTickRollingSum(
  values: readonly (number | null)[],
  length: number,
): Array<number | null> {
  if (!Array.isArray(values) || values.length === 0) return [];
  const out: Array<number | null> = [];
  for (let i = 0; i < values.length; i += 1) {
    if (i < length) {
      out.push(null);
      continue;
    }
    let sum = 0;
    let ok = true;
    for (let k = 0; k < length; k += 1) {
      const v = values[i - k];
      if (v == null || !isFiniteNumber(v)) {
        ok = false;
        break;
      }
      sum += v;
    }
    if (!ok) {
      out.push(null);
      continue;
    }
    out.push(sum === 0 ? 0 : sum);
  }
  return out;
}

export interface ChartLineCumTickOptions {
  length?: number;
}

export interface ChartLineCumTickChannels {
  direction: Array<number | null>;
  cumTick: Array<number | null>;
}

/** Compute the cumulative tick pipeline. */
export function computeLineCumTick(
  closes: readonly (number | null)[] | null | undefined,
  options: ChartLineCumTickOptions = {},
): ChartLineCumTickChannels {
  if (!Array.isArray(closes) || closes.length === 0) {
    return { direction: [], cumTick: [] };
  }
  const length = normalizeLineCumTickLength(
    options.length,
    DEFAULT_CHART_LINE_CUM_TICK_LENGTH,
  );
  const direction = computeLineCumTickDirections(closes);
  const cumTick = applyLineCumTickRollingSum(direction, length);
  return { direction, cumTick };
}

/** Classify a cumTick reading. */
export function classifyLineCumTickZone(
  value: number | null,
): ChartLineCumTickZone {
  if (value == null || !isFiniteNumber(value)) return 'none';
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'zero';
}

/**
 * Detect zero-line crosses. `'up'` when the previous defined value
 * was `<= 0` and the current is `> 0`; mirror for `'down'`.
 */
export function detectLineCumTickCrosses(
  values: readonly (number | null)[],
): Array<ChartLineCumTickCross> {
  const out: Array<ChartLineCumTickCross> = [];
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
export function runLineCumTick(
  data: readonly ChartLineCumTickPoint[] | null | undefined,
  options: ChartLineCumTickOptions = {},
): ChartLineCumTickRun {
  const series = getLineCumTickFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const length = normalizeLineCumTickLength(
    options.length,
    DEFAULT_CHART_LINE_CUM_TICK_LENGTH,
  );
  const closes = series.map((p) => p.close);
  const channels = computeLineCumTick(closes, { length });
  const crosses = detectLineCumTickCrosses(channels.cumTick);
  const samples: ChartLineCumTickSample[] = series.map((point, index) => {
    const value = channels.cumTick[index] ?? null;
    return {
      index,
      x: point.x,
      close: point.close,
      direction: channels.direction[index] ?? null,
      cumTick: value,
      zone: classifyLineCumTickZone(value),
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
    series,
    length,
    directionValues: channels.direction,
    cumTickValues: channels.cumTick,
    samples,
    positiveCount,
    negativeCount,
    zeroCount,
    noneCount,
    bullishCrossCount,
    bearishCrossCount,
    ok: series.length >= length + 1,
  };
}

export interface ChartLineCumTickLayoutOptions extends ChartLineCumTickOptions {
  data: readonly ChartLineCumTickPoint[] | null | undefined;
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
export function computeLineCumTickLayout(
  options: ChartLineCumTickLayoutOptions,
): ChartLineCumTickLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_CUM_TICK_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_CUM_TICK_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_CUM_TICK_PADDING;
  const panelGap = isFiniteNumber(options.panelGap)
    ? options.panelGap
    : DEFAULT_CHART_LINE_CUM_TICK_PANEL_GAP;

  const run = runLineCumTick(options.data, {
    ...(options.length !== undefined ? { length: options.length } : {}),
  });

  const innerLeft = padding;
  const innerRight = width - padding;
  const innerTop = padding;
  const innerBottom = height - padding;
  const innerWidth = innerRight - innerLeft;
  const innerHeight = innerBottom - innerTop;

  const priceHeight = Math.max(0, (innerHeight - panelGap) * 0.6);
  const cumTickHeight = Math.max(0, innerHeight - panelGap - priceHeight);
  const priceTop = innerTop;
  const priceBottom = priceTop + priceHeight;
  const cumTickTop = priceBottom + panelGap;
  const cumTickBottom = cumTickTop + cumTickHeight;

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

  // The tick window sum is bounded by [-length, +length]. Default to
  // that range and expand only if the observed values exceed it (which
  // they shouldn't by construction).
  let cumTickMin = -run.length;
  let cumTickMax = run.length;
  for (const sample of run.samples) {
    if (isFiniteNumber(sample.cumTick)) {
      if (sample.cumTick < cumTickMin) cumTickMin = sample.cumTick;
      if (sample.cumTick > cumTickMax) cumTickMax = sample.cumTick;
    }
  }
  if (cumTickMin === cumTickMax) {
    cumTickMin -= 1;
    cumTickMax += 1;
  }
  const cumTickY = (value: number): number =>
    cumTickBottom -
    ((value - cumTickMin) / (cumTickMax - cumTickMin)) * cumTickHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineCumTickDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = priceY(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const cumTickLinePoints: Array<{ x: number; y: number }> = [];
  const markers: ChartLineCumTickMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.cumTick)) return;
    const cx = xAt(index);
    const yc = cumTickY(sample.cumTick);
    cumTickLinePoints.push({ x: cx, y: yc });
    if (sample.crossed === 'up' || sample.crossed === 'down') {
      markers.push({
        index,
        x: sample.x,
        cx,
        cy: yc,
        close: sample.close,
        cumTick: sample.cumTick,
        crossed: sample.crossed,
      });
    }
  });

  const zeroLineY = cumTickY(0);

  return {
    ok,
    width,
    height,
    padding,
    panelGap,
    priceTop,
    priceBottom,
    cumTickTop,
    cumTickBottom,
    innerLeft,
    innerRight,
    pricePath: buildLinePath(priceLinePoints),
    priceDots,
    cumTickPath: buildLinePath(cumTickLinePoints),
    zeroLineY,
    markers,
    priceMin,
    priceMax,
    cumTickMin,
    cumTickMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineCumTickChart(
  data: readonly ChartLineCumTickPoint[] | null | undefined,
  options: ChartLineCumTickOptions = {},
): string {
  const run = runLineCumTick(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  return (
    `Dual-panel chart with a Cumulative Tick oscillator beneath the ` +
    `close (length ${run.length}). Each bar contributes sign(close[i] ` +
    `- close[i - 1]) and the rolling window sums these directions ` +
    `across the lookback. Across ${total} bars the cumulative tick ` +
    `was positive on ${run.positiveCount}, negative on ` +
    `${run.negativeCount}, zero on ${run.zeroCount}, and undefined on ` +
    `${run.noneCount}, with ${run.bullishCrossCount} bullish and ` +
    `${run.bearishCrossCount} bearish zero-line crosses.`
  );
}

function defaultFormatPrice(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatTick(value: number): string {
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

function zoneLabelOf(zone: ChartLineCumTickZone): string {
  if (zone === 'positive') return 'Positive';
  if (zone === 'negative') return 'Negative';
  if (zone === 'zero') return 'Zero';
  return 'n/a';
}

function crossLabelOf(crossed: ChartLineCumTickCross): string {
  if (crossed === 'up') return 'Bullish cross';
  if (crossed === 'down') return 'Bearish cross';
  return '-';
}

/** ChartLineCumTick -- dual-panel pure-SVG chart. */
export const ChartLineCumTick = forwardRef<
  HTMLDivElement,
  ChartLineCumTickProps
>(function ChartLineCumTick(props, ref) {
  const {
    data,
    length = DEFAULT_CHART_LINE_CUM_TICK_LENGTH,
    width = DEFAULT_CHART_LINE_CUM_TICK_WIDTH,
    height = DEFAULT_CHART_LINE_CUM_TICK_HEIGHT,
    padding = DEFAULT_CHART_LINE_CUM_TICK_PADDING,
    panelGap = DEFAULT_CHART_LINE_CUM_TICK_PANEL_GAP,
    tickCount = DEFAULT_CHART_LINE_CUM_TICK_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CUM_TICK_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CUM_TICK_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_CUM_TICK_PRICE_COLOR,
    cumTickColor = DEFAULT_CHART_LINE_CUM_TICK_CUM_TICK_COLOR,
    bullishColor = DEFAULT_CHART_LINE_CUM_TICK_BULLISH_COLOR,
    bearishColor = DEFAULT_CHART_LINE_CUM_TICK_BEARISH_COLOR,
    zeroLineColor = DEFAULT_CHART_LINE_CUM_TICK_ZERO_LINE_COLOR,
    axisColor = DEFAULT_CHART_LINE_CUM_TICK_AXIS_COLOR,
    gridColor = DEFAULT_CHART_LINE_CUM_TICK_GRID_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showCumTick = true,
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
    formatTick = defaultFormatTick,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-cum-tick-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineCumTickSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineCumTickSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineCumTickLayout({
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
    ariaDescription ?? describeLineCumTickChart(data, { length });
  const resolvedLabel =
    ariaLabel ?? `Cumulative Tick chart, length ${run.length}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineCumTickSeriesId): void => {
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
    const tooltipW = 250;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.priceTop + 6;
    tooltip = (
      <g data-section="chart-line-cum-tick-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={134}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-cum-tick-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-cum-tick-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatPrice(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-cum-tick-tooltip-direction"
          x={tx + 10}
          y={ty + 51}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Direction: ${
            hoverSample.direction === null
              ? 'n/a'
              : formatTick(hoverSample.direction)
          }`}
        </text>
        <text
          data-section="chart-line-cum-tick-tooltip-cum"
          x={tx + 10}
          y={ty + 71}
          fill="#fdba74"
          fontSize={11}
          fontWeight={600}
        >
          {`Cum Tick: ${
            hoverSample.cumTick === null
              ? 'n/a'
              : formatTick(hoverSample.cumTick)
          }`}
        </text>
        <text
          data-section="chart-line-cum-tick-tooltip-zone"
          x={tx + 10}
          y={ty + 89}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`State: ${zoneLabelOf(hoverSample.zone)}`}
        </text>
        <text
          data-section="chart-line-cum-tick-tooltip-cross"
          x={tx + 10}
          y={ty + 105}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Cross: ${crossLabelOf(hoverSample.crossed)}`}
        </text>
        <text
          data-section="chart-line-cum-tick-tooltip-length"
          x={tx + 10}
          y={ty + 121}
          fill="#94a3b8"
          fontSize={10}
        >
          {`Length: ${run.length}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const cumTickHidden = isHidden('cumTick') || !showCumTick;

  const legendItems: Array<{
    id: ChartLineCumTickSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'cumTick', label: 'Cum Tick', color: cumTickColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-cum-tick"
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
        data-section="chart-line-cum-tick-aria-desc"
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
          data-section="chart-line-cum-tick-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-cum-tick-empty"
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
          data-section="chart-line-cum-tick-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-cum-tick-grid">
              {tickValues.map((t, i) => {
                const yp =
                  layout.priceBottom -
                  t * (layout.priceBottom - layout.priceTop);
                const yk =
                  layout.cumTickBottom -
                  t * (layout.cumTickBottom - layout.cumTickTop);
                return (
                  <g key={`g-${i}`}>
                    <line
                      data-section="chart-line-cum-tick-grid-line"
                      data-panel="price"
                      x1={layout.innerLeft}
                      y1={yp}
                      x2={layout.innerRight}
                      y2={yp}
                      stroke={gridColor}
                      strokeWidth={1}
                    />
                    <line
                      data-section="chart-line-cum-tick-grid-line"
                      data-panel="cumTick"
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
            <g data-section="chart-line-cum-tick-axes">
              <line
                data-section="chart-line-cum-tick-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceTop}
                x2={layout.innerLeft}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cum-tick-axis"
                data-panel="price"
                x1={layout.innerLeft}
                y1={layout.priceBottom}
                x2={layout.innerRight}
                y2={layout.priceBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cum-tick-axis"
                data-panel="cumTick"
                x1={layout.innerLeft}
                y1={layout.cumTickTop}
                x2={layout.innerLeft}
                y2={layout.cumTickBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cum-tick-axis"
                data-panel="cumTick"
                x1={layout.innerLeft}
                y1={layout.cumTickBottom}
                x2={layout.innerRight}
                y2={layout.cumTickBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-cum-tick-tick-label"
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
                data-section="chart-line-cum-tick-tick-label"
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
                data-section="chart-line-cum-tick-tick-label"
                data-panel="cumTick"
                x={layout.innerLeft - 6}
                y={layout.cumTickTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatTick(layout.cumTickMax)}
              </text>
              <text
                data-section="chart-line-cum-tick-tick-label"
                data-panel="cumTick"
                x={layout.innerLeft - 6}
                y={layout.cumTickBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatTick(layout.cumTickMin)}
              </text>
            </g>
          ) : null}

          {showZeroLine ? (
            <line
              data-section="chart-line-cum-tick-zero-line"
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
              data-section="chart-line-cum-tick-price-path"
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
            <g data-section="chart-line-cum-tick-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-cum-tick-dot"
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

          {!cumTickHidden ? (
            <path
              data-section="chart-line-cum-tick-line"
              d={layout.cumTickPath}
              fill="none"
              stroke={cumTickColor}
              strokeWidth={strokeWidth}
              strokeLinejoin="round"
              strokeLinecap="round"
              role="graphics-symbol"
              tabIndex={0}
              aria-label={`Cumulative Tick line, length ${run.length}`}
            />
          ) : null}

          {showMarkers ? (
            <g data-section="chart-line-cum-tick-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-cum-tick-marker"
                  data-crossed={marker.crossed}
                  data-close={marker.close}
                  data-cum-tick={marker.cumTick}
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
                  )}, cum tick ${formatTick(marker.cumTick)}, ${crossLabelOf(
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
            <g data-section="chart-line-cum-tick-badge">
              <rect
                data-section="chart-line-cum-tick-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.priceTop + 4}
                width={180}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-cum-tick-badge-config"
                x={layout.innerLeft + 10}
                y={layout.priceTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`Cum Tick ${run.length}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-cum-tick-legend"
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
                data-section="chart-line-cum-tick-legend-item"
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
                  data-section="chart-line-cum-tick-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-cum-tick-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-cum-tick-legend-stats"
            style={{ color: axisColor }}
          >
            {`pos ${run.positiveCount} / neg ${run.negativeCount} / crosses ${run.bullishCrossCount + run.bearishCrossCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineCumTick.displayName = 'ChartLineCumTick';
