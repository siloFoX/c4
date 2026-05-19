import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_ANNOTATED_WIDTH = 560;
export const DEFAULT_CHART_LINE_ANNOTATED_HEIGHT = 320;
export const DEFAULT_CHART_LINE_ANNOTATED_PADDING = 48;
export const DEFAULT_CHART_LINE_ANNOTATED_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_ANNOTATED_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_ANNOTATED_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_ANNOTATED_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_OPACITY = 0.85;
export const DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_DASH = '4 3';
export const DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_COLOR = '#64748b';
export const DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_POSITION = 'top';
export const DEFAULT_CHART_LINE_ANNOTATED_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_ANNOTATED_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_ANNOTATED_PALETTE = [
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

export type ChartLineAnnotatedLabelPosition = 'top' | 'bottom' | 'inline';

export interface ChartLineAnnotatedAnnotation {
  id: string;
  x: number;
  label: string;
  color?: string;
  position?: ChartLineAnnotatedLabelPosition;
  dashArray?: string;
}

export interface ChartLineAnnotatedPoint {
  x: number;
  y: number;
}

export interface ChartLineAnnotatedSeries {
  id: string;
  label: string;
  data: readonly ChartLineAnnotatedPoint[];
  color?: string;
}

export interface ChartLineAnnotatedLayoutPoint {
  index: number;
  x: number;
  y: number;
  px: number;
  py: number;
}

export interface ChartLineAnnotatedLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineAnnotatedLayoutPoint[];
  finiteCount: number;
  totalCount: number;
  path: string;
}

export interface ChartLineAnnotatedLayoutAnnotation {
  id: string;
  index: number;
  originalIndex: number;
  x: number;
  px: number;
  label: string;
  color: string;
  position: ChartLineAnnotatedLabelPosition;
  dashArray: string;
  inRange: boolean;
  labelX: number;
  labelY: number;
  labelAnchor: 'start' | 'middle' | 'end';
}

export interface ComputeLineAnnotatedLayoutResult {
  series: ChartLineAnnotatedLayoutSeries[];
  annotations: ChartLineAnnotatedLayoutAnnotation[];
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

function isFinitePoint(p: unknown): p is ChartLineAnnotatedPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineAnnotatedPoint).x) &&
    isFiniteNumber((p as ChartLineAnnotatedPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineAnnotatedDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_ANNOTATED_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_ANNOTATED_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_ANNOTATED_PALETTE.length
  ]!;
}

export function getLineAnnotatedFinitePoints(
  points: readonly ChartLineAnnotatedPoint[],
): ChartLineAnnotatedPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Filters down to annotations with a string id AND finite `x`. Drops
 * malformed entries silently so the caller doesn't have to. Preserves
 * input order so adopter z-ordering is respected when annotations
 * overlap.
 */
export function getLineAnnotatedFiniteAnnotations(
  annotations: readonly ChartLineAnnotatedAnnotation[] | undefined,
): ChartLineAnnotatedAnnotation[] {
  if (!Array.isArray(annotations)) return [];
  return annotations.filter(
    (a) => a && typeof a.id === 'string' && isFiniteNumber(a.x),
  );
}

export function getLineAnnotatedBounds(
  series: readonly ChartLineAnnotatedSeries[],
  annotations: readonly ChartLineAnnotatedAnnotation[] | undefined,
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
    for (const p of getLineAnnotatedFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      any = true;
    }
  }
  for (const a of getLineAnnotatedFiniteAnnotations(annotations)) {
    if (a.x < xMin) xMin = a.x;
    if (a.x > xMax) xMax = a.x;
    any = true;
  }
  if (!any) return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
  if (yMin === Number.POSITIVE_INFINITY) {
    yMin = 0;
    yMax = 1;
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

export function getLineAnnotatedTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_ANNOTATED_TICK_COUNT),
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

export function buildLineAnnotatedPath(
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
 * Resolves the y position of an annotation label given the label
 * position, the inner plot area, and the padding. Returns the y
 * coordinate plus the SVG `text-anchor` value the caller should use.
 *
 *  - `'top'` (default): label sits above the plot at `padding - 6`,
 *    anchor `'middle'`.
 *  - `'inline'`: label sits inside the plot at the top edge with a
 *    small offset (`padding + 12`), anchor `'middle'`.
 *  - `'bottom'`: label sits below the plot at
 *    `padding + innerHeight + 18`, anchor `'middle'`.
 */
export function resolveLineAnnotatedLabel(
  px: number,
  position: ChartLineAnnotatedLabelPosition,
  padding: number,
  innerHeight: number,
): { labelX: number; labelY: number; labelAnchor: 'start' | 'middle' | 'end' } {
  const x = isFiniteNumber(px) ? px : padding;
  if (position === 'bottom') {
    return {
      labelX: x,
      labelY: padding + Math.max(0, innerHeight) + 18,
      labelAnchor: 'middle',
    };
  }
  if (position === 'inline') {
    return {
      labelX: x,
      labelY: padding + 12,
      labelAnchor: 'middle',
    };
  }
  return {
    labelX: x,
    labelY: Math.max(0, padding - 6),
    labelAnchor: 'middle',
  };
}

export interface ComputeLineAnnotatedLayoutInput {
  series: readonly ChartLineAnnotatedSeries[];
  annotations?: readonly ChartLineAnnotatedAnnotation[];
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

export function computeLineAnnotatedLayout(
  input: ComputeLineAnnotatedLayoutInput,
): ComputeLineAnnotatedLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineAnnotatedLayoutResult = {
    series: [],
    annotations: [],
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
  const validAnnotations = getLineAnnotatedFiniteAnnotations(input.annotations);
  const visible = (input.series ?? []).filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0 && validAnnotations.length === 0) return empty;

  const bounds = getLineAnnotatedBounds(
    input.series ?? [],
    input.annotations,
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

  const indexById = new Map((input.series ?? []).map((s, i) => [s.id, i]));
  const seriesOut: ChartLineAnnotatedLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineAnnotatedDefaultColor(seriesIndex);
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineAnnotatedLayoutPoint[] = [];
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
    const path = buildLineAnnotatedPath(points);
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

  const annotationsOut: ChartLineAnnotatedLayoutAnnotation[] =
    validAnnotations.map((a, i) => {
      const px = xToPx(a.x);
      const color = a.color ?? DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_COLOR;
      const position: ChartLineAnnotatedLabelPosition =
        a.position ?? DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_POSITION;
      const dashArray =
        typeof a.dashArray === 'string'
          ? a.dashArray
          : DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_DASH;
      const inRange = a.x >= xMin && a.x <= xMax;
      const labelResolved = resolveLineAnnotatedLabel(
        px,
        position,
        padding,
        innerHeight,
      );
      const originalIndex = (input.annotations ?? []).indexOf(a);
      return {
        id: a.id,
        index: i,
        originalIndex,
        x: a.x,
        px,
        label: a.label,
        color,
        position,
        dashArray,
        inRange,
        labelX: labelResolved.labelX,
        labelY: labelResolved.labelY,
        labelAnchor: labelResolved.labelAnchor,
      };
    });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_ANNOTATED_TICK_COUNT;
  const xTicks = getLineAnnotatedTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineAnnotatedTicks(yMin, yMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + innerHeight - t.position * innerHeight,
  }));

  return {
    series: seriesOut,
    annotations: annotationsOut,
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

export function describeLineAnnotatedChart(
  series: readonly ChartLineAnnotatedSeries[],
  annotations: readonly ChartLineAnnotatedAnnotation[] | undefined,
  hidden?: readonly string[],
  formatValue?: (n: number) => string,
): string {
  const hiddenSet = new Set(hidden ?? []);
  const visible = (series ?? []).filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  const validAnnotations = getLineAnnotatedFiniteAnnotations(annotations);
  if (visible.length === 0 && validAnnotations.length === 0) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  let total = 0;
  for (const s of visible) {
    for (const _ of getLineAnnotatedFinitePoints(s.data ?? [])) total += 1;
  }
  if (total === 0 && validAnnotations.length === 0) return 'No data';
  const seriesPart = `${visible.length} series, ${total} points`;
  const annotationPart = `${validAnnotations.length} annotation${validAnnotations.length === 1 ? '' : 's'}`;
  if (validAnnotations.length === 0) {
    return `Annotated line chart: ${seriesPart}.`;
  }
  const labels = validAnnotations
    .map((a) => `${a.label} at ${fmtV(a.x)}`)
    .join('; ');
  return `Annotated line chart: ${seriesPart}, ${annotationPart}. Annotations: ${labels}.`;
}

export interface ChartLineAnnotatedPointClick {
  series: ChartLineAnnotatedLayoutSeries;
  point: ChartLineAnnotatedLayoutPoint;
}

export interface ChartLineAnnotatedAnnotationClick {
  annotation: ChartLineAnnotatedLayoutAnnotation;
}

export interface ChartLineAnnotatedSeriesToggle {
  series: ChartLineAnnotatedSeries;
  hidden: boolean;
}

export interface ChartLineAnnotatedProps {
  series: readonly ChartLineAnnotatedSeries[];
  annotations?: readonly ChartLineAnnotatedAnnotation[];
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
  annotationOpacity?: number;
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
  showAnnotationLines?: boolean;
  showAnnotationLabels?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineAnnotatedPointClick) => void;
  onAnnotationClick?: (info: ChartLineAnnotatedAnnotationClick) => void;
  onSeriesToggle?: (info: ChartLineAnnotatedSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineAnnotated = forwardRef(function ChartLineAnnotated(
  {
    series,
    annotations,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_ANNOTATED_WIDTH,
    height = DEFAULT_CHART_LINE_ANNOTATED_HEIGHT,
    padding = DEFAULT_CHART_LINE_ANNOTATED_PADDING,
    tickCount = DEFAULT_CHART_LINE_ANNOTATED_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_ANNOTATED_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_ANNOTATED_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_ANNOTATED_LINE_OPACITY,
    annotationOpacity = DEFAULT_CHART_LINE_ANNOTATED_ANNOTATION_OPACITY,
    gridColor = DEFAULT_CHART_LINE_ANNOTATED_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_ANNOTATED_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    showAnnotationLines = true,
    showAnnotationLabels = true,
    animate = true,
    className,
    ariaLabel = 'Annotated line chart',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onAnnotationClick,
    onSeriesToggle,
    style,
  }: ChartLineAnnotatedProps,
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
      computeLineAnnotatedLayout({
        series,
        annotations: annotations ?? [],
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
      annotations,
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
    describeLineAnnotatedChart(
      series,
      annotations ?? [],
      effectiveHidden,
      fmtValue,
    );
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);
  const annotationCount = layout.annotations.length;

  const toggleSeries = useCallback(
    (s: ChartLineAnnotatedSeries) => {
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
      data-section="chart-line-annotated"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-annotation-count={annotationCount}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-annotated-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-annotated-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-annotated-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-annotated-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-annotated-grid-line"
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
                  data-section="chart-line-annotated-grid-line"
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
            <g data-section="chart-line-annotated-axes">
              <line
                data-section="chart-line-annotated-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-annotated-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-annotated-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-annotated-tick"
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
                        data-section="chart-line-annotated-tick-label"
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
                <g data-section="chart-line-annotated-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-annotated-tick"
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
                        data-section="chart-line-annotated-tick-label"
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
                  data-section="chart-line-annotated-x-label"
                  x={padding + layout.innerWidth / 2}
                  y={padding + layout.innerHeight + 36}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                >
                  {xLabel}
                </text>
              ) : null}
              {yLabel ? (
                <text
                  data-section="chart-line-annotated-y-label"
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

          <g data-section="chart-line-annotated-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-annotated-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-annotated-path"
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
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-annotated-dot"
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

          {layout.annotations.length > 0 ? (
            <g data-section="chart-line-annotated-annotations">
              {layout.annotations.map((a) => {
                if (!a.inRange) return null;
                return (
                  <g
                    key={`anno-${a.id}`}
                    data-section="chart-line-annotated-annotation"
                    data-annotation-id={a.id}
                    data-annotation-index={a.index}
                    data-annotation-x={a.x}
                    data-annotation-px={a.px}
                    data-annotation-color={a.color}
                    data-annotation-position={a.position}
                  >
                    {showAnnotationLines ? (
                      <line
                        data-section="chart-line-annotated-annotation-line"
                        data-annotation-id={a.id}
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`Annotation ${a.label} at x ${fmtX(a.x)}`}
                        x1={a.px}
                        y1={padding}
                        x2={a.px}
                        y2={padding + layout.innerHeight}
                        stroke={a.color}
                        strokeOpacity={annotationOpacity}
                        strokeWidth={1.25}
                        strokeDasharray={a.dashArray || undefined}
                        onClick={() => {
                          if (onAnnotationClick) {
                            onAnnotationClick({ annotation: a });
                          }
                        }}
                      />
                    ) : null}
                    {showAnnotationLabels ? (
                      <text
                        data-section="chart-line-annotated-annotation-label"
                        data-annotation-id={a.id}
                        x={a.labelX}
                        y={a.labelY}
                        textAnchor={a.labelAnchor}
                        fontSize={10}
                        fill={a.color}
                        style={{ fontWeight: 600 }}
                      >
                        {a.label}
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 180);
          const ty = Math.min(Math.max(p.py - 36, 0), height - 48);
          return (
            <div
              data-section="chart-line-annotated-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-annotated-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-annotated-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-annotated-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-annotated-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineAnnotatedDefaultColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-line-annotated-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-annotated-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-annotated-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{ backgroundColor: color }}
                  />
                  <span data-section="chart-line-annotated-legend-label">
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

ChartLineAnnotated.displayName = 'ChartLineAnnotated';
