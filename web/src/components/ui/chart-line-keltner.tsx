import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_KELTNER_WIDTH = 560;
export const DEFAULT_CHART_LINE_KELTNER_HEIGHT = 320;
export const DEFAULT_CHART_LINE_KELTNER_PADDING = 40;
export const DEFAULT_CHART_LINE_KELTNER_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_KELTNER_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_KELTNER_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_KELTNER_EMA_PERIOD = 20;
export const DEFAULT_CHART_LINE_KELTNER_ATR_PERIOD = 10;
export const DEFAULT_CHART_LINE_KELTNER_MULTIPLIER = 2;
export const DEFAULT_CHART_LINE_KELTNER_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_KELTNER_MIDDLE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KELTNER_UPPER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_KELTNER_LOWER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_KELTNER_CHANNEL_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_KELTNER_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_KELTNER_AXIS_COLOR = '#cbd5e1';

export interface ChartLineKeltnerPoint {
  x: number;
  value: number;
}

export interface ChartLineKeltnerRun {
  series: ChartLineKeltnerPoint[];
  emaPeriod: number;
  atrPeriod: number;
  multiplier: number;
  middle: number[];
  atr: (number | null)[];
  upper: (number | null)[];
  lower: (number | null)[];
  bandPointCount: number;
  ok: boolean;
}

export interface ChartLineKeltnerPriceDot {
  index: number;
  x: number;
  value: number;
  px: number;
  py: number;
  middle: number;
  upper: number | null;
  lower: number | null;
  atr: number | null;
}

export interface ChartLineKeltnerLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: number[];
  yTicks: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  pricePath: string;
  middlePath: string;
  upperPath: string;
  lowerPath: string;
  channelPath: string;
  priceDots: ChartLineKeltnerPriceDot[];
  emaPeriod: number;
  atrPeriod: number;
  multiplier: number;
  bandPointCount: number;
  totalPoints: number;
}

export interface ComputeLineKeltnerLayoutOptions {
  data: readonly ChartLineKeltnerPoint[];
  emaPeriod?: number;
  atrPeriod?: number;
  multiplier?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineKeltnerProps {
  data: readonly ChartLineKeltnerPoint[];
  emaPeriod?: number;
  atrPeriod?: number;
  multiplier?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
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
  channelColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showMiddle?: boolean;
  showChannel?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: { point: ChartLineKeltnerPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineKeltnerFinitePoints(
  points: readonly ChartLineKeltnerPoint[] | null | undefined,
): ChartLineKeltnerPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineKeltnerPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineKeltnerPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Coerce a band multiplier to a positive number. A non-finite or
 * non-positive value falls back to `fallback`.
 */
export function normalizeLineKeltnerMultiplier(
  multiplier: number,
  fallback: number,
): number {
  return isFiniteNumber(multiplier) && multiplier > 0 ? multiplier : fallback;
}

/**
 * Exponential moving average. The smoothing factor is
 * `alpha = 2 / (period + 1)`; the series is seeded with its first
 * value, so the EMA is defined at every index.
 */
export function computeLineKeltnerEMA(
  values: readonly number[] | null | undefined,
  period: number,
): number[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  const p = period < 1 ? 1 : Math.floor(period);
  const alpha = 2 / (p + 1);
  const out: number[] = [];
  let ema = values[0]!;
  out.push(ema);
  for (let i = 1; i < values.length; i += 1) {
    ema = alpha * values[i]! + (1 - alpha) * ema;
    out.push(ema);
  }
  return out;
}

/**
 * Average True Range, Wilder-smoothed. For a single-value series the
 * true range at index `i` is the absolute period-over-period change
 * `|v[i] - v[i-1]|`. The first ATR (at index `period`) is the simple
 * mean of the first `period` true ranges; subsequent values use
 * Wilder smoothing `(prev * (period - 1) + tr) / period`. Indices
 * before the window is full are `null`.
 */
export function computeLineKeltnerATR(
  values: readonly number[] | null | undefined,
  period: number,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const out: (number | null)[] = new Array(n).fill(null);
  if (n < p + 1) return out;
  let sum = 0;
  for (let i = 1; i <= p; i += 1) {
    sum += Math.abs(values[i]! - values[i - 1]!);
  }
  let atr = sum / p;
  out[p] = atr;
  for (let i = p + 1; i < n; i += 1) {
    const tr = Math.abs(values[i]! - values[i - 1]!);
    atr = (atr * (p - 1) + tr) / p;
    out[i] = atr;
  }
  return out;
}

export function runLineKeltner(
  points: readonly ChartLineKeltnerPoint[] | null | undefined,
  options?: {
    emaPeriod?: number;
    atrPeriod?: number;
    multiplier?: number;
  },
): ChartLineKeltnerRun {
  const finite = getLineKeltnerFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const emaPeriod = normalizeLineKeltnerPeriod(
    options?.emaPeriod ?? DEFAULT_CHART_LINE_KELTNER_EMA_PERIOD,
    DEFAULT_CHART_LINE_KELTNER_EMA_PERIOD,
  );
  const atrPeriod = normalizeLineKeltnerPeriod(
    options?.atrPeriod ?? DEFAULT_CHART_LINE_KELTNER_ATR_PERIOD,
    DEFAULT_CHART_LINE_KELTNER_ATR_PERIOD,
  );
  const multiplier = normalizeLineKeltnerMultiplier(
    options?.multiplier ?? DEFAULT_CHART_LINE_KELTNER_MULTIPLIER,
    DEFAULT_CHART_LINE_KELTNER_MULTIPLIER,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      emaPeriod,
      atrPeriod,
      multiplier,
      middle: n === 1 ? [series[0]!.value] : [],
      atr: n === 1 ? [null] : [],
      upper: n === 1 ? [null] : [],
      lower: n === 1 ? [null] : [],
      bandPointCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const middle = computeLineKeltnerEMA(values, emaPeriod);
  const atr = computeLineKeltnerATR(values, atrPeriod);
  const upper: (number | null)[] = middle.map((m, i) =>
    atr[i] !== null ? m + multiplier * atr[i]! : null,
  );
  const lower: (number | null)[] = middle.map((m, i) =>
    atr[i] !== null ? m - multiplier * atr[i]! : null,
  );
  let bandPointCount = 0;
  for (const a of atr) if (a !== null) bandPointCount += 1;

  return {
    series = [],
    emaPeriod,
    atrPeriod,
    multiplier,
    middle,
    atr,
    upper,
    lower,
    bandPointCount,
    ok: true,
  };
}

function buildPath(
  points: readonly { px: number; py: number }[],
): string {
  if (points.length === 0) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
  }
  return parts.join(' ');
}

function normaliseHidden(
  hidden: ReadonlySet<string> | readonly string[] | null | undefined,
): Set<string> {
  if (!hidden) return new Set();
  if (hidden instanceof Set) return new Set(hidden);
  if (Array.isArray(hidden)) return new Set(hidden);
  return new Set();
}

function computeTicks(min: number, max: number, count: number): number[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max) || count < 2) return [];
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  const ticks: number[] = [];
  for (let i = 0; i < count; i += 1) ticks.push(min + step * i);
  return ticks;
}

export function computeLineKeltnerLayout(
  options: ComputeLineKeltnerLayoutOptions,
): ChartLineKeltnerLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_KELTNER_TICK_COUNT,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const run = runLineKeltner(data, {
    ...(isFiniteNumber(options.emaPeriod)
      ? { emaPeriod: options.emaPeriod }
      : {}),
    ...(isFiniteNumber(options.atrPeriod)
      ? { atrPeriod: options.atrPeriod }
      : {}),
    ...(isFiniteNumber(options.multiplier)
      ? { multiplier: options.multiplier }
      : {}),
  });
  const empty: ChartLineKeltnerLayout = {
    ok: false,
    width,
    height,
    panel,
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    pricePath: '',
    middlePath: '',
    upperPath: '',
    lowerPath: '',
    channelPath: '',
    priceDots: [],
    emaPeriod: run.emaPeriod,
    atrPeriod: run.atrPeriod,
    multiplier: run.multiplier,
    bandPointCount: 0,
    totalPoints: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  run.series.forEach((p, i) => {
    if (p.x < xLo) xLo = p.x;
    if (p.x > xHi) xHi = p.x;
    if (p.value < yLo) yLo = p.value;
    if (p.value > yHi) yHi = p.value;
    const m = run.middle[i]!;
    if (m < yLo) yLo = m;
    if (m > yHi) yHi = m;
    const u = run.upper[i];
    const l = run.lower[i];
    if (u !== null) {
      if (u < yLo) yLo = u;
      if (u > yHi) yHi = u;
    }
    if (l !== null) {
      if (l < yLo) yLo = l;
      if (l > yHi) yHi = l;
    }
  });

  if (isFiniteNumber(xMinOverride)) xLo = xMinOverride;
  if (isFiniteNumber(xMaxOverride)) xHi = xMaxOverride;
  if (isFiniteNumber(yMinOverride)) yLo = yMinOverride;
  if (isFiniteNumber(yMaxOverride)) yHi = yMaxOverride;

  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const xRange = xHi - xLo;
  const yRange = yHi - yLo;
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / yRange) * panel.height;

  const priceDots: ChartLineKeltnerPriceDot[] = run.series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    px: projectX(p.x),
    py: projectY(p.value),
    middle: run.middle[i]!,
    upper: run.upper[i] ?? null,
    lower: run.lower[i] ?? null,
    atr: run.atr[i] ?? null,
  }));

  const upperPts: { px: number; py: number }[] = [];
  const lowerPts: { px: number; py: number }[] = [];
  run.series.forEach((p, i) => {
    if (run.upper[i] !== null) {
      upperPts.push({ px: projectX(p.x), py: projectY(run.upper[i]!) });
    }
    if (run.lower[i] !== null) {
      lowerPts.push({ px: projectX(p.x), py: projectY(run.lower[i]!) });
    }
  });

  let channelPath = '';
  if (upperPts.length > 0 && lowerPts.length === upperPts.length) {
    const forward = upperPts
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`)
      .join(' ');
    const back = [...lowerPts]
      .reverse()
      .map((p) => `L ${p.px.toFixed(3)} ${p.py.toFixed(3)}`)
      .join(' ');
    channelPath = `${forward} ${back} Z`;
  }

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount),
    yTicks: computeTicks(yLo, yHi, tickCount),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    innerWidth,
    innerHeight,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    middlePath: buildPath(
      run.series.map((p, i) => ({
        px: projectX(p.x),
        py: projectY(run.middle[i]!),
      })),
    ),
    upperPath: buildPath(upperPts),
    lowerPath: buildPath(lowerPts),
    channelPath,
    priceDots,
    emaPeriod: run.emaPeriod,
    atrPeriod: run.atrPeriod,
    multiplier: run.multiplier,
    bandPointCount: run.bandPointCount,
    totalPoints: run.series.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineKeltnerChart(
  data: readonly ChartLineKeltnerPoint[] | null | undefined,
  options?: { emaPeriod?: number; atrPeriod?: number; multiplier?: number },
): string {
  const run = runLineKeltner(data, options);
  if (!run.ok) return 'No data';
  return `Line chart with Keltner channels: an EMA(${run.emaPeriod}) centre with an ATR(${run.atrPeriod})-scaled band at ${run.multiplier}x -- ${run.bandPointCount} of ${run.series.length} points banded.`;
}

const KELTNER_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineKeltner = forwardRef<
  HTMLDivElement,
  ChartLineKeltnerProps
>(function ChartLineKeltner(
  props: ChartLineKeltnerProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    emaPeriod,
    atrPeriod,
    multiplier,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_KELTNER_WIDTH,
    height = DEFAULT_CHART_LINE_KELTNER_HEIGHT,
    padding = DEFAULT_CHART_LINE_KELTNER_PADDING,
    tickCount = DEFAULT_CHART_LINE_KELTNER_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_KELTNER_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_KELTNER_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_KELTNER_PRICE_COLOR,
    middleColor = DEFAULT_CHART_LINE_KELTNER_MIDDLE_COLOR,
    upperColor = DEFAULT_CHART_LINE_KELTNER_UPPER_COLOR,
    lowerColor = DEFAULT_CHART_LINE_KELTNER_LOWER_COLOR,
    channelColor = DEFAULT_CHART_LINE_KELTNER_CHANNEL_COLOR,
    gridColor = DEFAULT_CHART_LINE_KELTNER_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_KELTNER_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showMiddle = true,
    showChannel = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with Keltner channels',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  } = props;

  const reactId = useId();
  const descId = `${reactId}-desc`;

  const isControlled = controlledHidden !== undefined;
  const [uncontrolled, setUncontrolled] = useState<Set<string>>(() =>
    normaliseHidden(defaultHiddenSeries),
  );
  const hiddenSet = isControlled
    ? normaliseHidden(controlledHidden)
    : uncontrolled;

  const layout = useMemo(
    () =>
      computeLineKeltnerLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(emaPeriod) ? { emaPeriod } : {}),
        ...(isFiniteNumber(atrPeriod) ? { atrPeriod } : {}),
        ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      data,
      width,
      height,
      padding,
      tickCount,
      emaPeriod,
      atrPeriod,
      multiplier,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineKeltnerChart(data, {
        ...(isFiniteNumber(emaPeriod) ? { emaPeriod } : {}),
        ...(isFiniteNumber(atrPeriod) ? { atrPeriod } : {}),
        ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
      }),
    [ariaDescription, data, emaPeriod, atrPeriod, multiplier],
  );

  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverIndex(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (seriesId: string) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(seriesId);
      if (willHide) next.add(seriesId);
      else next.delete(seriesId);
      if (!isControlled) setUncontrolled(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ seriesId, hidden: willHide });
    },
    [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
  );

  const containerStyle: CSSProperties = {
    width,
    height,
    position: 'relative',
    ...(style ?? {}),
  };

  if (!layout.ok) {
    return (
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        aria-describedby={descId}
        className={className}
        style={containerStyle}
        data-section="chart-line-keltner"
        data-empty="true"
        data-band-point-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span id={descId} data-section="chart-line-keltner-aria-desc" style={KELTNER_SR_STYLE}>
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const priceVisible = !hiddenSet.has('price');
  const middleVisible = showMiddle && !hiddenSet.has('middle');
  const channelVisible = showChannel && !hiddenSet.has('channel');

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'middle', label: 'EMA', color: middleColor },
    { id: 'channel', label: 'Channel', color: channelColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-keltner"
      data-empty="false"
      data-band-point-count={layout.bandPointCount}
      data-ema-period={layout.emaPeriod}
      data-atr-period={layout.atrPeriod}
      data-multiplier={layout.multiplier}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span id={descId} data-section="chart-line-keltner-aria-desc" style={KELTNER_SR_STYLE}>
        {summary}
      </span>

      <div
        data-section="chart-line-keltner-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-keltner-badge"
            data-ema-period={layout.emaPeriod}
            data-atr-period={layout.atrPeriod}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span data-section="chart-line-keltner-badge-icon" aria-hidden="true">
              KC
            </span>
            <span data-section="chart-line-keltner-badge-ema">
              ema={layout.emaPeriod}
            </span>
            <span data-section="chart-line-keltner-badge-atr">
              atr={layout.atrPeriod}
            </span>
            <span data-section="chart-line-keltner-badge-mult">
              x{layout.multiplier}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-keltner-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-keltner-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => {
                const py =
                  layout.panel.y +
                  layout.panel.height -
                  ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                    layout.panel.height;
                return (
                  <line
                    key={`gy-${i}`}
                    data-section="chart-line-keltner-grid-line"
                    data-axis="y"
                    x1={layout.panel.x}
                    x2={layout.panel.x + layout.panel.width}
                    y1={py}
                    y2={py}
                  />
                );
              })}
              {layout.xTicks.map((t, i) => {
                const px =
                  layout.panel.x +
                  ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                    layout.panel.width;
                return (
                  <line
                    key={`gx-${i}`}
                    data-section="chart-line-keltner-grid-line"
                    data-axis="x"
                    x1={px}
                    x2={px}
                    y1={layout.panel.y}
                    y2={layout.panel.y + layout.panel.height}
                  />
                );
              })}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-keltner-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-keltner-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-keltner-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-keltner-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-keltner-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-keltner-tick-label"
                        data-axis="x"
                        x={px}
                        y={layout.panel.y + layout.panel.height + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatX(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              <g data-section="chart-line-keltner-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-keltner-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-keltner-tick-label"
                        data-axis="y"
                        x={layout.panel.x - 6}
                        y={py + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill={axisColor}
                        stroke="none"
                      >
                        {formatValue(t)}
                      </text>
                    </g>
                  );
                })}
              </g>
              {xLabel ? (
                <text
                  data-section="chart-line-keltner-x-label"
                  x={layout.panel.x + layout.panel.width / 2}
                  y={height - 4}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-keltner-y-label"
                  transform={`rotate(-90 12 ${layout.panel.y + layout.panel.height / 2})`}
                  x={12}
                  y={layout.panel.y + layout.panel.height / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill={axisColor}
                  stroke="none"
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {channelVisible && layout.channelPath ? (
            <path
              data-section="chart-line-keltner-channel"
              d={layout.channelPath}
              fill={channelColor}
              fillOpacity={0.12}
              stroke="none"
            />
          ) : null}

          {channelVisible && layout.upperPath ? (
            <path
              data-section="chart-line-keltner-upper"
              d={layout.upperPath}
              fill="none"
              stroke={upperColor}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
          ) : null}

          {channelVisible && layout.lowerPath ? (
            <path
              data-section="chart-line-keltner-lower"
              d={layout.lowerPath}
              fill="none"
              stroke={lowerColor}
              strokeWidth={1.25}
              strokeDasharray="4 3"
            />
          ) : null}

          {middleVisible && layout.middlePath ? (
            <path
              data-section="chart-line-keltner-middle"
              d={layout.middlePath}
              fill="none"
              stroke={middleColor}
              strokeWidth={1.5}
            />
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-keltner-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-keltner-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Price ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-keltner-dot"
                    data-point-index={d.index}
                    data-x={d.x}
                    data-value={d.value}
                    cx={d.px}
                    cy={d.py}
                    r={isHover ? dotRadius + 1.5 : dotRadius}
                    fill={priceColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(d.index);
                      setTooltipPos({ px: d.px, py: d.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ point: d })}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.priceDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-keltner-tooltip"
                  data-point-index={d.index}
                  style={{
                    position: 'absolute',
                    left: tooltipPos.px + 8,
                    top: tooltipPos.py + 8,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '6px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    pointerEvents: 'none',
                    minWidth: 160,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div data-section="chart-line-keltner-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-keltner-tooltip-price"
                    style={{ fontWeight: 600 }}
                  >
                    price: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-keltner-tooltip-middle">
                    ema: {formatValue(d.middle)}
                  </div>
                  <div data-section="chart-line-keltner-tooltip-band">
                    band:{' '}
                    {d.lower === null || d.upper === null
                      ? 'n/a'
                      : `${formatValue(d.lower)} to ${formatValue(d.upper)}`}
                  </div>
                  <div data-section="chart-line-keltner-tooltip-atr">
                    atr: {d.atr === null ? 'n/a' : formatValue(d.atr)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-keltner-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {legendItems.map((item) => {
            const isHidden = hiddenSet.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-section="chart-line-keltner-legend-item"
                data-series-id={item.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  cursor: 'pointer',
                  opacity: isHidden ? 0.5 : 1,
                }}
              >
                <span
                  data-section="chart-line-keltner-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-keltner-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-keltner-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.bandPointCount} banded points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineKeltner.displayName = 'ChartLineKeltner';
