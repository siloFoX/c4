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

export const DEFAULT_CHART_LINE_ZOOM_WIDTH = 560;
export const DEFAULT_CHART_LINE_ZOOM_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ZOOM_PADDING = 40;
export const DEFAULT_CHART_LINE_ZOOM_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ZOOM_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_ZOOM_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ZOOM_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_ZOOM_MIN_BRUSH_WIDTH = 4;
export const DEFAULT_CHART_LINE_ZOOM_BRUSH_FILL = '#3b82f6';
export const DEFAULT_CHART_LINE_ZOOM_BRUSH_OPACITY = 0.15;
export const DEFAULT_CHART_LINE_ZOOM_BRUSH_BORDER = '#2563eb';
export const DEFAULT_CHART_LINE_ZOOM_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ZOOM_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ZOOM_PALETTE = [
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

export interface ChartLineZoomPoint {
  x: number;
  y: number;
}

export interface ChartLineZoomSeries {
  id: string;
  label: string;
  data: readonly ChartLineZoomPoint[];
  color?: string;
}

export interface ChartLineZoomRange {
  xMin: number;
  xMax: number;
}

export interface ChartLineZoomLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineZoomLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineZoomLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  path: string;
}

export interface ComputeLineZoomLayoutResult {
  series: ChartLineZoomLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  fullXMin: number;
  fullXMax: number;
  innerWidth: number;
  innerHeight: number;
  zoomActive: boolean;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineZoomPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineZoomPoint).x) &&
    isFiniteNumber((p as ChartLineZoomPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineZoomDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_ZOOM_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_ZOOM_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_ZOOM_PALETTE.length
  ]!;
}

export function getLineZoomFinitePoints(
  points: readonly ChartLineZoomPoint[],
): ChartLineZoomPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

export function getLineZoomBounds(
  series: readonly ChartLineZoomSeries[],
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
    for (const p of getLineZoomFinitePoints(s.data ?? [])) {
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

export function getLineZoomTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(2, Math.floor(count ?? DEFAULT_CHART_LINE_ZOOM_TICK_COUNT));
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

export function buildLineZoomPath(
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
 * Normalises a zoom range so `xMin <= xMax` and clamps both endpoints
 * to the full data bounds. Returns `null` for non-finite input or when
 * the normalised range is degenerate (xMin === xMax).
 */
export function clampLineZoomRange(
  range: ChartLineZoomRange | null | undefined,
  fullXMin: number,
  fullXMax: number,
): ChartLineZoomRange | null {
  if (!range) return null;
  if (!isFiniteNumber(range.xMin) || !isFiniteNumber(range.xMax)) return null;
  let a = range.xMin;
  let b = range.xMax;
  if (a > b) [a, b] = [b, a];
  a = Math.max(a, fullXMin);
  b = Math.min(b, fullXMax);
  if (a >= b) return null;
  return { xMin: a, xMax: b };
}

/**
 * Returns true when the brush rectangle is wide enough (in pixels) to
 * trigger a zoom commit. Brushes narrower than `minBrushWidth` are
 * treated as a click and discarded.
 */
export function isLineZoomBrushValid(
  startPx: number,
  endPx: number,
  minBrushWidth: number = DEFAULT_CHART_LINE_ZOOM_MIN_BRUSH_WIDTH,
): boolean {
  if (!isFiniteNumber(startPx) || !isFiniteNumber(endPx)) return false;
  const threshold = isFiniteNumber(minBrushWidth)
    ? Math.max(0, minBrushWidth)
    : DEFAULT_CHART_LINE_ZOOM_MIN_BRUSH_WIDTH;
  return Math.abs(endPx - startPx) >= threshold;
}

export interface ComputeLineZoomLayoutInput {
  series: readonly ChartLineZoomSeries[];
  hidden?: readonly string[];
  zoom?: ChartLineZoomRange | null;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineZoomLayout(
  input: ComputeLineZoomLayoutInput,
): ComputeLineZoomLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineZoomLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    fullXMin: 0,
    fullXMax: 1,
    innerWidth,
    innerHeight,
    zoomActive: false,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.series || input.series.length === 0) return empty;

  const hiddenSet = new Set(input.hidden ?? []);
  const visible = input.series.filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0) return empty;

  const bounds = getLineZoomBounds(input.series, input.hidden);
  const fullXMin = isFiniteNumber(input.xMin) ? input.xMin : bounds.xMin;
  const fullXMax = isFiniteNumber(input.xMax) ? input.xMax : bounds.xMax;
  let yMin = isFiniteNumber(input.yMin) ? input.yMin : bounds.yMin;
  let yMax = isFiniteNumber(input.yMax) ? input.yMax : bounds.yMax;

  const clampedZoom = clampLineZoomRange(
    input.zoom ?? null,
    fullXMin,
    fullXMax,
  );
  const xMin = clampedZoom ? clampedZoom.xMin : fullXMin;
  const xMax = clampedZoom ? clampedZoom.xMax : fullXMax;

  if (yMax < yMin) [yMin, yMax] = [yMax, yMin];
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
  const seriesOut: ChartLineZoomLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineZoomDefaultColor(seriesIndex);
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineZoomLayoutPoint[] = [];
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
    const path = buildLineZoomPath(points);
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

  const tickCount = input.tickCount ?? DEFAULT_CHART_LINE_ZOOM_TICK_COUNT;
  const xTicks = getLineZoomTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineZoomTicks(yMin, yMax, tickCount).map((t) => ({
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
    fullXMin,
    fullXMax,
    innerWidth,
    innerHeight,
    zoomActive: clampedZoom !== null,
  };
}

export function describeLineZoomChart(
  series: readonly ChartLineZoomSeries[],
  hidden?: readonly string[],
  zoom?: ChartLineZoomRange | null,
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
    for (const p of getLineZoomFinitePoints(s.data ?? [])) {
      total += 1;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  }
  if (total === 0) return 'No data';
  const zoomStr = zoom
    ? ` (zoomed to ${fmtV(zoom.xMin)} to ${fmtV(zoom.xMax)})`
    : ' (full range, brush-to-zoom)';
  return `Zoomable line chart with ${visible.length} series and ${total} points${zoomStr}. x range ${fmtV(xMin)} to ${fmtV(xMax)}, y range ${fmtV(yMin)} to ${fmtV(yMax)}.`;
}

export interface ChartLineZoomSeriesToggle {
  series: ChartLineZoomSeries;
  hidden: boolean;
}

export interface ChartLineZoomProps {
  series: readonly ChartLineZoomSeries[];
  zoom?: ChartLineZoomRange | null;
  defaultZoom?: ChartLineZoomRange | null;
  onZoomChange?: (range: ChartLineZoomRange | null) => void;
  minBrushWidth?: number;
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
  brushFill?: string;
  brushOpacity?: number;
  brushBorder?: string;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showAxis?: boolean;
  showGrid?: boolean;
  showDots?: boolean;
  showBrush?: boolean;
  showResetButton?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  resetButtonLabel?: string;
  onSeriesToggle?: (info: ChartLineZoomSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineZoom = forwardRef(function ChartLineZoom(
  {
    series = [],
    zoom,
    defaultZoom,
    onZoomChange,
    minBrushWidth = DEFAULT_CHART_LINE_ZOOM_MIN_BRUSH_WIDTH,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_ZOOM_WIDTH,
    height = DEFAULT_CHART_LINE_ZOOM_HEIGHT,
    padding = DEFAULT_CHART_LINE_ZOOM_PADDING,
    tickCount = DEFAULT_CHART_LINE_ZOOM_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ZOOM_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ZOOM_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_ZOOM_LINE_OPACITY,
    gridColor = DEFAULT_CHART_LINE_ZOOM_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ZOOM_AXIS_COLOR,
    brushFill = DEFAULT_CHART_LINE_ZOOM_BRUSH_FILL,
    brushOpacity = DEFAULT_CHART_LINE_ZOOM_BRUSH_OPACITY,
    brushBorder = DEFAULT_CHART_LINE_ZOOM_BRUSH_BORDER,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showBrush = true,
    showResetButton = true,
    showLegend = true,
    animate = true,
    className,
    ariaLabel = 'Zoomable line chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    resetButtonLabel = 'Reset zoom',
    onSeriesToggle,
    style,
  }: ChartLineZoomProps,
  ref: ForwardedRef<HTMLDivElement>,
) {
  const reactId = useId();
  const ariaDescId = `${reactId}-desc`;
  const clipId = `${reactId}-clip`;
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

  const [internalZoom, setInternalZoom] = useState<ChartLineZoomRange | null>(
    defaultZoom ?? null,
  );
  const controlledZoom = zoom !== undefined;
  const effectiveZoom = controlledZoom ? zoom ?? null : internalZoom;

  const [brush, setBrush] = useState<{
    startPx: number;
    endPx: number;
  } | null>(null);

  const layout = useMemo(
    () =>
      computeLineZoomLayout({
        series,
        hidden: effectiveHidden,
        zoom: effectiveZoom,
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
      effectiveZoom,
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
    describeLineZoomChart(series, effectiveHidden, effectiveZoom, fmtValue);

  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);

  const applyZoom = useCallback(
    (range: ChartLineZoomRange | null) => {
      if (!controlledZoom) setInternalZoom(range);
      if (onZoomChange) onZoomChange(range);
    },
    [controlledZoom, onZoomChange],
  );

  const resetZoom = useCallback(() => {
    applyZoom(null);
  }, [applyZoom]);

  const pointerLocalPx = useCallback(
    (clientX: number): number => {
      const svg = svgRef.current;
      if (!svg) return padding;
      const rect = svg.getBoundingClientRect();
      const scale = rect.width > 0 ? width / rect.width : 1;
      const local = (clientX - rect.left) * scale;
      return Math.min(
        Math.max(local, padding),
        padding + layout.innerWidth,
      );
    },
    [layout.innerWidth, padding, width],
  );

  const pxToData = useCallback(
    (px: number): number => {
      if (layout.innerWidth <= 0) return layout.xMin;
      const ratio = (px - padding) / layout.innerWidth;
      return layout.xMin + ratio * (layout.xMax - layout.xMin);
    },
    [layout.innerWidth, layout.xMax, layout.xMin, padding],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (!showBrush) return;
      if (e.button !== 0 && e.button !== undefined) return;
      const localPx = pointerLocalPx(e.clientX);
      setBrush({ startPx: localPx, endPx: localPx });
      (e.target as SVGRectElement).setPointerCapture(e.pointerId);
    },
    [pointerLocalPx, showBrush],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      if (!brush) return;
      const localPx = pointerLocalPx(e.clientX);
      setBrush({ startPx: brush.startPx, endPx: localPx });
    },
    [brush, pointerLocalPx],
  );

  const finishBrush = useCallback(
    (clientX: number) => {
      if (!brush) return;
      const localPx = pointerLocalPx(clientX);
      if (isLineZoomBrushValid(brush.startPx, localPx, minBrushWidth)) {
        const aPx = Math.min(brush.startPx, localPx);
        const bPx = Math.max(brush.startPx, localPx);
        const aData = pxToData(aPx);
        const bData = pxToData(bPx);
        const next = clampLineZoomRange(
          { xMin: aData, xMax: bData },
          layout.fullXMin,
          layout.fullXMax,
        );
        if (next) applyZoom(next);
      }
      setBrush(null);
    },
    [
      applyZoom,
      brush,
      layout.fullXMax,
      layout.fullXMin,
      minBrushWidth,
      pointerLocalPx,
      pxToData,
    ],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<SVGRectElement>) => {
      finishBrush(e.clientX);
    },
    [finishBrush],
  );

  const handlePointerCancel = useCallback(() => {
    setBrush(null);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (layout.zoomActive) resetZoom();
  }, [layout.zoomActive, resetZoom]);

  const toggleSeries = useCallback(
    (s: ChartLineZoomSeries) => {
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

  const brushRect = brush
    ? (() => {
        const x = Math.min(brush.startPx, brush.endPx);
        const w = Math.abs(brush.endPx - brush.startPx);
        return { x, w };
      })()
    : null;

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-zoom"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-zoom-active={layout.zoomActive ? 'true' : 'false'}
      data-zoom-min={layout.zoomActive ? layout.xMin : ''}
      data-zoom-max={layout.zoomActive ? layout.xMax : ''}
      data-full-x-min={layout.fullXMin}
      data-full-x-max={layout.fullXMax}
      data-brushing={brush ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-zoom-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-zoom-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          ref={svgRef}
          data-section="chart-line-zoom-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <clipPath id={clipId}>
              <rect
                x={padding}
                y={padding}
                width={layout.innerWidth}
                height={layout.innerHeight}
              />
            </clipPath>
          </defs>

          {showGrid ? (
            <g data-section="chart-line-zoom-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-zoom-grid-line"
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
                  data-section="chart-line-zoom-grid-line"
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
            <g data-section="chart-line-zoom-axes">
              <line
                data-section="chart-line-zoom-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-zoom-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-zoom-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-zoom-tick"
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
                        data-section="chart-line-zoom-tick-label"
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
                <g data-section="chart-line-zoom-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-zoom-tick"
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
                        data-section="chart-line-zoom-tick-label"
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
                  data-section="chart-line-zoom-x-label"
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
                  data-section="chart-line-zoom-y-label"
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

          <g
            data-section="chart-line-zoom-series"
            clipPath={`url(#${clipId})`}
          >
            {layout.series.map((s) => (
              <g
                key={s.id}
                data-section="chart-line-zoom-series-group"
                data-series-id={s.id}
                data-series-index={s.index}
                data-series-color={s.color}
                data-series-point-count={s.points.length}
                data-series-finite-count={s.finiteCount}
                style={{ color: s.color }}
              >
                <path
                  data-section="chart-line-zoom-path"
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
                  ? s.points.map((p) => (
                      <circle
                        key={`${s.id}::${p.index}`}
                        data-section="chart-line-zoom-dot"
                        data-series-id={s.id}
                        data-point-index={p.index}
                        data-x={p.x}
                        data-y={p.y}
                        cx={p.px}
                        cy={p.py}
                        r={dotRadius}
                        fill={s.color}
                        stroke={s.color}
                        strokeWidth={1}
                      />
                    ))
                  : null}
              </g>
            ))}
          </g>

          {brushRect ? (
            <rect
              data-section="chart-line-zoom-brush-rect"
              data-brush-start={brush!.startPx}
              data-brush-end={brush!.endPx}
              x={brushRect.x}
              y={padding}
              width={brushRect.w}
              height={layout.innerHeight}
              fill={brushFill}
              fillOpacity={brushOpacity}
              stroke={brushBorder}
              strokeWidth={1}
              strokeDasharray="3 3"
              pointerEvents="none"
            />
          ) : null}

          {layout.innerWidth > 0 && layout.innerHeight > 0 ? (
            <rect
              data-section="chart-line-zoom-overlay"
              x={padding}
              y={padding}
              width={layout.innerWidth}
              height={layout.innerHeight}
              fill="transparent"
              pointerEvents="all"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onDoubleClick={handleDoubleClick}
              style={{ cursor: layout.zoomActive ? 'zoom-out' : 'crosshair' }}
            />
          ) : null}
        </svg>

        {showResetButton && layout.zoomActive ? (
          <button
            type="button"
            data-section="chart-line-zoom-reset"
            className="absolute right-2 top-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow hover:bg-slate-50"
            onClick={resetZoom}
          >
            {resetButtonLabel}
          </button>
        ) : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-zoom-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineZoomDefaultColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-line-zoom-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-zoom-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-zoom-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: color }}
                  />
                  <span data-section="chart-line-zoom-legend-label">
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

ChartLineZoom.displayName = 'ChartLineZoom';
