import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SUPERTREND_WIDTH = 560;
export const DEFAULT_CHART_LINE_SUPERTREND_HEIGHT = 320;
export const DEFAULT_CHART_LINE_SUPERTREND_PADDING = 40;
export const DEFAULT_CHART_LINE_SUPERTREND_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_SUPERTREND_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_SUPERTREND_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_PERIOD = 10;
export const DEFAULT_CHART_LINE_SUPERTREND_MULTIPLIER = 3;
export const DEFAULT_CHART_LINE_SUPERTREND_PRICE_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_SUPERTREND_UPTREND_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SUPERTREND_DOWNTREND_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SUPERTREND_FLIP_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_SUPERTREND_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_SUPERTREND_AXIS_COLOR = '#cbd5e1';

export type ChartLineSupertrendDirection = 'up' | 'down';

export interface ChartLineSupertrendPoint {
  x: number;
  value: number;
}

export interface ChartLineSupertrendCore {
  atr: (number | null)[];
  basicUpper: (number | null)[];
  basicLower: (number | null)[];
  finalUpper: (number | null)[];
  finalLower: (number | null)[];
  supertrend: (number | null)[];
  direction: (ChartLineSupertrendDirection | null)[];
  flip: boolean[];
}

export interface ChartLineSupertrendSample {
  index: number;
  x: number;
  value: number;
  atr: number | null;
  basicUpper: number | null;
  basicLower: number | null;
  finalUpper: number | null;
  finalLower: number | null;
  supertrend: number | null;
  direction: ChartLineSupertrendDirection | null;
  flip: boolean;
}

export interface ChartLineSupertrendRun {
  series: ChartLineSupertrendPoint[];
  period: number;
  multiplier: number;
  samples: ChartLineSupertrendSample[];
  supertrendFinal: number;
  directionFinal: ChartLineSupertrendDirection | null;
  flipCount: number;
  ok: boolean;
}

export interface ChartLineSupertrendPriceDot {
  index: number;
  x: number;
  value: number;
  atr: number | null;
  supertrend: number | null;
  direction: ChartLineSupertrendDirection | null;
  px: number;
  py: number;
}

export interface ChartLineSupertrendMarker {
  index: number;
  x: number;
  supertrend: number;
  direction: ChartLineSupertrendDirection;
  flip: boolean;
  px: number;
  py: number;
}

export interface ChartLineSupertrendSegment {
  direction: ChartLineSupertrendDirection;
  path: string;
  points: { index: number; x: number; supertrend: number; px: number; py: number }[];
}

export interface ChartLineSupertrendLayout {
  ok: boolean;
  width: number;
  height: number;
  panel: { x: number; y: number; width: number; height: number };
  xTicks: { value: number; px: number }[];
  yTicks: { value: number; py: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  pricePath: string;
  priceDots: ChartLineSupertrendPriceDot[];
  segments: ChartLineSupertrendSegment[];
  markers: ChartLineSupertrendMarker[];
  period: number;
  multiplier: number;
  supertrendFinal: number;
  directionFinal: ChartLineSupertrendDirection | null;
  flipCount: number;
  totalPoints: number;
  innerWidth: number;
  innerHeight: number;
}

export interface ComputeLineSupertrendLayoutOptions {
  data: readonly ChartLineSupertrendPoint[];
  period?: number;
  multiplier?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export interface ChartLineSupertrendProps {
  data: readonly ChartLineSupertrendPoint[];
  period?: number;
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
  uptrendColor?: string;
  downtrendColor?: string;
  flipColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showSupertrend?: boolean;
  showMarkers?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  onPointClick?: (payload: { point: ChartLineSupertrendPriceDot }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineSupertrendFinitePoints(
  points: readonly ChartLineSupertrendPoint[] | null | undefined,
): ChartLineSupertrendPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineSupertrendPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.value),
  );
}

/**
 * Coerce a period to a positive integer. A non-finite or sub-1
 * value falls back to `fallback`; a fractional value is floored.
 */
export function normalizeLineSupertrendPeriod(
  period: number,
  fallback: number,
): number {
  if (!isFiniteNumber(period)) return fallback;
  const p = Math.floor(period);
  return p < 1 ? fallback : p;
}

/**
 * Coerce an ATR multiplier to a positive number. A non-finite or
 * non-positive value falls back to `fallback`; fractional multipliers
 * (e.g. 2.5) are kept as-is.
 */
export function normalizeLineSupertrendMultiplier(
  multiplier: number,
  fallback: number,
): number {
  if (!isFiniteNumber(multiplier) || multiplier <= 0) return fallback;
  return multiplier;
}

/**
 * The per-period true range. For a single-value series the true
 * range is the absolute period-over-period change `|v[i] - v[i-1]|`.
 * Index 0 has no prior value and reads null.
 */
export function computeLineSupertrendTrueRanges(
  values: readonly number[] | null | undefined,
): (number | null)[] {
  if (!Array.isArray(values)) return [];
  const out: (number | null)[] = new Array(values.length).fill(null);
  for (let i = 1; i < values.length; i += 1) {
    out[i] = Math.abs(values[i]! - values[i - 1]!);
  }
  return out;
}

/**
 * Welles Wilder's Average True Range. The first ATR, at index
 * `period`, seeds with the simple mean of the first `period` true
 * ranges; later values use Wilder smoothing
 * `(prev * (period - 1) + tr) / period`. Indices before the window
 * fills read null.
 */
export function computeLineSupertrendATR(
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
    atr = (atr * (p - 1) + Math.abs(values[i]! - values[i - 1]!)) / p;
    out[i] = atr;
  }
  return out;
}

/**
 * The SuperTrend trailing-stop computation. From the ATR-scaled
 * basic bands `value +/- multiplier * ATR`, the final bands trail:
 * the upper band only ratchets down (and the lower band only
 * ratchets up) unless price breaks through. The SuperTrend line is
 * the final lower band in an uptrend (support below price) and the
 * final upper band in a downtrend (resistance above price); it flips
 * side whenever price crosses the active band.
 */
export function computeLineSupertrend(
  values: readonly number[] | null | undefined,
  period: number,
  multiplier: number,
): ChartLineSupertrendCore {
  if (!Array.isArray(values)) {
    return {
      atr: [],
      basicUpper: [],
      basicLower: [],
      finalUpper: [],
      finalLower: [],
      supertrend: [],
      direction: [],
      flip: [],
    };
  }
  const n = values.length;
  const p = period < 1 ? 1 : Math.floor(period);
  const m = isFiniteNumber(multiplier) && multiplier > 0 ? multiplier : 1;
  const atr = computeLineSupertrendATR(values, p);

  const basicUpper: (number | null)[] = new Array(n).fill(null);
  const basicLower: (number | null)[] = new Array(n).fill(null);
  const finalUpper: (number | null)[] = new Array(n).fill(null);
  const finalLower: (number | null)[] = new Array(n).fill(null);
  const supertrend: (number | null)[] = new Array(n).fill(null);
  const direction: (ChartLineSupertrendDirection | null)[] = new Array(n).fill(
    null,
  );
  const flip: boolean[] = new Array(n).fill(false);

  let firstIdx = -1;
  for (let i = 0; i < n; i += 1) {
    if (atr[i] === null) continue;
    const a = atr[i] as number;
    basicUpper[i] = values[i]! + m * a;
    basicLower[i] = values[i]! - m * a;

    if (firstIdx === -1) {
      firstIdx = i;
      finalUpper[i] = basicUpper[i];
      finalLower[i] = basicLower[i];
      const dir: ChartLineSupertrendDirection =
        i > 0 && values[i]! >= values[i - 1]! ? 'up' : 'down';
      direction[i] = dir;
      supertrend[i] = dir === 'up' ? finalLower[i] : finalUpper[i];
      continue;
    }

    const prevFinalUpper = finalUpper[i - 1] as number;
    const prevFinalLower = finalLower[i - 1] as number;
    finalUpper[i] =
      (basicUpper[i] as number) < prevFinalUpper ||
      values[i - 1]! > prevFinalUpper
        ? basicUpper[i]
        : prevFinalUpper;
    finalLower[i] =
      (basicLower[i] as number) > prevFinalLower ||
      values[i - 1]! < prevFinalLower
        ? basicLower[i]
        : prevFinalLower;

    const prevDir = direction[i - 1] as ChartLineSupertrendDirection;
    let dir: ChartLineSupertrendDirection;
    if (prevDir === 'down') {
      dir = values[i]! <= (finalUpper[i] as number) ? 'down' : 'up';
    } else {
      dir = values[i]! >= (finalLower[i] as number) ? 'up' : 'down';
    }
    direction[i] = dir;
    supertrend[i] = dir === 'up' ? finalLower[i] : finalUpper[i];
    flip[i] = dir !== prevDir;
  }

  return {
    atr,
    basicUpper,
    basicLower,
    finalUpper,
    finalLower,
    supertrend,
    direction,
    flip,
  };
}

export function runLineSupertrend(
  points: readonly ChartLineSupertrendPoint[] | null | undefined,
  options?: { period?: number; multiplier?: number },
): ChartLineSupertrendRun {
  const finite = getLineSupertrendFinitePoints(points);
  const series = [...finite].sort((a, b) => a.x - b.x);
  const period = normalizeLineSupertrendPeriod(
    options?.period ?? DEFAULT_CHART_LINE_SUPERTREND_PERIOD,
    DEFAULT_CHART_LINE_SUPERTREND_PERIOD,
  );
  const multiplier = normalizeLineSupertrendMultiplier(
    options?.multiplier ?? DEFAULT_CHART_LINE_SUPERTREND_MULTIPLIER,
    DEFAULT_CHART_LINE_SUPERTREND_MULTIPLIER,
  );
  const n = series.length;

  if (n < 2) {
    return {
      series,
      period,
      multiplier,
      samples: [],
      supertrendFinal: NaN,
      directionFinal: null,
      flipCount: 0,
      ok: false,
    };
  }

  const values = series.map((p) => p.value);
  const core = computeLineSupertrend(values, period, multiplier);
  const samples: ChartLineSupertrendSample[] = series.map((p, i) => ({
    index: i,
    x: p.x,
    value: p.value,
    atr: core.atr[i] ?? null,
    basicUpper: core.basicUpper[i] ?? null,
    basicLower: core.basicLower[i] ?? null,
    finalUpper: core.finalUpper[i] ?? null,
    finalLower: core.finalLower[i] ?? null,
    supertrend: core.supertrend[i] ?? null,
    direction: core.direction[i] ?? null,
    flip: core.flip[i] ?? false,
  }));

  let supertrendFinal = NaN;
  let directionFinal: ChartLineSupertrendDirection | null = null;
  for (let i = n - 1; i >= 0; i -= 1) {
    if (core.supertrend[i] !== null) {
      supertrendFinal = core.supertrend[i] as number;
      directionFinal = core.direction[i] ?? null;
      break;
    }
  }
  let flipCount = 0;
  for (const f of core.flip) {
    if (f) flipCount += 1;
  }

  return {
    series,
    period,
    multiplier,
    samples,
    supertrendFinal,
    directionFinal,
    flipCount,
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

export function computeLineSupertrendLayout(
  options: ComputeLineSupertrendLayoutOptions,
): ChartLineSupertrendLayout {
  const {
    data,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_SUPERTREND_TICK_COUNT,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const run = runLineSupertrend(data, {
    ...(isFiniteNumber(options.period) ? { period: options.period } : {}),
    ...(isFiniteNumber(options.multiplier)
      ? { multiplier: options.multiplier }
      : {}),
  });
  const empty: ChartLineSupertrendLayout = {
    ok: false,
    width,
    height,
    panel: { x: padding, y: padding, width: 0, height: 0 },
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    pricePath: '',
    priceDots: [],
    segments: [],
    markers: [],
    period: run.period,
    multiplier: run.multiplier,
    supertrendFinal: NaN,
    directionFinal: null,
    flipCount: 0,
    totalPoints: 0,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok) return empty;

  const panel = { x: padding, y: padding, width: innerWidth, height: innerHeight };

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.value < yLo) yLo = s.value;
    if (s.value > yHi) yHi = s.value;
    if (s.supertrend !== null) {
      if (s.supertrend < yLo) yLo = s.supertrend;
      if (s.supertrend > yHi) yHi = s.supertrend;
    }
  }
  if (xLo === xHi) {
    xLo -= 0.5;
    xHi += 0.5;
  }
  if (yLo === yHi) {
    yLo -= 0.5;
    yHi += 0.5;
  }

  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / (xHi - xLo)) * panel.width;
  const projectY = (v: number): number =>
    panel.y + panel.height - ((v - yLo) / (yHi - yLo)) * panel.height;

  const priceDots: ChartLineSupertrendPriceDot[] = run.samples.map((s) => ({
    index: s.index,
    x: s.x,
    value: s.value,
    atr: s.atr,
    supertrend: s.supertrend,
    direction: s.direction,
    px: projectX(s.x),
    py: projectY(s.value),
  }));

  const segments: ChartLineSupertrendSegment[] = [];
  const markers: ChartLineSupertrendMarker[] = [];
  let current: ChartLineSupertrendSegment | null = null;
  for (const s of run.samples) {
    if (s.supertrend === null || s.direction === null) {
      current = null;
      continue;
    }
    const px = projectX(s.x);
    const py = projectY(s.supertrend);
    if (!current || current.direction !== s.direction) {
      current = { direction: s.direction, path: '', points: [] };
      segments.push(current);
    }
    current.points.push({ index: s.index, x: s.x, supertrend: s.supertrend, px, py });
    markers.push({
      index: s.index,
      x: s.x,
      supertrend: s.supertrend,
      direction: s.direction,
      flip: s.flip,
      px,
      py,
    });
  }
  for (const seg of segments) {
    seg.path = buildPath(seg.points.map((pt) => ({ px: pt.px, py: pt.py })));
  }

  return {
    ok: true,
    width,
    height,
    panel,
    xTicks: computeTicks(xLo, xHi, tickCount).map((v) => ({
      value: v,
      px: projectX(v),
    })),
    yTicks: computeTicks(yLo, yHi, tickCount).map((v) => ({
      value: v,
      py: projectY(v),
    })),
    xMin: xLo,
    xMax: xHi,
    yMin: yLo,
    yMax: yHi,
    pricePath: buildPath(priceDots.map((d) => ({ px: d.px, py: d.py }))),
    priceDots,
    segments,
    markers,
    period: run.period,
    multiplier: run.multiplier,
    supertrendFinal: run.supertrendFinal,
    directionFinal: run.directionFinal,
    flipCount: run.flipCount,
    totalPoints: run.samples.length,
    innerWidth,
    innerHeight,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineSupertrendChart(
  data: readonly ChartLineSupertrendPoint[] | null | undefined,
  options?: { period?: number; multiplier?: number },
): string {
  const run = runLineSupertrend(data, options);
  if (!run.ok) return 'No data';
  const flips = `${run.flipCount} flip${run.flipCount === 1 ? '' : 's'}`;
  return `Line chart with a SuperTrend ATR trailing-stop band (period ${run.period}, multiplier ${defaultFormatValue(run.multiplier)}): the band flips between a support line below price in an uptrend and a resistance line above price in a downtrend. Final trend ${run.directionFinal ?? 'n/a'}, ${flips}, across ${run.samples.length} periods.`;
}

const SUPERTREND_SR_STYLE: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
};

export const ChartLineSupertrend = forwardRef<
  HTMLDivElement,
  ChartLineSupertrendProps
>(function ChartLineSupertrend(
  props: ChartLineSupertrendProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    period,
    multiplier,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_SUPERTREND_WIDTH,
    height = DEFAULT_CHART_LINE_SUPERTREND_HEIGHT,
    padding = DEFAULT_CHART_LINE_SUPERTREND_PADDING,
    tickCount = DEFAULT_CHART_LINE_SUPERTREND_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_SUPERTREND_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SUPERTREND_DOT_RADIUS,
    priceColor = DEFAULT_CHART_LINE_SUPERTREND_PRICE_COLOR,
    uptrendColor = DEFAULT_CHART_LINE_SUPERTREND_UPTREND_COLOR,
    downtrendColor = DEFAULT_CHART_LINE_SUPERTREND_DOWNTREND_COLOR,
    flipColor = DEFAULT_CHART_LINE_SUPERTREND_FLIP_COLOR,
    gridColor = DEFAULT_CHART_LINE_SUPERTREND_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_SUPERTREND_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showSupertrend = true,
    showMarkers = true,
    showTooltip = true,
    showConfigBadge = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a SuperTrend ATR trailing-stop band',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
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
      computeLineSupertrendLayout({
        data,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
      }),
    [data, width, height, padding, tickCount, period, multiplier],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineSupertrendChart(data, {
        ...(isFiniteNumber(period) ? { period } : {}),
        ...(isFiniteNumber(multiplier) ? { multiplier } : {}),
      }),
    [ariaDescription, data, period, multiplier],
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
        data-section="chart-line-supertrend"
        data-empty="true"
        data-period={layout.period}
        data-multiplier={layout.multiplier}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-supertrend-aria-desc"
          style={SUPERTREND_SR_STYLE}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const pn = layout.panel;
  const priceVisible = !hiddenSet.has('price');
  const upVisible = showSupertrend && !hiddenSet.has('uptrend');
  const downVisible = showSupertrend && !hiddenSet.has('downtrend');
  const directionVisible = (d: ChartLineSupertrendDirection): boolean =>
    d === 'up' ? upVisible : downVisible;
  const directionColor = (d: ChartLineSupertrendDirection): string =>
    d === 'up' ? uptrendColor : downtrendColor;

  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'price', label: 'Price', color: priceColor },
    { id: 'uptrend', label: 'Uptrend', color: uptrendColor },
    { id: 'downtrend', label: 'Downtrend', color: downtrendColor },
  ];

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-supertrend"
      data-empty="false"
      data-period={layout.period}
      data-multiplier={layout.multiplier}
      data-supertrend-final={layout.supertrendFinal}
      data-direction-final={layout.directionFinal ?? ''}
      data-flip-count={layout.flipCount}
      data-total-points={layout.totalPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-supertrend-aria-desc"
        style={SUPERTREND_SR_STYLE}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-supertrend-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-supertrend-badge"
            data-period={layout.period}
            data-multiplier={layout.multiplier}
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
            <span
              data-section="chart-line-supertrend-badge-icon"
              aria-hidden="true"
              style={{
                color:
                  layout.directionFinal === 'down'
                    ? downtrendColor
                    : uptrendColor,
              }}
            >
              ST
            </span>
            <span data-section="chart-line-supertrend-badge-period">
              p={layout.period}
            </span>
            <span data-section="chart-line-supertrend-badge-mult">
              m={formatValue(layout.multiplier)}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-supertrend-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-supertrend-grid"
              stroke={gridColor}
              strokeWidth={1}
            >
              {layout.yTicks.map((t, i) => (
                <line
                  key={`gy-${i}`}
                  data-section="chart-line-supertrend-grid-line"
                  x1={pn.x}
                  x2={pn.x + pn.width}
                  y1={t.py}
                  y2={t.py}
                />
              ))}
            </g>
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-supertrend-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-supertrend-axis"
                data-axis="x"
                x1={pn.x}
                y1={pn.y + pn.height}
                x2={pn.x + pn.width}
                y2={pn.y + pn.height}
              />
              <line
                data-section="chart-line-supertrend-axis"
                data-axis="y"
                x1={pn.x}
                y1={pn.y}
                x2={pn.x}
                y2={pn.y + pn.height}
              />
              {layout.yTicks.map((t, i) => (
                <g
                  key={`yt-${i}`}
                  data-section="chart-line-supertrend-tick"
                  data-axis="y"
                >
                  <line x1={pn.x - 4} x2={pn.x} y1={t.py} y2={t.py} />
                  <text
                    data-section="chart-line-supertrend-tick-label"
                    data-axis="y"
                    x={pn.x - 6}
                    y={t.py + 3}
                    textAnchor="end"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatValue(t.value)}
                  </text>
                </g>
              ))}
              {layout.xTicks.map((t, i) => (
                <g
                  key={`xt-${i}`}
                  data-section="chart-line-supertrend-tick"
                  data-axis="x"
                >
                  <line
                    x1={t.px}
                    x2={t.px}
                    y1={pn.y + pn.height}
                    y2={pn.y + pn.height + 4}
                  />
                  <text
                    data-section="chart-line-supertrend-tick-label"
                    data-axis="x"
                    x={t.px}
                    y={pn.y + pn.height + 14}
                    textAnchor="middle"
                    fontSize={10}
                    fill={axisColor}
                    stroke="none"
                  >
                    {formatX(t.value)}
                  </text>
                </g>
              ))}
            </g>
          ) : null}

          {priceVisible ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Price line"
              data-section="chart-line-supertrend-price-path"
              d={layout.pricePath}
              fill="none"
              stroke={priceColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {priceVisible && showDots ? (
            <g data-section="chart-line-supertrend-dots">
              {layout.priceDots.map((d) => {
                const isHover = hoverIndex === d.index;
                return (
                  <circle
                    key={`d-${d.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Period ${d.index + 1} at x ${formatX(d.x)}, value ${formatValue(d.value)}`}
                    data-section="chart-line-supertrend-dot"
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

          {showSupertrend ? (
            <g data-section="chart-line-supertrend-segments">
              {layout.segments.map((seg, i) =>
                directionVisible(seg.direction) && seg.path ? (
                  <path
                    key={`seg-${i}`}
                    data-section="chart-line-supertrend-segment"
                    data-direction={seg.direction}
                    d={seg.path}
                    fill="none"
                    stroke={directionColor(seg.direction)}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null,
              )}
            </g>
          ) : null}

          {showSupertrend && showMarkers ? (
            <g data-section="chart-line-supertrend-markers">
              {layout.markers.map((m) =>
                directionVisible(m.direction) ? (
                  <circle
                    key={`m-${m.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`SuperTrend at x ${formatX(m.x)}: ${formatValue(m.supertrend)} (${m.direction}${m.flip ? ', flip' : ''})`}
                    data-section="chart-line-supertrend-marker"
                    data-point-index={m.index}
                    data-supertrend={m.supertrend}
                    data-direction={m.direction}
                    data-flip={m.flip ? 'true' : 'false'}
                    cx={m.px}
                    cy={m.py}
                    r={
                      m.flip
                        ? dotRadius + 1.5
                        : hoverIndex === m.index
                          ? dotRadius + 1.5
                          : dotRadius
                    }
                    fill={m.flip ? flipColor : directionColor(m.direction)}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(m.index);
                      setTooltipPos({ px: m.px, py: m.py });
                    }}
                    onBlur={clearHover}
                    onClick={() => {
                      const d = layout.priceDots.find(
                        (x) => x.index === m.index,
                      );
                      if (d) onPointClick?.({ point: d });
                    }}
                  />
                ) : null,
              )}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const d = layout.priceDots.find((x) => x.index === hoverIndex);
              if (!d) return null;
              return (
                <div
                  data-section="chart-line-supertrend-tooltip"
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
                    minWidth: 150,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div data-section="chart-line-supertrend-tooltip-x">
                    x: {formatX(d.x)}
                  </div>
                  <div
                    data-section="chart-line-supertrend-tooltip-value"
                    style={{ fontWeight: 600 }}
                  >
                    value: {formatValue(d.value)}
                  </div>
                  <div data-section="chart-line-supertrend-tooltip-atr">
                    atr: {d.atr === null ? 'n/a' : formatValue(d.atr)}
                  </div>
                  <div data-section="chart-line-supertrend-tooltip-supertrend">
                    supertrend:{' '}
                    {d.supertrend === null
                      ? 'n/a'
                      : formatValue(d.supertrend)}
                  </div>
                  <div data-section="chart-line-supertrend-tooltip-direction">
                    direction: {d.direction ?? 'n/a'}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-supertrend-legend"
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
                data-section="chart-line-supertrend-legend-item"
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
                  data-section="chart-line-supertrend-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-supertrend-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-supertrend-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            trend {layout.directionFinal ?? 'n/a'}, {layout.flipCount} flip
            {layout.flipCount === 1 ? '' : 's'}
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineSupertrend.displayName = 'ChartLineSupertrend';
