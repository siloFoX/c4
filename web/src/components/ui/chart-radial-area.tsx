import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_RADIAL_AREA_WIDTH = 380;
export const DEFAULT_CHART_RADIAL_AREA_HEIGHT = 380;
export const DEFAULT_CHART_RADIAL_AREA_PADDING = 32;
export const DEFAULT_CHART_RADIAL_AREA_INNER_RADIUS = 24;
export const DEFAULT_CHART_RADIAL_AREA_START_ANGLE = -Math.PI / 2;
export const DEFAULT_CHART_RADIAL_AREA_TICK_COUNT = 4;
export const DEFAULT_CHART_RADIAL_AREA_STROKE_WIDTH = 1.2;
export const DEFAULT_CHART_RADIAL_AREA_FILL_OPACITY = 0.55;
export const DEFAULT_CHART_RADIAL_AREA_GRID_COLOR = '#e2e8f0';
export const DEFAULT_CHART_RADIAL_AREA_AXIS_COLOR = '#cbd5e1';
export const DEFAULT_CHART_RADIAL_AREA_STACK_MODE = 'overlay';
export const DEFAULT_CHART_RADIAL_AREA_CURVE = 'linear';
export const DEFAULT_CHART_RADIAL_AREA_PALETTE = [
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

export type ChartRadialAreaStackMode = 'overlay' | 'stacked';
export type ChartRadialAreaCurve = 'linear' | 'cardinal';

export interface ChartRadialAreaSeries {
  id: string;
  label: string;
  data: readonly number[];
  color?: string;
}

export interface ChartRadialAreaLayoutPoint {
  index: number;
  positionInCycle: number;
  value: number;
  cumulative: number;
  angle: number;
  innerRadius: number;
  outerRadius: number;
  innerX: number;
  innerY: number;
  outerX: number;
  outerY: number;
  isFinite: boolean;
}

export interface ChartRadialAreaLayoutSeries {
  id: string;
  label: string;
  index: number;
  color: string;
  points: ChartRadialAreaLayoutPoint[];
  outlinePath: string;
  areaPath: string;
}

export interface ComputeRadialAreaLayoutResult {
  series: ChartRadialAreaLayoutSeries[];
  axisAngles: { angle: number; label: string; index: number }[];
  rings: { value: number; radius: number }[];
  maxValue: number;
  cycleLength: number;
  innerRadius: number;
  outerRadius: number;
  stackMode: ChartRadialAreaStackMode;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function clampNonNeg(v: number): number {
  if (!isFiniteNumber(v) || v <= 0) return 0;
  return v;
}

export function getRadialAreaDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_RADIAL_AREA_PALETTE[0]!;
  }
  return DEFAULT_CHART_RADIAL_AREA_PALETTE[
    Math.floor(index) % DEFAULT_CHART_RADIAL_AREA_PALETTE.length
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

export function getRadialAreaAngle(
  positionInCycle: number,
  cycleLength: number,
  startAngle: number
): number {
  if (!isFiniteNumber(cycleLength) || cycleLength <= 0) return startAngle;
  return startAngle + (positionInCycle / cycleLength) * Math.PI * 2;
}

export function getRadialAreaSampleCount(
  series: readonly ChartRadialAreaSeries[],
  hidden: ReadonlySet<string>
): number {
  let max = 0;
  for (const s of series) {
    if (hidden.has(s.id)) continue;
    if (s.data.length > max) max = s.data.length;
  }
  return max;
}

export function getRadialAreaMaxValue(
  series: readonly ChartRadialAreaSeries[],
  hidden: ReadonlySet<string>,
  stackMode: ChartRadialAreaStackMode
): number {
  if (!series.length) return 1;
  const sampleCount = getRadialAreaSampleCount(series, hidden);
  if (sampleCount === 0) return 1;
  if (stackMode === 'stacked') {
    let max = 0;
    for (let i = 0; i < sampleCount; i++) {
      let sum = 0;
      for (const s of series) {
        if (hidden.has(s.id)) continue;
        sum += clampNonNeg(s.data[i] ?? 0);
      }
      if (sum > max) max = sum;
    }
    return max > 0 ? max : 1;
  }
  let max = 0;
  for (const s of series) {
    if (hidden.has(s.id)) continue;
    for (const v of s.data) {
      if (isFiniteNumber(v) && v > max) max = v;
    }
  }
  return max > 0 ? max : 1;
}

export function getRadialAreaTicks(
  max: number,
  count: number = DEFAULT_CHART_RADIAL_AREA_TICK_COUNT
): number[] {
  const c = Math.max(2, Math.floor(count) || 0);
  if (!isFiniteNumber(max) || max <= 0) return [0];
  const step = max / (c - 1);
  return Array.from({ length: c }, (_, i) => step * i);
}

function buildCardinalClosedSegment(
  points: { x: number; y: number }[]
): string {
  if (!points.length) return '';
  const n = points.length;
  if (n === 1) {
    return `M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`;
  }
  const tension = 0.5;
  const k = (1 - tension) / 6;
  const parts: string[] = [];
  parts.push(`M ${points[0]!.x.toFixed(2)} ${points[0]!.y.toFixed(2)}`);
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n]!;
    const p1 = points[i]!;
    const p2 = points[(i + 1) % n]!;
    const p3 = points[(i + 2) % n]!;
    const c1x = p1.x + (p2.x - p0.x) * k;
    const c1y = p1.y + (p2.y - p0.y) * k;
    const c2x = p2.x - (p3.x - p1.x) * k;
    const c2y = p2.y - (p3.y - p1.y) * k;
    parts.push(
      `C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
    );
  }
  parts.push('Z');
  return parts.join(' ');
}

function buildLinearClosedSegment(
  points: { x: number; y: number }[]
): string {
  if (!points.length) return '';
  const parts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    parts.push(`${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

export function buildRadialAreaClosedPath(
  outerPoints: { x: number; y: number }[],
  innerPoints: { x: number; y: number }[],
  curve: ChartRadialAreaCurve
): string {
  if (!outerPoints.length) return '';
  // For an annular band (stacked), we need two closed paths combined: outer +
  // inner-reversed. For an overlay area against the centre, innerPoints all
  // collapse to the same point so we just close the outer ring.
  if (curve === 'cardinal') {
    const outer = buildCardinalClosedSegment(outerPoints);
    // Determine if inner ring is non-trivial: any point at non-zero radius from
    // first inner point (e.g., for stacked layers above the baseline).
    const ip0 = innerPoints[0];
    const hasInner = innerPoints.some(
      (p) => Math.hypot(p.x - (ip0?.x ?? 0), p.y - (ip0?.y ?? 0)) > 0.001
    );
    if (!hasInner) return outer;
    const innerRev = [...innerPoints].reverse();
    return `${outer} ${buildCardinalClosedSegment(innerRev)}`;
  }
  const outer = buildLinearClosedSegment(outerPoints);
  const ip0 = innerPoints[0];
  const hasInner = innerPoints.some(
    (p) => Math.hypot(p.x - (ip0?.x ?? 0), p.y - (ip0?.y ?? 0)) > 0.001
  );
  if (!hasInner) return outer;
  const innerRev = [...innerPoints].reverse();
  return `${outer} ${buildLinearClosedSegment(innerRev)}`;
}

export interface ComputeRadialAreaLayoutInput {
  series: readonly ChartRadialAreaSeries[];
  hidden: ReadonlySet<string>;
  cycleLength: number;
  stackMode: ChartRadialAreaStackMode;
  curve: ChartRadialAreaCurve;
  axisLabels?: readonly string[];
  cx: number;
  cy: number;
  innerRadius: number;
  outerRadius: number;
  startAngle: number;
  maxValueOverride?: number;
  tickCount: number;
}

export function computeRadialAreaLayout(
  input: ComputeRadialAreaLayoutInput
): ComputeRadialAreaLayoutResult {
  const {
    series,
    hidden,
    cycleLength,
    stackMode,
    curve,
    axisLabels,
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    maxValueOverride,
    tickCount,
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
      innerRadius,
      outerRadius,
      stackMode,
    };
  }
  const sampleCount = getRadialAreaSampleCount(series, hidden);
  if (sampleCount === 0) {
    return {
      series: [],
      axisAngles: [],
      rings: [],
      maxValue: 0,
      cycleLength,
      innerRadius,
      outerRadius,
      stackMode,
    };
  }
  const autoMax = getRadialAreaMaxValue(series, hidden, stackMode);
  const maxValue =
    isFiniteNumber(maxValueOverride) && maxValueOverride > 0
      ? maxValueOverride
      : autoMax;
  const radialSpan = outerRadius - innerRadius;
  const radiusFor = (cumulative: number) => {
    if (!isFiniteNumber(cumulative) || cumulative <= 0) return innerRadius;
    const ratio = Math.max(0, Math.min(1, cumulative / maxValue));
    return innerRadius + ratio * radialSpan;
  };
  const angleFor = (positionInCycle: number) =>
    getRadialAreaAngle(positionInCycle, cycleLength, startAngle);

  // Pre-compute cumulative stacks per sample index for stacked mode.
  const cumulativeBefore: number[][] = [];
  const cumulativeAfter: number[][] = [];
  for (let s = 0; s < series.length; s++) {
    cumulativeBefore.push(new Array(sampleCount).fill(0));
    cumulativeAfter.push(new Array(sampleCount).fill(0));
  }
  if (stackMode === 'stacked') {
    const running = new Array(sampleCount).fill(0);
    for (let s = 0; s < series.length; s++) {
      const ser = series[s]!;
      if (hidden.has(ser.id)) {
        for (let i = 0; i < sampleCount; i++) {
          cumulativeBefore[s]![i] = running[i];
          cumulativeAfter[s]![i] = running[i];
        }
        continue;
      }
      for (let i = 0; i < sampleCount; i++) {
        const v = clampNonNeg(ser.data[i] ?? 0);
        cumulativeBefore[s]![i] = running[i];
        running[i] += v;
        cumulativeAfter[s]![i] = running[i];
      }
    }
  }

  const outSeries: ChartRadialAreaLayoutSeries[] = [];
  for (let s = 0; s < series.length; s++) {
    const seriesDef = series[s]!;
    if (hidden.has(seriesDef.id)) continue;
    const points: ChartRadialAreaLayoutPoint[] = [];
    const outerPts: { x: number; y: number }[] = [];
    const innerPts: { x: number; y: number }[] = [];
    for (let i = 0; i < sampleCount; i++) {
      const rawValue = seriesDef.data[i];
      const positionInCycle = i % cycleLength;
      const angle = angleFor(positionInCycle);
      const finite = isFiniteNumber(rawValue);
      const value = finite ? clampNonNeg(rawValue!) : 0;
      const cumulative =
        stackMode === 'stacked'
          ? cumulativeAfter[s]![i] ?? value
          : value;
      const innerCumulative =
        stackMode === 'stacked' ? cumulativeBefore[s]![i] ?? 0 : 0;
      const outerR = radiusFor(cumulative);
      const innerR =
        stackMode === 'stacked' ? radiusFor(innerCumulative) : innerRadius;
      const outerPt = polarToCartesian(cx, cy, outerR, angle);
      const innerPt = polarToCartesian(cx, cy, innerR, angle);
      points.push({
        index: i,
        positionInCycle,
        value,
        cumulative,
        angle,
        innerRadius: innerR,
        outerRadius: outerR,
        innerX: innerPt.x,
        innerY: innerPt.y,
        outerX: outerPt.x,
        outerY: outerPt.y,
        isFinite: finite,
      });
      outerPts.push({ x: outerPt.x, y: outerPt.y });
      innerPts.push({ x: innerPt.x, y: innerPt.y });
    }
    const areaPath = buildRadialAreaClosedPath(outerPts, innerPts, curve);
    const outlinePath =
      curve === 'cardinal'
        ? buildCardinalClosedSegment(outerPts)
        : buildLinearClosedSegment(outerPts);
    const color =
      seriesDef.color ?? getRadialAreaDefaultColor(s);
    outSeries.push({
      id: seriesDef.id,
      label: seriesDef.label,
      index: s,
      color,
      points,
      outlinePath,
      areaPath,
    });
  }

  const axisAngles: { angle: number; label: string; index: number }[] = [];
  const steps = Math.max(1, Math.floor(cycleLength));
  for (let i = 0; i < steps; i++) {
    const angle = angleFor(i);
    const label =
      axisLabels && axisLabels[i] != null ? axisLabels[i] : String(i);
    axisAngles.push({ angle, label, index: i });
  }

  const ticks = getRadialAreaTicks(maxValue, tickCount);
  const rings = ticks
    .filter((t) => t > 0)
    .map((value) => ({
      value,
      radius: radiusFor(value),
    }));

  return {
    series: outSeries,
    axisAngles,
    rings,
    maxValue,
    cycleLength,
    innerRadius,
    outerRadius,
    stackMode,
  };
}

export function describeRadialAreaChart(
  series: readonly ChartRadialAreaSeries[],
  hidden: ReadonlySet<string>,
  stackMode: ChartRadialAreaStackMode,
  cycleLength: number,
  formatValue?: (v: number) => string
): string {
  const visible = series.filter((s) => !hidden.has(s.id));
  if (!visible.length || cycleLength <= 0) return 'No data';
  const fmt = formatValue ?? ((n: number) => String(n));
  const max = getRadialAreaMaxValue(series, hidden, stackMode);
  return `Radial area chart (${stackMode}) with ${visible.length} series, cycle length ${cycleLength}, peak value ${fmt(max)}.`;
}

export interface ChartRadialAreaProps {
  series: readonly ChartRadialAreaSeries[];
  cycleLength: number;
  stackMode?: ChartRadialAreaStackMode;
  curve?: ChartRadialAreaCurve;
  axisLabels?: readonly string[];
  width?: number;
  height?: number;
  padding?: number;
  innerRadius?: number;
  startAngle?: number;
  maxValue?: number;
  tickCount?: number;
  strokeWidth?: number;
  fillOpacity?: number;
  gridColor?: string;
  axisColor?: string;
  hiddenSeries?: readonly string[];
  defaultHiddenSeries?: readonly string[];
  onHiddenSeriesChange?: (hidden: string[]) => void;
  showOutline?: boolean;
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
  onSeriesClick?: (args: {
    series: ChartRadialAreaLayoutSeries;
  }) => void;
  onSeriesToggle?: (args: {
    series: ChartRadialAreaSeries;
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

const ChartRadialAreaInner = (
  {
    series,
    cycleLength,
    stackMode = DEFAULT_CHART_RADIAL_AREA_STACK_MODE,
    curve = DEFAULT_CHART_RADIAL_AREA_CURVE,
    axisLabels,
    width = DEFAULT_CHART_RADIAL_AREA_WIDTH,
    height = DEFAULT_CHART_RADIAL_AREA_HEIGHT,
    padding = DEFAULT_CHART_RADIAL_AREA_PADDING,
    innerRadius = DEFAULT_CHART_RADIAL_AREA_INNER_RADIUS,
    startAngle = DEFAULT_CHART_RADIAL_AREA_START_ANGLE,
    maxValue,
    tickCount = DEFAULT_CHART_RADIAL_AREA_TICK_COUNT,
    strokeWidth = DEFAULT_CHART_RADIAL_AREA_STROKE_WIDTH,
    fillOpacity = DEFAULT_CHART_RADIAL_AREA_FILL_OPACITY,
    gridColor = DEFAULT_CHART_RADIAL_AREA_GRID_COLOR,
    axisColor = DEFAULT_CHART_RADIAL_AREA_AXIS_COLOR,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    showOutline = true,
    showRings = true,
    showAxisLabels = true,
    showSpokes = true,
    showLegend = true,
    showTooltip = true,
    animate = true,
    className,
    ariaLabel = 'Radial area chart',
    ariaDescription,
    formatValue = defaultFormatValue,
    formatAxis,
    legendPlacement = 'bottom',
    onSeriesClick,
    onSeriesToggle,
    style,
  }: ChartRadialAreaProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const reactId = useId();
  const descriptionId = `chart-radial-area-desc-${reactId}`;
  const [internalHidden, setInternalHidden] = useState<Set<string>>(
    () => new Set(defaultHiddenSeries ?? [])
  );
  const hiddenSet = useMemo(
    () =>
      isControlled(hiddenSeries) ? new Set(hiddenSeries) : internalHidden,
    [hiddenSeries, internalHidden]
  );
  const [hoveredSeriesId, setHoveredSeriesId] = useState<string | null>(null);

  const innerW = Math.max(0, width - padding * 2);
  const innerH = Math.max(0, height - padding * 2);
  const outerRadius = Math.max(0, Math.min(innerW, innerH) / 2);
  const cx = padding + innerW / 2;
  const cy = padding + innerH / 2;

  const result = useMemo(
    () =>
      computeRadialAreaLayout({
        series,
        hidden: hiddenSet,
        cycleLength,
        stackMode,
        curve,
        ...(axisLabels ? { axisLabels } : {}),
        cx,
        cy,
        innerRadius,
        outerRadius,
        startAngle,
        ...(isFiniteNumber(maxValue) ? { maxValueOverride: maxValue } : {}),
        tickCount,
      }),
    [
      series,
      hiddenSet,
      cycleLength,
      stackMode,
      curve,
      axisLabels,
      cx,
      cy,
      innerRadius,
      outerRadius,
      startAngle,
      maxValue,
      tickCount,
    ]
  );

  const autoDescription = useMemo(
    () =>
      describeRadialAreaChart(
        series,
        hiddenSet,
        stackMode,
        cycleLength,
        formatValue
      ),
    [series, hiddenSet, stackMode, cycleLength, formatValue]
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
    if (!hoveredSeriesId) return null;
    return result.series.find((s) => s.id === hoveredSeriesId) ?? null;
  }, [result.series, hoveredSeriesId]);

  const hoveredTotal = useMemo(() => {
    if (!hovered) return 0;
    let sum = 0;
    for (const p of hovered.points) if (p.isFinite) sum += p.value;
    return sum;
  }, [hovered]);

  const showRightLegend = showLegend && legendPlacement === 'right';
  const showBottomLegend = showLegend && legendPlacement === 'bottom';

  return (
    <div
      ref={ref}
      data-section="chart-radial-area"
      data-stack-mode={stackMode}
      data-curve={curve}
      data-cycle-length={cycleLength}
      data-series-count={series.length}
      data-visible-series-count={result.series.length}
      data-max-value={result.maxValue}
      data-animate={animate ? 'true' : 'false'}
      className={[
        'chart-radial-area flex',
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
        data-section="chart-radial-area-canvas"
        className="relative inline-block"
        style={{ width, height }}
      >
        <span
          id={descriptionId}
          data-section="chart-radial-area-aria-desc"
          className="sr-only"
        >
          {ariaDescription ?? autoDescription}
        </span>
        <svg
          data-section="chart-radial-area-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          aria-describedby={descriptionId}
          style={{ display: 'block' }}
        >
          {showRings && result.rings.length > 0 && (
            <g data-section="chart-radial-area-rings" pointerEvents="none">
              {result.rings.map((ring, i) => (
                <circle
                  key={`ring-${i}`}
                  data-section="chart-radial-area-ring"
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
            <g data-section="chart-radial-area-spokes" pointerEvents="none">
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
                    data-section="chart-radial-area-spoke"
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
              data-section="chart-radial-area-axis-labels"
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
                    data-section="chart-radial-area-axis-label"
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
          <g data-section="chart-radial-area-series">
            {result.series.map((ser) => {
              const isHovered = hoveredSeriesId === ser.id;
              const dim =
                hoveredSeriesId != null && !isHovered ? 0.4 : 1;
              return (
                <g
                  key={`series-${ser.id}`}
                  data-section="chart-radial-area-series-group"
                  data-series-id={ser.id}
                  data-series-index={ser.index}
                  data-series-color={ser.color}
                  data-series-point-count={ser.points.length}
                  data-hovered={isHovered ? 'true' : 'false'}
                  className={
                    animate ? 'motion-safe:animate-fade-in' : undefined
                  }
                  onMouseEnter={() => setHoveredSeriesId(ser.id)}
                  onMouseLeave={() =>
                    setHoveredSeriesId((cur) =>
                      cur === ser.id ? null : cur
                    )
                  }
                  onFocus={() => setHoveredSeriesId(ser.id)}
                  onBlur={() =>
                    setHoveredSeriesId((cur) =>
                      cur === ser.id ? null : cur
                    )
                  }
                  onClick={() => onSeriesClick?.({ series: ser })}
                  style={{ opacity: dim }}
                >
                  {ser.areaPath && (
                    <path
                      data-section="chart-radial-area-fill"
                      d={ser.areaPath}
                      fill={ser.color}
                      fillOpacity={fillOpacity}
                      stroke="none"
                      fillRule="evenodd"
                    />
                  )}
                  {showOutline && ser.outlinePath && (
                    <path
                      data-section="chart-radial-area-outline"
                      d={ser.outlinePath}
                      fill="none"
                      stroke={ser.color}
                      strokeWidth={strokeWidth}
                      strokeLinejoin="round"
                      role="graphics-symbol"
                      tabIndex={0}
                      aria-label={`${ser.label}: ${ser.points.length} samples`}
                    />
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        {showTooltip && hovered && (
          <div
            data-section="chart-radial-area-tooltip"
            className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs shadow"
          >
            <div
              data-section="chart-radial-area-tooltip-label"
              className="font-semibold"
            >
              {hovered.label}
            </div>
            <div
              data-section="chart-radial-area-tooltip-total"
              className="font-mono text-slate-700"
            >
              total: {formatValue(hoveredTotal)}
            </div>
            <div
              data-section="chart-radial-area-tooltip-samples"
              className="font-mono text-slate-500"
            >
              samples: {hovered.points.length}
            </div>
          </div>
        )}
      </div>
      {showBottomLegend && (
        <ul
          data-section="chart-radial-area-legend"
          data-placement="bottom"
          className="flex flex-wrap gap-2 text-xs"
        >
          {series.map((s, idx) => {
            const color = s.color ?? getRadialAreaDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-radial-area-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-radial-area-legend-button"
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
                    data-section="chart-radial-area-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-radial-area-legend-label"
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
          data-section="chart-radial-area-legend"
          data-placement="right"
          className="flex flex-col gap-1 text-xs"
        >
          {series.map((s, idx) => {
            const color = s.color ?? getRadialAreaDefaultColor(idx);
            const isHidden = hiddenSet.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-radial-area-legend-item"
                data-series-id={s.id}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-radial-area-legend-button"
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
                    data-section="chart-radial-area-legend-swatch"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ backgroundColor: color }}
                  />
                  <span
                    data-section="chart-radial-area-legend-label"
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

export const ChartRadialArea = forwardRef<
  HTMLDivElement,
  ChartRadialAreaProps
>(ChartRadialAreaInner);
ChartRadialArea.displayName = 'ChartRadialArea';
