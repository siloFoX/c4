import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_AREA_GRADIENT_WIDTH = 560;
export const DEFAULT_CHART_LINE_AREA_GRADIENT_HEIGHT = 320;
export const DEFAULT_CHART_LINE_AREA_GRADIENT_PADDING = 40;
export const DEFAULT_CHART_LINE_AREA_GRADIENT_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_AREA_GRADIENT_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_AREA_GRADIENT_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_AREA_GRADIENT_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_AREA_GRADIENT_TOP_OPACITY = 0.5;
export const DEFAULT_CHART_LINE_AREA_GRADIENT_BOTTOM_OPACITY = 0;
export const DEFAULT_CHART_LINE_AREA_GRADIENT_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_AREA_GRADIENT_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE = [
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

export interface ChartLineAreaGradientPoint {
  x: number;
  y: number;
}

export interface ChartLineAreaGradientSeries {
  id: string;
  label: string;
  data: readonly ChartLineAreaGradientPoint[];
  color?: string;
  fillColor?: string;
}

export interface ChartLineAreaGradientLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineAreaGradientLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  fillColor: string;
  points: ChartLineAreaGradientLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  linePath: string;
  areaPath: string;
}

export interface ComputeLineAreaGradientLayoutResult {
  series: ChartLineAreaGradientLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  baseline: number;
  baselineY: number;
  topY: number;
  innerWidth: number;
  innerHeight: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineAreaGradientPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineAreaGradientPoint).x) &&
    isFiniteNumber((p as ChartLineAreaGradientPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineAreaGradientDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_AREA_GRADIENT_PALETTE.length
  ]!;
}

export function getLineAreaGradientFinitePoints(
  points: readonly ChartLineAreaGradientPoint[],
): ChartLineAreaGradientPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Resolves the effective baseline.
 *
 *  - When `explicit` is finite, return it verbatim.
 *  - Otherwise return `bounds.yMin` (the floor of the visible data).
 *
 * Returning `bounds.yMin` (rather than 0) keeps the gradient anchored
 * to the bottom of the actual data range, which matches the canonical
 * "shaded area under the line" reading. Adopters who want a hard
 * floor at 0 (or any other value) pass it explicitly.
 */
export function resolveLineAreaGradientBaseline(
  bounds: { yMin: number; yMax: number },
  explicit?: number,
): number {
  if (isFiniteNumber(explicit)) return explicit;
  return bounds.yMin;
}

export function getLineAreaGradientBounds(
  series: readonly ChartLineAreaGradientSeries[],
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
    for (const p of getLineAreaGradientFinitePoints(s.data ?? [])) {
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

export function getLineAreaGradientTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_AREA_GRADIENT_TICK_COUNT),
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

/** `M x y L x y ...` central line builder. */
export function buildLineAreaGradientLinePath(
  points: ReadonlyArray<{ px: number; py: number }>,
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  let path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
  for (let i = 1; i < points.length; i += 1) {
    path += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.py)}`;
  }
  return path;
}

/**
 * Closed area path that traces the line from left to right then closes
 * along the baseline back to the first point:
 *
 *   M p[0]
 *   L p[1] ... L p[N-1]
 *   L p[N-1].x baselineY
 *   L p[0].x   baselineY
 *   Z
 *
 * Empty input -> `''`. Single point -> `M x baselineY L x y L x baselineY Z`
 * (a degenerate zero-width sliver; rendered for completeness).
 */
export function buildLineAreaGradientAreaPath(
  points: ReadonlyArray<{ px: number; py: number }>,
  baselineY: number,
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  const baseY = isFiniteNumber(baselineY) ? baselineY : 0;
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${fmt(p.px)} ${fmt(baseY)} L ${fmt(p.px)} ${fmt(p.py)} L ${fmt(p.px)} ${fmt(baseY)} Z`;
  }
  let path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
  for (let i = 1; i < points.length; i += 1) {
    path += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.py)}`;
  }
  const last = points[points.length - 1]!;
  const first = points[0]!;
  path += ` L ${fmt(last.px)} ${fmt(baseY)}`;
  path += ` L ${fmt(first.px)} ${fmt(baseY)}`;
  path += ' Z';
  return path;
}

export interface ComputeLineAreaGradientLayoutInput {
  series: readonly ChartLineAreaGradientSeries[];
  hidden?: readonly string[];
  baseline?: number;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineAreaGradientLayout(
  input: ComputeLineAreaGradientLayoutInput,
): ComputeLineAreaGradientLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineAreaGradientLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    baseline: 0,
    baselineY: padding + innerHeight,
    topY: padding,
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

  const bounds = getLineAreaGradientBounds(
    input.series,
    input.hidden,
    input.baseline,
  );
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

  const baseline = resolveLineAreaGradientBaseline(
    { yMin, yMax },
    input.baseline,
  );
  // Clamp baseline pixel to the inner plot area so the area path stays
  // visually meaningful even when the baseline is outside the y range.
  const baselineY = Math.min(
    Math.max(yToPx(baseline), padding),
    padding + innerHeight,
  );
  const topY = padding;

  const indexById = new Map(input.series.map((s, i) => [s.id, i]));
  const seriesOut: ChartLineAreaGradientLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineAreaGradientDefaultColor(seriesIndex);
    const fillColor = s.fillColor ?? color;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineAreaGradientLayoutPoint[] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]!;
      if (!isFinitePoint(p)) continue;
      points.push({
        index: i,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
      });
    }
    const linePath = buildLineAreaGradientLinePath(points);
    const areaPath = buildLineAreaGradientAreaPath(points, baselineY);
    return {
      id: s.id,
      label: s.label,
      index: seriesIndex,
      color,
      fillColor,
      points,
      finiteCount: points.length,
      totalCount: arr.length,
      linePath,
      areaPath,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_AREA_GRADIENT_TICK_COUNT;
  const xTicks = getLineAreaGradientTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineAreaGradientTicks(yMin, yMax, tickCount).map((t) => ({
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
    topY,
    innerWidth,
    innerHeight,
  };
}

export function describeLineAreaGradientChart(
  series: readonly ChartLineAreaGradientSeries[],
  hidden?: readonly string[],
  baseline?: number,
  formatValue?: (n: number) => string,
): string {
  const hiddenSet = new Set(hidden ?? []);
  const visible = (series ?? []).filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  let total = 0;
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (const s of visible) {
    for (const p of getLineAreaGradientFinitePoints(s.data ?? [])) {
      total += 1;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  }
  if (total === 0) return 'No data';
  const baselineStr = isFiniteNumber(baseline)
    ? `, baseline ${fmtV(baseline)}`
    : '';
  return `Line + gradient area chart with ${visible.length} series and ${total} points${baselineStr}. x range ${fmtV(xMin)} to ${fmtV(xMax)}, y range ${fmtV(yMin)} to ${fmtV(yMax)}.`;
}

export interface ChartLineAreaGradientPointClick {
  series: ChartLineAreaGradientLayoutSeries;
  point: ChartLineAreaGradientLayoutPoint;
}

export interface ChartLineAreaGradientSeriesToggle {
  series: ChartLineAreaGradientSeries;
  hidden: boolean;
}

export interface ChartLineAreaGradientProps {
  series: readonly ChartLineAreaGradientSeries[];
  baseline?: number;
  gradientTopOpacity?: number;
  gradientBottomOpacity?: number;
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
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineAreaGradientPointClick) => void;
  onSeriesToggle?: (info: ChartLineAreaGradientSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineAreaGradient = forwardRef(function ChartLineAreaGradient(
  {
    series,
    baseline,
    gradientTopOpacity = DEFAULT_CHART_LINE_AREA_GRADIENT_TOP_OPACITY,
    gradientBottomOpacity = DEFAULT_CHART_LINE_AREA_GRADIENT_BOTTOM_OPACITY,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_AREA_GRADIENT_WIDTH,
    height = DEFAULT_CHART_LINE_AREA_GRADIENT_HEIGHT,
    padding = DEFAULT_CHART_LINE_AREA_GRADIENT_PADDING,
    tickCount = DEFAULT_CHART_LINE_AREA_GRADIENT_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_AREA_GRADIENT_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_AREA_GRADIENT_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_AREA_GRADIENT_LINE_OPACITY,
    gridColor = DEFAULT_CHART_LINE_AREA_GRADIENT_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_AREA_GRADIENT_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showBaseline = false,
    animate = true,
    className,
    ariaLabel = 'Line and gradient area chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineAreaGradientProps,
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
      computeLineAreaGradientLayout({
        series,
        hidden: effectiveHidden,
        ...(baseline !== undefined ? { baseline } : {}),
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
    describeLineAreaGradientChart(
      series,
      effectiveHidden,
      baseline,
      fmtValue,
    );
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);

  const toggleSeries = useCallback(
    (s: ChartLineAreaGradientSeries) => {
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
      data-section="chart-line-area-gradient"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-baseline={layout.baseline}
      data-baseline-y={layout.baselineY}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-area-gradient-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-area-gradient-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-area-gradient-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            {layout.series.map((s) => (
              <linearGradient
                key={`grad-${s.id}`}
                id={`${reactId}-${s.id}-grad`}
                data-section="chart-line-area-gradient-gradient-def"
                data-series-id={s.id}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={layout.topY}
                x2={0}
                y2={layout.baselineY}
              >
                <stop
                  offset="0%"
                  stopColor={s.fillColor}
                  stopOpacity={gradientTopOpacity}
                />
                <stop
                  offset="100%"
                  stopColor={s.fillColor}
                  stopOpacity={gradientBottomOpacity}
                />
              </linearGradient>
            ))}
          </defs>

          {showGrid ? (
            <g data-section="chart-line-area-gradient-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-area-gradient-grid-line"
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
                  data-section="chart-line-area-gradient-grid-line"
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
            <g data-section="chart-line-area-gradient-axes">
              <line
                data-section="chart-line-area-gradient-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-area-gradient-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-area-gradient-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-area-gradient-tick"
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
                        data-section="chart-line-area-gradient-tick-label"
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
                <g data-section="chart-line-area-gradient-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-area-gradient-tick"
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
                        data-section="chart-line-area-gradient-tick-label"
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
                  data-section="chart-line-area-gradient-x-label"
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
                  data-section="chart-line-area-gradient-y-label"
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
              data-section="chart-line-area-gradient-baseline"
              data-baseline-value={layout.baseline}
              x1={padding}
              y1={layout.baselineY}
              x2={padding + layout.innerWidth}
              y2={layout.baselineY}
              stroke={axisColor}
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ) : null}

          <g data-section="chart-line-area-gradient-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              const areaDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : 1;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-area-gradient-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-fill-color={s.fillColor}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-area-gradient-area"
                    data-series-id={s.id}
                    d={s.areaPath}
                    fill={`url(#${reactId}-${s.id}-grad)`}
                    fillOpacity={areaDim}
                    stroke="none"
                  />
                  <path
                    data-section="chart-line-area-gradient-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points`}
                    d={s.linePath}
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
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-area-gradient-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.py}
                            r={isHovered ? dotRadius + 1 : dotRadius}
                            fill={s.color}
                            fillOpacity={dotOpacity}
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 160);
          const ty = Math.min(Math.max(p.py - 36, 0), height - 48);
          return (
            <div
              data-section="chart-line-area-gradient-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-area-gradient-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-area-gradient-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-area-gradient-tooltip-y"
                className="text-slate-600"
              >
                y: {fmtValue(p.y)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-area-gradient-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineAreaGradientDefaultColor(i);
            const swatchFill = s.fillColor ?? color;
            return (
              <li
                key={s.id}
                data-section="chart-line-area-gradient-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-area-gradient-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-area-gradient-legend-swatch"
                    className="relative inline-block h-3 w-4 overflow-hidden"
                  >
                    <span
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(to bottom, ${swatchFill}${Math.round(
                          gradientTopOpacity * 255,
                        )
                          .toString(16)
                          .padStart(2, '0')}, ${swatchFill}${Math.round(
                          gradientBottomOpacity * 255,
                        )
                          .toString(16)
                          .padStart(2, '0')})`,
                      }}
                    />
                    <span
                      className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2"
                      style={{ backgroundColor: color }}
                    />
                  </span>
                  <span data-section="chart-line-area-gradient-legend-label">
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineAreaGradient.displayName = 'ChartLineAreaGradient';
