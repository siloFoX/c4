import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CUMULATIVE_WIDTH = 560;
export const DEFAULT_CHART_LINE_CUMULATIVE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_CUMULATIVE_PADDING = 40;
export const DEFAULT_CHART_LINE_CUMULATIVE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CUMULATIVE_STROKE_WIDTH = 2;
export const DEFAULT_CHART_LINE_CUMULATIVE_INCREMENT_WIDTH = 6;
export const DEFAULT_CHART_LINE_CUMULATIVE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CUMULATIVE_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_CUMULATIVE_INCREMENT_OPACITY = 0.55;
export const DEFAULT_CHART_LINE_CUMULATIVE_TARGET_DASH = '6 4';
export const DEFAULT_CHART_LINE_CUMULATIVE_TARGET_COLOR = '#0f172a';
export const DEFAULT_CHART_LINE_CUMULATIVE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CUMULATIVE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CUMULATIVE_BASELINE = 0;
export const DEFAULT_CHART_LINE_CUMULATIVE_PALETTE = [
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

export interface ChartLineCumulativePoint {
  x: number;
  value: number;
}

export interface ChartLineCumulativeSeries {
  id: string;
  label: string;
  data: readonly ChartLineCumulativePoint[];
  color?: string;
  baseline?: number;
}

export interface ChartLineCumulativeRunningPoint {
  index: number;
  x: number;
  value: number;
  cumulative: number;
}

export interface ChartLineCumulativeStats {
  finiteCount: number;
  totalValue: number;
  total: number;
  maxIncrement: number;
  minIncrement: number;
  baseline: number;
  reachedTarget: boolean;
  targetCrossingX: number | null;
  targetCrossingIndex: number | null;
  percentToTarget: number;
}

export interface ChartLineCumulativeLayoutPoint {
  index: number;
  x: number;
  value: number;
  cumulative: number;
  px: number;
  py: number;
  incrementY: number;
  incrementHeight: number;
}

export interface ChartLineCumulativeLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  baseline: number;
  points: ChartLineCumulativeLayoutPoint[];
  path: string;
  stats: ChartLineCumulativeStats;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineCumulativeLayoutResult {
  series: ChartLineCumulativeLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  baselineY: number;
  targetY: number | null;
  target: number | null;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineCumulativePoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineCumulativePoint).x) &&
    isFiniteNumber((p as ChartLineCumulativePoint).value)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineCumulativeDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_CUMULATIVE_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_CUMULATIVE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_CUMULATIVE_PALETTE.length
  ]!;
}

export function getLineCumulativeFinitePoints(
  points: readonly ChartLineCumulativePoint[],
): ChartLineCumulativePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Computes the running cumulative sum of a numeric series.
 *
 * Each output entry is the sum of every finite value at or before that
 * index, plus the optional `baseline`. Non-finite values are treated
 * as 0 (they don't reset the sum). Non-array input -> `[]`.
 */
export function computeRunningCumulative(
  values: readonly number[] | undefined | null,
  baseline: number = 0,
): number[] {
  if (!Array.isArray(values)) return [];
  const start = isFiniteNumber(baseline) ? baseline : 0;
  const out: number[] = [];
  let sum = start;
  for (const v of values) {
    if (isFiniteNumber(v)) sum += v;
    out.push(sum);
  }
  return out;
}

/**
 * Returns running cumulative points sorted by `x` ascending. Non-finite
 * samples are dropped. Each output entry carries `{index, x, value,
 * cumulative}` where `index` is the position in the ORIGINAL points
 * array.
 */
export function buildLineCumulativeRunningPoints(
  points: readonly ChartLineCumulativePoint[] | undefined | null,
  baseline: number = 0,
): ChartLineCumulativeRunningPoint[] {
  if (!Array.isArray(points)) return [];
  const indexed: { p: ChartLineCumulativePoint; original: number }[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    if (!isFinitePoint(p)) continue;
    indexed.push({ p, original: i });
  }
  indexed.sort((a, b) => a.p.x - b.p.x);
  const start = isFiniteNumber(baseline) ? baseline : 0;
  const out: ChartLineCumulativeRunningPoint[] = [];
  let sum = start;
  for (const { p, original } of indexed) {
    sum += p.value;
    out.push({
      index: original,
      x: p.x,
      value: p.value,
      cumulative: sum,
    });
  }
  return out;
}

/**
 * Computes per-series stats from a finite running-points array.
 * Tracks the first crossing index/x where `cumulative >= target`
 * (using linear interpolation in x when the crossing is strictly
 * inside a segment).
 */
export function computeLineCumulativeStats(
  running: readonly ChartLineCumulativeRunningPoint[],
  baseline: number,
  target?: number,
): ChartLineCumulativeStats {
  const start = isFiniteNumber(baseline) ? baseline : 0;
  if (running.length === 0) {
    return {
      finiteCount: 0,
      totalValue: 0,
      total: start,
      maxIncrement: 0,
      minIncrement: 0,
      baseline: start,
      reachedTarget: false,
      targetCrossingX: null,
      targetCrossingIndex: null,
      percentToTarget: 0,
    };
  }
  let totalValue = 0;
  let maxInc = -Infinity;
  let minInc = Infinity;
  for (const r of running) {
    totalValue += r.value;
    if (r.value > maxInc) maxInc = r.value;
    if (r.value < minInc) minInc = r.value;
  }
  if (maxInc === -Infinity) maxInc = 0;
  if (minInc === Infinity) minInc = 0;
  const total = start + totalValue;
  let reachedTarget = false;
  let targetCrossingX: number | null = null;
  let targetCrossingIndex: number | null = null;
  let percentToTarget = 0;
  if (isFiniteNumber(target)) {
    const targetSigned = target - start;
    percentToTarget =
      targetSigned === 0
        ? 1
        : Math.min(1, Math.max(0, totalValue / targetSigned));
    // Find the first index where cumulative crosses target.
    for (let i = 0; i < running.length; i += 1) {
      const r = running[i]!;
      if (r.cumulative >= target) {
        reachedTarget = true;
        targetCrossingIndex = r.index;
        if (i === 0) {
          targetCrossingX = r.x;
        } else {
          const prev = running[i - 1]!;
          if (prev.cumulative === r.cumulative || prev.cumulative >= target) {
            targetCrossingX = r.x;
          } else {
            const denom = r.cumulative - prev.cumulative;
            const t =
              denom === 0 ? 0 : (target - prev.cumulative) / denom;
            targetCrossingX = prev.x + (r.x - prev.x) * Math.min(1, Math.max(0, t));
          }
        }
        break;
      }
    }
  }
  return {
    finiteCount: running.length,
    totalValue,
    total,
    maxIncrement: maxInc,
    minIncrement: minInc,
    baseline: start,
    reachedTarget,
    targetCrossingX,
    targetCrossingIndex,
    percentToTarget,
  };
}

export interface ComputeLineCumulativeLayoutInput {
  series: readonly ChartLineCumulativeSeries[];
  target?: number;
  hiddenSeries?: ReadonlySet<string> | null;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineCumulativeLayout(
  input: ComputeLineCumulativeLayoutInput,
): ComputeLineCumulativeLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineCumulativeLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    baselineY: 0,
    targetY: null,
    target: isFiniteNumber(input.target) ? input.target : null,
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

  const target = isFiniteNumber(input.target) ? input.target : null;

  // Compute running points per series so we can pull bounds from the
  // cumulative trajectory (not the raw values).
  const intermediates: {
    s: ChartLineCumulativeSeries;
    originalIndex: number;
    running: ChartLineCumulativeRunningPoint[];
    baseline: number;
  }[] = [];
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const baseline = isFiniteNumber(s.baseline)
      ? s.baseline
      : DEFAULT_CHART_LINE_CUMULATIVE_BASELINE;
    const running = buildLineCumulativeRunningPoints(s.data ?? [], baseline);
    intermediates.push({ s, originalIndex: i, running, baseline });
    if (running.length > 0) {
      // Track cumulative range (line) and baseline level.
      if (baseline < yMin) yMin = baseline;
      if (baseline > yMax) yMax = baseline;
      for (const r of running) {
        if (r.x < xMin) xMin = r.x;
        if (r.x > xMax) xMax = r.x;
        if (r.cumulative < yMin) yMin = r.cumulative;
        if (r.cumulative > yMax) yMax = r.cumulative;
      }
      any = true;
    }
  }
  // Include the target line in the y range.
  if (target !== null) {
    if (target < yMin) yMin = target;
    if (target > yMax) yMax = target;
    any = true;
  }
  if (!any) {
    xMin = 0;
    xMax = 1;
    yMin = 0;
    yMax = 1;
  }
  if (yMin === Number.POSITIVE_INFINITY) {
    yMin = 0;
    yMax = 1;
  }
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

  const layoutSeries: ChartLineCumulativeLayoutSeries[] = [];
  let totalPoints = 0;
  for (const it of intermediates) {
    const s = it.s;
    const color = s.color ?? getLineCumulativeDefaultColor(it.originalIndex);
    const baseline = it.baseline;
    const baselineY = yToPx(baseline);
    const points: ChartLineCumulativeLayoutPoint[] = [];
    for (let j = 0; j < it.running.length; j += 1) {
      const r = it.running[j]!;
      const px = xToPx(r.x);
      const py = yToPx(r.cumulative);
      let incrementY: number;
      let incrementHeight: number;
      if (r.value >= 0) {
        incrementY = py;
        incrementHeight = Math.max(0, baselineY - py);
      } else {
        incrementY = baselineY;
        incrementHeight = Math.max(0, py - baselineY);
      }
      points.push({
        index: r.index,
        x: r.x,
        value: r.value,
        cumulative: r.cumulative,
        px,
        py,
        incrementY,
        incrementHeight,
      });
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    const stats = computeLineCumulativeStats(
      it.running,
      baseline,
      target ?? undefined,
    );
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: it.originalIndex,
      color,
      baseline,
      points,
      path,
      stats,
      finiteCount: points.length,
      totalCount: Array.isArray(s.data) ? s.data.length : 0,
    });
  }

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_CUMULATIVE_TICK_COUNT;
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

  // baselineY for the chart-level horizontal reference uses the
  // first series baseline (most charts have a single baseline); 0
  // when no series.
  const chartBaseline =
    layoutSeries.length > 0
      ? layoutSeries[0]!.baseline
      : DEFAULT_CHART_LINE_CUMULATIVE_BASELINE;
  const baselineY = yToPx(chartBaseline);
  const targetY = target !== null ? yToPx(target) : null;

  return {
    series: layoutSeries,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    baselineY,
    targetY,
    target,
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineCumulativeChart(
  series: readonly ChartLineCumulativeSeries[] | undefined | null,
  target?: number,
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
    const baseline = isFiniteNumber(s.baseline)
      ? s.baseline
      : DEFAULT_CHART_LINE_CUMULATIVE_BASELINE;
    const running = buildLineCumulativeRunningPoints(s.data ?? [], baseline);
    if (running.length === 0) continue;
    any = true;
    totalPoints += running.length;
    const stats = computeLineCumulativeStats(running, baseline, target);
    parts.push(
      `${s.label}: cumulative ${fmtV(stats.total)} from baseline ${fmtV(stats.baseline)}` +
        (isFiniteNumber(target)
          ? `, ${stats.reachedTarget ? 'reached target' : 'did not reach target'} ${fmtV(target)}`
          : ''),
    );
  }
  if (!any) return 'No data';
  return `Running cumulative chart across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineCumulativePointClick {
  series: ChartLineCumulativeLayoutSeries;
  point: ChartLineCumulativeLayoutPoint;
}

export interface ChartLineCumulativeProps {
  series: readonly ChartLineCumulativeSeries[];
  target?: number;
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
  incrementWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  incrementOpacity?: number;
  targetDashArray?: string;
  targetColor?: string;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showIncrements?: boolean;
  showBaseline?: boolean;
  showTarget?: boolean;
  showTargetLabel?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatPercent?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineCumulativePointClick) => void;
  style?: CSSProperties;
}

export const ChartLineCumulative = forwardRef(function ChartLineCumulative(
  {
    series,
    target,
    targetLabel = 'Target',
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_CUMULATIVE_WIDTH,
    height = DEFAULT_CHART_LINE_CUMULATIVE_HEIGHT,
    padding = DEFAULT_CHART_LINE_CUMULATIVE_PADDING,
    tickCount = DEFAULT_CHART_LINE_CUMULATIVE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CUMULATIVE_STROKE_WIDTH,
    incrementWidth = DEFAULT_CHART_LINE_CUMULATIVE_INCREMENT_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CUMULATIVE_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_CUMULATIVE_LINE_OPACITY,
    incrementOpacity = DEFAULT_CHART_LINE_CUMULATIVE_INCREMENT_OPACITY,
    targetDashArray = DEFAULT_CHART_LINE_CUMULATIVE_TARGET_DASH,
    targetColor = DEFAULT_CHART_LINE_CUMULATIVE_TARGET_COLOR,
    gridColor = DEFAULT_CHART_LINE_CUMULATIVE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CUMULATIVE_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showIncrements = true,
    showBaseline = true,
    showTarget = true,
    showTargetLabel = true,
    animate = true,
    className,
    ariaLabel = 'Running cumulative line chart',
    ariaDescription,
    formatValue,
    formatX,
    formatPercent,
    xLabel,
    yLabel,
    onPointClick,
    style,
  }: ChartLineCumulativeProps,
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
  const fmtPct = useCallback(
    (n: number) =>
      formatPercent ? formatPercent(n) : `${Math.round(n * 100)}%`,
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
      computeLineCumulativeLayout({
        series,
        ...(isFiniteNumber(target) ? { target } : {}),
        hiddenSeries: hidden,
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
      hidden,
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
    describeLineCumulativeChart(series, target, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineCumulativeSeries) => {
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
      data-section="chart-line-cumulative"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-target={layout.target !== null ? String(layout.target) : ''}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-cumulative-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-cumulative-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-cumulative-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-cumulative-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-cumulative-grid-line"
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
                  data-section="chart-line-cumulative-grid-line"
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

          {/* Increment bars under the line. */}
          {showIncrements ? (
            <g data-section="chart-line-cumulative-increments">
              {layout.series.flatMap((s) =>
                s.points
                  .filter((p) => p.value !== 0)
                  .map((p) => (
                    <rect
                      key={`inc-${s.id}-${p.index}`}
                      data-section="chart-line-cumulative-increment"
                      data-series-id={s.id}
                      data-point-index={p.index}
                      data-value={p.value}
                      data-increment-sign={p.value >= 0 ? 'positive' : 'negative'}
                      x={p.px - incrementWidth / 2}
                      y={p.incrementY}
                      width={incrementWidth}
                      height={p.incrementHeight}
                      fill={s.color}
                      fillOpacity={incrementOpacity}
                      stroke="none"
                    />
                  )),
              )}
            </g>
          ) : null}

          {showAxis ? (
            <g data-section="chart-line-cumulative-axes">
              <line
                data-section="chart-line-cumulative-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-cumulative-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-cumulative-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-cumulative-tick"
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
                        data-section="chart-line-cumulative-tick-label"
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
                <g data-section="chart-line-cumulative-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-cumulative-tick"
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
                        data-section="chart-line-cumulative-tick-label"
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
                  data-section="chart-line-cumulative-x-label"
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
                  data-section="chart-line-cumulative-y-label"
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

          {showBaseline ? (
            <line
              data-section="chart-line-cumulative-baseline"
              data-baseline-y={layout.baselineY}
              x1={padding}
              y1={layout.baselineY}
              x2={padding + layout.innerWidth}
              y2={layout.baselineY}
              stroke={axisColor}
              strokeWidth={1}
            />
          ) : null}

          {showTarget && layout.targetY !== null ? (
            <g data-section="chart-line-cumulative-target">
              <line
                data-section="chart-line-cumulative-target-line"
                data-target-value={layout.target ?? ''}
                role="graphics-symbol"
                aria-label={`${targetLabel}: ${fmtValue(layout.target as number)}`}
                x1={padding}
                y1={layout.targetY}
                x2={padding + layout.innerWidth}
                y2={layout.targetY}
                stroke={targetColor}
                strokeDasharray={targetDashArray}
                strokeWidth={1.5}
              />
              {showTargetLabel ? (
                <text
                  data-section="chart-line-cumulative-target-label"
                  data-target-value={layout.target ?? ''}
                  x={padding + layout.innerWidth - 6}
                  y={layout.targetY - 4}
                  textAnchor="end"
                  fontSize={10}
                  fill={targetColor}
                  style={{ pointerEvents: 'none' }}
                >
                  {targetLabel}: {fmtValue(layout.target as number)}
                </text>
              ) : null}
            </g>
          ) : null}

          {/* Series lines + dots */}
          <g data-section="chart-line-cumulative-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-cumulative-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-total={s.stats.total}
                  data-series-baseline={s.baseline}
                  data-series-percent-to-target={s.stats.percentToTarget}
                  data-series-reached-target={
                    s.stats.reachedTarget ? 'true' : 'false'
                  }
                  data-series-target-crossing-x={
                    s.stats.targetCrossingX === null
                      ? ''
                      : String(s.stats.targetCrossingX)
                  }
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-cumulative-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: cumulative line with ${s.finiteCount} points, total ${fmtValue(s.stats.total)}`}
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
                        const aria = `${s.label}: x=${fmtX(p.x)}, value=${fmtValue(p.value)}, cumulative=${fmtValue(p.cumulative)}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-cumulative-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-value={p.value}
                            data-cumulative={p.cumulative}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={s.color}
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 200);
          const ty = Math.min(Math.max(p.py - 64, 0), height - 96);
          return (
            <div
              data-section="chart-line-cumulative-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-cumulative-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-cumulative-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-cumulative-tooltip-value"
                className="text-slate-700"
              >
                value: {p.value >= 0 ? '+' : ''}
                {fmtValue(p.value)}
              </div>
              <div
                data-section="chart-line-cumulative-tooltip-cumulative"
                className="text-slate-800"
                style={{ fontWeight: 600 }}
              >
                cumulative: {fmtValue(p.cumulative)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-cumulative-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-cumulative-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-cumulative-legend-button"
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
                    data-section="chart-line-cumulative-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineCumulativeDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-cumulative-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-cumulative-legend-stats"
                      className="text-slate-500"
                    >
                      (total {fmtValue(visEntry.stats.total)}
                      {isFiniteNumber(target)
                        ? `, ${fmtPct(visEntry.stats.percentToTarget)}`
                        : ''}
                      )
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

ChartLineCumulative.displayName = 'ChartLineCumulative';
