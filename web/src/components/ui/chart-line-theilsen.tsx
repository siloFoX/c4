import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_THEILSEN_WIDTH = 560;
export const DEFAULT_CHART_LINE_THEILSEN_HEIGHT = 320;
export const DEFAULT_CHART_LINE_THEILSEN_PADDING = 40;
export const DEFAULT_CHART_LINE_THEILSEN_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_THEILSEN_RAW_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_THEILSEN_TREND_STROKE_WIDTH = 2.25;
export const DEFAULT_CHART_LINE_THEILSEN_OLS_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_THEILSEN_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_THEILSEN_RAW_OPACITY = 0.5;
export const DEFAULT_CHART_LINE_THEILSEN_PALETTE = [
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
export const DEFAULT_CHART_LINE_THEILSEN_RAW_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_THEILSEN_OLS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_THEILSEN_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_THEILSEN_AXIS_COLOR = '#cbd5e1';

export interface ChartLineTheilSenPoint {
  x: number;
  y: number;
}

export interface ChartLineTheilSenSeries {
  id: string;
  label: string;
  data: readonly ChartLineTheilSenPoint[];
  color?: string;
}

export interface ChartLineTheilSenFit {
  ok: boolean;
  slope: number;
  intercept: number;
  pairCount: number;
  slopeMin: number;
  slopeMax: number;
}

export interface ChartLineTheilSenOlsFit {
  ok: boolean;
  slope: number;
  intercept: number;
}

export interface ChartLineTheilSenLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineTheilSenLayoutSeries {
  id: string;
  label: string;
  color: string;
  fit: ChartLineTheilSenFit;
  ols: ChartLineTheilSenOlsFit;
  points: ChartLineTheilSenLayoutPoint[];
  rawPath: string;
  trendStartPx: number | null;
  trendStartPy: number | null;
  trendEndPx: number | null;
  trendEndPy: number | null;
  olsStartPx: number | null;
  olsStartPy: number | null;
  olsEndPx: number | null;
  olsEndPy: number | null;
  finiteCount: number;
  totalCount: number;
}

export interface ChartLineTheilSenLayout {
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
  series: ChartLineTheilSenLayoutSeries[];
  totalPoints: number;
  visibleSeriesCount: number;
}

export interface ComputeLineTheilSenLayoutOptions {
  series: readonly ChartLineTheilSenSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
  includeOls?: boolean;
  defaultColors?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
}

export interface ChartLineTheilSenProps {
  series: readonly ChartLineTheilSenSeries[];
  hiddenSeries?: ReadonlySet<string> | readonly string[];
  defaultHiddenSeries?: ReadonlySet<string> | readonly string[];
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  rawStrokeWidth?: number;
  trendStrokeWidth?: number;
  olsStrokeWidth?: number;
  dotRadius?: number;
  rawOpacity?: number;
  rawColor?: string;
  olsColor?: string;
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
  showRaw?: boolean;
  showTrend?: boolean;
  showOlsComparison?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatCoefficient?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (payload: {
    series: ChartLineTheilSenLayoutSeries;
    point: ChartLineTheilSenLayoutPoint;
  }) => void;
  onSeriesToggle?: (payload: {
    series: ChartLineTheilSenSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

export function getLineTheilSenDefaultColor(index: number): string {
  const palette = DEFAULT_CHART_LINE_THEILSEN_PALETTE;
  if (!isFiniteNumber(index) || index < 0) {
    return palette[0]!;
  }
  return palette[Math.floor(index) % palette.length]!;
}

export function getLineTheilSenFinitePoints(
  points: readonly ChartLineTheilSenPoint[] | null | undefined,
): ChartLineTheilSenPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(
    (p): p is ChartLineTheilSenPoint =>
      !!p && isFiniteNumber(p.x) && isFiniteNumber(p.y),
  );
}

/**
 * Median of a set of values. Non-finite values are dropped. Returns
 * NaN for an empty (or all-non-finite) input.
 */
export function computeLineTheilSenMedian(
  values: readonly number[] | null | undefined,
): number {
  if (!Array.isArray(values)) return NaN;
  const finite = values.filter((v): v is number => isFiniteNumber(v));
  if (finite.length === 0) return NaN;
  const sorted = [...finite].sort((a, b) => a - b);
  const n = sorted.length;
  const mid = Math.floor(n / 2);
  return n % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Every pairwise slope `(y_j - y_i) / (x_j - x_i)` over the finite
 * points. Pairs that share an x value (a vertical pair) are skipped.
 */
export function computeTheilSenSlopes(
  points: readonly ChartLineTheilSenPoint[] | null | undefined,
): number[] {
  const finite = getLineTheilSenFinitePoints(points);
  const n = finite.length;
  const slopes: number[] = [];
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dx = finite[j]!.x - finite[i]!.x;
      if (dx === 0) continue;
      slopes.push((finite[j]!.y - finite[i]!.y) / dx);
    }
  }
  return slopes;
}

/**
 * The **Theil-Sen estimator** -- a robust linear trend.
 *
 * The slope is the **median of all pairwise slopes** between the data
 * points; the intercept is the median of `y_i - slope * x_i` over the
 * points. Because both are medians, the estimator has a ~29.3%
 * breakdown point -- it is unmoved by up to ~29% of the data being
 * arbitrary outliers. Ordinary least squares, by contrast, has a 0%
 * breakdown point: a single outlier can swing the OLS line by an
 * arbitrary amount.
 *
 * `ok = false` when there are fewer than 2 finite points or every
 * point shares the same x (no non-vertical pair exists).
 */
export function computeTheilSenFit(
  points: readonly ChartLineTheilSenPoint[] | null | undefined,
): ChartLineTheilSenFit {
  const finite = getLineTheilSenFinitePoints(points);
  if (finite.length < 2) {
    return {
      ok: false,
      slope: 0,
      intercept: 0,
      pairCount: 0,
      slopeMin: 0,
      slopeMax: 0,
    };
  }
  const slopes = computeTheilSenSlopes(finite);
  if (slopes.length === 0) {
    return {
      ok: false,
      slope: 0,
      intercept: 0,
      pairCount: 0,
      slopeMin: 0,
      slopeMax: 0,
    };
  }
  const slope = computeLineTheilSenMedian(slopes);
  const intercepts = finite.map((p) => p.y - slope * p.x);
  const intercept = computeLineTheilSenMedian(intercepts);
  let slopeMin = slopes[0]!;
  let slopeMax = slopes[0]!;
  for (const s of slopes) {
    if (s < slopeMin) slopeMin = s;
    if (s > slopeMax) slopeMax = s;
  }
  return {
    ok: true,
    slope,
    intercept,
    pairCount: slopes.length,
    slopeMin,
    slopeMax,
  };
}

/**
 * Ordinary least-squares linear fit -- supplied for the optional
 * comparison overlay so the (non-robust) OLS line can be drawn next to
 * the robust Theil-Sen line. `ok = false` when there are fewer than 2
 * finite points or every point shares the same x (zero x-variance).
 */
export function computeOlsFit(
  points: readonly ChartLineTheilSenPoint[] | null | undefined,
): ChartLineTheilSenOlsFit {
  const finite = getLineTheilSenFinitePoints(points);
  const n = finite.length;
  if (n < 2) return { ok: false, slope: 0, intercept: 0 };
  let sumX = 0;
  let sumY = 0;
  for (const p of finite) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of finite) {
    const dx = p.x - meanX;
    sxy += dx * (p.y - meanY);
    sxx += dx * dx;
  }
  if (sxx === 0) return { ok: false, slope: 0, intercept: 0 };
  const slope = sxy / sxx;
  return { ok: true, slope, intercept: meanY - slope * meanX };
}

export function runLineTheilSen(
  points: readonly ChartLineTheilSenPoint[] | null | undefined,
): {
  samples: ChartLineTheilSenPoint[];
  theilSen: ChartLineTheilSenFit;
  ols: ChartLineTheilSenOlsFit;
  xMin: number;
  xMax: number;
} {
  const finite = getLineTheilSenFinitePoints(points);
  const sorted = [...finite].sort((a, b) => a.x - b.x);
  const theilSen = computeTheilSenFit(sorted);
  const ols = computeOlsFit(sorted);
  const xMin = sorted.length > 0 ? sorted[0]!.x : 0;
  const xMax = sorted.length > 0 ? sorted[sorted.length - 1]!.x : 0;
  return { samples: sorted, theilSen, ols, xMin, xMax };
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

export function computeLineTheilSenLayout(
  options: ComputeLineTheilSenLayoutOptions,
): ChartLineTheilSenLayout {
  const {
    series,
    hiddenSeries,
    width,
    height,
    padding,
    tickCount = DEFAULT_CHART_LINE_THEILSEN_TICK_COUNT,
    includeOls = false,
    defaultColors = DEFAULT_CHART_LINE_THEILSEN_PALETTE,
    xMin: xMinOverride,
    xMax: xMaxOverride,
    yMin: yMinOverride,
    yMax: yMaxOverride,
  } = options;

  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const empty: ChartLineTheilSenLayout = {
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

  const runBySeries = new Map<string, ReturnType<typeof runLineTheilSen>>();

  for (const s of visible) {
    const run = runLineTheilSen(s.data);
    runBySeries.set(s.id, run);
    totalPoints += run.samples.length;
    for (const p of run.samples) {
      if (p.x < xLo) xLo = p.x;
      if (p.x > xHi) xHi = p.x;
      if (p.y < yLo) yLo = p.y;
      if (p.y > yHi) yHi = p.y;
    }
    if (run.theilSen.ok) {
      const ts1 = run.theilSen.slope * run.xMin + run.theilSen.intercept;
      const ts2 = run.theilSen.slope * run.xMax + run.theilSen.intercept;
      if (ts1 < yLo) yLo = ts1;
      if (ts1 > yHi) yHi = ts1;
      if (ts2 < yLo) yLo = ts2;
      if (ts2 > yHi) yHi = ts2;
    }
    if (includeOls && run.ols.ok) {
      const ol1 = run.ols.slope * run.xMin + run.ols.intercept;
      const ol2 = run.ols.slope * run.xMax + run.ols.intercept;
      if (ol1 < yLo) yLo = ol1;
      if (ol1 > yHi) yHi = ol1;
      if (ol2 < yLo) yLo = ol2;
      if (ol2 > yHi) yHi = ol2;
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

  const layoutSeries: ChartLineTheilSenLayoutSeries[] = visible.map(
    (s, idx) => {
      const run = runBySeries.get(s.id)!;
      const color =
        s.color ??
        defaultColors[idx % defaultColors.length] ??
        DEFAULT_CHART_LINE_THEILSEN_PALETTE[0]!;

      const points: ChartLineTheilSenLayoutPoint[] = run.samples.map(
        (p, i) => ({
          index: i,
          x: p.x,
          y: p.y,
          px: projectX(p.x),
          py: projectY(p.y),
        }),
      );

      let trendStartPx: number | null = null;
      let trendStartPy: number | null = null;
      let trendEndPx: number | null = null;
      let trendEndPy: number | null = null;
      if (run.theilSen.ok) {
        trendStartPx = projectX(run.xMin);
        trendStartPy = projectY(
          run.theilSen.slope * run.xMin + run.theilSen.intercept,
        );
        trendEndPx = projectX(run.xMax);
        trendEndPy = projectY(
          run.theilSen.slope * run.xMax + run.theilSen.intercept,
        );
      }
      let olsStartPx: number | null = null;
      let olsStartPy: number | null = null;
      let olsEndPx: number | null = null;
      let olsEndPy: number | null = null;
      if (run.ols.ok) {
        olsStartPx = projectX(run.xMin);
        olsStartPy = projectY(run.ols.slope * run.xMin + run.ols.intercept);
        olsEndPx = projectX(run.xMax);
        olsEndPy = projectY(run.ols.slope * run.xMax + run.ols.intercept);
      }

      return {
        id: s.id,
        label: s.label,
        color,
        fit: run.theilSen,
        ols: run.ols,
        points,
        rawPath: buildPath(points.map((p) => ({ px: p.px, py: p.py }))),
        trendStartPx,
        trendStartPy,
        trendEndPx,
        trendEndPy,
        olsStartPx,
        olsStartPy,
        olsEndPx,
        olsEndPy,
        finiteCount: run.samples.length,
        totalCount: s.data?.length ?? 0,
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

function defaultFormatCoefficient(n: number): string {
  if (!isFiniteNumber(n)) return 'n/a';
  return n.toFixed(3);
}

export function describeLineTheilSenChart(
  series: readonly ChartLineTheilSenSeries[] | null | undefined,
  options?: {
    hidden?: ReadonlySet<string> | readonly string[];
    formatCoefficient?: (n: number) => string;
  },
): string {
  if (!Array.isArray(series) || series.length === 0) return 'No data';
  const hiddenSet = normaliseHidden(options?.hidden);
  const visible = series.filter((s) => !hiddenSet.has(s.id));
  if (visible.length === 0) return 'No data';
  const fmt = options?.formatCoefficient ?? defaultFormatCoefficient;

  let totalPoints = 0;
  const summaries: string[] = [];
  for (const s of visible) {
    const run = runLineTheilSen(s.data);
    totalPoints += run.samples.length;
    if (run.theilSen.ok) {
      summaries.push(
        `${s.label}: Theil-Sen slope ${fmt(run.theilSen.slope)} (median of ${run.theilSen.pairCount} pairwise slopes), OLS slope ${fmt(run.ols.slope)}`,
      );
    } else {
      summaries.push(`${s.label}: no robust trend computable`);
    }
  }
  return `Line chart with a Theil-Sen robust median-slope trend estimator across ${visible.length} series (${totalPoints} points). ${summaries.join('; ')}.`;
}

export const ChartLineTheilSen = forwardRef<
  HTMLDivElement,
  ChartLineTheilSenProps
>(function ChartLineTheilSen(
  props: ChartLineTheilSenProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const {
    series,
    hiddenSeries: controlledHidden,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    width = DEFAULT_CHART_LINE_THEILSEN_WIDTH,
    height = DEFAULT_CHART_LINE_THEILSEN_HEIGHT,
    padding = DEFAULT_CHART_LINE_THEILSEN_PADDING,
    tickCount = DEFAULT_CHART_LINE_THEILSEN_TICK_COUNT,
    rawStrokeWidth = DEFAULT_CHART_LINE_THEILSEN_RAW_STROKE_WIDTH,
    trendStrokeWidth = DEFAULT_CHART_LINE_THEILSEN_TREND_STROKE_WIDTH,
    olsStrokeWidth = DEFAULT_CHART_LINE_THEILSEN_OLS_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_THEILSEN_DOT_RADIUS,
    rawOpacity = DEFAULT_CHART_LINE_THEILSEN_RAW_OPACITY,
    rawColor = DEFAULT_CHART_LINE_THEILSEN_RAW_COLOR,
    olsColor = DEFAULT_CHART_LINE_THEILSEN_OLS_COLOR,
    gridColor = DEFAULT_CHART_LINE_THEILSEN_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_THEILSEN_AXIS_COLOR,
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
    showRaw = true,
    showTrend = true,
    showOlsComparison = false,
    animate = true,
    className,
    ariaLabel = 'Line chart with a Theil-Sen robust median-slope trend estimator',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatX = defaultFormatValue,
    formatCoefficient = defaultFormatCoefficient,
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
      computeLineTheilSenLayout({
        series,
        hiddenSeries: hiddenSet,
        width,
        height,
        padding,
        tickCount,
        includeOls: showOlsComparison,
        ...(isFiniteNumber(xMin) ? { xMin } : {}),
        ...(isFiniteNumber(xMax) ? { xMax } : {}),
        ...(isFiniteNumber(yMin) ? { yMin } : {}),
        ...(isFiniteNumber(yMax) ? { yMax } : {}),
      }),
    [
      series,
      hiddenSet,
      width,
      height,
      padding,
      tickCount,
      showOlsComparison,
      xMin,
      xMax,
      yMin,
      yMax,
    ],
  );

  const summary = useMemo(
    () =>
      ariaDescription ??
      describeLineTheilSenChart(series, {
        hidden: hiddenSet,
        formatCoefficient,
      }),
    [ariaDescription, series, hiddenSet, formatCoefficient],
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
    (s: ChartLineTheilSenSeries) => {
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
        (acc, s) => acc + getLineTheilSenFinitePoints(s.data).length,
        0,
      ),
    [series],
  );

  const dominantConfig = useMemo<{
    slope: number;
    intercept: number;
    pairCount: number;
    olsSlope: number;
    ok: boolean;
    seriesId: string;
  }>(() => {
    if (layout.series.length === 0) {
      return {
        slope: 0,
        intercept: 0,
        pairCount: 0,
        olsSlope: 0,
        ok: false,
        seriesId: '',
      };
    }
    const s = layout.series[0]!;
    return {
      slope: s.fit.slope,
      intercept: s.fit.intercept,
      pairCount: s.fit.pairCount,
      olsSlope: s.ols.slope,
      ok: s.fit.ok,
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
        data-section="chart-line-theilsen"
        data-empty="true"
        data-series-count={series.length}
        data-visible-series-count={0}
        data-total-points={0}
        data-animate={animate ? 'true' : 'false'}
      >
        <span
          id={descId}
          data-section="chart-line-theilsen-aria-desc"
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

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={descId}
      className={[className, animateClass].filter(Boolean).join(' ') || undefined}
      style={containerStyle}
      data-section="chart-line-theilsen"
      data-empty="false"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-slope={dominantConfig.slope}
      data-intercept={dominantConfig.intercept}
      data-ols-slope={dominantConfig.olsSlope}
      data-fit-ok={dominantConfig.ok ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
    >
      <span
        id={descId}
        data-section="chart-line-theilsen-aria-desc"
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
        data-section="chart-line-theilsen-canvas"
        style={{ position: 'relative', width, height }}
      >
        {showConfigBadge ? (
          <div
            data-section="chart-line-theilsen-badge"
            data-slope={dominantConfig.slope}
            data-intercept={dominantConfig.intercept}
            data-pair-count={dominantConfig.pairCount}
            data-ols-slope={dominantConfig.olsSlope}
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
              data-section="chart-line-theilsen-badge-icon"
              aria-hidden="true"
            >
              TS
            </span>
            <span data-section="chart-line-theilsen-badge-slope">
              m={formatCoefficient(dominantConfig.slope)}
            </span>
            <span data-section="chart-line-theilsen-badge-intercept">
              b={formatCoefficient(dominantConfig.intercept)}
            </span>
            <span data-section="chart-line-theilsen-badge-pairs">
              n={dominantConfig.pairCount}
            </span>
          </div>
        ) : null}

        <svg
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          data-section="chart-line-theilsen-svg"
          style={{ display: 'block', overflow: 'visible' }}
        >
          {showGrid ? (
            <g
              data-section="chart-line-theilsen-grid"
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
                    data-section="chart-line-theilsen-grid-line"
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
                    data-section="chart-line-theilsen-grid-line"
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
              data-section="chart-line-theilsen-axes"
              stroke={axisColor}
              strokeWidth={1}
            >
              <line
                data-section="chart-line-theilsen-axis"
                data-axis="x"
                x1={layout.panel.x}
                y1={layout.panel.y + layout.panel.height}
                x2={layout.panel.x + layout.panel.width}
                y2={layout.panel.y + layout.panel.height}
              />
              <line
                data-section="chart-line-theilsen-axis"
                data-axis="y"
                x1={layout.panel.x}
                y1={layout.panel.y}
                x2={layout.panel.x}
                y2={layout.panel.y + layout.panel.height}
              />
              <g data-section="chart-line-theilsen-ticks" data-axis="x">
                {layout.xTicks.map((t, i) => {
                  const px =
                    layout.panel.x +
                    ((t - layout.xMin) / (layout.xMax - layout.xMin)) *
                      layout.panel.width;
                  return (
                    <g
                      key={`tx-${i}`}
                      data-section="chart-line-theilsen-tick"
                      data-axis="x"
                    >
                      <line
                        x1={px}
                        x2={px}
                        y1={layout.panel.y + layout.panel.height}
                        y2={layout.panel.y + layout.panel.height + 4}
                      />
                      <text
                        data-section="chart-line-theilsen-tick-label"
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
              <g data-section="chart-line-theilsen-ticks" data-axis="y">
                {layout.yTicks.map((t, i) => {
                  const py =
                    layout.panel.y +
                    layout.panel.height -
                    ((t - layout.yMin) / (layout.yMax - layout.yMin)) *
                      layout.panel.height;
                  return (
                    <g
                      key={`ty-${i}`}
                      data-section="chart-line-theilsen-tick"
                      data-axis="y"
                    >
                      <line
                        x1={layout.panel.x - 4}
                        x2={layout.panel.x}
                        y1={py}
                        y2={py}
                      />
                      <text
                        data-section="chart-line-theilsen-tick-label"
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
                  data-section="chart-line-theilsen-x-label"
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
                  data-section="chart-line-theilsen-y-label"
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

          <g data-section="chart-line-theilsen-series">
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-theilsen-series-group"
                data-series-id={s.id}
                data-series-color={s.color}
                data-series-slope={s.fit.slope}
                data-series-intercept={s.fit.intercept}
                data-series-pair-count={s.fit.pairCount}
                data-series-ols-slope={s.ols.slope}
                data-series-fit-ok={s.fit.ok ? 'true' : 'false'}
                data-series-finite-count={s.finiteCount}
              >
                {showRaw && s.rawPath ? (
                  <path
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} raw observations`}
                    data-section="chart-line-theilsen-raw-path"
                    data-series-id={s.id}
                    data-kind="raw"
                    d={s.rawPath}
                    fill="none"
                    stroke={rawColor}
                    strokeWidth={rawStrokeWidth}
                    strokeOpacity={rawOpacity}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {showOlsComparison &&
                s.olsStartPx !== null &&
                s.olsStartPy !== null &&
                s.olsEndPx !== null &&
                s.olsEndPy !== null ? (
                  <line
                    data-section="chart-line-theilsen-ols-line"
                    data-series-id={s.id}
                    data-kind="ols"
                    x1={s.olsStartPx}
                    y1={s.olsStartPy}
                    x2={s.olsEndPx}
                    y2={s.olsEndPy}
                    stroke={olsColor}
                    strokeWidth={olsStrokeWidth}
                    strokeDasharray="5 3"
                    strokeLinecap="round"
                    pointerEvents="none"
                  />
                ) : null}
                {showTrend &&
                s.trendStartPx !== null &&
                s.trendStartPy !== null &&
                s.trendEndPx !== null &&
                s.trendEndPy !== null ? (
                  <line
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label} Theil-Sen robust trend (slope ${formatCoefficient(s.fit.slope)})`}
                    data-section="chart-line-theilsen-trend-line"
                    data-series-id={s.id}
                    data-kind="theil-sen"
                    x1={s.trendStartPx}
                    y1={s.trendStartPy}
                    x2={s.trendEndPx}
                    y2={s.trendEndPy}
                    stroke={s.color}
                    strokeWidth={trendStrokeWidth}
                    strokeLinecap="round"
                  />
                ) : null}
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
                          data-section="chart-line-theilsen-dot"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-x={p.x}
                          data-y={p.y}
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
              const trendValue = s.fit.ok
                ? s.fit.slope * p.x + s.fit.intercept
                : null;
              const residual =
                trendValue !== null ? p.y - trendValue : null;
              return (
                <div
                  data-section="chart-line-theilsen-tooltip"
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
                    data-section="chart-line-theilsen-tooltip-label"
                    style={{ color: s.color, fontWeight: 600 }}
                  >
                    {s.label}
                  </div>
                  <div data-section="chart-line-theilsen-tooltip-x">
                    x: {formatX(p.x)}
                  </div>
                  <div data-section="chart-line-theilsen-tooltip-y">
                    y: {formatValue(p.y)}
                  </div>
                  <div
                    data-section="chart-line-theilsen-tooltip-trend"
                    style={{ fontWeight: 600 }}
                  >
                    trend:{' '}
                    {trendValue === null ? 'n/a' : formatValue(trendValue)}
                  </div>
                  <div data-section="chart-line-theilsen-tooltip-residual">
                    residual:{' '}
                    {residual === null
                      ? 'n/a'
                      : (residual >= 0 ? '+' : '') + formatValue(residual)}
                  </div>
                </div>
              );
            })()
          : null}
      </div>

      {showLegend ? (
        <div
          data-section="chart-line-theilsen-legend"
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
              DEFAULT_CHART_LINE_THEILSEN_PALETTE[0]!;
            return (
              <button
                key={s.id}
                type="button"
                data-section="chart-line-theilsen-legend-item"
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
                  data-section="chart-line-theilsen-legend-swatch"
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: swatchColor,
                  }}
                />
                <span data-section="chart-line-theilsen-legend-label">
                  {s.label}
                </span>
                {layoutMatch ? (
                  <span
                    data-section="chart-line-theilsen-legend-stats"
                    style={{ fontSize: 10, color: '#64748b' }}
                  >
                    (m={formatCoefficient(layoutMatch.fit.slope)};{' '}
                    OLS m={formatCoefficient(layoutMatch.ols.slope)})
                  </span>
                ) : null}
              </button>
            );
          })}
          <span
            data-section="chart-line-theilsen-legend-total-points"
            style={{ fontSize: 10, color: '#64748b' }}
          >
            {allTotalPoints} total points
          </span>
        </div>
      ) : null}
    </div>
  );
});

ChartLineTheilSen.displayName = 'ChartLineTheilSen';
