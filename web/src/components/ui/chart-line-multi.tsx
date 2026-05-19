import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_MULTI_WIDTH = 560;
export const DEFAULT_CHART_LINE_MULTI_HEIGHT = 320;
export const DEFAULT_CHART_LINE_MULTI_PADDING = 40;
export const DEFAULT_CHART_LINE_MULTI_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_MULTI_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_MULTI_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_MULTI_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_MULTI_CROSSHAIR_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_MULTI_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_MULTI_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_MULTI_PALETTE = [
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

export interface ChartLineMultiPoint {
  x: number;
  y: number;
}

export interface ChartLineMultiSeries {
  id: string;
  label: string;
  data: readonly ChartLineMultiPoint[];
  color?: string;
}

export interface ChartLineMultiLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineMultiLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineMultiLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  path: string;
}

export interface ChartLineMultiCrosshairPoint {
  series: ChartLineMultiLayoutSeries;
  point: ChartLineMultiLayoutPoint;
}

export interface ComputeLineMultiLayoutResult {
  series: ChartLineMultiLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xUnion: number[];
  xUnionPx: number[];
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

function isFinitePoint(p: unknown): p is ChartLineMultiPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineMultiPoint).x) &&
    isFiniteNumber((p as ChartLineMultiPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineMultiDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_MULTI_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_MULTI_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_MULTI_PALETTE.length
  ]!;
}

export function getLineMultiFinitePoints(
  points: readonly ChartLineMultiPoint[],
): ChartLineMultiPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

export function getLineMultiBounds(
  series: readonly ChartLineMultiSeries[],
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
    for (const p of getLineMultiFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
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

export function getLineMultiTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_MULTI_TICK_COUNT),
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

/**
 * Collects the sorted unique union of x values across every visible
 * series. Used to drive the synchronised crosshair: when the user
 * hovers at some pixel position, the crosshair snaps to the nearest
 * x in this union.
 */
export function collectLineMultiXValues(
  series: readonly ChartLineMultiSeries[],
  hidden?: readonly string[],
): number[] {
  const hiddenSet = new Set(hidden ?? []);
  const seen = new Set<number>();
  for (const s of series) {
    if (!s || typeof s.id !== 'string') continue;
    if (hiddenSet.has(s.id)) continue;
    for (const p of getLineMultiFinitePoints(s.data ?? [])) {
      seen.add(p.x);
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/**
 * Returns the index of the value in `sortedXs` closest to `target`.
 * Ties break toward the lower index. Empty input -> -1.
 */
export function findNearestXIndex(
  sortedXs: readonly number[],
  target: number,
): number {
  if (!Array.isArray(sortedXs) || sortedXs.length === 0) return -1;
  if (!isFiniteNumber(target)) return -1;
  let lo = 0;
  let hi = sortedXs.length - 1;
  if (target <= sortedXs[lo]!) return lo;
  if (target >= sortedXs[hi]!) return hi;
  while (lo < hi - 1) {
    const mid = (lo + hi) >>> 1;
    if (sortedXs[mid]! <= target) lo = mid;
    else hi = mid;
  }
  const loDist = Math.abs(target - sortedXs[lo]!);
  const hiDist = Math.abs(target - sortedXs[hi]!);
  return loDist <= hiDist ? lo : hi;
}

/**
 * Finds the point in `series.points` whose `x` is closest to `target`.
 * Returns `null` when the series has no finite points. Ties break toward
 * the lower index.
 */
export function findNearestPointInSeries(
  layoutPoints: readonly ChartLineMultiLayoutPoint[],
  target: number,
): ChartLineMultiLayoutPoint | null {
  if (!Array.isArray(layoutPoints) || layoutPoints.length === 0) return null;
  if (!isFiniteNumber(target)) return null;
  let best = layoutPoints[0]!;
  let bestDist = Math.abs(target - best.x);
  for (let i = 1; i < layoutPoints.length; i += 1) {
    const p = layoutPoints[i]!;
    const d = Math.abs(target - p.x);
    if (d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

export function buildLineMultiPath(
  points: ReadonlyArray<{ px: number; py: number }>,
): string {
  if (!Array.isArray(points) || points.length === 0) return '';
  let path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
  for (let i = 1; i < points.length; i += 1) {
    path += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.py)}`;
  }
  return path;
}

export interface ComputeLineMultiLayoutInput {
  series: readonly ChartLineMultiSeries[];
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

export function computeLineMultiLayout(
  input: ComputeLineMultiLayoutInput,
): ComputeLineMultiLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineMultiLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xUnion: [],
    xUnionPx: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
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

  const bounds = getLineMultiBounds(input.series, input.hidden);
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

  const indexById = new Map(input.series.map((s, i) => [s.id, i]));
  const seriesOut: ChartLineMultiLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineMultiDefaultColor(seriesIndex);
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineMultiLayoutPoint[] = [];
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
    const path = buildLineMultiPath(points);
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

  const xUnion = collectLineMultiXValues(input.series, input.hidden);
  const xUnionPx = xUnion.map(xToPx);

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_MULTI_TICK_COUNT;
  const xTicks = getLineMultiTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineMultiTicks(yMin, yMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + innerHeight - t.position * innerHeight,
  }));

  return {
    series: seriesOut,
    xTicks,
    yTicks,
    xUnion,
    xUnionPx,
    xMin,
    xMax,
    yMin,
    yMax,
    innerWidth,
    innerHeight,
  };
}

export function describeLineMultiChart(
  series: readonly ChartLineMultiSeries[],
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
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (const s of visible) {
    for (const p of getLineMultiFinitePoints(s.data ?? [])) {
      total += 1;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  }
  if (total === 0) return 'No data';
  return `Multi-series line chart with ${visible.length} series and ${total} points (synchronised crosshair). x range ${fmtV(xMin)} to ${fmtV(xMax)}, y range ${fmtV(yMin)} to ${fmtV(yMax)}.`;
}

export interface ChartLineMultiCrosshairChange {
  x: number;
  px: number;
  xIndex: number;
  points: ChartLineMultiCrosshairPoint[];
}

export interface ChartLineMultiSeriesToggle {
  series: ChartLineMultiSeries;
  hidden: boolean;
}

export interface ChartLineMultiProps {
  series: readonly ChartLineMultiSeries[];
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
  crosshairColor?: string;
  gridColor?: string;
  axisColor?: string;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showCrosshair?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onCrosshairChange?: (info: ChartLineMultiCrosshairChange | null) => void;
  onSeriesToggle?: (info: ChartLineMultiSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineMulti = forwardRef(function ChartLineMulti(
  {
    series,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_MULTI_WIDTH,
    height = DEFAULT_CHART_LINE_MULTI_HEIGHT,
    padding = DEFAULT_CHART_LINE_MULTI_PADDING,
    tickCount = DEFAULT_CHART_LINE_MULTI_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_MULTI_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_MULTI_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_MULTI_LINE_OPACITY,
    crosshairColor = DEFAULT_CHART_LINE_MULTI_CROSSHAIR_COLOR,
    gridColor = DEFAULT_CHART_LINE_MULTI_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_MULTI_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showCrosshair = true,
    showLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Multi-series line chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onCrosshairChange,
    onSeriesToggle,
    style,
  }: ChartLineMultiProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const svgRef = useRef<SVGSVGElement | null>(null);
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

  const [crosshairIndex, setCrosshairIndex] = useState<number | null>(null);

  const layout = useMemo(
    () =>
      computeLineMultiLayout({
        series,
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
    describeLineMultiChart(series, effectiveHidden, fmtValue);
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);

  const crosshair = useMemo(() => {
    if (crosshairIndex === null) return null;
    if (
      crosshairIndex < 0 ||
      crosshairIndex >= layout.xUnion.length
    )
      return null;
    const x = layout.xUnion[crosshairIndex]!;
    const px = layout.xUnionPx[crosshairIndex]!;
    const points: ChartLineMultiCrosshairPoint[] = [];
    for (const s of layout.series) {
      const point = findNearestPointInSeries(s.points, x);
      if (point) points.push({ series: s, point });
    }
    return { x, px, points };
  }, [crosshairIndex, layout]);

  const fireCrosshair = useCallback(
    (idx: number | null) => {
      setCrosshairIndex(idx);
      if (!onCrosshairChange) return;
      if (idx === null) {
        onCrosshairChange(null);
        return;
      }
      if (idx < 0 || idx >= layout.xUnion.length) return;
      const x = layout.xUnion[idx]!;
      const px = layout.xUnionPx[idx]!;
      const points: ChartLineMultiCrosshairPoint[] = [];
      for (const s of layout.series) {
        const point = findNearestPointInSeries(s.points, x);
        if (point) points.push({ series: s, point });
      }
      onCrosshairChange({ x, px, xIndex: idx, points });
    },
    [layout, onCrosshairChange],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      const svg = svgRef.current;
      if (!svg || layout.xUnion.length === 0) return;
      const rect = svg.getBoundingClientRect();
      const scale = rect.width > 0 ? width / rect.width : 1;
      const localPx = (e.clientX - rect.left) * scale;
      const xRange = layout.xMax - layout.xMin;
      if (xRange <= 0) return;
      const xData =
        layout.xMin +
        ((localPx - padding) / Math.max(1, layout.innerWidth)) * xRange;
      const idx = findNearestXIndex(layout.xUnion, xData);
      if (idx >= 0 && idx !== crosshairIndex) fireCrosshair(idx);
    },
    [crosshairIndex, fireCrosshair, layout, padding, width],
  );

  const handlePointerLeave = useCallback(() => {
    fireCrosshair(null);
  }, [fireCrosshair]);

  const toggleSeries = useCallback(
    (s: ChartLineMultiSeries) => {
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
      data-section="chart-line-multi"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-x-union-count={layout.xUnion.length}
      data-crosshair-active={crosshair ? 'true' : 'false'}
      data-crosshair-index={crosshairIndex ?? -1}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-multi-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-multi-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          ref={svgRef}
          data-section="chart-line-multi-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-multi-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-multi-grid-line"
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
                  data-section="chart-line-multi-grid-line"
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
            <g data-section="chart-line-multi-axes">
              <line
                data-section="chart-line-multi-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-multi-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-multi-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-multi-tick"
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
                        data-section="chart-line-multi-tick-label"
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
                <g data-section="chart-line-multi-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-multi-tick"
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
                        data-section="chart-line-multi-tick-label"
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
                  data-section="chart-line-multi-x-label"
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
                  data-section="chart-line-multi-y-label"
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

          <g data-section="chart-line-multi-series">
            {layout.series.map((s) => {
              const isAnyCrosshair = crosshair !== null;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-multi-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-multi-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points`}
                    d={s.path}
                    fill="none"
                    stroke={s.color}
                    strokeOpacity={lineOpacity}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {showDots
                    ? s.points.map((p) => {
                        const isCrosshair =
                          isAnyCrosshair &&
                          crosshair!.points.some(
                            (cp) =>
                              cp.series.id === s.id && cp.point.index === p.index,
                          );
                        return (
                          <circle
                            key={`${s.id}::${p.index}`}
                            data-section="chart-line-multi-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-crosshair-hit={isCrosshair ? 'true' : 'false'}
                            cx={p.px}
                            cy={p.py}
                            r={isCrosshair ? dotRadius + 1 : dotRadius}
                            fill={s.color}
                            stroke={s.color}
                            strokeWidth={1}
                          />
                        );
                      })
                    : null}
                </g>
              );
            })}
          </g>

          {showCrosshair && crosshair ? (
            <g data-section="chart-line-multi-crosshair">
              <line
                data-section="chart-line-multi-crosshair-line"
                data-x-index={crosshairIndex}
                data-x-value={crosshair.x}
                x1={crosshair.px}
                y1={padding}
                x2={crosshair.px}
                y2={padding + layout.innerHeight}
                stroke={crosshairColor}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              {crosshair.points.map((cp) => (
                <circle
                  key={`xhair-${cp.series.id}`}
                  data-section="chart-line-multi-crosshair-marker"
                  data-series-id={cp.series.id}
                  cx={cp.point.px}
                  cy={cp.point.py}
                  r={dotRadius + 2}
                  fill={cp.series.color}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              ))}
            </g>
          ) : null}

          {layout.innerWidth > 0 && layout.innerHeight > 0 ? (
            <rect
              data-section="chart-line-multi-overlay"
              x={padding}
              y={padding}
              width={layout.innerWidth}
              height={layout.innerHeight}
              fill="transparent"
              pointerEvents="all"
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
            />
          ) : null}
        </svg>

        {showTooltip && crosshair ? (() => {
          const tx = Math.min(Math.max(crosshair.px + 12, 0), width - 220);
          const ty = padding + 8;
          return (
            <div
              data-section="chart-line-multi-tooltip"
              data-x-index={crosshairIndex}
              className="pointer-events-none absolute z-10 min-w-[140px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-multi-tooltip-x"
                className="mb-1 font-medium"
              >
                x: {fmtX(crosshair.x)}
              </div>
              <ul
                data-section="chart-line-multi-tooltip-list"
                className="space-y-0.5"
              >
                {crosshair.points.map((cp) => (
                  <li
                    key={`tip-${cp.series.id}`}
                    data-section="chart-line-multi-tooltip-row"
                    data-series-id={cp.series.id}
                    className="flex items-center gap-1.5"
                  >
                    <span
                      data-section="chart-line-multi-tooltip-swatch"
                      className="inline-block h-2 w-2 rounded-sm"
                      style={{ backgroundColor: cp.series.color }}
                    />
                    <span
                      data-section="chart-line-multi-tooltip-label"
                      className="font-medium"
                    >
                      {cp.series.label}
                    </span>
                    <span
                      data-section="chart-line-multi-tooltip-value"
                      className="ml-auto text-slate-700"
                    >
                      {fmtValue(cp.point.y)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-multi-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineMultiDefaultColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-line-multi-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-multi-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-multi-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: color }}
                  />
                  <span data-section="chart-line-multi-legend-label">
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

ChartLineMulti.displayName = 'ChartLineMulti';
