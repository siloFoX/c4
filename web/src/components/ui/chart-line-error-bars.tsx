import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ERROR_BARS_WIDTH = 560;
export const DEFAULT_CHART_LINE_ERROR_BARS_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ERROR_BARS_PADDING = 40;
export const DEFAULT_CHART_LINE_ERROR_BARS_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ERROR_BARS_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_ERROR_BARS_ERROR_STROKE_WIDTH = 1.25;
export const DEFAULT_CHART_LINE_ERROR_BARS_CAP_WIDTH = 8;
export const DEFAULT_CHART_LINE_ERROR_BARS_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ERROR_BARS_ERROR_OPACITY = 0.85;
export const DEFAULT_CHART_LINE_ERROR_BARS_PALETTE = [
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
export const DEFAULT_CHART_LINE_ERROR_BARS_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ERROR_BARS_AXIS_COLOR = '#cbd5e1';

export interface ChartLineErrorBarsPoint {
  x: number;
  y: number;
  error?: number;
  errorLow?: number;
  errorHigh?: number;
}

export interface ChartLineErrorBarsSeries {
  id: string;
  label: string;
  data: readonly ChartLineErrorBarsPoint[];
  color?: string;
}

export interface ChartLineErrorBarsBounds {
  errorLow: number;
  errorHigh: number;
}

export interface ChartLineErrorBarsSample {
  index: number;
  x: number;
  y: number;
  errorLow: number;
  errorHigh: number;
  upper: number;
  lower: number;
  hasError: boolean;
  symmetric: boolean;
}

export interface ChartLineErrorBarsLayoutPoint
  extends ChartLineErrorBarsSample {
  px: number;
  py: number;
  upperPy: number;
  lowerPy: number;
}

export interface ChartLineErrorBarsLayoutSeries {
  id: string;
  label: string;
  color: string;
  points: ChartLineErrorBarsLayoutPoint[];
  linePath: string;
  finiteCount: number;
  totalCount: number;
  errorPointCount: number;
  meanError: number;
  maxError: number;
}

export interface ChartLineErrorBarsLayout {
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
  series: ChartLineErrorBarsLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineErrorBarsLayoutOptions {
  series: readonly ChartLineErrorBarsSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineErrorBarsProps {
  series: readonly ChartLineErrorBarsSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  errorStrokeWidth?: number;
  capWidth?: number;
  dotRadius?: number;
  errorOpacity?: number;
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
  showLine?: boolean;
  showErrorBars?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatError?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineErrorBarsLayoutSeries;
    point: ChartLineErrorBarsLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineErrorBarsSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineErrorBarsDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_ERROR_BARS_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineErrorBarsFinitePoints(
  points: readonly ChartLineErrorBarsPoint[] | null | undefined,
): ChartLineErrorBarsPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineErrorBarsPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Resolve the low/high error magnitudes for a point.
 *
 * - An explicit `errorLow` / `errorHigh` always wins for its side.
 * - A side without an explicit value falls back to the symmetric
 *   `error` field, then to 0.
 * - Negative magnitudes are clamped to 0 -- an error bar cannot have a
 *   negative extent.
 *
 * So `{error: 2}` -> low 2 / high 2; `{errorLow: 1, errorHigh: 3}` ->
 * low 1 / high 3; `{error: 2, errorHigh: 5}` -> low 2 / high 5.
 */
export function resolveLineErrorBarsBounds(
  point: ChartLineErrorBarsPoint | null | undefined,
): ChartLineErrorBarsBounds {
  if (!point) return { errorLow: 0, errorHigh: 0 };
  const symmetric = isFiniteNumber(point.error)
    ? Math.max(0, point.error)
    : null;
  const lowExplicit = isFiniteNumber(point.errorLow)
    ? Math.max(0, point.errorLow)
    : null;
  const highExplicit = isFiniteNumber(point.errorHigh)
    ? Math.max(0, point.errorHigh)
    : null;
  return {
    errorLow: lowExplicit !== null ? lowExplicit : (symmetric ?? 0),
    errorHigh: highExplicit !== null ? highExplicit : (symmetric ?? 0),
  };
}

export function runLineErrorBars(
  points: readonly ChartLineErrorBarsPoint[] | null | undefined,
): {
  samples: ChartLineErrorBarsSample[];
  errorPointCount: number;
  meanError: number;
  maxError: number;
  totalSamples: number;
} {
  const finite = getLineErrorBarsFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);

  let errorPointCount = 0;
  let sumHalfExtent = 0;
  let maxError = 0;

  const samples: ChartLineErrorBarsSample[] = sorted.map((p, i) => {
    const { errorLow, errorHigh } = resolveLineErrorBarsBounds(p);
    const hasError = errorLow > 0 || errorHigh > 0;
    if (hasError) errorPointCount += 1;
    sumHalfExtent += (errorLow + errorHigh) / 2;
    const sideMax = Math.max(errorLow, errorHigh);
    if (sideMax > maxError) maxError = sideMax;
    return {
      index: i,
      x: p.x,
      y: p.y,
      errorLow,
      errorHigh,
      upper: p.y + errorHigh,
      lower: p.y - errorLow,
      hasError,
      symmetric: errorLow === errorHigh,
    };
  });

  const meanError =
    samples.length > 0 ? sumHalfExtent / samples.length : 0;

  return {
    samples,
    errorPointCount,
    meanError,
    maxError,
    totalSamples: samples.length,
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

export function computeLineErrorBarsLayout(
  options: ComputeLineErrorBarsLayoutOptions,
): ChartLineErrorBarsLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_ERROR_BARS_TICK_COUNT,
    defaultColors = DEFAULT_CHART_LINE_ERROR_BARS_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineErrorBarsLayout = {
    ok: false,
    width,
    height,
    panel: { x: padding, y: padding, width: innerWidth, height: innerHeight },
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 0,
    yMin: 0,
    yMax: 0,
    innerWidth,
    innerHeight,
    series: [],
    totalPoints: 0,
    visibleSeriesCount: 0,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!Array.isArray(series) || series.length === 0) return empty;

  const hidden = normaliseHidden(hiddenSeries);
  const visible = series.filter((s) => !hidden.has(s.id));
  if (visible.length === 0) return empty;

  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  let yLo = Number.POSITIVE_INFINITY;
  let yHi = Number.NEGATIVE_INFINITY;
  let totalPoints = 0;

  const runBySeries = new Map<string, ReturnType<typeof runLineErrorBars>>();

  for (const s of visible) {
    const run = runLineErrorBars(s.data);
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    for (const sample of run.samples) {
      if (sample.x < xLo) xLo = sample.x;
      if (sample.x > xHi) xHi = sample.x;
      // The error bar extents define the y range, not just y.
      if (sample.lower < yLo) yLo = sample.lower;
      if (sample.upper > yHi) yHi = sample.upper;
      if (sample.y < yLo) yLo = sample.y;
      if (sample.y > yHi) yHi = sample.y;
    }
  }

  if (totalPoints === 0) return empty;

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
  const panel = {
    x: padding,
    y: padding,
    width: innerWidth,
    height: innerHeight,
  };
  const projectX = (x: number): number =>
    panel.x + ((x - xLo) / xRange) * panel.width;
  const projectY = (y: number): number =>
    panel.y + panel.height - ((y - yLo) / yRange) * panel.height;

  const layoutSeries: ChartLineErrorBarsLayoutSeries[] = visible.map(
    (s, idx) => {
      const run = runBySeries.get(s.id)!;
      const color =
        s.color ??
        defaultColors[idx % defaultColors.length] ??
        DEFAULT_CHART_LINE_ERROR_BARS_PALETTE[0]!;

      const points: ChartLineErrorBarsLayoutPoint[] = run.samples.map(
        (sample) => ({
          ...sample,
          px: projectX(sample.x),
          py: projectY(sample.y),
          upperPy: projectY(sample.upper),
          lowerPy: projectY(sample.lower),
        }),
      );

      return {
        id: s.id,
        label: s.label,
        color,
        points,
        linePath: buildPath(points.map((p) => ({ px: p.px, py: p.py }))),
        finiteCount: run.samples.length,
        totalCount: s.data?.length ?? 0,
        errorPointCount: run.errorPointCount,
        meanError: run.meanError,
        maxError: run.maxError,
      };
    },
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
    series: layoutSeries,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

function defaultFormatValue(n: number): string {
  if (!isFiniteNumber(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2);
}

export function describeLineErrorBarsChart(
  series: readonly ChartLineErrorBarsSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    formatError?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmt = options?.formatError ?? defaultFormatValue;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const run = runLineErrorBars(s.data);
    totalPoints += run.samples.length;
    summaries.push(
      `${s.label}: ${run.errorPointCount} of ${run.samples.length} points carry error bars, mean error ${fmt(run.meanError)}`,
    );
  }
  return `Line chart with discrete per-point error bars across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineErrorBars = forwardRef<
  HTMLDivElement,
  ChartLineErrorBarsProps
>(function ChartLineErrorBars(
  props: ChartLineErrorBarsProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_ERROR_BARS_WIDTH,
    height = DEFAULT_CHART_LINE_ERROR_BARS_HEIGHT,
    padding = DEFAULT_CHART_LINE_ERROR_BARS_PADDING,
    tickCount = DEFAULT_CHART_LINE_ERROR_BARS_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ERROR_BARS_STROKE_WIDTH,
    errorStrokeWidth = DEFAULT_CHART_LINE_ERROR_BARS_ERROR_STROKE_WIDTH,
    capWidth = DEFAULT_CHART_LINE_ERROR_BARS_CAP_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ERROR_BARS_DOT_RADIUS,
    errorOpacity = DEFAULT_CHART_LINE_ERROR_BARS_ERROR_OPACITY,
    gridColor = DEFAULT_CHART_LINE_ERROR_BARS_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ERROR_BARS_AXIS_COLOR,
    xMin,
    xMax,
    yMin,
    yMax,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showConfigBadge = true,
    showLine = true,
    showErrorBars = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with discrete per-point error bars',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatError = defaultFormatValue,
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

  const cap = isFiniteNumber(capWidth) && capWidth >= 0 ? capWidth : 0;

  const layout = useMemo(
    () =>
      computeLineErrorBarsLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [series, hiddenSet, width, height, padding, tickCount, xMin, xMax, yMin, yMax],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineErrorBarsChart(series, {
        hidden: hiddenSet,
        formatError,
      }),
    [ariaDescription, series, hiddenSet, formatError],
  );

  const [hoverPayload, setHoverPayload] = useState<{
    seriesId: string;
    pointIndex: number;
  } | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    px: number;
    py: number;
  } | null>(null);

  const clearHover = useCallback(() => {
    setHoverPayload(null);
    setTooltipPos(null);
  }, []);

  const handleToggle = useCallback(
    (s: ChartLineErrorBarsSeries) => {
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlled) setUncontrolled(next);
      onHiddenSeriesChange?.(next);
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [hiddenSet, isControlled, onHiddenSeriesChange, onSeriesToggle],
  );

  const allTotalPoints = useMemo(
    () =>
      series.reduce(
        (acc, s) => acc + getLineErrorBarsFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const totalErrorPoints = useMemo(
    () => layout.series.reduce((acc, s) => acc + s.errorPointCount, 0),
    [layout.series],
  );

  const dominantConfig = useMemo<{
    meanError: number;
    maxError: number;
    errorPointCount: number;
    seriesId: string;
  }>(() => {
    if (layout.series.length === 0) {
      return {
        meanError: 0,
        maxError: 0,
        errorPointCount: 0,
        seriesId: '',
      };
    }
    const s = layout.series[0]!;
    return {
      meanError: s.meanError,
      maxError: s.maxError,
      errorPointCount: s.errorPointCount,
      seriesId: s.id,
    };
  }, [layout.series]);

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
        data-section="chart-line-error-bars"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-total-error-points={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-error-bars-aria-desc"
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
  const halfCap = cap / 2;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-error-bars"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-total-error-points={totalErrorPoints}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-error-bars-aria-desc"
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
        data-section="chart-line-error-bars-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-error-bars-badge"
            data-mean-error={dominantConfig.meanError}
            data-max-error={dominantConfig.maxError}
            data-error-point-count={dominantConfig.errorPointCount}
            data-series-id={dominantConfig.seriesId}
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#ffffffd9',
              color: layout.series[0]?.color ?? '#0f172a',
              fontSize: 11,
              fontWeight: 600,
              display: 'flex',
              gap: 4,
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <span
              data-section="chart-line-error-bars-badge-icon"
              aria-hidden="true"
            >
              ERR
            </span>
            <span data-section="chart-line-error-bars-badge-mean">
              mean={formatError(dominantConfig.meanError)}
            </span>
            <span data-section="chart-line-error-bars-badge-max">
              max={formatError(dominantConfig.maxError)}
            </span>
            <span data-section="chart-line-error-bars-badge-points">
              bars={totalErrorPoints}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-error-bars-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-error-bars-grid"
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
                    data-section="chart-line-error-bars-grid-line"
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
                    data-section="chart-line-error-bars-grid-line"
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
              data-section="chart-line-error-bars-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-error-bars-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-error-bars-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-error-bars-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-error-bars-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-error-bars-tick-label"
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
              <g data-section="chart-line-error-bars-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-error-bars-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-error-bars-tick-label"
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
                  data-section="chart-line-error-bars-x-label"
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
                  data-section="chart-line-error-bars-y-label"
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

          <g data-section="chart-line-error-bars-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-error-bars-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-finite-count={s.finiteCount}
                data-series-error-point-count={s.errorPointCount}
                data-series-mean-error={s.meanError}
                data-series-max-error={s.maxError}
              >
                {showLine && s.linePath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} line`}
                    data-section="chart-line-error-bars-line-path"
                    data-series-id={s.id}
                    data-kind="line"
                    d={s.linePath}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showErrorBars
                  ? s.points
                      .filter((p) => p.hasError)
                      .map((p) => (
                        <g
                          key={`e-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} error bar at x ${formatX(p.x)}: ${formatValue(p.lower)} to ${formatValue(p.upper)}`}
                          data-section="chart-line-error-bars-error-bar"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-symmetric={p.symmetric ? 'true' : 'false'}
                        >
                          <line
                            data-section="chart-line-error-bars-error-bar-stem"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            x1={p.px}
                            x2={p.px}
                            y1={p.upperPy}
                            y2={p.lowerPy}
                            stroke={s.color}
                            strokeWidth={errorStrokeWidth}
                            strokeOpacity={errorOpacity}
                          />
                          <line
                            data-section="chart-line-error-bars-error-bar-cap"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-edge="upper"
                            x1={p.px - halfCap}
                            x2={p.px + halfCap}
                            y1={p.upperPy}
                            y2={p.upperPy}
                            stroke={s.color}
                            strokeWidth={errorStrokeWidth}
                            strokeOpacity={errorOpacity}
                          />
                          <line
                            data-section="chart-line-error-bars-error-bar-cap"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-edge="lower"
                            x1={p.px - halfCap}
                            x2={p.px + halfCap}
                            y1={p.lowerPy}
                            y2={p.lowerPy}
                            stroke={s.color}
                            strokeWidth={errorStrokeWidth}
                            strokeOpacity={errorOpacity}
                          />
                        </g>
                      ))
                  : null}
                {showDots
                  ? s.points.map((p) => {
                      const isHover =
                        hoverPayload?.seriesId === s.id &&
                        hoverPayload?.pointIndex === p.index;
                      return (
                        <circle
                          key={`d-${p.index}`}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label} point ${p.index + 1} at x ${formatX(p.x)}, y ${formatValue(p.y)}`}
                          data-section="chart-line-error-bars-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-y={p.y}
                          data-error-low={p.errorLow}
                          data-error-high={p.errorHigh}
                          data-has-error={p.hasError ? 'true' : 'false'}
                          data-hovered={isHover ? 'true' : 'false'}
                          cx={p.px}
                          cy={p.py}
                          r={isHover ? dotRadius + 1 : dotRadius}
                          fill={s.color}
                          stroke="#ffffff"
                          strokeWidth={1}
                          onMouseEnter={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.py });
                          }}
                          onMouseLeave={clearHover}
                          onFocus={() => {
                            setHoverPayload({
                              seriesId: s.id,
                              pointIndex: p.index,
                            });
                            setTooltipPos({ px: p.px, py: p.py });
                          }}
                          onBlur={clearHover}
                          onClick={() =>
                            onPointClick?.({ series: s, point: p })
                          }
                        />
                      );
                    })
                  : null}
              </g>
            ))}
          </g>
        </svg>

        {showTooltip && hoverPayload && tooltipPos
          ? (() => {
              const s = layout.series.find(
                (x) => x.id === hoverPayload.seriesId,
              );
              if (!s) return null;
              const p = s.points.find(
                (x) => x.index === hoverPayload.pointIndex,
              );
              if (!p) return null;
              return (
                <div
                  data-section="chart-line-error-bars-tooltip"
                  data-series-id={s.id}
                  data-point-index={p.index}
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
                    minWidth: 170,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  }}
                >
                  <div
                    data-section="chart-line-error-bars-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-error-bars-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div data-section="chart-line-error-bars-tooltip-y">
                    y: {formatValue(p.y)}
                  </div>
                  <div
                    data-section="chart-line-error-bars-tooltip-error"
                    style={{ fontWeight: 600 }}
                  >
                    error:{' '}
                    {p.symmetric
                      ? `+/- ${formatError(p.errorHigh)}`
                      : `+${formatError(p.errorHigh)} / -${formatError(p.errorLow)}`}
                  </div>
                  <div data-section="chart-line-error-bars-tooltip-range">
                    range: [{formatValue(p.lower)}, {formatValue(p.upper)}]
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-error-bars-legend"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginTop: 8,
            alignItems: 'center',
          }}
        >
          {series.map((s) => {
            const isHidden = hiddenSet.has(s.id);
            const layoutMatch = layout.series.find((x) => x.id === s.id);
            const swatchColor =
              s.color ??
              layoutMatch?.color ??
              DEFAULT_CHART_LINE_ERROR_BARS_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-error-bars-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
                onClick={() => handleToggle(s)}
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
                  data-section="chart-line-error-bars-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-error-bars-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-error-bars-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    ({layoutMatch.errorPointCount} bars;{' '}
                    mean {formatError(layoutMatch.meanError)})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-error-bars-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineErrorBars.displayName = 'ChartLineErrorBars';
