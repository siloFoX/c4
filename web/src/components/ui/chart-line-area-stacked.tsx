import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_AREA_STACKED_WIDTH = 560;
export const DEFAULT_CHART_LINE_AREA_STACKED_HEIGHT = 320;
export const DEFAULT_CHART_LINE_AREA_STACKED_PADDING = 40;
export const DEFAULT_CHART_LINE_AREA_STACKED_TICK_COUNT = 5;
export const DEFAULT_CHART_LINE_AREA_STACKED_STROKE_WIDTH = 1.4;
export const DEFAULT_CHART_LINE_AREA_STACKED_DOT_RADIUS = 3;
export const DEFAULT_CHART_LINE_AREA_STACKED_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_AREA_STACKED_AREA_OPACITY = 0.6;
export const DEFAULT_CHART_LINE_AREA_STACKED_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_LINE_AREA_STACKED_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_LINE_AREA_STACKED_STACK_MODE = 'absolute';
export const DEFAULT_CHART_LINE_AREA_STACKED_PALETTE = [
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

export type ChartLineAreaStackedMode = 'absolute' | 'percent';

export interface ChartLineAreaStackedPoint {
  x: number;
  y: number;
}

export interface ChartLineAreaStackedSeries {
  id: string;
  label: string;
  data: readonly ChartLineAreaStackedPoint[];
  color?: string;
}

export interface ChartLineAreaStackedLayoutPoint {
  index: number;
  x: number;
  yRaw: number;
  yBottom: number;
  yTop: number;
  px: number;
  pyBottom: number;
  pyTop: number;
  share: number;
}

export interface ChartLineAreaStackedLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartLineAreaStackedLayoutPoint[];
  areaPath: string;
  linePath: string;
  finiteCount: number;
  totalCount: number;
  raw: ReadonlyArray<ChartLineAreaStackedPoint>;
}

export interface ComputeLineAreaStackedLayoutResult {
  series: ChartLineAreaStackedLayoutSeries[];
  xTicks: { value: number; position: number }[];
  yTicks: { value: number; position: number }[];
  xUnion: number[];
  totals: number[];
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  innerWidth: number;
  innerHeight: number;
  stackMode: ChartLineAreaStackedMode;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineAreaStackedPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineAreaStackedPoint).x) &&
    isFiniteNumber((p as ChartLineAreaStackedPoint).y)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineAreaStackedDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_AREA_STACKED_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_AREA_STACKED_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_AREA_STACKED_PALETTE.length
  ]!;
}

export function getLineAreaStackedFinitePoints(
  points: readonly ChartLineAreaStackedPoint[],
): ChartLineAreaStackedPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Collects the sorted unique union of x values across every visible
 * series. Used as the canonical sample grid for stacking: each layer
 * is evaluated at every x in this union (missing x -> 0 contribution).
 */
export function collectLineAreaStackedXValues(
  series: readonly ChartLineAreaStackedSeries[],
  hidden?: readonly string[],
): number[] {
  const hiddenSet = new Set(hidden ?? []);
  const seen = new Set<number>();
  for (const s of series) {
    if (!s || typeof s.id !== 'string') continue;
    if (hiddenSet.has(s.id)) continue;
    for (const p of getLineAreaStackedFinitePoints(s.data ?? [])) {
      seen.add(p.x);
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/**
 * Builds a `Map<x, y>` of the series's finite samples. Used to evaluate
 * the series at any x in the union grid. Missing x -> caller defaults
 * to 0 contribution.
 */
export function buildLineAreaStackedYLookup(
  series: ChartLineAreaStackedSeries,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const p of getLineAreaStackedFinitePoints(series.data ?? [])) {
    out.set(p.x, p.y);
  }
  return out;
}

/** Treat negative / non-finite contributions as 0 for stacking. */
function clampNonNeg(v: number): number {
  if (!isFiniteNumber(v) || v < 0) return 0;
  return v;
}

export interface ComputeLineAreaStackedLayoutInput {
  series: readonly ChartLineAreaStackedSeries[];
  hidden?: readonly string[];
  stackMode?: ChartLineAreaStackedMode;
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  width: number;
  height: number;
  padding: number;
  tickCount?: number;
}

export function computeLineAreaStackedLayout(
  input: ComputeLineAreaStackedLayoutInput,
): ComputeLineAreaStackedLayoutResult {
  const stackMode: ChartLineAreaStackedMode =
    input.stackMode ?? DEFAULT_CHART_LINE_AREA_STACKED_STACK_MODE;
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);

  const empty: ComputeLineAreaStackedLayoutResult = {
    series: [],
    xTicks: [],
    yTicks: [],
    xUnion: [],
    totals: [],
    xMin: 0,
    xMax: 1,
    yMin: 0,
    yMax: 1,
    innerWidth,
    innerHeight,
    stackMode,
  };

  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  if (!input.series || input.series.length === 0) return empty;

  const hiddenSet = new Set(input.hidden ?? []);
  const visible = input.series.filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0) return empty;

  const xUnion = collectLineAreaStackedXValues(input.series, input.hidden);
  if (xUnion.length === 0) return empty;

  const lookups = visible.map((s) => buildLineAreaStackedYLookup(s));

  // Compute totals per x for percent mode + maximum-stack derivation.
  const totals: number[] = xUnion.map((x) => {
    let sum = 0;
    for (const lookup of lookups) {
      const v = lookup.get(x);
      sum += clampNonNeg(v ?? 0);
    }
    return sum;
  });

  // Compute peak stack height (absolute) for y range derivation.
  let peakTotal = 0;
  for (const t of totals) if (t > peakTotal) peakTotal = t;
  if (peakTotal === 0) peakTotal = 1;

  const isPercent = stackMode === 'percent';
  let xMin = isFiniteNumber(input.xMin) ? input.xMin : xUnion[0]!;
  let xMax = isFiniteNumber(input.xMax) ? input.xMax : xUnion[xUnion.length - 1]!;
  let yMin = isFiniteNumber(input.yMin) ? input.yMin : 0;
  let yMax = isFiniteNumber(input.yMax)
    ? input.yMax
    : isPercent
      ? 1
      : peakTotal;
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
  const xUnionPxList = xUnion.map(xToPx);

  // Per-x running cumulative bottom for each layer; arrays length = xUnion.length.
  const cumBelow: number[] = xUnion.map(() => 0);
  const indexById = new Map(input.series.map((s, i) => [s.id, i]));

  const seriesOut: ChartLineAreaStackedLayoutSeries[] = visible.map(
    (s, layerIdx) => {
      const seriesIndex = indexById.get(s.id) ?? 0;
      const color = s.color ?? getLineAreaStackedDefaultColor(seriesIndex);
      const lookup = lookups[layerIdx]!;
      const points: ChartLineAreaStackedLayoutPoint[] = [];
      for (let i = 0; i < xUnion.length; i += 1) {
        const x = xUnion[i]!;
        const raw = clampNonNeg(lookup.get(x) ?? 0);
        const total = totals[i]!;
        const normalised = isPercent
          ? total > 0
            ? raw / total
            : 0
          : raw;
        const yBottom = cumBelow[i]!;
        const yTop = yBottom + normalised;
        cumBelow[i] = yTop;
        const share = total > 0 ? raw / total : 0;
        points.push({
          index: i,
          x,
          yRaw: raw,
          yBottom,
          yTop,
          px: xUnionPxList[i]!,
          pyBottom: yToPx(yBottom),
          pyTop: yToPx(yTop),
          share,
        });
      }
      // Top line forward.
      let linePath = '';
      if (points.length > 0) {
        linePath = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.pyTop)}`;
        for (let i = 1; i < points.length; i += 1) {
          linePath += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.pyTop)}`;
        }
      }
      // Area: top edge forward, then bottom edge reversed, then Z.
      let areaPath = '';
      if (points.length > 0) {
        areaPath = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.pyTop)}`;
        for (let i = 1; i < points.length; i += 1) {
          areaPath += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.pyTop)}`;
        }
        for (let i = points.length - 1; i >= 0; i -= 1) {
          areaPath += ` L ${fmt(points[i]!.px)} ${fmt(points[i]!.pyBottom)}`;
        }
        areaPath += ' Z';
      }
      const finiteCount = points.reduce(
        (acc, p) => acc + (p.yRaw > 0 ? 1 : 0),
        0,
      );
      const totalCount = (Array.isArray(s.data) ? s.data : []).length;
      return {
        id: s.id,
        label: s.label,
        index: seriesIndex,
        color,
        points,
        areaPath,
        linePath,
        finiteCount,
        totalCount,
        raw: getLineAreaStackedFinitePoints(s.data ?? []),
      };
    },
  );

  const tickCount =
    input.tickCount ?? DEFAULT_CHART_LINE_AREA_STACKED_TICK_COUNT;
  const stepCount = Math.max(2, Math.floor(tickCount));
  const xTicks: { value: number; position: number }[] = [];
  for (let i = 0; i < stepCount; i += 1) {
    const value = xMin + (xRange * i) / (stepCount - 1);
    xTicks.push({ value, position: padding + ((value - xMin) / xRange) * innerWidth });
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
    series: seriesOut,
    xTicks,
    yTicks,
    xUnion,
    totals,
    xMin,
    xMax,
    yMin,
    yMax,
    innerWidth,
    innerHeight,
    stackMode,
  };
}

export function describeLineAreaStackedChart(
  series: readonly ChartLineAreaStackedSeries[],
  hidden?: readonly string[],
  stackMode: ChartLineAreaStackedMode = DEFAULT_CHART_LINE_AREA_STACKED_STACK_MODE,
  formatValue?: (n: number) => string,
): string {
  const hiddenSet = new Set(hidden ?? []);
  const visible = (series ?? []).filter(
    (s) => s && typeof s.id === 'string' && !hiddenSet.has(s.id),
  );
  if (visible.length === 0) return 'No data';
  const fmtV = formatValue ?? ((n: number) => String(n));
  let total = 0;
  for (const s of visible) {
    for (const _ of getLineAreaStackedFinitePoints(s.data ?? [])) total += 1;
  }
  if (total === 0) return 'No data';
  const xUnion = collectLineAreaStackedXValues(series, hidden);
  const xMin = xUnion[0] ?? 0;
  const xMax = xUnion[xUnion.length - 1] ?? 1;
  return `Stacked line + area chart (${stackMode}) with ${visible.length} series and ${total} points across ${xUnion.length} x samples. x range ${fmtV(xMin)} to ${fmtV(xMax)}.`;
}

export interface ChartLineAreaStackedPointClick {
  series: ChartLineAreaStackedLayoutSeries;
  point: ChartLineAreaStackedLayoutPoint;
}

export interface ChartLineAreaStackedSeriesToggle {
  series: ChartLineAreaStackedSeries;
  hidden: boolean;
}

export interface ChartLineAreaStackedProps {
  series: readonly ChartLineAreaStackedSeries[];
  stackMode?: ChartLineAreaStackedMode;
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
  areaOpacity?: number;
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
  formatPercent?: (n: number) => string;
  xLabel?: string;
  yLabel?: string;
  onPointClick?: (info: ChartLineAreaStackedPointClick) => void;
  onSeriesToggle?: (info: ChartLineAreaStackedSeriesToggle) => void;
  style?: CSSProperties;
}

export const ChartLineAreaStacked = forwardRef(function ChartLineAreaStacked(
  {
    series = [],
    stackMode = DEFAULT_CHART_LINE_AREA_STACKED_STACK_MODE,
    xMin,
    xMax,
    yMin,
    yMax,
    width = DEFAULT_CHART_LINE_AREA_STACKED_WIDTH,
    height = DEFAULT_CHART_LINE_AREA_STACKED_HEIGHT,
    padding = DEFAULT_CHART_LINE_AREA_STACKED_PADDING,
    tickCount = DEFAULT_CHART_LINE_AREA_STACKED_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_LINE_AREA_STACKED_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_AREA_STACKED_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_AREA_STACKED_LINE_OPACITY,
    areaOpacity = DEFAULT_CHART_LINE_AREA_STACKED_AREA_OPACITY,
    gridColor = DEFAULT_CHART_LINE_AREA_STACKED_GRID_COLOR,
    axisColor = DEFAULT_CHART_LINE_AREA_STACKED_AXIS_COLOR,
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
    ariaLabel = 'Stacked line + area chart',
    ariaDescription,
    formatValue,
    formatX,
    formatPercent,
    xLabel,
    yLabel,
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartLineAreaStackedProps,
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
  const fmtPercent = useCallback(
    (n: number) =>
      formatPercent
        ? formatPercent(n)
        : `${(n * 100).toFixed(n >= 0.1 ? 0 : 1)}%`,
    [formatPercent],
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
      computeLineAreaStackedLayout({
        series,
        hidden: effectiveHidden,
        stackMode,
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
      stackMode,
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
    describeLineAreaStackedChart(series, effectiveHidden, stackMode, fmtValue);
  const visibleCount = layout.series.length;
  const totalPoints = layout.series.reduce((a, s) => a + s.finiteCount, 0);

  const toggleSeries = useCallback(
    (s: ChartLineAreaStackedSeries) => {
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

  const isPercent = stackMode === 'percent';

  return (
    <div
      ref={ref}
      role="region"
      aria-label={ariaLabel}
      aria-describedby={ariaDescId}
      data-section="chart-line-area-stacked"
      data-stack-mode={stackMode}
      data-series-count={series.length}
      data-visible-series-count={visibleCount}
      data-total-points={totalPoints}
      data-x-union-count={layout.xUnion.length}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-area-stacked-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-area-stacked-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-area-stacked-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {showGrid ? (
            <g data-section="chart-line-area-stacked-grid">
              {layout.xTicks.map((t) => (
                <line
                  key={`grid-x-${t.value}`}
                  data-section="chart-line-area-stacked-grid-line"
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
                  data-section="chart-line-area-stacked-grid-line"
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
            <g data-section="chart-line-area-stacked-axes">
              <line
                data-section="chart-line-area-stacked-axis"
                data-axis="x"
                x1={padding}
                y1={padding + layout.innerHeight}
                x2={padding + layout.innerWidth}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              <line
                data-section="chart-line-area-stacked-axis"
                data-axis="y"
                x1={padding}
                y1={padding}
                x2={padding}
                y2={padding + layout.innerHeight}
                stroke={axisColor}
                strokeWidth={1}
              />
              {layout.xTicks.length > 0 ? (
                <g data-section="chart-line-area-stacked-ticks" data-axis="x">
                  {layout.xTicks.map((t) => (
                    <g
                      key={`tick-x-${t.value}`}
                      data-section="chart-line-area-stacked-tick"
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
                        data-section="chart-line-area-stacked-tick-label"
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
                <g data-section="chart-line-area-stacked-ticks" data-axis="y">
                  {layout.yTicks.map((t) => (
                    <g
                      key={`tick-y-${t.value}`}
                      data-section="chart-line-area-stacked-tick"
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
                        data-section="chart-line-area-stacked-tick-label"
                        data-axis="y"
                        data-tick-value={t.value}
                        x={padding - 6}
                        y={t.position + 3}
                        textAnchor="end"
                        fontSize={10}
                        fill="currentColor"
                      >
                        {isPercent ? fmtPercent(t.value) : fmtValue(t.value)}
                      </text>
                    </g>
                  ))}
                </g>
              ) : null}
              {xLabel ? (
                <text
                  data-section="chart-line-area-stacked-x-label"
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
                  data-section="chart-line-area-stacked-y-label"
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

          <g data-section="chart-line-area-stacked-series">
            {layout.series.map((s) => {
              const isAnyHovered = hoveredKey !== null;
              const isSeriesHovered =
                isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
              const seriesDim =
                isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
              const areaDim =
                isAnyHovered && !isSeriesHovered ? areaOpacity * 0.4 : areaOpacity;
              return (
                <g
                  key={s.id}
                  data-section="chart-line-area-stacked-series-group"
                  data-series-id={s.id}
                  data-series-index={s.index}
                  data-series-color={s.color}
                  data-series-point-count={s.points.length}
                  data-series-finite-count={s.finiteCount}
                  data-hovered={isSeriesHovered ? 'true' : 'false'}
                  style={{ color: s.color }}
                >
                  <path
                    data-section="chart-line-area-stacked-area"
                    data-series-id={s.id}
                    d={s.areaPath}
                    fill={s.color}
                    fillOpacity={areaDim}
                    stroke="none"
                  />
                  <path
                    data-section="chart-line-area-stacked-path"
                    data-series-id={s.id}
                    role="graphics-symbol"
                    tabIndex={0}
                    aria-label={`${s.label}: stacked layer top with ${s.points.length} samples`}
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
                        if (p.yRaw <= 0) return null;
                        const key = `${s.id}::${p.index}`;
                        const isHovered = hoveredKey === key;
                        const dotOpacity =
                          isAnyHovered && !isHovered ? 0.3 : 1;
                        const aria = `${s.label}: x=${fmtX(p.x)}, y=${fmtValue(p.yRaw)}${isPercent ? ` (${fmtPercent(p.share)})` : ''}`;
                        return (
                          <circle
                            key={key}
                            data-section="chart-line-area-stacked-dot"
                            data-series-id={s.id}
                            data-point-index={p.index}
                            data-x={p.x}
                            data-y-raw={p.yRaw}
                            data-y-top={p.yTop}
                            data-y-bottom={p.yBottom}
                            data-share={p.share}
                            data-hovered={isHovered ? 'true' : 'false'}
                            role="graphics-symbol"
                            tabIndex={0}
                            aria-label={aria}
                            cx={p.px}
                            cy={p.pyTop}
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
          const tx = Math.min(Math.max(p.px + 8, 0), width - 180);
          const ty = Math.min(Math.max(p.pyTop - 48, 0), height - 64);
          const total = layout.totals[idx] ?? 0;
          return (
            <div
              data-section="chart-line-area-stacked-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[160px] rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-area-stacked-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-area-stacked-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-area-stacked-tooltip-y"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                y: {fmtValue(p.yRaw)}
              </div>
              <div
                data-section="chart-line-area-stacked-tooltip-share"
                className="text-slate-500"
              >
                share: {fmtPercent(p.share)} of {fmtValue(total)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && series.length > 0 ? (
        <ul
          data-section="chart-line-area-stacked-legend"
          className="mt-2 flex flex-wrap gap-x-3 gap-y-1"
        >
          {series.map((s, i) => {
            const isHidden = effectiveHidden.includes(s.id);
            const color = s.color ?? getLineAreaStackedDefaultColor(i);
            return (
              <li
                key={s.id}
                data-section="chart-line-area-stacked-legend-item"
                data-series-id={s.id}
                data-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-area-stacked-legend-button"
                  className={`flex items-center gap-1 ${isHidden ? 'opacity-50 line-through' : ''}`}
                  onClick={() => toggleSeries(s)}
                >
                  <span
                    data-section="chart-line-area-stacked-legend-swatch"
                    className="inline-block h-3 w-4"
                    style={{ backgroundColor: color, opacity: areaOpacity }}
                  />
                  <span data-section="chart-line-area-stacked-legend-label">
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

ChartLineAreaStacked.displayName = 'ChartLineAreaStacked';
