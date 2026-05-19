import {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type ForwardedRef,
} from 'react';

export const DEFAULT_CHART_LINE_SPARK_BAR_WIDTH = 160;
export const DEFAULT_CHART_LINE_SPARK_BAR_HEIGHT = 48;
export const DEFAULT_CHART_LINE_SPARK_BAR_PADDING = 4;
export const DEFAULT_CHART_LINE_SPARK_BAR_BAR_RATIO = 0.55;
export const DEFAULT_CHART_LINE_SPARK_BAR_BAR_GAP = 1;
export const DEFAULT_CHART_LINE_SPARK_BAR_TRACK_GAP = 2;
export const DEFAULT_CHART_LINE_SPARK_BAR_STROKE_WIDTH = 1.5;
export const DEFAULT_CHART_LINE_SPARK_BAR_DOT_RADIUS = 2;
export const DEFAULT_CHART_LINE_SPARK_BAR_LINE_OPACITY = 1;
export const DEFAULT_CHART_LINE_SPARK_BAR_BAR_OPACITY = 0.85;
export const DEFAULT_CHART_LINE_SPARK_BAR_LINE_COLOR = '#2563eb';
export const DEFAULT_CHART_LINE_SPARK_BAR_BAR_COLOR = '#94a3b8';
export const DEFAULT_CHART_LINE_SPARK_BAR_POSITIVE_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SPARK_BAR_NEGATIVE_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SPARK_BAR_MIN_COLOR = '#dc2626';
export const DEFAULT_CHART_LINE_SPARK_BAR_MAX_COLOR = '#16a34a';
export const DEFAULT_CHART_LINE_SPARK_BAR_PILL_BG = '#0f172a';
export const DEFAULT_CHART_LINE_SPARK_BAR_PILL_FG = '#f8fafc';
export const DEFAULT_CHART_LINE_SPARK_BAR_PALETTE = [
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

export interface ChartLineSparkBarPoint {
  x: number;
  value: number;
  bar: number;
}

export interface ChartLineSparkBarSeries {
  id: string;
  label: string;
  data: readonly ChartLineSparkBarPoint[];
  lineColor?: string;
  barColor?: string;
  positiveBarColor?: string;
  negativeBarColor?: string;
}

export interface ChartLineSparkBarBounds {
  xMin: number;
  xMax: number;
  valueMin: number;
  valueMax: number;
  barMin: number;
  barMax: number;
}

export interface ChartLineSparkBarLayoutPoint {
  index: number;
  x: number;
  value: number;
  bar: number;
  px: number;
  py: number;
  barX: number;
  barY: number;
  barWidth: number;
  barHeight: number;
  barSign: 'positive' | 'negative' | 'zero';
  isMin: boolean;
  isMax: boolean;
}

export interface ChartLineSparkBarLayoutSeries {
  id: string;
  label: string;
  index: number;
  lineColor: string;
  barColor: string;
  positiveBarColor: string;
  negativeBarColor: string;
  points: ChartLineSparkBarLayoutPoint[];
  path: string;
  finalValue: number;
  minValue: number;
  maxValue: number;
  totalBar: number;
  finiteCount: number;
  totalCount: number;
  minIndex: number | null;
  maxIndex: number | null;
}

export interface ComputeLineSparkBarLayoutResult {
  series: ChartLineSparkBarLayoutSeries[];
  bounds: ChartLineSparkBarBounds;
  innerWidth: number;
  innerHeight: number;
  barTrackTop: number;
  barTrackBottom: number;
  lineTrackTop: number;
  lineTrackBottom: number;
  barZeroY: number;
  totalPoints: number;
  visibleSeriesCount: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isFinitePoint(p: unknown): p is ChartLineSparkBarPoint {
  return (
    !!p &&
    typeof p === 'object' &&
    isFiniteNumber((p as ChartLineSparkBarPoint).x) &&
    isFiniteNumber((p as ChartLineSparkBarPoint).value) &&
    isFiniteNumber((p as ChartLineSparkBarPoint).bar)
  );
}

const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(3) : '0');

export function getLineSparkBarDefaultColor(index: number): string {
  if (!Number.isFinite(index) || index < 0) {
    return DEFAULT_CHART_LINE_SPARK_BAR_PALETTE[0]!;
  }
  return DEFAULT_CHART_LINE_SPARK_BAR_PALETTE[
    Math.floor(index) % DEFAULT_CHART_LINE_SPARK_BAR_PALETTE.length
  ]!;
}

export function getLineSparkBarFinitePoints(
  points: readonly ChartLineSparkBarPoint[],
): ChartLineSparkBarPoint[] {
  if (!Array.isArray(points)) return [];
  return points.filter(isFinitePoint);
}

/**
 * Computes the joint bounds across every finite sample of every
 * visible series. `barMin` is clamped to `0` whenever every observed
 * bar value is non-negative -- this keeps positive-only bar tracks
 * grounded at the bottom of their zone. When some bar values are
 * negative the zero line floats inside the zone naturally.
 */
export function computeLineSparkBarBounds(
  series: readonly ChartLineSparkBarSeries[] | undefined | null,
  hidden?: ReadonlySet<string> | null,
): ChartLineSparkBarBounds {
  const empty: ChartLineSparkBarBounds = {
    xMin: 0,
    xMax: 1,
    valueMin: 0,
    valueMax: 1,
    barMin: 0,
    barMax: 1,
  };
  if (!Array.isArray(series) || series.length === 0) return empty;
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  let valueMin = Number.POSITIVE_INFINITY;
  let valueMax = Number.NEGATIVE_INFINITY;
  let barMin = Number.POSITIVE_INFINITY;
  let barMax = Number.NEGATIVE_INFINITY;
  let any = false;
  for (const s of series) {
    if (hidden && hidden.has(s.id)) continue;
    for (const p of getLineSparkBarFinitePoints(s.data ?? [])) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.value < valueMin) valueMin = p.value;
      if (p.value > valueMax) valueMax = p.value;
      if (p.bar < barMin) barMin = p.bar;
      if (p.bar > barMax) barMax = p.bar;
      any = true;
    }
  }
  if (!any) return empty;
  if (barMin > 0) barMin = 0;
  if (barMax < 0) barMax = 0;
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (valueMin === valueMax) {
    valueMin -= 0.5;
    valueMax += 0.5;
  }
  if (barMin === barMax) {
    barMin -= 0.5;
    barMax += 0.5;
  }
  return { xMin, xMax, valueMin, valueMax, barMin, barMax };
}

export interface ComputeLineSparkBarLayoutInput {
  series: readonly ChartLineSparkBarSeries[];
  hiddenSeries?: ReadonlySet<string> | null;
  width: number;
  height: number;
  padding: number;
  barRatio?: number;
  barGap?: number;
  trackGap?: number;
  xMin?: number;
  xMax?: number;
  valueMin?: number;
  valueMax?: number;
  barMin?: number;
  barMax?: number;
}

export function computeLineSparkBarLayout(
  input: ComputeLineSparkBarLayoutInput,
): ComputeLineSparkBarLayoutResult {
  const padding = Math.max(0, input.padding);
  const innerWidth = Math.max(0, input.width - padding * 2);
  const innerHeight = Math.max(0, input.height - padding * 2);
  const ratio = isFiniteNumber(input.barRatio)
    ? Math.min(0.95, Math.max(0.05, input.barRatio))
    : DEFAULT_CHART_LINE_SPARK_BAR_BAR_RATIO;
  const trackGap = isFiniteNumber(input.trackGap)
    ? Math.max(0, input.trackGap)
    : DEFAULT_CHART_LINE_SPARK_BAR_TRACK_GAP;
  const barGap = isFiniteNumber(input.barGap)
    ? Math.max(0, input.barGap)
    : DEFAULT_CHART_LINE_SPARK_BAR_BAR_GAP;

  const empty: ComputeLineSparkBarLayoutResult = {
    series: [],
    bounds: computeLineSparkBarBounds([]),
    innerWidth,
    innerHeight,
    barTrackTop: 0,
    barTrackBottom: 0,
    lineTrackTop: 0,
    lineTrackBottom: 0,
    barZeroY: 0,
    totalPoints: 0,
    visibleSeriesCount: 0,
  };
  if (innerWidth <= 0 || innerHeight <= 0) return empty;
  const seriesArr = Array.isArray(input.series) ? input.series : [];
  if (seriesArr.length === 0) return empty;
  const hidden = input.hiddenSeries ?? null;
  const visible = seriesArr.filter((s) => !hidden || !hidden.has(s.id));
  if (visible.length === 0) return empty;

  const bounds = computeLineSparkBarBounds(seriesArr, hidden);
  let { xMin, xMax, valueMin, valueMax, barMin, barMax } = bounds;
  if (isFiniteNumber(input.xMin)) xMin = input.xMin;
  if (isFiniteNumber(input.xMax)) xMax = input.xMax;
  if (isFiniteNumber(input.valueMin)) valueMin = input.valueMin;
  if (isFiniteNumber(input.valueMax)) valueMax = input.valueMax;
  if (isFiniteNumber(input.barMin)) barMin = input.barMin;
  if (isFiniteNumber(input.barMax)) barMax = input.barMax;
  if (xMax < xMin) [xMin, xMax] = [xMax, xMin];
  if (valueMax < valueMin) [valueMin, valueMax] = [valueMax, valueMin];
  if (barMax < barMin) [barMin, barMax] = [barMax, barMin];
  if (xMin === xMax) {
    xMin -= 0.5;
    xMax += 0.5;
  }
  if (valueMin === valueMax) {
    valueMin -= 0.5;
    valueMax += 0.5;
  }
  if (barMin === barMax) {
    barMin -= 0.5;
    barMax += 0.5;
  }

  // Split the inner canvas vertically: bar track on the bottom,
  // line track on the top, separated by trackGap.
  const available = Math.max(0, innerHeight - trackGap);
  const barTrackHeight = available * ratio;
  const lineTrackHeight = available - barTrackHeight;
  const lineTrackTop = padding;
  const lineTrackBottom = lineTrackTop + lineTrackHeight;
  const barTrackTop = lineTrackBottom + trackGap;
  const barTrackBottom = barTrackTop + barTrackHeight;

  const xRange = xMax - xMin;
  const valueRange = valueMax - valueMin;
  const barRange = barMax - barMin;
  const xToPx = (x: number): number =>
    padding + ((x - xMin) / xRange) * innerWidth;
  const valueToPy = (v: number): number =>
    lineTrackBottom - ((v - valueMin) / valueRange) * lineTrackHeight;
  const barToPy = (b: number): number =>
    barTrackBottom - ((b - barMin) / barRange) * barTrackHeight;
  const barZeroY = barToPy(0);

  // Compute bar width based on point density.
  // Count visible finite samples in the FIRST visible series to size
  // the bars sensibly (sparklines usually carry one series).
  const firstVisible = visible[0]!;
  const firstFinite = getLineSparkBarFinitePoints(firstVisible.data ?? []);
  const denom = Math.max(1, firstFinite.length);
  const slotWidth = innerWidth / denom;
  const barWidth = Math.max(1, slotWidth - barGap);

  const layoutSeries: ChartLineSparkBarLayoutSeries[] = [];
  let totalPoints = 0;
  for (let i = 0; i < seriesArr.length; i += 1) {
    const s = seriesArr[i]!;
    if (hidden && hidden.has(s.id)) continue;
    const arr = Array.isArray(s.data) ? s.data : [];
    const lineColor =
      s.lineColor ?? getLineSparkBarDefaultColor(i);
    const barColor =
      s.barColor ?? DEFAULT_CHART_LINE_SPARK_BAR_BAR_COLOR;
    const positiveColor =
      s.positiveBarColor ??
      DEFAULT_CHART_LINE_SPARK_BAR_POSITIVE_COLOR;
    const negativeColor =
      s.negativeBarColor ??
      DEFAULT_CHART_LINE_SPARK_BAR_NEGATIVE_COLOR;

    // Find min/max value indices for the layout marker flags (first
    // occurrence wins on ties).
    let minIdx = -1;
    let maxIdx = -1;
    let minVal = Number.POSITIVE_INFINITY;
    let maxVal = Number.NEGATIVE_INFINITY;
    let totalBar = 0;
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      if (p.value < minVal) {
        minVal = p.value;
        minIdx = j;
      }
      if (p.value > maxVal) {
        maxVal = p.value;
        maxIdx = j;
      }
      totalBar += p.bar;
    }

    const points: ChartLineSparkBarLayoutPoint[] = [];
    for (let j = 0; j < arr.length; j += 1) {
      const p = arr[j]!;
      if (!isFinitePoint(p)) continue;
      const px = xToPx(p.x);
      const py = valueToPy(p.value);
      const barPy = barToPy(p.bar);
      const barSign: 'positive' | 'negative' | 'zero' =
        p.bar > 0 ? 'positive' : p.bar < 0 ? 'negative' : 'zero';
      const barX = px - barWidth / 2;
      let barY: number;
      let barHeight: number;
      if (p.bar >= 0) {
        barY = barPy;
        barHeight = Math.max(0, barZeroY - barPy);
      } else {
        barY = barZeroY;
        barHeight = Math.max(0, barPy - barZeroY);
      }
      points.push({
        index: j,
        x: p.x,
        value: p.value,
        bar: p.bar,
        px,
        py,
        barX,
        barY,
        barWidth,
        barHeight,
        barSign,
        isMin: j === minIdx,
        isMax: j === maxIdx,
      });
    }

    let path = '';
    if (points.length > 0) {
      path = `M ${fmt(points[0]!.px)} ${fmt(points[0]!.py)}`;
      for (let j = 1; j < points.length; j += 1) {
        path += ` L ${fmt(points[j]!.px)} ${fmt(points[j]!.py)}`;
      }
    }
    totalPoints += points.length;
    layoutSeries.push({
      id: s.id,
      label: s.label,
      index: i,
      lineColor,
      barColor,
      positiveBarColor: positiveColor,
      negativeBarColor: negativeColor,
      points,
      path,
      finalValue:
        points.length > 0 ? points[points.length - 1]!.value : 0,
      minValue: minIdx >= 0 ? minVal : 0,
      maxValue: maxIdx >= 0 ? maxVal : 0,
      totalBar,
      finiteCount: points.length,
      totalCount: arr.length,
      minIndex: minIdx >= 0 ? minIdx : null,
      maxIndex: maxIdx >= 0 ? maxIdx : null,
    });
  }

  return {
    series: layoutSeries,
    bounds: { xMin, xMax, valueMin, valueMax, barMin, barMax },
    innerWidth,
    innerHeight,
    barTrackTop,
    barTrackBottom,
    lineTrackTop,
    lineTrackBottom,
    barZeroY,
    totalPoints,
    visibleSeriesCount: visible.length,
  };
}

export function describeLineSparkBarChart(
  series: readonly ChartLineSparkBarSeries[] | undefined | null,
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
    const finite = getLineSparkBarFinitePoints(s.data ?? []);
    if (finite.length === 0) continue;
    any = true;
    totalPoints += finite.length;
    let minVal = Number.POSITIVE_INFINITY;
    let maxVal = Number.NEGATIVE_INFINITY;
    let totalBar = 0;
    for (const p of finite) {
      if (p.value < minVal) minVal = p.value;
      if (p.value > maxVal) maxVal = p.value;
      totalBar += p.bar;
    }
    const lastValue = finite[finite.length - 1]!.value;
    parts.push(
      `${s.label}: last ${fmtV(lastValue)}, range ${fmtV(minVal)} to ${fmtV(maxVal)}, bar total ${fmtV(totalBar)}`,
    );
  }
  if (!any) return 'No data';
  return `Sparkline with line + bar overlay across ${visible.length} series (${totalPoints} points). ${parts.join('; ')}.`;
}

export interface ChartLineSparkBarPointClick {
  series: ChartLineSparkBarLayoutSeries;
  point: ChartLineSparkBarLayoutPoint;
}

export interface ChartLineSparkBarProps {
  series: readonly ChartLineSparkBarSeries[];
  hiddenSeries?: ReadonlySet<string>;
  defaultHiddenSeries?: ReadonlySet<string>;
  onHiddenSeriesChange?: (hidden: ReadonlySet<string>) => void;
  xMin?: number;
  xMax?: number;
  valueMin?: number;
  valueMax?: number;
  barMin?: number;
  barMax?: number;
  width?: number;
  height?: number;
  padding?: number;
  barRatio?: number;
  barGap?: number;
  trackGap?: number;
  strokeWidth?: number;
  dotRadius?: number;
  lineOpacity?: number;
  barOpacity?: number;
  minColor?: string;
  maxColor?: string;
  pillBg?: string;
  pillFg?: string;
  signedBars?: boolean;
  showLine?: boolean;
  showBars?: boolean;
  showMinMaxDots?: boolean;
  showLastValuePill?: boolean;
  showLastValueDot?: boolean;
  showTooltip?: boolean;
  showLegend?: boolean;
  animate?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaDescription?: string;
  formatValue?: (n: number) => string;
  formatX?: (n: number) => string;
  formatBar?: (n: number) => string;
  onPointClick?: (info: ChartLineSparkBarPointClick) => void;
  style?: CSSProperties;
}

export const ChartLineSparkBar = forwardRef(function ChartLineSparkBar(
  {
    series,
    hiddenSeries,
    defaultHiddenSeries,
    onHiddenSeriesChange,
    xMin,
    xMax,
    valueMin,
    valueMax,
    barMin,
    barMax,
    width = DEFAULT_CHART_LINE_SPARK_BAR_WIDTH,
    height = DEFAULT_CHART_LINE_SPARK_BAR_HEIGHT,
    padding = DEFAULT_CHART_LINE_SPARK_BAR_PADDING,
    barRatio = DEFAULT_CHART_LINE_SPARK_BAR_BAR_RATIO,
    barGap = DEFAULT_CHART_LINE_SPARK_BAR_BAR_GAP,
    trackGap = DEFAULT_CHART_LINE_SPARK_BAR_TRACK_GAP,
    strokeWidth = DEFAULT_CHART_LINE_SPARK_BAR_STROKE_WIDTH,
    dotRadius = DEFAULT_CHART_LINE_SPARK_BAR_DOT_RADIUS,
    lineOpacity = DEFAULT_CHART_LINE_SPARK_BAR_LINE_OPACITY,
    barOpacity = DEFAULT_CHART_LINE_SPARK_BAR_BAR_OPACITY,
    minColor = DEFAULT_CHART_LINE_SPARK_BAR_MIN_COLOR,
    maxColor = DEFAULT_CHART_LINE_SPARK_BAR_MAX_COLOR,
    pillBg = DEFAULT_CHART_LINE_SPARK_BAR_PILL_BG,
    pillFg = DEFAULT_CHART_LINE_SPARK_BAR_PILL_FG,
    signedBars = false,
    showLine = true,
    showBars = true,
    showMinMaxDots = true,
    showLastValuePill = false,
    showLastValueDot = true,
    showTooltip = true,
    showLegend = false,
    animate = true,
    className,
    ariaLabel = 'Sparkline with bar overlay',
    ariaDescription,
    formatValue,
    formatX,
    formatBar,
    onPointClick,
    style,
  }: ChartLineSparkBarProps,
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
  const fmtBar = useCallback(
    (n: number) =>
      formatBar
        ? formatBar(n)
        : formatValue
          ? formatValue(n)
          : String(n),
    [formatBar, formatValue],
  );

  const [internalHidden, setInternalHidden] = useState<ReadonlySet<string>>(
    defaultHiddenSeries ?? new Set<string>(),
  );
  const hidden: ReadonlySet<string> =
    hiddenSeries !== undefined ? hiddenSeries : internalHidden;

  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const layout = useMemo(
    () =>
      computeLineSparkBarLayout({
        series,
        hiddenSeries: hidden,
        width,
        height,
        padding,
        barRatio,
        barGap,
        trackGap,
        ...(xMin !== undefined ? { xMin } : {}),
        ...(xMax !== undefined ? { xMax } : {}),
        ...(valueMin !== undefined ? { valueMin } : {}),
        ...(valueMax !== undefined ? { valueMax } : {}),
        ...(barMin !== undefined ? { barMin } : {}),
        ...(barMax !== undefined ? { barMax } : {}),
      }),
    [
      series,
      hidden,
      width,
      height,
      padding,
      barRatio,
      barGap,
      trackGap,
      xMin,
      xMax,
      valueMin,
      valueMax,
      barMin,
      barMax,
    ],
  );

  const description =
    ariaDescription ??
    describeLineSparkBarChart(series, hidden, fmtValue);

  const toggleSeries = useCallback(
    (s: ChartLineSparkBarSeries) => {
      const next = new Set(hidden);
      if (next.has(s.id)) next.delete(s.id);
      else next.add(s.id);
      if (hiddenSeries === undefined) setInternalHidden(next);
      if (onHiddenSeriesChange) onHiddenSeriesChange(next);
    },
    [hidden, hiddenSeries, onHiddenSeriesChange],
  );

  const rootClass = [
    'relative inline-block text-xs text-slate-700',
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
      data-section="chart-line-spark-bar"
      data-series-count={series.length}
      data-visible-series-count={layout.visibleSeriesCount}
      data-total-points={layout.totalPoints}
      data-signed-bars={signedBars ? 'true' : 'false'}
      data-animate={animate ? 'true' : 'false'}
      className={rootClass}
      style={style}
    >
      <span
        id={ariaDescId}
        data-section="chart-line-spark-bar-aria-desc"
        className="sr-only"
      >
        {description}
      </span>
      <div
        data-section="chart-line-spark-bar-canvas"
        className="relative"
        style={{ width, height }}
      >
        <svg
          data-section="chart-line-spark-bar-svg"
          role="img"
          aria-label={ariaLabel}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
        >
          {/* Bar track */}
          {showBars ? (
            <g data-section="chart-line-spark-bar-bars">
              {layout.series.flatMap((s) =>
                s.points.map((p) => {
                  const fill = signedBars
                    ? p.barSign === 'negative'
                      ? s.negativeBarColor
                      : s.positiveBarColor
                    : s.barColor;
                  return (
                    <rect
                      key={`bar-${s.id}-${p.index}`}
                      data-section="chart-line-spark-bar-bar"
                      data-series-id={s.id}
                      data-point-index={p.index}
                      data-bar={p.bar}
                      data-bar-sign={p.barSign}
                      x={p.barX}
                      y={p.barY}
                      width={p.barWidth}
                      height={p.barHeight}
                      fill={fill}
                      fillOpacity={barOpacity}
                      stroke="none"
                    />
                  );
                }),
              )}
            </g>
          ) : null}

          {/* Line track */}
          {showLine ? (
            <g data-section="chart-line-spark-bar-lines">
              {layout.series.map((s) => {
                const isAnyHovered = hoveredKey !== null;
                const isSeriesHovered =
                  isAnyHovered && hoveredKey!.startsWith(`${s.id}::`);
                const dim =
                  isAnyHovered && !isSeriesHovered ? 0.3 : lineOpacity;
                return (
                  <g
                    key={`line-${s.id}`}
                    data-section="chart-line-spark-bar-series-group"
                    data-series-id={s.id}
                    data-series-index={s.index}
                    data-series-line-color={s.lineColor}
                    data-series-bar-color={s.barColor}
                    data-series-point-count={s.points.length}
                    data-series-finite-count={s.finiteCount}
                    data-series-final-value={s.finalValue}
                    data-series-min-value={s.minValue}
                    data-series-max-value={s.maxValue}
                    data-series-total-bar={s.totalBar}
                    data-hovered={isSeriesHovered ? 'true' : 'false'}
                    style={{ color: s.lineColor }}
                  >
                    {s.path ? (
                      <path
                        data-section="chart-line-spark-bar-path"
                        data-series-id={s.id}
                        role="graphics-symbol"
                        tabIndex={0}
                        aria-label={`${s.label}: spark line with ${s.finiteCount} points`}
                        d={s.path}
                        fill="none"
                        stroke={s.lineColor}
                        strokeOpacity={dim}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ) : null}
                    {showMinMaxDots && s.points.length > 0 ? (
                      <>
                        {s.points
                          .filter((p) => p.isMin)
                          .map((p) => (
                            <circle
                              key={`min-${s.id}-${p.index}`}
                              data-section="chart-line-spark-bar-min-dot"
                              data-series-id={s.id}
                              data-point-index={p.index}
                              cx={p.px}
                              cy={p.py}
                              r={dotRadius}
                              fill={minColor}
                              stroke={minColor}
                              strokeWidth={1}
                            />
                          ))}
                        {s.points
                          .filter((p) => p.isMax)
                          .map((p) => (
                            <circle
                              key={`max-${s.id}-${p.index}`}
                              data-section="chart-line-spark-bar-max-dot"
                              data-series-id={s.id}
                              data-point-index={p.index}
                              cx={p.px}
                              cy={p.py}
                              r={dotRadius}
                              fill={maxColor}
                              stroke={maxColor}
                              strokeWidth={1}
                            />
                          ))}
                      </>
                    ) : null}
                    {showLastValueDot && s.points.length > 0 ? (
                      (() => {
                        const last = s.points[s.points.length - 1]!;
                        return (
                          <circle
                            data-section="chart-line-spark-bar-last-dot"
                            data-series-id={s.id}
                            data-point-index={last.index}
                            cx={last.px}
                            cy={last.py}
                            r={dotRadius + 0.5}
                            fill={s.lineColor}
                            stroke={s.lineColor}
                            strokeWidth={1}
                          />
                        );
                      })()
                    ) : null}
                    {/* Invisible hit areas centered on each point. */}
                    {s.points.map((p) => {
                      const key = `${s.id}::${p.index}`;
                      const isHovered = hoveredKey === key;
                      const hitR = Math.max(
                        dotRadius + 4,
                        (p.barWidth || 4) / 2 + 4,
                      );
                      return (
                        <circle
                          key={`hit-${key}`}
                          data-section="chart-line-spark-bar-hit"
                          data-series-id={s.id}
                          data-point-index={p.index}
                          data-hovered={isHovered ? 'true' : 'false'}
                          role="graphics-symbol"
                          tabIndex={0}
                          aria-label={`${s.label}: x=${fmtX(p.x)}, value=${fmtValue(p.value)}, bar=${fmtBar(p.bar)}`}
                          cx={p.px}
                          cy={p.py}
                          r={hitR}
                          fill="transparent"
                          stroke="none"
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
                    })}
                  </g>
                );
              })}
            </g>
          ) : null}
        </svg>

        {/* Last-value pill on the right edge. */}
        {showLastValuePill && layout.series.length > 0
          ? layout.series.map((s, idx) => {
              if (s.points.length === 0) return null;
              const last = s.points[s.points.length - 1]!;
              return (
                <span
                  key={`pill-${s.id}`}
                  data-section="chart-line-spark-bar-pill"
                  data-series-id={s.id}
                  className="pointer-events-none absolute rounded px-1 py-[1px] text-[10px] font-medium tabular-nums"
                  style={{
                    left: Math.min(width - 4, last.px + 4),
                    top: Math.max(
                      0,
                      Math.min(height - 18, last.py - 8 + idx * 18),
                    ),
                    backgroundColor: pillBg,
                    color: pillFg,
                  }}
                >
                  {fmtValue(last.value)}
                </span>
              );
            })
          : null}

        {/* Hover tooltip */}
        {showTooltip && hoveredKey ? (() => {
          const sep = hoveredKey.indexOf('::');
          if (sep < 0) return null;
          const sid = hoveredKey.slice(0, sep);
          const idx = Number(hoveredKey.slice(sep + 2));
          const s = layout.series.find((x) => x.id === sid);
          if (!s) return null;
          const p = s.points.find((x) => x.index === idx);
          if (!p) return null;
          const tx = Math.min(Math.max(p.px + 6, 0), width - 140);
          const ty = Math.max(0, p.py - 40);
          return (
            <div
              data-section="chart-line-spark-bar-tooltip"
              data-series-id={s.id}
              data-point-index={p.index}
              className="pointer-events-none absolute z-10 min-w-[120px] rounded border border-slate-200 bg-white px-2 py-1 text-[11px] shadow"
              style={{ left: tx, top: ty }}
            >
              <div
                data-section="chart-line-spark-bar-tooltip-label"
                className="font-medium"
              >
                {s.label}
              </div>
              <div
                data-section="chart-line-spark-bar-tooltip-x"
                className="text-slate-600"
              >
                x: {fmtX(p.x)}
              </div>
              <div
                data-section="chart-line-spark-bar-tooltip-value"
                className="text-slate-700"
                style={{ fontWeight: 600 }}
              >
                value: {fmtValue(p.value)}
              </div>
              <div
                data-section="chart-line-spark-bar-tooltip-bar"
                className="text-slate-500"
              >
                bar: {fmtBar(p.bar)}
              </div>
            </div>
          );
        })() : null}
      </div>

      {showLegend && layout.series.length > 0 ? (
        <ul
          data-section="chart-line-spark-bar-legend"
          className="mt-1 flex flex-wrap gap-x-2 text-[10px]"
        >
          {series.map((s, i) => {
            const isHidden = hidden.has(s.id);
            return (
              <li
                key={s.id}
                data-section="chart-line-spark-bar-legend-item"
                data-series-id={s.id}
                data-series-index={i}
                data-series-hidden={isHidden ? 'true' : 'false'}
              >
                <button
                  type="button"
                  data-section="chart-line-spark-bar-legend-button"
                  data-series-id={s.id}
                  aria-pressed={!isHidden}
                  onClick={() => toggleSeries(s)}
                  className={[
                    'flex items-center gap-1 rounded px-1',
                    isHidden ? 'opacity-50' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <span
                    data-section="chart-line-spark-bar-legend-swatch"
                    className="inline-block h-2 w-3"
                    style={{
                      backgroundColor:
                        s.lineColor ?? getLineSparkBarDefaultColor(i),
                    }}
                  />
                  <span data-section="chart-line-spark-bar-legend-label">
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

ChartLineSparkBar.displayName = 'ChartLineSparkBar';
