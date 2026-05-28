import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_TARGET_WIDTH = 560;
export const DEFAULT_CHART_LINE_TARGET_HEIGHT = 320;
export const DEFAULT_CHART_LINE_TARGET_PADDING = 40;
export const DEFAULT_CHART_LINE_TARGET_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_TARGET_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_TARGET_TARGET_WIDTH = 2;
export const DEFAULT_CHART_LINE_TARGET_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_TARGET_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_TARGET_FILL_OPACITY = 0.18;
export const DEFAULT_CHART_LINE_TARGET_TARGET_DASH = '6 4';
export const DEFAULT_CHART_LINE_TARGET_OVER_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_TARGET_UNDER_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_TARGET_TARGET_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_TARGET_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_TARGET_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_TARGET_VALUE = 0;
export const DEFAULT_CHART_LINE_TARGET_EPSILON = 0;
export const DEFAULT_CHART_LINE_TARGET_PALETTE = [
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

export type ChartLineTargetDirection = 'over' | 'under' | 'at';

export interface ChartLineTargetPoint {
  x: number;
  y: number;
}

export interface ChartLineTargetSeries {
  id: string;
  label: string;
  data: readonly ChartLineTargetPoint[];
  color?: string;
  overColor?: string;
  underColor?: string;
}

export interface ChartLineTargetClassification {
  direction: ChartLineTargetDirection;
  delta: number;
}

export interface ChartLineTargetStats {
  overCount: number;
  underCount: number;
  atCount: number;
  maxOverGap: number;
  maxUnderGap: number;
  totalArea: number;
  finiteCount: number;
  percentOver: number;
  percentUnder: number;
  percentAt: number;
}

export interface ChartLineTargetLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  delta: number;
  direction: ChartLineTargetDirection;
}

export interface ChartLineTargetLayoutRegion {
  index: number;
  startX: number;
  endX: number;
  startY: number;
  endY: number;
  isOver: boolean;
  fillColor: string;
  path: string;
  area: number;
}

export interface ChartLineTargetLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  overColor: string;
  underColor: string;
  points: ChartLineTargetLayoutPoint[];
  path: string;
  regions: ChartLineTargetLayoutRegion[];
  stats: ChartLineTargetStats;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineTargetLayoutResult {
  series: ChartLineTargetLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  target: number;
  targetY: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineTargetPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineTargetPoint).x) &&
    isFiniteNumber((p as ChartLineTargetPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineTargetDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_TARGET_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_TARGET_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_TARGET_PALETTE.length
  ]!;
}

export function getLineTargetFinitePoints(
  points: readonly ChartLineTargetPoint[],
): ChartLineTargetPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Classifies `y` against `target` with an optional `epsilon` equality
 * band:
 *
 * - `direction = 'over'` when `delta = y - target > epsilon`.
 * - `direction = 'under'` when `delta < -epsilon`.
 * - `direction = 'at'` otherwise (including non-finite `y`, which
 *   returns `{delta: 0, direction: 'at'}`).
 *
 * `target` non-finite collapses to `0`. `epsilon` non-finite collapses
 * to `0`.
 */
export function classifyLineTargetPoint(
  y: number,
  target: number,
  epsilon: number = 0,
): ChartLineTargetClassification {
  const t = isFiniteNumber(target) ? target : 0;
  const e = isFiniteNumber(epsilon) && epsilon >= 0 ? epsilon : 0;
  if (!isFiniteNumber(y)) {
    return { delta: 0, direction: 'at' };
  }
  const delta = y - t;
  if (delta > e) return { delta, direction: 'over' };
  if (delta < -e) return { delta, direction: 'under' };
  return { delta, direction: 'at' };
}

/**
 * Returns the x value at which the line segment crossing
 * `(x1, y1) -> (x2, y2)` intersects the horizontal `target` line, or
 * `null` when the segments don't cross (same sign on the deltas), one
 * endpoint sits exactly on the target, or inputs are degenerate /
 * non-finite.
 *
 *     x* = x1 + (x2 - x1) * |y1 - target| / (|y1 - target| + |y2 - target|)
 */
export function findLineTargetCrossing(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  target: number,
): number | null {
  if (
    !isFiniteNumber(x1) ||
    !isFiniteNumber(y1) ||
    !isFiniteNumber(x2) ||
    !isFiniteNumber(y2) ||
    !isFiniteNumber(target)
  ) {
    return null;
  }
  if (x1 === x2) return null;
  const d1 = y1 - target;
  const d2 = y2 - target;
  if (d1 === 0 || d2 === 0) return null;
  if (Math.sign(d1) === Math.sign(d2)) return null;
  const a1 = Math.abs(d1);
  const a2 = Math.abs(d2);
  if (a1 + a2 === 0) return null;
  return x1 + (x2 - x1) * (a1 / (a1 + a2));
}

/**
 * Computes per-series aggregate stats relative to the target. The
 * sample order does not matter; only the values do. Non-finite samples
 * are dropped silently (and not counted in `finiteCount`).
 */
export function computeLineTargetStats(
  points: readonly ChartLineTargetPoint[] | undefined | null,
  target: number,
  epsilon: number = 0,
): ChartLineTargetStats {
  const empty: ChartLineTargetStats = {
    overCount: 0,
    underCount: 0,
    atCount: 0,
    maxOverGap: 0,
    maxUnderGap: 0,
    totalArea: 0,
    finiteCount: 0,
    percentOver: 0,
    percentUnder: 0,
    percentAt: 0,
  };
  if (!Array.isArray(points)) return empty;
  const finite = points.filter(isFinitePoint);
  if (finite.length === 0) return empty;
  finite.sort((a, b) => a.x - b.x);
  let overCount = 0;
  let underCount = 0;
  let atCount = 0;
  let maxOverGap = 0;
  let maxUnderGap = 0;
  for (const p of finite) {
    const c = classifyLineTargetPoint(p.y, target, epsilon);
    if (c.direction === 'over') {
      overCount += 1;
      if (c.delta > maxOverGap) maxOverGap = c.delta;
    } else if (c.direction === 'under') {
      underCount += 1;
      if (-c.delta > maxUnderGap) maxUnderGap = -c.delta;
    } else {
      atCount += 1;
    }
  }
  // Approximate signed area as |delta| trapezoids between samples.
  let totalArea = 0;
  const t = isFiniteNumber(target) ? target : 0;
  for (let i = 0; i < finite.length - 1; i += 1) {
    const a = finite[i]!;
    const b = finite[i + 1]!;
    const da = Math.abs(a.y - t);
    const db = Math.abs(b.y - t);
    const dx = Math.abs(b.x - a.x);
    totalArea += ((da + db) / 2) * dx;
  }
  const total = finite.length;
  return {
    overCount,
    underCount,
    atCount,
    maxOverGap,
    maxUnderGap,
    totalArea,
    finiteCount: total,
    percentOver: total === 0 ? 0 : overCount / total,
    percentUnder: total === 0 ? 0 : underCount / total,
    percentAt: total === 0 ? 0 : atCount / total,
  };
}

export interface ComputeLineTargetLayoutInput {
  series: readonly ChartLineTargetSeries[];
  target?: number;
  epsilon?: number;
  hiddenSeries?: ReadonlySet<string> | null;
  showOverUnderShading?: boolean;
  overColor?: string;
  underColor?: string;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineTargetLayout(
  input: ComputeLineTargetLayoutInput,
): ComputeLineTargetLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const target = isFiniteNumber(input.target)
    ? input.target
    : DEFAULT_CHART_LINE_TARGET_VALUE;
  const epsilon =
    isFiniteNumber(input.epsilon) && input.epsilon >= 0
      ? input.epsilon
      : DEFAULT_CHART_LINE_TARGET_EPSILON;
  const empty: ComputeLineTargetLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    target,
    targetY: 0,
    innerWidth,
    innerHeight,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  if (seriesArr.length === 0) return empty;
  const hidden = input.hiddenSeries ?? null;
  const visible = seriesArr.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return empty;

  // Bounds across all visible series + the target line.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of visible) {
    for (const p of getLineTargetFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  }
  if (!any) {
    xMin = 0;
    xMax = 1;
    yMin = 0;
    yMax = 1;
  }
  // Include the target line in the y range so it's always visible.
  if (target < yMin) yMin = target;
  if (target > yMax) yMax = target;
  if (isFiniteNumber(input.xMin)) xMin = input.xMin;
  if (isFiniteNumber(input.xMax)) xMax = input.xMax;
  if (isFiniteNumber(input.yMin)) yMin = input.yMin;
  if (isFiniteNumber(input.yMax)) yMax = input.yMax;
  if (xMax < xMin) [xMin, xMax] = [xMax, xMin];
  if (yMax < yMin) [yMin, yMax] = [yMax, yMin];
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  const xToPx = (x: number): number =>
    padding + ((x - xMin) / xRange) * innerWidth;
  const yToPx = (y: number): number =>
    padding + innerHeight - ((y - yMin) / yRange) * innerHeight;
  const targetY = yToPx(target);
  const overFallback =
    input.overColor ?? DEFAULT_CHART_LINE_TARGET_OVER_COLOR;
  const underFallback =
    input.underColor ?? DEFAULT_CHART_LINE_TARGET_UNDER_COLOR;
  const wantShading = input.showOverUnderShading !== false;

  const layoutSeries: ChartLineTargetLayoutSeries[] = [];
  let totalPoints = 0;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const finiteSorted = arr
      .filter(isFinitePoint)
      .slice()
      .sort((a, b) => a.x - b.x);
    const points: ChartLineTargetLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      const c = classifyLineTargetPoint(p.y, target, epsilon);
      points.push({
        index: j,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        delta: c.delta,
        direction: c.direction,
      });
    }
    // Path uses original-array order so authors that supply ordered
    // data keep their order; sorting is used only for region math.
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    const overColor = s.overColor ?? overFallback;
    const underColor = s.underColor ?? underFallback;
    const regions: ChartLineTargetLayoutRegion[] = [];
    if (wantShading) {
      for (let j = 0; j < finiteSorted.length - 1; j += 1) {
        const a = finiteSorted[j]!;
        const b = finiteSorted[j + 1]!;
        const crossing = findLineTargetCrossing(
          a.x,
          a.y,
          b.x,
          b.y,
          target,
        );
        const emit = (
          startX: number,
          startY: number,
          endX: number,
          endY: number,
          isOver: boolean,
        ): void => {
          if (startX === endX) return;
          const fillColor = isOver ? overColor : underColor;
          const px1 = xToPx(startX);
          const px2 = xToPx(endX);
          const py1 = yToPx(startY);
          const py2 = yToPx(endY);
          const path =
            `M ${fmt(px1)} ${fmt(py1)} L ${fmt(px2)} ${fmt(py2)} ` +
            `L ${fmt(px2)} ${fmt(targetY)} L ${fmt(px1)} ${fmt(targetY)} Z`;
          const da = Math.abs(startY - target);
          const db = Math.abs(endY - target);
          const area = ((da + db) / 2) * Math.abs(endX - startX);
          regions.push({
            index: regions.length,
            startX,
            endX,
            startY,
            endY,
            isOver,
            fillColor,
            path,
            area,
          });
        };
        if (crossing === null) {
          if (a.y === target && b.y === target) continue;
          const isOver = a.y - target > 0 || b.y - target > 0;
          emit(a.x, a.y, b.x, b.y, isOver);
        } else {
          const firstIsOver = a.y - target > 0;
          emit(a.x, a.y, crossing, target, firstIsOver);
          emit(crossing, target, b.x, b.y, !firstIsOver);
        }
      }
    }
    const stats = computeLineTargetStats(arr, target, epsilon);
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: i,
      color: s.color ?? getLineTargetDefaultColor(i),
      overColor,
      underColor,
      points,
      path,
      regions,
      stats,
      finiteCount: points.length,
      totalCount: arr.length,
    });
  }

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_TARGET_TICK_COUNT;
  const stepCount = Math.max(2, Math.floor(tickCount));
  const xTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = xMin + (xRange * i) / (stepCount - 1);
    xTicks.push({
      value,
      position: padding + ((value - xMin) / xRange) * innerWidth,
    });
  }
  const yTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = yMin + (yRange * i) / (stepCount - 1);
    yTicks.push({
      value,
      position:
        padding + innerHeight - ((value - yMin) / yRange) * innerHeight,
    });
  }

  return {
    series: layoutSeries,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    target,
    targetY,
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineTargetChart(
  series: readonly ChartLineTargetSeries[] | undefined | null,
  target: number,
  hidden?: ReadonlySet<string>,
  formatValue?: (n: number) => string,
): string {
  if (!series || !Array.isArray(series) || series.length === 0)
    return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  const visible = series.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return 'No data';
  let any = false;
  let totalPoints = 0;
  const parts: string[] = [];
  for (const s of visible) {
    const stats = computeLineTargetStats(s.data ?? [], target);
    totalPoints += stats.finiteCount;
    if (stats.finiteCount === 0) continue;
    any = true;
    const pct = Math.round(stats.percentOver * 100);
    parts.push(
      `${s.label}: ${stats.overCount}/${stats.finiteCount} over (${pct}%), peak over ${fmtV(stats.maxOverGap)}, peak under ${fmtV(stats.maxUnderGap)}`,
    );
  }
  if (!any) return 'No data';
  return `Line chart vs target ${fmtV(target)} across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineTargetPointClick {
  series: ChartLineTargetLayoutSeries;
  point: ChartLineTargetLayoutPoint;
}

export interface ChartLineTargetRegionClick {
  series: ChartLineTargetLayoutSeries;
  region: ChartLineTargetLayoutRegion;
}

export interface ChartLineTargetProps {
  series: readonly ChartLineTargetSeries[];
  target?: number;
  epsilon?: number;
  targetLabel?: string;
  hiddenSeries?: ReadonlySet<string>;
  defaultHiddenSeries?: ReadonlySet<string>;
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  targetStrokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  fillOpacity?: number;
  targetDashArray?: string;
  overColor?: string;
  underColor?: string;
  targetColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showOverUnderShading?: boolean;
  showTargetLine?: boolean;
  showTargetLabel?: boolean;
  showProgress?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatDelta?: (n: number) => string;
  formatPercent?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineTargetPointClick) => void;
  onRegionClick?: (info: ChartLineTargetRegionClick) => void;
  style?: CSSProperties;
}

export const ChartLineTarget = forwardRef(function ChartLineTarget(
  {
    series = [],
    target = DEFAULT_CHART_LINE_TARGET_VALUE,
    epsilon = DEFAULT_CHART_LINE_TARGET_EPSILON,
    targetLabel = 'Target',
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_TARGET_WIDTH,
    height = DEFAULT_CHART_LINE_TARGET_HEIGHT,
    padding = DEFAULT_CHART_LINE_TARGET_PADDING,
    tickCount = DEFAULT_CHART_LINE_TARGET_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_TARGET_STROKE_WIDTH,
    targetStrokeWidth = DEFAULT_CHART_LINE_TARGET_TARGET_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_TARGET_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_TARGET_LINE_OPACITY,
    fillOpacity = DEFAULT_CHART_LINE_TARGET_FILL_OPACITY,
    targetDashArray = DEFAULT_CHART_LINE_TARGET_TARGET_DASH,
    overColor = DEFAULT_CHART_LINE_TARGET_OVER_COLOR,
    underColor = DEFAULT_CHART_LINE_TARGET_UNDER_COLOR,
    targetColor = DEFAULT_CHART_LINE_TARGET_TARGET_COLOR,
    gridColor = DEFAULT_CHART_LINE_TARGET_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_TARGET_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showOverUnderShading = true,
    showTargetLine = true,
    showTargetLabel = true,
    showProgress = true,
    animate = true,
    className,
    ariaLabel = 'Line chart vs target',
    ariaDescription,
    formatValue,
    formatX,
    formatDelta,
    formatPercent,
    xLabel,
    yLabel,
    onPointClick,
    onRegionClick,
    style,
  }: ChartLineTargetProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const fmtValue = useCallback(
    (n: number) => (formatValue ? formatValue(n) : String(n)),
    [formatValue],
  );
  const fmtX = useCallback(
    (n: number) => (formatX ? formatX(n) : String(n)),
    [formatX],
  );
  const fmtDelta = useCallback(
    (n: number) =>
      formatDelta
        ? formatDelta(n)
        : `${n >= 0 ? '+' : ''}${formatValue ? formatValue(n) : String(n)}`,
    [formatDelta, formatValue],
  );
  const fmtPercent = useCallback(
    (n: number) =>
      formatPercent
        ? formatPercent(n)
        : `${Math.round(n * 100)}%`,
    [formatPercent],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineTargetLayout({
        series,
        target,
        epsilon,
        hiddenSeries: hidden,
        showOverUnderShading,
        overColor,
        underColor,
        ...(xMin !== undefined ? { xMin } : {}),
        ...(xMax !== undefined ? { xMax } : {}),
        ...(yMin !== undefined ? { yMin } : {}),
        ...(yMax !== undefined ? { yMax } : {}),
        width,
        height,
        padding,
        tickCount,
      }),
    [
      series,
      target,
      epsilon,
      hidden,
      showOverUnderShading,
      overColor,
      underColor,
      xMin,
      xMax,
      yMin,
      yMax,
      width,
      height,
      padding,
      tickCount,
    ],
  );

  const description =
    ariaDescription ??
    describeLineTargetChart(series, target, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineTargetSeries) => {
      const next = new Set(hidden);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      if (hiddenSeries === undefined) setInternalHidden(next);
      if (onHiddenSeriesChange) onHiddenSeriesChange(next);
    },
    [hidden, hiddenSeries, onHiddenSeriesChange],
  );

  const rootClass = [
    'relative inline-block w-full max-w-full text-xs text-slate-700',
    animate ? 'motion-safe:animate-fade-in' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-target"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-target={layout.target}
      data-target-y={layout.targetY}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-target-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-target-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-target-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-target-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-target-grid-line"
                  data-axis="x"
                  data-tick-value={t.value}
                  x1={t.position}
                  y1={padding}
                  x2={t.position}
                  y2={padding + layout.innerHeight}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
              {layout.yTicks.map((t) => (
                <line
                  key={`grid-y-${t.value}`}
                  data-section="chart-line-target-grid-line"
                  data-axis="y"
                  data-tick-value={t.value}
                  x1={padding}
                  y1={t.position}
                  x2={padding + layout.innerWidth}
                  y2={t.position}
                  stroke={gridColor}
                  strokeDasharray="2 4"
                  strokeWidth={1}
                />
              ))}
            </g>
          ) : null}

          {/* Over/under regions beneath axes and series lines */}
          {showOverUnderShading ? (
            <g data-section="chart-line-target-regions">
              {layout.series.flatMap((s) =>
                s.regions.map((r) => (
                  <path
                    key={`region-${s.id}-${r.index}`}
                    data-section="chart-line-target-region"
                    data-series-id={s.id}
                    data-region-index={r.index}
                    data-region-is-over={r.isOver ? 'true' : 'false'}
                    data-region-start-x={r.startX}
                    data-region-end-x={r.endX}
                    data-region-fill-color={r.fillColor}
                    data-region-area={r.area}
                    d={r.path}
                    fill={r.fillColor}
                    fillOpacity={fillOpacity}
                    stroke="none"
                    onClick={() => {
                      if (onRegionClick)
                        onRegionClick({ series: s, region: r });
                    }}
                  />
                )),
              )}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-target-axes">
              <line
                data-section="chart-line-target-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-target-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-target-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-target-tick"
                      data-axis="x"
                    >
                      <line
                        x1={t.position}
                        y1={padding + layout.innerHeight}
                        x2={t.position}
                        y2={padding + layout.innerHeight + 4}
                        stroke={axisColor}
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-line-target-tick-label"
                        data-axis="x"
                        data-tick-value={t.value}
                        x={t.position}
                        y={padding + layout.innerHeight + 14}
                        textAnchor="middle"
                        fontSize={10}
                        fill="currentColor"
                      >
                        {fmtX(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ) : null}
              {layout.yTicks.length > 0 ? (
                <g data-section="chart-line-target-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-target-tick"
                      data-axis="y"
                    >
                      <line
                        x1={padding}
                        y1={t.position}
                        x2={padding - 4}
                        y2={t.position}
                        stroke={axisColor}
                        strokeWidth={1}
                      />
                      <text
                        data-section="chart-line-target-tick-label"
                        data-axis="y"
                        data-tick-value={t.value}
                        x={padding - 6}
                        y={t.position + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill="currentColor"
                      >
                        {fmtValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ) : null}
              {xLabel ? (
                <text
                  data-section="chart-line-target-x-label"
                  x={padding + layout.innerWidth / 2}
                  y={padding + layout.innerHeight + 30}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-target-y-label"
                  x={padding - 30}
                  y={padding + layout.innerHeight / 2}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  transform={`rotate(-90 ${padding - 30} ${padding + layout.innerHeight / 2})`}
                >
                  {yLabel}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Target reference line */}
          {showTargetLine ? (
            <g data-section="chart-line-target-target">
              <line
                data-section="chart-line-target-target-line"
                data-target-value={layout.target}
                data-target-y={layout.targetY}
                role="graphics-symbol"
                aria-label={`${targetLabel}: ${fmtValue(layout.target)}`}
                x1={padding}
                y1={layout.targetY}
                x2={padding + layout.innerWidth}
                y2={layout.targetY}
                stroke={targetColor}
                strokeWidth={targetStrokeWidth}
                strokeDasharray={targetDashArray}
                strokeLinecap="round"
              />
              {showTargetLabel ? (
                <text
                  data-section="chart-line-target-target-label"
                  data-target-value={layout.target}
                  x={padding + layout.innerWidth - 6}
                  y={layout.targetY - 4}
                  textAnchor="end"
                  fontSize={10}
                  fill={targetColor}
                  style={{ pointerEvents: 'none' }}
                >
                  {targetLabel}: {fmtValue(layout.target)}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Series lines + dots */}
          <g data-section="chart-line-target-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-target-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-over-count={s.stats.overCount}
                  data-series-under-count={s.stats.underCount}
                  data-series-at-count={s.stats.atCount}
                  data-series-max-over-gap={s.stats.maxOverGap}
                  data-series-max-under-gap={s.stats.maxUnderGap}
                  data-series-percent-over={s.stats.percentOver}
                  data-series-total-area={s.stats.totalArea}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-target-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points, ${s.stats.overCount} over target`}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={dim}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots
                    ? s.points.map((p) => {
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}, ${p.direction} target by ${fmtDelta(p.delta)}`;
                        const fillForDot =
                          p.direction === 'over'
                            ? s.overColor
                            : p.direction === 'under'
                              ? s.underColor
                              : s.color;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-target-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-direction={p.direction}
                            data-delta={p.delta}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={fillForDot}
                            fillOpacity={opacity}
                            stroke={s.color}
                            strokeWidth={1}
                            onMouseEnter={() => setHoveredKey(key)}
                            onMouseLeave={() => setHoveredKey(null)}
                            onFocus={() => setHoveredKey(key)}
                            onBlur={() => setHoveredKey(null)}
                            onClick={() => {
                              if (onPointClick) {
                                onPointClick({ series: s, point: p });
                              }
                            }}
                          />
                        );
                      })
                    : null}
                </g>
              );
            })}
          </g>
        </svg>

        {showTooltip && hoveredKey ? (() => {
          const sep = hoveredKey.indexOf('::');
          if (sep < 0) return null;
          const sid = hoveredKey.slice(0, sep);
          const idx = Number(hoveredKey.slice(sep + 2));
          const s = layout.series.find((x) => x.id === sid);
          if (!s) return null;
          const p = s.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(p.py - 64, 0), height - 100);
          const deltaColor =
            p.direction === 'over'
              ? s.overColor
              : p.direction === 'under'
                ? s.underColor
                : 'inherit';
          return (
            <div
              data-section="chart-line-target-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              data-direction={p.direction}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-target-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-target-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-target-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              <div
                data-section="chart-line-target-tooltip-delta"
                style={{ color: deltaColor }}
              >
                {p.direction === 'over'
                  ? 'over'
                  : p.direction === 'under'
                    ? 'under'
                    : 'at'}{' '}
                {targetLabel.toLowerCase()}: {fmtDelta(p.delta)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-target-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-target-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-target-legend-button"
                  data-series-id={s.id}
                  aria-pressed={!isHidden}
                  onClick={() => toggleSeries(s)}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5',
                    isHidden ? 'opacity-50' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span
                    data-section="chart-line-target-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineTargetDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-target-legend-label">
                    {s.label}
                  </span>
                  {showProgress && visEntry ? (
                    <span
                      data-section="chart-line-target-legend-progress"
                      className="text-slate-500"
                    >
                      ({visEntry.stats.overCount}/
                      {visEntry.stats.finiteCount} over,{' '}
                      {fmtPercent(visEntry.stats.percentOver)})
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineTarget.displayName = 'ChartLineTarget';
