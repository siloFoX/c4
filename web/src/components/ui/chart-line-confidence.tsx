import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_CONFIDENCE_WIDTH = 560;
export const DEFAULT_CHART_LINE_CONFIDENCE_HEIGHT = 320;
export const DEFAULT_CHART_LINE_CONFIDENCE_PADDING = 40;
export const DEFAULT_CHART_LINE_CONFIDENCE_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_CONFIDENCE_STROKE_WIDTH = 1.75;
export const DEFAULT_CHART_LINE_CONFIDENCE_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_CONFIDENCE_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_CONFIDENCE_BAND_OPACITY = 0.2;
export const DEFAULT_CHART_LINE_CONFIDENCE_BAND_STROKE_WIDTH = 0;
export const DEFAULT_CHART_LINE_CONFIDENCE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_CONFIDENCE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_CONFIDENCE_PALETTE = [
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

export interface ChartLineConfidencePoint {
  x: number;
  y: number;
  yLower?: number;
  yUpper?: number;
}

export interface ChartLineConfidenceSeries {
  id: string;
  label: string;
  data: readonly ChartLineConfidencePoint[];
  color?: string;
  bandColor?: string;
  showBand?: boolean;
}

export interface ChartLineConfidenceLayoutPoint {
  index: number;
  x: number;
  y: number;
  yLower: number | null;
  yUpper: number | null;
  px: number;
  py: number;
  pyLower: number | null;
  pyUpper: number | null;
  hasBand: boolean;
}

export interface ChartLineConfidenceBandSegment {
  index: number;
  startIndex: number;
  endIndex: number;
  pointCount: number;
  path: string;
}

export interface ChartLineConfidenceLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  bandColor: string;
  showBand: boolean;
  points: ChartLineConfidenceLayoutPoint[];
  bandSegments: ChartLineConfidenceBandSegment[];
  linePath: string;
  finiteCount: number;
  bandCount: number;
  totalCount: number;
}

export interface ComputeLineConfidenceLayoutResult {
  series: ChartLineConfidenceLayoutSeries[];
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

function isFiniteCenterPoint(p: unknown): p is ChartLineConfidencePoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineConfidencePoint).x) &&
    isFiniteNumber((p as ChartLineConfidencePoint).y)
  );
}

function hasFiniteBand(p: ChartLineConfidencePoint): boolean {
  return (
    isFiniteNumber(p.yLower) &&
    isFiniteNumber(p.yUpper) &&
    (p.yLower as number) <= (p.yUpper as number)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineConfidenceDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_CONFIDENCE_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_CONFIDENCE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_CONFIDENCE_PALETTE.length
  ]!;
}

export function getLineConfidenceFinitePoints(
  points: readonly ChartLineConfidencePoint[],
): ChartLineConfidencePoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFiniteCenterPoint);
}

export function getLineConfidenceBounds(
  series: readonly ChartLineConfidenceSeries[],
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
    const showBand = s.showBand !== false;
    for (const p of getLineConfidenceFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      if (showBand && hasFiniteBand(p)) {
        const lo = p.yLower as number;
        const hi = p.yUpper as number;
        if (lo < yMin) yMin = lo;
        if (hi > yMax) yMax = hi;
      }
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

export function getLineConfidenceTicks(
  min: number,
  max: number,
  count?: number,
): { value: number; position: number }[] {
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return [];
  if (max < min) return [];
  const n = Math.max(
    2,
    Math.floor(count ?? DEFAULT_CHART_LINE_CONFIDENCE_TICK_COUNT),
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

/** `M x y L x y L x y ...` builder for the central line. */
export function buildLineConfidenceLinePath(
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
 * Walks the points in input order and emits one closed band polygon
 * per contiguous run of `hasBand` points. Each segment polygon is
 * `M low[0] L low[1] ... L low[n-1] L up[n-1] ... L up[0] Z`. Runs of
 * fewer than 2 points produce no segment (a single isolated band point
 * cannot form a polygon). Returns `[]` when no run qualifies.
 */
export function buildLineConfidenceBandSegments(
  points: ReadonlyArray<{
    px: number;
    pyLower: number | null;
    pyUpper: number | null;
    hasBand: boolean;
    index: number;
  }>,
): ChartLineConfidenceBandSegment[] {
  if (!Array.isArray(points) || points.length === 0) return [];
  type BandPoint = {
    px: number;
    pyLower: number | null;
    pyUpper: number | null;
    hasBand: boolean;
    index: number;
  };
  const segs: ChartLineConfidenceBandSegment[] = [];
  let run: BandPoint[] = [];
  function flush(): void {
    if (run.length < 2) return;
    const startIndex = run[0]!.index;
    const endIndex = run[run.length - 1]!.index;
    let path = `M ${fmt(run[0]!.px)} ${fmt(run[0]!.pyLower as number)}`;
    for (let i = 1; i < run.length; i += 1) {
      path += ` L ${fmt(run[i]!.px)} ${fmt(run[i]!.pyLower as number)}`;
    }
    for (let i = run.length - 1; i >= 0; i -= 1) {
      path += ` L ${fmt(run[i]!.px)} ${fmt(run[i]!.pyUpper as number)}`;
    }
    path += ' Z';
    segs.push({
      index: segs.length,
      startIndex,
      endIndex,
      pointCount: run.length,
      path,
    });
  }
  for (const p of points) {
    if (
      p.hasBand &&
      isFiniteNumber(p.pyLower as number) &&
      isFiniteNumber(p.pyUpper as number)
    ) {
      run.push(p);
    } else {
      flush();
      run = [];
    }
  }
  flush();
  return segs;
}

export interface ComputeLineConfidenceLayoutInput {
  series: readonly ChartLineConfidenceSeries[];
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

export function computeLineConfidenceLayout(
  input: ComputeLineConfidenceLayoutInput,
): ComputeLineConfidenceLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineConfidenceLayoutResult = {
    series: [],
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
  if (!input.series || input.series.length === 0) return empty;

  const hiddenSet = new Set(input.hidden ?? []);
  const visible = input.series.filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0) return empty;

  const bounds = getLineConfidenceBounds(input.series, input.hidden);
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
  const seriesOut: ChartLineConfidenceLayoutSeries[] = visible.map((s) => {
    const seriesIndex = indexById.get(s.id) ?? 0;
    const color = s.color ?? getLineConfidenceDefaultColor(seriesIndex);
    const bandColor = s.bandColor ?? color;
    const showBand = s.showBand !== false;
    const arr = Array.isArray(s.data) ? s.data : [];
    const points: ChartLineConfidenceLayoutPoint[] = [];
    let bandCount = 0;
    for (let i = 0; i < arr.length; i += 1) {
      const p = arr[i]!;
      if (!isFiniteCenterPoint(p)) continue;
      const bandValid = hasFiniteBand(p);
      if (bandValid && showBand) bandCount += 1;
      const yLower = bandValid ? (p.yLower as number) : null;
      const yUpper = bandValid ? (p.yUpper as number) : null;
      points.push({
        index: i,
        x: p.x,
        y: p.y,
        yLower,
        yUpper,
        px: xToPx(p.x),
        py: yToPx(p.y),
        pyLower: bandValid ? yToPx(yLower as number) : null,
        pyUpper: bandValid ? yToPx(yUpper as number) : null,
        hasBand: bandValid && showBand,
      });
    }
    const linePath = buildLineConfidenceLinePath(points);
    const bandSegments = showBand
      ? buildLineConfidenceBandSegments(
          points.map((p) => ({
            px: p.px,
            pyLower: p.pyLower,
            pyUpper: p.pyUpper,
            hasBand: p.hasBand,
            index: p.index,
          })),
        )
      : [];
    return {
      id: s.id,
      label: s.label,
      index: seriesIndex,
      color,
      bandColor,
      showBand,
      points,
      bandSegments,
      linePath,
      finiteCount: points.length,
      bandCount,
      totalCount: arr.length,
    };
  });

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_CONFIDENCE_TICK_COUNT;
  const xTicks = getLineConfidenceTicks(xMin, xMax, tickCount).map((t) => ({
    value: t.value,
    position: padding + t.position * innerWidth,
  }));
  const yTicks = getLineConfidenceTicks(yMin, yMax, tickCount).map((t) => ({
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
    innerWidth,
    innerHeight,
  };
}

export function describeLineConfidenceChart(
  series: readonly ChartLineConfidenceSeries[],
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
  let bandCount = 0;
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let yMin = Number.POSITIVE_INFINITY;
  let yMax = Number.NEGATIVE_INFINITY;
  for (const s of visible) {
    const showBand = s.showBand !== false;
    for (const p of getLineConfidenceFinitePoints(s.data ?? [])) {
      total += 1;
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
      if (showBand && hasFiniteBand(p)) {
        bandCount += 1;
        const lo = p.yLower as number;
        const hi = p.yUpper as number;
        if (lo < yMin) yMin = lo;
        if (hi > yMax) yMax = hi;
      }
    }
  }
  if (total === 0) return 'No data';
  return `Line chart with confidence band: ${visible.length} series and ${total} points, ${bandCount} with bands. x range ${fmtV(xMin)} to ${fmtV(xMax)}, y range ${fmtV(yMin)} to ${fmtV(yMax)}.`;
}

export interface ChartLineConfidencePointClick {
  series: ChartLineConfidenceLayoutSeries;
  point: ChartLineConfidenceLayoutPoint;
}

export interface ChartLineConfidenceSeriesToggle {
  series: ChartLineConfidenceSeries;
  hidden: boolean;
}

export interface ChartLineConfidenceProps {
  series: readonly ChartLineConfidenceSeries[];
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
  bandOpacity?: number;
  bandStrokeWidth?: number;
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
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineConfidencePointClick) => void;
  onSeriesToggle?: (info: ChartLineConfidenceSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineConfidence = forwardRef(function ChartLineConfidence(
  {
    series = [],
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_CONFIDENCE_WIDTH,
    height = DEFAULT_CHART_LINE_CONFIDENCE_HEIGHT,
    padding = DEFAULT_CHART_LINE_CONFIDENCE_PADDING,
    tickCount = DEFAULT_CHART_LINE_CONFIDENCE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_CONFIDENCE_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_CONFIDENCE_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_CONFIDENCE_LINE_OPACITY,
    bandOpacity = DEFAULT_CHART_LINE_CONFIDENCE_BAND_OPACITY,
    bandStrokeWidth = DEFAULT_CHART_LINE_CONFIDENCE_BAND_STROKE_WIDTH,
    gridColor = DEFAULT_CHART_LINE_CONFIDENCE_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_CONFIDENCE_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showAxis = true,
    showGrid = true,
    showDots = true,
    showLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Line chart with confidence band',
    ariaDescription,
    formatValue,
    formatX,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineConfidenceProps,
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
      computeLineConfidenceLayout({
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
    describeLineConfidenceChart(series, effectiveHidden, fmtValue);
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);
  const totalBands = layout.series.reduce((a, s) => a + s.bandCount, 0);

  const toggleSeries = useCallback(
    (s: ChartLineConfidenceSeries) => {
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
      data-section="chart-line-confidence"
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-band-count={totalBands}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-confidence-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-confidence-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-confidence-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-confidence-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-confidence-grid-line"
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
                  data-section="chart-line-confidence-grid-line"
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
            <g data-section="chart-line-confidence-axes">
              <line
                data-section="chart-line-confidence-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-confidence-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-confidence-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-confidence-tick"
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
                        data-section="chart-line-confidence-tick-label"
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
                <g data-section="chart-line-confidence-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-confidence-tick"
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
                        data-section="chart-line-confidence-tick-label"
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
                  data-section="chart-line-confidence-x-label"
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
                  data-section="chart-line-confidence-y-label"
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

          <g data-section="chart-line-confidence-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              const seriesBandDim =
                isAnyHovered && !isSeriesHovered ? bandOpacity * 0.3 : bandOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-confidence-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-band-color={s.bandColor}
                  data-series-show-band={s.showBand ? 'true' : 'false'}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-series-band-count={s.bandCount}
                  data-series-segment-count={s.bandSegments.length}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  {s.showBand
                    ? s.bandSegments.map((seg) => (
                        <path
                          key={`band-${s.id}-${seg.index}`}
                          data-section="chart-line-confidence-band"
                          data-series-id={s.id}
                          data-segment-index={seg.index}
                          data-segment-start={seg.startIndex}
                          data-segment-end={seg.endIndex}
                          data-segment-point-count={seg.pointCount}
                          d={seg.path}
                          fill={s.bandColor}
                          fillOpacity={seriesBandDim}
                          stroke={s.bandColor}
                          strokeOpacity={
                            bandStrokeWidth > 0 ? seriesBandDim : 0
                          }
                          strokeWidth={bandStrokeWidth}
                        />
                      ))
                    : null}
                  <path
                    data-section="chart-line-confidence-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: line with ${s.finiteCount} points and ${s.bandCount} band points`}
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
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.y)}${p.hasBand ? `, range ${fmtValue(p.yLower!)} to ${fmtValue(p.yUpper!)}` : ''}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-confidence-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y={p.y}
                            data-has-band={p.hasBand ? 'true' : 'false'}
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 200);
          const ty = Math.min(Math.max(p.py - 48, 0), height - 64);
          return (
            <div
              data-section="chart-line-confidence-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              data-has-band={p.hasBand ? 'true' : 'false'}
              className="pointer-events-none absolute z-10 min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-confidence-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-confidence-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-confidence-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.y)}
              </div>
              {p.hasBand ? (
                <div
                  data-section="chart-line-confidence-tooltip-band"
                  className="text-slate-500"
                >
                  band: {fmtValue(p.yLower!)} to {fmtValue(p.yUpper!)}
                </div>
              ) : null}
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-confidence-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineConfidenceDefaultColor(i);
            const swatchBand = s.bandColor ?? color;
            return (
              <li
                key={s.id}
                data-section="chart-line-confidence-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-confidence-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-confidence-legend-swatch"
                    className="relative inline-block h-3 w-4"
                  >
                    <span
                      className="absolute inset-0"
                      style={{
                        backgroundColor: swatchBand,
                        opacity: bandOpacity,
                      }}
                    />
                    <span
                      className="absolute left-0 right-0 top-1/2 h-0.5 -translate-y-1/2"
                      style={{ backgroundColor: color }}
                    />
                  </span>
                  <span data-section="chart-line-confidence-legend-label">
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

ChartLineConfidence.displayName = 'ChartLineConfidence';
