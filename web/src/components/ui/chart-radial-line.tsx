import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_RADIAL_LINE_WIDTH = 380;
export const DEFAULT_CHART_RADIAL_LINE_HEIGHT = 380;
export const DEFAULT_CHART_RADIAL_LINE_PADDING = 32;
export const DEFAULT_CHART_RADIAL_LINE_INNER_RADIUS = 24;
export const DEFAULT_CHART_RADIAL_LINE_START_ANGLE = -Math.PI / 2;
export const DEFAULT_CHART_RADIAL_LINE_TICK_COUNT = 4;
export const DEFAULT_CHART_RADIAL_LINE_STROKE_WIDTH = 1.6;
export const DEFAULT_CHART_RADIAL_LINE_POINT_RADIUS = 3;
export const DEFAULT_CHART_RADIAL_LINE_FILL_OPACITY = 0.15;
export const DEFAULT_CHART_RADIAL_LINE_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_RADIAL_LINE_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_RADIAL_LINE_PALETTE = [
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

export type ChartRadialLineMode = 'cyclic' | 'spiral';

export interface ChartRadialLineSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
}

export interface ChartRadialLineLayoutPoint {
  seriesId: string;
  seriesIndex: number;
  index: number;
  cycle: number;
  positionInCycle: number;
  value: number;
  angle: number;
  radius: number;
  x: number;
  y: number;
  isFinite: boolean;
}

export interface ChartRadialLineLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartRadialLineLayoutPoint[];
  linePath: string;
  fillPath: string;
}

export interface ComputeRadialLineLayoutResult {
  series: ChartRadialLineLayoutSeries[];
  axisAngles: { angle: number; label: string; index: number }[];
  rings: { value: number; radius: number }[];
  maxValue: number;
  cycleLength: number;
  totalCycles: number;
  innerRadius: number;
  outerRadius: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function getRadialLineDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_RADIAL_LINE_PALETTE[0]!;
  }
  return DEFAULT_CHART_RADIAL_LINE_PALETTE[
    Math.floor(index) % DEFAULT_CHART_RADIAL_LINE_PALETTE.length
  ]!;
}

export function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angle: number
): { x: number; y: number } {
  return {
    x: cx + radius * Math.cos(angle),
    y: cy + radius * Math.sin(angle),
  };
}

export function getRadialLineCyclicAngle(
  positionInCycle: number,
  cycleLength: number,
  startAngle: number
): number {
  if (!isFiniteNumber(cycleLength) || cycleLength <= 0) return startAngle;
  return startAngle + (positionInCycle / cycleLength) * Math.PI * 2;
}

export function getRadialLineMaxValue(
  series: readonly ChartRadialLineSeries[],
  hidden: ReadonlySet<string>
): number {
  let max = 0;
  for (const s of series) {
    if (hidden.has(s.id)) continue;
    for (const v of s.data) {
      if (isFiniteNumber(v) && v > max) max = v;
    }
  }
  return max > 0 ? max : 1;
}

export function getRadialLineSampleCount(
  series: readonly ChartRadialLineSeries[],
  hidden: ReadonlySet<string>
): number {
  let max = 0;
  for (const s of series) {
    if (hidden.has(s.id)) continue;
    if (s.data.length > max) max = s.data.length;
  }
  return max;
}

export function getRadialLineTicks(
  max: number,
  count: number = DEFAULT_CHART_RADIAL_LINE_TICK_COUNT
): number[] {
  const c = Math.max(2, Math.floor(count) || 0);
  if (!isFiniteNumber(max) || max <= 0) return [0];
  const step = max / (c - 1);
  return Array.from({ length: c }, (_, i) => step * i);
}

export interface ComputeRadialLineLayoutInput {
  series: readonly ChartRadialLineSeries[];
  hidden: ReadonlySet<string>;
  mode: ChartRadialLineMode;
  cycleLength: number;
  axisLabels?: readonly string[];
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  maxValueOverride?: number;
  tickCount: number;
  closeCyclic: boolean;
}

export function computeRadialLineLayout(
  input: ComputeRadialLineLayoutInput
): ComputeRadialLineLayoutResult {
  const {
    series,
    hidden,
    mode,
    cycleLength,
    axisLabels,
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    maxValueOverride,
    tickCount,
    closeCyclic,
  } = input;
  if (
    !series.length ||
    outerRadius <= 0 ||
    outerRadius <= innerRadius ||
    cycleLength <= 0
  ) {
    return {
      series: [],
      axisAngles: [],
      rings: [],
      maxValue: 0,
      cycleLength: cycleLength > 0 ? cycleLength : 0,
      totalCycles: 0,
      innerRadius,
      outerRadius,
    };
  }
  const autoMax = getRadialLineMaxValue(series, hidden);
  const maxValue =
    isFiniteNumber(maxValueOverride) && maxValueOverride > 0
      ? maxValueOverride
      : autoMax;
  const sampleCount = getRadialLineSampleCount(series, hidden);
  const totalCycles =
    mode === 'spiral' && sampleCount > 0
      ? Math.max(1, Math.ceil(sampleCount / cycleLength))
      : 1;

  const radialSpan = outerRadius - innerRadius;
  const radiusForValue = (value: number, samplePos: number): number => {
    if (!isFiniteNumber(value) || value <= 0) return innerRadius;
    const valueRatio = Math.max(0, Math.min(1, value / maxValue));
    if (mode === 'cyclic') {
      return innerRadius + valueRatio * radialSpan;
    }
    // spiral: combine value ratio with sample position along spiral
    const spiralRatio =
      sampleCount > 1 ? samplePos / (sampleCount - 1) : 0;
    return innerRadius + (valueRatio * 0.4 + spiralRatio * 0.6) * radialSpan;
  };

  const angleFor = (samplePos: number): number => {
    if (mode === 'cyclic') {
      return getRadialLineCyclicAngle(samplePos, cycleLength, startAngle);
    }
    // spiral: angle accumulates over cycles
    return startAngle + (samplePos / cycleLength) * Math.PI * 2;
  };

  const outSeries: ChartRadialLineLayoutSeries[] = [];
  for (let s = 0; s < series.length; s++) {
    const seriesDef = series[s]!;
    if (hidden.has(seriesDef.id)) continue;
    const points: ChartRadialLineLayoutPoint[] = [];
    const lineCmds: string[] = [];
    let lastCmd = 'M';
    for (let i = 0; i < seriesDef.data.length; i++) {
      const value = seriesDef.data[i]!;
      const samplePos = i;
      const positionInCycle = i % cycleLength;
      const cycle = Math.floor(i / cycleLength);
      const angle = angleFor(samplePos);
      const radius = radiusForValue(value, samplePos);
      const pt = polarToCartesian(cx, cy, radius, angle);
      const finite = isFiniteNumber(value);
      points.push({
        seriesId: seriesDef.id,
        seriesIndex: s,
        index: i,
        cycle,
        positionInCycle,
        value: finite ? value : 0,
        angle,
        radius,
        x: pt.x,
        y: pt.y,
        isFinite: finite,
      });
      if (!finite) {
        lastCmd = 'M';
        continue;
      }
      lineCmds.push(
        `${lastCmd} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`
      );
      lastCmd = 'L';
    }
    let linePath = lineCmds.join(' ');
    let fillPath = '';
    if (mode === 'cyclic' && closeCyclic && points.length > 1) {
      const finitePoints = points.filter((p) => p.isFinite);
      if (finitePoints.length > 1) {
        linePath += ` L ${finitePoints[0]!.x.toFixed(2)} ${finitePoints[0]!.y.toFixed(2)}`;
        fillPath = linePath + ' Z';
      }
    }
    const color = seriesDef.color ?? getRadialLineDefaultColor(s);
    outSeries.push({
      id: seriesDef.id,
      label: seriesDef.label,
      index: s,
      color,
      points,
      linePath,
      fillPath,
    });
  }

  const axisAngles: { angle: number; label: string; index: number }[] = [];
  const cyclicSteps = Math.max(1, Math.floor(cycleLength));
  for (let i = 0; i < cyclicSteps; i++) {
    const angle = startAngle + (i / cyclicSteps) * Math.PI * 2;
    const label =
      axisLabels && axisLabels[i] != null ? axisLabels[i] : String(i);
    axisAngles.push({ angle, label, index: i });
  }

  const tickValues = getRadialLineTicks(maxValue, tickCount);
  const rings = tickValues
    .filter((t) => t > 0)
    .map((value) => ({
      value,
      radius: innerRadius + (value / maxValue) * radialSpan,
    }));

  return {
    series: outSeries,
    axisAngles,
    rings,
    maxValue,
    cycleLength,
    totalCycles,
    innerRadius,
    outerRadius,
  };
}

export function describeRadialLineChart(
  series: readonly ChartRadialLineSeries[],
  hidden: ReadonlySet<string>,
  mode: ChartRadialLineMode,
  cycleLength: number,
  formatValue?: (v: number) => string
): string {
  const visible = series.filter((s) => !hidden.has(s.id));
  if (!visible.length || cycleLength <= 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const max = getRadialLineMaxValue(series, hidden);
  const sampleCount = getRadialLineSampleCount(series, hidden);
  const cycles = Math.max(1, Math.ceil(sampleCount / Math.max(1, cycleLength)));
  return `Radial line chart (${mode}) with ${visible.length} series, cycle length ${cycleLength}, ${cycles} cycle${cycles === 1 ? '' : 's'} of data, peak value ${fmt(max)}.`;
}

export interface ChartRadialLineProps {
  series: readonly ChartRadialLineSeries[];
  mode?: ChartRadialLineMode;
  cycleLength: number;
  axisLabels?: readonly string[];
  width?: number;
  height?: number;
  padding?: number;
  innerRadius?: number;
  startAngle?: number;
  maxValue?: number;
  tickCount?: number;
  strokeWidth?: number;
  pointRadius?: number;
  fillOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  closeCyclic?: boolean;
  showFill?: boolean;
  showPoints?: boolean;
  showRings?: boolean;
  showAxisLabels?: boolean;
  showSpokes?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (v: number) => string;
  formatAxis?: (label: string, index: number) => string;
  legendPlacement?: 'right' | 'bottom';
  onPointClick?: (args: {
    point: ChartRadialLineLayoutPoint;
    series: ChartRadialLineLayoutSeries;
  }) => void;
  onSeriesToggle?: (args: {
    series: ChartRadialLineSeries;
    hidden: boolean;
  }) => void;
  style?: CSSProperties;
}

function isControlled<T>(prop: T | undefined): prop is T {
  return prop !== undefined;
}

function defaultFormatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (Math.abs(v) >= 1000 || (Math.abs(v) > 0 && Math.abs(v) < 0.01)) {
    return v.toPrecision(3);
  }
  return String(Math.round(v * 100) / 100);
}

const ChartRadialLineInner = (
  {
    series,
    mode = 'cyclic',
    cycleLength,
    axisLabels,
    width = DEFAULT_CHART_RADIAL_LINE_WIDTH,
    height = DEFAULT_CHART_RADIAL_LINE_HEIGHT,
    padding = DEFAULT_CHART_RADIAL_LINE_PADDING,
    innerRadius = DEFAULT_CHART_RADIAL_LINE_INNER_RADIUS,
    startAngle = DEFAULT_CHART_RADIAL_LINE_START_ANGLE,
    maxValue,
    tickCount = DEFAULT_CHART_RADIAL_LINE_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_RADIAL_LINE_STROKE_WIDTH,
    pointRadius = DEFAULT_CHART_RADIAL_LINE_POINT_RADIUS,
    fillOpacity = DEFAULT_CHART_RADIAL_LINE_FILL_OPACITY,
    gridColor = DEFAULT_CHART_RADIAL_LINE_GRID_COLOR,
    axisColor = DEFAULT_CHART_RADIAL_LINE_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    closeCyclic = true,
    showFill = false,
    showPoints = false,
    showRings = true,
    showAxisLabels = true,
    showSpokes = true,
    showLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Radial line chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatAxis,
    legendPlacement = 'bottom',
    onPointClick,
    onSeriesToggle,
    style,
  }: ChartRadialLineProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-radial-line-desc-${reactId}`;
  const [internalHidden, setInternalHidden] = useState<Set<string>>(
    () => new Set(defaultHiddenSeries ?? [])
  );
  const hiddenSet = useMemo(
    () =>
      isControlled(hiddenSeries) ? new Set(hiddenSeries) : internalHidden,
    [hiddenSeries, internalHidden]
  );
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const outerRadius = Math.max(0, Math.min(innerW, innerH) / 2);
  const cx = padding + innerW / 2;
  const cy = padding + innerH / 2;

  const result = useMemo(
    () =>
      computeRadialLineLayout({
        series,
        hidden: hiddenSet,
        mode,
        cycleLength,
        ...(axisLabels ? { axisLabels } : {}),
        cx,
        cy,
        innerRadius,
        outerRadius,
        startAngle,
        ...(isFiniteNumber(maxValue) ? { maxValueOverride: maxValue } : {}),
        tickCount,
        closeCyclic,
      }),
    [
      series,
      hiddenSet,
      mode,
      cycleLength,
      axisLabels,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle,
      maxValue,
      tickCount,
      closeCyclic,
    ]
  );

  const autoDescription = useMemo(
    () =>
      describeRadialLineChart(series, hiddenSet, mode, cycleLength, formatValue),
    [series, hiddenSet, mode, cycleLength, formatValue]
  );

  const toggleSeries = useCallback(
    (idx: number) => {
      const s = series[idx];
      if (!s) return;
      const next = new Set(hiddenSet);
      const willHide = !next.has(s.id);
      if (willHide) next.add(s.id);
      else next.delete(s.id);
      if (!isControlled(hiddenSeries)) setInternalHidden(next);
      onHiddenSeriesChange?.(Array.from(next));
      onSeriesToggle?.({ series: s, hidden: willHide });
    },
    [series, hiddenSet, hiddenSeries, onHiddenSeriesChange, onSeriesToggle]
  );

  const hovered = useMemo(() => {
    if (!hoveredKey) return null;
    for (const ser of result.series) {
      for (const pt of ser.points) {
        if (`${pt.seriesId}::${pt.index}` === hoveredKey) {
          return { series: ser, point: pt };
        }
      }
    }
    return null;
  }, [result.series, hoveredKey]);

  const totalPointCount = useMemo(
    () => result.series.reduce((acc, s) => acc + s.points.length, 0),
    [result.series]
  );

  const showRightLegend = showLegend && legendPlacement === 'right';
  const showBottomLegend = showLegend && legendPlacement === 'bottom';

  return (
    <div
      ref={ref}
      data-section="chart-radial-line"
      data-mode={mode}
      data-cycle-length={cycleLength}
      data-total-cycles={result.totalCycles}
      data-series-count={series.length}
      data-visible-series-count={result.series.length}
      data-point-count={totalPointCount}
      data-max-value={result.maxValue}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-radial-line flex',
        showRightLegend ? 'flex-row items-start gap-4' : 'flex-col gap-2',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="region"
      aria-label={ariaLabel}
      style={style}
    >
      <div
        data-section="chart-radial-line-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-radial-line-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-radial-line-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showRings && result.rings.length > 0 && (
            <g data-section="chart-radial-line-rings" pointerEvents="none">
              {result.rings.map((ring, i) => (
                <circle
                  key={`ring-${i}`}
                  data-section="chart-radial-line-ring"
                  data-ring-value={ring.value}
                  data-ring-radius={ring.radius}
                  cx={cx}
                  cy={cy}
                  r={ring.radius}
                  fill="none"
                  stroke={gridColor}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              ))}
            </g>
          )}
          {showSpokes && (
            <g data-section="chart-radial-line-spokes" pointerEvents="none">
              {result.axisAngles.map((axis) => {
                const inner = polarToCartesian(
                  cx,
                  cy,
                  innerRadius,
                  axis.angle
                );
                const outer = polarToCartesian(
                  cx,
                  cy,
                  outerRadius,
                  axis.angle
                );
                return (
                  <line
                    key={`spoke-${axis.index}`}
                    data-section="chart-radial-line-spoke"
                    data-axis-index={axis.index}
                    data-axis-angle={axis.angle}
                    x1={inner.x}
                    y1={inner.y}
                    x2={outer.x}
                    y2={outer.y}
                    stroke={axisColor}
                    strokeWidth={1}
                    strokeDasharray="2 4"
                  />
                );
              })}
            </g>
          )}
          {showAxisLabels && (
            <g
              data-section="chart-radial-line-axis-labels"
              pointerEvents="none"
            >
              {result.axisAngles.map((axis) => {
                const pt = polarToCartesian(
                  cx,
                  cy,
                  outerRadius + 12,
                  axis.angle
                );
                const text = formatAxis
                  ? formatAxis(axis.label, axis.index)
                  : axis.label;
                return (
                  <text
                    key={`alabel-${axis.index}`}
                    data-section="chart-radial-line-axis-label"
                    data-axis-index={axis.index}
                    x={pt.x}
                    y={pt.y + 3}
                    textAnchor={
                      Math.cos(axis.angle) > 0.3
                        ? 'start'
                        : Math.cos(axis.angle) < -0.3
                        ? 'end'
                        : 'middle'
                    }
                    fontSize={10}
                    fill="rgb(71 85 105)"
                  >
                    {text}
                  </text>
                );
              })}
            </g>
          )}
          <g data-section="chart-radial-line-series">
            {result.series.map((ser) => (
              <g
                key={`series-${ser.id}`}
                data-section="chart-radial-line-series-group"
                data-series-id={ser.id}
                data-series-index={ser.index}
                data-series-color={ser.color}
                data-series-point-count={ser.points.length}
                className={
                  animate ? 'motion-safe:animate-fade-in' : undefined
                }
              >
                {showFill && ser.fillPath && (
                  <path
                    data-section="chart-radial-line-fill"
                    d={ser.fillPath}
                    fill={ser.color}
                    fillOpacity={fillOpacity}
                    stroke="none"
                  />
                )}
                <path
                  data-section="chart-radial-line-path"
                  d={ser.linePath}
                  fill="none"
                  stroke={ser.color}
                  strokeWidth={strokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  role="graphics-symbol"
                  tabIndex={0}
                  aria-label={`${ser.label}: ${ser.points.length} samples`}
                />
                {showPoints &&
                  ser.points.map((point) => {
                    if (!point.isFinite) return null;
                    const key = `${point.seriesId}::${point.index}`;
                    const isHovered = hoveredKey === key;
                    return (
                      <circle
                        key={`pt-${point.index}`}
                        data-section="chart-radial-line-point"
                        data-series-id={point.seriesId}
                        data-point-index={point.index}
                        data-point-cycle={point.cycle}
                        data-point-position={point.positionInCycle}
                        data-point-value={point.value}
                        data-hovered={isHovered ? 'true' : 'false'}
                        cx={point.x}
                        cy={point.y}
                        r={pointRadius}
                        fill={ser.color}
                        stroke="rgb(255 255 255)"
                        strokeWidth={1}
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${ser.label} at position ${point.positionInCycle}: ${formatValue(point.value)}`}
                        onMouseEnter={() => setHoveredKey(key)}
                        onMouseLeave={() =>
                          setHoveredKey((cur) =>
                            cur === key ? null : cur
                          )
                        }
                        onFocus={() => setHoveredKey(key)}
                        onBlur={() =>
                          setHoveredKey((cur) =>
                            cur === key ? null : cur
                          )
                        }
                        onClick={() =>
                          onPointClick?.({ point, series: ser })
                        }
                      />
                    );
                  })}
              </g>
            ))}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-radial-line-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-radial-line-tooltip-label"
              className="font-semibold"
            >
              {hovered.series.label}
            </div>
            <div
              data-section="chart-radial-line-tooltip-position"
              className="font-mono text-slate-700"
            >
              {axisLabels && axisLabels[hovered.point.positionInCycle] != null
                ? axisLabels[hovered.point.positionInCycle]
                : `position ${hovered.point.positionInCycle}`}
              {mode === 'spiral' && ` (cycle ${hovered.point.cycle + 1})`}
            </div>
            <div
              data-section="chart-radial-line-tooltip-value"
              className="font-mono text-slate-500"
            >
              {formatValue(hovered.point.value)}
            </div>
          </div>
        )}
      </div>
      {showBottomLegend && (
        <ul
          data-section="chart-radial-line-legend"
          data-placement="bottom"
          className="flex flex-wrap gap-2 text-xs"
        >
          {series.map((s, idx) => {
            const color = s.color ?? getRadialLineDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-radial-line-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-radial-line-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${s.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleSeries(idx)}
                >
                  <span
                    data-section="chart-radial-line-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-radial-line-legend-label"
                    className="text-slate-700"
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {showRightLegend && (
        <ul
          data-section="chart-radial-line-legend"
          data-placement="right"
          className="flex flex-col gap-1 text-xs"
        >
          {series.map((s, idx) => {
            const color = s.color ?? getRadialLineDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-radial-line-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-radial-line-legend-button"
                  aria-pressed={!isHidden}
                  aria-label={`Toggle ${s.label}`}
                  className={[
                    'flex items-center gap-1 rounded px-1 py-0.5 outline-none focus-visible:ring-2 focus-visible:ring-slate-400',
                    isHidden ? 'opacity-40' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => toggleSeries(idx)}
                >
                  <span
                    data-section="chart-radial-line-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-radial-line-legend-label"
                    className="text-slate-700"
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export const ChartRadialLine = forwardRef<
  HTMLDivElement,
  ChartRadialLineProps
>(ChartRadialLineInner);
ChartRadialLine.displayName = 'ChartRadialLine';
