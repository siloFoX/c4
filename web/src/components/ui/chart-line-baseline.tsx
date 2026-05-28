import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_BASELINE_WIDTH = 560;
export const DEFAULT_CHART_LINE_BASELINE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_BASELINE_PADDING = 40;
export const DEFAULT_CHART_LINE_BASELINE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_BASELINE_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_BASELINE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_BASELINE_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_BASELINE_BASELINE_VALUE = 0;
export const DEFAULT_CHART_LINE_BASELINE_BASELINE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_BASELINE_BASELINE_DASH = '4 3';
export const DEFAULT_CHART_LINE_BASELINE_BASELINE_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_BASELINE_ABOVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_BASELINE_BELOW_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_BASELINE_EQUAL_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_BASELINE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_BASELINE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_BASELINE_PALETTE = [
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#dc2626',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#65a30d',
  '#7c3aed',
  '#0d9488',
];

export type ChartLineBaselineDirection = 'above' | 'below' | 'equal';

export interface ChartLineBaselinePoint {
  x: number;
  y: number;
}

export interface ChartLineBaselineSeries {
  id: string;
  label: string;
  data: readonly ChartLineBaselinePoint[];
  color?: string;
}

export interface ChartLineBaselineLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  delta: number;
  direction: ChartLineBaselineDirection;
}

export interface ChartLineBaselineLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineBaselineLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  aboveCount: number;
  belowCount: number;
  equalCount: number;
  path: string;
}

export interface ComputeLineBaselineLayoutResult {
  series: ChartLineBaselineLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  baseline: number;
  baselineY: number;
  innerWidth: number;
  innerHeight: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineBaselinePoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineBaselinePoint).x) &&
    isFiniteNumber((p as ChartLineBaselinePoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineBaselineDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_BASELINE_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_BASELINE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_BASELINE_PALETTE.length
  ]!;
}

export function getLineBaselineFinitePoints(
  points: readonly ChartLineBaselinePoint[],
): ChartLineBaselinePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Classifies a point relative to a baseline value and computes the
 * signed delta `y - baseline`.
 *
 *  - `'above'` when `y > baseline`.
 *  - `'below'` when `y < baseline`.
 *  - `'equal'` when `y === baseline` (within `epsilon`).
 *
 * Non-finite `y` or `baseline` collapse `delta` to 0 and return
 * `'equal'`. `epsilon` widens the equality band so adopters who want
 * "essentially equal" can set a noise tolerance.
 */
export function classifyLineBaselinePoint(
  y: number,
  baseline: number,
  epsilon: number = 0,
): { delta: number; direction: ChartLineBaselineDirection } {
  if (!isFiniteNumber(y) || !isFiniteNumber(baseline)) {
    return { delta: 0, direction: 'equal' };
  }
  const eps = isFiniteNumber(epsilon) && epsilon > 0 ? epsilon : 0;
  const delta = y - baseline;
  if (delta > eps) return { delta, direction: 'above' };
  if (delta < -eps) return { delta, direction: 'below' };
  return { delta, direction: 'equal' };
}

/**
 * Returns the colour to fill a dot whose direction relative to the
 * baseline is `direction`. Lets adopters tint above-baseline points
 * green and below-baseline points red while equal stays neutral. The
 * series fallback colour is used when none of the direction colours
 * apply (e.g. equal direction + no equal colour provided).
 */
export function pickLineBaselineDotColor(
  direction: ChartLineBaselineDirection,
  fallback: string,
  aboveColor: string,
  belowColor: string,
  equalColor: string,
): string {
  if (direction === 'above') return aboveColor || fallback;
  if (direction === 'below') return belowColor || fallback;
  return equalColor || fallback;
}

export function getLineBaselineBounds(
  series: readonly ChartLineBaselineSeries[],
  hidden?: readonly string[],
  baseline?: number,
): { xMin: number; xMax: number; yMin: number; yMax: number } {
  const hiddenSet = new Set(hidden ?? []);
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of series) {
    if (!s || typeof s.id !== 'string') continue;
    if (hiddenSet.has(s.id)) continue;
    for (const p of getLineBaselineFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  }
  if (isFiniteNumber(baseline)) {
    if (baseline < yMin) yMin = baseline;
    if (baseline > yMax) yMax = baseline;
    any = true;
  }
  if (!any) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (yMin === yMax) {
    yMin -= 0.5;
    yMax += 0.5;
  }
  return { xMin, xMax, yMin, yMax };
}

export function getLineBaselineTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_BASELINE_TICK_COUNT),
  );
  if (min === max) return [{ value: min, position: 0 }];
  const step = (max - min) / (n - 1);
  const out: { value: number; position: number }[] = [];
  for (let i = 0; i < n; i += 1) {
    const value = min + step * i;
    const position = (value - min) / (max - min);
    out.push({ value, position });
  }
  return out;
}

export function buildLineBaselinePath(
  points: ReadonlyArray<{ px: number; py: number }>,
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  let path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
  for (let i = 1; i < points.length; i += 1) {
    path += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.py)}`;
  }
  return path;
}

export interface ComputeLineBaselineLayoutInput {
  series: readonly ChartLineBaselineSeries[];
  hidden?: readonly string[];
  baseline?: number;
  epsilon?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineBaselineLayout(
  input: ComputeLineBaselineLayoutInput,
): ComputeLineBaselineLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const baseline = isFiniteNumber(input.baseline)
    ? input.baseline
    : DEFAULT_CHART_LINE_BASELINE_BASELINE_VALUE;
  const epsilon = isFiniteNumber(input.epsilon) ? input.epsilon : 0;

  const empty: ComputeLineBaselineLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    baseline,
    baselineY: padding + innerHeight,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.series || input.series.length === 0) return empty;

  const hiddenSet = new Set(input.hidden ?? []);
  const visible = input.series.filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0) return empty;

  const bounds = getLineBaselineBounds(input.series, input.hidden, baseline);
  let xMin = isFiniteNumber(input.xMin) ? input.xMin : bounds.xMin;
  let xMax = isFiniteNumber(input.xMax) ? input.xMax : bounds.xMax;
  let yMin = isFiniteNumber(input.yMin) ? input.yMin : bounds.yMin;
  let yMax = isFiniteNumber(input.yMax) ? input.yMax : bounds.yMax;
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
  const baselineY = Math.min(
    Math.max(yToPx(baseline), padding),
    padding + innerHeight,
  );

  const indexById = new Map(input.series.map((s, i) => [s.id, i]));
  const seriesOut: ChartLineBaselineLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineBaselineDefaultColor(seriesIndex);
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineBaselineLayoutPoint[] = [];
    let aboveCount = 0;
    let belowCount = 0;
    let equalCount = 0;
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]!;
      if (!isFinitePoint(p)) continue;
      const c = classifyLineBaselinePoint(p.y, baseline, epsilon);
      if (c.direction === 'above') aboveCount += 1;
      else if (c.direction === 'below') belowCount += 1;
      else equalCount += 1;
      points.push({
        index: i,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        delta: c.delta,
        direction: c.direction,
      });
    }
    const path = buildLineBaselinePath(points);
    return {
      id: s.id,
      label: s.label,
      index: seriesIndex,
      color,
      points,
      finiteCount: points.length,
      totalCount: arr.length,
      aboveCount,
      belowCount,
      equalCount,
      path,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_BASELINE_TICK_COUNT;
  const xTicks = getLineBaselineTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineBaselineTicks(yMin, yMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + innerHeight - t.position * innerHeight,
  }));

  return {
    series: seriesOut,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    baseline,
    baselineY,
    innerWidth,
    innerHeight,
  };
}

export function describeLineBaselineChart(
  series: readonly ChartLineBaselineSeries[],
  baseline: number,
  hidden?: readonly string[],
  formatValue?: (n: number) => string,
): string {
  const hiddenSet = new Set(hidden ?? []);
  const visible = (series ?? []).filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  let total = 0;
  let above = 0;
  let below = 0;
  let equal = 0;
  for (const s of visible) {
    for (const p of getLineBaselineFinitePoints(s.data ?? [])) {
      total += 1;
      const c = classifyLineBaselinePoint(p.y, baseline);
      if (c.direction === 'above') above += 1;
      else if (c.direction === 'below') below += 1;
      else equal += 1;
    }
  }
  if (total === 0) return 'No data';
  return `Line chart with adjustable baseline at ${fmtV(baseline)}: ${visible.length} series, ${total} points (${above} above, ${below} below, ${equal} equal).`;
}

export interface ChartLineBaselinePointClick {
  series: ChartLineBaselineLayoutSeries;
  point: ChartLineBaselineLayoutPoint;
}

export interface ChartLineBaselineSeriesToggle {
  series: ChartLineBaselineSeries;
  hidden: boolean;
}

export interface ChartLineBaselineProps {
  series: readonly ChartLineBaselineSeries[];
  baseline?: number;
  baselineLabel?: string;
  baselineColor?: string;
  baselineDash?: string;
  baselineWidth?: number;
  aboveColor?: string;
  belowColor?: string;
  equalColor?: string;
  colorDotsByDirection?: boolean;
  epsilon?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  tickCount?: number;
  strokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showBaseline?: boolean;
  showBaselineLabel?: boolean;
  showDeltaInTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatDelta?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineBaselinePointClick) => void;
  onSeriesToggle?: (info: ChartLineBaselineSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineBaseline = forwardRef(function ChartLineBaseline(
  {
    series = [],
    baseline = DEFAULT_CHART_LINE_BASELINE_BASELINE_VALUE,
    baselineLabel,
    baselineColor = DEFAULT_CHART_LINE_BASELINE_BASELINE_COLOR,
    baselineDash = DEFAULT_CHART_LINE_BASELINE_BASELINE_DASH,
    baselineWidth = DEFAULT_CHART_LINE_BASELINE_BASELINE_WIDTH,
    aboveColor = DEFAULT_CHART_LINE_BASELINE_ABOVE_COLOR,
    belowColor = DEFAULT_CHART_LINE_BASELINE_BELOW_COLOR,
    equalColor = DEFAULT_CHART_LINE_BASELINE_EQUAL_COLOR,
    colorDotsByDirection = true,
    epsilon = 0,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_BASELINE_WIDTH,
    height = DEFAULT_CHART_LINE_BASELINE_HEIGHT,
    padding = DEFAULT_CHART_LINE_BASELINE_PADDING,
    tickCount = DEFAULT_CHART_LINE_BASELINE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_BASELINE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_BASELINE_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_BASELINE_LINE_OPACITY,
    gridColor = DEFAULT_CHART_LINE_BASELINE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_BASELINE_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showBaseline = true,
    showBaselineLabel = true,
    showDeltaInTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with adjustable baseline',
    ariaDescription,
    formatValue,
    formatX,
    formatDelta,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineBaselineProps,
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
    (n: number) => {
      if (formatDelta) return formatDelta(n);
      const sign = n > 0 ? '+' : n < 0 ? '' : '';
      return `${sign}${fmtValue(n)}`;
    },
    [formatDelta, fmtValue],
  );

  const [internalHidden, setInternalHidden] = useState<string[]>(
    Array.from(defaultHiddenSeries ?? []),
  );
  const controlledHidden = hiddenSeries !== undefined;
  const effectiveHidden = controlledHidden
    ? Array.from(hiddenSeries ?? [])
    : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineBaselineLayout({
        series,
        hidden: effectiveHidden,
        baseline,
        epsilon,
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
      effectiveHidden,
      baseline,
      epsilon,
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
    describeLineBaselineChart(series, baseline, effectiveHidden, fmtValue);
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);
  const totalAbove = layout.series.reduce((a, s) => a + s.aboveCount, 0);
  const totalBelow = layout.series.reduce((a, s) => a + s.belowCount, 0);
  const totalEqual = layout.series.reduce((a, s) => a + s.equalCount, 0);

  const toggleSeries = useCallback(
    (s: ChartLineBaselineSeries) => {
      const isHidden = effectiveHidden.includes(s.id);
      const next = isHidden
        ? effectiveHidden.filter((id) => id !== s.id)
        : [...effectiveHidden, s.id];
      if (!controlledHidden) setInternalHidden(next);
      if (onHiddenSeriesChange) onHiddenSeriesChange(next);
      if (onSeriesToggle) onSeriesToggle({ series: s, hidden: !isHidden });
    },
    [effectiveHidden, controlledHidden, onHiddenSeriesChange, onSeriesToggle],
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
      data-section="chart-line-baseline"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-baseline={baseline}
      data-baseline-y={layout.baselineY}
      data-above-count={totalAbove}
      data-below-count={totalBelow}
      data-equal-count={totalEqual}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-baseline-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-baseline-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-baseline-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-baseline-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-baseline-grid-line"
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
                  data-section="chart-line-baseline-grid-line"
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

          {showAxis ? (
            <g data-section="chart-line-baseline-axes">
              <line
                data-section="chart-line-baseline-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-baseline-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-baseline-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-baseline-tick"
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
                        data-section="chart-line-baseline-tick-label"
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
                <g data-section="chart-line-baseline-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-baseline-tick"
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
                        data-section="chart-line-baseline-tick-label"
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
                  data-section="chart-line-baseline-x-label"
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
                  data-section="chart-line-baseline-y-label"
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
            <g data-section="chart-line-baseline-reference">
              <line
                data-section="chart-line-baseline-reference-line"
                data-baseline-value={baseline}
                data-baseline-y={layout.baselineY}
                role="graphics-symbol"
                tabIndex={0}
                aria-label={`Baseline at ${fmtValue(baseline)}${baselineLabel ? `: ${baselineLabel}` : ''}`}
                x1={padding}
                y1={layout.baselineY}
                x2={padding + layout.innerWidth}
                y2={layout.baselineY}
                stroke={baselineColor}
                strokeWidth={baselineWidth}
                strokeDasharray={baselineDash || undefined}
              />
              {showBaselineLabel && baselineLabel ? (
                <text
                  data-section="chart-line-baseline-reference-label"
                  data-baseline-value={baseline}
                  x={padding + layout.innerWidth - 4}
                  y={layout.baselineY - 4}
                  textAnchor="end"
                  fontSize={10}
                  fill={baselineColor}
                  style={{ fontWeight: 600 }}
                >
                  {baselineLabel} ({fmtValue(baseline)})
                </text>
              ) : null}
            </g>
          ) : null}

          <g data-section="chart-line-baseline-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-baseline-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-above-count={s.aboveCount}
                  data-series-below-count={s.belowCount}
                  data-series-equal-count={s.equalCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-baseline-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points`}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={seriesDim}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots
                    ? s.points.map((p) => {
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const dotOpacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const dotFill = colorDotsByDirection
                          ? pickLineBaselineDotColor(
                              p.direction,
                              s.color,
                              aboveColor,
                              belowColor,
                              equalColor,
                            )
                          : s.color;
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}, ${p.direction} baseline by ${fmtDelta(p.delta)}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-baseline-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-delta={p.delta}
                            data-direction={p.direction}
                            data-dot-color={dotFill}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={dotFill}
                            fillOpacity={dotOpacity}
                            stroke={dotFill}
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
          const ty = Math.min(Math.max(p.py - 56, 0), height - 72);
          const directionColor = pickLineBaselineDotColor(
            p.direction,
            s.color,
            aboveColor,
            belowColor,
            equalColor,
          );
          return (
            <div
              data-section="chart-line-baseline-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              data-direction={p.direction}
              className="pointer-events-none absolute z-10 min-w-[180px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-baseline-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-baseline-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-baseline-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              {showDeltaInTooltip ? (
                <div
                  data-section="chart-line-baseline-tooltip-delta"
                  style={{ color: directionColor, fontWeight: 600 }}
                >
                  {p.direction === 'above'
                    ? '+'
                    : p.direction === 'below'
                      ? '-'
                      : '='}{' '}
                  {fmtDelta(p.delta)} vs {fmtValue(baseline)}
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-baseline-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineBaselineDefaultColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-line-baseline-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-baseline-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-baseline-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: color }}
                  />
                  <span data-section="chart-line-baseline-legend-label">
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
          {colorDotsByDirection ? (
            <>
              <li
                data-section="chart-line-baseline-legend-direction"
                data-direction="above"
              >
                <span className="flex items-center gap-1">
                  <span
                    data-section="chart-line-baseline-legend-direction-swatch"
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: aboveColor }}
                  />
                  <span data-section="chart-line-baseline-legend-direction-label">
                    above
                  </span>
                </span>
              </li>
              <li
                data-section="chart-line-baseline-legend-direction"
                data-direction="below"
              >
                <span className="flex items-center gap-1">
                  <span
                    data-section="chart-line-baseline-legend-direction-swatch"
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: belowColor }}
                  />
                  <span data-section="chart-line-baseline-legend-direction-label">
                    below
                  </span>
                </span>
              </li>
            </>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineBaseline.displayName = 'ChartLineBaseline';
