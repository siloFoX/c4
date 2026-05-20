import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_WINSORIZED_WIDTH = 560;
export const DEFAULT_CHART_LINE_WINSORIZED_HEIGHT = 320;
export const DEFAULT_CHART_LINE_WINSORIZED_PADDING = 40;
export const DEFAULT_CHART_LINE_WINSORIZED_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_WINSORIZED_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_WINSORIZED_MARKER_SIZE = 5;
export const DEFAULT_CHART_LINE_WINSORIZED_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_WINSORIZED_RAW_OPACITY = 0.45;
export const DEFAULT_CHART_LINE_WINSORIZED_LOWER_QUANTILE = 0.05;
export const DEFAULT_CHART_LINE_WINSORIZED_UPPER_QUANTILE = 0.95;
export const DEFAULT_CHART_LINE_WINSORIZED_PALETTE = [
  '#2563eb',
  '#dc2626',
  '#16a34a',
  '#f59e0b',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];
export const DEFAULT_CHART_LINE_WINSORIZED_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_WINSORIZED_WINSORIZED_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_WINSORIZED_BOUND_COLOR = '#9333ea';
export const DEFAULT_CHART_LINE_WINSORIZED_CLAMP_COLOR = '#f59e0b';
export const DEFAULT_CHART_LINE_WINSORIZED_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_WINSORIZED_AXIS_COLOR = '#cbd5e1';

export interface ChartLineWinsorizedPoint {
  x: number;
  y: number;
}

export interface ChartLineWinsorizedSample {
  index: number;
  x: number;
  y: number;
  winsorized: number;
  clamped: boolean;
  clampedLow: boolean;
  clampedHigh: boolean;
  delta: number;
}

export interface ChartLineWinsorizedLayoutSample
  extends ChartLineWinsorizedSample {
  px: number;
  rawPy: number;
  winsorizedPy: number;
}

export interface ChartLineWinsorizedRun {
  samples: ChartLineWinsorizedSample[];
  lowerBound: number;
  upperBound: number;
  lowerQuantile: number;
  upperQuantile: number;
  clampedCount: number;
  clampedLowCount: number;
  clampedHighCount: number;
  totalSamples: number;
  ok: boolean;
}

export interface ChartLineWinsorizedLayout {
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
  samples: ChartLineWinsorizedLayoutSample[];
  rawPath: string;
  winsorizedPath: string;
  lowerBound: number;
  upperBound: number;
  lowerBoundPy: number;
  upperBoundPy: number;
  lowerQuantile: number;
  upperQuantile: number;
  clampedCount: number;
  clampedLowCount: number;
  clampedHighCount: number;
  totalSamples: number;
}

export interface ComputeLineWinsorizedLayoutOptions {
  data: readonly ChartLineWinsorizedPoint[];
  lowerQuantile?: number;
  upperQuantile?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineWinsorizedProps {
  data: readonly ChartLineWinsorizedPoint[];
  lowerQuantile?: number;
  upperQuantile?: number;
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  markerSize?: number;
  dotRadius?: number;
  rawOpacity?: number;
  rawColor?: string;
  winsorizedColor?: string;
  boundColor?: string;
  clampColor?: string;
  gridColor?: string;
  axisColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showConfigBadge?: boolean;
  showBounds?: boolean;
  showBoundBand?: boolean;
  showClampedMarkers?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    sample: ChartLineWinsorizedLayoutSample;
  }) => void;
  onSeriesToggle?: (payload: { seriesId: string; hidden: boolean }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function getLineWinsorizedDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_WINSORIZED_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineWinsorizedFinitePoints(
  points: readonly ChartLineWinsorizedPoint[] | null | undefined,
): ChartLineWinsorizedPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineWinsorizedPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Linear-interpolation quantile (the numpy `linear` / R type-7
 * convention). For a quantile `q` in [0, 1] the position is
 * `h = (n - 1) * q`; the result interpolates between the two
 * surrounding order statistics. Non-finite values are dropped
 * before sorting; an empty input yields NaN; `q` is clamped to
 * [0, 1] and a non-finite `q` falls back to 0.
 */
export function computeLineWinsorizedQuantile(
  values: readonly number[] | null | undefined,
  q: number,
): number {
  if (!Array.isArray(values)) return NaN;
  const finite = values.filter(isFiniteNumber);
  if (finite.length === 0) return NaN;
  const sorted = [...finite].sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const qq = isFiniteNumber(q) ? clamp01(q) : 0;
  const h = (sorted.length - 1) * qq;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const frac = h - lo;
  return sorted[lo]! + frac * (sorted[hi]! - sorted[lo]!);
}

/**
 * Winsorize a series: clamp every value that sits outside the
 * `[lowerQuantile, upperQuantile]` quantile band against the
 * matching bound. Unlike trimming (which discards outliers),
 * winsorizing REPLACES them with the boundary value, so the
 * sample count is preserved. The bounds are computed once over
 * the whole series -- this is a GLOBAL percentile clamp, not a
 * rolling-window filter.
 *
 * The quantile arguments are clamped to [0, 1]; if the lower
 * quantile exceeds the upper, the pair is swapped so the band is
 * always well ordered.
 */
export function runLineWinsorized(
  points: readonly ChartLineWinsorizedPoint[] | null | undefined,
  lowerQuantile: number = DEFAULT_CHART_LINE_WINSORIZED_LOWER_QUANTILE,
  upperQuantile: number = DEFAULT_CHART_LINE_WINSORIZED_UPPER_QUANTILE,
): ChartLineWinsorizedRun {
  const finite = getLineWinsorizedFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);

  let lq = isFiniteNumber(lowerQuantile)
    ? clamp01(lowerQuantile)
    : DEFAULT_CHART_LINE_WINSORIZED_LOWER_QUANTILE;
  let uq = isFiniteNumber(upperQuantile)
    ? clamp01(upperQuantile)
    : DEFAULT_CHART_LINE_WINSORIZED_UPPER_QUANTILE;
  if (lq > uq) {
    const swap = lq;
    lq = uq;
    uq = swap;
  }

  if (sorted.length === 0) {
    return {
      samples: [],
      lowerBound: NaN,
      upperBound: NaN,
      lowerQuantile: lq,
      upperQuantile: uq,
      clampedCount: 0,
      clampedLowCount: 0,
      clampedHighCount: 0,
      totalSamples: 0,
      ok: false,
    };
  }

  const yValues = sorted.map((p) => p.y);
  let lowerBound = computeLineWinsorizedQuantile(yValues, lq);
  let upperBound = computeLineWinsorizedQuantile(yValues, uq);
  if (
    isFiniteNumber(lowerBound) &&
    isFiniteNumber(upperBound) &&
    lowerBound > upperBound
  ) {
    const swap = lowerBound;
    lowerBound = upperBound;
    upperBound = swap;
  }

  let clampedLowCount = 0;
  let clampedHighCount = 0;
  const samples: ChartLineWinsorizedSample[] = sorted.map((p, i) => {
    let winsorized = p.y;
    let clampedLow = false;
    let clampedHigh = false;
    if (isFiniteNumber(lowerBound) && p.y < lowerBound) {
      winsorized = lowerBound;
      clampedLow = true;
    } else if (isFiniteNumber(upperBound) && p.y > upperBound) {
      winsorized = upperBound;
      clampedHigh = true;
    }
    if (clampedLow) clampedLowCount += 1;
    if (clampedHigh) clampedHighCount += 1;
    return {
      index: i,
      x: p.x,
      y: p.y,
      winsorized,
      clamped: clampedLow || clampedHigh,
      clampedLow,
      clampedHigh,
      delta: winsorized - p.y,
    };
  });

  return {
    samples,
    lowerBound,
    upperBound,
    lowerQuantile: lq,
    upperQuantile: uq,
    clampedCount: clampedLowCount + clampedHighCount,
    clampedLowCount,
    clampedHighCount,
    totalSamples: samples.length,
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
    const cmd = i === 0 ? 'M' : 'L';
    parts.push(`${cmd} ${p.px.toFixed(3)} ${p.py.toFixed(3)}`);
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

export function computeLineWinsorizedLayout(
  options: ComputeLineWinsorizedLayoutOptions,
): ChartLineWinsorizedLayout {
  const {
    data,
    lowerQuantile,
    upperQuantile,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_WINSORIZED_TICK_COUNT,
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
  const run = runLineWinsorized(data, lowerQuantile, upperQuantile);
  const empty: ChartLineWinsorizedLayout = {
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
    samples: [],
    rawPath: '',
    winsorizedPath: '',
    lowerBound: NaN,
    upperBound: NaN,
    lowerBoundPy: 0,
    upperBoundPy: 0,
    lowerQuantile: run.lowerQuantile,
    upperQuantile: run.upperQuantile,
    clampedCount: 0,
    clampedLowCount: 0,
    clampedHighCount: 0,
    totalSamples: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!run.ok || run.samples.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of run.samples) {
    if (s.x < xLo) xLo = s.x;
    if (s.x > xHi) xHi = s.x;
    if (s.y < yLo) yLo = s.y;
    if (s.y > yHi) yHi = s.y;
  }

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
  const projectY = (y: number): number =>
    panel.y + panel.height - ((y - yLo) / yRange) * panel.height;

  const samples: ChartLineWinsorizedLayoutSample[] = run.samples.map(
    (s) => ({
      ...s,
      px: projectX(s.x),
      rawPy: projectY(s.y),
      winsorizedPy: projectY(s.winsorized),
    }),
  );

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
    samples,
    rawPath: buildPath(samples.map((s) => ({ px: s.px, py: s.rawPy }))),
    winsorizedPath: buildPath(
      samples.map((s) => ({ px: s.px, py: s.winsorizedPy })),
    ),
    lowerBound: run.lowerBound,
    upperBound: run.upperBound,
    lowerBoundPy: projectY(run.lowerBound),
    upperBoundPy: projectY(run.upperBound),
    lowerQuantile: run.lowerQuantile,
    upperQuantile: run.upperQuantile,
    clampedCount: run.clampedCount,
    clampedLowCount: run.clampedLowCount,
    clampedHighCount: run.clampedHighCount,
    totalSamples: run.totalSamples,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineWinsorizedChart(
  data: readonly ChartLineWinsorizedPoint[] | null | undefined,
  options?: {
    lowerQuantile?: number;
    upperQuantile?: number;
    formatValue?: (n: number) => string;
  },
): string {
  const run = runLineWinsorized(
    data,
    options?.lowerQuantile,
    options?.upperQuantile,
  );
  if (!run.ok || run.totalSamples === 0) return 'No data';
  const fmt = options?.formatValue ?? defaultFormatValue;
  return `Line chart with a winsorized overlay clamping the ${fmt(run.lowerQuantile)}/${fmt(run.upperQuantile)} quantile tails: bounds [${fmt(run.lowerBound)}, ${fmt(run.upperBound)}], ${run.clampedCount} of ${run.totalSamples} points clamped (${run.clampedLowCount} low, ${run.clampedHighCount} high).`;
}

export const ChartLineWinsorized = forwardRef<
  HTMLDivElement,
  ChartLineWinsorizedProps
>(function ChartLineWinsorized(
  props: ChartLineWinsorizedProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    data,
    lowerQuantile = DEFAULT_CHART_LINE_WINSORIZED_LOWER_QUANTILE,
    upperQuantile = DEFAULT_CHART_LINE_WINSORIZED_UPPER_QUANTILE,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_WINSORIZED_WIDTH,
    height = DEFAULT_CHART_LINE_WINSORIZED_HEIGHT,
    padding = DEFAULT_CHART_LINE_WINSORIZED_PADDING,
    tickCount = DEFAULT_CHART_LINE_WINSORIZED_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_WINSORIZED_STROKE_WIDTH,
    markerSize = DEFAULT_CHART_LINE_WINSORIZED_MARKER_SIZE,
    dotRadius = DEFAULT_CHART_LINE_WINSORIZED_DOT_RADIUS,
    rawOpacity = DEFAULT_CHART_LINE_WINSORIZED_RAW_OPACITY,
    rawColor = DEFAULT_CHART_LINE_WINSORIZED_RAW_COLOR,
    winsorizedColor = DEFAULT_CHART_LINE_WINSORIZED_WINSORIZED_COLOR,
    boundColor = DEFAULT_CHART_LINE_WINSORIZED_BOUND_COLOR,
    clampColor = DEFAULT_CHART_LINE_WINSORIZED_CLAMP_COLOR,
    gridColor = DEFAULT_CHART_LINE_WINSORIZED_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_WINSORIZED_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = false,
    showLegend = true,
    showTooltip = true,
    showConfigBadge = true,
    showBounds = true,
    showBoundBand = true,
    showClampedMarkers = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with a winsorized percentile-clamped overlay',
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
  const rawHidden = hiddenSet.has('raw');
  const winsorizedHidden = hiddenSet.has('winsorized');

  const markerHalf =
    isFiniteNumber(markerSize) && markerSize > 0 ? markerSize : 0;

  const layout = useMemo(
    () =>
      computeLineWinsorizedLayout({
        data,
        lowerQuantile,
        upperQuantile,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      data,
      lowerQuantile,
      upperQuantile,
      width,
      height,
      padding,
      tickCount,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineWinsorizedChart(data, {
        lowerQuantile,
        upperQuantile,
        formatValue,
      }),
    [ariaDescription, data, lowerQuantile, upperQuantile, formatValue],
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

  const allTotalPoints = useMemo(
    () => getLineWinsorizedFinitePoints(data).length,
    [data],
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
        data-section="chart-line-winsorized"
        data-empty="true"
        data-total-samples={0}
        data-clamped-count={0}
        data-clamped-low-count={0}
        data-clamped-high-count={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-winsorized-aria-desc"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
            clipPath: 'inset(50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {summary}
        </span>
      </div>
    );
  }

  const animateClass = animate ? 'motion-safe:animate-fade-in' : '';
  const legendItems: { id: string; label: string; color: string }[] = [
    { id: 'raw', label: 'Raw', color: rawColor },
    { id: 'winsorized', label: 'Winsorized', color: winsorizedColor },
  ];
  const bandTop = Math.min(layout.lowerBoundPy, layout.upperBoundPy);
  const bandHeight = Math.abs(layout.lowerBoundPy - layout.upperBoundPy);
  const clampedSamples = layout.samples.filter((s) => s.clamped);

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-winsorized"
      data-empty="false"
      data-total-samples={layout.totalSamples}
      data-clamped-count={layout.clampedCount}
      data-clamped-low-count={layout.clampedLowCount}
      data-clamped-high-count={layout.clampedHighCount}
      data-lower-bound={layout.lowerBound}
      data-upper-bound={layout.upperBound}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-winsorized-aria-desc"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
          clipPath: 'inset(50%)',
          whiteSpace: 'nowrap',
        }}
      >
        {summary}
      </span>

      <div
        data-section="chart-line-winsorized-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-winsorized-badge"
            data-lower-bound={layout.lowerBound}
            data-upper-bound={layout.upperBound}
            data-clamped-count={layout.clampedCount}
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
              data-section="chart-line-winsorized-badge-icon"
              aria-hidden="true"
              style={{ color: boundColor }}
            >
              WIN
            </span>
            <span data-section="chart-line-winsorized-badge-lower">
              lo={formatValue(layout.lowerBound)}
            </span>
            <span data-section="chart-line-winsorized-badge-upper">
              hi={formatValue(layout.upperBound)}
            </span>
            <span
              data-section="chart-line-winsorized-badge-clamp"
              style={{ color: clampColor }}
            >
              clamp={layout.clampedCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-winsorized-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-winsorized-grid"
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
                    data-section="chart-line-winsorized-grid-line"
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
                    data-section="chart-line-winsorized-grid-line"
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

          {showBoundBand && bandHeight > 0 ? (
            <rect
              data-section="chart-line-winsorized-bound-band"
              x={layout.panel.x}
              y={bandTop}
              width={layout.panel.width}
              height={bandHeight}
              fill={boundColor}
              fillOpacity={0.08}
            />
          ) : null}

          {showAxis ? (
            <g
              data-section="chart-line-winsorized-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-winsorized-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-winsorized-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-winsorized-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-winsorized-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-winsorized-tick-label"
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
              <g data-section="chart-line-winsorized-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-winsorized-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-winsorized-tick-label"
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
                  data-section="chart-line-winsorized-x-label"
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
                  data-section="chart-line-winsorized-y-label"
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

          {showBounds ? (
            <g data-section="chart-line-winsorized-bounds">
              <line
                data-section="chart-line-winsorized-bound-line"
                data-edge="upper"
                x1={layout.panel.x}
                x2={layout.panel.x + layout.panel.width}
                y1={layout.upperBoundPy}
                y2={layout.upperBoundPy}
                stroke={boundColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <line
                data-section="chart-line-winsorized-bound-line"
                data-edge="lower"
                x1={layout.panel.x}
                x2={layout.panel.x + layout.panel.width}
                y1={layout.lowerBoundPy}
                y2={layout.lowerBoundPy}
                stroke={boundColor}
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            </g>
          ) : null}

          {!rawHidden && layout.rawPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Raw series"
              data-section="chart-line-winsorized-raw-path"
              data-kind="raw"
              d={layout.rawPath}
              fill="none"
              stroke={rawColor}
              strokeWidth={strokeWidth}
              strokeOpacity={rawOpacity}
              strokeDasharray="5 4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {!winsorizedHidden && layout.winsorizedPath ? (
            <path
              role="graphics-symbol"
              tabIndex={0}
              aria-label="Winsorized series"
              data-section="chart-line-winsorized-winsorized-path"
              data-kind="winsorized"
              d={layout.winsorizedPath}
              fill="none"
              stroke={winsorizedColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {!winsorizedHidden && showDots ? (
            <g data-section="chart-line-winsorized-dots">
              {layout.samples.map((s) => {
                const isHover = hoverIndex === s.index;
                return (
                  <circle
                    key={`d-${s.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Sample ${s.index + 1} at x ${formatX(s.x)}, winsorized ${formatValue(s.winsorized)}`}
                    data-section="chart-line-winsorized-dot"
                    data-point-index={s.index}
                    data-x={s.x}
                    data-y={s.y}
                    data-winsorized={s.winsorized}
                    data-clamped={s.clamped ? 'true' : 'false'}
                    cx={s.px}
                    cy={s.winsorizedPy}
                    r={isHover ? dotRadius + 1 : dotRadius}
                    fill={winsorizedColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(s.index);
                      setTooltipPos({ px: s.px, py: s.winsorizedPy });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(s.index);
                      setTooltipPos({ px: s.px, py: s.winsorizedPy });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ sample: s })}
                  />
                );
              })}
            </g>
          ) : null}

          {!winsorizedHidden && showClampedMarkers ? (
            <g data-section="chart-line-winsorized-clamped-markers">
              {clampedSamples.map((s) => {
                const isHover = hoverIndex === s.index;
                const r = isHover ? markerHalf + 1 : markerHalf;
                const shape = `M ${s.px} ${s.winsorizedPy - r} L ${s.px + r} ${s.winsorizedPy} L ${s.px} ${s.winsorizedPy + r} L ${s.px - r} ${s.winsorizedPy} Z`;
                return (
                  <path
                    key={`c-${s.index}`}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`Clamped ${s.clampedLow ? 'low' : 'high'} at x ${formatX(s.x)}: raw ${formatValue(s.y)} clamped to ${formatValue(s.winsorized)}`}
                    data-section="chart-line-winsorized-clamped-marker"
                    data-direction={s.clampedLow ? 'low' : 'high'}
                    data-point-index={s.index}
                    data-x={s.x}
                    d={shape}
                    fill={clampColor}
                    stroke="#ffffff"
                    strokeWidth={1}
                    onMouseEnter={() => {
                      setHoverIndex(s.index);
                      setTooltipPos({ px: s.px, py: s.winsorizedPy });
                    }}
                    onMouseLeave={clearHover}
                    onFocus={() => {
                      setHoverIndex(s.index);
                      setTooltipPos({ px: s.px, py: s.winsorizedPy });
                    }}
                    onBlur={clearHover}
                    onClick={() => onPointClick?.({ sample: s })}
                  />
                );
              })}
            </g>
          ) : null}
        </svg>

        {showTooltip && hoverIndex !== null && tooltipPos
          ? (() => {
              const s = layout.samples.find((x) => x.index === hoverIndex);
              if (!s) return null;
              return (
                <div
                  data-section="chart-line-winsorized-tooltip"
                  data-point-index={s.index}
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
                  <div
                    data-section="chart-line-winsorized-tooltip-label"
                    style={{ fontWeight: 600 }}
                  >
                    Sample {s.index + 1}
                  </div>
                  <div data-section="chart-line-winsorized-tooltip-x">
                    x: {formatX(s.x)}
                  </div>
                  <div data-section="chart-line-winsorized-tooltip-raw">
                    raw: {formatValue(s.y)}
                  </div>
                  <div
                    data-section="chart-line-winsorized-tooltip-winsorized"
                    style={{ fontWeight: 600 }}
                  >
                    winsorized: {formatValue(s.winsorized)}
                  </div>
                  {s.clamped ? (
                    <div
                      data-section="chart-line-winsorized-tooltip-clamp"
                      style={{ color: clampColor, fontWeight: 600 }}
                    >
                      clamped {s.clampedLow ? 'low' : 'high'} (delta{' '}
                      {s.delta >= 0 ? '+' : ''}
                      {formatValue(s.delta)})
                    </div>
                  ) : (
                    <div data-section="chart-line-winsorized-tooltip-clamp">
                      not clamped
                    </div>
                  )}
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-winsorized-legend"
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
                data-section="chart-line-winsorized-legend-item"
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
                  data-section="chart-line-winsorized-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: item.color,
                  }}
                />
                <span data-section="chart-line-winsorized-legend-label">
                  {item.label}
                </span>
              </button>
            );
          })}
          <span
            data-section="chart-line-winsorized-legend-stats"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {layout.clampedCount} clamped ({layout.clampedLowCount} low /{' '}
            {layout.clampedHighCount} high)
          </span>
          <span
            data-section="chart-line-winsorized-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineWinsorized.displayName = 'ChartLineWinsorized';
