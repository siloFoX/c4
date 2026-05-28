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
 * ChartLineVolatilityStop -- pure-SVG single-panel Welles Wilder
 * Volatility Stop chart.
 *
 * The indicator carries a directional trailing stop derived from the
 * Average True Range. While long it sits below the price at
 * `high - multiplier * ATR` and trails UP only; while short it sits
 * above the price at `low + multiplier * ATR` and trails DOWN only.
 * A close that crosses the stop flips the position and seeds a new
 * stop on the opposite side at the same ATR offset.
 *
 * The True Range is `max(high - low, |high - prevClose|, |low - prevClose|)`
 * and the ATR uses Wilder's smoothing: an initial SMA seed of the
 * first `period` true ranges, then
 * `ATR[i] = ((period - 1) * ATR[i-1] + TR[i]) / period`.
 *
 * The position colours the stop segments and the markers (green long,
 * red short, slate none) so the regime reads at a glance.
 */

export interface ChartLineVolatilityStopPoint {
  x: number;
  high: number;
  low: number;
  close: number;
}

export type ChartLineVolatilityStopPosition = 'long' | 'short' | 'none';

export type ChartLineVolatilityStopSeriesId = 'price' | 'stop';

export interface ChartLineVolatilityStopBar {
  position: ChartLineVolatilityStopPosition;
  stop: number | null;
  flip: boolean;
  atr: number | null;
}

export interface ChartLineVolatilityStopSample {
  index: number;
  x: number;
  high: number;
  low: number;
  close: number;
  atr: number | null;
  stop: number | null;
  position: ChartLineVolatilityStopPosition;
  flip: boolean;
}

export interface ChartLineVolatilityStopRun {
  series: ChartLineVolatilityStopPoint[];
  period: number;
  multiplier: number;
  atr: Array<number | null>;
  bars: ChartLineVolatilityStopBar[];
  samples: ChartLineVolatilityStopSample[];
  stopFinal: number | null;
  positionFinal: ChartLineVolatilityStopPosition;
  longCount: number;
  shortCount: number;
  flipCount: number;
  ok: boolean;
}

export interface ChartLineVolatilityStopSegment {
  index: number;
  fromCx: number;
  fromCy: number;
  toCx: number;
  toCy: number;
  position: ChartLineVolatilityStopPosition;
  flip: boolean;
}

export interface ChartLineVolatilityStopMarker {
  index: number;
  x: number;
  cx: number;
  cy: number;
  stop: number;
  position: ChartLineVolatilityStopPosition;
  flip: boolean;
}

export interface ChartLineVolatilityStopDot {
  index: number;
  x: number;
  cx: number;
  cy: number;
  close: number;
}

export interface ChartLineVolatilityStopLayout {
  ok: boolean;
  width: number;
  height: number;
  padding: number;
  innerLeft: number;
  innerRight: number;
  innerTop: number;
  innerBottom: number;
  pricePath: string;
  priceDots: ChartLineVolatilityStopDot[];
  segments: ChartLineVolatilityStopSegment[];
  markers: ChartLineVolatilityStopMarker[];
  valueMin: number;
  valueMax: number;
  run: ChartLineVolatilityStopRun;
}

export interface ChartLineVolatilityStopProps
  extends Omit<SVGProps<SVGSVGElement>, 'ref' | 'children'> {
  data: ChartLineVolatilityStopPoint[];
  period?: number;
  multiplier?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  priceColor?: string;
  longColor?: string;
  shortColor?: string;
  noneColor?: string;
  flipColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showStop?: boolean;
  showMarkers?: boolean;
  showFlips?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  hiddenSeries?: ChartLineVolatilityStopSeriesId[];
  defaultHiddenSeries?: ChartLineVolatilityStopSeriesId[];
  onSeriesToggle?: (detail: {
    seriesId: ChartLineVolatilityStopSeriesId;
    hidden: boolean;
  }) => void;
  onPointClick?: (detail: { point: ChartLineVolatilityStopSample }) => void;
  formatValue?: (value: number) => string;
  formatX?: (x: number) => string;
  ariaLabel?: string;
  ariaDescription?: string;
  className?: string;
  style?: CSSProperties;
}

export const DEFAULT_CHART_LINE_VOLATILITY_STOP_WIDTH = 720;
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_HEIGHT = 360;
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_PADDING = 44;
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_PERIOD = 10;
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_MULTIPLIER = 3;
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_PRICE_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_LONG_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_SHORT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_NONE_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_FLIP_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VOLATILITY_STOP_AXIS_COLOR = '#94a3b8';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Keep only points with finite x / high / low / close. */
export function getLineVolatilityStopFinitePoints(
  data: readonly ChartLineVolatilityStopPoint[] | null | undefined,
): ChartLineVolatilityStopPoint[] {
  if (!Array.isArray(data)) return [];
  const out: ChartLineVolatilityStopPoint[] = [];
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

/** Coerce the lookback to an integer of at least 2. */
export function normalizeLineVolatilityStopPeriod(
  period: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(period) && period >= 2) return Math.floor(period);
  return fallback;
}

/** Coerce the multiplier to a strictly positive finite. */
export function normalizeLineVolatilityStopMultiplier(
  multiplier: unknown,
  fallback: number,
): number {
  if (isFiniteNumber(multiplier) && multiplier > 0) return multiplier;
  return fallback;
}

/**
 * The Wilder True Range of a single bar:
 *   `max(high - low, |high - prev_close|, |low - prev_close|)`.
 * For the first bar where no previous close exists, this collapses to
 * `high - low`.
 */
export function computeLineVolatilityStopTrueRange(
  curr: ChartLineVolatilityStopPoint,
  prev: ChartLineVolatilityStopPoint | null,
): number {
  const hl = curr.high - curr.low;
  if (!prev) return hl;
  return Math.max(
    hl,
    Math.abs(curr.high - prev.close),
    Math.abs(curr.low - prev.close),
  );
}

/**
 * The per-bar ATR via Wilder's smoothing. The first `period - 1` bars
 * are null; the bar at `period - 1` seeds with the simple mean of the
 * first `period` true ranges; subsequent bars use
 * `ATR[i] = ((period - 1) * ATR[i-1] + TR[i]) / period`.
 */
export function computeLineVolatilityStopATR(
  bars: readonly ChartLineVolatilityStopPoint[] | null | undefined,
  period: unknown,
): Array<number | null> {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const p = normalizeLineVolatilityStopPeriod(
    period,
    DEFAULT_CHART_LINE_VOLATILITY_STOP_PERIOD,
  );
  const trs: number[] = [];
  const out: Array<number | null> = [];
  for (let i = 0; i < bars.length; i += 1) {
    const tr = computeLineVolatilityStopTrueRange(
      bars[i]!,
      i > 0 ? bars[i - 1]! : null,
    );
    trs.push(tr);
    if (i < p - 1) {
      out.push(null);
      continue;
    }
    if (i === p - 1) {
      let sum = 0;
      for (let j = 0; j < p; j += 1) sum += trs[j]!;
      out.push(sum / p);
      continue;
    }
    const prev = out[i - 1];
    if (prev === null || prev === undefined) {
      out.push(null);
      continue;
    }
    out.push(((p - 1) * prev + tr) / p);
  }
  return out;
}

/**
 * Run the Volatility Stop over a series. The position starts `'none'`
 * before the ATR is defined; at the first defined bar it initialises
 * to `'long'` with `stop = high - multiplier * ATR`. While long the
 * stop trails up only; while short it trails down only. A close that
 * crosses the stop flips the position and seeds a new stop on the
 * opposite side at the same ATR offset.
 */
export function computeLineVolatilityStop(
  bars: readonly ChartLineVolatilityStopPoint[] | null | undefined,
  period: unknown,
  multiplier: unknown,
): ChartLineVolatilityStopBar[] {
  if (!Array.isArray(bars) || bars.length === 0) return [];
  const m = normalizeLineVolatilityStopMultiplier(
    multiplier,
    DEFAULT_CHART_LINE_VOLATILITY_STOP_MULTIPLIER,
  );
  const atrs = computeLineVolatilityStopATR(bars, period);
  const out: ChartLineVolatilityStopBar[] = [];
  let position: ChartLineVolatilityStopPosition = 'none';
  let stop = Number.NaN;
  for (let i = 0; i < bars.length; i += 1) {
    const bar = bars[i]!;
    const atr = atrs[i];
    if (atr === null || atr === undefined) {
      out.push({ position: 'none', stop: null, flip: false, atr: null });
      continue;
    }
    if (position === 'none') {
      position = 'long';
      stop = bar.high - m * atr;
      out.push({ position, stop, flip: false, atr });
      continue;
    }
    if (position === 'long') {
      const candidate = bar.high - m * atr;
      if (candidate > stop) stop = candidate;
      if (bar.close < stop) {
        position = 'short';
        stop = bar.low + m * atr;
        out.push({ position, stop, flip: true, atr });
        continue;
      }
    } else {
      const candidate = bar.low + m * atr;
      if (candidate < stop) stop = candidate;
      if (bar.close > stop) {
        position = 'long';
        stop = bar.high - m * atr;
        out.push({ position, stop, flip: true, atr });
        continue;
      }
    }
    out.push({ position, stop, flip: false, atr });
  }
  return out;
}

export interface ChartLineVolatilityStopOptions {
  period?: number;
  multiplier?: number;
}

/** Run the full Volatility Stop pipeline. */
export function runLineVolatilityStop(
  data: readonly ChartLineVolatilityStopPoint[] | null | undefined,
  options: ChartLineVolatilityStopOptions = {},
): ChartLineVolatilityStopRun {
  const series = getLineVolatilityStopFinitePoints(data)
    .slice()
    .sort((a, b) => a.x - b.x);
  const period = normalizeLineVolatilityStopPeriod(
    options.period,
    DEFAULT_CHART_LINE_VOLATILITY_STOP_PERIOD,
  );
  const multiplier = normalizeLineVolatilityStopMultiplier(
    options.multiplier,
    DEFAULT_CHART_LINE_VOLATILITY_STOP_MULTIPLIER,
  );
  const bars = computeLineVolatilityStop(series, period, multiplier);
  const atr = bars.map((b) => b.atr ?? null);
  const samples: ChartLineVolatilityStopSample[] = series.map(
    (point, index) => {
      const b = bars[index]!;
      return {
        index,
        x: point.x,
        high: point.high,
        low: point.low,
        close: point.close,
        atr: b.atr ?? null,
        stop: b.stop,
        position: b.position,
        flip: b.flip,
      };
    },
  );
  let longCount = 0;
  let shortCount = 0;
  let flipCount = 0;
  let stopFinal: number | null = null;
  let positionFinal: ChartLineVolatilityStopPosition = 'none';
  for (const sample of samples) {
    if (sample.position === 'long') longCount += 1;
    else if (sample.position === 'short') shortCount += 1;
    if (sample.flip) flipCount += 1;
    if (isFiniteNumber(sample.stop)) {
      stopFinal = sample.stop;
      positionFinal = sample.position;
    }
  }
  return {
    series = [],
    period,
    multiplier,
    atr,
    bars,
    samples,
    stopFinal,
    positionFinal,
    longCount,
    shortCount,
    flipCount,
    ok: series.length >= 2,
  };
}

export interface ChartLineVolatilityStopLayoutOptions
  extends ChartLineVolatilityStopOptions {
  data: readonly ChartLineVolatilityStopPoint[] | null | undefined;
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
export function computeLineVolatilityStopLayout(
  options: ChartLineVolatilityStopLayoutOptions,
): ChartLineVolatilityStopLayout {
  const width = isFiniteNumber(options.width)
    ? options.width
    : DEFAULT_CHART_LINE_VOLATILITY_STOP_WIDTH;
  const height = isFiniteNumber(options.height)
    ? options.height
    : DEFAULT_CHART_LINE_VOLATILITY_STOP_HEIGHT;
  const padding = isFiniteNumber(options.padding)
    ? options.padding
    : DEFAULT_CHART_LINE_VOLATILITY_STOP_PADDING;

  const run = runLineVolatilityStop(options.data, {
    ...(options.period !== undefined ? { period: options.period } : {}),
    ...(options.multiplier !== undefined
      ? { multiplier: options.multiplier }
      : {}),
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

  let valueMin = Infinity;
  let valueMax = -Infinity;
  for (const sample of run.samples) {
    if (sample.low < valueMin) valueMin = sample.low;
    if (sample.high > valueMax) valueMax = sample.high;
    if (isFiniteNumber(sample.stop)) {
      if (sample.stop < valueMin) valueMin = sample.stop;
      if (sample.stop > valueMax) valueMax = sample.stop;
    }
  }
  if (!Number.isFinite(valueMin) || !Number.isFinite(valueMax)) {
    valueMin = 0;
    valueMax = 1;
  }
  if (valueMin === valueMax) {
    valueMin -= 1;
    valueMax += 1;
  }
  const yAt = (value: number): number =>
    innerBottom - ((value - valueMin) / (valueMax - valueMin)) * innerHeight;

  const priceLinePoints: Array<{ x: number; y: number }> = [];
  const priceDots: ChartLineVolatilityStopDot[] = [];
  run.samples.forEach((sample, index) => {
    const cx = xAt(index);
    const cy = yAt(sample.close);
    priceLinePoints.push({ x: cx, y: cy });
    priceDots.push({ index, x: sample.x, cx, cy, close: sample.close });
  });

  const segments: ChartLineVolatilityStopSegment[] = [];
  const markers: ChartLineVolatilityStopMarker[] = [];
  run.samples.forEach((sample, index) => {
    if (!isFiniteNumber(sample.stop) || sample.position === 'none') return;
    const cx = xAt(index);
    const cy = yAt(sample.stop);
    markers.push({
      index,
      x: sample.x,
      cx,
      cy,
      stop: sample.stop,
      position: sample.position,
      flip: sample.flip,
    });
    if (index === 0) return;
    const prev = run.samples[index - 1]!;
    if (!isFiniteNumber(prev.stop) || prev.position === 'none') return;
    if (prev.position !== sample.position || sample.flip) return;
    const fromCx = xAt(index - 1);
    const fromCy = yAt(prev.stop);
    segments.push({
      index,
      fromCx,
      fromCy,
      toCx: cx,
      toCy: cy,
      position: sample.position,
      flip: sample.flip,
    });
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
    segments,
    markers,
    valueMin,
    valueMax,
    run,
  };
}

/** Build a screen-reader description. */
export function describeLineVolatilityStopChart(
  data: readonly ChartLineVolatilityStopPoint[] | null | undefined,
  options: ChartLineVolatilityStopOptions = {},
): string {
  const run = runLineVolatilityStop(data, options);
  if (!run.ok) return 'No data';
  const total = run.series.length;
  const finalStop =
    run.stopFinal === null ? 'n/a' : run.stopFinal.toFixed(2);
  return (
    `Single-panel chart with a Welles Wilder Volatility Stop (period ` +
    `${run.period}, multiplier ${run.multiplier}): the price line is ` +
    `paired with a trailing stop derived from the Average True Range. ` +
    `While long the stop sits below the price and trails up only; ` +
    `while short the stop sits above the price and trails down only. ` +
    `A close that crosses the stop flips the position. Across ` +
    `${total} bars the position is long on ${run.longCount}, short on ` +
    `${run.shortCount}, and the stop flips ${run.flipCount} times. ` +
    `The final stop sits at ${finalStop} (position ${run.positionFinal}).`
  );
}

function defaultFormatValue(value: number): string {
  if (!Number.isFinite(value)) return '-';
  return Math.abs(value) >= 100 ? value.toFixed(2) : value.toFixed(4);
}

function defaultFormatX(x: number): string {
  return String(x);
}

function positionColorOf(
  position: ChartLineVolatilityStopPosition,
  longColor: string,
  shortColor: string,
  noneColor: string,
): string {
  if (position === 'long') return longColor;
  if (position === 'short') return shortColor;
  return noneColor;
}

function positionLabelOf(position: ChartLineVolatilityStopPosition): string {
  if (position === 'long') return 'Long';
  if (position === 'short') return 'Short';
  return 'n/a';
}

/**
 * ChartLineVolatilityStop -- single-panel pure-SVG Welles Wilder
 * Volatility Stop chart.
 */
export const ChartLineVolatilityStop = forwardRef<
  HTMLDivElement,
  ChartLineVolatilityStopProps
>(function ChartLineVolatilityStop(props, ref) {
  const {
    data,
    period = DEFAULT_CHART_LINE_VOLATILITY_STOP_PERIOD,
    multiplier = DEFAULT_CHART_LINE_VOLATILITY_STOP_MULTIPLIER,
    width = DEFAULT_CHART_LINE_VOLATILITY_STOP_WIDTH,
    height = DEFAULT_CHART_LINE_VOLATILITY_STOP_HEIGHT,
    padding = DEFAULT_CHART_LINE_VOLATILITY_STOP_PADDING,
    tickCount = DEFAULT_CHART_LINE_VOLATILITY_STOP_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VOLATILITY_STOP_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VOLATILITY_STOP_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_VOLATILITY_STOP_PRICE_COLOR,
    longColor = DEFAULT_CHART_LINE_VOLATILITY_STOP_LONG_COLOR,
    shortColor = DEFAULT_CHART_LINE_VOLATILITY_STOP_SHORT_COLOR,
    noneColor = DEFAULT_CHART_LINE_VOLATILITY_STOP_NONE_COLOR,
    flipColor = DEFAULT_CHART_LINE_VOLATILITY_STOP_FLIP_COLOR,
    gridColor = DEFAULT_CHART_LINE_VOLATILITY_STOP_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_VOLATILITY_STOP_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showStop = true,
    showMarkers = true,
    showFlips = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    hiddenSeries,
    defaultHiddenSeries,
    onSeriesToggle,
    onPointClick,
    formatValue = defaultFormatValue,
    formatX = defaultFormatX,
    ariaLabel,
    ariaDescription,
    className,
    style,
    ...svgProps
  } = props;

  const reactId = useId();
  const baseId = `chart-line-volatility-stop-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const descId = `${baseId}-desc`;

  const [hover, setHover] = useState<number | null>(null);
  const [internalHidden, setInternalHidden] = useState<
    ChartLineVolatilityStopSeriesId[]
  >(defaultHiddenSeries ?? []);
  const hiddenList = hiddenSeries ?? internalHidden;
  const isHidden = (id: ChartLineVolatilityStopSeriesId): boolean =>
    hiddenList.includes(id);

  const layout = useMemo(
    () =>
      computeLineVolatilityStopLayout({
        data,
        period,
        multiplier,
        width,
        height,
        padding,
      }),
    [data, period, multiplier, width, height, padding],
  );

  const run = layout.run;
  const description =
    ariaDescription ??
    describeLineVolatilityStopChart(data, { period, multiplier });
  const resolvedLabel =
    ariaLabel ??
    `Volatility Stop chart, period ${run.period}, multiplier ${run.multiplier}`;

  const isEmpty = !layout.ok;

  const toggleSeries = (id: ChartLineVolatilityStopSeriesId): void => {
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
    const tooltipW = 204;
    const rawX = anchorX + 12;
    const tx = Math.min(rawX, layout.width - tooltipW - 4);
    const ty = layout.innerTop + 6;
    tooltip = (
      <g data-section="chart-line-volatility-stop-tooltip" pointerEvents="none">
        <rect
          x={tx}
          y={ty}
          width={tooltipW}
          height={120}
          rx={6}
          fill="#0f172a"
          opacity={0.92}
        />
        <text
          data-section="chart-line-volatility-stop-tooltip-x"
          x={tx + 10}
          y={ty + 19}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={600}
        >
          {formatX(hoverSample.x)}
        </text>
        <text
          data-section="chart-line-volatility-stop-tooltip-close"
          x={tx + 10}
          y={ty + 35}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`Close: ${formatValue(hoverSample.close)}`}
        </text>
        <text
          data-section="chart-line-volatility-stop-tooltip-stop"
          x={tx + 10}
          y={ty + 51}
          fill="#c4b5fd"
          fontSize={11}
          fontWeight={600}
        >
          {`Stop: ${
            hoverSample.stop === null ? 'n/a' : formatValue(hoverSample.stop)
          }`}
        </text>
        <text
          data-section="chart-line-volatility-stop-tooltip-atr"
          x={tx + 10}
          y={ty + 67}
          fill="#cbd5e1"
          fontSize={11}
        >
          {`ATR: ${
            hoverSample.atr === null ? 'n/a' : formatValue(hoverSample.atr)
          }`}
        </text>
        <text
          data-section="chart-line-volatility-stop-tooltip-position"
          x={tx + 10}
          y={ty + 83}
          fill={positionColorOf(
            hoverSample.position,
            longColor,
            shortColor,
            noneColor,
          )}
          fontSize={11}
          fontWeight={600}
        >
          {`Position: ${positionLabelOf(hoverSample.position)}`}
        </text>
        <text
          data-section="chart-line-volatility-stop-tooltip-flip"
          x={tx + 10}
          y={ty + 99}
          fill={hoverSample.flip ? flipColor : '#cbd5e1'}
          fontSize={11}
        >
          {`Flip: ${hoverSample.flip ? 'yes' : 'no'}`}
        </text>
      </g>
    );
  }

  const priceHidden = isHidden('price');
  const stopHidden = isHidden('stop') || !showStop;

  const legendItems: Array<{
    id: ChartLineVolatilityStopSeriesId;
    label: string;
    color: string;
  }> = [
    { id: 'price', label: 'Close', color: priceColor },
    { id: 'stop', label: 'Volatility Stop', color: longColor },
  ];

  return (
    <div
      ref={ref}
      className={className}
      style={containerStyle}
      data-section="chart-line-volatility-stop"
      data-empty={isEmpty ? 'true' : 'false'}
      data-period={run.period}
      data-multiplier={run.multiplier}
      data-stop-final={run.stopFinal === null ? '' : run.stopFinal}
      data-position-final={run.positionFinal}
      data-long-count={run.longCount}
      data-short-count={run.shortCount}
      data-flip-count={run.flipCount}
      data-total-points={run.series.length}
      data-animate={animate ? 'true' : 'false'}
      role="region"
      aria-label={resolvedLabel}
      aria-describedby={descId}
    >
      <span
        id={descId}
        data-section="chart-line-volatility-stop-aria-desc"
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
          data-section="chart-line-volatility-stop-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          <text
            data-section="chart-line-volatility-stop-empty"
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
          data-section="chart-line-volatility-stop-svg"
          className={animate ? 'motion-safe:animate-fade-in' : undefined}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={resolvedLabel}
          {...svgProps}
        >
          {showGrid ? (
            <g data-section="chart-line-volatility-stop-grid">
              {tickValues.map((t, i) => {
                const y =
                  layout.innerBottom -
                  t * (layout.innerBottom - layout.innerTop);
                return (
                  <line
                    key={`g-${i}`}
                    data-section="chart-line-volatility-stop-grid-line"
                    x1={layout.innerLeft}
                    y1={y}
                    x2={layout.innerRight}
                    y2={y}
                    stroke={gridColor}
                    strokeWidth={1}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-volatility-stop-axes">
              <line
                data-section="chart-line-volatility-stop-axis"
                x1={layout.innerLeft}
                y1={layout.innerTop}
                x2={layout.innerLeft}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-volatility-stop-axis"
                x1={layout.innerLeft}
                y1={layout.innerBottom}
                x2={layout.innerRight}
                y2={layout.innerBottom}
                stroke={axisColor}
                strokeWidth={1}
              />
              <text
                data-section="chart-line-volatility-stop-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerTop + 4}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMax)}
              </text>
              <text
                data-section="chart-line-volatility-stop-tick-label"
                x={layout.innerLeft - 6}
                y={layout.innerBottom}
                textAnchor="end"
                fill={axisColor}
                fontSize={10}
              >
                {formatValue(layout.valueMin)}
              </text>
            </g>
          ) : null}

          {!priceHidden ? (
            <path
              data-section="chart-line-volatility-stop-price-path"
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
            <g data-section="chart-line-volatility-stop-dots">
              {layout.priceDots.map((dot) => (
                <circle
                  key={`dot-${dot.index}`}
                  data-section="chart-line-volatility-stop-dot"
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dotRadius}
                  fill={priceColor}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(dot.x)}, close ${formatValue(
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

          {!stopHidden ? (
            <g data-section="chart-line-volatility-stop-segments">
              {layout.segments.map((seg) => (
                <line
                  key={`seg-${seg.index}`}
                  data-section="chart-line-volatility-stop-segment"
                  data-position={seg.position}
                  x1={seg.fromCx}
                  y1={seg.fromCy}
                  x2={seg.toCx}
                  y2={seg.toCy}
                  stroke={positionColorOf(
                    seg.position,
                    longColor,
                    shortColor,
                    noneColor,
                  )}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </g>
          ) : null}

          {!stopHidden && showMarkers ? (
            <g data-section="chart-line-volatility-stop-markers">
              {layout.markers.map((marker) => (
                <circle
                  key={`marker-${marker.index}`}
                  data-section="chart-line-volatility-stop-marker"
                  data-position={marker.position}
                  data-flip={marker.flip ? 'true' : 'false'}
                  data-stop={marker.stop}
                  cx={marker.cx}
                  cy={marker.cy}
                  r={dotRadius + (marker.flip ? 1.5 : 0.5)}
                  fill={
                    marker.flip && showFlips
                      ? flipColor
                      : positionColorOf(
                          marker.position,
                          longColor,
                          shortColor,
                          noneColor,
                        )
                  }
                  stroke={
                    marker.flip && showFlips
                      ? positionColorOf(
                          marker.position,
                          longColor,
                          shortColor,
                          noneColor,
                        )
                      : 'none'
                  }
                  strokeWidth={marker.flip && showFlips ? 1.5 : 0}
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`Bar ${formatX(marker.x)}, stop ${formatValue(
                    marker.stop,
                  )}, ${positionLabelOf(marker.position)}${
                    marker.flip ? ' (flip)' : ''
                  }`}
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
            <g data-section="chart-line-volatility-stop-badge">
              <rect
                data-section="chart-line-volatility-stop-badge-icon"
                x={layout.innerLeft + 4}
                y={layout.innerTop + 4}
                width={104}
                height={18}
                rx={4}
                fill="#1e293b"
                opacity={0.85}
              />
              <text
                data-section="chart-line-volatility-stop-badge-config"
                x={layout.innerLeft + 10}
                y={layout.innerTop + 16}
                fill="#e2e8f0"
                fontSize={10}
                fontWeight={600}
              >
                {`VSTOP ${run.period}/${run.multiplier}`}
              </text>
            </g>
          ) : null}

          {tooltip}
        </svg>
      )}

      {showLegend && !isEmpty ? (
        <div
          data-section="chart-line-volatility-stop-legend"
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
                data-section="chart-line-volatility-stop-legend-item"
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
                  data-section="chart-line-volatility-stop-legend-swatch"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 3,
                    background: item.color,
                    display: 'inline-block',
                  }}
                />
                <span data-section="chart-line-volatility-stop-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-volatility-stop-legend-stats"
            style={{ color: axisColor }}
          >
            {`long ${run.longCount} / short ${run.shortCount} / flips ${run.flipCount}`}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineVolatilityStop.displayName = 'ChartLineVolatilityStop';
