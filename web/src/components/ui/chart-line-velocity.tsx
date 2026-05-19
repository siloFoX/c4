import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_VELOCITY_WIDTH = 560;
export const DEFAULT_CHART_LINE_VELOCITY_HEIGHT = 320;
export const DEFAULT_CHART_LINE_VELOCITY_PADDING = 40;
export const DEFAULT_CHART_LINE_VELOCITY_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_VELOCITY_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_VELOCITY_DOT_RADIUS = 2.5;
export const DEFAULT_CHART_LINE_VELOCITY_ARROW_SIZE = 8;
export const DEFAULT_CHART_LINE_VELOCITY_ARROW_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_VELOCITY_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_VELOCITY_ARROW_OPACITY = 0.85;
export const DEFAULT_CHART_LINE_VELOCITY_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_VELOCITY_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_VELOCITY_ZERO_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_VELOCITY_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_VELOCITY_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_VELOCITY_PALETTE = [
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

export type ChartLineVelocityArrowMode = 'sign' | 'tangent';
export const DEFAULT_CHART_LINE_VELOCITY_ARROW_MODE: ChartLineVelocityArrowMode =
  'tangent';
export const ALL_CHART_LINE_VELOCITY_ARROW_MODES: readonly ChartLineVelocityArrowMode[] =
  ['sign', 'tangent'];

export type ChartLineVelocityDirection = 'up' | 'down' | 'right';

export interface ChartLineVelocityPoint {
  x: number;
  y: number;
}

export interface ChartLineVelocitySeries {
  id: string;
  label: string;
  data: readonly ChartLineVelocityPoint[];
  color?: string;
  positiveColor?: string;
  negativeColor?: string;
  zeroColor?: string;
  arrowMode?: ChartLineVelocityArrowMode;
}

export interface ChartLineVelocityVelocity {
  dx: number;
  dy: number;
  magnitude: number;
  angle: number;
  direction: ChartLineVelocityDirection;
}

export interface ChartLineVelocityLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  velocity: ChartLineVelocityVelocity | null;
  arrowAngle: number | null;
  arrowPath: string;
  arrowColor: string;
}

export interface ChartLineVelocityStats {
  finiteCount: number;
  upCount: number;
  downCount: number;
  flatCount: number;
  maxMagnitude: number;
  meanMagnitude: number;
}

export interface ChartLineVelocityLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  positiveColor: string;
  negativeColor: string;
  zeroColor: string;
  arrowMode: ChartLineVelocityArrowMode;
  points: ChartLineVelocityLayoutPoint[];
  path: string;
  stats: ChartLineVelocityStats;
  finiteCount: number;
  totalCount: number;
}

export interface ComputeLineVelocityLayoutResult {
  series: ChartLineVelocityLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineVelocityPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineVelocityPoint).x) &&
    isFiniteNumber((p as ChartLineVelocityPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineVelocityDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_VELOCITY_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_VELOCITY_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_VELOCITY_PALETTE.length
  ]!;
}

export function getLineVelocityFinitePoints(
  points: readonly ChartLineVelocityPoint[],
): ChartLineVelocityPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Computes the velocity between two consecutive points. Returns
 * `null` on non-finite inputs.
 *
 * - `dx = curr.x - prev.x`, `dy = curr.y - prev.y`.
 * - `magnitude = sqrt(dx^2 + dy^2)`.
 * - `angle` (radians) is from the previous point toward the current
 *   point in DATA-space (math convention: 0 is +x, +pi/2 is +y).
 * - `direction` reduces the y delta to an up/down/right ticker.
 *   When `dy > 0` -> `'up'`, `dy < 0` -> `'down'`, `dy === 0` ->
 *   `'right'`.
 */
export function computeVelocity(
  prev: ChartLineVelocityPoint | undefined | null,
  curr: ChartLineVelocityPoint | undefined | null,
): ChartLineVelocityVelocity | null {
  if (!prev || !curr) return null;
  if (!isFinitePoint(prev) || !isFinitePoint(curr)) return null;
  const dx = curr.x - prev.x;
  const dy = curr.y - prev.y;
  const magnitude = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const direction: ChartLineVelocityDirection =
    dy > 0 ? 'up' : dy < 0 ? 'down' : 'right';
  return { dx, dy, magnitude, angle, direction };
}

/**
 * Builds an SVG `d` string for a chevron arrow head whose **tip**
 * sits at `(tipX, tipY)` and points along `angleRadians`. The arrow
 * is rendered as two short stroke segments (no fill required), each
 * of length `size`, at +/- `wingAngle` (default `150 deg`) from the
 * reverse direction.
 *
 * Non-finite or `size <= 0` returns `''`.
 *
 * Note: in SVG pixel space the y axis is inverted (down is positive
 * y). Callers that pass a DATA-space angle should negate the angle
 * (`-angle`) so an "upward" data direction renders as an upward
 * (visually) arrow.
 */
export function buildLineVelocityArrowPath(
  tipX: number,
  tipY: number,
  angleRadians: number,
  size: number,
  wingDegrees: number = 150,
): string {
  if (
    !isFiniteNumber(tipX) ||
    !isFiniteNumber(tipY) ||
    !isFiniteNumber(angleRadians) ||
    !isFiniteNumber(size)
  ) {
    return '';
  }
  if (size <= 0) return '';
  const wing = (wingDegrees * Math.PI) / 180;
  const a1 = angleRadians + Math.PI - wing;
  const a2 = angleRadians + Math.PI + wing;
  const w1x = tipX + size * Math.cos(a1);
  const w1y = tipY + size * Math.sin(a1);
  const w2x = tipX + size * Math.cos(a2);
  const w2y = tipY + size * Math.sin(a2);
  return `M ${fmt(w1x)} ${fmt(w1y)} L ${fmt(tipX)} ${fmt(tipY)} L ${fmt(w2x)} ${fmt(w2y)}`;
}

function classifyDirection(
  velocity: ChartLineVelocityVelocity | null,
): ChartLineVelocityDirection {
  return velocity ? velocity.direction : 'right';
}

export interface ComputeLineVelocityLayoutInput {
  series: readonly ChartLineVelocitySeries[];
  arrowMode?: ChartLineVelocityArrowMode;
  arrowSize?: number;
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

export function computeLineVelocityLayout(
  input: ComputeLineVelocityLayoutInput,
): ComputeLineVelocityLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const empty: ComputeLineVelocityLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
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
  const defaultArrowMode =
    input.arrowMode ?? DEFAULT_CHART_LINE_VELOCITY_ARROW_MODE;
  const arrowSize = isFiniteNumber(input.arrowSize)
    ? input.arrowSize
    : DEFAULT_CHART_LINE_VELOCITY_ARROW_SIZE;

  // Bounds.
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of visible) {
    for (const p of getLineVelocityFinitePoints(s.data ?? [])) {
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

  const layoutSeries: ChartLineVelocityLayoutSeries[] = [];
  let totalPoints = 0;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const color = s.color ?? getLineVelocityDefaultColor(i);
    const positiveColor =
      s.positiveColor ?? DEFAULT_CHART_LINE_VELOCITY_POSITIVE_COLOR;
    const negativeColor =
      s.negativeColor ?? DEFAULT_CHART_LINE_VELOCITY_NEGATIVE_COLOR;
    const zeroColor =
      s.zeroColor ?? DEFAULT_CHART_LINE_VELOCITY_ZERO_COLOR;
    const arrowMode = s.arrowMode ?? defaultArrowMode;
    const arr = Array.isArray(s.data) ? s.data : [];
    const finite: { p: ChartLineVelocityPoint; original: number }[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      finite.push({ p, original: j });
    }
    // Walk sequentially (preserving original order) so the velocity is
    // computed against the previous FINITE neighbour.
    const points: ChartLineVelocityLayoutPoint[] = [];
    let prev: ChartLineVelocityPoint | null = null;
    let upCount = 0;
    let downCount = 0;
    let flatCount = 0;
    let totalMag = 0;
    let maxMag = 0;
    for (let k = 0; k < finite.length; k += 1) {
      const { p, original } = finite[k]!;
      const velocity = prev ? computeVelocity(prev, p) : null;
      if (velocity) {
        if (velocity.direction === 'up') upCount += 1;
        else if (velocity.direction === 'down') downCount += 1;
        else flatCount += 1;
        totalMag += velocity.magnitude;
        if (velocity.magnitude > maxMag) maxMag = velocity.magnitude;
      }
      const px = xToPx(p.x);
      const py = yToPx(p.y);
      // Arrow direction: 'sign' mode uses straight up / down / right;
      // 'tangent' mode uses the segment angle in pixel space (so it
      // matches the visual slope of the line).
      let pxAngle: number | null = null;
      if (velocity) {
        if (arrowMode === 'sign') {
          pxAngle =
            velocity.direction === 'up'
              ? -Math.PI / 2 // upward visually
              : velocity.direction === 'down'
                ? Math.PI / 2 // downward visually
                : 0; // rightward
        } else {
          // tangent: from prev pixel to current pixel.
          const prevPx = xToPx(prev!.x);
          const prevPy = yToPx(prev!.y);
          const dxp = px - prevPx;
          const dyp = py - prevPy;
          if (dxp === 0 && dyp === 0) {
            pxAngle = 0;
          } else {
            pxAngle = Math.atan2(dyp, dxp);
          }
        }
      }
      const direction = classifyDirection(velocity);
      const arrowColor =
        direction === 'up'
          ? positiveColor
          : direction === 'down'
            ? negativeColor
            : zeroColor;
      const arrowPath =
        pxAngle !== null
          ? buildLineVelocityArrowPath(px, py, pxAngle, arrowSize)
          : '';
      points.push({
        index: original,
        x: p.x,
        y: p.y,
        px,
        py,
        velocity,
        arrowAngle: pxAngle,
        arrowPath,
        arrowColor,
      });
      prev = p;
    }
    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    const denom = upCount + downCount + flatCount;
    const stats: ChartLineVelocityStats = {
      finiteCount: points.length,
      upCount,
      downCount,
      flatCount,
      maxMagnitude: maxMag,
      meanMagnitude: denom === 0 ? 0 : totalMag / denom,
    };
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: i,
      color,
      positiveColor,
      negativeColor,
      zeroColor,
      arrowMode,
      points,
      path,
      stats,
      finiteCount: points.length,
      totalCount: arr.length,
    });
  }

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_VELOCITY_TICK_COUNT;
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
    innerWidth,
    innerHeight,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineVelocityChart(
  series: readonly ChartLineVelocitySeries[] | undefined | null,
  arrowMode: ChartLineVelocityArrowMode = DEFAULT_CHART_LINE_VELOCITY_ARROW_MODE,
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
    const finite = getLineVelocityFinitePoints(s.data ?? []);
    if (finite.length === 0) continue;
    any = true;
    totalPoints += finite.length;
    let up = 0;
    let down = 0;
    let flat = 0;
    let max = 0;
    let total = 0;
    for (let i = 1; i < finite.length; i += 1) {
      const v = computeVelocity(finite[i - 1]!, finite[i]!);
      if (!v) continue;
      if (v.direction === 'up') up += 1;
      else if (v.direction === 'down') down += 1;
      else flat += 1;
      total += v.magnitude;
      if (v.magnitude > max) max = v.magnitude;
    }
    const denom = up + down + flat;
    const mean = denom === 0 ? 0 : total / denom;
    parts.push(
      `${s.label}: ${up} up, ${down} down, ${flat} flat, max |v| ${fmtV(max)}, mean |v| ${fmtV(mean)}`,
    );
  }
  if (!any) return 'No data';
  return `Velocity chart (${arrowMode} arrows) across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineVelocityPointClick {
  series: ChartLineVelocityLayoutSeries;
  point: ChartLineVelocityLayoutPoint;
}

export interface ChartLineVelocityProps {
  series: readonly ChartLineVelocitySeries[];
  arrowMode?: ChartLineVelocityArrowMode;
  arrowSize?: number;
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
  arrowStrokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  arrowOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showArrows?: boolean;
  showLine?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatMagnitude?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineVelocityPointClick) => void;
  style?: CSSProperties;
}

export const ChartLineVelocity = forwardRef(function ChartLineVelocity(
  {
    series,
    arrowMode = DEFAULT_CHART_LINE_VELOCITY_ARROW_MODE,
    arrowSize = DEFAULT_CHART_LINE_VELOCITY_ARROW_SIZE,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_VELOCITY_WIDTH,
    height = DEFAULT_CHART_LINE_VELOCITY_HEIGHT,
    padding = DEFAULT_CHART_LINE_VELOCITY_PADDING,
    tickCount = DEFAULT_CHART_LINE_VELOCITY_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_VELOCITY_STROKE_WIDTH,
    arrowStrokeWidth = DEFAULT_CHART_LINE_VELOCITY_ARROW_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_VELOCITY_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_VELOCITY_LINE_OPACITY,
    arrowOpacity = DEFAULT_CHART_LINE_VELOCITY_ARROW_OPACITY,
    gridColor = DEFAULT_CHART_LINE_VELOCITY_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_VELOCITY_AXIS_COLOR,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showArrows = true,
    showLine = true,
    animate = true,
    className,
    ariaLabel = 'Velocity line chart with arrow markers',
    ariaDescription,
    formatValue,
    formatX,
    formatMagnitude,
    xLabel,
    yLabel,
    onPointClick,
    style,
  }: ChartLineVelocityProps,
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
  const fmtMag = useCallback(
    (n: number) =>
      formatMagnitude
        ? formatMagnitude(n)
        : formatValue
          ? formatValue(n)
          : n.toFixed(3),
    [formatMagnitude, formatValue],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineVelocityLayout({
        series,
        arrowMode,
        arrowSize,
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
      arrowMode,
      arrowSize,
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
    describeLineVelocityChart(series, arrowMode, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineVelocitySeries) => {
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
      data-section="chart-line-velocity"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-arrow-mode={arrowMode}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-velocity-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-velocity-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-velocity-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-velocity-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-velocity-grid-line"
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
                  data-section="chart-line-velocity-grid-line"
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
            <g data-section="chart-line-velocity-axes">
              <line
                data-section="chart-line-velocity-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-velocity-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-velocity-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-velocity-tick"
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
                        data-section="chart-line-velocity-tick-label"
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
                <g data-section="chart-line-velocity-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-velocity-tick"
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
                        data-section="chart-line-velocity-tick-label"
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
                  data-section="chart-line-velocity-x-label"
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
                  data-section="chart-line-velocity-y-label"
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

          {/* Series paths + dots + arrows */}
          <g data-section="chart-line-velocity-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const dim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              const dimArrow =
                isAnyHovered && !isSeriesHovered ? 0.3 : arrowOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-velocity-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-arrow-mode={s.arrowMode}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-up-count={s.stats.upCount}
                  data-series-down-count={s.stats.downCount}
                  data-series-flat-count={s.stats.flatCount}
                  data-series-max-magnitude={s.stats.maxMagnitude}
                  data-series-mean-magnitude={s.stats.meanMagnitude}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {showLine && s.path ? (
                    <path
                      data-section="chart-line-velocity-path"
                      data-series-id={s.id}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${s.label}: velocity line with ${s.finiteCount} points`}
                      d={s.path}
                      fill="none"
                      stroke={s.color}
                      strokeOpacity={dim}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {showArrows
                    ? s.points.map((p) => {
                        if (!p.arrowPath || p.arrowAngle === null) return null;
                        return (
                          <path
                            key={`arrow-${s.id}-${p.index}`}
                            data-section="chart-line-velocity-arrow"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-direction={
                              p.velocity ? p.velocity.direction : 'right'
                            }
                            data-magnitude={
                              p.velocity ? p.velocity.magnitude : 0
                            }
                            d={p.arrowPath}
                            fill="none"
                            stroke={p.arrowColor}
                            strokeOpacity={dimArrow}
                            strokeWidth={arrowStrokeWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        );
                      })
                    : null}
                  {showDots
                    ? s.points.map((p) => {
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const opacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const direction = p.velocity
                          ? p.velocity.direction
                          : 'right';
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}${
                          p.velocity
                            ? `, velocity ${direction}, magnitude ${fmtMag(p.velocity.magnitude)}`
                            : ''
                        }`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-velocity-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-direction={direction}
                            data-magnitude={
                              p.velocity ? p.velocity.magnitude : 0
                            }
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 220);
          const ty = Math.min(Math.max(p.py - 80, 0), height - 110);
          const direction = p.velocity ? p.velocity.direction : 'right';
          const dirColor =
            direction === 'up'
              ? s.positiveColor
              : direction === 'down'
                ? s.negativeColor
                : s.zeroColor;
          return (
            <div
              data-section="chart-line-velocity-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              data-direction={direction}
              className="pointer-events-none absolute z-10 min-w-[200px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-velocity-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-velocity-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-velocity-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              {p.velocity ? (
                <div
                  data-section="chart-line-velocity-tooltip-direction"
                  style={{ color: dirColor }}
                >
                  velocity: {direction} ({fmtMag(p.velocity.magnitude)})
                </div>
              ) : (
                <div
                  data-section="chart-line-velocity-tooltip-direction"
                  className="text-slate-500"
                >
                  velocity: start of series
                </div>
              )}
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-velocity-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            const visEntry = layout.series.find((ls) => ls.id === s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-velocity-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-velocity-legend-button"
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
                    data-section="chart-line-velocity-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.color ?? getLineVelocityDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-velocity-legend-label">
                    {s.label}
                  </span>
                  {visEntry ? (
                    <span
                      data-section="chart-line-velocity-legend-stats"
                      className="text-slate-500"
                    >
                      ({visEntry.stats.upCount}+ /{' '}
                      {visEntry.stats.downCount}- /{' '}
                      {visEntry.stats.flatCount}=)
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

ChartLineVelocity.displayName = 'ChartLineVelocity';
