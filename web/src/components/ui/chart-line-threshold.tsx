import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_THRESHOLD_WIDTH = 560;
export const DEFAULT_CHART_LINE_THRESHOLD_HEIGHT = 320;
export const DEFAULT_CHART_LINE_THRESHOLD_PADDING = 40;
export const DEFAULT_CHART_LINE_THRESHOLD_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_THRESHOLD_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_THRESHOLD_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_THRESHOLD_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_OPACITY = 0.9;
export const DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_WIDTH = 1.25;
export const DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_DASH = '6 4';
export const DEFAULT_CHART_LINE_THRESHOLD_ZONE_OPACITY = 0.1;
export const DEFAULT_CHART_LINE_THRESHOLD_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_THRESHOLD_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_THRESHOLD_DEFAULT_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_THRESHOLD_PALETTE = [
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

export type ChartLineThresholdZone = 'above' | 'below' | 'none';

export interface ChartLineThresholdPoint {
  x: number;
  y: number;
}

export interface ChartLineThresholdSeries {
  id: string;
  label: string;
  data: readonly ChartLineThresholdPoint[];
  color?: string;
}

export interface ChartLineThresholdSpec {
  id: string;
  label: string;
  value: number;
  color?: string;
  zone?: ChartLineThresholdZone;
  zoneColor?: string;
  dashArray?: string;
}

export interface ChartLineThresholdLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
  thresholdState: ThresholdHitState[];
}

export interface ThresholdHitState {
  thresholdId: string;
  isAbove: boolean;
  isBelow: boolean;
  isInZone: boolean;
}

export interface ChartLineThresholdLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineThresholdLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  path: string;
}

export interface ChartLineThresholdLayoutThreshold {
  id: string;
  label: string;
  index: number;
  value: number;
  color: string;
  zoneColor: string;
  zone: ChartLineThresholdZone;
  dashArray: string;
  py: number;
  inRange: boolean;
  zoneY: number;
  zoneHeight: number;
}

export interface ComputeLineThresholdLayoutResult {
  series: ChartLineThresholdLayoutSeries[];
  thresholds: ChartLineThresholdLayoutThreshold[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineThresholdPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineThresholdPoint).x) &&
    isFiniteNumber((p as ChartLineThresholdPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineThresholdDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_THRESHOLD_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_THRESHOLD_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_THRESHOLD_PALETTE.length
  ]!;
}

export function getLineThresholdFinitePoints(
  points: readonly ChartLineThresholdPoint[],
): ChartLineThresholdPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

export function getLineThresholdFiniteThresholds(
  thresholds: readonly ChartLineThresholdSpec[],
): ChartLineThresholdSpec[] {
  if (!Array.isArray(thresholds)) return [];
  return thresholds.filter(
    (t) => t && typeof t.id === 'string' && isFiniteNumber(t.value),
  );
}

export function getLineThresholdBounds(
  series: readonly ChartLineThresholdSeries[],
  thresholds: readonly ChartLineThresholdSpec[],
  hidden?: readonly string[],
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
    for (const p of getLineThresholdFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  }
  for (const t of getLineThresholdFiniteThresholds(thresholds)) {
    if (t.value < yMin) yMin = t.value;
    if (t.value > yMax) yMax = t.value;
    any = true;
  }
  if (!any) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  if (xMin === Number.POSITIVE_INFINITY || xMax === Number.NEGATIVE_INFINITY) {
    xMin = 0;
    xMax = 1;
  }
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

export function getLineThresholdTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_THRESHOLD_TICK_COUNT),
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

export function buildLineThresholdPath(
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
 * Classifies a point relative to a threshold value.
 *
 *  - `isAbove` when `point.y > threshold.value`.
 *  - `isBelow` when `point.y < threshold.value`.
 *  - `isInZone` when the point falls inside the threshold's shaded
 *    zone (above-zone + isAbove, below-zone + isBelow).
 *
 * The point sitting exactly on the threshold is neither above nor
 * below; it is `isInZone=false` regardless of the zone direction.
 */
export function classifyLineThresholdPoint(
  pointY: number,
  threshold: { value: number; zone?: ChartLineThresholdZone },
): { isAbove: boolean; isBelow: boolean; isInZone: boolean } {
  if (!isFiniteNumber(pointY) || !isFiniteNumber(threshold.value)) {
    return { isAbove: false, isBelow: false, isInZone: false };
  }
  const isAbove = pointY > threshold.value;
  const isBelow = pointY < threshold.value;
  const zone = threshold.zone ?? 'none';
  const isInZone =
    zone === 'above' ? isAbove : zone === 'below' ? isBelow : false;
  return { isAbove, isBelow, isInZone };
}

export interface ComputeLineThresholdLayoutInput {
  series: readonly ChartLineThresholdSeries[];
  thresholds?: readonly ChartLineThresholdSpec[];
  hidden?: readonly string[];
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineThresholdLayout(
  input: ComputeLineThresholdLayoutInput,
): ComputeLineThresholdLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineThresholdLayoutResult = {
    series: [],
    thresholds: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    innerWidth,
    innerHeight,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const hiddenSet = new Set(input.hidden ?? []);
  const validThresholds = getLineThresholdFiniteThresholds(
    input.thresholds ?? [],
  );
  const visible = (input.series ?? []).filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0 && validThresholds.length === 0) return empty;

  const bounds = getLineThresholdBounds(
    input.series ?? [],
    input.thresholds ?? [],
    input.hidden,
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

  const thresholdsOut: ChartLineThresholdLayoutThreshold[] = validThresholds.map(
    (t, i) => {
      const color = t.color ?? DEFAULT_CHART_LINE_THRESHOLD_DEFAULT_COLOR;
      const zoneColor = t.zoneColor ?? color;
      const zone = t.zone ?? 'none';
      const dashArray =
        typeof t.dashArray === 'string'
          ? t.dashArray
          : DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_DASH;
      const py = yToPx(t.value);
      const inRange = t.value >= yMin && t.value <= yMax;
      const top = padding;
      const bottom = padding + innerHeight;
      let zoneY = 0;
      let zoneHeight = 0;
      if (zone === 'above') {
        zoneY = top;
        zoneHeight = Math.max(0, py - top);
      } else if (zone === 'below') {
        zoneY = py;
        zoneHeight = Math.max(0, bottom - py);
      }
      return {
        id: t.id,
        label: t.label,
        index: i,
        value: t.value,
        color,
        zoneColor,
        zone,
        dashArray,
        py,
        inRange,
        zoneY,
        zoneHeight,
      };
    },
  );

  const indexById = new Map((input.series ?? []).map((s, i) => [s.id, i]));
  const seriesOut: ChartLineThresholdLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineThresholdDefaultColor(seriesIndex);
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineThresholdLayoutPoint[] = [];
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]!;
      if (!isFinitePoint(p)) continue;
      const thresholdState: ThresholdHitState[] = thresholdsOut.map((t) => {
        const c = classifyLineThresholdPoint(p.y, {
          value: t.value,
          zone: t.zone,
        });
        return {
          thresholdId: t.id,
          isAbove: c.isAbove,
          isBelow: c.isBelow,
          isInZone: c.isInZone,
        };
      });
      points.push({
        index: i,
        x: p.x,
        y: p.y,
        px: xToPx(p.x),
        py: yToPx(p.y),
        thresholdState,
      });
    }
    const path = buildLineThresholdPath(points);
    return {
      id: s.id,
      label: s.label,
      index: seriesIndex,
      color,
      points,
      finiteCount: points.length,
      totalCount: arr.length,
      path,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_THRESHOLD_TICK_COUNT;
  const xTicks = getLineThresholdTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineThresholdTicks(yMin, yMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + innerHeight - t.position * innerHeight,
  }));

  return {
    series: seriesOut,
    thresholds: thresholdsOut,
    xTicks,
    yTicks,
    xMin,
    xMax,
    yMin,
    yMax,
    innerWidth,
    innerHeight,
  };
}

export function describeLineThresholdChart(
  series: readonly ChartLineThresholdSeries[],
  thresholds: readonly ChartLineThresholdSpec[],
  hidden?: readonly string[],
  formatValue?: (n: number) => string,
): string {
  const hiddenSet = new Set(hidden ?? []);
  const visible = (series ?? []).filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  const validThresholds = getLineThresholdFiniteThresholds(thresholds ?? []);
  if (visible.length === 0 && validThresholds.length === 0) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  let total = 0;
  for (const s of visible) {
    for (const _ of getLineThresholdFinitePoints(s.data ?? [])) total += 1;
  }
  const summary = `Line chart with ${visible.length} series, ${total} points, and ${validThresholds.length} threshold${validThresholds.length === 1 ? '' : 's'}.`;
  if (validThresholds.length === 0) return summary;
  const list = validThresholds
    .map(
      (t) =>
        `${t.label} at ${fmtV(t.value)}${t.zone && t.zone !== 'none' ? ` (zone ${t.zone})` : ''}`,
    )
    .join('; ');
  return `${summary} Thresholds: ${list}.`;
}

export interface ChartLineThresholdPointClick {
  series: ChartLineThresholdLayoutSeries;
  point: ChartLineThresholdLayoutPoint;
}

export interface ChartLineThresholdSeriesToggle {
  series: ChartLineThresholdSeries;
  hidden: boolean;
}

export interface ChartLineThresholdProps {
  series: readonly ChartLineThresholdSeries[];
  thresholds?: readonly ChartLineThresholdSpec[];
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
  referenceOpacity?: number;
  referenceWidth?: number;
  zoneOpacity?: number;
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
  showThresholdLabels?: boolean;
  showZones?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineThresholdPointClick) => void;
  onSeriesToggle?: (info: ChartLineThresholdSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineThreshold = forwardRef(function ChartLineThreshold(
  {
    series = [],
    thresholds,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_THRESHOLD_WIDTH,
    height = DEFAULT_CHART_LINE_THRESHOLD_HEIGHT,
    padding = DEFAULT_CHART_LINE_THRESHOLD_PADDING,
    tickCount = DEFAULT_CHART_LINE_THRESHOLD_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_THRESHOLD_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_THRESHOLD_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_THRESHOLD_LINE_OPACITY,
    referenceOpacity = DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_OPACITY,
    referenceWidth = DEFAULT_CHART_LINE_THRESHOLD_REFERENCE_WIDTH,
    zoneOpacity = DEFAULT_CHART_LINE_THRESHOLD_ZONE_OPACITY,
    gridColor = DEFAULT_CHART_LINE_THRESHOLD_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_THRESHOLD_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showThresholdLabels = true,
    showZones = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with thresholds',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineThresholdProps,
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
      computeLineThresholdLayout({
        series,
        thresholds: thresholds ?? [],
        hidden: effectiveHidden,
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
      thresholds,
      effectiveHidden,
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
    describeLineThresholdChart(
      series,
      thresholds ?? [],
      effectiveHidden,
      fmtValue,
    );
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);

  const toggleSeries = useCallback(
    (s: ChartLineThresholdSeries) => {
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
      data-section="chart-line-threshold"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-threshold-count={layout.thresholds.length}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-threshold-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-threshold-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-threshold-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showZones && layout.thresholds.length > 0 ? (
            <g data-section="chart-line-threshold-zones">
              {layout.thresholds.map((t) => {
                if (t.zone === 'none' || t.zoneHeight <= 0) return null;
                return (
                  <rect
                    key={`zone-${t.id}`}
                    data-section="chart-line-threshold-zone"
                    data-threshold-id={t.id}
                    data-threshold-zone={t.zone}
                    data-zone-y={t.zoneY}
                    data-zone-height={t.zoneHeight}
                    x={padding}
                    y={t.zoneY}
                    width={layout.innerWidth}
                    height={t.zoneHeight}
                    fill={t.zoneColor}
                    fillOpacity={zoneOpacity}
                  />
                );
              })}
            </g>
          ) : null}

          {showGrid ? (
            <g data-section="chart-line-threshold-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-threshold-grid-line"
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
                  data-section="chart-line-threshold-grid-line"
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
            <g data-section="chart-line-threshold-axes">
              <line
                data-section="chart-line-threshold-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-threshold-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-threshold-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-threshold-tick"
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
                        data-section="chart-line-threshold-tick-label"
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
                <g data-section="chart-line-threshold-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-threshold-tick"
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
                        data-section="chart-line-threshold-tick-label"
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
                  data-section="chart-line-threshold-x-label"
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
                  data-section="chart-line-threshold-y-label"
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

          <g data-section="chart-line-threshold-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-threshold-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-threshold-path"
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
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}`;
                        const inAnyZone = p.thresholdState.some(
                          (st) => st.isInZone,
                        );
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-threshold-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-in-zone={inAnyZone ? 'true' : 'false'}
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

          {layout.thresholds.length > 0 ? (
            <g data-section="chart-line-threshold-references">
              {layout.thresholds.map((t) => {
                if (!t.inRange) return null;
                return (
                  <g
                    key={`ref-${t.id}`}
                    data-section="chart-line-threshold-reference"
                    data-threshold-id={t.id}
                    data-threshold-index={t.index}
                    data-threshold-value={t.value}
                    data-threshold-zone={t.zone}
                    data-threshold-color={t.color}
                    data-threshold-py={t.py}
                  >
                    <line
                      data-section="chart-line-threshold-reference-line"
                      data-threshold-id={t.id}
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`Threshold ${t.label} at ${fmtValue(t.value)}${t.zone !== 'none' ? `, ${t.zone} zone` : ''}`}
                      x1={padding}
                      y1={t.py}
                      x2={padding + layout.innerWidth}
                      y2={t.py}
                      stroke={t.color}
                      strokeOpacity={referenceOpacity}
                      strokeWidth={referenceWidth}
                      strokeDasharray={t.dashArray || undefined}
                    />
                    {showThresholdLabels ? (
                      <text
                        data-section="chart-line-threshold-reference-label"
                        data-threshold-id={t.id}
                        x={padding + layout.innerWidth - 4}
                        y={t.py - 4}
                        textAnchor="end"
                        fontSize={10}
                        fill={t.color}
                      >
                        {t.label} ({fmtValue(t.value)})
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>
          ) : null}
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
          const ty = Math.min(Math.max(p.py - 48, 0), height - 64);
          const crossed = p.thresholdState
            .filter((st) => st.isAbove)
            .map((st) =>
              layout.thresholds.find((t) => t.id === st.thresholdId),
            )
            .filter(Boolean);
          return (
            <div
              data-section="chart-line-threshold-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[180px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-threshold-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-threshold-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-threshold-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              {crossed.length > 0 ? (
                <div
                  data-section="chart-line-threshold-tooltip-crossed"
                  className="text-slate-500"
                >
                  above:{' '}
                  {crossed
                    .map((t) => `${t!.label} (${fmtValue(t!.value)})`)
                    .join(', ')}
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && (series.length > 0 || layout.thresholds.length > 0) ? (
        <ul
          data-section="chart-line-threshold-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineThresholdDefaultColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-line-threshold-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-threshold-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-threshold-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: color }}
                  />
                  <span data-section="chart-line-threshold-legend-label">
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
          {layout.thresholds.map((t) => (
            <li
              key={`thr-${t.id}`}
              data-section="chart-line-threshold-legend-threshold"
              data-threshold-id={t.id}
              data-threshold-value={t.value}
              data-threshold-zone={t.zone}
            >
              <span className="flex items-center gap-1">
                <svg
                  data-section="chart-line-threshold-legend-threshold-swatch"
                  width="20"
                  height="6"
                >
                  <line
                    x1={1}
                    y1={3}
                    x2={19}
                    y2={3}
                    stroke={t.color}
                    strokeWidth={2}
                    strokeDasharray={t.dashArray || undefined}
                    strokeLinecap="round"
                  />
                </svg>
                <span data-section="chart-line-threshold-legend-threshold-label">
                  {t.label}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
});

ChartLineThreshold.displayName = 'ChartLineThreshold';
